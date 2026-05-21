import { isActionableLeaf } from "@/lib/plan-step-utils";
import type { PlanProperty, PlanStep } from "@/lib/plan-types";

export function exportPlanJson(payload: {
  situation: string;
  steps: PlanStep[];
  properties?: PlanProperty[];
}): string {
  return JSON.stringify(
    {
      situation: payload.situation,
      properties: payload.properties ?? [],
      steps: payload.steps,
      exportedAt: new Date().toISOString(),
    },
    null,
    2,
  );
}

export function exportPlanMarkdown(payload: {
  situation: string;
  steps: PlanStep[];
  properties?: PlanProperty[];
}): string {
  const lines: string[] = [];
  lines.push("# Next steps plan");
  lines.push("");
  lines.push("## Situation");
  lines.push("");
  lines.push(payload.situation.trim());
  lines.push("");
  const props = payload.properties ?? [];
  if (props.length > 0) {
    lines.push("## Planning context");
    lines.push("");
    for (const p of props) {
      lines.push(`- **${p.name}:** ${p.value}`);
    }
    lines.push("");
  }
  lines.push("## Plan");
  lines.push("");

  const walk = (step: PlanStep, depth: number) => {
    const pad = `${"  ".repeat(Math.max(0, depth - 1))}`;
    lines.push(
      `${pad}- **${step.title}** _(priority: ${step.priority}; estimate: ~${step.estimatedMinutes}m)_`,
    );
    lines.push(`${pad}  ${step.description}`);
    if (isActionableLeaf(step)) {
      if (step.implementationGuide) {
        lines.push(`${pad}  **Implementation:**`);
        for (const line of step.implementationGuide.split(/\n+/)) {
          const trimmed = line.trim();
          if (trimmed) lines.push(`${pad}    - ${trimmed}`);
        }
      }
      if (step.acceptanceCriteria) {
        lines.push(`${pad}  **Done when:** ${step.acceptanceCriteria}`);
      }
    }
    if (step.children?.length) {
      for (const c of step.children) walk(c, depth + 1);
    }
  };

  for (const s of payload.steps) walk(s, 1);
  lines.push("");
  return lines.join("\n");
}
