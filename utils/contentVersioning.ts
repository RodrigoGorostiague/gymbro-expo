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
