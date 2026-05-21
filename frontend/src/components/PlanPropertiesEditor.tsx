import {
  canAddPropertyRow,
  countFilledPropertyRows,
  createEmptyRow,
  PLAN_PROPERTY_PRESET_DATALIST_ID,
  placeholderForFieldName,
  templateIdForFieldName,
  type PropertyRow,
} from "@/lib/plan-properties";
import { PRESET_PROPERTY_TEMPLATES } from "@/lib/plan-property-templates";

type PlanPropertiesEditorProps = {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  rows: PropertyRow[];
  onRowsChange: (rows: PropertyRow[]) => void;
  disabled?: boolean;
  alwaysOn?: boolean;
  heading?: string;
  subheading?: string;
};

function SettingsIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-zinc-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "bg-sky-600" : "bg-zinc-700"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

const fieldInputClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm leading-relaxed text-zinc-50 outline-none placeholder:text-zinc-600 focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/40";

export function PlanPropertiesEditor({
  enabled,
  onEnabledChange,
  rows,
  onRowsChange,
  disabled = false,
  alwaysOn = false,
  heading = "Planning context",
  subheading = "Optional constraints sent with your situation",
}: PlanPropertiesEditorProps) {
  const filledCount = countFilledPropertyRows(rows);
  const canAdd = canAddPropertyRow(rows);

  function updateRow(id: string, patch: Partial<PropertyRow>) {
    onRowsChange(
      rows.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        if ("name" in patch) {
          next.templateId = templateIdForFieldName(next.name);
        }
        return next;
      }),
    );
  }

  function removeRow(id: string) {
    onRowsChange(rows.filter((r) => r.id !== id));
  }

  function addRow() {
    if (!canAdd) return;
    onRowsChange([...rows, createEmptyRow()]);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div className="flex min-w-0 items-start gap-2">
          <SettingsIcon />
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-100">{heading}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
              {subheading}
            </p>
          </div>
        </div>
        {alwaysOn ? null : (
          <Toggle
            checked={enabled}
            onChange={onEnabledChange}
            disabled={disabled}
            label="Enable planning context"
          />
        )}
      </div>

      {enabled || alwaysOn ? (
        <>
          <div className="px-4 py-3">
            <p className="mb-3 text-xs leading-relaxed text-zinc-500">
              Each property is a field name plus a full description. Values wrap
              so you can read and edit longer constraints.
            </p>

            <datalist id={PLAN_PROPERTY_PRESET_DATALIST_ID}>
              {PRESET_PROPERTY_TEMPLATES.map((t) => (
                <option key={t.templateId} value={t.label} />
              ))}
            </datalist>

            <ul className="space-y-3">
              {rows.map((row, index) => (
                <li
                  key={row.id}
                  className="relative rounded-lg border border-zinc-800 bg-zinc-950/50 p-3"
                >
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    disabled={disabled}
                    title="Remove property"
                    className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-rose-300 disabled:opacity-40"
                  >
                    <span className="sr-only">Remove property {index + 1}</span>
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>

                  <div className="space-y-3 pr-8">
                    <div className="space-y-1.5">
                      <label
                        htmlFor={`prop-name-${row.id}`}
                        className="text-xs font-medium text-zinc-400"
                      >
                        Field name
                      </label>
                      <input
                        id={`prop-name-${row.id}`}
                        type="text"
                        list={PLAN_PROPERTY_PRESET_DATALIST_ID}
                        value={row.name}
                        onChange={(e) =>
                          updateRow(row.id, { name: e.target.value })
                        }
                        placeholder="e.g. Complete within"
                        disabled={disabled}
                        className={fieldInputClass}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label
                        htmlFor={`prop-value-${row.id}`}
                        className="text-xs font-medium text-zinc-400"
                      >
                        Value / description
                      </label>
                      <textarea
                        id={`prop-value-${row.id}`}
                        value={row.value}
                        onChange={(e) =>
                          updateRow(row.id, { value: e.target.value })
                        }
                        placeholder={placeholderForFieldName(row.name)}
                        disabled={disabled}
                        rows={3}
                        className={`${fieldInputClass} min-h-[4.5rem] resize-y`}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={addRow}
              disabled={disabled || !canAdd}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-sky-400 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="text-base leading-none">+</span>
              Add property
            </button>
          </div>

          {filledCount > 0 ? (
            <div className="border-t border-emerald-900/40 bg-emerald-950/25 px-4 py-2.5 text-xs leading-relaxed text-emerald-300/95">
              <span className="font-medium text-emerald-200">✓</span> Ready with{" "}
              {filledCount} {filledCount === 1 ? "property" : "properties"}.
              Generation will use these constraints with your situation.
            </div>
          ) : rows.length > 0 ? (
            <div className="border-t border-zinc-800 bg-zinc-950/40 px-4 py-2.5 text-xs text-zinc-500">
              Fill in both field name and value for each row you want applied.
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
