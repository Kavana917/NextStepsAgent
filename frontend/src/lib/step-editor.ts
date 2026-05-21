import { isActionableLeaf } from "@/lib/plan-step-utils";
import type { PlanStep, Priority } from "@/lib/plan-types";

export type StepEditDraft = {
  title: string;
  description: string;
  priority: Priority;
  estimatedMinutes: string;
  implementationGuide: string;
  acceptanceCriteria: string;
};

export function stepToEditDraft(step: PlanStep): StepEditDraft {
  return {
    title: step.title,
    description: step.description,
    priority: step.priority,
    estimatedMinutes: String(step.estimatedMinutes),
    implementationGuide: step.implementationGuide ?? "",
    acceptanceCriteria: step.acceptanceCriteria ?? "",
  };
}

export function stepHasChildren(step: PlanStep): boolean {
  return (step.children?.length ?? 0) > 0;
}

export function validateStepEditDraft(
  draft: StepEditDraft,
  step: PlanStep,
): string | null {
  if (!draft.title.trim()) return "Title is required.";
  if (!draft.description.trim()) return "Description is required.";
  const isLeaf = isActionableLeaf(step) && !stepHasChildren(step);
  if (isLeaf) {
    const minutes = Number.parseInt(draft.estimatedMinutes, 10);
    if (!Number.isFinite(minutes) || minutes < 1) {
      return "Estimated minutes must be a positive number.";
    }
    if (minutes > 10080) return "Estimated minutes is too large.";
  }
  return null;
}

export function buildStepPatchPayload(
  draft: StepEditDraft,
  step: PlanStep,
): Record<string, string | number> {
  const isLeaf = isActionableLeaf(step) && !stepHasChildren(step);
  const payload: Record<string, string | number> = {
    title: draft.title.trim(),
    description: draft.description.trim(),
    priority: draft.priority,
  };
  if (isLeaf) {
    payload.estimatedMinutes = Number.parseInt(draft.estimatedMinutes, 10);
    payload.implementationGuide = draft.implementationGuide.trim();
    payload.acceptanceCriteria = draft.acceptanceCriteria.trim();
  }
  return payload;
}
