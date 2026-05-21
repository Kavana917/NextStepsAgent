from __future__ import annotations

import json
from pathlib import Path

from app.config import PLANS_DIR
from app.models.plan import PlanListItem, SavedPlan, rollup_estimated_minutes


def _ensure_plans_dir() -> None:
    PLANS_DIR.mkdir(parents=True, exist_ok=True)


def save_plan(record: SavedPlan) -> None:
    _ensure_plans_dir()
    record = record.model_copy(
        update={"steps": rollup_estimated_minutes(record.steps)},
    )
    path = PLANS_DIR / f"{record.id}.json"
    path.write_text(
        json.dumps(record.model_dump(by_alias=True), indent=2),
        encoding="utf-8",
    )


def delete_plan(plan_id: str) -> bool:
    _ensure_plans_dir()
    safe_id = Path(plan_id).name
    if safe_id != plan_id:
        return False
    path = PLANS_DIR / f"{safe_id}.json"
    if not path.is_file():
        return False
    path.unlink()
    return True


def get_plan(plan_id: str) -> SavedPlan | None:
    _ensure_plans_dir()
    safe_id = Path(plan_id).name
    if safe_id != plan_id:
        return None
    path = PLANS_DIR / f"{safe_id}.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        plan = SavedPlan.model_validate(data)
        return plan.model_copy(
            update={"steps": rollup_estimated_minutes(plan.steps)},
        )
    except (json.JSONDecodeError, ValueError):
        return None


def list_plans_meta(limit: int = 50) -> list[PlanListItem]:
    _ensure_plans_dir()
    items: list[PlanListItem] = []
    try:
        names = list(PLANS_DIR.iterdir())
    except OSError:
        return []

    for path in names:
        if path.suffix != ".json":
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            pid = data.get("id")
            situation = data.get("situation")
            created = data.get("createdAt")
            if not (
                isinstance(pid, str)
                and isinstance(situation, str)
                and isinstance(created, str)
            ):
                continue
            preview = (
                f"{situation[:117]}..."
                if len(situation) > 120
                else situation
            )
            items.append(
                PlanListItem(
                    id=pid,
                    situationPreview=preview,
                    createdAt=created,
                )
            )
        except (json.JSONDecodeError, OSError, ValueError):
            continue

    items.sort(key=lambda x: x.created_at, reverse=True)
    return items[:limit]
