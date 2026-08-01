import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActiveWorkoutDraft,
  CatalogLibrary,
  CatalogSet,
  CatalogImportPlan,
  Exercise,
  ExerciseCatalog,
  ExerciseDefinition,
  ExerciseVariant,
  Mesocycle,
  MesocycleStatus,
  PlannedSession,
  PlannedSessionRef,
  Routine,
  ShopState,
  LegacyAlias,
  UserId,
  UserProfile,
  WORKOUT_ATTEMPT_VERSION,
  WorkoutAttempt,
  WorkoutSession,
} from '../types';
import { CANONICAL_EXERCISE_DEFINITIONS } from '../constants/exerciseDefinitions';
import { isCanonicalMuscleGroup } from '../constants/muscleGroups';
import { reconcileActiveWorkoutTiming } from './activeWorkoutTiming';
import { createCatalogLibrary, deleteCustomDefinition, planRecipientImport } from './catalogLibrary';

const KEYS = {
  user: '@gymbro/user',
  exercises: '@gymbro/exercises',
  exerciseCatalog: '@gymbro/exercise-catalog/v1',
  catalogLibrary: (profile: UserId) => `@gymbro/catalog-library/v2/${profile}`,
  catalogLibraryJournal: '@gymbro/catalog-library/v2/journal',
  routines: '@gymbro/routines',
  legacyMesocycles: '@gymbro/mesocycles',
  legacyMesocyclePrefix: '@gymbro/mesocycles/v1/',
  mesocycleReset: '@gymbro/migrations/mesocycle-schedule-reset-v1',
  mesocycles: (profile: UserId) => `@gymbro/mesocycles/v2/${profile}`,
  sessions: '@gymbro/sessions',
  uidSessions: (uid: UserId) => `@gymbro/sessions/v2/${uid}`,
  sessionMigration: '@gymbro/migrations/profile-attempts-v1',
  sessionQuarantine: '@gymbro/quarantine/ownerless-sessions-v1',
  attempts: (profile: UserId) => `@gymbro/attempts/v1/${profile}`,
  activeWorkout: (profile: UserId) => `@gymbro/active-workout/v1/${profile}`,
  hiddenSharedRoutineIds: '@gymbro/hiddenSharedRoutineIds',
  shop: (profile: UserId) => `@gymbro/shop/${profile}`,
  uidMigration: (uid: UserId) => `@gymbro/migrations/uid-ownership-v1/${uid}`,
  uidMigrationJournal: '@gymbro/migrations/uid-ownership-v1/journal',
  legacyShop: '@gymbro/shop',
};

const TRAINING_CLEAN_SLATE_VERSION = 'training-clean-slate-v1';

function isCustomDefinition(value: unknown, owner: UserId): value is ExerciseDefinition {
  const definition = value as Partial<ExerciseDefinition> | null;
  return !!definition && typeof definition.id === 'string' && !!definition.id.trim()
    && definition.source?.kind === 'custom' && definition.source.owner === owner
    && typeof definition.source.originId === 'string' && !!definition.source.originId.trim()
    && typeof definition.name === 'string' && !!definition.name.trim()
    && Array.isArray(definition.muscleGroups) && Array.isArray(definition.defaultSets)
    && ['external-load', 'bodyweight', 'assisted'].includes(definition.loadMode ?? '')
    && ['kg', 'lb'].includes(definition.loadUnit ?? '');
}

function parseCustomDefinitions(raw: string | null, owner: UserId): ExerciseDefinition[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as Partial<CatalogLibrary>;
    return Array.isArray(value.definitions) ? value.definitions.filter((item) => isCustomDefinition(item, owner)) : [];
  } catch {
    return [];
  }
}

function addCustomDefinitions(
  definitionsByOwner: Map<UserId, Map<string, ExerciseDefinition>>,
  owner: UserId,
  definitions: ExerciseDefinition[],
): void {
  const definitionsById = definitionsByOwner.get(owner) ?? new Map<string, ExerciseDefinition>();
  definitions.forEach((definition) => {
    if (!definitionsById.has(definition.id)) definitionsById.set(definition.id, definition);
  });
  definitionsByOwner.set(owner, definitionsById);
}

export async function readLegacyCustomDefinitions(owner: UserId): Promise<ExerciseDefinition[]> {
  const marker = `@gymbro/migrations/${TRAINING_CLEAN_SLATE_VERSION}`;
  if (await AsyncStorage.getItem(marker)) return [];

  const keys = await AsyncStorage.getAllKeys();
  const customDefinitions = new Map<UserId, Map<string, ExerciseDefinition>>();
  for (const key of keys.filter((item) => item.startsWith('@gymbro/catalog-library/v2/'))) {
    const profile = key.slice('@gymbro/catalog-library/v2/'.length);
    const definitions = parseCustomDefinitions(await AsyncStorage.getItem(key), profile);
    addCustomDefinitions(customDefinitions, profile, definitions);
  }
  const journal = await AsyncStorage.getItem(KEYS.catalogLibraryJournal);
  try {
    const value = journal ? JSON.parse(journal) as Partial<CatalogLibraryJournal> : null;
    if (value?.version === 1 && value.libraries && typeof value.libraries === 'object') {
      Object.entries(value.libraries).forEach(([profile, library]) => {
        if (library) addCustomDefinitions(customDefinitions, profile, parseCustomDefinitions(JSON.stringify(library), profile));
      });
    }
  } catch {
    // A corrupt journal is runtime state and is deleted without recovery.
  }
  return [...(customDefinitions.get(owner)?.values() ?? [])];
}

export async function wipeLegacyTrainingRuntimeState(): Promise<void> {
  const marker = `@gymbro/migrations/${TRAINING_CLEAN_SLATE_VERSION}`;
  if (await AsyncStorage.getItem(marker)) return;
  const keys = await AsyncStorage.getAllKeys();
  const runtimeKeys = keys.filter((key) => key === KEYS.routines
    || key === KEYS.legacyMesocycles
    || key === KEYS.sessions
    || key === KEYS.sessionMigration
    || key === KEYS.sessionQuarantine
    || key === KEYS.catalogLibraryJournal
    || key === KEYS.hiddenSharedRoutineIds
    || key === KEYS.legacyShop
    || key.startsWith('@gymbro/catalog-library/v2/')
    || key.startsWith('@gymbro/mesocycles/')
    || key.startsWith('@gymbro/attempts/')
    || key.startsWith('@gymbro/active-workout/')
    || key.startsWith('@gymbro/sessions/v2/')
    || key.startsWith('@gymbro/shop/'));
  if (runtimeKeys.length) await AsyncStorage.multiRemove(runtimeKeys);
  await AsyncStorage.setItem(marker, 'complete');
}

