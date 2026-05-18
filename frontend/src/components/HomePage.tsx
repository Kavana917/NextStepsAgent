import { useCallback, useEffect, useState } from "react";
import { PlanMindMap } from "@/components/plan-mindmap/PlanMindMap";
import type { ExpandMode } from "@/components/plan-tree/PlanTree";
import type { ListItem, PlanStep } from "@/lib/plan-types";
import {
  GENERATE_CLIENT_TIMEOUT_MS,
  MAX_SITUATION_LENGTH,
  MIN_SITUATION_LENGTH,
} from "@/lib/constants";
import { exportPlanJson, exportPlanMarkdown } from "@/lib/export-plan";

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

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Deterministic across Node SSR and browser (avoids `toLocaleString()` hydration mismatches). */
function formatSavedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())} UTC`;
}

export function HomePage() {
  const [situation, setSituation] = useState("");
  const [steps, setSteps] = useState<PlanStep[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ListItem[]>([]);
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

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  async function onGenerate() {
    setError(null);
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      GENERATE_CLIENT_TIMEOUT_MS,
    );
    try {
      const res = await fetch("/api/plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situation }),
        signal: controller.signal,
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
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError(
          "Generation timed out. The full 5×5×5 plan can take 1–3 minutes—try again or use a faster model in .env.",
        );
      } else {
        setError("Network error.");
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  async function onDeletePlan(id: string) {
    const preview =
      history.find((h) => h.id === id)?.situationPreview ?? "this plan";
    if (
      !window.confirm(
        `Delete this saved plan?\n\n"${preview}"\n\nThis removes the file from data/plans/ on your machine.`,
      )
    ) {
      return;
    }

    setError(null);
    try {
      const res = await fetch(`/api/plans/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data: unknown = await res.json();
        const message =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "Could not delete plan.";
        setError(message);
        return;
      }

      setHistory((prev) => prev.filter((item) => item.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setSteps([]);
      }
    } catch {
      setError("Network error while deleting.");
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
              Turn a situation into a three-level plan.
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
              Describe your situation. You get exactly five{" "}
              <strong className="font-medium text-zinc-300">top-level priorities</strong>
              —broad phases, not tiny chores. Each expands into five{" "}
              <strong className="font-medium text-zinc-300">substeps</strong>{" "}
              (concrete work toward that phase), and each substep into five{" "}
              <strong className="font-medium text-zinc-300">execution steps</strong>
              . Read top-down for clarity, bottom-up for progress. Every row shows
              title, description, priority, and a rough time estimate.
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
            {loading ? (
              <p className="w-full text-xs leading-relaxed text-zinc-400">
                Building your plan in stages (5 priorities → 5 substeps each → 5
                tasks each). This usually takes about 1–2 minutes; please keep this
                tab open.
              </p>
            ) : null}
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
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-200">Plan mind map</h2>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-zinc-500">
                  Pan and zoom the canvas. You start with five top-level priorities
                  only—click a node to expand or collapse. Violet = situation, gray
                  = priorities, green = substeps, blue = execution tasks.
                </p>
              </div>
              {activeId ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs tabular-nums text-zinc-500">
                    Saved id: {activeId}
                  </span>
                  <button
                    type="button"
                    onClick={() => void onDeletePlan(activeId)}
                    disabled={loading}
                    className="rounded-md border border-rose-900/50 bg-rose-950/40 px-2 py-0.5 text-xs font-medium text-rose-200 hover:bg-rose-950/70 disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-2 sm:p-3">
              <PlanMindMap
                steps={steps}
                expandMode={expandMode}
                treeKey={treeKey}
                rootLabel={
                  trimmed.length > 72 ? `${trimmed.slice(0, 69)}…` : trimmed || "Situation"
                }
                rootDescription={trimmed || "Describe your situation and generate a plan."}
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
                <div
                  key={item.id}
                  className={`flex gap-2 rounded-lg border p-2 ${
                    item.id === activeId
                      ? "border-sky-700 bg-sky-950/30"
                      : "border-zinc-800 bg-zinc-950/40"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void loadPlan(item.id)}
                    disabled={loading}
                    className="min-w-0 flex-1 rounded-md px-1 py-1 text-left text-sm transition hover:bg-zinc-900/60 disabled:opacity-50"
                  >
                  <div className="line-clamp-2 text-zinc-100">
                    {item.situationPreview}
                  </div>
                  <div className="mt-1 text-[11px] tabular-nums text-zinc-500">
                    {formatSavedAt(item.createdAt)}
                  </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDeletePlan(item.id)}
                    disabled={loading}
                    aria-label={`Delete plan: ${item.situationPreview}`}
                    className="shrink-0 self-center rounded-md border border-rose-900/50 bg-rose-950/40 px-2 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-950/70 disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
