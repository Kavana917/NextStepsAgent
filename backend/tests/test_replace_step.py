from app.models.plan import PlanStep, replace_step


def test_replace_step_swaps_node():
    old = PlanStep(
        id="a",
        title="Old",
        description="d",
        priority="high",
        estimatedMinutes=10,
        isActionable=True,
        children=None,
    )
    new = PlanStep(
        id="a",
        title="New",
        description="d2",
        priority="medium",
        estimatedMinutes=10,
        isActionable=False,
        children=[
            PlanStep(
                id="c1",
                title="Child",
                description="d",
                priority="low",
                estimatedMinutes=10,
                isActionable=True,
                children=None,
            ),
        ],
    )
    out = replace_step([old], "a", new)
    assert out is not None
    assert out[0].title == "New"
    assert out[0].children is not None
    assert len(out[0].children) == 1