const SESSION_MIGRATION_VERSION = 'profile-attempts-v1';
let storageMigrationPromise: Promise<void> | null = null;
let storageMigrationError: Error | null = null;
const attemptMutationQueues = new Map<UserId, Promise<void>>();
const shopMutationQueues = new Map<UserId, Promise<void>>();
const rewardSagaQueues = new Map<UserId, Promise<void>>();
let exerciseCatalogMutationQueue: Promise<void> = Promise.resolve();
let catalogLibraryMutationQueue: Promise<void> = Promise.resolve();

const EXERCISE_CATALOG_VERSION = 1 as const;
const DEFAULT_EXERCISE_VARIANTS: ExerciseVariant[] = ['barra', 'mancuernas', 'polea', 'libre'];
const DEFAULT_MESOCYCLE_CREATED_AT = new Date(0).toISOString();
const MESOCYCLE_STATUSES: readonly MesocycleStatus[] = ['draft', 'active', 'completed', 'archived'];

const CATALOG_LIBRARY_OWNERS: readonly LegacyAlias[] = ['rodaja', 'brisas'];

type CatalogLibraryJournal = { version: 1; libraries: Partial<Record<UserId, CatalogLibrary>> };

const cloneStorageValue = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function parseArray(value: string | null): unknown[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) ? parsed : [];
}

function parseCatalogLibrary(value: string | null, owner: UserId): CatalogLibrary | null {
  if (!value) return null;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object') return null;
  const library = parsed as Partial<CatalogLibrary>;
  if (library.version !== 2 || library.owner !== owner || !Array.isArray(library.definitions)
    || !Array.isArray(library.routines) || !Array.isArray(library.mesocycles) || !Array.isArray(library.attempts)) {
    return null;
  }
  return library as CatalogLibrary;
}

function normalizedLegacyName(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

function legacySets(value: unknown): CatalogSet[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((set): CatalogSet[] => {
    if (!set || typeof set !== 'object') return [];
    const candidate = set as Partial<CatalogSet>;
    if (!Number.isFinite(candidate.weight) || (candidate.weight ?? -1) < 0 || !Number.isFinite(candidate.reps)) return [];
    return [{ id: typeof candidate.id === 'string' ? candidate.id : generateId(), tipo: candidate.tipo ?? candidate.reps!, weight: candidate.weight!, reps: candidate.reps! }];
  });
}

function legacyDefinition(owner: UserId, exercise: Exercise): ExerciseDefinition {
  const system = CANONICAL_EXERCISE_DEFINITIONS.find(
    (definition) => normalizedLegacyName(definition.name) === normalizedLegacyName(exercise.name),
  );
  if (system) return cloneStorageValue(system);
  const groups = exercise.muscleGroups.filter(isCanonicalMuscleGroup);
  return {
    id: `custom:${owner}:${exercise.id}`,
    source: { kind: 'custom', owner, originId: exercise.id },
    name: exercise.name,
    muscleGroups: groups.length ? groups : ['fullBody'],
    loadMode: exercise.loadMode ?? 'external-load',
    loadUnit: exercise.loadUnit ?? 'kg',
    variant: exercise.variant,
    defaultSets: legacySets(exercise.defaultSets),
  };
}

function snapshotDefinition(definition: ExerciseDefinition) {
  return {
    id: definition.id,
    name: definition.name,
    muscleGroups: [...definition.muscleGroups],
    loadMode: definition.loadMode,
    loadUnit: definition.loadUnit,
    variant: definition.variant,
  };
}

function projectLegacyRoutines(routines: Routine[], definitionsByLegacyId: Map<string, ExerciseDefinition>): Routine[] {
  return routines.map((routine) => ({ ...cloneStorageValue(routine), exercises: routine.exercises.map((exercise) => {
    const definition = exercise.catalogExerciseId ? definitionsByLegacyId.get(exercise.catalogExerciseId) : undefined;
    return !definition ? cloneStorageValue(exercise) : {
      ...cloneStorageValue(exercise),
      catalogExerciseId: definition.id,
      definitionId: definition.id,
      definitionSnapshot: snapshotDefinition(definition),
    };
  }) }));
}

async function recoverCatalogLibraryJournal(): Promise<void> {
  const raw = await AsyncStorage.getItem(KEYS.catalogLibraryJournal);
  if (!raw) return;
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || (parsed as Partial<CatalogLibraryJournal>).version !== 1
    || !((parsed as Partial<CatalogLibraryJournal>).libraries)) {
    throw new Error('Catalog library journal is invalid.');
  }
  const journal = parsed as CatalogLibraryJournal;
  for (const [owner, library] of Object.entries(journal.libraries)) {
    if (!library || !parseCatalogLibrary(JSON.stringify(library), owner)) continue;
    await AsyncStorage.setItem(KEYS.catalogLibrary(owner), JSON.stringify(library));
  }
  await AsyncStorage.removeItem(KEYS.catalogLibraryJournal);
}

async function commitCatalogLibraries(libraries: Partial<Record<UserId, CatalogLibrary>>): Promise<void> {
  await AsyncStorage.setItem(KEYS.catalogLibraryJournal, JSON.stringify({ version: 1, libraries } satisfies CatalogLibraryJournal));
  for (const [owner, library] of Object.entries(libraries)) {
    if (library) await AsyncStorage.setItem(KEYS.catalogLibrary(owner), JSON.stringify(library));
  }
  await AsyncStorage.removeItem(KEYS.catalogLibraryJournal);
}

async function legacyExercises(): Promise<Exercise[]> {
  const raw = await AsyncStorage.getItem(KEYS.exerciseCatalog) ?? await AsyncStorage.getItem(KEYS.exercises);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  const exercises = Array.isArray(parsed) ? parsed : (parsed as Partial<ExerciseCatalog>).exercises;
  return Array.isArray(exercises) ? exercises.filter((exercise): exercise is Exercise => !!exercise && typeof exercise === 'object'
    && typeof (exercise as Partial<Exercise>).id === 'string' && typeof (exercise as Partial<Exercise>).name === 'string'
    && typeof (exercise as Partial<Exercise>).variant === 'string' && Array.isArray((exercise as Partial<Exercise>).muscleGroups)) : [];
}

async function legacyMesocycles(owner: UserId): Promise<Mesocycle[]> {
  const raw = await AsyncStorage.getItem(KEYS.mesocycles(owner))
    ?? await AsyncStorage.getItem(`${KEYS.legacyMesocyclePrefix}${owner}`)
    ?? await AsyncStorage.getItem(KEYS.legacyMesocycles);
  return parseArray(raw) as Mesocycle[];
}

async function legacyAttempts(owner: UserId): Promise<WorkoutAttempt[]> {
  return parseArray(await AsyncStorage.getItem(KEYS.attempts(owner))) as WorkoutAttempt[];
}

