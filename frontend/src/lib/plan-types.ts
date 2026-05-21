export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const DETAIL_LEVELS = ["low", "medium", "high"] as const;
export type DetailLevel = (typeof DETAIL_LEVELS)[number];

export type PlanStep = {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  estimatedMinutes: number;
  properties?: PlanProperty[];
  isActionable?: boolean;
  implementationGuide?: string | null;
  acceptanceCriteria?: string | null;
  children?: PlanStep[];
};

export type SelectionTarget =
  | { kind: "situation" }
  | { kind: "step"; stepId: string }
  | { kind: "add-root" }
  | { kind: "add-before"; stepId: string }
  | { kind: "expand-leaf"; stepId: string }
  | null;

export type ListItem = {
  id: string;
  situationPreview: string;
  createdAt: string;
};

export type PlanProperty = {
  name: string;
  value: string;
  templateId?: string | null;
};
