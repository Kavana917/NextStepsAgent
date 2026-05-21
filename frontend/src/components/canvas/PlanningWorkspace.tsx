import { useCallback, useEffect, useMemo, useState } from "react";
import { InspectorPanel } from "@/components/canvas/InspectorPanel";
import { PlanMindMap } from "@/components/plan-mindmap/PlanMindMap";
import type { ExpandMode } from "@/components/plan-tree/PlanTree";
import {
  emptyDocument,
  findStepById,
  hasSituationNode,
  type CanvasDocument,
} from "@/lib/canvas-document";
import {
  generatePlanStream,
  type GenerateProgressUpdate,
} from "@/lib/generate-plan-stream";
import { exportPlanJson, exportPlanMarkdown } from "@/lib/export-plan";
import {
  buildPropertiesPayload,
  createEmptyPropertyState,
  createEmptyRow,
  rowsFromSavedProperties,
  rowsFromSuggestions,
  type PropertyRow,
} from "@/lib/plan-properties";
import {
  buildStepPatchPayload,
  stepToEditDraft,
  validateStepEditDraft,
  type StepEditDraft,
} from "@/lib/step-editor";
import { useWorkspaceSession } from "@/context/WorkspaceSessionContext";
import type {
  DetailLevel,
  ListItem,
  PlanProperty,
  PlanStep,
  SelectionTarget,
} from "@/lib/plan-types";

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

function formatSavedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())} UTC`;
}

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

export function PlanningWorkspace() {
  const { startNewPlan } = useWorkspaceSession();
  const [doc, setDoc] = useState<CanvasDocument>(emptyDocument);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ListItem[]>([]);
  const [openMenu, setOpenMenu] = useState(false);
  const [expandMode] = useState<ExpandMode>("default");
  const [treeKey, setTreeKey] = useState(0);

  const [rootPropertiesEnabled, setRootPropertiesEnabled] = useState(
    () => createEmptyPropertyState().enabled,
  );
  const [rootPropertyRows, setRootPropertyRows] = useState<PropertyRow[]>(
    () => createEmptyPropertyState().rows,
  );
  const [stepPropertyRows, setStepPropertyRows] = useState<PropertyRow[]>([]);
  const [stepEditDraft, setStepEditDraft] = useState<StepEditDraft | null>(null);
  const [extraExpandedIds, setExtraExpandedIds] = useState<string[]>([]);
  const [generateProgress, setGenerateProgress] =
    useState<GenerateProgressUpdate | null>(null);

  const showSituation = hasSituationNode(doc);
  const showEmptyAdd = !showSituation;

  const selectedStepId =
    doc.selection?.kind === "step"
      ? doc.selection.stepId
      : doc.selection?.kind === "add-before" ||
          doc.selection?.kind === "expand-leaf"
        ? doc.selection.stepId
        : undefined;

  const selectedStep = selectedStepId
    ? findStepById(doc.steps, selectedStepId)
    : undefined;

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/plans");
      if (!res.ok) return;
      const data = (await res.json()) as { plans: ListItem[] };
      setHistory(data.plans);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    if (!selectedStep) {
      setStepPropertyRows([]);
      setStepEditDraft(null);
      return;
    }
    const restored = rowsFromSavedProperties(selectedStep.properties ?? []);
    setStepPropertyRows(
      restored.rows.length > 0 ? restored.rows : [createEmptyRow()],
    );
    if (doc.selection?.kind === "step") {
      setStepEditDraft(stepToEditDraft(selectedStep));
    }
  }, [selectedStepId, selectedStep?.id, doc.selection?.kind]);

  const rootLabel = useMemo(() => {
    const t = doc.situation.trim();
    if (!t) return "Situation";
    return t.length > 72 ? `${t.slice(0, 69)}…` : t;
  }, [doc.situation]);

  async function onSaveSituation() {
    setError(null);
    setLoading(true);
    try {
      const trimmed = doc.situation.trim();
      setDoc((d) => ({
        ...d,
        situation: trimmed,
        situationSaved: true,
        selection: { kind: "situation" },
      }));

      const res = await fetch("/api/plans/suggest-properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situation: trimmed }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        setError(parseError(data, "Could not suggest properties."));
        setRootPropertiesEnabled(true);
        if (rootPropertyRows.length === 0) {
          setRootPropertyRows([createEmptyRow()]);
        }
        return;
      }

      const suggestions = (data as { suggestions: PlanProperty[] }).suggestions;
      if (suggestions?.length) {
        setRootPropertyRows(rowsFromSuggestions(suggestions));
        setRootPropertiesEnabled(true);
      } else {
        setRootPropertiesEnabled(true);
        setRootPropertyRows([createEmptyRow()]);
      }

      if (doc.planId) {
        await fetch(`/api/plans/${encodeURIComponent(doc.planId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            situation: trimmed,
            detailLevel: doc.detailLevel,
          }),
        });
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  async function onGeneratePlan() {
    setError(null);
    const propsPayload = buildPropertiesPayload(
      rootPropertiesEnabled,
      rootPropertyRows,
    );
    if (rootPropertiesEnabled && propsPayload.length === 0) {
      setError("Add at least one planning field with a value.");
      return;
    }

    setLoading(true);
    setGenerateProgress({
      phase: "start",
      message: "Starting plan generation…",
      percent: 0,
    });
    try {
      const result = await generatePlanStream(
        {
          situation: doc.situation,
          properties: propsPayload,
          detailLevel: doc.detailLevel,
        },
        {
          onProgress: setGenerateProgress,
        },
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setDoc((d) => ({
        ...d,
        planId: result.id,
        steps: result.steps,
        rootProperties: result.properties ?? propsPayload,
        selection: { kind: "situation" },
      }));
      setTreeKey((k) => k + 1);
      await refreshHistory();
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
      setGenerateProgress(null);
    }
  }

  async function onSaveStepEdit() {
    if (!selectedStepId || !selectedStep || !doc.planId || !stepEditDraft) {
      setError("Select a step to edit.");
      return;
    }
    const validationError = validateStepEditDraft(stepEditDraft, selectedStep);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/plans/${encodeURIComponent(doc.planId)}/steps/${encodeURIComponent(selectedStepId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildStepPatchPayload(stepEditDraft, selectedStep)),
        },
      );
      const data: unknown = await res.json();
      if (!res.ok) {
        setError(parseError(data, "Save failed."));
        return;
      }

      const updated = data as { steps: PlanStep[] };
      const fresh = findStepById(updated.steps, selectedStepId);
      setDoc((d) => ({ ...d, steps: updated.steps }));
      if (fresh) setStepEditDraft(stepToEditDraft(fresh));
      setTreeKey((k) => k + 1);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  async function onGenerateSubsteps() {
    if (!selectedStepId || !doc.planId) {
      setError("Select a task to expand.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/plans/${encodeURIComponent(doc.planId)}/steps/${encodeURIComponent(selectedStepId)}/expand-substeps`,
        { method: "POST" },
      );
      const data: unknown = await res.json();
      if (!res.ok) {
        setError(parseError(data, "Sub-step generation failed."));
        return;
      }

      const updated = data as { steps: PlanStep[] };
      setDoc((d) => ({
        ...d,
        steps: updated.steps,
        selection: { kind: "step", stepId: selectedStepId },
      }));
      setExtraExpandedIds([selectedStepId]);
      setTreeKey((k) => k + 1);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  async function onSaveStepContext() {
    if (!selectedStepId || !doc.planId) {
      setError("Generate a plan first before editing step context.");
      return;
    }
    const propsPayload = buildPropertiesPayload(true, stepPropertyRows);
    if (propsPayload.length === 0) {
      setError("Add at least one planning field with a value.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/plans/${encodeURIComponent(doc.planId)}/apply-step-context`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stepId: selectedStepId,
            properties: propsPayload,
          }),
        },
      );
      const data: unknown = await res.json();
      if (!res.ok) {
        setError(parseError(data, "Step update failed."));
        return;
      }

      const updated = data as { steps: PlanStep[] };
      setDoc((d) => ({
        ...d,
        steps: updated.steps,
        selection: selectedStepId
          ? { kind: "step", stepId: selectedStepId }
          : d.selection,
      }));
      setTreeKey((k) => k + 1);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  async function loadPlan(id: string) {
    setError(null);
    setLoading(true);
    setOpenMenu(false);
    try {
      const res = await fetch(`/api/plans/${encodeURIComponent(id)}`);
      const data: unknown = await res.json();
      if (!res.ok) {
        setError(parseError(data, "Not found."));
        return;
      }

      const record = data as {
        id: string;
        situation: string;
        steps: PlanStep[];
        properties?: PlanProperty[];
        detailLevel?: string;
      };
      const detailLevel =
        record.detailLevel === "low" ||
        record.detailLevel === "high" ||
        record.detailLevel === "medium"
          ? record.detailLevel
          : "medium";
      const props = record.properties ?? [];
      const restored = rowsFromSavedProperties(props);
      setDoc({
        planId: record.id,
        situation: record.situation,
        situationSaved: true,
        detailLevel,
        rootProperties: props,
        steps: record.steps,
        selection: { kind: "situation" },
      });
      setRootPropertiesEnabled(restored.enabled);
      setRootPropertyRows(restored.rows);
      setTreeKey((k) => k + 1);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  async function onDeletePlan(id: string) {
    const preview =
      history.find((h) => h.id === id)?.situationPreview ?? "this plan";
    if (!window.confirm(`Delete this plan?\n\n"${preview}"`)) return;

    setError(null);
    try {
      const res = await fetch(`/api/plans/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data: unknown = await res.json();
        setError(parseError(data, "Could not delete."));
        return;
      }
      setHistory((prev) => prev.filter((p) => p.id !== id));
      if (doc.planId === id) {
        setDoc(emptyDocument());
        setRootPropertiesEnabled(false);
        setRootPropertyRows([]);
      }
    } catch {
      setError("Network error while deleting.");
    }
  }

  const exportPayload = {
    situation: doc.situation.trim(),
    steps: doc.steps,
    properties: doc.rootProperties,
  };

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-950/90 px-3 py-2">
          <h1 className="text-sm font-semibold text-zinc-100">Planning canvas</h1>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenMenu((o) => !o)}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
              >
                Open / Recent
              </button>
              {openMenu ? (
                <div className="absolute right-0 z-20 mt-1 max-h-64 w-72 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
                  {history.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-zinc-500">
                      No saved plans yet.
                    </p>
                  ) : (
                    history.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-1 border-b border-zinc-800/80 last:border-0"
                      >
                        <button
                          type="button"
                          onClick={() => void loadPlan(item.id)}
                          className="min-w-0 flex-1 px-3 py-2 text-left text-xs hover:bg-zinc-800"
                        >
                          <span className="line-clamp-2 text-zinc-100">
                            {item.situationPreview}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-zinc-500">
                            {formatSavedAt(item.createdAt)}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeletePlan(item.id)}
                          className="shrink-0 px-2 text-[10px] text-rose-400 hover:text-rose-300"
                        >
                          Del
                        </button>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                void refreshHistory();
                startNewPlan();
              }}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-900"
              title="Start a new plan (current saved plan stays in Open / Recent)"
            >
              New
            </button>
            <button
              type="button"
              disabled={doc.steps.length === 0}
              onClick={() =>
                downloadTextFile(
                  "plan.json",
                  exportPlanJson(exportPayload),
                  "application/json",
                )
              }
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
            >
              JSON
            </button>
            <button
              type="button"
              disabled={doc.steps.length === 0}
              onClick={() =>
                downloadTextFile(
                  "plan.md",
                  exportPlanMarkdown(exportPayload),
                  "text/markdown",
                )
              }
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
            >
              Markdown
            </button>
            {doc.planId ? (
              <span className="text-[10px] tabular-nums text-zinc-600">
                {doc.planId.slice(0, 8)}…
              </span>
            ) : null}
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          <PlanMindMap
            steps={doc.steps}
            expandMode={expandMode}
            treeKey={treeKey}
            rootLabel={rootLabel}
            rootDescription={doc.situation.trim() || "Describe your situation."}
            showSituation={showSituation}
            showEmptyAdd={showEmptyAdd}
            selection={doc.selection}
            onSelect={(target: SelectionTarget) =>
              setDoc((d) => ({ ...d, selection: target }))
            }
            extraExpandedIds={extraExpandedIds}
          />
        </div>
      </div>

      <InspectorPanel
        selection={doc.selection}
        situation={doc.situation}
        situationSaved={doc.situationSaved}
        detailLevel={doc.detailLevel}
        onDetailLevelChange={(level: DetailLevel) =>
          setDoc((d) => {
            const next = { ...d, detailLevel: level };
            if (d.planId) {
              void fetch(`/api/plans/${encodeURIComponent(d.planId)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ detailLevel: level }),
              });
            }
            return next;
          })
        }
        onSituationChange={(value) =>
          setDoc((d) => ({ ...d, situation: value }))
        }
        rootPropertiesEnabled={rootPropertiesEnabled}
        onRootPropertiesEnabledChange={setRootPropertiesEnabled}
        rootPropertyRows={rootPropertyRows}
        onRootPropertyRowsChange={setRootPropertyRows}
        step={selectedStep}
        stepPropertyRows={stepPropertyRows}
        onStepPropertyRowsChange={setStepPropertyRows}
        loading={loading}
        generateProgress={generateProgress}
        error={error}
        onSaveSituation={() => void onSaveSituation()}
        onGeneratePlan={() => void onGeneratePlan()}
        onSaveStepContext={() => void onSaveStepContext()}
        stepEditDraft={
          doc.selection?.kind === "step" ? stepEditDraft : null
        }
        onStepEditDraftChange={setStepEditDraft}
        onSaveStepEdit={() => void onSaveStepEdit()}
        onGenerateSubsteps={() => void onGenerateSubsteps()}
      />
    </div>
  );
}