async function migrateCatalogLibraries(): Promise<void> {
  await recoverCatalogLibraryJournal();
  const existing = await Promise.all(CATALOG_LIBRARY_OWNERS.map(async (owner) => [owner,
    parseCatalogLibrary(await AsyncStorage.getItem(KEYS.catalogLibrary(owner)), owner),
  ] as const));
  if (existing.every(([, library]) => library)) return;

  const exercises = await legacyExercises();
  const routines = parseArray(await AsyncStorage.getItem(KEYS.routines)) as Routine[];
  const libraries: Partial<Record<UserId, CatalogLibrary>> = Object.fromEntries(existing) as Partial<Record<UserId, CatalogLibrary>>;
  for (const owner of CATALOG_LIBRARY_OWNERS) {
    if (libraries[owner]) continue;
    const definitions = exercises.map((exercise) => legacyDefinition(owner, exercise));
    const customDefinitions = definitions.filter((definition) => definition.source.kind === 'custom');
    const byLegacyId = new Map(exercises.map((exercise, index) => [exercise.id, definitions[index]]));
    libraries[owner] = createCatalogLibrary(owner, customDefinitions, projectLegacyRoutines(routines, byLegacyId), await legacyMesocycles(owner), await legacyAttempts(owner));
  }
  await commitCatalogLibraries(libraries);
}

