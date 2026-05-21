from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Header
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.config import (
    GENERATE_RATE_LIMIT_MAX,
    GENERATE_RATE_LIMIT_WINDOW_MS,
    MAX_SITUATION_LENGTH,
    MIN_SITUATION_LENGTH,
)
from app.config import MAX_EXECUTION_TASK_MINUTES
from app.models.plan import Priority, PlanProperty, PlanStep, SavedPlan, patch_step_content
from app.plan_detail import normalize_detail_level
from app.plan_generation_stream import iter_plan_generate_events
from app.plan_properties import normalize_plan_properties
from app.services.plan_store import delete_plan, get_plan, list_plans_meta, save_plan
from app.services.planning import (
    apply_step_context,
    expand_leaf_into_substeps,
    generate_plan_from_situation,
    suggest_properties_for_situation,
)
from app.plan_leaf_expand import leaf_can_expand_into_substeps
from app.services.rate_limit import get_client_key, rate_limit_allow

router = APIRouter(prefix="/api/plans", tags=["plans"])


class GenerateBody(BaseModel):
    situation: str = ""
    locale: str | None = None
    properties: list[PlanProperty] = []
    detailLevel: str | None = None


class SuggestPropertiesBody(BaseModel):
    situation: str = ""
    parentTitle: str | None = None
    parentDescription: str | None = None


class ApplyStepContextBody(BaseModel):
    stepId: str
    properties: list[PlanProperty] = []


class RegenerateSubtreeBody(ApplyStepContextBody):
    """Deprecated alias; same as ApplyStepContextBody."""


class PatchPlanBody(BaseModel):
    situation: str | None = None
    properties: list[PlanProperty] | None = None
    detailLevel: str | None = None


class PatchStepBody(BaseModel):
    model_config = {"populate_by_name": True}

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, min_length=1, max_length=4000)
    priority: Priority | None = None
    estimated_minutes: int | None = Field(
        default=None,
        alias="estimatedMinutes",
        gt=0,
        le=10_080,
    )
    implementation_guide: str | None = Field(
        default=None,
        alias="implementationGuide",
        max_length=8000,
    )
    acceptance_criteria: str | None = Field(
        default=None,
        alias="acceptanceCriteria",
        max_length=2000,
    )


def _validate_situation(trimmed: str) -> JSONResponse | None:
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
    return None


def _rate_limit_or_429(
    x_forwarded_for: str | None,
    x_real_ip: str | None,
) -> JSONResponse | None:
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
    return None


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


@router.patch("/{plan_id}")
def patch_plan(plan_id: str, body: PatchPlanBody):
    record = get_plan(plan_id)
    if record is None:
        return JSONResponse({"error": "Not found."}, status_code=404)

    updates: dict = {}
    if body.situation is not None:
        trimmed = body.situation.strip()
        err = _validate_situation(trimmed)
        if err:
            return err
        updates["situation"] = trimmed

    if body.properties is not None:
        try:
            updates["properties"] = normalize_plan_properties(body.properties)
        except ValueError as e:
            return JSONResponse({"error": str(e)}, status_code=400)

    if body.detailLevel is not None:
        updates["detail_level"] = normalize_detail_level(body.detailLevel)

    if not updates:
        return record.model_dump(by_alias=True)

    updated = record.model_copy(update=updates)
    save_plan(updated)
    return updated.model_dump(by_alias=True)


@router.patch("/{plan_id}/steps/{step_id}")
def patch_plan_step(plan_id: str, step_id: str, body: PatchStepBody):
    record = get_plan(plan_id)
    if record is None:
        return JSONResponse({"error": "Not found."}, status_code=404)

    if not any(
        [
            body.title is not None,
            body.description is not None,
            body.priority is not None,
            body.estimated_minutes is not None,
            body.implementation_guide is not None,
            body.acceptance_criteria is not None,
        ],
    ):
        return JSONResponse(
            {"error": "At least one field to update is required."},
            status_code=400,
        )

    if body.estimated_minutes is not None and body.estimated_minutes > MAX_EXECUTION_TASK_MINUTES:
        return JSONResponse(
            {
                "error": (
                    f"estimatedMinutes must be at most "
                    f"{MAX_EXECUTION_TASK_MINUTES}."
                ),
            },
            status_code=400,
        )

    updated_steps = patch_step_content(
        record.steps,
        step_id,
        title=body.title,
        description=body.description,
        priority=body.priority,
        estimated_minutes=body.estimated_minutes,
        implementation_guide=body.implementation_guide,
        acceptance_criteria=body.acceptance_criteria,
    )
    if updated_steps is None:
        return JSONResponse({"error": "Step not found."}, status_code=404)

    updated_record = record.model_copy(update={"steps": updated_steps})
    save_plan(updated_record)

    return {
        "id": plan_id,
        "steps": [s.model_dump(by_alias=True) for s in updated_steps],
    }


