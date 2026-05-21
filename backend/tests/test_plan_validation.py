from app.models.plan import PlanStep, validate_plan_tree


def _leaf(**kwargs) -> PlanStep:
    defaults = dict(
        id="leaf-1",
        title="Do thing",
        description="desc",
        priority="medium",
        estimatedMinutes=30,
        isActionable=True,
        implementationGuide="1. Start\n2. Finish",
        acceptanceCriteria="Done when complete",
        children=None,
    )
    defaults.update(kwargs)
    return PlanStep(**defaults)


def _branch(**kwargs) -> PlanStep:
    defaults = dict(
        id="branch-1",
        title="Phase",
        description="desc",
        priority="high",
        estimatedMinutes=60,
        isActionable=False,
        children=[_leaf(id="leaf-1"), _leaf(id="leaf-2", title="Other")],
    )
    defaults.update(kwargs)
    return PlanStep(**defaults)


def test_valid_tree_has_no_errors():
    assert validate_plan_tree([_branch()]) == []


def test_leaf_with_children_reports_error():
    child = _leaf(id="nested", title="Nested")
    bad = _leaf(children=[child])
    errors = validate_plan_tree([bad])
    assert any("must not have children" in e for e in errors)


def test_leaf_missing_guide_reports_error():
    bad = _leaf(implementationGuide=None)
    errors = validate_plan_tree([bad])
    assert any("missing implementation guide" in e for e in errors)


def test_branch_without_children_reports_error():
    bad = _branch(children=[], isActionable=False)
    errors = validate_plan_tree([bad])
    assert any("must have children" in e for e in errors)
