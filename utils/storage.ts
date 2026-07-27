import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Exercise,
  ExerciseCatalog,
  ExerciseVariant,
  Mesocycle,
  MesocycleStatus,
  PlannedSession,
  PlannedSessionRef,
  Routine,
  ShopState,
  UserProfile,
  WORKOUT_ATTEMPT_VERSION,
  WorkoutAttempt,
  WorkoutSession,
} from '../types';

const KEYS = {
  user: '@gymbro/user',
  exercises: '@gymbro/exercises',
  exerciseCatalog: '@gymbro/exercise-catalog/v1',
  routines: '@gymbro/routines',
  legacyMesocycles: '@gymbro/mesocycles',
  legacyMesocyclePrefix: '@gymbro/mesocycles/v1/',
  mesocycleReset: '@gymbro/migrations/mesocycle-schedule-reset-v1',
  mesocycles: (profile: UserProfile) => `@gymbro/mesocycles/v2/${profile}`,
  sessions: '@gymbro/sessions',
  sessionMigration: '@gymbro/migrations/profile-attempts-v1',
  sessionQuarantine: '@gymbro/quarantine/ownerless-sessions-v1',
  attempts: (profile: UserProfile) => `@gymbro/attempts/v1/${profile}`,
  hiddenSharedRoutineIds: '@gymbro/hiddenSharedRoutineIds',
  shop: (profile: UserProfile) => `@gymbro/shop/${profile}`,
  legacyShop: '@gymbro/shop',
};

const SESSION_MIGRATION_VERSION = 'profile-attempts-v1';
let storageMigrationPromise: Promise<void> | null = null;
let storageMigrationError: Error | null = null;
const attemptMutationQueues = new Map<UserProfile, Promise<void>>();
const shopMutationQueues = new Map<UserProfile, Promise<void>>();
const rewardSagaQueues = new Map<UserProfile, Promise<void>>();
let exerciseCatalogMutationQueue: Promise<void> = Promise.resolve();

const EXERCISE_CATALOG_VERSION = 1 as const;
const DEFAULT_EXERCISE_VARIANTS: ExerciseVariant[] = ['barra', 'mancuernas', 'polea', 'libre'];
const DEFAULT_MESOCYCLE_CREATED_AT = new Date(0).toISOString();
const MESOCYCLE_STATUSES: readonly MesocycleStatus[] = ['draft', 'active', 'completed', 'archived'];

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

export async function saveUser(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(KEYS.user, profile);
}

export async function loadUser(): Promise<UserProfile | null> {
  const value = await AsyncStorage.getItem(KEYS.user);
  return value as UserProfile | null;
}

export async function clearUser(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.user);
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

export async function saveSessions(sessions: WorkoutSession[]): Promise<void> {
  await ensureStorageSchema();
  await AsyncStorage.setItem(KEYS.sessions, JSON.stringify(sessions));
}

export async function loadSessions(): Promise<WorkoutSession[]> {
  await ensureStorageSchema();
  const value = await AsyncStorage.getItem(KEYS.sessions);
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
