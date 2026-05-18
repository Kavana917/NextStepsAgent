from __future__ import annotations

import json
from datetime import datetime, timezone

from app.models.plan import PlanStep


def export_plan_json(situation: str, steps: list[PlanStep]) -> str:
    payload = {
        "situation": situation.strip(),
        "steps": [s.model_dump(by_alias=True) for s in steps],
        "exportedAt": datetime.now(timezone.utc).isoformat(),
    }
    return json.dumps(payload, indent=2)


def export_plan_markdown(situation: str, steps: list[PlanStep]) -> str:
    lines: list[str] = [
        "# Next steps plan",
        "",
        "## Situation",
        "",
        situation.strip(),
        "",
        "## Plan",
        "",
    ]

    def walk(step: PlanStep, depth: int) -> None:
        pad = "  " * max(0, depth - 1)
        est = step.estimated_minutes
        lines.append(
            f"{pad}- **{step.title}** _(priority: {step.priority}; estimate: ~{est}m)_"
        )
        lines.append(f"{pad}  {step.description}")
        if step.children:
            for child in step.children:
                walk(child, depth + 1)

    for s in steps:
        walk(s, 1)
    lines.append("")
    return "\n".join(lines)
