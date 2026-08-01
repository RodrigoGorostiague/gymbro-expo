export type DecimalDraftMap = Record<string, string>;

export function normalizeDecimalInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.');

  if (!normalized || normalized === '.' || normalized === '-.' || normalized === '-') {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function buildDecimalDraftMap(items: readonly { id: string; weight: number }[]): DecimalDraftMap {
  return Object.fromEntries(
    items.map((item) => [item.id, Number.isFinite(item.weight) && item.weight >= 0 ? String(item.weight) : '']),
  );
}
