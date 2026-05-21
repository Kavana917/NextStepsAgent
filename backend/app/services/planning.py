from __future__ import annotations

import json
import logging
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from collections.abc import Callable
from typing import TypeVar

ProgressCallback = Callable[[str, str, int], None]

from openai import OpenAI
from pydantic import BaseModel, ValidationError

from app.config import (
    LEAF_ENRICH_BATCH_SIZE,
    MAX_EXECUTION_TASK_MINUTES,
    OPENAI_TIMEOUT_SEC,
    PARALLEL_ENRICH_WORKERS,
    PARALLEL_EXPAND_WORKERS,
    openai_api_key,
    openai_model,
    openai_organization,
)
from app.plan_detail import (
    DetailLevel,
    PlanDetailProfile,
    clamp_brief_to_profile,
    leaf_budget_guidance,
    profile_for,
)
from app.plan_leaf_expand import leaf_can_expand_into_substeps
from app.plan_budget import (
    branch_budget_minutes_from_properties,
    enforce_time_budget_by_phase,
    enforce_time_budget_for_subtree,
    normalize_brief_phase_minutes,
    plan_budget_minutes_from_properties,
)
from app.models.plan import (
    ActionableLeafEnrichmentBatch,
    ChildrenBatch,
    LeafEnrichmentItem,
    PlanBrief,
    PlanProperty,
    PlanStep,
    SkeletonNode,
    StepContextRevision,
    StepDraft,
    StepFields,
    SuggestPropertiesResponse,
    attach_enrichments_to_skeleton,
    collect_ancestor_properties,
    collect_skeleton_leaves,
    find_step_by_id,
    merge_plan_properties,
    replace_step,
    revise_step_in_place,
    rollup_estimated_minutes,
    skeleton_to_plan_steps,
    validate_plan_tree,
)

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


def _report_progress(
    on_progress: ProgressCallback | None,
    phase: str,
    message: str,
    percent: int,
) -> None:
    if on_progress is not None:
        on_progress(phase, message, min(100, max(0, percent)))


def format_properties_block(
    properties: list[PlanProperty],
    *,
    plan_cap: int | None = None,
    branch_cap: int | None = None,
    branch_parent_title: str | None = None,
    single_step_scope: bool = False,
) -> str:
    if not properties and plan_cap is None and branch_cap is None:
        return ""
    lines = [
        "=== PLANNING CONTEXT (mandatory — apply before the situation) ===",
    ]
    for prop in properties:
        lines.append(f"• {prop.name}: {prop.value}")
    if branch_cap is not None:
        title = branch_parent_title or "this step"
        if single_step_scope:
            lines.append(
                f"STEP TIME BUDGET: {branch_cap} minutes for this step only "
                f'("{title}"). estimatedMinutes must reflect this limit.'
            )
        else:
            lines.append(
                f"BRANCH TIME BUDGET: {branch_cap} minutes total for all actionable "
                f'(leaf) tasks under "{title}". Sum of leaf estimatedMinutes under this '
                f"branch must not exceed {branch_cap}."
            )
    elif plan_cap is not None:
        lines.append(
            f"PLAN TIME BUDGET: {plan_cap} minutes for all actionable (leaf) tasks "
            f"in the entire plan combined. Sum of all leaf estimatedMinutes must "
            f"not exceed {plan_cap}."
        )
    lines.append(
        "Every step must reflect these fields. If the situation asks for more work "
        "than the context allows, reduce scope to fit the context."
    )
    return "\n".join(lines)


def _leaf_time_prompt_rules(
    *,
    branch_cap: int | None = None,
    plan_cap: int | None = None,
) -> str:
    rules = [
        f"- estimatedMinutes: realistic one-sitting minutes per task (vary by "
        f"complexity; each ≤ {MAX_EXECUTION_TASK_MINUTES}).",
        "- Do not assign the same minute value to every task unless effort is truly equal.",
        "- Parent/branch nodes do not have time pools; only leaves carry real estimates.",
    ]
    if branch_cap is not None:
        rules.append(
            f"- Sum of estimatedMinutes for these leaves must not exceed {branch_cap}."
        )
    elif plan_cap is not None:
        rules.append(
            f"- These leaves are part of a plan capped at {plan_cap} minutes total "
            "across all actionable tasks."
        )
    return "\n".join(rules)


