from app.models.plan import PhaseBriefFields, PlanBrief
from app.plan_budget import normalize_brief_phase_minutes


def test_normalize_brief_scales_phases_to_cap():
    phases = [
        PhaseBriefFields(
            title="A",
            description="d",
            priority="high",
            allocatedMinutes=400,
            targetChildCount=3,
        ),
        PhaseBriefFields(
            title="B",
            description="d",
            priority="medium",
            allocatedMinutes=600,
            targetChildCount=3,
        ),
    ]
    normalize_brief_phase_minutes(phases, 500)
    assert sum(p.allocated_minutes for p in phases) <= 500
    assert all(p.allocated_minutes >= 1 for p in phases)


def test_normalize_brief_leaves_under_cap_unchanged():
    phases = [
        PhaseBriefFields(
            title="A",
            description="d",
            priority="high",
            allocatedMinutes=100,
            targetChildCount=2,
        ),
    ]
    normalize_brief_phase_minutes(phases, 500)
    assert phases[0].allocated_minutes == 100


def test_plan_brief_schema_defaults():
    brief = PlanBrief(
        maxDepth=3,
        suggestedTotalLeaves=20,
        phases=[
            PhaseBriefFields(
                title="Phase",
                description="desc",
                priority="medium",
                allocatedMinutes=120,
                targetChildCount=3,
            ),
        ],
    )
    assert 1 <= brief.max_depth <= 6
    assert brief.suggested_total_leaves >= 1