export async function loadCatalogLibrary(owner: UserId): Promise<CatalogLibrary> {
  const operation = catalogLibraryMutationQueue.then(async () => {
    await migrateCatalogLibraries();
    const stored = parseCatalogLibrary(await AsyncStorage.getItem(KEYS.catalogLibrary(owner)), owner);
    if (stored) return stored;
    const library = createCatalogLibrary(owner);
    await AsyncStorage.setItem(KEYS.catalogLibrary(owner), JSON.stringify(library));
    return library;
  });
  catalogLibraryMutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

const NORMALIZED_CATALOG_RESET_KEY = '@gymbro/migrations/normalized-catalog-v1';

export async function resetLegacyTrainingDataForNormalizedCatalog(): Promise<void> {
  if (await AsyncStorage.getItem(NORMALIZED_CATALOG_RESET_KEY)) return;
  const keys = await AsyncStorage.getAllKeys();
  const legacyTrainingKeys = keys.filter((key) => (
    key === KEYS.routines
    || key === KEYS.exercises
    || key === KEYS.exerciseCatalog
    || key === KEYS.catalogLibraryJournal
    || key === KEYS.legacyMesocycles
    || key === KEYS.sessions
    || key === KEYS.sessionQuarantine
    || key === KEYS.hiddenSharedRoutineIds
    || key.startsWith('@gymbro/catalog-library/v2/')
    || key.startsWith('@gymbro/mesocycles/')
    || key.startsWith('@gymbro/attempts/')
    || key.startsWith('@gymbro/active-workout/')
    || key.startsWith('@gymbro/sessions/v2/')
  ));
  if (legacyTrainingKeys.length) await AsyncStorage.multiRemove(legacyTrainingKeys);
  await AsyncStorage.setItem(NORMALIZED_CATALOG_RESET_KEY, new Date().toISOString());
}

export async function updateCatalogLibrary(
  owner: UserId,
  mutation: (library: CatalogLibrary) => CatalogLibrary,
): Promise<CatalogLibrary> {
  const operation = catalogLibraryMutationQueue.then(async () => {
    await migrateCatalogLibraries();
    const current = parseCatalogLibrary(await AsyncStorage.getItem(KEYS.catalogLibrary(owner)), owner);
    if (!current) throw new Error('Catalog library is unavailable.');
    const next = mutation(cloneStorageValue(current));
    if (next.version !== 2 || next.owner !== owner) throw new Error('Catalog library mutation returned an invalid owner library.');
    await commitCatalogLibraries({ [owner]: next });
    return next;
  });
  catalogLibraryMutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function deleteCatalogLibraryDefinition(
  owner: UserId,
  id: string,
  replacementId?: string,
): Promise<CatalogLibrary> {
  const operation = catalogLibraryMutationQueue.then(async () => {
    await migrateCatalogLibraries();
    const current = parseCatalogLibrary(await AsyncStorage.getItem(KEYS.catalogLibrary(owner)), owner);
    if (!current) throw new Error('Catalog library is unavailable.');
    const next = deleteCustomDefinition(current, owner, id, replacementId);
    await commitCatalogLibraries({ [owner]: next });
    return next;
  });
  catalogLibraryMutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function commitCatalogLibraryImport(
  recipient: UserId,
  plan: CatalogImportPlan,
): Promise<ReturnType<typeof planRecipientImport>> {
  const operation = catalogLibraryMutationQueue.then(async () => {
    await migrateCatalogLibraries();
    const current = parseCatalogLibrary(await AsyncStorage.getItem(KEYS.catalogLibrary(recipient)), recipient);
    if (!current) throw new Error('Catalog library is unavailable.');
    const result = planRecipientImport(current, plan);
    await commitCatalogLibraries({ [recipient]: result.library });
    return result;
  });
  catalogLibraryMutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function commitImport(plan: CatalogImportPlan): Promise<ReturnType<typeof planRecipientImport>> {
  return commitCatalogLibraryImport(plan.recipient, plan);
}

const STARTER_THEME_IDS = ['white', 'black', 'profile-rodaja', 'profile-brisas'] as const;

const DEFAULT_SHOP: ShopState = {
  gems: 0,
  rewardReceiptIds: [],
  purchasedThemeIds: [...STARTER_THEME_IDS],
  equippedThemeId: null,
  combineWithPartner: false,
  weeklyGoal: {
    bonusWeekKey: null,
    lastWeekWorkouts: 0,
  },
};

function withStarterThemes(state: ShopState): { state: ShopState; changed: boolean } {
  const purchased = new Set(state.purchasedThemeIds);
  let changed = false;
  for (const id of STARTER_THEME_IDS) {
    if (!purchased.has(id)) {
      purchased.add(id);
      changed = true;
    }
  }
  if (!changed) return { state, changed: false };
  return { state: { ...state, purchasedThemeIds: [...purchased] }, changed: true };
}

function normalizeShop(raw: string): { state: ShopState; changed: boolean } {
  const stored = JSON.parse(raw) as Partial<ShopState>;
  const rewardReceiptIds = Array.isArray(stored.rewardReceiptIds)
    && stored.rewardReceiptIds.every((id) => typeof id === 'string')
    ? stored.rewardReceiptIds : [];
  const normalized = withStarterThemes({ ...DEFAULT_SHOP, ...stored, rewardReceiptIds });
  return { state: normalized.state, changed: normalized.changed || rewardReceiptIds !== stored.rewardReceiptIds };
}

async function runStorageMigration(): Promise<void> {
  const currentVersion = await AsyncStorage.getItem(KEYS.sessionMigration);
  if (currentVersion === SESSION_MIGRATION_VERSION) {
    storageMigrationError = null;
    return;
  }

  const rawSessions = await AsyncStorage.getItem(KEYS.sessions);
  const sessions = rawSessions ? JSON.parse(rawSessions) as (WorkoutSession & { owner?: UserProfile })[] : [];
  const owned = sessions.filter(
    (session): session is WorkoutSession & { owner: UserProfile } =>
      session.owner === 'rodaja' || session.owner === 'brisas',
  );
  const ownerless = sessions.filter(
    (session) => session.owner !== 'rodaja' && session.owner !== 'brisas',
  );

  if (ownerless.length > 0) {
    await AsyncStorage.setItem(KEYS.sessionQuarantine, JSON.stringify(ownerless));
  }
  try {
    if (owned.length !== sessions.length) {
      await AsyncStorage.setItem(KEYS.sessions, JSON.stringify(owned));
    }
    await AsyncStorage.setItem(KEYS.sessionMigration, SESSION_MIGRATION_VERSION);
    storageMigrationError = null;
  } catch (error) {
    if (rawSessions !== null) await AsyncStorage.setItem(KEYS.sessions, rawSessions);
    await AsyncStorage.removeItem(KEYS.sessionMigration);
    throw error;
  }
}

async function ensureStorageSchema(): Promise<void> {
  if (!storageMigrationPromise) {
    storageMigrationPromise = runStorageMigration().catch((error) => {
      storageMigrationError = error instanceof Error ? error : new Error('No se pudo migrar el historial de sesiones.');
      storageMigrationPromise = null;
      throw error;
    });
  }

  await storageMigrationPromise;
}

export async function loadLegacyAlias(): Promise<LegacyAlias | null> {
  const value = await AsyncStorage.getItem(KEYS.user);
  return value === 'rodaja' || value === 'brisas' ? value : null;
}

type UidMigrationJournal = {
  version: 1;
  uid: UserId;
  writes: Record<string, string>;
};

function migrateLibraryOwner(library: CatalogLibrary, uid: UserId): CatalogLibrary {
  return {
    ...cloneStorageValue(library),
    owner: uid,
    definitions: library.definitions.map((definition) => definition.source.kind === 'custom'
      ? { ...definition, source: { ...definition.source, owner: uid } }
      : definition),
  };
}

async function commitUidMigration(journal: UidMigrationJournal): Promise<void> {
  await AsyncStorage.setItem(KEYS.uidMigrationJournal, JSON.stringify(journal));
  for (const [key, value] of Object.entries(journal.writes)) {
    const current = await AsyncStorage.getItem(key);
    if (current === null) await AsyncStorage.setItem(key, value);
    if (await AsyncStorage.getItem(key) !== value) throw new Error('UID migration could not verify a copied record.');
  }
  await AsyncStorage.setItem(KEYS.uidMigration(journal.uid), 'complete');
  await AsyncStorage.removeItem(KEYS.uidMigrationJournal);
}

export async function migrateLegacyAliasToUid(alias: LegacyAlias | null, uid: UserId): Promise<void> {
  if (await AsyncStorage.getItem(KEYS.uidMigration(uid)) === 'complete') return;

  const rawJournal = await AsyncStorage.getItem(KEYS.uidMigrationJournal);
  if (rawJournal) {
    const journal = JSON.parse(rawJournal) as UidMigrationJournal;
    if (journal.version !== 1 || journal.uid !== uid || !journal.writes) throw new Error('UID migration journal is invalid.');
    await commitUidMigration(journal);
    return;
  }

  const writes: Record<string, string> = {};
  if (alias) {
    await migrateCatalogLibraries();
    const legacyLibrary = parseCatalogLibrary(await AsyncStorage.getItem(KEYS.catalogLibrary(alias)), alias);
    if (legacyLibrary) writes[KEYS.catalogLibrary(uid)] = JSON.stringify(migrateLibraryOwner(legacyLibrary, uid));

    const legacyDraft = await AsyncStorage.getItem(KEYS.activeWorkout(alias));
    if (legacyDraft) {
      const draft = JSON.parse(legacyDraft) as ActiveWorkoutDraft;
      if (isActiveWorkoutDraft(draft, alias)) {
        writes[KEYS.activeWorkout(uid)] = JSON.stringify({ ...draft, owner: uid });
      }
    }

    const legacySessions = parseArray(await AsyncStorage.getItem(KEYS.sessions))
      .filter((session): session is WorkoutSession & { owner: LegacyAlias } =>
        !!session && typeof session === 'object' && (session as { owner?: string }).owner === alias,
      )
      .map((session) => ({ ...session, owner: uid }));
    if (legacySessions.length) writes[KEYS.uidSessions(uid)] = JSON.stringify(legacySessions);
  }

  await commitUidMigration({ version: 1, uid, writes });
}

export function normalizeExerciseVariant(value: string): ExerciseVariant {
  const normalized = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!normalized) throw new Error('El nombre de la variante no puede estar vacío.');
  if (Array.from(normalized).length > 40) {
    throw new Error('El nombre de la variante no puede superar los 40 caracteres.');
  }
  return normalized;
}

function variantsEqual(left: string, right: string): boolean {
  return left.localeCompare(right, 'es', { sensitivity: 'accent' }) === 0;
}

function canonicalVariant(variants: readonly ExerciseVariant[], value: string): ExerciseVariant {
  const normalized = normalizeExerciseVariant(value);
  const existing = variants.find((variant) => variantsEqual(variant, normalized));
  if (!existing) throw new Error(`La variante "${normalized}" no existe en el catálogo.`);
  return existing;
}

function assertExerciseCatalog(value: unknown): asserts value is ExerciseCatalog {
  if (!value || typeof value !== 'object') throw new Error('El catálogo de ejercicios guardado no es válido.');
  const catalog = value as Partial<ExerciseCatalog>;
  if (
    catalog.version !== EXERCISE_CATALOG_VERSION ||
    !Array.isArray(catalog.variants) ||
    !Array.isArray(catalog.exercises) ||
    catalog.variants.length === 0
  ) {
    throw new Error('El catálogo de ejercicios guardado no es válido.');
  }

  const validated: ExerciseVariant[] = [];
  for (const variant of catalog.variants) {
    if (typeof variant !== 'string' || normalizeExerciseVariant(variant) !== variant) {
      throw new Error('El catálogo contiene una variante no válida.');
    }
    if (validated.some((item) => variantsEqual(item, variant))) {
      throw new Error(`El catálogo contiene variantes duplicadas: "${variant}".`);
    }
    validated.push(variant);
  }

  for (const exercise of catalog.exercises) {
    if (!exercise || typeof exercise !== 'object' || typeof exercise.variant !== 'string') {
      throw new Error('El catálogo contiene un ejercicio no válido.');
    }
    if (!validated.includes(exercise.variant)) {
      throw new Error(`El ejercicio "${exercise.name ?? 'sin nombre'}" usa una variante desconocida.`);
    }
  }
}

function parseExerciseCatalog(raw: string): ExerciseCatalog {
  const parsed: unknown = JSON.parse(raw);
  assertExerciseCatalog(parsed);
  return parsed;
}

async function bootstrapExerciseCatalog(): Promise<ExerciseCatalog> {
  const legacyRaw = await AsyncStorage.getItem(KEYS.exercises);
  let exercises: Exercise[] = [];
  if (legacyRaw !== null) {
    const parsed: unknown = JSON.parse(legacyRaw);
    if (!Array.isArray(parsed)) throw new Error('El catálogo de ejercicios anterior no es válido.');
    exercises = parsed as Exercise[];
  }

  const variants = [...DEFAULT_EXERCISE_VARIANTS];
  const normalizedExercises = exercises.map((exercise) => {
    if (!exercise || typeof exercise !== 'object' || typeof exercise.variant !== 'string') {
      throw new Error('El catálogo de ejercicios anterior contiene un ejercicio no válido.');
    }
    const normalized = normalizeExerciseVariant(exercise.variant);
    const known = variants.find((variant) => variantsEqual(variant, normalized));
    const variant = known ?? normalized;
    if (!known) variants.push(variant);
    return { ...exercise, variant };
  });
  const catalog: ExerciseCatalog = {
    version: EXERCISE_CATALOG_VERSION,
    variants,
    exercises: normalizedExercises,
  };
  assertExerciseCatalog(catalog);
  await AsyncStorage.setItem(KEYS.exerciseCatalog, JSON.stringify(catalog));
  return catalog;
}

export async function loadExerciseCatalog(): Promise<ExerciseCatalog> {
  const raw = await AsyncStorage.getItem(KEYS.exerciseCatalog);
  return raw === null ? bootstrapExerciseCatalog() : parseExerciseCatalog(raw);
}

export async function loadExercises(): Promise<Exercise[]> {
  return (await loadExerciseCatalog()).exercises;
}

function mutateExerciseCatalog<T>(
  mutation: (current: Readonly<ExerciseCatalog>) => { next: ExerciseCatalog; result: T },
): Promise<{ catalog: ExerciseCatalog; result: T }> {
  const operation = exerciseCatalogMutationQueue.then(async () => {
    const current = await loadExerciseCatalog();
    const { next, result } = mutation(current);
    assertExerciseCatalog(next);
    await AsyncStorage.setItem(KEYS.exerciseCatalog, JSON.stringify(next));
    return { catalog: next, result };
  });
  exerciseCatalogMutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export function addCatalogExercise(
  exercise: Omit<Exercise, 'id'>,
): Promise<{ catalog: ExerciseCatalog; result: Exercise }> {
  return mutateExerciseCatalog((current) => {
    const created = {
      ...exercise,
      id: generateId(),
      variant: canonicalVariant(current.variants, exercise.variant),
    };
    return {
      next: { ...current, exercises: [created, ...current.exercises] },
      result: created,
    };
  });
}

export function updateCatalogExercise(
  exercise: Exercise,
): Promise<{ catalog: ExerciseCatalog; result: void }> {
  return mutateExerciseCatalog((current) => {
    if (!current.exercises.some(({ id }) => id === exercise.id)) {
      throw new Error('El ejercicio ya no existe en el catálogo.');
    }
    const updated = { ...exercise, variant: canonicalVariant(current.variants, exercise.variant) };
    return {
      next: {
        ...current,
        exercises: current.exercises.map((item) => item.id === updated.id ? updated : item),
      },
      result: undefined,
    };
  });
}

export function deleteCatalogExercise(
  id: string,
): Promise<{ catalog: ExerciseCatalog; result: void }> {
  return mutateExerciseCatalog((current) => {
    if (!current.exercises.some((exercise) => exercise.id === id)) {
      throw new Error('El ejercicio ya no existe en el catálogo.');
    }
    return {
      next: { ...current, exercises: current.exercises.filter((exercise) => exercise.id !== id) },
      result: undefined,
    };
  });
}

export function createCatalogVariant(
  name: string,
): Promise<{ catalog: ExerciseCatalog; result: ExerciseVariant }> {
  return mutateExerciseCatalog((current) => {
    const variant = normalizeExerciseVariant(name);
    if (current.variants.some((item) => variantsEqual(item, variant))) {
      throw new Error(`La variante "${variant}" ya existe.`);
    }
    return {
      next: { ...current, variants: [...current.variants, variant] },
      result: variant,
    };
  });
}

export function renameCatalogVariant(
  source: ExerciseVariant,
  name: string,
): Promise<{ catalog: ExerciseCatalog; result: ExerciseVariant }> {
  return mutateExerciseCatalog((current) => {
    const index = current.variants.indexOf(source);
    if (index < 0) throw new Error(`La variante "${source}" ya no existe.`);
    const variant = normalizeExerciseVariant(name);
    if (current.variants.some((item, itemIndex) => itemIndex !== index && variantsEqual(item, variant))) {
      throw new Error(`La variante "${variant}" ya existe.`);
    }
    const variants = [...current.variants];
    variants[index] = variant;
    return {
      next: {
        ...current,
        variants,
        exercises: current.exercises.map((exercise) =>
          exercise.variant === source ? { ...exercise, variant } : exercise
        ),
      },
      result: variant,
    };
  });
}

export function deleteCatalogVariant(
  source: ExerciseVariant,
): Promise<{ catalog: ExerciseCatalog; result: void }> {
  return mutateExerciseCatalog((current) => {
    if (!current.variants.includes(source)) throw new Error(`La variante "${source}" ya no existe.`);
    const usages = current.exercises.filter((exercise) => exercise.variant === source);
    if (usages.length > 0) {
      const names = usages.map(({ name }) => name).join(', ');
      throw new Error(
        `No se puede eliminar "${source}": la usan ${usages.length} ejercicio${usages.length === 1 ? '' : 's'} (${names}). Edítalos primero.`,
      );
    }
    if (current.variants.length === 1) {
      throw new Error('El catálogo debe conservar al menos una variante.');
    }
    return {
      next: { ...current, variants: current.variants.filter((variant) => variant !== source) },
      result: undefined,
    };
  });
}

export async function saveRoutines(routines: Routine[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.routines, JSON.stringify(routines));
}

export async function loadRoutines(): Promise<Routine[]> {
  const value = await AsyncStorage.getItem(KEYS.routines);
  if (!value) return [];
  return (JSON.parse(value) as Routine[]).map((routine) => {
    const muscleGroups = Array.isArray(routine.muscleGroups) ? routine.muscleGroups : [];
    const storedExercises = Array.isArray(routine.exercises) ? routine.exercises : [];
    const normalizedExercises = storedExercises.map((exercise) => {
      if (!exercise || typeof exercise !== 'object' || Array.isArray(exercise)) return exercise;
      const exerciseMuscleGroups = Array.isArray(exercise.muscleGroups) ? exercise.muscleGroups : [];
      const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
      return exerciseMuscleGroups === exercise.muscleGroups && sets === exercise.sets
        ? exercise
        : { ...exercise, muscleGroups: exerciseMuscleGroups, sets };
    });
    const exercises = normalizedExercises.every((exercise, index) => exercise === storedExercises[index])
      ? storedExercises
      : normalizedExercises;
    return muscleGroups === routine.muscleGroups && exercises === routine.exercises
      ? routine
      : { ...routine, muscleGroups, exercises };
  });
}

function normalizeMesocycleStatus(value: unknown): MesocycleStatus {
  return typeof value === 'string' && MESOCYCLE_STATUSES.includes(value as MesocycleStatus)
    ? value as MesocycleStatus
    : 'draft';
}

function normalizePlannedSessionRef(
  value: unknown,
  fallbackRoutineId: string,
  fallbackRoutineName: string,
): PlannedSessionRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      routineId: fallbackRoutineId,
      routineName: fallbackRoutineName,
      source: fallbackRoutineId.startsWith('shared-') ? 'shared' : 'local',
    };
  }

  const ref = value as Partial<PlannedSessionRef>;
  const routineId = typeof ref.routineId === 'string' ? ref.routineId : fallbackRoutineId;
  const source = ref.source === 'shared' || ref.source === 'local'
    ? ref.source
    : routineId.startsWith('shared-') ? 'shared' : 'local';

  return {
    routineId,
    routineName: typeof ref.routineName === 'string' && ref.routineName.trim().length > 0
      ? ref.routineName
      : fallbackRoutineName,
    source,
    shareId: typeof ref.shareId === 'string' ? ref.shareId : undefined,
  };
}

function normalizePlannedSession(value: unknown, index: number): PlannedSession {
  const session = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<PlannedSession> & { routineId?: unknown; routineName?: unknown }
    : {};

  return {
    id: typeof session.id === 'string' ? session.id : `planned-session-${index + 1}`,
    ref: normalizePlannedSessionRef(
      session.ref,
      typeof session.routineId === 'string' ? session.routineId : '',
      typeof session.routineName === 'string' && session.routineName.trim().length > 0
        ? session.routineName
        : 'Unknown routine',
    ),
    dayLabel: typeof session.dayLabel === 'string' ? session.dayLabel : undefined,
    order: typeof session.order === 'number' && Number.isInteger(session.order) ? session.order : index + 1,
    progressionNote: typeof session.progressionNote === 'string' ? session.progressionNote : undefined,
    note: typeof session.note === 'string' ? session.note : undefined,
  };
}

function normalizeMesocycleEntry(value: unknown, index: number): PlannedSession | { id: string; kind: 'rest' } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<PlannedSession> & { kind?: unknown };
  if (typeof candidate.id !== 'string' || !candidate.id.trim()) return null;
  if (candidate.kind === 'rest') return { id: candidate.id, kind: 'rest' };
  if ('ref' in candidate && candidate.ref && typeof candidate.ref === 'object') {
    const ref = normalizePlannedSessionRef(candidate.ref, '', 'Unknown routine');
    return ref.routineId.trim() ? {
      id: candidate.id,
      ref,
      dayLabel: typeof candidate.dayLabel === 'string' ? candidate.dayLabel : undefined,
      order: typeof candidate.order === 'number' && Number.isInteger(candidate.order) ? candidate.order : index + 1,
      progressionNote: typeof candidate.progressionNote === 'string' ? candidate.progressionNote : undefined,
      note: typeof candidate.note === 'string' ? candidate.note : undefined,
    } : null;
  }
  return null;
}

