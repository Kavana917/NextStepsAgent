import { NextResponse } from "next/server";
import { listPlansMeta } from "@/lib/plan-store";

export async function GET() {
  const plans = await listPlansMeta();
  return NextResponse.json({ plans });
}
