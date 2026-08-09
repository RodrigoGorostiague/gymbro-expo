import type { AvatarId } from '../constants/avatars';
import { CommunityActivity, CommunityActivityKind, CommunityActivityPage, CommunityRankUpActivity, ExperienceProgress, TrainingRank } from '../types';
import { supabase, supabaseConfigurationError } from './supabase';

const ranks: readonly TrainingRank[] = ['Principiante', 'Intermedio', 'Avanzado', 'GymBro', 'GymRat', 'G-Boom', 'Alfa', 'Sigma'];

function requireClient() {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'El progreso remoto no está configurado.');
  return supabase;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isMilestoneValue(value: unknown): value is string | number {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

export function asExperienceProgress(value: unknown): ExperienceProgress | null {
  if (!isRecord(value) || typeof value.level !== 'number' || !Number.isInteger(value.level) || !ranks.includes(value.rank as TrainingRank)
    || typeof value.xp_into_level !== 'number' || !Number.isInteger(value.xp_into_level) || typeof value.xp_for_next_level !== 'number' || !Number.isInteger(value.xp_for_next_level)
    || typeof value.total_xp !== 'number' || !Number.isInteger(value.total_xp) || value.level < 1 || value.xp_into_level < 0
    || value.xp_for_next_level <= 0 || value.total_xp < 0) return null;
  return {
    level: value.level as number,
    rank: value.rank as TrainingRank,
    xpIntoLevel: value.xp_into_level as number,
    xpForNextLevel: value.xp_for_next_level as number,
    totalXp: value.total_xp as number,
  };
}

export async function loadExperienceProgress(): Promise<ExperienceProgress> {
  const { data, error } = await requireClient().rpc('load_experience_progress');
  if (error) throw new Error(`No se pudo cargar el progreso: ${error.message}`);
  const progress = asExperienceProgress(data);
  if (!progress) throw new Error('El progreso remoto tiene un formato inválido.');
  return progress;
}

const activityKinds: readonly CommunityActivityKind[] = ['rank_up', 'personal_record', 'mesocycle_completed', 'mesocycle_perfect_week', 'weekly_goal', 'weekly_streak', 'first_joint_workout', 'joint_workout_completed', 'weekly_volume_record', 'monthly_volume_record', 'monthly_consistency', 'muscle_balance_improved'];

function asActivity(value: unknown): CommunityActivity | null {
  if (!isRecord(value) || typeof value.kind !== 'string' || !activityKinds.includes(value.kind as CommunityActivityKind)
    || typeof value.id !== 'string' || typeof value.author_alias !== 'string' || typeof value.created_at !== 'string' || !isRecord(value.payload)) return null;
  const identity = {
    id: value.id,
    authorAlias: value.author_alias,
    authorAvatarId: (typeof value.author_avatar_id === 'string' ? value.author_avatar_id : 'capybara-athlete') as AvatarId,
    authorFrameId: typeof value.author_frame_id === 'string' ? value.author_frame_id : undefined,
    authorTitleId: typeof value.author_title_id === 'string' ? value.author_title_id : undefined,
    authorThemeId: typeof value.author_theme_id === 'string' ? value.author_theme_id : null,
    createdAt: value.created_at,
  };
  if (value.kind === 'rank_up') {
    if (!Number.isInteger(value.payload.level) || !ranks.includes(value.payload.rank as TrainingRank)) return null;
    return {
      ...identity,
      kind: 'rank_up',
      level: value.payload.level as number,
      rank: value.payload.rank as TrainingRank,
      unlockedFrameId: typeof value.payload.unlocked_frame_id === 'string' ? value.payload.unlocked_frame_id : undefined,
      unlockedTitleId: typeof value.payload.unlocked_title_id === 'string' ? value.payload.unlocked_title_id : undefined,
    };
  }
  const payload = Object.fromEntries(Object.entries(value.payload).filter((entry): entry is [string, string | number] => isMilestoneValue(entry[1])));
  return { ...identity, kind: value.kind as Exclude<CommunityActivityKind, 'rank_up'>, payload };
}

export async function getCommunityActivities(cursor: string | null = null): Promise<CommunityActivityPage> {
  const { data, error } = await requireClient().rpc('list_community_activities', { cursor, page_size: 20 });
  if (error) throw new Error(`No se pudo cargar la actividad: ${error.message}`);
  const page = isRecord(data) ? data : {};
  return {
    activities: Array.isArray(page.activities) ? page.activities.flatMap((activity) => {
      const parsed = asActivity(activity);
      return parsed ? [parsed] : [];
    }) : [],
    nextCursor: typeof page.next_cursor === 'string' && page.next_cursor ? page.next_cursor : null,
  };
}

export async function subscribeToCommunityActivityChanges(onChange: () => void): Promise<() => void> {
  const client = requireClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error(error.message);
  if (!data.session) return () => undefined;
  await client.realtime.setAuth(data.session.access_token);
  const channel = client.channel(`community-activities:${data.session.user.id}`);
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'community_activities' }, onChange).subscribe();
  return () => { void client.removeChannel(channel); };
}
