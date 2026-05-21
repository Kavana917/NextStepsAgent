"""Heuristics for splitting actionable leaves into sub-steps."""

from __future__ import annotations

from app.models.plan import PlanStep

# Below this, a leaf is treated as a single sitting — no + to expand.
MIN_MINUTES_TO_SPLIT = 12

_ATOMIC_TITLE_PREFIXES = (
    "send ",
    "email ",
    "call ",
    "submit ",
    "approve ",
    "sign ",
)


def leaf_can_expand_into_substeps(step: PlanStep) -> bool:
    """True when an actionable leaf can logically be broken into sub-steps."""
    if step.children:
        return False
    if step.estimated_minutes < MIN_MINUTES_TO_SPLIT:
        return False
    title = step.title.strip()
    if not title:
        return False
    words = title.split()
    title_lower = title.casefold()
    if step.estimated_minutes < 25 and len(words) <= 3:
        if any(title_lower.startswith(p) for p in _ATOMIC_TITLE_PREFIXES):
            return False
    if step.estimated_minutes < 20 and len(words) <= 2:
        return False
    if len(step.description.strip()) < 12 and step.estimated_minutes < 20:
        return False
    return True
