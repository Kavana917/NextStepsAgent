"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import type { PlanStep } from "@/lib/plan-schema";
import { ChevronRightIcon } from "@/components/plan-tree/icons";
import { PriorityBadge } from "@/components/plan-tree/PriorityBadge";
import { formatEstimatedMinutes } from "@/components/plan-tree/format-estimated";

export type ExpandMode = "default" | "all" | "none";

function StepBody({ step }: { step: PlanStep }) {
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold leading-snug text-zinc-50">
          {step.title}
        </h3>
        <PriorityBadge priority={step.priority} />
        <span className="text-xs tabular-nums text-zinc-400">
          ~{formatEstimatedMinutes(step.estimatedMinutes)}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-zinc-300">{step.description}</p>
    </div>
  );
}

function Branch({
  step,
  depth,
  expandMode,
}: {
  step: PlanStep;
  depth: 1 | 2;
  expandMode: ExpandMode;
}) {
  const children = step.children ?? [];
  const defaultOpen = expandMode === "all";

  return (
    <Collapsible.Root defaultOpen={defaultOpen} className="group">
      <div className="flex gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3 shadow-sm shadow-black/20">
        <Collapsible.Trigger className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/60 text-zinc-200 outline-none hover:bg-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500">
          <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
          <span className="sr-only">Toggle substeps</span>
        </Collapsible.Trigger>
        <StepBody step={step} />
      </div>
      <Collapsible.Content className="overflow-hidden">
        <div
          className={`mt-2 space-y-2 ${depth === 1 ? "ml-6 border-l border-zinc-800 pl-4" : "ml-6 border-l border-zinc-800/70 pl-4"}`}
        >
          {children.map((child) =>
            depth === 1 ? (
              <Branch
                key={child.id}
                step={child}
                depth={2}
                expandMode={expandMode}
              />
            ) : (
              <LeafRow key={child.id} step={child} />
            ),
          )}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function LeafRow({ step }: { step: PlanStep }) {
  return (
    <div className="flex gap-3 rounded-lg border border-zinc-800/60 bg-zinc-950/25 p-3">
      <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-zinc-600" aria-hidden />
      <StepBody step={step} />
    </div>
  );
}

export function PlanTree({
  steps,
  expandMode,
  treeKey,
}: {
  steps: PlanStep[];
  expandMode: ExpandMode;
  /** Changing this remounts the tree so defaultOpen reflects expandMode. */
  treeKey: number;
}) {
  if (steps.length === 0) {
    return (
      <p className="text-sm text-zinc-400">
        Generate a plan to see your tree here.
      </p>
    );
  }

  return (
    <div key={treeKey} aria-label="Next steps plan" className="space-y-3">
      {steps.map((step) => (
        <div key={step.id}>
          <Branch step={step} depth={1} expandMode={expandMode} />
        </div>
      ))}
    </div>
  );
}
