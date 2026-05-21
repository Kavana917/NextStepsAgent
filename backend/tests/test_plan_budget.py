from app.models.plan import PlanProperty, PlanStep
from app.plan_budget import (
    branch_budget_minutes_from_properties,
    enforce_time_budget,
    enforce_time_budget_by_phase,
    enforce_time_budget_for_subtree,
    parse_time_budget_minutes,
    plan_budget_minutes_from_properties,
    total_budget_minutes_from_properties,
    total_leaf_minutes,
)


def test_parse_hours():
    assert parse_time_budget_minutes("10 hours") == 600


def test_budget_from_deadline_property():
    props = [
        PlanProperty(name="Complete within", value="10 hours", templateId="deadline"),
    ]
    assert plan_budget_minutes_from_properties(props) == 600
    assert total_budget_minutes_from_properties(props) == 600


def test_branch_budget_from_step_complete_within():
    props = [
        PlanProperty(
            name="Complete within",
            value="30 mins maximum for all subtasks",
            templateId="deadline",
        ),
    ]
    assert branch_budget_minutes_from_properties(props) == 30


def test_branch_budget_subtree_template():
    props = [
        PlanProperty(
            name="Time for subtasks",
            value="45 minutes",
            templateId="subtree_budget",
        ),
    ]
    assert branch_budget_minutes_from_properties(props) == 45


def test_enforce_scales_leaves():
    steps = [
        PlanStep(
            id="1",
            title="A",
            description="d",
            priority="high",
            estimatedMinutes=100,
            children=[
                PlanStep(
                    id="2",
                    title="leaf",
                    description="d",
                    priority="medium",
                    estimatedMinutes=200,
                    children=None,
                ),
            ],
        ),
    ]
    out = enforce_time_budget(steps, 100)
    assert total_leaf_minutes(out) <= 100


def test_enforce_subtree_scales_only_branch():
    subtree = [
        PlanStep(
            id="p",
            title="Parent",
            description="d",
            priority="high",
            estimatedMinutes=45,
            children=[
                PlanStep(
                    id="l1",
                    title="a",
                    description="d",
                    priority="medium",
                    estimatedMinutes=10,
                    isActionable=True,
                    children=None,
                ),
                PlanStep(
                    id="l2",
                    title="b",
                    description="d",
                    priority="medium",
                    estimatedMinutes=10,
                    isActionable=True,
                    children=None,
                ),
                PlanStep(
                    id="l3",
                    title="c",
                    description="d",
                    priority="medium",
                    estimatedMinutes=10,
                    isActionable=True,
                    children=None,
                ),
            ],
        ),
    ]
    out = enforce_time_budget_for_subtree(subtree, 30)
    assert total_leaf_minutes(out) <= 30
    assert out[0].estimated_minutes <= 30


def test_enforce_by_phase_preserves_proportions():
    def phase(leaf_minutes: int) -> PlanStep:
        return PlanStep(
            id=f"p-{leaf_minutes}",
            title="Phase",
            description="d",
            priority="high",
            estimatedMinutes=leaf_minutes,
            children=[
                PlanStep(
                    id=f"l-{leaf_minutes}",
                    title="leaf",
                    description="d",
                    priority="medium",
                    estimatedMinutes=leaf_minutes,
                    isActionable=True,
                    children=None,
                ),
            ],
        )

    steps = [phase(200), phase(800)]
    out = enforce_time_budget_by_phase(steps, 500)
    assert total_leaf_minutes(out) <= 500
    p0 = out[0].children[0].estimated_minutes
    p1 = out[1].children[0].estimated_minutes
    assert p0 < p1
