import { z } from "zod";

export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type Priority = (typeof PRIORITIES)[number];

const stepFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  priority: z.enum(PRIORITIES),
  estimatedMinutes: z.number().int().positive().max(10_080),
};

/** Level-3 leaf: no children. */
export const leafStepSchema = z.object(stepFields);

/** Level-2 node: children are leaves only. */
export const level2StepSchema = z.object({
  ...stepFields,
  children: z.array(leafStepSchema).min(1).max(5),
});

/** Level-1 (top) node: children are level-2 nodes only. */
export const level1StepSchema = z.object({
  ...stepFields,
  children: z.array(level2StepSchema).min(1).max(5),
});

/**
 * Raw shape expected from the model (no ids — we assign stable UUIDs server-side).
 */
export const llmPlanSchema = z.object({
  steps: z.array(level1StepSchema).min(1).max(5),
});

export type LlmPlan = z.infer<typeof llmPlanSchema>;

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
