import { SYSTEM_DEFINITION_BY_ID, CANONICAL_EXERCISE_DEFINITIONS } from '../constants/exerciseDefinitions';
import { isCanonicalMuscleGroup } from '../constants/muscleGroups';
import { CatalogImportPlan, CatalogImportResult, CatalogLibrary, ExerciseDefinition, Mesocycle, Routine, UserId, WorkoutAttempt } from '../types';
import { projectMesocycleRoutineIds } from './mesocycles';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const systemIds = new Set(CANONICAL_EXERCISE_DEFINITIONS.map(({ id }) => id));

function assertDefinition(definition: ExerciseDefinition): void {
  if (!definition.id || !definition.name.trim() || !definition.muscleGroups.length || !definition.muscleGroups.every(isCanonicalMuscleGroup)) {
    throw new Error('Exercise definition has invalid canonical fields.');
  }
  if (!definition.defaultSets.every((set) => Number.isFinite(set.weight) && set.weight >= 0)) {
    throw new Error('Exercise definition has an invalid load.');
  }
  const canonical = SYSTEM_DEFINITION_BY_ID.get(definition.id);
  if (canonical && JSON.stringify(canonical) !== JSON.stringify(definition)) {
    throw new Error('System definition conflicts with its immutable canonical record.');
  }
  if (definition.source.kind === 'system' && !canonical) throw new Error('Unknown system definition.');
}

function copyForRecipient(definition: ExerciseDefinition, recipient: UserId, localId: string): ExerciseDefinition {
  if (definition.source.kind === 'system') return clone(SYSTEM_DEFINITION_BY_ID.get(definition.id)!);
  return { ...clone(definition), id: localId, source: { kind: 'custom', owner: recipient, originId: definition.source.originId } };
}

export function createCatalogLibrary(
  owner: UserId,
  customDefinitions: ExerciseDefinition[] = [],
  routines: Routine[] = [],
  mesocycles: Mesocycle[] = [],
  attempts: WorkoutAttempt[] = [],
): CatalogLibrary {
  customDefinitions.forEach(assertDefinition);
  if (customDefinitions.some((definition) => definition.source.kind !== 'custom' || definition.source.owner !== owner)) {
    throw new Error('Custom definitions must be owned by the library recipient.');
  }
  return { version: 2, owner, definitions: [...CANONICAL_EXERCISE_DEFINITIONS.map(clone), ...customDefinitions.map(clone)], routines: clone(routines), mesocycles: clone(mesocycles), attempts: clone(attempts) };
}

export function deleteCustomDefinition(library: CatalogLibrary, owner: UserId, id: string, replacementId?: string): CatalogLibrary {
  if (library.owner !== owner) throw new Error('Only the library owner can delete definitions.');
  const definition = library.definitions.find((item) => item.id === id);
  if (!definition || definition.source.kind !== 'custom' || definition.source.owner !== owner) throw new Error('Only recipient-owned custom definitions are deletable.');
  const references = library.routines.flatMap((routine) => routine.exercises).filter((exercise) => exercise.definitionId === id || exercise.catalogExerciseId === id);
  if (references.length && !replacementId) throw new Error('Cannot delete a definition with live prescriptions without a replacement.');
  const replacement = replacementId ? library.definitions.find(({ id: candidate }) => candidate === replacementId) : undefined;
  if (replacementId && !replacement) throw new Error('Replacement definition does not exist.');
  return {
    ...clone(library),
    definitions: library.definitions.filter((item) => item.id !== id).map(clone),
    routines: library.routines.map((routine) => ({ ...clone(routine), exercises: routine.exercises.map((exercise) =>
      (exercise.definitionId === id || exercise.catalogExerciseId === id) && replacement
        ? { ...clone(exercise), definitionId: replacement.id, catalogExerciseId: replacement.id, definitionSnapshot: { id: replacement.id, name: replacement.name, muscleGroups: [...replacement.muscleGroups], loadMode: replacement.loadMode, loadUnit: replacement.loadUnit, variant: replacement.variant } }
        : clone(exercise),
    ) })),
  };
}

const importId = (recipient: UserId, kind: string, sourceId: string) => `import:${recipient}:${kind}:${sourceId}`;

function definitionReference(exercise: Routine['exercises'][number]): string | undefined {
  return exercise.definitionId ?? exercise.catalogExerciseId;
}

