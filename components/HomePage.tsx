"use client";

import { useCallback, useState } from "react";
import {
  PlanTree,
  type ExpandMode,
} from "@/components/plan-tree/PlanTree";
import type { PlanStep } from "@/lib/plan-schema";
import {
  MAX_SITUATION_LENGTH,
  MIN_SITUATION_LENGTH,
} from "@/lib/constants";
import { exportPlanJson, exportPlanMarkdown } from "@/lib/export-plan";

type ListItem = {
  id: string;
  situationPreview: string;
  createdAt: string;
};

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function HomePage({ initialHistory }: { initialHistory: ListItem[] }) {
  const [situation, setSituation] = useState("");
  const [steps, setSteps] = useState<PlanStep[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ListItem[]>(initialHistory);
  const [expandMode, setExpandMode] = useState<ExpandMode>("default");
  const [treeKey, setTreeKey] = useState(0);

  const trimmed = situation.trim();
  const validLength =
    trimmed.length >= MIN_SITUATION_LENGTH &&
    situation.length <= MAX_SITUATION_LENGTH;

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/plans");
      if (!res.ok) return;
      const data = (await res.json()) as { plans: ListItem[] };
      setHistory(data.plans);
    } catch {
      // offline / unexpected — ignore list refresh failures
    }
  }, []);

  async function onGenerate() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situation }),
      });
      const data: unknown = await res.json();
      const message =
        typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof (data as { error: unknown }).error === "string"
          ? (data as { error: string }).error
          : "Request failed.";

      if (!res.ok) {
        setError(message);
        return;
      }

      if (
        typeof data !== "object" ||
        data === null ||
        !("steps" in data) ||
        !("id" in data)
      ) {
        setError("Unexpected server response.");
        return;
      }

      setSteps((data as { steps: PlanStep[] }).steps);
      setActiveId((data as { id: string }).id);
      setExpandMode("default");
      setTreeKey((k) => k + 1);
      await refreshHistory();
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  async function loadPlan(id: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/plans/${encodeURIComponent(id)}`);
      const data: unknown = await res.json();
      const message =
        typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof (data as { error: unknown }).error === "string"
          ? (data as { error: string }).error
          : "Not found.";

      if (!res.ok) {
        setError(message);
        return;
      }

      if (
        typeof data !== "object" ||
        data === null ||
        !("situation" in data) ||
        !("steps" in data) ||
        !("id" in data)
      ) {
        setError("Unexpected server response.");
        return;
      }

      const record = data as {
        id: string;
        situation: string;
        steps: PlanStep[];
      };
      setSituation(record.situation);
      setSteps(record.steps);
      setActiveId(record.id);
      setExpandMode("default");
      setTreeKey((k) => k + 1);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  function applyExpandMode(mode: ExpandMode) {
    setExpandMode(mode);
    setTreeKey((k) => k + 1);
  }

  const exportPayload = { situation: trimmed, steps };

  return (
    <div className="min-h-full bg-zinc-950 text-zinc-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 lg:flex-row lg:gap-10">
        <section className="flex-1 space-y-6">
          <header className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-400">
              Next Steps Agent
            </p>
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-white">
              Turn a messy situation into a three-level plan.
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
              Describe what you’re facing. You’ll get up to five priorities, each
              expanded into substeps and concrete tasks—shown as an interactive
              tree. Estimates are rough guides.
            </p>
          </header>

          <div className="space-y-3">
            <label
              htmlFor="situation"
              className="text-sm font-medium text-zinc-200"
            >
              Situation
            </label>
            <textarea
              id="situation"
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
              rows={8}
              maxLength={MAX_SITUATION_LENGTH}
              placeholder="Example: I’m switching careers into UX within 6 months while working full-time…"
              className="w-full resize-y rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm leading-relaxed text-zinc-50 outline-none ring-sky-500/40 placeholder:text-zinc-600 focus:border-sky-500/60 focus:ring-2"
              disabled={loading}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
              <span>
                {trimmed.length < MIN_SITUATION_LENGTH ? (
                  <>
                    Need at least {MIN_SITUATION_LENGTH} characters (after
                    trimming).
                  </>
                ) : (
                  <>Looks good to generate.</>
                )}
              </span>
              <span className="tabular-nums">
                {situation.length}/{MAX_SITUATION_LENGTH}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void onGenerate()}
              disabled={loading || !validLength}
              className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-sky-900/40 hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {loading ? "Generating…" : "Generate plan"}
            </button>
            <button
              type="button"
              onClick={() => applyExpandMode("all")}
              disabled={steps.length === 0}
              className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={() => applyExpandMode("none")}
              disabled={steps.length === 0}
              className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Collapse all
            </button>
            <button
              type="button"
              onClick={() => applyExpandMode("default")}
              disabled={steps.length === 0}
              className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reset view
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={steps.length === 0}
              onClick={() =>
                downloadTextFile(
                  "plan.json",
                  exportPlanJson(exportPayload),
                  "application/json",
                )
              }
              className="rounded-lg border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Download JSON
            </button>
            <button
              type="button"
              disabled={steps.length === 0}
              onClick={() =>
                downloadTextFile(
                  "plan.md",
                  exportPlanMarkdown(exportPayload),
                  "text/markdown",
                )
              }
              className="rounded-lg border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Download Markdown
            </button>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-100"
            >
              {error}
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-200">Plan tree</h2>
              {activeId ? (
                <span className="text-xs tabular-nums text-zinc-500">
                  Saved id: {activeId}
                </span>
              ) : null}
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
              <PlanTree
                steps={steps}
                expandMode={expandMode}
                treeKey={treeKey}
              />
            </div>
          </div>
        </section>

        <aside className="w-full shrink-0 space-y-3 lg:w-80">
          <h2 className="text-sm font-semibold text-zinc-200">Recent plans</h2>
          <p className="text-xs leading-relaxed text-zinc-500">
            Stored locally under{" "}
            <code className="rounded bg-zinc-900 px-1 py-0.5 text-[11px] text-zinc-300">
              data/plans/
            </code>{" "}
            (gitignored).
          </p>
          <div className="space-y-2">
            {history.length === 0 ? (
              <p className="text-sm text-zinc-500">No saved plans yet.</p>
            ) : (
              history.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void loadPlan(item.id)}
                  disabled={loading}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition hover:bg-zinc-900 disabled:opacity-50 ${
                    item.id === activeId
                      ? "border-sky-700 bg-sky-950/30"
                      : "border-zinc-800 bg-zinc-950/40"
                  }`}
                >
                  <div className="line-clamp-2 text-zinc-100">
                    {item.situationPreview}
                  </div>
                  <div className="mt-1 text-[11px] tabular-nums text-zinc-500">
                    {new Date(item.createdAt).toLocaleString()}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
