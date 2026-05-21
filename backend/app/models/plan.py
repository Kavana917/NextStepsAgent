from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.config import LEAF_ENRICH_BATCH_SIZE

MAX_CHILDREN_PER_NODE = 12
MAX_TREE_DEPTH = 6
MAX_TOTAL_NODES = 150

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


class StepDraft(StepFields):
    is_actionable: bool = Field(alias="isActionable", default=False)


class PhaseBriefFields(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, populate_by_name=True)

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=4000)
    priority: Priority
    allocated_minutes: int = Field(alias="allocatedMinutes", gt=0, le=10_080)
    target_child_count: int = Field(alias="targetChildCount", ge=1, le=MAX_CHILDREN_PER_NODE)


class PlanBrief(BaseModel):
    max_depth: int = Field(alias="maxDepth", ge=1, le=MAX_TREE_DEPTH)
    suggested_total_leaves: int = Field(alias="suggestedTotalLeaves", ge=1)
    phases: list[PhaseBriefFields] = Field(min_length=1, max_length=MAX_CHILDREN_PER_NODE)


class ChildrenBatch(BaseModel):
    children: list[StepDraft] = Field(min_length=1, max_length=MAX_CHILDREN_PER_NODE)


class LeafEnrichmentItem(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, populate_by_name=True)

    leaf_id: str = Field(alias="leafId", min_length=1, max_length=64)
    description: str = Field(min_length=1, max_length=4000)
    implementation_guide: str = Field(alias="implementationGuide", min_length=20, max_length=8000)
    acceptance_criteria: str = Field(alias="acceptanceCriteria", min_length=5, max_length=2000)
    estimated_minutes: int = Field(alias="estimatedMinutes", gt=0, le=10_080)


class ActionableLeafEnrichmentBatch(BaseModel):
    leaves: list[LeafEnrichmentItem] = Field(
        min_length=1,
        max_length=LEAF_ENRICH_BATCH_SIZE,
    )


class PlanProperty(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, populate_by_name=True)

    name: str = Field(min_length=1, max_length=80)
    value: str = Field(min_length=1, max_length=800)
    template_id: str | None = Field(default=None, alias="templateId")


class SuggestedProperty(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, populate_by_name=True)

    name: str = Field(min_length=1, max_length=80)
    value: str = Field(min_length=1, max_length=800)
    template_id: str | None = Field(default=None, alias="templateId")


class SuggestPropertiesResponse(BaseModel):
    suggestions: list[SuggestedProperty] = Field(min_length=1, max_length=8)


class StepContextRevision(BaseModel):
    """LLM output when revising a single step from planning context (+ on canvas)."""

    model_config = ConfigDict(str_strip_whitespace=True, populate_by_name=True)

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=4000)
    priority: Priority
    estimated_minutes: int = Field(alias="estimatedMinutes", gt=0, le=10_080)
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


