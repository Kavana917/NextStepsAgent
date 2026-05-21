from app.models.plan import PlanStep
from app.plan_leaf_expand import leaf_can_expand_into_substeps


def _leaf(**kwargs) -> PlanStep:
    defaults = {
        "id": "l1",
        "title": "Assess immediate impact on services",
        "description": "Review which services are affected and document severity.",
        "priority": "critical",
        "estimatedMinutes": 40,
        "isActionable": True,
        "children": None,
    }
    defaults.update(kwargs)
    return PlanStep(**defaults)


def test_expandable_leaf_with_enough_minutes():
    assert leaf_can_expand_into_substeps(_leaf()) is True


def test_not_expandable_too_short():
    assert (
        leaf_can_expand_into_substeps(
            _leaf(title="Send email", estimatedMinutes=8),
        )
        is False
    )


def test_not_expandable_with_children():
    assert (
        leaf_can_expand_into_substeps(
            _leaf(
                children=[
                    PlanStep(
                        id="c",
                        title="Child",
                        description="d",
                        priority="low",
                        estimatedMinutes=5,
                    ),
                ],
            ),
        )
        is False
    )


def test_not_expandable_atomic_short_title():
    assert (
        leaf_can_expand_into_substeps(
            _leaf(title="Call Bob", estimatedMinutes=15),
        )
        is False
    )