def _system_content(
    role_intro: str,
    phase_rules: str,
    json_shape: str,
    *,
    with_properties: bool = False,
) -> str:
    props_rules = ""
    if with_properties:
        props_rules = (
            "\n\nPlanning context enforcement:\n"
            "- Read every planning context field first.\n"
            "- Shrink scope to satisfy constraints and time budgets."
        )
    return f"{role_intro}\n\n{phase_rules}{props_rules}\n\n{json_shape}"


def _user_plan_content(situation: str, context_tail: str, *parts: str) -> str:
    ordered = [context_tail, f"Situation:\n{situation}", *parts]
    return "\n\n".join(p for p in ordered if p)


@dataclass
class GeneratePlanResult:
    ok: bool
    steps: list[PlanStep] | None = None
    error: str | None = None


def _openai_client() -> tuple[OpenAI, str] | None:
    api_key = openai_api_key()
    if not api_key:
        return None
    return (
        OpenAI(
            api_key=api_key,
            organization=openai_organization(),
            timeout=OPENAI_TIMEOUT_SEC,
        ),
        openai_model(),
    )


def _call_structured(
    client: OpenAI,
    model: str,
    response_model: type[T],
    schema_name: str,
    messages: list[dict[str, str]],
) -> T:
    max_attempts = 3
    use_structured = True
    last_error = ""
    msgs = list(messages)

    for _attempt in range(max_attempts):
        if use_structured:
            try:
                completion = client.chat.completions.parse(
                    model=model,
                    temperature=0.2 if _attempt == 0 else 0.08,
                    messages=msgs,
                    response_format=response_model,
                )
                parsed = completion.choices[0].message.parsed
                if parsed is not None:
                    return parsed
                last_error = "Structured parse returned empty."
            except Exception as e:
                last_error = str(e)
                use_structured = False
        else:
            try:
                completion = client.chat.completions.create(
                    model=model,
                    temperature=0.12,
                    response_format={"type": "json_object"},
                    messages=msgs,
                )
                content = completion.choices[0].message.content
                if not content:
                    last_error = "Empty model response."
                else:
                    return response_model.model_validate(json.loads(content))
            except (json.JSONDecodeError, ValidationError) as e:
                last_error = str(e)
            except Exception as e:
                last_error = str(e)

        msgs.append(
            {
                "role": "user",
                "content": (
                    f"Invalid output ({last_error}). Reply with ONLY valid JSON "
                    f"matching the required shape."
                ),
            }
        )

    raise RuntimeError(
        f"{schema_name} failed after {max_attempts} attempts: {last_error}"
    )


