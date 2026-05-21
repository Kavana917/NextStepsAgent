import pytest

from app.models.plan import PlanProperty
from app.plan_properties import MAX_PLAN_PROPERTIES, normalize_plan_properties


def test_whitespace_trimmed():
    raw = [PlanProperty(name="  Complete within  ", value="  8 weeks  ")]
    out = normalize_plan_properties(raw)
    assert len(out) == 1
    assert out[0].name == "Complete within"
    assert out[0].value == "8 weeks"


def test_duplicate_names_raises():
    raw = [
        PlanProperty(name="Budget", value="200"),
        PlanProperty(name="budget", value="300"),
    ]
    with pytest.raises(ValueError, match="Duplicate"):
        normalize_plan_properties(raw)


def test_max_count_raises():
    raw = [
        PlanProperty(name=f"Field {i}", value=f"v{i}")
        for i in range(MAX_PLAN_PROPERTIES + 1)
    ]
    with pytest.raises(ValueError, match="At most"):
        normalize_plan_properties(raw)


def test_unknown_template_id_cleared():
    out = normalize_plan_properties(
        [PlanProperty(name="X", value="y", templateId="not_a_preset")],
    )
    assert out[0].template_id is None
