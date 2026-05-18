import { Handle, Position, type NodeProps } from "@xyflow/react";
import { PriorityBadge } from "@/components/plan-tree/PriorityBadge";
import { formatEstimatedMinutes } from "@/components/plan-tree/format-estimated";
import type { PlanNodeData } from "@/components/plan-mindmap/mindmap-layout";

const DEPTH_STYLES: Record<PlanNodeData["depth"], string> = {
  0: "border-violet-500/50 bg-violet-950/80 shadow-violet-900/30",
  1: "border-zinc-600/60 bg-zinc-800/90 shadow-black/40",
  2: "border-emerald-700/50 bg-emerald-950/70 shadow-emerald-950/30",
  3: "border-sky-800/50 bg-sky-950/60 shadow-sky-950/20",
};

export function PlanNode({ data, selected }: NodeProps) {
  const d = data as PlanNodeData;

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-zinc-500"
      />
      <div
        className={`flex w-[220px] flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-left shadow-lg ${
          DEPTH_STYLES[d.depth]
        } ${selected ? "ring-2 ring-sky-400/80" : ""}`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 text-sm font-semibold leading-snug text-white">
            {d.title}
          </span>
          {d.hasChildren ? (
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/30 text-xs text-zinc-200"
              aria-hidden
            >
              {d.expanded ? "‹" : "›"}
            </span>
          ) : null}
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
      {d.hasChildren ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-2 !w-2 !border-0 !bg-zinc-400"
        />
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-0 !w-0 !opacity-0"
        />
      )}
    </>
  );
}