def _fetch_plan_brief(
    client: OpenAI,
    model: str,
    situation: str,
    context_tail: str,
    *,
    has_props: bool,
    time_cap: int | None,
    profile: PlanDetailProfile,
) -> PlanBrief:
    cap_line = (
        f"Total leaf-task minutes across the plan must not exceed {time_cap}."
        if time_cap
        else "No fixed total time cap; still give realistic allocatedMinutes per phase."
    )
    brief = _call_structured(
        client,
        model,
        PlanBrief,
        "plan_brief",
        [
            {
                "role": "system",
                "content": _system_content(
                    "You produce a structured plan brief before detailed decomposition.",
                    f"""Brief rules (detail level: {profile.level}):
- Top-level phases: {profile.phases_guidance}
- maxDepth: REQUIRED at least {profile.target_depth} for this detail level (allowed range {profile.depth_min}–{profile.depth_max}).
  Higher maxDepth means more nested branch levels before actionable leaves (sub-steps under sub-steps).
  Low={profile_for("low").target_depth}, medium={profile_for("medium").target_depth}, high={profile_for("high").target_depth} are the tier defaults—use {profile.target_depth} unless the situation clearly needs the top of the range.
- suggestedTotalLeaves: {profile.leaves_guidance} Target at least {profile.min_leaves_target} actionable leaves when the situation warrants it (more is fine).
- Each phase: title, description, priority, allocatedMinutes (rough scale hint only—not a hard cap on child tasks), targetChildCount (guidance: {profile.children_guidance}).
- {cap_line}
- Sum of allocatedMinutes should match the user's total time budget when provided.""",
                    'Return JSON matching PlanBrief schema.',
                    with_properties=has_props,
                ),
            },
            {
                "role": "user",
                "content": _user_plan_content(
                    situation,
                    context_tail,
                    "Produce the plan brief.",
                ),
            },
        ],
    )
    normalize_brief_phase_minutes(brief.phases, time_cap)
    clamp_brief_to_profile(brief, profile)
    logger.info(
        "plan brief: maxDepth=%d (detail=%s, target=%d)",
        brief.max_depth,
        profile.level,
        profile.target_depth,
    )
    return brief


def _phase_to_skeleton(phase, path: str) -> SkeletonNode:
    return SkeletonNode(
        leaf_id=str(uuid.uuid4()),
        title=phase.title,
        description=phase.description,
        priority=phase.priority,
        estimated_minutes=0,
        is_actionable=False,
        path=path,
    )


def _expand_children_for_parent(
    client: OpenAI,
    model: str,
    situation: str,
    context_tail: str,
    parent: SkeletonNode,
    *,
    has_props: bool,
    max_depth: int,
    current_depth: int,
    force_leaves: bool,
    profile: PlanDetailProfile,
    leaf_target: int,
    phase_count: int,
    branch_time_cap: int | None = None,
) -> list[StepDraft]:
    budget_line = leaf_budget_guidance(
        leaf_target,
        max_depth=max_depth,
        phase_count=phase_count,
        current_depth=current_depth,
        force_leaves=force_leaves,
    )
    if force_leaves or current_depth >= max_depth - 1:
        batch = _call_structured(
            client,
            model,
            ChildrenBatch,
            "children_batch_leaves",
            [
                {
                    "role": "system",
                    "content": _system_content(
                        "You output ONLY final actionable tasks (leaves).",
                        f"""Rules:
- Each child must have isActionable true.
- Imperative titles (Draft, Send, Schedule, …).
- {_leaf_time_prompt_rules(branch_cap=branch_time_cap)}
- {budget_line}
- {profile.children_guidance}
- Short description: what to do and expected output (1–2 sentences).""",
                        'Return {{ "children": [ ... ] }}',
                        with_properties=has_props,
                    ),
                },
                {
                    "role": "user",
                    "content": _user_plan_content(
                        situation,
                        context_tail,
                        f'Parent: "{parent.title}"',
                        parent.description,
                        f"Path: {parent.path}",
                    ),
                },
            ],
        )
        return batch.children

    batch = _call_structured(
        client,
        model,
        ChildrenBatch,
        "children_batch",
        [
            {
                "role": "system",
                "content": _system_content(
                    "You decompose one plan step into child steps.",
                    f"""Rules:
- isActionable false for phases/milestones; true only for one-sitting tasks at the deepest level.
- For non-actionable children, estimatedMinutes are placeholders (parents are summed from children later).
- For actionable children, use realistic per-task minutes (each ≤ {MAX_EXECUTION_TASK_MINUTES}).
- {budget_line}
- {profile.children_guidance}
- {max_depth - current_depth - 1} branch level(s) remain before leaves—keep isActionable false on children unless they are final actions.
- Prefer meaningful milestones, not vague labels.""",
                    'Return {{ "children": [ ... ] }}',
                    with_properties=has_props,
                ),
            },
            {
                "role": "user",
                "content": _user_plan_content(
                    situation,
                    context_tail,
                    f'Parent: "{parent.title}"',
                    parent.description,
                    f"Depth {current_depth + 1} of {max_depth}. Path: {parent.path}",
                ),
            },
        ],
    )
    return batch.children