function normalizeMesocycle(value: unknown, index: number): Mesocycle {
  const mesocycle = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<Mesocycle>
    : {};
  const storedWeeks = Array.isArray(mesocycle.weeks) ? mesocycle.weeks : [];
  const weeks = storedWeeks.flatMap((week, weekIndex) => {
    if (!week || typeof week !== 'object' || Array.isArray(week)) return [];
    const candidate = week as { id?: unknown; weekNumber?: unknown; entries?: unknown };
    if (!Array.isArray(candidate.entries) || candidate.entries.length > 7) return [];
    const entries = candidate.entries.map(normalizeMesocycleEntry).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    if (entries.length !== candidate.entries.length) return [];
    return [{ id: typeof candidate.id === 'string' ? candidate.id : `mesocycle-week-${weekIndex + 1}`, weekNumber: typeof candidate.weekNumber === 'number' && Number.isInteger(candidate.weekNumber) && candidate.weekNumber > 0 ? candidate.weekNumber : weekIndex + 1, entries }];
  });
  const requestedDuration = typeof mesocycle.durationWeeks === 'number'
    && Number.isInteger(mesocycle.durationWeeks)
    && mesocycle.durationWeeks > 0
    ? mesocycle.durationWeeks
    : Math.max(weeks.length, 1);

  return {
    id: typeof mesocycle.id === 'string' ? mesocycle.id : `mesocycle-${index + 1}`,
    name: typeof mesocycle.name === 'string' ? mesocycle.name : 'Untitled mesocycle',
    goal: typeof mesocycle.goal === 'string' ? mesocycle.goal : '',
    status: normalizeMesocycleStatus(mesocycle.status),
    weeks,
    durationWeeks: Math.max(requestedDuration, weeks.length),
    startDate: typeof mesocycle.startDate === 'string' ? mesocycle.startDate : undefined,
    createdAt: typeof mesocycle.createdAt === 'string' ? mesocycle.createdAt : DEFAULT_MESOCYCLE_CREATED_AT,
  };
}

