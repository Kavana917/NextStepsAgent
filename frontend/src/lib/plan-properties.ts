import {
  MAX_PROPERTIES_PAYLOAD,
  PRESET_PROPERTY_TEMPLATES,
} from "@/lib/plan-property-templates";
import type { PlanProperty } from "@/lib/plan-types";

export type PropertyRow = {
  id: string;
  templateId: string | null;
  name: string;
  value: string;
};

const PRESET_NAME_LIST_ID = "plan-property-preset-names";

export const PLAN_PROPERTY_PRESET_DATALIST_ID = PRESET_NAME_LIST_ID;

function newRowId(): string {
  return `prop-${crypto.randomUUID()}`;
}

export function createEmptyPropertyState(): {
  enabled: boolean;
  rows: PropertyRow[];
} {
  return {
    enabled: false,
    rows: [],
  };
}

export function createEmptyRow(): PropertyRow {
  return {
    id: newRowId(),
    templateId: null,
    name: "",
    value: "",
  };
}

export function templateIdForFieldName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const match = PRESET_PROPERTY_TEMPLATES.find(
    (t) => t.label.toLowerCase() === trimmed.toLowerCase(),
  );
  return match?.templateId ?? null;
}

export function placeholderForFieldName(name: string): string {
  const tid = templateIdForFieldName(name);
  if (!tid) return "Describe the value or constraint";
  return (
    PRESET_PROPERTY_TEMPLATES.find((t) => t.templateId === tid)?.placeholder ??
    "Describe the value or constraint"
  );
}

export function canAddPropertyRow(rows: PropertyRow[]): boolean {
  return rows.length < MAX_PROPERTIES_PAYLOAD;
}

export function countFilledPropertyRows(rows: PropertyRow[]): number {
  return rows.filter((r) => r.name.trim() && r.value.trim()).length;
}

export function buildPropertiesPayload(
  enabled: boolean,
  rows: PropertyRow[],
): PlanProperty[] {
  if (!enabled) return [];
  const out: PlanProperty[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const name = row.name.trim();
    const value = row.value.trim();
    if (!name || !value) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const templateId = row.templateId ?? templateIdForFieldName(name);
    out.push({
      name,
      value,
      templateId,
    });
    if (out.length >= MAX_PROPERTIES_PAYLOAD) break;
  }

  return out;
}

export function rowsFromSuggestions(
  suggestions: PlanProperty[],
): PropertyRow[] {
  return suggestions.map((p) => ({
    id: newRowId(),
    templateId: p.templateId ?? templateIdForFieldName(p.name),
    name: p.name,
    value: p.value,
  }));
}

export function rowsFromSavedProperties(
  properties: PlanProperty[],
): { enabled: boolean; rows: PropertyRow[] } {
  if (properties.length === 0) {
    return createEmptyPropertyState();
  }

  const rows: PropertyRow[] = properties.map((p) => {
    const preset = p.templateId
      ? PRESET_PROPERTY_TEMPLATES.find((t) => t.templateId === p.templateId)
      : undefined;
    return {
      id: newRowId(),
      templateId: p.templateId ?? null,
      name: preset?.label ?? p.name,
      value: p.value,
    };
  });

  return { enabled: true, rows };
}
