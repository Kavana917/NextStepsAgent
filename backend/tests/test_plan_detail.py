from app.models.plan import PhaseBriefFields, PlanBrief
from app.plan_detail import (
    clamp_brief_to_profile,
    leaf_budget_guidance,
    normalize_detail_level,
    profile_for,
)


def test_normalize_detail_level_defaults_unknown():
    assert normalize_detail_level(None) == "medium"
    assert normalize_detail_level("invalid") == "medium"
    assert normalize_detail_level("HIGH") == "high"


def test_profiles_have_distinct_min_leaf_targets():
    low = profile_for("low")
    medium = profile_for("medium")
    high = profile_for("high")
    assert low.target_depth < medium.target_depth < high.target_depth
    assert low.min_leaves_target < high.min_leaves_target
    assert low.depth_max < high.depth_max


def test_clamp_brief_enforces_target_depth():
    profile = profile_for("medium")
    brief = PlanBrief(
        maxDepth=3,
        suggestedTotalLeaves=20,
        phases=[
            PhaseBriefFields(
                title="Phase",
                description="d",
                priority="medium",
                allocatedMinutes=120,
                targetChildCount=3,
            ),
        ],
    )
    clamp_brief_to_profile(brief, profile)
    assert brief.max_depth == profile.target_depth


def test_leaf_budget_guidance_mentions_minimum_not_maximum():
    text = leaf_budget_guidance(
        80,
        max_depth=4,
        phase_count=4,
        current_depth=0,
        force_leaves=False,
    )
    assert "80" in text
    assert "at least" in text.lower()
    assert "≤" not in text


def test_clamp_brief_raises_suggested_leaves_to_minimum():
    profile = profile_for("low")
    brief = PlanBrief(
        maxDepth=6,
        suggestedTotalLeaves=5,
        phases=[
            PhaseBriefFields(
                title="A",
                description="d",
                priority="high",
                allocatedMinutes=100,
                targetChildCount=2,
            ),
        ],
    )
    clamp_brief_to_profile(brief, profile)
    assert brief.max_depth <= profile.depth_max
    assert brief.max_depth >= profile.depth_min
    assert brief.suggested_total_leaves >= profile.min_leaves_target
    assert len(brief.phases) <= profile.max_phases_cap
