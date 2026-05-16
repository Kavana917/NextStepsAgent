import { NextResponse } from "next/server";
import { deletePlan, getPlan } from "@/lib/plan-store";

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

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const removed = await deletePlan(id);
  if (!removed) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