export function planRecipientImport(library: CatalogLibrary, plan: CatalogImportPlan): CatalogImportResult {
  if (library.owner !== plan.recipient) throw new Error('Import recipient does not match library owner.');
  const next = clone(library);
  const replacements: Record<string, string> = {};
  const existingByOrigin = new Map(next.definitions.filter((item) => item.source.kind === 'custom').map((item) => [item.source.kind === 'custom' ? item.source.originId : '', item.id]));
  const availableDefinitionIds = new Set(next.definitions.map(({ id }) => id));

  for (const definition of plan.definitions) {
    assertDefinition(definition);
    if (systemIds.has(definition.id)) {
      replacements[definition.id] = definition.id;
      continue;
    }
    if (definition.source.kind !== 'custom') throw new Error('Imported non-system definitions must be custom.');
    const duplicate = existingByOrigin.get(definition.source.originId);
    if (duplicate) {
      replacements[definition.id] = duplicate;
      continue;
    }
    const id = `custom:${plan.recipient}:${definition.source.originId}`;
    const copied = copyForRecipient(definition, plan.recipient, id);
    next.definitions.push(copied);
    existingByOrigin.set(definition.source.originId, id);
    replacements[definition.id] = id;
    availableDefinitionIds.add(id);
  }

  const routineReplacements: Record<string, string> = {};
  const existingRoutineIds = new Set(next.routines.map(({ id }) => id));
  for (const routine of plan.routines) {
    if (!routine.id || !routine.name.trim() || !routine.muscleGroups.length || !routine.muscleGroups.every(isCanonicalMuscleGroup)) {
      throw new Error('Imported routine has invalid canonical fields.');
    }
    const localId = importId(plan.recipient, 'routine', routine.id);
    routineReplacements[routine.id] = existingRoutineIds.has(localId) ? localId : localId;
    for (const exercise of routine.exercises) {
      const sourceDefinitionId = definitionReference(exercise);
      const definitionId = sourceDefinitionId && (replacements[sourceDefinitionId] ?? (availableDefinitionIds.has(sourceDefinitionId) ? sourceDefinitionId : undefined));
      if (!definitionId) throw new Error(`Imported routine references unknown definition: ${sourceDefinitionId ?? 'missing'}`);
    }
  }

  const projectedMesocycles = projectMesocycleRoutineIds(plan.mesocycles, routineReplacements);
  if (new Set(plan.routines.map(({ id }) => id)).size !== plan.routines.length || new Set(plan.mesocycles.map(({ id }) => id)).size !== plan.mesocycles.length) {
    throw new Error('Imported graph contains duplicate entity IDs.');
  }

  for (const routine of plan.routines) {
    const localId = routineReplacements[routine.id];
    if (existingRoutineIds.has(localId)) continue;
    next.routines.push({
      ...clone(routine),
      id: localId,
      isShared: undefined,
      shareId: undefined,
      exercises: routine.exercises.map((exercise) => {
        const sourceDefinitionId = definitionReference(exercise)!;
        const definitionId = replacements[sourceDefinitionId] ?? sourceDefinitionId;
        const definition = next.definitions.find(({ id }) => id === definitionId)!;
        return {
          ...clone(exercise),
          catalogExerciseId: definitionId,
          definitionId,
          definitionSnapshot: { id: definition.id, name: definition.name, muscleGroups: [...definition.muscleGroups], loadMode: definition.loadMode, loadUnit: definition.loadUnit, variant: definition.variant },
        };
      }),
    });
    existingRoutineIds.add(localId);
  }

  const mesocycleReplacements: Record<string, string> = {};
  const existingMesocycleIds = new Set(next.mesocycles.map(({ id }) => id));
  for (const mesocycle of projectedMesocycles) {
    if (!mesocycle.id || !mesocycle.name.trim()) throw new Error('Imported mesocycle has invalid fields.');
    const localId = importId(plan.recipient, 'mesocycle', mesocycle.id);
    mesocycleReplacements[mesocycle.id] = localId;
    if (existingMesocycleIds.has(localId)) continue;
    next.mesocycles.push({ ...clone(mesocycle), id: localId });
    existingMesocycleIds.add(localId);
  }

  return { library: next, definitionReplacements: replacements, routineReplacements, mesocycleReplacements };
}
