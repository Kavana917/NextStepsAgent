import { NextResponse } from "next/server";
import { getPlan } from "@/lib/plan-store";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const plan = await getPlan(id);
  if (!plan) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json(plan);
}
