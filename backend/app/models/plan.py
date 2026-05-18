from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

STEPS_PER_BRANCH = 5
Priority = Literal["low", "medium", "high", "critical"]


class StepFields(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, populate_by_name=True)

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=4000)
    priority: Priority
    estimated_minutes: int = Field(
        alias="estimatedMinutes",
        gt=0,
        le=10_080,
    )


class LeafStep(StepFields):
    pass


class Level2Step(StepFields):
    children: list[LeafStep] = Field(min_length=STEPS_PER_BRANCH, max_length=STEPS_PER_BRANCH)


class Level1Step(StepFields):
    children: list[Level2Step] = Field(min_length=STEPS_PER_BRANCH, max_length=STEPS_PER_BRANCH)


class LlmPlan(BaseModel):
    steps: list[Level1Step] = Field(min_length=STEPS_PER_BRANCH, max_length=STEPS_PER_BRANCH)


class TopLevelOnly(BaseModel):
    steps: list[StepFields] = Field(min_length=STEPS_PER_BRANCH, max_length=STEPS_PER_BRANCH)


class SubstepsForParent(BaseModel):
    children: list[StepFields] = Field(min_length=STEPS_PER_BRANCH, max_length=STEPS_PER_BRANCH)


class ExecutionSubstepBatch(BaseModel):
    children: list[StepFields] = Field(min_length=STEPS_PER_BRANCH, max_length=STEPS_PER_BRANCH)


class ExecutionBatch(BaseModel):
    substeps: list[ExecutionSubstepBatch] = Field(
        min_length=STEPS_PER_BRANCH,
        max_length=STEPS_PER_BRANCH,
    )


class PlanStep(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    title: str
    description: str
    priority: Priority
    estimated_minutes: int = Field(alias="estimatedMinutes")
    children: list[PlanStep] | None = None

    @field_validator("id", mode="before")
    @classmethod
    def coerce_id(cls, v: object) -> str:
        return str(v)


class SavedPlan(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    situation: str
    created_at: str = Field(alias="createdAt")
    steps: list[PlanStep]


class PlanListItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    situation_preview: str = Field(alias="situationPreview")
    created_at: str = Field(alias="createdAt")


def assign_plan_ids(plan: LlmPlan) -> list[PlanStep]:
    def leaf(step: LeafStep) -> PlanStep:
        return PlanStep(
            id=str(uuid.uuid4()),
            title=step.title,
            description=step.description,
            priority=step.priority,
            estimatedMinutes=step.estimated_minutes,
        )

    def level2(step: Level2Step) -> PlanStep:
        return PlanStep(
            id=str(uuid.uuid4()),
            title=step.title,
            description=step.description,
            priority=step.priority,
            estimatedMinutes=step.estimated_minutes,
            children=[leaf(c) for c in step.children],
        )

    return [
        PlanStep(
            id=str(uuid.uuid4()),
            title=s.title,
            description=s.description,
            priority=s.priority,
            estimatedMinutes=s.estimated_minutes,
            children=[level2(c) for c in s.children],
        )
        for s in plan.steps
    ]
