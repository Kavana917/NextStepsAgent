from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.config import MIN_LEAVES_HIGH, MIN_LEAVES_LOW, MIN_LEAVES_MEDIUM
from app.models.plan import MAX_TREE_DEPTH, PlanBrief

DetailLevel = Literal["low", "medium", "high"]

DEFAULT_DETAIL_LEVEL: DetailLevel = "medium"

DETAIL_LEVELS: frozenset[str] = frozenset({"low", "medium", "high"})


@dataclass(frozen=True)
class PlanDetailProfile:
    level: DetailLevel
    depth_min: int
    target_depth: int
    depth_max: int
    phases_guidance: str
    leaves_guidance: str
    children_guidance: str
    min_leaves_target: int
    max_phases_cap: int


_PROFILES: dict[DetailLevel, PlanDetailProfile] = {
    "low": PlanDetailProfile(
        level="low",
        depth_min=2,
        target_depth=2,
        depth_max=3,
        phases_guidance=(
            "Use 1–3 broad top-level phases only; merge work when the situation allows."
        ),
        leaves_guidance=(
            "Target a modest number of final actionable tasks—only what is needed "
            "for a clear overview, not an exhaustive breakdown."
        ),
        children_guidance=(
            "Use as few children as the parent needs (often 2–4); avoid over-splitting."
        ),
        min_leaves_target=MIN_LEAVES_LOW,
        max_phases_cap=3,
    ),
    "medium": PlanDetailProfile(
        level="medium",
        depth_min=3,
        target_depth=4,
        depth_max=5,
        phases_guidance=(
            "Use 2–6 top-level phases sized to the situation; balance breadth and clarity."
        ),
        leaves_guidance=(
            "Target a practical number of actionable leaf tasks for the situation—"
            "enough to execute, without unnecessary granularity."
        ),
        children_guidance=(
            "Split each branch into as many children as needed (often 2–6); "
            "match complexity to the parent's scope."
        ),
        min_leaves_target=MIN_LEAVES_MEDIUM,
        max_phases_cap=6,
    ),
    "high": PlanDetailProfile(
        level="high",
        depth_min=4,
        target_depth=6,
        depth_max=MAX_TREE_DEPTH,
        phases_guidance=(
            "Use as many top-level phases as the situation warrants (often 3–10+); "
            "do not collapse distinct workstreams."
        ),
        leaves_guidance=(
            "Target a thorough set of actionable leaf tasks—break work down until "
            "each leaf is a clear one-sitting action."
        ),
        children_guidance=(
            "Decompose branches fully; use as many children as needed per parent "
            "when the work justifies it."
        ),
        min_leaves_target=MIN_LEAVES_HIGH,
        max_phases_cap=12,
    ),
}


def normalize_detail_level(value: str | None) -> DetailLevel:
    if value is None:
        return DEFAULT_DETAIL_LEVEL
    level = value.strip().casefold()
    if level in DETAIL_LEVELS:
        return level  # type: ignore[return-value]
    return DEFAULT_DETAIL_LEVEL


def profile_for(level: DetailLevel | str | None = None) -> PlanDetailProfile:
    if level is None:
        key: DetailLevel = DEFAULT_DETAIL_LEVEL
    elif isinstance(level, str):
        key = normalize_detail_level(level)
    else:
        key = level
    return _PROFILES[key]


def clamp_brief_to_profile(brief: PlanBrief, profile: PlanDetailProfile) -> None:
    """Mutate brief in place to fit detail profile bounds."""
    brief.max_depth = max(
        profile.target_depth,
        min(profile.depth_max, brief.max_depth, MAX_TREE_DEPTH),
    )
    brief.max_depth = max(profile.depth_min, brief.max_depth)
    brief.suggested_total_leaves = max(
        profile.min_leaves_target,
        brief.suggested_total_leaves,
    )
    if len(brief.phases) > profile.max_phases_cap:
        brief.phases = brief.phases[: profile.max_phases_cap]


def expansion_depth_for_profile(profile: PlanDetailProfile) -> int:
    """Tree depth to use when no PlanBrief exists (e.g. subtree regen)."""
    return profile.target_depth


def leaf_budget_guidance(
    leaf_target: int,
    *,
    max_depth: int,
    phase_count: int,
    current_depth: int,
    force_leaves: bool,
) -> str:
    """Prompt text: aim for at least leaf_target actionable leaves (no hard maximum)."""
    branch_levels = max(1, max_depth - 1)
    per_phase = max(1, leaf_target // max(phase_count, 1))
    if force_leaves:
        typical_children = max(2, min(6, per_phase // max(1, branch_levels - current_depth)))
        return (
            f"Plan detail targets at least ~{leaf_target} actionable tasks across the "
            f"plan (more is fine when the situation requires). "
            f"For this parent, use enough children to cover the work (often "
            f"{typical_children}+); merge only when tasks are truly one sitting."
        )
    avg_fanout = max(2, min(8, int(round(leaf_target ** (1 / branch_levels)))))
    return (
        f"Plan detail targets at least ~{leaf_target} actionable tasks across the plan "
        f"({phase_count} top-level phases); additional leaves are fine when needed. "
        f"Aim for ~{avg_fanout} children per branch when decomposing."
    )