def _drafts_to_skeleton_children(
    drafts: list[StepDraft],
    parent_path: str,
) -> list[SkeletonNode]:
    nodes: list[SkeletonNode] = []
    for i, d in enumerate(drafts):
        path = f"{parent_path}/{i + 1}"
        nodes.append(
            SkeletonNode(
                leaf_id=str(uuid.uuid4()),
                title=d.title,
                description=d.description,
                priority=d.priority,
                estimated_minutes=d.estimated_minutes,
                is_actionable=d.is_actionable,
                path=path,
            )
        )
    return nodes


def _expand_skeleton_parallel(
    client: OpenAI,
    model: str,
    situation: str,
    context_tail: str,
    roots: list[SkeletonNode],
    *,
    has_props: bool,
    max_depth: int,
    profile: PlanDetailProfile,
    leaf_target: int,
    branch_time_cap: int | None = None,
    on_progress: ProgressCallback | None = None,
) -> None:
    """Breadth-first parallel expansion in-place on skeleton tree."""

    current_depth = 0
    frontier = [n for n in roots if not n.is_actionable]
    phase_count = max(1, len(roots))
    branch_levels = max(1, max_depth - 1)

    while frontier and current_depth < max_depth - 1:
        force_leaves = current_depth >= max_depth - 2
        parents = frontier
        frontier = []
        level_pct = 15 + int(45 * (current_depth + 1) / branch_levels)
        _report_progress(
            on_progress,
            "expand",
            f"Building plan structure (level {current_depth + 1} of {branch_levels})…",
            level_pct,
        )

        def job(parent: SkeletonNode) -> tuple[SkeletonNode, list[SkeletonNode]]:
            drafts = _expand_children_for_parent(
                client,
                model,
                situation,
                context_tail,
                parent,
                has_props=has_props,
                max_depth=max_depth,
                current_depth=current_depth,
                force_leaves=force_leaves,
                profile=profile,
                leaf_target=leaf_target,
                phase_count=phase_count,
                branch_time_cap=branch_time_cap,
            )
            kids = _drafts_to_skeleton_children(drafts, parent.path)
            if force_leaves:
                for k in kids:
                    k.is_actionable = True
            return parent, kids

        workers = min(PARALLEL_EXPAND_WORKERS, len(parents)) or 1
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(job, p) for p in parents]
            for fut in as_completed(futures):
                parent, kids = fut.result()
                parent.children = kids
                for k in kids:
                    if not k.is_actionable and current_depth + 1 < max_depth - 1:
                        frontier.append(k)

        current_depth += 1

    # Force any remaining non-actionable without children into leaves
    def finalize(node: SkeletonNode, depth: int) -> None:
        if node.children:
            for c in node.children:
                finalize(c, depth + 1)
        elif not node.is_actionable:
            node.is_actionable = True

    for r in roots:
        finalize(r, 0)


def _enrich_leaf_chunk(
    client: OpenAI,
    model: str,
    situation: str,
    context_tail: str,
    chunk: list[SkeletonNode],
    *,
    has_props: bool,
    branch_cap: int | None,
    plan_cap: int | None,
) -> list[LeafEnrichmentItem]:
    lines = [
        f'- leafId: "{n.leaf_id}" | path: {n.path} | title: "{n.title}" | '
        f"stub: {n.description[:200]}"
        for n in chunk
    ]
    batch = _call_structured(
        client,
        model,
        ActionableLeafEnrichmentBatch,
        "leaf_enrichment",
        [
            {
                "role": "system",
                "content": _system_content(
                    "You enrich actionable plan tasks with implementation detail.",
                    f"""For each leafId provided, output:
- description: concise what/why (1–2 sentences)
- implementationGuide: numbered how-to (3–8 steps: actions, tools, tips, pitfalls)
- acceptanceCriteria: "Done when: …" verifiable condition(s)
{_leaf_time_prompt_rules(branch_cap=branch_cap, plan_cap=plan_cap)}
Use the exact leafId from the input.""",
                    "Return JSON { leaves: [...] } with one entry per input leaf.",
                    with_properties=has_props,
                ),
            },
            {
                "role": "user",
                "content": _user_plan_content(
                    situation,
                    context_tail,
                    "Enrich these actionable tasks:",
                    *lines,
                ),
            },
        ],
    )
    return batch.leaves


