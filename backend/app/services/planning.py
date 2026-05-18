from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any, TypeVar

from openai import OpenAI
from pydantic import BaseModel, ValidationError

from app.config import (
    OPENAI_TIMEOUT_SEC,
    STEPS_PER_BRANCH,
    openai_api_key,
    openai_model,
    openai_organization,
)
from app.models.plan import (
    ExecutionBatch,
    LeafStep,
    LlmPlan,
    Level1Step,
    Level2Step,
    PlanStep,
    StepFields,
    SubstepsForParent,
    TopLevelOnly,
    assign_plan_ids,
)

N = str(STEPS_PER_BRANCH)

SHARED_FIELDS = (
    'Each step object: "title", "description" (1–2 sentences), '
    '"priority" ("low"|"medium"|"high"|"critical"), '
    '"estimatedMinutes" (positive integer).'
)

T = TypeVar("T", bound=BaseModel)


@dataclass
class GeneratePlanResult:
    ok: bool
    steps: list[PlanStep] | None = None
    error: str | None = None


def _map_pool(items: list[Any], limit: int, fn) -> list[Any]:
    results: list[Any] = [None] * len(items)
    workers = min(limit, len(items)) or 1
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(fn, item, i): i for i, item in enumerate(items)}
        for future in as_completed(futures):
            idx = futures[future]
            results[idx] = future.result()
    return results


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

    for attempt in range(max_attempts):
        if use_structured:
            try:
                completion = client.chat.completions.parse(
                    model=model,
                    temperature=0.2 if attempt == 0 else 0.08,
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
                    try:
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
                    f"matching the required shape and exact counts ({N} items per array)."
                ),
            }
        )

    raise RuntimeError(
        f"{schema_name} failed after {max_attempts} attempts: {last_error}"
    )


def generate_plan_from_situation(
    situation: str,
    locale: str | None = None,
) -> GeneratePlanResult:
    api_key = openai_api_key()
    if not api_key:
        return GeneratePlanResult(ok=False, error="Server missing OPENAI_API_KEY.")

    model = openai_model()
    org = openai_organization()
    client = OpenAI(
        api_key=api_key,
        organization=org,
        timeout=OPENAI_TIMEOUT_SEC,
    )

    situation = situation.strip()
    locale_line = f"Preferred locale / language: {locale}" if locale else ""

    try:
        tops = _call_structured(
            client,
            model,
            TopLevelOnly,
            "top_level_steps",
            [
                {
                    "role": "system",
                    "content": (
                        f"You plan major priorities. {SHARED_FIELDS} "
                        f"Return JSON with exactly {N} top-level steps "
                        "(broad phases only — no substeps yet)."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Situation:\n{situation}\n\n{locale_line}\n\n"
                        f'Return {{ "steps": [ exactly {N} objects ] }}.'
                    ),
                },
            ],
        )

        def substep_job(parent: StepFields, index: int) -> list[StepFields]:
            batch = _call_structured(
                client,
                model,
                SubstepsForParent,
                "substeps_for_parent",
                [
                    {
                        "role": "system",
                        "content": (
                            f"You break one major priority into exactly {N} substeps. "
                            f"{SHARED_FIELDS} Return JSON {{ \"children\": [ exactly {N} objects ] }} "
                            "— no deeper nesting."
                        ),
                    },
                    {
                        "role": "user",
                        "content": "\n\n".join(
                            p
                            for p in [
                                f"Situation:\n{situation}",
                                locale_line,
                                f'Top-level priority {index + 1} of {N}: "{parent.title}"',
                                parent.description,
                                f"Return exactly {N} substeps that complete this priority.",
                            ]
                            if p
                        ),
                    },
                ],
            )
            return batch.children

        substeps_by_top: list[list[StepFields]] = _map_pool(
            tops.steps,
            STEPS_PER_BRANCH,
            substep_job,
        )

        def execution_job(
            parent: StepFields, top_index: int
        ) -> list[list[StepFields]]:
            substeps = substeps_by_top[top_index]
            substep_lines = [
                f"{j + 1}. {s.title} — {s.description}" for j, s in enumerate(substeps)
            ]
            batch = _call_structured(
                client,
                model,
                ExecutionBatch,
                "execution_batch",
                [
                    {
                        "role": "system",
                        "content": (
                            f"For each substep, add exactly {N} execution tasks "
                            f"(immediate actions). {SHARED_FIELDS} Return {{ \"substeps\": "
                            f"[ exactly {N} objects, each with \"children\": "
                            f"[ exactly {N} execution tasks ] ] }}. "
                            'Execution tasks must NOT have "children".'
                        ),
                    },
                    {
                        "role": "user",
                        "content": "\n\n".join(
                            p
                            for p in [
                                f"Situation:\n{situation}",
                                locale_line,
                                f'Top-level priority {top_index + 1}: "{parent.title}"',
                                "Substeps to expand (in order):",
                                *substep_lines,
                                (
                                    f'For each substep, output exactly {N} execution tasks '
                                    'in the matching "substeps[i].children" entry.'
                                ),
                            ]
                            if p
                        ),
                    },
                ],
            )
            return [s.children for s in batch.substeps]

        execution_by_top: list[list[list[StepFields]]] = _map_pool(
            tops.steps,
            STEPS_PER_BRANCH,
            execution_job,
        )

        steps_out: list[Level1Step] = []
        for i, top in enumerate(tops.steps):
            level2_children: list[Level2Step] = []
            for j, sub in enumerate(substeps_by_top[i]):
                leaves = [
                    LeafStep.model_validate(leaf.model_dump(by_alias=True))
                    for leaf in execution_by_top[i][j]
                ]
                level2_children.append(
                    Level2Step(
                        title=sub.title,
                        description=sub.description,
                        priority=sub.priority,
                        estimatedMinutes=sub.estimated_minutes,
                        children=leaves,
                    )
                )
            steps_out.append(
                Level1Step(
                    title=top.title,
                    description=top.description,
                    priority=top.priority,
                    estimatedMinutes=top.estimated_minutes,
                    children=level2_children,
                )
            )

        plan = LlmPlan(steps=steps_out)
        return GeneratePlanResult(ok=True, steps=assign_plan_ids(plan))

    except Exception as e:
        return GeneratePlanResult(
            ok=False,
            error=f"Plan generation failed: {e}",
        )