@router.post("/{plan_id}/steps/{step_id}/expand-substeps")
def expand_step_substeps(
    plan_id: str,
    step_id: str,
    x_forwarded_for: str | None = Header(default=None),
    x_real_ip: str | None = Header(default=None),
):
    limited = _rate_limit_or_429(x_forwarded_for, x_real_ip)
    if limited:
        return limited

    record = get_plan(plan_id)
    if record is None:
        return JSONResponse({"error": "Not found."}, status_code=404)

    from app.models.plan import find_step_by_id

    target = find_step_by_id(record.steps, step_id)
    if target is None:
        return JSONResponse({"error": "Step not found."}, status_code=404)

    if not leaf_can_expand_into_substeps(target):
        return JSONResponse(
            {
                "error": (
                    "This task is too small or atomic to split into sub-steps."
                ),
            },
            status_code=400,
        )

    try:
        result = expand_leaf_into_substeps(
            record.situation,
            record.steps,
            step_id,
            record.properties,
            detail_level=normalize_detail_level(record.detail_level),
        )
    except Exception as e:
        return JSONResponse(
            {"error": str(e) if str(e) else "Upstream model request failed."},
            status_code=502,
        )

    if not result.ok:
        err = result.error or "Request failed."
        status = 503 if "OPENAI_API_KEY" in err else 502
        return JSONResponse({"error": err}, status_code=status)

    updated_steps = result.steps or []
    updated_record = record.model_copy(update={"steps": updated_steps})
    save_plan(updated_record)

    return {
        "id": plan_id,
        "steps": [s.model_dump(by_alias=True) for s in updated_steps],
    }


@router.post("/suggest-properties")
def suggest_properties(
    body: SuggestPropertiesBody,
    x_forwarded_for: str | None = Header(default=None),
    x_real_ip: str | None = Header(default=None),
):
    limited = _rate_limit_or_429(x_forwarded_for, x_real_ip)
    if limited:
        return limited

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

    result = suggest_properties_for_situation(
        trimmed,
        parent_title=body.parentTitle,
        parent_description=body.parentDescription,
    )
    if isinstance(result, str):
        status = 503 if "OPENAI_API_KEY" in result else 502
        return JSONResponse({"error": result}, status_code=status)

    return {
        "suggestions": [
            s.model_dump(by_alias=True) for s in result.suggestions
        ],
    }


@router.post("/generate")
def generate_plan(
    body: GenerateBody,
    x_forwarded_for: str | None = Header(default=None),
    x_real_ip: str | None = Header(default=None),
):
    limited = _rate_limit_or_429(x_forwarded_for, x_real_ip)
    if limited:
        return limited

    trimmed = body.situation.strip()
    err = _validate_situation(trimmed)
    if err:
        return err

    locale = None
    if body.locale and body.locale.strip():
        locale = body.locale.strip()[:40]

    try:
        properties = normalize_plan_properties(body.properties)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    try:
        detail_level = normalize_detail_level(body.detailLevel)
        result = generate_plan_from_situation(
            trimmed,
            locale,
            properties=properties,
            detail_level=detail_level,
        )
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
        properties=properties,
        detailLevel=detail_level,
    )
    save_plan(record)

    return {
        "id": plan_id,
        "steps": [s.model_dump(by_alias=True) for s in (result.steps or [])],
        "properties": [p.model_dump(by_alias=True) for p in properties],
    }


