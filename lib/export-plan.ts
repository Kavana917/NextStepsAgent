import type { PlanStep } from "@/lib/plan-schema";

export function exportPlanJson(payload: {
  situation: string;
  steps: PlanStep[];
}): string {
  return JSON.stringify(
    {
      situation: payload.situation,
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
}): string {
  const lines: string[] = [];
  lines.push("# Next steps plan");
  lines.push("");
  lines.push("## Situation");
  lines.push("");
  lines.push(payload.situation.trim());
  lines.push("");
  lines.push("## Plan");
  lines.push("");

  const walk = (step: PlanStep, depth: number) => {
    const pad = `${"  ".repeat(Math.max(0, depth - 1))}`;
    lines.push(
      `${pad}- **${step.title}** _(priority: ${step.priority}; estimate: ~${step.estimatedMinutes}m)_`,
    );
    lines.push(`${pad}  ${step.description}`);
    if (step.children?.length) {
      for (const c of step.children) walk(c, depth + 1);
    }
  };

  for (const s of payload.steps) walk(s, 1);
  lines.push("");
  return lines.join("\n");
}
