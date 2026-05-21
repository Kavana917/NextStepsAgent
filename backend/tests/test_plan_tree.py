from app.models.plan import (
    PlanProperty,
    PlanStep,
    StepContextRevision,
    merge_plan_properties,
    patch_step_content,
    replace_step_children,
    revise_step_in_place,
    rollup_estimated_minutes,
    update_step_fields,
)


def test_merge_plan_properties_child_wins():
    root = [PlanProperty(name="Focus", value="A", templateId="focus")]
    step = [PlanProperty(name="Focus", value="B", templateId=None)]
    merged = merge_plan_properties(root, step)
    assert len(merged) == 1
    assert merged[0].value == "B"


def test_replace_step_children():
    steps = [
        PlanStep(
            id="p",
            title="Parent",
            description="d",
            priority="high",
            estimatedMinutes=10,
            children=[
                PlanStep(
                    id="old",
                    title="Old",
                    description="d",
                    priority="low",
                    estimatedMinutes=5,
                ),
            ],
        ),
    ]
    new_child = PlanStep(
        id="new",
        title="New",
        description="d",
        priority="medium",
        estimatedMinutes=8,
    )
    updated = replace_step_children(steps, "p", [new_child])
    assert updated[0].children is not None
    assert len(updated[0].children) == 1
    assert updated[0].children[0].id == "new"


def test_update_step_properties():
    steps = [
        PlanStep(
            id="s1",
            title="T",
            description="d",
            priority="low",
            estimatedMinutes=5,
        ),
    ]
    props = [PlanProperty(name="Deadline", value="2 weeks", templateId="deadline")]
    updated = update_step_fields(steps, "s1", properties=props)
    assert updated[0].properties[0].name == "Deadline"


def test_revise_step_in_place_preserves_children():
    steps = [
        PlanStep(
            id="p",
            title="Parent",
            description="old",
            priority="high",
            estimatedMinutes=20,
            children=[
                PlanStep(
                    id="c1",
                    title="Child",
                    description="d",
                    priority="medium",
                    estimatedMinutes=20,
                ),
            ],
        ),
    ]
    revision = StepContextRevision(
        title="Parent revised",
        description="new summary",
        priority="critical",
        estimatedMinutes=99,
    )
    updated = revise_step_in_place(
        steps,
        "p",
        revision,
        properties=[],
        is_leaf=False,
    )
    assert updated[0].title == "Parent revised"
    assert updated[0].children is not None
    assert len(updated[0].children) == 1
    assert updated[0].children[0].id == "c1"
    rolled = rollup_estimated_minutes(updated)
    assert rolled[0].estimated_minutes == 20


def test_patch_step_content_leaf_and_branch():
    steps = [
        PlanStep(
            id="p",
            title="Parent",
            description="d",
            priority="high",
            estimatedMinutes=15,
            children=[
                PlanStep(
                    id="leaf",
                    title="Leaf",
                    description="old",
                    priority="low",
                    estimatedMinutes=15,
                    isActionable=True,
                    implementationGuide="old guide here enough chars",
                    acceptanceCriteria="old done",
                    children=None,
                ),
            ],
        ),
    ]
    out = patch_step_content(
        steps,
        "leaf",
        title="Leaf new",
        description="new desc",
        estimated_minutes=20,
    )
    assert out is not None
    assert out[0].children[0].title == "Leaf new"
    assert out[0].children[0].estimated_minutes == 20
    assert out[0].estimated_minutes == 20

    out2 = patch_step_content(
        out,
        "p",
        title="Parent new",
        description="parent desc",
    )
    assert out2 is not None
    assert out2[0].title == "Parent new"
    assert out2[0].estimated_minutes == 20