class PlanStep(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    title: str
    description: str
    priority: Priority
    estimated_minutes: int = Field(alias="estimatedMinutes")
    properties: list[PlanProperty] = Field(default_factory=list)
    is_actionable: bool = Field(default=False, alias="isActionable")
    implementation_guide: str | None = Field(default=None, alias="implementationGuide")
    acceptance_criteria: str | None = Field(default=None, alias="acceptanceCriteria")
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
    properties: list[PlanProperty] = Field(default_factory=list)
    detail_level: str = Field(default="medium", alias="detailLevel")


class PlanListItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    situation_preview: str = Field(alias="situationPreview")
    created_at: str = Field(alias="createdAt")


@dataclass
class SkeletonNode:
    """In-memory tree while generating; leaves use stable leaf_id for enrichment."""

    leaf_id: str
    title: str
    description: str
    priority: Priority
    estimated_minutes: int
    is_actionable: bool
    children: list[SkeletonNode] = field(default_factory=list)
    path: str = ""
    implementation_guide: str | None = None
    acceptance_criteria: str | None = None


def is_leaf_step(step: PlanStep) -> bool:
    if step.is_actionable:
        return True
    return not step.children


def merge_plan_properties(
    *groups: list[PlanProperty],
) -> list[PlanProperty]:
    by_key: dict[str, PlanProperty] = {}
    for group in groups:
        for prop in group:
            by_key[prop.name.casefold()] = prop
    return list(by_key.values())


def rollup_estimated_minutes(steps: list[PlanStep]) -> list[PlanStep]:
    def rollup(step: PlanStep) -> PlanStep:
        if not step.children:
            return step
        children = [rollup(child) for child in step.children]
        total = sum(child.estimated_minutes for child in children)
        return step.model_copy(
            update={"children": children, "estimated_minutes": total},
        )

    return [rollup(step) for step in steps]


def count_nodes(steps: list[PlanStep]) -> int:
    total = 0
    for step in steps:
        total += 1
        if step.children:
            total += count_nodes(step.children)
    return total


def find_step_by_id(steps: list[PlanStep], step_id: str) -> PlanStep | None:
    for step in steps:
        if step.id == step_id:
            return step
        if step.children:
            found = find_step_by_id(step.children, step_id)
            if found:
                return found
    return None


def replace_step(
    steps: list[PlanStep],
    step_id: str,
    new_step: PlanStep,
) -> list[PlanStep] | None:
    """Swap one step node; preserves position in tree. Returns None if not found."""
    found = False
    out: list[PlanStep] = []

    for step in steps:
        if step.id == step_id:
            out.append(new_step)
            found = True
        elif step.children:
            replaced = replace_step(step.children, step_id, new_step)
            if replaced is None:
                out.append(step)
            else:
                out.append(step.model_copy(update={"children": replaced}))
                found = True
        else:
            out.append(step)
    return out if found else None


def replace_step_children(
    steps: list[PlanStep],
    step_id: str,
    new_children: list[PlanStep],
) -> list[PlanStep]:
    out: list[PlanStep] = []
    for step in steps:
        if step.id == step_id:
            out.append(step.model_copy(update={"children": new_children}))
        elif step.children:
            out.append(
                step.model_copy(
                    update={
                        "children": replace_step_children(
                            step.children,
                            step_id,
                            new_children,
                        ),
                    },
                ),
            )
        else:
            out.append(step)
    return out


def revise_step_in_place(
    steps: list[PlanStep],
    step_id: str,
    revision: StepContextRevision,
    *,
    properties: list[PlanProperty],
    is_leaf: bool,
) -> list[PlanStep]:
    """Replace one step's fields; always preserve existing children."""
    out: list[PlanStep] = []
    for step in steps:
        if step.id == step_id:
            updates: dict = {
                "title": revision.title,
                "description": revision.description,
                "priority": revision.priority,
                "properties": properties,
            }
            if is_leaf:
                updates.update(
                    {
                        "estimated_minutes": revision.estimated_minutes,
                        "is_actionable": True,
                        "implementation_guide": revision.implementation_guide,
                        "acceptance_criteria": revision.acceptance_criteria,
                        "children": None,
                    },
                )
            out.append(step.model_copy(update=updates))
        elif step.children:
            out.append(
                step.model_copy(
                    update={
                        "children": revise_step_in_place(
                            step.children,
                            step_id,
                            revision,
                            properties=properties,
                            is_leaf=is_leaf,
                        ),
                    },
                ),
            )
        else:
            out.append(step)
    return out


def patch_step_content(
    steps: list[PlanStep],
    step_id: str,
    *,
    title: str | None = None,
    description: str | None = None,
    priority: Priority | None = None,
    estimated_minutes: int | None = None,
    implementation_guide: str | None = None,
    acceptance_criteria: str | None = None,
) -> list[PlanStep] | None:
    """Update editable fields on one step; returns None if step_id not found."""
    found = False
    out: list[PlanStep] = []

    def apply(step: PlanStep) -> PlanStep:
        nonlocal found
        if step.id == step_id:
            found = True
            has_children = bool(step.children)
            updates: dict = {}
            if title is not None:
                updates["title"] = title.strip()
            if description is not None:
                updates["description"] = description.strip()
            if priority is not None:
                updates["priority"] = priority
            if not has_children:
                if estimated_minutes is not None:
                    updates["estimated_minutes"] = estimated_minutes
                if implementation_guide is not None:
                    updates["implementation_guide"] = (
                        implementation_guide.strip() or None
                    )
                if acceptance_criteria is not None:
                    updates["acceptance_criteria"] = (
                        acceptance_criteria.strip() or None
                    )
            return step.model_copy(update=updates)
        if step.children:
            return step.model_copy(
                update={
                    "children": [apply(child) for child in step.children],
                },
            )
        return step

    out = [apply(s) for s in steps]
    if not found:
        return None
    return rollup_estimated_minutes(out)


def update_step_fields(
    steps: list[PlanStep],
    step_id: str,
    *,
    properties: list[PlanProperty] | None = None,
    children: list[PlanStep] | None = None,
) -> list[PlanStep]:
    out: list[PlanStep] = []
    for step in steps:
        if step.id == step_id:
            updates: dict = {}
            if properties is not None:
                updates["properties"] = properties
            if children is not None:
                updates["children"] = children
            out.append(step.model_copy(update=updates))
        elif step.children:
            out.append(
                step.model_copy(
                    update={
                        "children": update_step_fields(
                            step.children,
                            step_id,
                            properties=properties,
                            children=children,
                        ),
                    },
                ),
            )
        else:
            out.append(step)
    return out


def collect_ancestor_properties(
    steps: list[PlanStep],
    target_id: str,
    root_properties: list[PlanProperty],
) -> list[PlanProperty]:
    path_props: list[list[PlanProperty]] = []

    def walk(list_steps: list[PlanStep], trail: list[list[PlanProperty]]) -> bool:
        for step in list_steps:
            if step.id == target_id:
                path_props.extend(trail)
                return True
            if step.children:
                if walk(step.children, trail + [step.properties]):
                    return True
        return False

    walk(steps, [])
    return merge_plan_properties(root_properties, *path_props)


def collect_skeleton_leaves(
    nodes: list[SkeletonNode],
) -> list[SkeletonNode]:
    out: list[SkeletonNode] = []

    def walk(n: SkeletonNode) -> None:
        if n.is_actionable or not n.children:
            out.append(n)
        else:
            for c in n.children:
                walk(c)

    for node in nodes:
        walk(node)
    return out


def skeleton_to_plan_steps(nodes: list[SkeletonNode]) -> list[PlanStep]:
    def build(n: SkeletonNode) -> PlanStep:
        is_leaf = n.is_actionable or not n.children
        children = None if is_leaf else [build(c) for c in n.children]
        return PlanStep(
            id=str(uuid.uuid4()),
            title=n.title,
            description=n.description,
            priority=n.priority,
            estimatedMinutes=n.estimated_minutes,
            properties=[],
            isActionable=is_leaf,
            implementationGuide=n.implementation_guide if is_leaf else None,
            acceptanceCriteria=n.acceptance_criteria if is_leaf else None,
            children=children,
        )

    return [build(n) for n in nodes]


def apply_leaf_enrichments(
    steps: list[PlanStep],
    enrichments: dict[str, LeafEnrichmentItem],
) -> list[PlanStep]:
    def walk(step: PlanStep) -> PlanStep:
        if is_leaf_step(step):
            item = enrichments.get(step.id)
            if item is None:
                return step
            return step.model_copy(
                update={
                    "description": item.description,
                    "implementation_guide": item.implementation_guide,
                    "acceptance_criteria": item.acceptance_criteria,
                    "estimated_minutes": item.estimated_minutes,
                    "is_actionable": True,
                    "children": None,
                },
            )
        if step.children:
            return step.model_copy(
                update={"children": [walk(c) for c in step.children]},
            )
        return step

    return [walk(s) for s in steps]


def attach_enrichments_to_skeleton(
    nodes: list[SkeletonNode],
    enrichments: dict[str, LeafEnrichmentItem],
) -> None:
    """Mutate skeleton leaves then convert — used when enriching before PlanStep ids exist."""

    def walk(n: SkeletonNode) -> None:
        if n.is_actionable or not n.children:
            item = enrichments.get(n.leaf_id)
            if item:
                n.description = item.description
                n.estimated_minutes = item.estimated_minutes
                n.implementation_guide = item.implementation_guide
                n.acceptance_criteria = item.acceptance_criteria
        else:
            for c in n.children:
                walk(c)

    for node in nodes:
        walk(node)


def validate_plan_tree(steps: list[PlanStep]) -> list[str]:
    errors: list[str] = []

    def walk(step: PlanStep, depth: int) -> None:
        has_kids = bool(step.children)
        if step.is_actionable:
            if has_kids:
                errors.append(f'Leaf "{step.title}" must not have children.')
            if not step.implementation_guide:
                errors.append(f'Leaf "{step.title}" missing implementation guide.')
        elif has_kids:
            for child in step.children:
                walk(child, depth + 1)
        else:
            errors.append(f'Branch "{step.title}" must have children.')

    for s in steps:
        walk(s, 0)
    return errors

