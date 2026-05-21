"""Preset planning property templates (mirrors frontend plan-property-templates.ts)."""

PRESET_PROPERTY_TEMPLATES: list[dict[str, str]] = [
    {
        "templateId": "deadline",
        "label": "Complete within",
        "placeholder": "e.g. 8 weeks, 56 days, by July 2026",
    },
    {
        "templateId": "subtree_budget",
        "label": "Time for subtasks",
        "placeholder": "e.g. 30 minutes for all subtasks under this step",
    },
    {
        "templateId": "hours_per_week",
        "label": "Time available per week",
        "placeholder": "e.g. 10 hours",
    },
    {
        "templateId": "success",
        "label": "Success looks like",
        "placeholder": "e.g. 500 newsletter subscribers",
    },
    {
        "templateId": "constraints",
        "label": "Constraints",
        "placeholder": "e.g. no paid ads, evenings only",
    },
    {
        "templateId": "current_state",
        "label": "Current state / starting point",
        "placeholder": "e.g. no audience yet, posting 2x/week",
    },
    {
        "templateId": "focus",
        "label": "Main focus",
        "placeholder": "e.g. audience growth over polish",
    },
]
