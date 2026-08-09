import { avatarIdOrDefault } from '../constants/avatars';
import { supabase, supabaseConfigurationError } from './supabase';

export type WorkoutStartActivity = {
  id: string;
  authorAlias: string;
  authorAvatarId: string;
  authorThemeId: string | null;
  routineName: string;
  jointWorkoutId: string | null;
  startedAt: string;
  expiresAt: string;
  isAuthor: boolean;
};

function client() {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'La actividad de entrenamiento no está configurada.');
  return supabase;
}

function asActivity(value: unknown): WorkoutStartActivity | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.author_alias !== 'string' || typeof row.routine_name !== 'string'
    || typeof row.started_at !== 'string' || typeof row.expires_at !== 'string' || typeof row.is_author !== 'boolean') return null;
  return {
    id: row.id,
    authorAlias: row.author_alias,
    authorAvatarId: avatarIdOrDefault(row.author_avatar_id),
    authorThemeId: typeof row.author_theme_id === 'string' ? row.author_theme_id : null,
    routineName: row.routine_name,
    jointWorkoutId: typeof row.joint_workout_id === 'string' ? row.joint_workout_id : null,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    isAuthor: row.is_author,
  };
}

export async function publishWorkoutStartActivity(routineName: string, jointWorkoutId?: string | null): Promise<void> {
  const trimmedName = routineName.trim();
  if (!trimmedName) throw new Error('La rutina debe tener un nombre para compartir el inicio.');
  const { error } = await client().rpc('publish_workout_start_activity', {
    input: { routine_name: trimmedName, ...(jointWorkoutId ? { joint_workout_id: jointWorkoutId } : {}) },
  });
  if (error) throw new Error(error.message);
}

export async function closeWorkoutStartActivity(): Promise<void> {
  const { error } = await client().rpc('close_workout_start_activity');
  if (error) throw new Error(error.message);
}

export async function listWorkoutStartActivities(): Promise<WorkoutStartActivity[]> {
  const { data, error } = await client().rpc('list_workout_start_activities');
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data.flatMap((row) => {
    const activity = asActivity(row);
    return activity ? [activity] : [];
  }) : [];
}

export async function subscribeToWorkoutStartActivityChanges(onChange: () => void): Promise<() => void> {
  const instance = client();
  const { data, error } = await instance.auth.getSession();
  if (error) throw new Error(error.message);
  if (!data.session) return () => undefined;
  await instance.realtime.setAuth(data.session.access_token);
  const channel = instance.channel(`workout-start-activity:${data.session.user.id}`);
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'workout_start_activities' }, onChange).subscribe();
  return () => { void instance.removeChannel(channel); };
}
