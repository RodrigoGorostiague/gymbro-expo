import { ActiveWorkoutDraft, ExperienceReceipt, ExerciseDefinition, RewardReceipt, WorkoutAttempt, WorkoutSession } from '../types';
import { asExperienceProgress } from './experience';
import { supabase, supabaseConfigurationError } from './supabase';

export type TrainingState = {
  definitions: ExerciseDefinition[];
  attempts: WorkoutAttempt[];
  sessions: WorkoutSession[];
  activeWorkoutDraft: ActiveWorkoutDraft | null;
};

type TrainingStateInput = Partial<TrainingState>;

export type TrainingFinalizationErrorMessage = {
  title: string;
  body: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error.toLowerCase();
  if (!isRecord(error)) return '';
  return [error.code, error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
}

export function classifyTrainingFinalizationError(error: unknown): TrainingFinalizationErrorMessage {
  const message = errorText(error);
  if (message.includes('invalid training attempt input')) {
    return {
      title: 'Revisá la rutina',
      body: 'La rutina debe tener ejercicios y series válidos. Revisala e intentá finalizar nuevamente.',
    };
  }
  if (message.includes('invalid planned session lineage')) {
    return {
      title: 'Sesión desactualizada',
      body: 'La sesión del mesociclo ya no es válida. Actualizá o reabrí el mesociclo antes de finalizar.',
    };
  }
  if (/auth|jwt|token|unauthoriz|forbidden|permission|\b401\b|\b403\b/.test(message)) {
    return {
      title: 'Sesión requerida',
      body: 'Volvé a iniciar sesión e intentá finalizar el entrenamiento nuevamente.',
    };
  }
  if (/configur|supabase.*(?:url|key)|(?:url|key).*supabase/.test(message)) {
    return {
      title: 'Servicio no disponible',
      body: 'La configuración del servicio no está disponible. Intentá nuevamente más tarde.',
    };
  }
  if (/network|fetch|offline|connection|conexión|conection|timeout|timed out/.test(message)) {
    return {
      title: 'No se pudo conectar',
      body: 'Verificá tu conexión e intentá finalizar el entrenamiento nuevamente.',
    };
  }
  return {
    title: 'No se pudo guardar el entrenamiento',
    body: 'No pudimos finalizar el entrenamiento. Intentá nuevamente.',
  };
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
    && (value.routineSnapshot === undefined || (isRecord(value.routineSnapshot)
      && isNonEmptyString(value.routineSnapshot.id) && isNonEmptyString(value.routineSnapshot.name)
      && Array.isArray(value.routineSnapshot.exercises)))
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
  const { error } = await requireClient().rpc('save_training_state', {
    definitions_input: input.definitions ?? null,
    attempts_input: input.attempts ?? null,
    sessions_input: input.sessions ?? null,
    active_workout_draft_input: input.activeWorkoutDraft === undefined ? null : input.activeWorkoutDraft,
    active_workout_draft_supplied: input.activeWorkoutDraft !== undefined,
  });
  if (error) throw new Error(`No se pudo guardar el entrenamiento: ${error.message}`);
}

function isReceipt(value: unknown): value is RewardReceipt {
  return isRecord(value) && Number.isInteger(value.balance) && (value.balance as number) >= 0
    && Array.isArray(value.entries) && isRecord(value.weekly)
    && (value.mesocycle === undefined || isRecord(value.mesocycle));
}

function isExperienceReceipt(value: unknown): value is ExperienceReceipt {
  return isRecord(value) && isNonEmptyString(value.attempt_id) && Number.isInteger(value.earned_xp)
    && (value.earned_xp as number) >= 0 && Array.isArray(value.entries)
    && asExperienceProgress(value.progress) !== null;
}

function experienceReceipt(value: unknown): ExperienceReceipt {
  if (!isRecord(value)) throw new Error('La confirmación de experiencia tiene un formato inválido. Inténtalo nuevamente.');
  const progress = asExperienceProgress(value.progress);
  if (!progress || !isExperienceReceipt(value)) throw new Error('La confirmación de experiencia tiene un formato inválido. Inténtalo nuevamente.');
  return {
    attemptId: value.attempt_id as string,
    earnedXp: value.earned_xp as number,
    entries: value.entries as ExperienceReceipt['entries'],
    progress,
  };
}

export async function finalizeTrainingAttempt(attempt: WorkoutAttempt): Promise<{ attempt: WorkoutAttempt; receipt: RewardReceipt; experienceReceipt: ExperienceReceipt }> {
  if (!isAttempt(attempt)) throw new Error('El intento de entrenamiento no es válido.');
  const { data, error } = await requireClient().rpc('finalize_training_attempt', { attempt_input: attempt });
  // Preserve RPC metadata so the UI can classify safe messages and diagnostics retain the cause.
  if (error) throw error;
  if (!isRecord(data) || !isAttempt(data.attempt) || !isReceipt(data.receipt) || !isExperienceReceipt(data.experience_receipt)) {
    throw new Error('La confirmación de recompensas tiene un formato inválido. Inténtalo nuevamente.');
  }
  return { attempt: data.attempt, receipt: data.receipt, experienceReceipt: experienceReceipt(data.experience_receipt) };
}

export async function importLegacyCustomDefinitions(definitions: ExerciseDefinition[]): Promise<void> {
  if (!definitions.every(isDefinition)) throw new Error('Las definiciones de entrenamiento no son válidas.');
  const { error } = await requireClient().rpc('import_legacy_custom_definitions', {
    definitions_input: definitions,
  });
  if (error) throw new Error(`No se pudieron conservar las definiciones personalizadas: ${error.message}`);
}
