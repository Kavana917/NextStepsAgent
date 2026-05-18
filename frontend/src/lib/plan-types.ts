export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type Priority = (typeof PRIORITIES)[number];

export type PlanStep = {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  estimatedMinutes: number;
  children?: PlanStep[];
};

export type ListItem = {
  id: string;
  situationPreview: string;
  createdAt: string;
};
