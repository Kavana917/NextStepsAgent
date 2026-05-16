import OpenAI from "openai";
import { z } from "zod";
import {
  assignPlanIds,
  llmPlanSchema,
  type PlanStep,
} from "@/lib/plan-schema";

const SYSTEM_PROMPT = `You are a planning assistant. Given the user's situation, produce a practical hierarchical plan.

Strict rules:
- Output MUST be a single JSON object only (no markdown, no commentary).
- Shape: { "steps": [ ... ] }
- There are exactly THREE levels of work breakdown:
  - Each item in "steps" is a major priority (level 1).
  - Each level-1 step MUST have a "children" array of substeps (level 2).
  - Each level-2 step MUST have a "children" array of concrete tasks (level 3 leaves).
- Level-3 items are leaves: they MUST NOT include a "children" property.
- Between 1 and 5 items at each branching level (inclusive): len(steps) 1–5, each children length 1–5.
- Each step object MUST include:
  - "title": short, actionable title
  - "description": 1–3 sentences describing what to do
  - "priority": one of "low" | "medium" | "high" | "critical"
  - "estimatedMinutes": positive integer, rough effort estimate for that step alone (not rolled up)
- Time estimates are indicative only (not commitments).
- Use clear, concise language.`;

function extractJsonObject(raw: string): string {
  const t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  if (fence) return fence[1].trim();
  return t;
}

function parseModelJson(content: string): unknown {
  const cleaned = extractJsonObject(content);
  return JSON.parse(cleaned) as unknown;
}

export type GeneratePlanResult =
  | { ok: true; steps: PlanStep[] }
  | { ok: false; error: string };

export async function generatePlanFromSituation(params: {
  situation: string;
  locale?: string;
}): Promise<GeneratePlanResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "Server missing OPENAI_API_KEY." };
  }

  const model =
    process.env.OPENAI_MODEL?.trim()
    ?? process.env.OPENAI_MODEL_ID?.trim()
    ?? "gpt-4o-mini";

  const organization =
    process.env.OPENAI_ORGANIZATION?.trim()
    ?? process.env.OPENAI_ORG_ID?.trim();

  const openai = new OpenAI({
    apiKey,
    ...(organization ? { organization } : {}),
  });

  const userParts = [
    `Situation:\n${params.situation.trim()}`,
    params.locale
      ? `Preferred locale / language for wording: ${params.locale}`
      : null,
    `Return JSON with shape { "steps": [ ... ] } as specified.`,
  ].filter(Boolean) as string[];

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userParts.join("\n\n") },
  ];

  const maxAttempts = 3;
  let lastZodError: z.ZodError | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const completion = await openai.chat.completions.create({
      model,
      temperature: attempt === 0 ? 0.35 : 0.15,
      response_format: { type: "json_object" },
      messages,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return { ok: false, error: "Model returned an empty response." };
    }

    let parsed: unknown;
    try {
      parsed = parseModelJson(content);
    } catch {
      messages.push({ role: "assistant", content });
      messages.push({
        role: "user",
        content:
          "Your previous reply was not valid JSON. Reply again with ONLY a single JSON object matching the schema.",
      });
      continue;
    }

    const checked = llmPlanSchema.safeParse(parsed);
    if (checked.success) {
      const steps = assignPlanIds(checked.data);
      return { ok: true, steps };
    }

    lastZodError = checked.error;
    messages.push({ role: "assistant", content });
    messages.push({
      role: "user",
      content: [
        "Your JSON failed validation. Fix it and reply with ONLY the corrected JSON object.",
        "Issues:",
        ...checked.error.issues.map(
          (i) => `- (${i.path.join(".") || "root"}) ${i.message}`,
        ),
      ].join("\n"),
    });
  }

  const summary =
    lastZodError?.issues
      .slice(0, 8)
      .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
      .join("; ") ?? "Unknown validation error";

  return {
    ok: false,
    error: `Could not produce a valid plan after retries. ${summary}`,
  };
}