@router.post("/generate/stream")
def generate_plan_stream(
    body: GenerateBody,
    x_forwarded_for: str | None = Header(default=None),
    x_real_ip: str | None = Header(default=None),
):
    limited = _rate_limit_or_429(x_forwarded_for, x_real_ip)
    if limited:
        return limited

    trimmed = body.situation.strip()
    err = _validate_situation(trimmed)
    if err:
        return err

    locale = None
    if body.locale and body.locale.strip():
        locale = body.locale.strip()[:40]

    try:
        properties = normalize_plan_properties(body.properties)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    detail_level = normalize_detail_level(body.detailLevel)

    return StreamingResponse(
        _generate_stream_with_save(trimmed, locale, properties, detail_level),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _generate_stream_with_save(
    situation: str,
    locale: str | None,
    properties: list[PlanProperty],
    detail_level: str,
):
    from app.models.plan import PlanStep

    for chunk in iter_plan_generate_events(
        situation,
        locale=locale,
        properties=properties,
        detail_level=detail_level,
    ):
        if not chunk.startswith("data: "):
            yield chunk
            continue
        try:
            payload = json.loads(chunk[6:].strip())
        except json.JSONDecodeError:
            yield chunk
            continue

        if payload.get("type") != "complete":
            yield chunk
            continue

        try:
            steps_raw = payload.get("steps") or []
            steps = [PlanStep.model_validate(s) for s in steps_raw]
            plan_id = str(uuid.uuid4())
            created_at = datetime.now(timezone.utc).isoformat()
            record = SavedPlan(
                id=plan_id,
                situation=situation,
                createdAt=created_at,
                steps=steps,
                properties=properties,
                detailLevel=detail_level,
            )
            save_plan(record)
            yield (
                "data: "
                + json.dumps(
                    {
                        "type": "complete",
                        "id": plan_id,
                        "steps": steps_raw,
                        "properties": [
                            p.model_dump(by_alias=True) for p in properties
                        ],
                    },
                    ensure_ascii=False,
                )
                + "\n\n"
            )
        except Exception as exc:
            yield (
                "data: "
                + json.dumps(
                    {"type": "error", "error": str(exc)},
                    ensure_ascii=False,
                )
                + "\n\n"
            )
        return


def _apply_step_context_handler(
    plan_id: str,
    body: ApplyStepContextBody,
    x_forwarded_for: str | None,
    x_real_ip: str | None,
):
    limited = _rate_limit_or_429(x_forwarded_for, x_real_ip)
    if limited:
        return limited

    record = get_plan(plan_id)
    if record is None:
        return JSONResponse({"error": "Not found."}, status_code=404)

    if not body.stepId.strip():
        return JSONResponse({"error": "stepId is required."}, status_code=400)

    try:
        step_properties = normalize_plan_properties(body.properties)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    from app.models.plan import find_step_by_id

    target = find_step_by_id(record.steps, body.stepId)
    if target is None:
        return JSONResponse({"error": "Step not found."}, status_code=404)

    try:
        result = apply_step_context(
            record.situation,
            record.steps,
            body.stepId,
            step_properties,
            record.properties,
        )
    except Exception as e:
        return JSONResponse(
            {"error": str(e) if str(e) else "Upstream model request failed."},
            status_code=502,
        )

    if not result.ok:
        err = result.error or "Request failed."
        status = 503 if "OPENAI_API_KEY" in err else 502
        return JSONResponse({"error": err}, status_code=status)

    updated_steps = result.steps or []
    updated_record = record.model_copy(update={"steps": updated_steps})
    save_plan(updated_record)

    return {
        "id": plan_id,
        "steps": [s.model_dump(by_alias=True) for s in updated_steps],
    }


@router.post("/{plan_id}/apply-step-context")
def apply_step_context_route(
    plan_id: str,
    body: ApplyStepContextBody,
    x_forwarded_for: str | None = Header(default=None),
    x_real_ip: str | None = Header(default=None),
):
    return _apply_step_context_handler(plan_id, body, x_forwarded_for, x_real_ip)


@router.post("/{plan_id}/regenerate-subtree")
def regenerate_subtree_route(
    plan_id: str,
    body: RegenerateSubtreeBody,
    x_forwarded_for: str | None = Header(default=None),
    x_real_ip: str | None = Header(default=None),
):
    return _apply_step_context_handler(plan_id, body, x_forwarded_for, x_real_ip)