def _enrich_leaves_batch(
    client: OpenAI,
    model: str,
    situation: str,
    context_tail: str,
    leaves: list[SkeletonNode],
    *,
    has_props: bool,
    branch_cap: int | None = None,
    plan_cap: int | None = None,
    on_progress: ProgressCallback | None = None,
) -> dict[str, LeafEnrichmentItem]:
    enrichments: dict[str, LeafEnrichmentItem] = {}
    batch_size = LEAF_ENRICH_BATCH_SIZE
    total = len(leaves)
    if total == 0:
        return enrichments

    chunks: list[list[SkeletonNode]] = [
        leaves[start : start + batch_size]
        for start in range(0, total, batch_size)
    ]
    done_count = 0
    progress_lock = threading.Lock()

    def job(chunk: list[SkeletonNode]) -> list[LeafEnrichmentItem]:
        return _enrich_leaf_chunk(
            client,
            model,
            situation,
            context_tail,
            chunk,
            has_props=has_props,
            branch_cap=branch_cap,
            plan_cap=plan_cap,
        )

    workers = min(PARALLEL_ENRICH_WORKERS, len(chunks)) or 1
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(job, chunk) for chunk in chunks]
        for fut in as_completed(futures):
            items = fut.result()
            for item in items:
                enrichments[item.leaf_id] = item
            with progress_lock:
                done_count += len(items)
                enrich_pct = 60 + int(32 * done_count / total)
                _report_progress(
                    on_progress,
                    "enrich",
                    f"Adding how-to detail to tasks ({min(done_count, total)} of {total})…",
                    enrich_pct,
                )

    return enrichments


def _build_plan_tree(
    client: OpenAI,
    model: str,
    situation: str,
    context_tail: str,
    *,
    has_props: bool,
    time_cap: int | None,
    detail_level: DetailLevel,
    on_progress: ProgressCallback | None = None,
) -> list[PlanStep]:
    profile = profile_for(detail_level)
    _report_progress(on_progress, "brief", "Analyzing situation and plan brief…", 8)
    logger.info("plan generation: brief (detail=%s)", profile.level)
    brief = _fetch_plan_brief(
        client,
        model,
        situation,
        context_tail,
        has_props=has_props,
        time_cap=time_cap,
        profile=profile,
    )
    max_depth = brief.max_depth
    _report_progress(on_progress, "brief", "Plan brief ready", 15)

    roots = [
        _phase_to_skeleton(p, f"/{i + 1}")
        for i, p in enumerate(brief.phases)
    ]
    leaf_target = max(profile.min_leaves_target, brief.suggested_total_leaves)

    logger.info(
        "plan generation: expand skeleton (parallel, leaf_target=%d)",
        leaf_target,
    )
    _expand_skeleton_parallel(
        client,
        model,
        situation,
        context_tail,
        roots,
        has_props=has_props,
        max_depth=max_depth,
        profile=profile,
        leaf_target=leaf_target,
        on_progress=on_progress,
    )
    leaves = collect_skeleton_leaves(roots)
    _report_progress(
        on_progress,
        "expand",
        f"Structure complete — {len(leaves)} actionable tasks",
        60,
    )

    logger.info("plan generation: enrich %d leaves", len(leaves))
    if leaves:
        enrichments = _enrich_leaves_batch(
            client,
            model,
            situation,
            context_tail,
            leaves,
            has_props=has_props,
            plan_cap=time_cap,
            on_progress=on_progress,
        )
        attach_enrichments_to_skeleton(roots, enrichments)
    else:
        _report_progress(on_progress, "enrich", "No leaf tasks to enrich", 92)

    _report_progress(on_progress, "finalize", "Finalizing plan…", 94)
    steps = skeleton_to_plan_steps(roots)
    steps = rollup_estimated_minutes(steps)

    errors = validate_plan_tree(steps)
    if errors:
        logger.warning("plan validation warnings: %s", errors[:5])

    if time_cap is not None:
        steps = enforce_time_budget_by_phase(steps, time_cap)

    _report_progress(on_progress, "done", "Plan ready", 100)
    return steps


