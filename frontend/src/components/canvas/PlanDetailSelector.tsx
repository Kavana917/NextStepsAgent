import type { DetailLevel } from "@/lib/plan-types";

const OPTIONS: { value: DetailLevel; label: string; hint: string }[] = [
  {
    value: "low",
    label: "Low",
    hint: "Shallow tree (~2 levels): broad phases and high-level actions.",
  },
  {
    value: "medium",
    label: "Medium",
    hint: "Moderate depth (~4 levels): phases, milestones, then tasks.",
  },
  {
    value: "high",
    label: "High",
    hint: "Deep tree (~6 levels). Very large situations may need a narrower scope or Medium detail.",
  },
];

type PlanDetailSelectorProps = {
  value: DetailLevel;
  onChange: (level: DetailLevel) => void;
  disabled?: boolean;
};

export function PlanDetailSelector({
  value,
  onChange,
  disabled,
}: PlanDetailSelectorProps) {
  const active = OPTIONS.find((o) => o.value === value) ?? OPTIONS[1];

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-300">Plan detail</p>
      <div
        className="grid grid-cols-3 gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1"
        role="radiogroup"
        aria-label="Plan detail level"
      >
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`rounded-md px-2 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
              value === opt.value
                ? "bg-sky-600 text-white shadow-sm"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500">{active.hint}</p>
    </div>
  );
}
