from __future__ import annotations

from app.models.plan import PlanProperty

MAX_PLAN_PROPERTIES = 12

# Preset template ids shown in the UI (validation allowlist).
PRESET_TEMPLATE_IDS = frozenset(
    {
        "deadline",
        "subtree_budget",
        "hours_per_week",
        "success",
        "constraints",
        "current_state",
        "focus",
    }
)


def normalize_plan_properties(raw: list[PlanProperty]) -> list[PlanProperty]:
    """Keep non-empty name/value pairs; enforce max count and unique names."""
    seen: set[str] = set()
    out: list[PlanProperty] = []

    for item in raw:
        name = item.name.strip()
        value = item.value.strip()
        if not name or not value:
            continue
        key = name.casefold()
        if key in seen:
            raise ValueError(f'Duplicate property name: "{name}"')
        seen.add(key)
        tid = item.template_id
        if tid is not None and tid not in PRESET_TEMPLATE_IDS:
            tid = None
        out.append(
            PlanProperty(name=name, value=value, templateId=tid),
        )
        if len(out) > MAX_PLAN_PROPERTIES:
            raise ValueError(
                f"At most {MAX_PLAN_PROPERTIES} planning properties allowed.",
            )

    return out
