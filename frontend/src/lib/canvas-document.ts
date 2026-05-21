import type {
  DetailLevel,
  PlanProperty,
  PlanStep,
  SelectionTarget,
} from "@/lib/plan-types";

export type CanvasDocument = {
  planId: string | null;
  situation: string;
  situationSaved: boolean;
  detailLevel: DetailLevel;
  rootProperties: PlanProperty[];
  steps: PlanStep[];
  selection: SelectionTarget;
};

export function emptyDocument(): CanvasDocument {
  return {
    planId: null,
    situation: "",
    situationSaved: false,
    detailLevel: "medium",
    rootProperties: [],
    steps: [],
    selection: null,
  };
}

export function hasSituationNode(doc: CanvasDocument): boolean {
  return doc.situationSaved && doc.situation.trim().length > 0;
}

export function findStepById(
  steps: PlanStep[],
  stepId: string,
): PlanStep | undefined {
  for (const step of steps) {
    if (step.id === stepId) return step;
    if (step.children) {
      const found = findStepById(step.children, stepId);
      if (found) return found;
    }
  }
  return undefined;
}

export function updateStepInTree(
  steps: PlanStep[],
  stepId: string,
  patch: Partial<PlanStep>,
): PlanStep[] {
  return steps.map((step) => {
    if (step.id === stepId) {
      return { ...step, ...patch };
    }
    if (step.children) {
      return {
        ...step,
        children: updateStepInTree(step.children, stepId, patch),
      };
    }
    return step;
  });
}