export async function saveMesocycles(profile: UserProfile, mesocycles: Mesocycle[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.mesocycles(profile), JSON.stringify(mesocycles.map(normalizeMesocycle)));
}

export async function resetLegacyMesocycleStorage(profile: UserProfile): Promise<void> {
  if (await AsyncStorage.getItem(KEYS.mesocycleReset)) return;
  const keys = await AsyncStorage.getAllKeys();
  const legacyKeys = keys.filter((key) => key === KEYS.legacyMesocycles || key.startsWith(KEYS.legacyMesocyclePrefix));
  for (const key of legacyKeys) {
    const owner = key === KEYS.legacyMesocycles
      ? profile
      : key.slice(KEYS.legacyMesocyclePrefix.length) as UserProfile;
    const legacyValue = await AsyncStorage.getItem(key);
    if (legacyValue === null) continue;

    const legacyMesocycles = (JSON.parse(legacyValue) as unknown[])
      .map((mesocycle, index) => normalizeMesocycle(mesocycle, index));
    const currentValue = await AsyncStorage.getItem(KEYS.mesocycles(owner));
    const currentMesocycles = currentValue
      ? (JSON.parse(currentValue) as unknown[]).map((mesocycle, index) => normalizeMesocycle(mesocycle, index))
      : [];
    const currentIds = new Set(currentMesocycles.map(({ id }) => id));
    await AsyncStorage.setItem(
      KEYS.mesocycles(owner),
      JSON.stringify([...currentMesocycles, ...legacyMesocycles.filter(({ id }) => !currentIds.has(id))]),
    );
  }
  if (legacyKeys.length) await AsyncStorage.multiRemove(legacyKeys);
  await AsyncStorage.setItem(KEYS.mesocycleReset, 'complete');
}

