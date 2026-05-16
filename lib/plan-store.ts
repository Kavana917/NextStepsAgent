import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { PlanStep } from "@/lib/plan-schema";

export type SavedPlan = {
  id: string;
  situation: string;
  createdAt: string;
  steps: PlanStep[];
};

const PLANS_DIR = path.join(process.cwd(), "data", "plans");

async function ensurePlansDir() {
  await mkdir(PLANS_DIR, { recursive: true });
}

export async function savePlan(record: SavedPlan): Promise<void> {
  await ensurePlansDir();
  const file = path.join(PLANS_DIR, `${record.id}.json`);
  await writeFile(file, JSON.stringify(record, null, 2), "utf8");
}

export async function getPlan(id: string): Promise<SavedPlan | null> {
  await ensurePlansDir();
  const safeId = path.basename(id);
  if (safeId !== id) return null;
  try {
    const raw = await readFile(path.join(PLANS_DIR, `${safeId}.json`), "utf8");
    return JSON.parse(raw) as SavedPlan;
  } catch {
    return null;
  }
}

export type PlanListItem = {
  id: string;
  situationPreview: string;
  createdAt: string;
};

export async function listPlansMeta(limit = 50): Promise<PlanListItem[]> {
  await ensurePlansDir();
  let names: string[];
  try {
    names = await readdir(PLANS_DIR);
  } catch {
    return [];
  }

  const jsonFiles = names.filter((n) => n.endsWith(".json"));
  const items: PlanListItem[] = [];

  for (const name of jsonFiles) {
    try {
      const raw = await readFile(path.join(PLANS_DIR, name), "utf8");
      const parsed = JSON.parse(raw) as Partial<SavedPlan>;
      if (
        typeof parsed.id === "string"
        && typeof parsed.situation === "string"
        && typeof parsed.createdAt === "string"
      ) {
        const preview =
          parsed.situation.length > 120
            ? `${parsed.situation.slice(0, 117)}...`
            : parsed.situation;
        items.push({
          id: parsed.id,
          situationPreview: preview,
          createdAt: parsed.createdAt,
        });
      }
    } catch {
      // skip corrupt entries
    }
  }

  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return items.slice(0, limit);
}
