import type { AvatarId } from '../constants/avatars';
import { CommunityActivityPage, CommunityRankUpActivity, ExperienceProgress, TrainingRank } from '../types';
import { supabase, supabaseConfigurationError } from './supabase';

const ranks: readonly TrainingRank[] = ['Principiante', 'Intermedio', 'Avanzado', 'GymBro', 'GymRat', 'G-Boom', 'Alfa', 'Sigma'];

function requireClient() {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'El progreso remoto no está configurado.');
  return supabase;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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

function asActivity(value: unknown): CommunityRankUpActivity | null {
  if (!isRecord(value) || value.kind !== 'rank_up' || typeof value.id !== 'string'
    || typeof value.author_alias !== 'string' || typeof value.created_at !== 'string' || !isRecord(value.payload)
    || !Number.isInteger(value.payload.level) || !ranks.includes(value.payload.rank as TrainingRank)) return null;
  return {
    id: value.id,
    kind: 'rank_up',
    authorAlias: value.author_alias,
    authorAvatarId: (typeof value.author_avatar_id === 'string' ? value.author_avatar_id : 'capybara-athlete') as AvatarId,
    authorThemeId: typeof value.author_theme_id === 'string' ? value.author_theme_id : null,
    level: value.payload.level as number,
    rank: value.payload.rank as TrainingRank,
    createdAt: value.created_at,
  };
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