export async function loadMesocycles(profile: UserProfile): Promise<Mesocycle[]> {
  const value = await AsyncStorage.getItem(KEYS.mesocycles(profile));
  if (!value) return [];
  return (JSON.parse(value) as unknown[]).map((mesocycle, index) => normalizeMesocycle(mesocycle, index));
}

export async function loadCatalogWithRoutines() {
  const [catalogResult, routines] = await Promise.all([
    loadExerciseCatalog().then(
      (catalog) => ({ catalog, catalogError: null }),
      (catalogError: unknown) => ({ catalog: null, catalogError }),
    ),
    loadRoutines(),
  ]);
  return { ...catalogResult, routines };
}

export function assertRoutineMutationReady(isLoaded: boolean): void {
  if (!isLoaded) throw new Error('Los datos de las rutinas aún no terminaron de cargar.');
}

export async function saveSessions(sessions: WorkoutSession[], owner?: UserId): Promise<void> {
  await ensureStorageSchema();
  await AsyncStorage.setItem(owner ? KEYS.uidSessions(owner) : KEYS.sessions, JSON.stringify(sessions));
}

export async function loadSessions(owner?: UserId): Promise<WorkoutSession[]> {
  await ensureStorageSchema();
  const value = await AsyncStorage.getItem(owner ? KEYS.uidSessions(owner) : KEYS.sessions);
  return value ? JSON.parse(value) : [];
}

export async function loadSessionQuarantine(): Promise<WorkoutSession[]> {
  await ensureStorageSchema();
  const value = await AsyncStorage.getItem(KEYS.sessionQuarantine);
  return value ? JSON.parse(value) : [];
}

export async function resolveSessionQuarantine(
  action: 'delete' | 'assign',
  profile: UserProfile,
): Promise<(WorkoutSession & { owner: UserProfile })[]> {
  await ensureStorageSchema();
  const [rawQuarantine, rawSessions] = await Promise.all([
    AsyncStorage.getItem(KEYS.sessionQuarantine), AsyncStorage.getItem(KEYS.sessions),
  ]);
  const current = rawSessions ? JSON.parse(rawSessions) as (WorkoutSession & { owner: UserProfile })[] : [];
  if (action === 'assign' && rawQuarantine) {
    const currentIds = new Set(current.map(({ id }) => id));
    const legacy = (JSON.parse(rawQuarantine) as WorkoutSession[])
      .filter(({ id }) => !currentIds.has(id)).map((session) => ({ ...session, owner: profile }));
    current.unshift(...legacy);
    await AsyncStorage.setItem(KEYS.sessions, JSON.stringify(current));
  }
  await AsyncStorage.removeItem(KEYS.sessionQuarantine);
  return current;
}

export function getStorageMigrationError(): Error | null {
  return storageMigrationError;
}

export async function rollbackSessionMigration(): Promise<void> {
  const [quarantine, current] = await Promise.all([
    AsyncStorage.getItem(KEYS.sessionQuarantine),
    AsyncStorage.getItem(KEYS.sessions),
  ]);
  if (quarantine !== null) {
    const legacy = JSON.parse(quarantine) as WorkoutSession[];
    const sessions = current ? JSON.parse(current) as WorkoutSession[] : [];
    const currentIds = new Set(sessions.map(({ id }) => id));
    await AsyncStorage.setItem(
      KEYS.sessions,
      JSON.stringify([...legacy.filter(({ id }) => !currentIds.has(id)), ...sessions]),
    );
  }
  await AsyncStorage.removeItem(KEYS.sessionMigration);
  storageMigrationPromise = null;
  storageMigrationError = null;
}

function assertProfileAttempts(profile: UserProfile, attempts: readonly WorkoutAttempt[]): void {
  if (attempts.some((attempt) =>
    attempt.owner !== profile || attempt.version !== WORKOUT_ATTEMPT_VERSION
  )) {
    throw new Error('El propietario o la versión del intento no coincide con su partición de almacenamiento.');
  }
}

export async function loadAttempts(profile: UserProfile): Promise<WorkoutAttempt[]> {
  const value = await AsyncStorage.getItem(KEYS.attempts(profile));
  if (!value) return [];
  const attempts = JSON.parse(value) as WorkoutAttempt[];
  return attempts.filter(
    (attempt) => attempt.owner === profile && attempt.version === WORKOUT_ATTEMPT_VERSION,
  );
}

function isActiveWorkoutDraft(value: unknown, owner: UserProfile): value is ActiveWorkoutDraft {
  const draft = value as Partial<ActiveWorkoutDraft> | null;
  return !!draft && draft.version === 1 && draft.owner === owner && typeof draft.attemptId === 'string' && typeof draft.routineId === 'string'
    && Number.isFinite(draft.startedAtMs) && Number.isFinite(draft.restTimerSeconds) && !!draft.completedSets && !!draft.setValues;
}
export async function loadActiveWorkoutDraft(owner: UserProfile, nowMs = Date.now()): Promise<ActiveWorkoutDraft | null> {
  const raw = await AsyncStorage.getItem(KEYS.activeWorkout(owner));
  if (!raw) return null;
  try {
    const draft: unknown = JSON.parse(raw);
    if (isActiveWorkoutDraft(draft, owner)) {
      const timing = reconcileActiveWorkoutTiming(draft, nowMs);
      if (timing.cleanup === 'remove-draft') {
        return await removeActiveWorkoutDraftIfMatches(owner, draft.attemptId)
          ? null
          : loadStoredActiveWorkoutDraft(owner);
      }
      if (timing.cleanup === 'clear-rest' && timing.draft) {
        if (!await saveActiveWorkoutDraftIfMatches(timing.draft, draft.attemptId)) {
          return loadStoredActiveWorkoutDraft(owner);
        }
      }
      return timing.draft;
    }
  } catch { /* invalid records are removed */ }
  await AsyncStorage.removeItem(KEYS.activeWorkout(owner));
  return null;
}
export async function saveActiveWorkoutDraft(draft: ActiveWorkoutDraft): Promise<void> {
  if (!isActiveWorkoutDraft(draft, draft.owner)) throw new Error('El borrador activo no es válido.');
  await AsyncStorage.setItem(KEYS.activeWorkout(draft.owner), JSON.stringify(draft));
}
export async function removeActiveWorkoutDraft(owner: UserProfile): Promise<void> { await AsyncStorage.removeItem(KEYS.activeWorkout(owner)); }
export async function saveActiveWorkoutDraftIfMatches(draft: ActiveWorkoutDraft, attemptId: string): Promise<boolean> {
  const current = await loadStoredActiveWorkoutDraft(draft.owner);
  if (!current || current.attemptId !== attemptId) return false;
  await AsyncStorage.setItem(KEYS.activeWorkout(draft.owner), JSON.stringify(draft));
  return true;
}
export async function removeActiveWorkoutDraftIfMatches(owner: UserProfile, attemptId: string): Promise<boolean> {
  const current = await loadStoredActiveWorkoutDraft(owner);
  if (!current || current.attemptId !== attemptId) return false;
  await AsyncStorage.removeItem(KEYS.activeWorkout(owner));
  return true;
}
async function loadStoredActiveWorkoutDraft(owner: UserProfile): Promise<ActiveWorkoutDraft | null> {
  const raw = await AsyncStorage.getItem(KEYS.activeWorkout(owner));
  if (!raw) return null;
  try {
    const draft: unknown = JSON.parse(raw);
    return isActiveWorkoutDraft(draft, owner) ? draft : null;
  } catch {
    return null;
  }
}

