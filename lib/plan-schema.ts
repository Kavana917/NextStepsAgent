import { z } from "zod";

/** Fixed fan-out at every branch (5 top-level × 5 substeps × 5 execution per substep). */
export const STEPS_PER_BRANCH = 5;

export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type Priority = (typeof PRIORITIES)[number];

const stepFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  priority: z.enum(PRIORITIES),
  estimatedMinutes: z.number().int().positive().max(10_080),
};

/** Single step fields (no children) — used in staged generation. */
export const stepFieldsSchema = z.object(stepFields);

/** Level-3 leaf: no children. */
export const leafStepSchema = stepFieldsSchema;

/** Level-2 node: children are leaves only. */
export const level2StepSchema = z.object({
  ...stepFields,
  children: z.array(leafStepSchema).length(STEPS_PER_BRANCH),
});

/** Level-1 (top) node: children are level-2 nodes only. */
export const level1StepSchema = z.object({
  ...stepFields,
  children: z.array(level2StepSchema).length(STEPS_PER_BRANCH),
});

/**
 * Raw shape expected from the model (no ids — we assign stable UUIDs server-side).
 */
export const llmPlanSchema = z.object({
  steps: z.array(level1StepSchema).length(STEPS_PER_BRANCH),
});

/** Phase 1 — five top-level priorities only. */
export const topLevelOnlySchema = z.object({
  steps: z.array(stepFieldsSchema).length(STEPS_PER_BRANCH),
});

/** Phase 2 — five substeps for one top-level parent. */
export const substepsForParentSchema = z.object({
  children: z.array(stepFieldsSchema).length(STEPS_PER_BRANCH),
});

/** Phase 3 — five execution tasks for each of five substeps under one top-level parent. */
export const executionBatchSchema = z.object({
  substeps: z
    .array(
      z.object({
        children: z.array(stepFieldsSchema).length(STEPS_PER_BRANCH),
      }),
    )
    .length(STEPS_PER_BRANCH),
});

export type LlmPlan = z.infer<typeof llmPlanSchema>;
export type TopLevelOnly = z.infer<typeof topLevelOnlySchema>;
export type SubstepsForParent = z.infer<typeof substepsForParentSchema>;
export type ExecutionBatch = z.infer<typeof executionBatchSchema>;

export type PlanStep = {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  estimatedMinutes: number;
  children?: PlanStep[];
};

export function assignPlanIds(plan: LlmPlan): PlanStep[] {
  return plan.steps.map((s) => ({
    id: crypto.randomUUID(),
    title: s.title,
    description: s.description,
    priority: s.priority,
    estimatedMinutes: s.estimatedMinutes,
    children: s.children.map((c) => ({
      id: crypto.randomUUID(),
      title: c.title,
      description: c.description,
      priority: c.priority,
      estimatedMinutes: c.estimatedMinutes,
      children: c.children.map((leaf) => ({
        id: crypto.randomUUID(),
        title: leaf.title,
        description: leaf.description,
        priority: leaf.priority,
        estimatedMinutes: leaf.estimatedMinutes,
      })),
    })),
  }));
}
