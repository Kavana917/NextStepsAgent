import { HomePage } from "@/components/HomePage";
import { listPlansMeta } from "@/lib/plan-store";

export const dynamic = "force-dynamic";

export default async function Page() {
  const plans = await listPlansMeta();
  return <HomePage initialHistory={plans} />;
}