export async function saveAttempts(
  profile: UserProfile,
  attempts: readonly WorkoutAttempt[],
): Promise<void> {
  assertProfileAttempts(profile, attempts);
  await AsyncStorage.setItem(KEYS.attempts(profile), JSON.stringify(attempts));
}

export function mutateAttempts(
  profile: UserProfile,
  mutation: (current: readonly WorkoutAttempt[]) => WorkoutAttempt[],
): Promise<WorkoutAttempt[]> {
  const previous = attemptMutationQueues.get(profile) ?? Promise.resolve();
  const operation = previous.then(async () => {
    const current = await loadAttempts(profile);
    const next = mutation(current);
    assertProfileAttempts(profile, next);
    await saveAttempts(profile, next);
    return next;
  });
  attemptMutationQueues.set(profile, operation.then(() => undefined, () => undefined));
  return operation;
}

export function saveCapturedAttempt(profile: UserProfile, attempt: WorkoutAttempt): Promise<WorkoutAttempt[]> {
  return mutateAttempts(profile, (current) => {
    const existing = current.find(({ id }) => id === attempt.id);
    if (!existing) return [attempt, ...current];
    const retryShape = { ...existing, rewardApplication: attempt.rewardApplication };
    if (JSON.stringify(retryShape) !== JSON.stringify(attempt)) throw new Error('La identidad del intento ya pertenece a otros datos capturados.');
    return [...current];
  });
}

export function deleteAttempt(profile: UserProfile, id: string): Promise<WorkoutAttempt[]> {
  return mutateAttempts(profile, (current) => {
    if (!current.some((attempt) => attempt.id === id)) throw new Error('No se encontró el intento de entrenamiento.');
    return current.filter((attempt) => attempt.id !== id);
  });
}

function immutableAttemptShape(attempt: WorkoutAttempt): unknown {
  return {
    ...attempt,
    recapPublicationKey: null,
    completedAt: null,
    durationSeconds: null,
    restTimerSeconds: null,
    exercises: attempt.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map(({ plan, result }) => ({
        plan,
        result: { setId: result.setId, performed: null, performance: null },
      })),
    })),
  };
}

export function updateAttempt(profile: UserProfile, edited: WorkoutAttempt): Promise<WorkoutAttempt[]> {
  return mutateAttempts(profile, (current) => {
    const existing = current.find((attempt) => attempt.id === edited.id);
    if (!existing) throw new Error('No se encontró el intento de entrenamiento.');
    const reconciled = { ...edited, rewardApplication: existing.rewardApplication };
    if (JSON.stringify(immutableAttemptShape(existing)) !== JSON.stringify(immutableAttemptShape(reconciled))) {
      throw new Error('La estructura, la finalización y la recompensa del intento son inmutables.');
    }
    return current.map((attempt) => attempt.id === edited.id ? reconciled : attempt);
  });
}

export async function saveHiddenSharedRoutineIds(shareIds: string[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.hiddenSharedRoutineIds, JSON.stringify(shareIds));
}

export async function loadHiddenSharedRoutineIds(): Promise<string[]> {
  const value = await AsyncStorage.getItem(KEYS.hiddenSharedRoutineIds);
  return value ? JSON.parse(value) : [];
}

export async function saveShop(profile: UserProfile, state: ShopState): Promise<void> {
  await AsyncStorage.setItem(KEYS.shop(profile), JSON.stringify(state));
}

export function mutateShop(
  profile: UserProfile,
  mutation: (current: Readonly<ShopState>) => ShopState,
): Promise<ShopState> {
  const previous = shopMutationQueues.get(profile) ?? Promise.resolve();
  const operation = previous.then(async () => {
    const next = mutation(await loadShop(profile));
    await saveShop(profile, next);
    return next;
  });
  shopMutationQueues.set(profile, operation.then(() => undefined, () => undefined));
  return operation;
}

export async function loadShop(profile: UserProfile): Promise<ShopState> {
  const value = await AsyncStorage.getItem(KEYS.shop(profile));
  if (value) {
    const { state, changed } = normalizeShop(value);
    if (changed) await saveShop(profile, state);
    return state;
  }

  const legacy = await AsyncStorage.getItem(KEYS.legacyShop);
  if (legacy) {
    const { state } = normalizeShop(legacy);
    await saveShop(profile, state);
    return state;
  }

  return DEFAULT_SHOP;
}

function expectedRewardReceiptId(attempt: WorkoutAttempt): string {
  return `${attempt.owner}:${attempt.id}:v${attempt.version}`;
}

function assertRewardIdentity(profile: UserProfile, attempt: WorkoutAttempt): void {
  if (attempt.owner !== profile || attempt.rewardApplication.id !== expectedRewardReceiptId(attempt)) {
    throw new Error('La identidad del comprobante de recompensa no coincide con el perfil, el intento y la versión.');
  }
}

export function recoverPendingAttemptRewards(
  profile: UserProfile,
  appliedAt = new Date().toISOString(),
): Promise<{ attempts: WorkoutAttempt[]; shop: ShopState }> {
  const previous = rewardSagaQueues.get(profile) ?? Promise.resolve();
  const operation = previous.then(async () => {
    let attempts = await loadAttempts(profile);
    let shop = await loadShop(profile);
    for (const attempt of attempts.filter(({ rewardApplication }) => rewardApplication.state === 'pending')) {
      assertRewardIdentity(profile, attempt);
      shop = await mutateShop(profile, (current) => current.rewardReceiptIds.includes(attempt.rewardApplication.id)
        ? current
        : {
            ...current,
            gems: current.gems + attempt.reward.totalGems,
            rewardReceiptIds: [...current.rewardReceiptIds, attempt.rewardApplication.id],
          });
      attempts = await mutateAttempts(profile, (current) => current.map((item) =>
        item.id === attempt.id
          ? { ...item, rewardApplication: { id: item.rewardApplication.id, state: 'applied', appliedAt } }
          : item
      ));
    }
    return { attempts, shop };
  });
  rewardSagaQueues.set(profile, operation.then(() => undefined, () => undefined));
  return operation;
}

export async function loadEquippedThemes(): Promise<Record<UserProfile, string | null>> {
  const [rodaja, brisas] = await Promise.all([loadShop('rodaja'), loadShop('brisas')]);
  return {
    rodaja: rodaja.equippedThemeId,
    brisas: brisas.equippedThemeId,
  };
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
