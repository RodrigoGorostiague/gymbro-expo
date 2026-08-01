type CatalogMuscleGroupLike = {
  id: string;
  displayName: string;
  type: string;
  visibleInFilters: boolean;
};

export function isSelectableMuscleParent(group: CatalogMuscleGroupLike): boolean {
  return group.visibleInFilters && group.type === 'Grupo padre';
}

export function muscleGroupLabel(groups: readonly CatalogMuscleGroupLike[], id: string): string {
  return groups.find((group) => group.id === id)?.displayName ?? id;
}

export function muscleGroupLabels(groups: readonly CatalogMuscleGroupLike[], ids: readonly string[]): string[] {
  return ids.map((id) => muscleGroupLabel(groups, id));
}
