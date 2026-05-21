import { formatEstimatedMinutes } from "@/components/plan-tree/format-estimated";
import {
  stepHasChildren,
  type StepEditDraft,
} from "@/lib/step-editor";
import { isActionableLeaf } from "@/lib/plan-step-utils";
import { PRIORITIES, type PlanStep, type Priority } from "@/lib/plan-types";

const inputClass =
  "w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-50 outline-none placeholder:text-zinc-600 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/30 disabled:cursor-not-allowed disabled:opacity-50";

const labelClass = "text-xs font-medium text-zinc-300";

type StepEditorFormProps = {
  step: PlanStep;
  draft: StepEditDraft;
  onDraftChange: (draft: StepEditDraft) => void;
  disabled?: boolean;
};

export function StepEditorForm({
  step,
  draft,
  onDraftChange,
  disabled,
}: StepEditorFormProps) {
  const hasChildren = stepHasChildren(step);
  const isLeaf = isActionableLeaf(step) && !hasChildren;
  const childCount = step.children?.length ?? 0;

  function patch(partial: Partial<StepEditDraft>) {
    onDraftChange({ ...draft, ...partial });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="step-edit-title" className={labelClass}>
          Title
        </label>
        <input
          id="step-edit-title"
          type="text"
          maxLength={200}
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
          disabled={disabled}
          className={inputClass}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="step-edit-priority" className={labelClass}>
          Priority
        </label>
        <select
          id="step-edit-priority"
          value={draft.priority}
          onChange={(e) => patch({ priority: e.target.value as Priority })}
          disabled={disabled}
          className={inputClass}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor="step-edit-description" className={labelClass}>
          Description
        </label>
        <textarea
          id="step-edit-description"
          rows={4}
          maxLength={4000}
          value={draft.description}
          onChange={(e) => patch({ description: e.target.value })}
          disabled={disabled}
          className={`${inputClass} min-h-[5rem] resize-y leading-relaxed`}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="step-edit-minutes" className={labelClass}>
          Estimated minutes
        </label>
        {hasChildren ? (
          <p className="text-sm tabular-nums text-zinc-400">
            ~{formatEstimatedMinutes(step.estimatedMinutes)} total (sum of{" "}
            {childCount} {childCount === 1 ? "child" : "children"} — edit leaf
            steps to change time)
          </p>
        ) : (
          <input
            id="step-edit-minutes"
            type="number"
            min={1}
            max={10080}
            value={draft.estimatedMinutes}
            onChange={(e) => patch({ estimatedMinutes: e.target.value })}
            disabled={disabled}
            className={inputClass}
          />
        )}
      </div>

      {isLeaf ? (
        <>
          <div className="space-y-2">
            <label htmlFor="step-edit-guide" className={labelClass}>
              How to implement
            </label>
            <textarea
              id="step-edit-guide"
              rows={8}
              maxLength={8000}
              value={draft.implementationGuide}
              onChange={(e) => patch({ implementationGuide: e.target.value })}
              disabled={disabled}
              placeholder="Numbered steps, tools, pitfalls…"
              className={`${inputClass} min-h-[8rem] resize-y font-mono text-[13px] leading-relaxed`}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="step-edit-done" className={labelClass}>
              Done when
            </label>
            <textarea
              id="step-edit-done"
              rows={3}
              maxLength={2000}
              value={draft.acceptanceCriteria}
              onChange={(e) => patch({ acceptanceCriteria: e.target.value })}
              disabled={disabled}
              placeholder="Verifiable completion criteria…"
              className={`${inputClass} min-h-[4rem] resize-y leading-relaxed`}
            />
          </div>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-zinc-500">
          This step has sub-steps. Use the <strong className="text-zinc-400">+</strong>{" "}
          before a step to apply planning context, or select a leaf task to edit
          time and implementation details.
        </p>
      )}
    </div>
  );
}
