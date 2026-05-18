import type { Priority } from "@/lib/plan-types";

const STYLES: Record<
  Priority,
  string
> = {
  low: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30",
  medium: "bg-sky-500/15 text-sky-200 ring-sky-500/30",
  high: "bg-amber-500/15 text-amber-200 ring-amber-500/30",
  critical: "bg-rose-500/15 text-rose-200 ring-rose-500/30",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ring-1 ring-inset ${STYLES[priority]}`}
    >
      {priority}
    </span>
  );
}