def generate_plan_from_situation(
    situation: str,
    locale: str | None = None,
    properties: list[PlanProperty] | None = None,
    detail_level: DetailLevel | str = "medium",
    on_progress: ProgressCallback | None = None,
) -> GeneratePlanResult:
    opened = _openai_client()
    if opened is None:
        return GeneratePlanResult(ok=False, error="Server missing OPENAI_API_KEY.")
    client, model = opened

    situation = situation.strip()
    locale_line = f"Preferred locale / language: {locale}" if locale else ""
    props = properties or []
    has_props = len(props) > 0
    time_cap = plan_budget_minutes_from_properties(props)
    properties_block = format_properties_block(props, plan_cap=time_cap)
    context_tail = "\n\n".join(
        part for part in (locale_line, properties_block) if part
    )

    try:
        _report_progress(on_progress, "start", "Starting plan generation…", 2)
        steps = _build_plan_tree(
            client,
            model,
            situation,
            context_tail,
            has_props=has_props,
            time_cap=time_cap,
            detail_level=profile_for(detail_level).level,
            on_progress=on_progress,
        )
        return GeneratePlanResult(ok=True, steps=steps)
    except Exception as e:
        return GeneratePlanResult(
            ok=False,
            error=f"Plan generation failed: {e}",
        )


def suggest_properties_for_situation(
    situation: str,
    *,
    parent_title: str | None = None,
    parent_description: str | None = None,
) -> SuggestPropertiesResponse | str:
    opened = _openai_client()
    if opened is None:
        return "Server missing OPENAI_API_KEY."
    client, model = opened

    situation = situation.strip()
    scope = (
        f'Step context: "{parent_title}" — {parent_description}'
        if parent_title
        else "Root situation planning"
    )

    try:
        return _call_structured(
            client,
            model,
            SuggestPropertiesResponse,
            "suggest_properties",
            [
                {
                    "role": "system",
                    "content": (
                        "Suggest 3–6 planning context fields that would help an LLM "
                        "build a better plan. Each needs name and a short example value."
                    ),
                },
                {
                    "role": "user",
                    "content": f"{scope}\n\nSituation:\n{situation}",
                },
            ],
        )
    except Exception as e:
        return f"Suggestion failed: {e}"


