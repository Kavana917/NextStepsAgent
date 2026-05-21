from __future__ import annotations

import re

from app.models.plan import PlanProperty, PlanStep, is_leaf_step, rollup_estimated_minutes

_TIME_PATTERNS: list[tuple[re.Pattern[str], float]] = [
    (re.compile(r"(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b", re.I), 60.0),
    (re.compile(r"(\d+(?:\.\d+)?)\s*(?:d|day|days)\b", re.I), 8.0 * 60.0),
    (re.compile(r"(\d+(?:\.\d+)?)\s*(?:w|wk|week|weeks)\b", re.I), 40.0 * 60.0),
    (re.compile(r"(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b", re.I), 1.0),
]


def parse_time_budget_minutes(text: str) -> int | None:
    if not text.strip():
        return None
    best: int | None = None
    for pattern, minutes_per_unit in _TIME_PATTERNS:
        match = pattern.search(text)
        if match:
            minutes = int(float(match.group(1)) * minutes_per_unit)
            if minutes > 0:
                best = minutes if best is None else min(best, minutes)
    return best


def _deadline_like_property(prop: PlanProperty) -> bool:
    return prop.template_id == "deadline" or (
        "complete within" in prop.name.casefold()
        or "deadline" in prop.name.casefold()
        or "time budget" in prop.name.casefold()
        or "total time" in prop.name.casefold()
    )


def _branch_time_property(prop: PlanProperty) -> bool:
    if prop.template_id == "subtree_budget":
        return True
    name = prop.name.casefold()
    if any(
        token in name
        for token in (
            "subtree",
            "subtasks",
            "sub-tasks",
            "branch time",
            "this branch",
            "under this step",
        )
    ):
        return True
    return _deadline_like_property(prop)


def plan_budget_minutes_from_properties(
    properties: list[PlanProperty],
) -> int | None:
    """Plan-wide cap from root planning context (deadline-like fields)."""
    caps: list[int] = []
    for prop in properties:
        if not _deadline_like_property(prop):
            continue
        cap = parse_time_budget_minutes(prop.value)
        if cap is not None:
            caps.append(cap)
    return min(caps) if caps else None


def branch_budget_minutes_from_properties(
    properties: list[PlanProperty],
) -> int | None:
    """Branch cap from step context (subtree budget or deadline-like fields on the step)."""
    caps: list[int] = []
    for prop in properties:
        if not _branch_time_property(prop):
            continue
        cap = parse_time_budget_minutes(prop.value)
        if cap is not None:
            caps.append(cap)
    return min(caps) if caps else None


def total_budget_minutes_from_properties(
    properties: list[PlanProperty],
) -> int | None:
    """Alias for plan-wide budget (backward compatible)."""
    return plan_budget_minutes_from_properties(properties)


def _collect_leaves(steps: list[PlanStep], out: list[PlanStep]) -> None:
    for step in steps:
        if step.children:
            _collect_leaves(step.children, out)
        else:
            out.append(step)


def total_leaf_minutes(steps: list[PlanStep]) -> int:
    leaves: list[PlanStep] = []
    _collect_leaves(steps, leaves)
    return sum(s.estimated_minutes for s in leaves)


def _scale_leaves_in_subtree(step: PlanStep, factor: float) -> None:
    if is_leaf_step(step):
        step.estimated_minutes = max(1, int(step.estimated_minutes * factor))
        return
    if step.children:
        for child in step.children:
            _scale_leaves_in_subtree(child, factor)


def enforce_time_budget(steps: list[PlanStep], cap_minutes: int) -> list[PlanStep]:
    """Scale leaf estimates so total fits cap (global proportional)."""
    if cap_minutes <= 0:
        return steps
    leaves: list[PlanStep] = []
    _collect_leaves(steps, leaves)
    total = sum(s.estimated_minutes for s in leaves)
    if total <= 0 or total <= cap_minutes:
        return rollup_estimated_minutes(steps)
    factor = cap_minutes / total
    for leaf in leaves:
        leaf.estimated_minutes = max(1, int(leaf.estimated_minutes * factor))
    return rollup_estimated_minutes(steps)


def enforce_time_budget_for_subtree(
    subtree_steps: list[PlanStep],
    cap_minutes: int,
) -> list[PlanStep]:
    """Scale leaves only within these steps (e.g. regenerated children under one parent)."""
    if cap_minutes <= 0 or not subtree_steps:
        return rollup_estimated_minutes(subtree_steps)
    total = total_leaf_minutes(subtree_steps)
    if total <= 0 or total <= cap_minutes:
        return rollup_estimated_minutes(subtree_steps)
    factor = cap_minutes / total
    for step in subtree_steps:
        _scale_leaves_in_subtree(step, factor)
    return rollup_estimated_minutes(subtree_steps)


def enforce_time_budget_by_phase(
    steps: list[PlanStep],
    cap_minutes: int,
) -> list[PlanStep]:
    """Scale leaves within each top-level phase subtree to preserve phase proportions."""
    if cap_minutes <= 0:
        return steps
    phase_totals = [total_leaf_minutes([s]) for s in steps]
    grand = sum(phase_totals)
    if grand <= 0 or grand <= cap_minutes:
        return rollup_estimated_minutes(steps)

    scaled: list[PlanStep] = []
    remaining_cap = cap_minutes
    for i, step in enumerate(steps):
        if i == len(steps) - 1:
            phase_cap = remaining_cap
        else:
            share = phase_totals[i] / grand
            phase_cap = max(1, int(cap_minutes * share))
            remaining_cap -= phase_cap
        subtree_leaves = total_leaf_minutes([step])
        if subtree_leaves > phase_cap and subtree_leaves > 0:
            factor = phase_cap / subtree_leaves
            _scale_leaves_in_subtree(step, factor)
        scaled.append(step)
    return rollup_estimated_minutes(scaled)


def normalize_brief_phase_minutes(
    phases: list,
    total_cap: int | None,
) -> None:
    """Adjust PhaseBrief allocated_minutes to sum to total_cap when set."""
    if total_cap is None or not phases:
        return
    total = sum(p.allocated_minutes for p in phases)
    if total <= 0:
        per = max(1, total_cap // len(phases))
        for p in phases:
            p.allocated_minutes = per
        return
    if total <= total_cap:
        return
    factor = total_cap / total
    for p in phases:
        p.allocated_minutes = max(1, int(p.allocated_minutes * factor))
