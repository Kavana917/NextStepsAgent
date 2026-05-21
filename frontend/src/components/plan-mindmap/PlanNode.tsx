import { Handle, Position, type NodeProps } from "@xyflow/react";
import { PriorityBadge } from "@/components/plan-tree/PriorityBadge";
import { formatEstimatedMinutes } from "@/components/plan-tree/format-estimated";
import { ADD_NODE_SIZE, NODE_CARD_WIDTH } from "@/components/plan-mindmap/constants";
import type { PlanNodeData } from "@/components/plan-mindmap/mindmap-layout";

function depthStyle(depth: number, isActionable: boolean): string {
  if (isActionable) {
    return "border-sky-500/70 bg-sky-950/80 shadow-sky-900/40";
  }
  if (depth === 0) {
    return "border-violet-500/50 bg-violet-950/80 shadow-violet-900/30";
  }
  if (depth === 1) {
    return "border-zinc-600/60 bg-zinc-800/90 shadow-black/40";
  }
  if (depth === 2) {
    return "border-emerald-700/50 bg-emerald-950/70 shadow-emerald-950/30";
  }
  return "border-zinc-700/50 bg-zinc-900/80 shadow-black/30";
}

export type PlanNodeCallbacks = {
  onAddButtonClick?: () => void;
  addButtonMode?: "context" | "expand";
};

export function PlanNode({ data, selected }: NodeProps) {
  const d = data as PlanNodeData & PlanNodeCallbacks;

  return (
    <div className="flex items-center" style={{ minHeight: 76 }}>
      <Handle
        type="target"
        position={Position.Left}
        className="!top-1/2 !-translate-y-1/2 !h-2 !w-2 !border-0 !bg-zinc-500"
      />

      {d.showAddButton ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            d.onAddButtonClick?.();
          }}
          className={`mr-2 flex shrink-0 items-center justify-center rounded-full border-2 border-dashed text-base font-light leading-none transition ${
            d.contextActive
              ? "border-sky-400 bg-sky-950/90 text-sky-300"
              : "border-zinc-600 bg-zinc-900/90 text-zinc-300 hover:border-sky-500/50 hover:text-sky-300"
          }`}
          style={{ width: ADD_NODE_SIZE, height: ADD_NODE_SIZE }}
          aria-label={
            d.addButtonMode === "expand"
              ? "Break this task into sub-steps"
              : "Edit planning context for this step"
          }
          title={
            d.addButtonMode === "expand"
              ? "Generate sub-steps"
              : "Planning context"
          }
        >
          +
        </button>
      ) : null}

      <div
        className={`flex flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-left shadow-lg ${depthStyle(
          d.depth,
          Boolean(d.isActionable),
        )} ${selected ? "ring-2 ring-sky-400/80" : ""}`}
        style={{ width: NODE_CARD_WIDTH }}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 text-sm font-semibold leading-snug text-white">
            {d.title}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {d.isActionable ? (
              <span className="rounded bg-sky-600/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                Action
              </span>
            ) : null}
            {d.hasImplementationGuide ? (
              <span
                className="text-[10px] text-sky-300"
                title="Has implementation guide"
                aria-hidden
              >
                ✓
              </span>
            ) : null}
            {d.hasContext ? (
              <span
                className="h-2 w-2 rounded-full bg-amber-400"
                title="Has planning context"
              />
            ) : null}
            {d.hasChildren ? (
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-black/30 text-xs text-zinc-200"
                aria-hidden
              >
                {d.expanded ? "‹" : "›"}
              </span>
            ) : null}
          </div>
        </div>
        {d.priority ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority={d.priority} />
            {d.estimatedMinutes != null ? (
              <span className="text-[10px] tabular-nums text-zinc-400">
                ~{formatEstimatedMinutes(d.estimatedMinutes)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!top-1/2 !-translate-y-1/2 !h-2 !w-2 !border-0 !bg-zinc-400"
      />
    </div>
  );
}
