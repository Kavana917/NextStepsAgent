import { NextResponse } from "next/server";
import {
  GENERATE_RATE_LIMIT_MAX,
  GENERATE_RATE_LIMIT_WINDOW_MS,
  MAX_SITUATION_LENGTH,
  MIN_SITUATION_LENGTH,
} from "@/lib/constants";
import { generatePlanFromSituation } from "@/lib/planning-service";
import { savePlan } from "@/lib/plan-store";
import { getClientKey, rateLimitAllow } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const key = getClientKey(req);
  if (
    !rateLimitAllow(key, GENERATE_RATE_LIMIT_WINDOW_MS, GENERATE_RATE_LIMIT_MAX)
  ) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Expected JSON object body." }, { status: 400 });
  }

  const situation = String(
    "situation" in body ? (body as { situation: unknown }).situation : "",
  );
  const localeRaw =
    "locale" in body ? (body as { locale: unknown }).locale : undefined;
  const locale =
    typeof localeRaw === "string" && localeRaw.trim().length > 0
      ? localeRaw.trim().slice(0, 40)
      : undefined;

  const trimmed = situation.trim();
  if (trimmed.length < MIN_SITUATION_LENGTH) {
    return NextResponse.json(
      {
        error: `Situation must be at least ${MIN_SITUATION_LENGTH} non-whitespace characters.`,
      },
      { status: 400 },
    );
  }
  if (trimmed.length > MAX_SITUATION_LENGTH) {
    return NextResponse.json(
      {
        error: `Situation must be at most ${MAX_SITUATION_LENGTH} characters.`,
      },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await generatePlanFromSituation({
      situation: trimmed,
      locale,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Upstream model request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!result.ok) {
    const status =
      result.error.includes("OPENAI_API_KEY") ||
      result.error.includes("missing OPENAI_API_KEY")
        ? 503
        : 502;
    return NextResponse.json({ error: result.error }, { status });
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await savePlan({
    id,
    situation: trimmed,
    createdAt,
    steps: result.steps,
  });

  return NextResponse.json({ id, steps: result.steps });
}
