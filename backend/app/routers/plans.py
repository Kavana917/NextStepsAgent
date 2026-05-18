from __future__ import annotations

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.config import (
    GENERATE_RATE_LIMIT_MAX,
    GENERATE_RATE_LIMIT_WINDOW_MS,
    MAX_SITUATION_LENGTH,
    MIN_SITUATION_LENGTH,
)
from app.models.plan import SavedPlan
from app.services.plan_store import delete_plan, get_plan, list_plans_meta, save_plan
from app.services.planning import generate_plan_from_situation
from app.services.rate_limit import get_client_key, rate_limit_allow

router = APIRouter(prefix="/api/plans", tags=["plans"])


class GenerateBody(BaseModel):
    situation: str = ""
    locale: str | None = None


@router.get("")
def list_plans():
    plans = list_plans_meta()
    return {"plans": [p.model_dump(by_alias=True) for p in plans]}


@router.get("/{plan_id}")
def get_plan_by_id(plan_id: str):
    plan = get_plan(plan_id)
    if plan is None:
        return JSONResponse({"error": "Not found."}, status_code=404)
    return plan.model_dump(by_alias=True)


@router.delete("/{plan_id}")
def delete_plan_by_id(plan_id: str):
    removed = delete_plan(plan_id)
    if not removed:
        return JSONResponse({"error": "Not found."}, status_code=404)
    return {"ok": True}


@router.post("/generate")
def generate_plan(
    body: GenerateBody,
    x_forwarded_for: str | None = Header(default=None),
    x_real_ip: str | None = Header(default=None),
):
    key = get_client_key(x_forwarded_for, x_real_ip)
    if not rate_limit_allow(
        key,
        GENERATE_RATE_LIMIT_WINDOW_MS,
        GENERATE_RATE_LIMIT_MAX,
    ):
        return JSONResponse(
            {"error": "Too many requests. Try again shortly."},
            status_code=429,
        )

    locale = None
    if body.locale and body.locale.strip():
        locale = body.locale.strip()[:40]

    trimmed = body.situation.strip()
    if len(trimmed) < MIN_SITUATION_LENGTH:
        return JSONResponse(
            {
                "error": (
                    f"Situation must be at least {MIN_SITUATION_LENGTH} "
                    "non-whitespace characters."
                ),
            },
            status_code=400,
        )
    if len(trimmed) > MAX_SITUATION_LENGTH:
        return JSONResponse(
            {
                "error": (
                    f"Situation must be at most {MAX_SITUATION_LENGTH} characters."
                ),
            },
            status_code=400,
        )

    try:
        result = generate_plan_from_situation(trimmed, locale)
    except Exception as e:
        return JSONResponse(
            {"error": str(e) if str(e) else "Upstream model request failed."},
            status_code=502,
        )

    if not result.ok:
        err = result.error or "Request failed."
        status = 503 if "OPENAI_API_KEY" in err else 502
        return JSONResponse({"error": err}, status_code=status)

    plan_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    record = SavedPlan(
        id=plan_id,
        situation=trimmed,
        createdAt=created_at,
        steps=result.steps or [],
    )
    save_plan(record)

    return {
        "id": plan_id,
        "steps": [s.model_dump(by_alias=True) for s in (result.steps or [])],
    }
