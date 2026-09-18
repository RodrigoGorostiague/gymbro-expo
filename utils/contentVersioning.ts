type VersionedContent = {
  id: string;
  version?: number;
  versionOf?: string;
  previousVersionId?: string;
};

export function nextContentVersion<T extends VersionedContent>(current: T, edited: T, nextId: string): T {
  return {
    ...edited,
    id: nextId,
    version: (current.version ?? 1) + 1,
    versionOf: current.versionOf ?? current.id,
    previousVersionId: current.id,
  };
}

export function isCurrentContentVersion<T extends VersionedContent>(content: T, all: readonly T[]): boolean {
  return !all.some((candidate) => candidate.previousVersionId === content.id);
}

/** JSONB can reorder object keys; array order remains meaningful. */
export function contentFingerprint(value: unknown): string {
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
    return item;
  };
  return JSON.stringify(canonical(value));
}
