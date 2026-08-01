import { describe, expect, test } from 'vitest';
import { CANONICAL_EXERCISE_DEFINITIONS } from '../constants/exerciseDefinitions';
import { isCanonicalMuscleGroup } from '../constants/muscleGroups';
import { createCatalogLibrary, deleteCustomDefinition, planRecipientImport } from '../utils/catalogLibrary';
import { Mesocycle, Routine } from '../types';

describe('catalog library foundation', () => {
  test('accepts only the sixteen canonical muscle group IDs and provides immutable system defaults', () => {
    expect(isCanonicalMuscleGroup('pecho')).toBe(true);
    expect(isCanonicalMuscleGroup('Pecho')).toBe(false);
    expect(CANONICAL_EXERCISE_DEFINITIONS.length).toBeGreaterThan(0);
    expect(new Set(CANONICAL_EXERCISE_DEFINITIONS.map(({ id }) => id)).size)
      .toBe(CANONICAL_EXERCISE_DEFINITIONS.length);
    expect(Object.isFrozen(CANONICAL_EXERCISE_DEFINITIONS[0])).toBe(true);
  });

  test('preserves an explicit zero load in a custom definition', () => {
    const library = createCatalogLibrary('rodaja', [{
      id: 'custom:zero', source: { kind: 'custom', owner: 'rodaja', originId: 'origin:zero' },
      name: 'Zero load', muscleGroups: ['pecho'], loadMode: 'external-load', loadUnit: 'kg', variant: 'libre',
      defaultSets: [{ id: 'set', tipo: 1, reps: 8, weight: 0 }],
    }]);
    expect(library.definitions.find(({ id }) => id === 'custom:zero')?.defaultSets[0].weight).toBe(0);
  });

  test('blocks referenced custom deletion unless a replacement is supplied and never changes attempts', () => {
    const custom = { id: 'custom:one', source: { kind: 'custom' as const, owner: 'rodaja' as const, originId: 'origin:one' }, name: 'Custom', muscleGroups: ['pecho' as const], loadMode: 'external-load' as const, loadUnit: 'kg' as const, variant: 'libre', defaultSets: [] };
    const library = createCatalogLibrary('rodaja', [custom], [{ id: 'routine', name: 'R', muscleGroups: ['pecho'], createdAt: '', exercises: [{ id: 'rx', catalogExerciseId: custom.id, definitionId: custom.id, name: custom.name, muscleGroups: ['pecho'], variant: 'libre', sets: [] }] }]);
    expect(() => deleteCustomDefinition(library, 'rodaja', custom.id)).toThrow('live prescriptions');
    const replacement = CANONICAL_EXERCISE_DEFINITIONS[0].id;
    const deleted = deleteCustomDefinition(library, 'rodaja', custom.id, replacement);
    expect(deleted.routines[0].exercises[0].definitionId).toBe(replacement);
    expect(deleted.attempts).toEqual([]);
  });

  test('imports noncanonical content as an independent recipient copy while deduplicating systems', () => {
    const incoming = { id: 'source:custom', source: { kind: 'custom' as const, owner: 'rodaja' as const, originId: 'origin:custom' }, name: 'Source custom', muscleGroups: ['espalda' as const], loadMode: 'external-load' as const, loadUnit: 'kg' as const, variant: 'libre', defaultSets: [] };
    const result = planRecipientImport(createCatalogLibrary('brisas'), {
      recipient: 'brisas', definitions: [CANONICAL_EXERCISE_DEFINITIONS[0], incoming], routines: [], mesocycles: [],
    });
    expect(result.library.definitions).toContainEqual(expect.objectContaining({ id: CANONICAL_EXERCISE_DEFINITIONS[0].id, source: { kind: 'system' } }));
    const copied = result.library.definitions.find(({ name }) => name === incoming.name)!;
    expect(copied.id).not.toBe(incoming.id);
    expect(copied.source).toEqual({ kind: 'custom', owner: 'brisas', originId: 'origin:custom' });
  });

  test('validates a complete graph and projects recipient-owned routine and mesocycle references', () => {
    const definition = { id: 'source:custom', source: { kind: 'custom' as const, owner: 'rodaja' as const, originId: 'origin:custom' }, name: 'Source custom', muscleGroups: ['espalda' as const], loadMode: 'external-load' as const, loadUnit: 'kg' as const, variant: 'libre', defaultSets: [] };
    const routine: Routine = { id: 'source-routine', name: 'Source routine', muscleGroups: ['espalda'], createdAt: '', isShared: true, shareId: 'share-1', exercises: [{ id: 'rx', definitionId: definition.id, name: definition.name, muscleGroups: ['espalda'], variant: 'libre', sets: [] }] };
    const mesocycle: Mesocycle = { id: 'source-mesocycle', name: 'Source mesocycle', goal: '', status: 'draft', durationWeeks: 1, createdAt: '', weeks: [{ id: 'week', weekNumber: 1, entries: [{ id: 'session', order: 1, ref: { routineId: routine.id, routineName: routine.name, source: 'shared', shareId: 'share-1' } }] }] };

    const result = planRecipientImport(createCatalogLibrary('brisas'), { recipient: 'brisas', definitions: [CANONICAL_EXERCISE_DEFINITIONS[0], definition], routines: [routine], mesocycles: [mesocycle] });

    expect(result.definitionReplacements).toEqual({ [CANONICAL_EXERCISE_DEFINITIONS[0].id]: CANONICAL_EXERCISE_DEFINITIONS[0].id, [definition.id]: 'custom:brisas:origin:custom' });
    expect(result.routineReplacements).toEqual({ [routine.id]: 'import:brisas:routine:source-routine' });
    expect(result.mesocycleReplacements).toEqual({ [mesocycle.id]: 'import:brisas:mesocycle:source-mesocycle' });
    expect(result.library.routines[0]).toMatchObject({ id: 'import:brisas:routine:source-routine', isShared: undefined, shareId: undefined });
    expect(result.library.routines[0].exercises[0].definitionId).toBe('custom:brisas:origin:custom');
    const importedRef = (result.library.mesocycles[0].weeks[0].entries[0] as { ref: { routineId: string; source: string; shareId?: string } }).ref;
    expect(importedRef).toMatchObject({ routineId: 'import:brisas:routine:source-routine', source: 'local' });
    expect(importedRef).not.toHaveProperty('shareId');
  });

  test('rejects invalid edges before mutating the recipient library', () => {
    const library = createCatalogLibrary('brisas');
    expect(() => planRecipientImport(library, { recipient: 'brisas', definitions: [], routines: [{ id: 'broken', name: 'Broken', muscleGroups: ['pecho'], createdAt: '', exercises: [{ id: 'rx', definitionId: 'missing', name: 'Missing', muscleGroups: ['pecho'], variant: 'libre', sets: [] }] }], mesocycles: [] })).toThrow('unknown definition');
    expect(library.routines).toEqual([]);
  });

  test('rejects invalid groups, recipient mismatches, and conflicting defaults', () => {
    const brisas = createCatalogLibrary('brisas');
    const invalidCustom = { id: 'invalid', source: { kind: 'custom' as const, owner: 'rodaja' as const, originId: 'invalid' }, name: 'Invalid', muscleGroups: ['unknown'] as any, loadMode: 'external-load' as const, loadUnit: 'kg' as const, variant: 'libre', defaultSets: [] };
    expect(() => planRecipientImport(brisas, { recipient: 'brisas', definitions: [invalidCustom], routines: [], mesocycles: [] })).toThrow('invalid canonical fields');
    expect(() => planRecipientImport(brisas, { recipient: 'rodaja', definitions: [], routines: [], mesocycles: [] })).toThrow('recipient does not match');
    expect(() => planRecipientImport(brisas, { recipient: 'brisas', definitions: [{ ...CANONICAL_EXERCISE_DEFINITIONS[0], name: 'Tampered' }], routines: [], mesocycles: [] })).toThrow('conflicts');
  });
});
