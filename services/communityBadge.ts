import { supabase, supabaseConfigurationError } from './supabase';

export type CommunityBadgeCounts = {
  incomingRequests: number;
  unreadNotifications: number;
  jointInvitations: number;
  planShareRequests: number;
  total: number;
};

function isCounts(value: unknown): value is CommunityBadgeCounts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const counts = value as Record<string, unknown>;
  return ['incomingRequests', 'unreadNotifications', 'jointInvitations', 'planShareRequests', 'total']
    .every((key) => Number.isInteger(counts[key]) && (counts[key] as number) >= 0);
}

export async function getCommunityBadgeCounts(): Promise<CommunityBadgeCounts> {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'Los pendientes de Comunidad no están configurados.');
  const { data, error } = await supabase.rpc('get_community_badge_counts');
  if (error) throw new Error(error.message);
  if (!isCounts(data)) throw new Error('Los pendientes de Comunidad tienen un formato inválido.');
  return data;
}