def apply_step_context(
    situation: str,
    steps: list[PlanStep],
    step_id: str,
    step_properties: list[PlanProperty],
    root_properties: list[PlanProperty],
    locale: str | None = None,
) -> GeneratePlanResult:
    """Revise the selected step in place from + context; never add or replace children."""
    opened = _openai_client()
    if opened is None:
        return GeneratePlanResult(ok=False, error="Server missing OPENAI_API_KEY.")
    client, model = opened

    target = find_step_by_id(steps, step_id)
    if target is None:
        return GeneratePlanResult(ok=False, error="Step not found.")

    merged = merge_plan_properties(
        collect_ancestor_properties(steps, step_id, root_properties),
        step_properties,
    )

    situation = situation.strip()
    locale_line = f"Preferred locale / language: {locale}" if locale else ""
    branch_cap = branch_budget_minutes_from_properties(step_properties)
    properties_block = format_properties_block(
        merged,
        branch_cap=branch_cap,
        branch_parent_title=target.title,
        single_step_scope=True,
    )
    context_tail = "\n\n".join(
        part for part in (locale_line, properties_block) if part
    )
    has_props = len(merged) > 0
    has_children = bool(target.children)
    is_leaf = not has_children
    child_count = len(target.children or [])

    scope_line = (
        "This is an actionable leaf (no sub-steps). Revise the whole task in place."
        if is_leaf
        else (
            f"This step has {child_count} existing child step(s). "
            "Revise ONLY this step's title and description to reflect the context. "
            "Do NOT create, remove, or change sub-steps. "
            "Set implementationGuide and acceptanceCriteria to null."
        )
    )
    time_line = ""
    if is_leaf and branch_cap is not None:
        time_line = (
            f"estimatedMinutes for this task must be at most {branch_cap} "
            f"(realistic one-sitting work)."
        )
    elif is_leaf:
        time_line = (
            f"estimatedMinutes: realistic one-sitting minutes, each ≤ "
            f"{MAX_EXECUTION_TASK_MINUTES}."
        )

    current = (
        f"Current step:\n"
        f"- title: {target.title}\n"
        f"- description: {target.description}\n"
        f"- priority: {target.priority}\n"
        f"- estimatedMinutes: {target.estimated_minutes}\n"
        f"- isActionable: {target.is_actionable}\n"
    )
    if is_leaf and target.implementation_guide:
        current += f"- implementationGuide: {target.implementation_guide[:500]}\n"

    try:
        revision = _call_structured(
            client,
            model,
            StepContextRevision,
            "step_context_revision",
            [
                {
                    "role": "system",
                    "content": _system_content(
                        "You revise ONE existing plan step to satisfy planning context.",
                        f"""Rules:
- Output a single revised step only—never a list of children or subtasks.
- {scope_line}
- {time_line}
- Apply every planning context field to this step's title and description.
- If actionable leaf: implementationGuide (numbered how-to, ≥20 chars) and acceptanceCriteria ("Done when: …") required.""",
                        "Return JSON matching StepContextRevision.",
                        with_properties=has_props,
                    ),
                },
                {
                    "role": "user",
                    "content": _user_plan_content(
                        situation,
                        context_tail,
                        current,
                        "Revise this step in place.",
                    ),
                },
            ],
        )

        if is_leaf:
            minutes = revision.estimated_minutes
            if branch_cap is not None:
                minutes = min(minutes, branch_cap)
            minutes = max(1, min(minutes, MAX_EXECUTION_TASK_MINUTES))
            guide = revision.implementation_guide or target.implementation_guide
            criteria = revision.acceptance_criteria or target.acceptance_criteria
            if not guide or len(guide.strip()) < 20:
                return GeneratePlanResult(
                    ok=False,
                    error="Model did not return a valid implementation guide for this task.",
                )
            if not criteria or len(criteria.strip()) < 5:
                return GeneratePlanResult(
                    ok=False,
                    error="Model did not return valid acceptance criteria for this task.",
                )
            revision = revision.model_copy(
                update={
                    "estimated_minutes": minutes,
                    "implementation_guide": guide.strip(),
                    "acceptance_criteria": criteria.strip(),
                },
            )
        else:
            revision = revision.model_copy(
                update={
                    "implementation_guide": None,
                    "acceptance_criteria": None,
                },
            )

        updated = revise_step_in_place(
            steps,
            step_id,
            revision,
            properties=step_properties,
            is_leaf=is_leaf,
        )
        updated = rollup_estimated_minutes(updated)

        return GeneratePlanResult(ok=True, steps=updated)

    except Exception as e:
        return GeneratePlanResult(
            ok=False,
            error=f"Step update failed: {e}",
        )


