import type { PlanStep } from "@/lib/plan-types";

/** Mirrors backend MIN_MINUTES_TO_SPLIT. */
export const MIN_MINUTES_TO_SPLIT_LEAF = 12;

const ATOMIC_TITLE_PREFIXES = [
  "send ",
  "email ",
  "call ",
  "submit ",
  "approve ",
  "sign ",
];

/** True when this step is an actionable leaf (no children). */
export function isActionableLeaf(step: PlanStep): boolean {
  if (step.children?.length) return false;
  if (step.isActionable === true) return true;
  if (step.isActionable === false) return false;
  return true;
}

export function isBranchStep(step: PlanStep): boolean {
  return (step.children?.length ?? 0) > 0;
}

/** Show + on leaf nodes to break into sub-steps (heuristic; matches backend). */
export function canExpandLeafIntoSubsteps(step: PlanStep): boolean {
  if ((step.children?.length ?? 0) > 0) return false;
  if (!isActionableLeaf(step)) return false;
  if (step.estimatedMinutes < MIN_MINUTES_TO_SPLIT_LEAF) return false;

  const title = step.title.trim();
  if (!title) return false;
  const words = title.split(/\s+/);
  const titleLower = title.toLowerCase();

  if (step.estimatedMinutes < 25 && words.length <= 3) {
    if (ATOMIC_TITLE_PREFIXES.some((p) => titleLower.startsWith(p))) {
      return false;
    }
  }
  if (step.estimatedMinutes < 20 && words.length <= 2) return false;
  if (step.description.trim().length < 12 && step.estimatedMinutes < 20) {
    return false;
  }
  return true;
}
