import type { DetailLevel, PlanProperty, PlanStep } from "@/lib/plan-types";

export type GenerateProgressUpdate = {
  phase: string;
  message: string;
  percent: number;
};

export type GenerateStreamResult =
  | {
      ok: true;
      id: string;
      steps: PlanStep[];
      properties: PlanProperty[];
    }
  | { ok: false; error: string };

function parseError(data: unknown, fallback: string): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as { error: unknown }).error === "string"
  ) {
    return (data as { error: string }).error;
  }
  return fallback;
}

export async function generatePlanStream(
  body: {
    situation: string;
    properties: PlanProperty[];
    detailLevel: DetailLevel;
  },
  options: {
    signal?: AbortSignal;
    onProgress: (update: GenerateProgressUpdate) => void;
  },
): Promise<GenerateStreamResult> {
  const res = await fetch("/api/plans/generate/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: false, error: parseError(data, "Request failed.") };
  }

  if (!res.body) {
    return { ok: false, error: "No response stream from server." };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(line.slice(6)) as Record<string, unknown>;
      } catch {
        continue;
      }

      const type = payload.type;
      if (type === "progress") {
        options.onProgress({
          phase: String(payload.phase ?? ""),
          message: String(payload.message ?? ""),
          percent: Number(payload.percent ?? 0),
        });
      } else if (type === "complete") {
        return {
          ok: true,
          id: String(payload.id ?? ""),
          steps: (payload.steps as PlanStep[]) ?? [],
          properties: (payload.properties as PlanProperty[]) ?? [],
        };
      } else if (type === "error") {
        return {
          ok: false,
          error: String(payload.error ?? "Plan generation failed."),
        };
      }
    }
  }

  return { ok: false, error: "Generation ended before completion." };
}
