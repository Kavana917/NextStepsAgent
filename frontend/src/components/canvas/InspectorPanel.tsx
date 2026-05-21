import { PlanPropertiesEditor } from "@/components/PlanPropertiesEditor";
import { PlanDetailSelector } from "@/components/canvas/PlanDetailSelector";
import { ResizableInspector } from "@/components/canvas/ResizableInspector";
import { StepEditorForm } from "@/components/canvas/StepEditorForm";
import { formatEstimatedMinutes } from "@/components/plan-tree/format-estimated";
import { canExpandLeafIntoSubsteps } from "@/lib/plan-step-utils";
import {
  validateStepEditDraft,
  type StepEditDraft,
} from "@/lib/step-editor";
import {
  MAX_SITUATION_LENGTH,
  MIN_SITUATION_LENGTH,
} from "@/lib/constants";
import {
  buildPropertiesPayload,
  createEmptyRow,
  type PropertyRow,
} from "@/lib/plan-properties";
import { PlanGenerationProgress } from "@/components/canvas/PlanGenerationProgress";
import type { GenerateProgressUpdate } from "@/lib/generate-plan-stream";
import type { DetailLevel, PlanStep, SelectionTarget } from "@/lib/plan-types";

type InspectorPanelProps = {
  selection: SelectionTarget;
  situation: string;
  situationSaved: boolean;
  detailLevel: DetailLevel;
  onDetailLevelChange: (level: DetailLevel) => void;
  onSituationChange: (value: string) => void;
  rootPropertiesEnabled: boolean;
  onRootPropertiesEnabledChange: (on: boolean) => void;
  rootPropertyRows: PropertyRow[];
  onRootPropertyRowsChange: (rows: PropertyRow[]) => void;
  step: PlanStep | undefined;
  stepPropertyRows: PropertyRow[];
  onStepPropertyRowsChange: (rows: PropertyRow[]) => void;
  loading: boolean;
  generateProgress: GenerateProgressUpdate | null;
  error: string | null;
  onSaveSituation: () => void;
  onGeneratePlan: () => void;
  onSaveStepContext: () => void;
  stepEditDraft: StepEditDraft | null;
  onStepEditDraftChange: (draft: StepEditDraft) => void;
  onSaveStepEdit: () => void;
  onGenerateSubsteps: () => void;
};

function InspectorHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
      <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">{subtitle}</p>
    </div>
  );
}

function InspectorBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
      {children}
    </div>
  );
}

