import type { GenerateProgressUpdate } from "@/lib/generate-plan-stream";

type PlanGenerationProgressProps = {
  progress: GenerateProgressUpdate | null;
};

const PHASE_LABELS: Record<string, string> = {
  start: "Starting",
  brief: "Plan brief",
  expand: "Building tree",
  enrich: "Task details",
  finalize: "Finalizing",
  done: "Complete",
};

export function PlanGenerationProgress({ progress }: PlanGenerationProgressProps) {
  if (!progress) return null;

  const percent = Math.min(100, Math.max(0, progress.percent));
  const phaseLabel = PHASE_LABELS[progress.phase] ?? progress.phase;

  return (
    <div
      className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-3"
      role="status"
      aria-live="polite"
      aria-busy={percent < 100}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-zinc-300">{phaseLabel}</span>
        <span className="tabular-nums text-zinc-500">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-sky-500 transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500">{progress.message}</p>
    </div>
  );
}