def expand_leaf_into_substeps(
    situation: str,
    steps: list[PlanStep],
    step_id: str,
    root_properties: list[PlanProperty],
    locale: str | None = None,
    detail_level: DetailLevel | str = "medium",
) -> GeneratePlanResult:
    """Turn one actionable leaf into a branch with enriched actionable children."""
    opened = _openai_client()
    if opened is None:
        return GeneratePlanResult(ok=False, error="Server missing OPENAI_API_KEY.")
    client, model = opened

    target = find_step_by_id(steps, step_id)
    if target is None:
        return GeneratePlanResult(ok=False, error="Step not found.")

    if target.children:
        return GeneratePlanResult(
            ok=False,
            error="This step already has sub-steps.",
        )

    if not leaf_can_expand_into_substeps(target):
        return GeneratePlanResult(
            ok=False,
            error=(
                "This task is too small or atomic to split further. "
                "Edit it in the inspector instead."
            ),
        )

    merged = merge_plan_properties(
        collect_ancestor_properties(steps, step_id, root_properties),
        target.properties,
    )
    situation = situation.strip()
    locale_line = f"Preferred locale / language: {locale}" if locale else ""
    plan_cap = plan_budget_minutes_from_properties(root_properties)
    properties_block = format_properties_block(merged, plan_cap=plan_cap)
    context_tail = "\n\n".join(
        part for part in (locale_line, properties_block) if part
    )
    has_props = len(merged) > 0
    profile = profile_for(detail_level)
    leaf_target = max(profile.min_leaves_target, 4)

    parent = SkeletonNode(
        leaf_id=target.id,
        title=target.title,
        description=target.description,
        priority=target.priority,
        estimated_minutes=target.estimated_minutes,
        is_actionable=False,
        path="/expand",
    )

    try:
        drafts = _expand_children_for_parent(
            client,
            model,
            situation,
            context_tail,
            parent,
            has_props=has_props,
            max_depth=2,
            current_depth=0,
            force_leaves=True,
            profile=profile,
            leaf_target=leaf_target,
            phase_count=1,
            branch_time_cap=target.estimated_minutes,
        )
        if len(drafts) < 2:
            return GeneratePlanResult(
                ok=False,
                error=(
                    "This task could not be split into multiple sub-steps. "
                    "It may already be a single sitting of work."
                ),
            )

        for d in drafts:
            d.is_actionable = True
        kids = _drafts_to_skeleton_children(drafts, parent.path)
        for k in kids:
            k.is_actionable = True
        parent.children = kids

        leaves = collect_skeleton_leaves([parent])
        if leaves:
            enrichments = _enrich_leaves_batch(
                client,
                model,
                situation,
                context_tail,
                leaves,
                has_props=has_props,
                branch_cap=target.estimated_minutes,
            )
            attach_enrichments_to_skeleton([parent], enrichments)

        new_children = skeleton_to_plan_steps(parent.children)
        new_children = enforce_time_budget_for_subtree(
            new_children,
            target.estimated_minutes,
        )

        branch = PlanStep(
            id=target.id,
            title=target.title,
            description=target.description,
            priority=target.priority,
            estimated_minutes=target.estimated_minutes,
            properties=target.properties,
            isActionable=False,
            implementationGuide=None,
            acceptanceCriteria=None,
            children=new_children,
        )

        updated = replace_step(steps, step_id, branch)
        if updated is None:
            return GeneratePlanResult(ok=False, error="Step not found.")
        updated = rollup_estimated_minutes(updated)

        return GeneratePlanResult(ok=True, steps=updated)

    except Exception as e:
        return GeneratePlanResult(
            ok=False,
            error=f"Sub-step generation failed: {e}",
        )


def regenerate_subtree(
    situation: str,
    steps: list[PlanStep],
    step_id: str,
    step_properties: list[PlanProperty],
    root_properties: list[PlanProperty],
    locale: str | None = None,
    detail_level: DetailLevel | str = "medium",
) -> GeneratePlanResult:
    """Backward-compatible alias: applies context to the step itself, not its children."""
    del detail_level
    return apply_step_context(
        situation,
        steps,
        step_id,
        step_properties,
        root_properties,
        locale=locale,
    )
