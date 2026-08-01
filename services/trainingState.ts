import { ActiveWorkoutDraft, ExerciseDefinition, WorkoutAttempt, WorkoutSession } from '../types';
import { supabase, supabaseConfigurationError } from './supabase';

export type TrainingState = {
  definitions: ExerciseDefinition[];
  attempts: WorkoutAttempt[];
  sessions: WorkoutSession[];
  activeWorkoutDraft: ActiveWorkoutDraft | null;
};

type TrainingStateInput = Partial<TrainingState>;

const DEFERRED_REWARD = {
  setGems: 0, completionGems: 0, fullCompletionBonus: 0, totalGems: 0, qualifiesForCompletion: false,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDefinition(value: unknown): value is ExerciseDefinition {
  return isRecord(value) && isNonEmptyString(value.id) && isRecord(value.source)
    && value.source.kind === 'custom' && isNonEmptyString(value.source.owner)
    && isNonEmptyString(value.source.originId) && isNonEmptyString(value.name)
    && Array.isArray(value.muscleGroups) && value.muscleGroups.every(isNonEmptyString)
    && ['external-load', 'bodyweight', 'assisted'].includes(value.loadMode as string)
    && ['kg', 'lb'].includes(value.loadUnit as string) && isNonEmptyString(value.variant)
    && Array.isArray(value.defaultSets);
}

function isAttempt(value: unknown): value is WorkoutAttempt {
  return isRecord(value) && value.version === 1 && isNonEmptyString(value.id)
    && isNonEmptyString(value.owner) && (value.routineId === null || isNonEmptyString(value.routineId))
    && isNonEmptyString(value.recordedRoutineName) && isNonEmptyString(value.completedAt)
    && Number.isInteger(value.durationSeconds) && (value.durationSeconds as number) >= 0
    && Number.isInteger(value.restTimerSeconds) && (value.restTimerSeconds as number) >= 0
    && Array.isArray(value.exercises) && isRecord(value.completion) && isRecord(value.reward)
    && isRecord(value.rewardApplication) && isNonEmptyString(value.rewardApplication.id)
    && ['pending', 'applied'].includes(value.rewardApplication.state as string);
}

function isSession(value: unknown): value is WorkoutSession {
  return isRecord(value) && isNonEmptyString(value.id) && isNonEmptyString(value.routineId)
    && isNonEmptyString(value.routineName) && isNonEmptyString(value.completedAt)
    && Number.isInteger(value.durationSeconds) && (value.durationSeconds as number) >= 0
    && Number.isInteger(value.restTimerSeconds) && (value.restTimerSeconds as number) >= 0
    && Array.isArray(value.exercises);
}

function isDraft(value: unknown): value is ActiveWorkoutDraft {
  return isRecord(value) && value.version === 1 && isNonEmptyString(value.owner)
    && isNonEmptyString(value.attemptId) && isNonEmptyString(value.routineId)
    && Number.isFinite(value.startedAtMs) && Number.isFinite(value.restTimerSeconds)
    && isRecord(value.completedSets) && isRecord(value.setValues)
    && (value.restEndsAtMs === undefined || Number.isFinite(value.restEndsAtMs));
}

function requireClient() {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'El almacenamiento remoto de entrenamiento no está configurado.');
  return supabase;
}

function validateState(value: unknown): TrainingState {
  if (!isRecord(value) || !Array.isArray(value.definitions) || !Array.isArray(value.attempts)
    || !Array.isArray(value.sessions) || (value.activeWorkoutDraft !== null && !isDraft(value.activeWorkoutDraft))) {
    throw new Error('El almacenamiento remoto de entrenamiento tiene un formato inválido. Inténtalo nuevamente.');
  }
  const ids = (items: readonly { id: string }[]) => new Set(items.map(({ id }) => id)).size === items.length;
  if (!value.definitions.every(isDefinition) || !value.attempts.every(isAttempt) || !value.sessions.every(isSession)
    || !ids(value.definitions) || !ids(value.attempts) || !ids(value.sessions)) {
    throw new Error('El almacenamiento remoto de entrenamiento tiene contenido inválido. Inténtalo nuevamente.');
  }
  return value as TrainingState;
}

export async function loadTrainingState(): Promise<TrainingState> {
  const { data, error } = await requireClient().rpc('load_training_state');
  if (error) throw new Error(`No se pudo cargar el entrenamiento: ${error.message}`);
  return validateState(data);
}

export async function saveTrainingState(input: TrainingStateInput): Promise<void> {
  if (input.definitions && !input.definitions.every(isDefinition)) throw new Error('Las definiciones de entrenamiento no son válidas.');
  if (input.attempts && !input.attempts.every(isAttempt)) throw new Error('Los intentos de entrenamiento no son válidos.');
  if (input.sessions && !input.sessions.every(isSession)) throw new Error('Las sesiones de entrenamiento no son válidas.');
  if (input.activeWorkoutDraft !== undefined && input.activeWorkoutDraft !== null && !isDraft(input.activeWorkoutDraft)) throw new Error('El borrador activo no es válido.');
  // Rewards remain deferred until a server-owned ledger exists. Never send client-calculated values.
  const attempts = input.attempts?.map((attempt) => ({
    ...attempt,
    reward: DEFERRED_REWARD,
    rewardApplication: { id: `${attempt.owner}:${attempt.id}:v${attempt.version}`, state: 'applied' as const },
  }));
  const { error } = await requireClient().rpc('save_training_state', {
    definitions_input: input.definitions ?? null,
    attempts_input: attempts ?? null,
    sessions_input: input.sessions ?? null,
    active_workout_draft_input: input.activeWorkoutDraft === undefined ? null : input.activeWorkoutDraft,
    active_workout_draft_supplied: input.activeWorkoutDraft !== undefined,
  });
  if (error) throw new Error(`No se pudo guardar el entrenamiento: ${error.message}`);
}

export async function importLegacyCustomDefinitions(definitions: ExerciseDefinition[]): Promise<void> {
  if (!definitions.every(isDefinition)) throw new Error('Las definiciones de entrenamiento no son válidas.');
  const { error } = await requireClient().rpc('import_legacy_custom_definitions', {
    definitions_input: definitions,
  });
  if (error) throw new Error(`No se pudieron conservar las definiciones personalizadas: ${error.message}`);
}