export function InspectorPanel(props: InspectorPanelProps) {
  const {
    selection,
    situation,
    situationSaved,
    detailLevel,
    onDetailLevelChange,
    onSituationChange,
    rootPropertiesEnabled,
    onRootPropertiesEnabledChange,
    rootPropertyRows,
    onRootPropertyRowsChange,
    step,
    stepPropertyRows,
    onStepPropertyRowsChange,
    loading,
    generateProgress,
    error,
    onSaveSituation,
    onGeneratePlan,
    onSaveStepContext,
    stepEditDraft,
    onStepEditDraftChange,
    onSaveStepEdit,
    onGenerateSubsteps,
  } = props;

  const trimmed = situation.trim();
  const validSituation =
    trimmed.length >= MIN_SITUATION_LENGTH &&
    situation.length <= MAX_SITUATION_LENGTH;

  const isSituation =
    selection?.kind === "situation" ||
    selection?.kind === "add-root" ||
    (!selection && !situationSaved);

  const isBranchContext = selection?.kind === "add-before";
  const isExpandLeaf = selection?.kind === "expand-leaf";
  const isStepBody = selection?.kind === "step";

  if (!selection && !situationSaved) {
    return (
      <ResizableInspector>
        <InspectorHeader
          title="Inspector"
          subtitle="Click the + on the canvas to add a situation node."
        />
      </ResizableInspector>
    );
  }

  if (isSituation) {
    return (
      <ResizableInspector>
        <InspectorHeader
          title="Situation"
          subtitle="Describe what you need a plan for."
        />
        <InspectorBody>
          <div className="space-y-2">
            <label
              htmlFor="inspector-situation"
              className="text-xs font-medium text-zinc-300"
            >
              Situation
            </label>
            <textarea
              id="inspector-situation"
              value={situation}
              onChange={(e) => onSituationChange(e.target.value)}
              rows={8}
              maxLength={MAX_SITUATION_LENGTH}
              disabled={loading}
              placeholder="Example: I'm switching careers into UX within 6 months…"
              className="w-full min-h-[10rem] resize-y rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-sm leading-relaxed text-zinc-50 outline-none placeholder:text-zinc-600 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/30"
            />
            <p className="text-[11px] text-zinc-500 tabular-nums">
              {situation.length}/{MAX_SITUATION_LENGTH}
            </p>
          </div>

          <button
            type="button"
            onClick={onSaveSituation}
            disabled={loading || !validSituation}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save situation
          </button>

          {situationSaved ? (
            <>
              <PlanDetailSelector
                value={detailLevel}
                onChange={onDetailLevelChange}
                disabled={loading}
              />

              <PlanPropertiesEditor
                enabled={rootPropertiesEnabled}
                onEnabledChange={(on) => {
                  onRootPropertiesEnabledChange(on);
                  if (on && rootPropertyRows.length === 0) {
                    onRootPropertyRowsChange([createEmptyRow()]);
                  }
                }}
                rows={rootPropertyRows}
                onRowsChange={onRootPropertyRowsChange}
                disabled={loading}
              />

              <button
                type="button"
                onClick={onGeneratePlan}
                disabled={
                  loading ||
                  !validSituation ||
                  (rootPropertiesEnabled &&
                    buildPropertiesPayload(
                      rootPropertiesEnabled,
                      rootPropertyRows,
                    ).length === 0)
                }
                className="w-full rounded-lg bg-sky-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                {loading ? "Generating…" : "Generate plan"}
              </button>
              {loading ? (
                <>
                  <PlanGenerationProgress progress={generateProgress} />
                  <p className="text-xs leading-relaxed text-zinc-500">
                    Keep this tab open while generation runs. High detail can
                    take several minutes.
                  </p>
                </>
              ) : null}
            </>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-100"
            >
              {error}
            </div>
          ) : null}
        </InspectorBody>
      </ResizableInspector>
    );
  }

  if (isStepBody && step && stepEditDraft) {
    const validationError = validateStepEditDraft(stepEditDraft, step);
    const showExpandHint = canExpandLeafIntoSubsteps(step);
    return (
      <ResizableInspector>
        <InspectorHeader
          title="Edit step"
          subtitle="Change this node’s content and save to the plan."
        />
        <InspectorBody>
          <StepEditorForm
            step={step}
            draft={stepEditDraft}
            onDraftChange={onStepEditDraftChange}
            disabled={loading}
          />

          <button
            type="button"
            onClick={onSaveStepEdit}
            disabled={loading || validationError !== null}
            className="w-full rounded-lg bg-sky-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {loading ? "Saving…" : "Save step"}
          </button>

          {showExpandHint ? (
            <p className="text-xs leading-relaxed text-zinc-500">
              Use the <strong className="text-zinc-400">+</strong> on this task in
              the canvas to generate sub-steps.
            </p>
          ) : null}

          {validationError ? (
            <p className="text-xs text-amber-200/90">{validationError}</p>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-100"
            >
              {error}
            </div>
          ) : null}
        </InspectorBody>
      </ResizableInspector>
    );
  }

  if (isExpandLeaf && step) {
    return (
      <ResizableInspector>
        <InspectorHeader
          title="Break down task"
          subtitle="Split this actionable step into more detailed sub-steps."
        />
        <InspectorBody>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
            <p className="text-sm font-medium text-zinc-100">{step.title}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
              {step.description}
            </p>
            <p className="mt-2 text-[11px] tabular-nums text-zinc-500">
              ~{formatEstimatedMinutes(step.estimatedMinutes)} — sub-steps will
              share this time budget
            </p>
          </div>

          <p className="text-xs leading-relaxed text-zinc-500">
            The parent task becomes a summary; new actionable sub-steps appear
            underneath. Small atomic tasks do not show a + button.
          </p>

          <button
            type="button"
            onClick={onGenerateSubsteps}
            disabled={loading}
            className="w-full rounded-lg bg-sky-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {loading ? "Generating…" : "Generate sub-steps"}
          </button>

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-100"
            >
              {error}
            </div>
          ) : null}
        </InspectorBody>
      </ResizableInspector>
    );
  }

  if (isBranchContext && step) {
    const filled = buildPropertiesPayload(true, stepPropertyRows).length;
    return (
      <ResizableInspector>
        <InspectorHeader
          title="Step context"
          subtitle="Planning context for a branch (has sub-steps). Updates that step’s text only."
        />
        <InspectorBody>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
            <p className="text-sm font-medium text-zinc-100">{step.title}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
              {step.description}
            </p>
          </div>

          <PlanPropertiesEditor
            enabled
            alwaysOn
            onEnabledChange={() => {}}
            rows={stepPropertyRows}
            onRowsChange={onStepPropertyRowsChange}
            disabled={loading}
            heading="Planning context for this step"
            subheading="Time limits apply to this step itself (actionable tasks) or its summary text (branches)"
          />

          <button
            type="button"
            onClick={onSaveStepContext}
            disabled={loading || filled === 0}
            className="w-full rounded-lg bg-sky-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {loading ? "Updating…" : "Save & update step"}
          </button>

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-100"
            >
              {error}
            </div>
          ) : null}
        </InspectorBody>
      </ResizableInspector>
    );
  }

  return (
    <ResizableInspector>
      <InspectorHeader
        title="Inspector"
        subtitle="Select a node on the canvas to edit."
      />
    </ResizableInspector>
  );
}
