import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  assignPlanIds,
  executionBatchSchema,
  llmPlanSchema,
  STEPS_PER_BRANCH,
  substepsForParentSchema,
  topLevelOnlySchema,
  type ExecutionBatch,
  type LlmPlan,
  type PlanStep,
  type SubstepsForParent,
  type TopLevelOnly,
} from "@/lib/plan-schema";

const N = String(STEPS_PER_BRANCH);

const SHARED_FIELDS = `Each step object: "title", "description" (1–2 sentences), "priority" ("low"|"medium"|"high"|"critical"), "estimatedMinutes" (positive integer).`;

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
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
    timeout: 120_000,
  });

  const situation = params.situation.trim();
  const localeLine = params.locale
    ? `Preferred locale / language: ${params.locale}`
    : "";

  try {
    const tops = await callStructured<TopLevelOnly>({
      openai,
      model,
      schema: topLevelOnlySchema,
      schemaName: "top_level_steps",
      messages: [
        {
          role: "system",
          content: `You plan major priorities. ${SHARED_FIELDS} Return JSON with exactly ${N} top-level steps (broad phases only — no substeps yet).`,
        },
        {
          role: "user",
          content: `Situation:\n${situation}\n\n${localeLine}\n\nReturn { "steps": [ exactly ${N} objects ] }.`,
        },
      ],
    });

    const substepsByTop = await mapPool(
      tops.steps,
      STEPS_PER_BRANCH,
      async (parent, index) => {
        const batch = await callStructured<SubstepsForParent>({
          openai,
          model,
          schema: substepsForParentSchema,
          schemaName: "substeps_for_parent",
          messages: [
            {
              role: "system",
              content: `You break one major priority into exactly ${N} substeps. ${SHARED_FIELDS} Return JSON { "children": [ exactly ${N} objects ] } — no deeper nesting.`,
            },
            {
              role: "user",
              content: [
                `Situation:\n${situation}`,
                localeLine,
                `Top-level priority ${index + 1} of ${N}: "${parent.title}"`,
                parent.description,
                `Return exactly ${N} substeps that complete this priority.`,
              ]
                .filter(Boolean)
                .join("\n\n"),
            },
          ],
        });
        return batch.children;
      },
    );

    const executionByTop = await mapPool(
      tops.steps,
      STEPS_PER_BRANCH,
      async (parent, topIndex) => {
        const substeps = substepsByTop[topIndex];
        const batch = await callStructured<ExecutionBatch>({
          openai,
          model,
          schema: executionBatchSchema,
          schemaName: "execution_batch",
          messages: [
            {
              role: "system",
              content: `For each substep, add exactly ${N} execution tasks (immediate actions). ${SHARED_FIELDS} Return { "substeps": [ exactly ${N} objects, each with "children": [ exactly ${N} execution tasks ] ] }. Execution tasks must NOT have "children".`,
            },
            {
              role: "user",
              content: [
                `Situation:\n${situation}`,
                localeLine,
                `Top-level priority ${topIndex + 1}: "${parent.title}"`,
                "Substeps to expand (in order):",
                ...substeps.map(
                  (s, j) =>
                    `${j + 1}. ${s.title} — ${s.description}`,
                ),
                `For each substep, output exactly ${N} execution tasks in the matching "substeps[i].children" entry.`,
              ]
                .filter(Boolean)
                .join("\n\n"),
            },
          ],
        });
        return batch.substeps.map((s) => s.children);
      },
    );

    const plan: LlmPlan = {
      steps: tops.steps.map((top, i) => ({
        ...top,
        children: substepsByTop[i].map((sub, j) => ({
          ...sub,
          children: executionByTop[i][j],
        })),
      })),
    };

    const verified = llmPlanSchema.safeParse(plan);
    if (!verified.success) {
      return {
        ok: false,
        error: `Assembled plan failed validation: ${verified.error.issues
          .slice(0, 6)
          .map((issue) => issue.message)
          .join("; ")}`,
      };
    }

    return { ok: true, steps: assignPlanIds(verified.data) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Plan generation failed: ${msg}` };
  }
}

async function callStructured<T>(params: {
  openai: OpenAI;
  model: string;
  schema: z.ZodType<T>;
  schemaName: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
}): Promise<T> {
  const maxAttempts = 3;
  let useStructured = true;
  let lastError = "";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (useStructured) {
      try {
        const completion = await params.openai.chat.completions.parse({
          model: params.model,
          temperature: attempt === 0 ? 0.2 : 0.08,
          messages: params.messages,
          response_format: zodResponseFormat(params.schema, params.schemaName),
        });

        const parsed = completion.choices[0]?.message?.parsed as T | null;
        if (parsed) return parsed;

        lastError = "Structured parse returned empty.";
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        useStructured = false;
      }
    } else {
      try {
        const completion = await params.openai.chat.completions.create({
          model: params.model,
          temperature: 0.12,
          response_format: { type: "json_object" },
          messages: params.messages,
        });
        const content = completion.choices[0]?.message?.content;
        if (!content) {
          lastError = "Empty model response.";
        } else {
          const json = JSON.parse(content) as unknown;
          const checked = params.schema.safeParse(json);
          if (checked.success) return checked.data;
          lastError = checked.error.issues
            .slice(0, 4)
            .map((i) => i.message)
            .join("; ");
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    params.messages.push({
      role: "user",
      content: `Invalid output (${lastError}). Reply with ONLY valid JSON matching the required shape and exact counts (${N} items per array).`,
    });
  }

  throw new Error(
    `${params.schemaName} failed after ${maxAttempts} attempts: ${lastError}`,
  );
}
