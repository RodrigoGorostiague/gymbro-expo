import { supabase, supabaseConfigurationError } from './supabase';
import { AvatarId, avatarIdOrDefault } from '../constants/avatars';
import { ProfileFrameId, ProfileTitleId, profileFrameIdOrDefault, profileTitleIdOrDefault } from '../constants/profileFrames';
import { MuscleBalanceTargetId, muscleBalanceTargetForId } from '../constants/muscleBalanceTargets';

export type ProfileCategories = Record<string, string>;
export type ProfileVisibility = Record<string, boolean>;
export type RelationshipStatus = 'discover' | 'bro' | 'partner' | 'incoming_request' | 'outgoing_request';
export type RelationshipKind = 'bro' | 'partner';
export type PublicProfile = { uid: string; alias: string; avatarId: AvatarId; frameId: ProfileFrameId; titleId: ProfileTitleId | null; categories: ProfileCategories; presentationThemeId: string | null; relationshipStatus?: RelationshipStatus; requestedKind?: RelationshipKind };
export type OwnProfile = Omit<PublicProfile, 'presentationThemeId'> & {
  categoryVisibility: ProfileVisibility;
  autoShareCompletedWorkouts: boolean;
  shareRoutineTemplate: boolean;
  shareMesocycleTemplate: boolean;
  sharePerformedSetDetails: boolean;
  shareSocialActivity: boolean;
  shareSocialProgress: boolean;
  shareSocialConsistency: boolean;
  shareSocialStatistics: boolean;
  shareSocialMuscleDistribution: boolean;
  muscleBalanceTargetId: MuscleBalanceTargetId;
};
export type OwnProfileSave = Omit<OwnProfile, 'uid' | 'avatarId' | 'frameId' | 'titleId' | 'shareRoutineTemplate' | 'shareMesocycleTemplate' | 'sharePerformedSetDetails' | 'shareSocialActivity' | 'shareSocialProgress' | 'shareSocialConsistency' | 'shareSocialStatistics' | 'shareSocialMuscleDistribution' | 'muscleBalanceTargetId'> & Partial<Pick<OwnProfile, 'avatarId' | 'frameId' | 'titleId' | 'shareRoutineTemplate' | 'shareMesocycleTemplate' | 'sharePerformedSetDetails' | 'shareSocialActivity' | 'shareSocialProgress' | 'shareSocialConsistency' | 'shareSocialStatistics' | 'shareSocialMuscleDistribution' | 'muscleBalanceTargetId'>>;
export type GraphSummary = {
  targetId: string;
  relationshipKind?: RelationshipKind | null;
  requestKind?: RelationshipKind | null;
  outgoingRequest?: boolean;
  incomingRequest?: boolean;
  blocked?: boolean;
};
export type MuscleDistributionEntry = { id: string; label: string; value: number };
export type SocialProfileInsights = {
  activity?: { lastCompletedAt: string | null };
  progress?: { level: number; rank: string };
  consistency?: { workoutsLast28Days: number; activeWeeksLast90Days: number };
  statistics?: { workoutsLast90Days: number; completedExercisesLast90Days: number };
  muscleDistribution?: MuscleDistributionEntry[];
};
export type GraphCommand =
  | { command: 'sendRequest'; targetId: string; relationshipKind: RelationshipKind }
  | { command: 'respondRequest'; targetId: string; accepted: boolean }
  | { command: 'cancelRequest' | 'downgradePartner' | 'block' | 'unblock'; targetId: string };
export type SocialRealtimeUnsubscribe = () => void;

const PAGE_SIZE = 20;

function stringRecord(value: unknown): ProfileCategories {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => typeof entry === 'string'));
}

function booleanRecord(value: unknown): ProfileVisibility {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => typeof entry === 'boolean'));
}

function booleanOrDefault(value: unknown): boolean {
  return typeof value === 'boolean' ? value : true;
}

function requireClient() {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'Supabase is unavailable.');
  return supabase;
}

export function normalizeAliasPrefix(value: string): string {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

/** Creates the private profile projection required by social and reward services. */
export async function bootstrapOwnProfile(): Promise<void> {
  const { error } = await requireClient().rpc('ensure_own_profile', {});
  if (error) throw new Error(error.message);
}

function asPage(data: unknown): { profiles: PublicProfile[]; nextCursor: string | null } {
  const source = Array.isArray(data) ? data : (data as { profiles?: unknown[] } | null)?.profiles ?? [];
  const cursor = Array.isArray(data)
    ? (data[0] as Record<string, unknown> | undefined)?.next_cursor
    : (data as { next_cursor?: unknown; nextCursor?: unknown } | null)?.next_cursor
      ?? (data as { nextCursor?: unknown } | null)?.nextCursor;
  return {
    profiles: source.map((row) => {
      const value = row as Record<string, unknown>;
      const relationshipStatus = value.relationship_status ?? value.relationshipStatus;
      const requestedKind = value.requested_kind ?? value.requestedKind;
      return {
        uid: String(value.id ?? value.uid),
        alias: String(value.alias),
        avatarId: avatarIdOrDefault(value.avatar_id ?? value.avatarId),
        frameId: profileFrameIdOrDefault(value.equipped_frame_id ?? value.frameId),
        titleId: value.equipped_title_id === null || value.titleId === null ? null : profileTitleIdOrDefault(value.equipped_title_id ?? value.titleId),
        categories: (value.categories ?? {}) as ProfileCategories,
        presentationThemeId: typeof value.presentation_theme_id === 'string' ? value.presentation_theme_id : typeof value.presentationThemeId === 'string' ? value.presentationThemeId : null,
        ...(typeof relationshipStatus === 'string' ? { relationshipStatus: relationshipStatus as RelationshipStatus } : {}),
        ...(requestedKind === 'bro' || requestedKind === 'partner' ? { requestedKind } : {}),
      };
    }),
    nextCursor: typeof cursor === 'string' && cursor.length > 0 ? cursor : null,
  };
}

async function page(rpc: 'list_directory' | 'search_aliases' | 'list_circle' | 'list_requests' | 'list_blocked_users', args: Record<string, unknown>) {
  const { data, error } = await requireClient().rpc(rpc, args);
  if (error) throw new Error(error.message);
  return asPage(data);
}

export function getDiscoveryPage(cursor: string | null = null) {
  return page('list_directory', { cursor, page_size: PAGE_SIZE });
}

export function searchProfiles(prefix: string, cursor: string | null = null) {
  return page('search_aliases', { prefix: normalizeAliasPrefix(prefix), cursor, page_size: PAGE_SIZE });
}

export function getCirclePage(cursor: string | null = null) {
  return page('list_circle', { cursor, page_size: PAGE_SIZE });
}

export function getRequestPage(cursor: string | null = null) {
  return page('list_requests', { cursor, page_size: PAGE_SIZE });
}

export function getBlockedUsersPage(cursor: string | null = null) {
  return page('list_blocked_users', { cursor, page_size: PAGE_SIZE });
}

export async function getOwnProfile(): Promise<OwnProfile | null> {
  const { data, error } = await requireClient().rpc('get_own_profile', {});
  if (error) throw new Error(error.message);
  if (!data) return null;
  const profile = data as Record<string, unknown>;
  return { uid: String(profile.id), alias: String(profile.alias), avatarId: avatarIdOrDefault(profile.avatar_id), frameId: profileFrameIdOrDefault(profile.equipped_frame_id), titleId: profile.equipped_title_id === null ? null : profileTitleIdOrDefault(profile.equipped_title_id), categories: stringRecord(profile.categories), categoryVisibility: booleanRecord(profile.category_visibility), autoShareCompletedWorkouts: booleanOrDefault(profile.auto_share_completed_workouts), shareRoutineTemplate: booleanOrDefault(profile.share_routine_template), shareMesocycleTemplate: booleanOrDefault(profile.share_mesocycle_template), sharePerformedSetDetails: booleanOrDefault(profile.share_performed_set_details), shareSocialActivity: booleanOrDefault(profile.share_social_activity), shareSocialProgress: booleanOrDefault(profile.share_social_progress), shareSocialConsistency: booleanOrDefault(profile.share_social_consistency), shareSocialStatistics: booleanOrDefault(profile.share_social_statistics), shareSocialMuscleDistribution: booleanOrDefault(profile.share_social_muscle_distribution), muscleBalanceTargetId: muscleBalanceTargetForId(profile.muscle_balance_target_id) };
}

export async function saveOwnProfile(profile: OwnProfileSave): Promise<void> {
  const { error } = await requireClient().rpc('save_own_profile', {
    profile_input: {
      alias: profile.alias.trim(),
      avatar_id: avatarIdOrDefault(profile.avatarId),
      equipped_frame_id: profileFrameIdOrDefault(profile.frameId),
      equipped_title_id: profile.titleId === null ? null : profileTitleIdOrDefault(profile.titleId),
      categories: profile.categories,
      category_visibility: profile.categoryVisibility,
      auto_share_completed_workouts: profile.autoShareCompletedWorkouts,
      share_routine_template: profile.shareRoutineTemplate ?? true,
      share_mesocycle_template: profile.shareMesocycleTemplate ?? true,
      share_performed_set_details: profile.sharePerformedSetDetails ?? true,
      share_social_activity: profile.shareSocialActivity ?? true,
      share_social_progress: profile.shareSocialProgress ?? true,
      share_social_consistency: profile.shareSocialConsistency ?? true,
      share_social_statistics: profile.shareSocialStatistics ?? true,
      share_social_muscle_distribution: profile.shareSocialMuscleDistribution ?? true,
      muscle_balance_target_id: muscleBalanceTargetForId(profile.muscleBalanceTargetId),
    },
  });
  if (error) throw new Error(error.message);
}

export async function syncOwnPresentationTheme(themeId: string | null): Promise<void> {
  const { error } = await requireClient().rpc('update_own_presentation_theme', { theme_id: themeId });
  if (error) throw new Error(error.message);
}

export async function getPublicProfile(uid: string): Promise<PublicProfile | null> {
  const { data, error } = await requireClient().from('public_profiles').select('id, alias, avatar_id, equipped_frame_id, equipped_title_id, categories, presentation_theme_id').eq('id', uid).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { uid: data.id, alias: data.alias, avatarId: avatarIdOrDefault(data.avatar_id), frameId: profileFrameIdOrDefault(data.equipped_frame_id), titleId: data.equipped_title_id === null ? null : profileTitleIdOrDefault(data.equipped_title_id), categories: stringRecord(data.categories), presentationThemeId: typeof data.presentation_theme_id === 'string' ? data.presentation_theme_id : null } : null;
}

export async function getGraphSummary(targetId: string): Promise<GraphSummary> {
  const { data, error } = await requireClient().rpc('graph_summary', { target: targetId });
  if (error) throw new Error(error.message);
  return data as GraphSummary;
}

function nonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

export async function getSocialProfileInsights(targetId: string): Promise<SocialProfileInsights> {
  const { data, error } = await requireClient().rpc('get_social_profile_insights', { target: targetId });
  if (error) throw new Error(error.message);
  return asSocialProfileInsights(data);
}

function asSocialProfileInsights(data: unknown): SocialProfileInsights {
  const source = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
  const asObject = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const activity = asObject(source.activity); const progress = asObject(source.progress); const consistency = asObject(source.consistency); const statistics = asObject(source.statistics);
  return {
    ...(activity ? { activity: { lastCompletedAt: typeof activity.last_completed_at === 'string' ? activity.last_completed_at : null } } : {}),
    ...(progress && typeof progress.level === 'number' && typeof progress.rank === 'string' ? { progress: { level: progress.level, rank: progress.rank } } : {}),
    ...(consistency ? { consistency: { workoutsLast28Days: nonNegativeNumber(consistency.workouts_last_28_days), activeWeeksLast90Days: nonNegativeNumber(consistency.active_weeks_last_90_days) } } : {}),
    ...(statistics ? { statistics: { workoutsLast90Days: nonNegativeNumber(statistics.workouts_last_90_days), completedExercisesLast90Days: nonNegativeNumber(statistics.completed_exercises_last_90_days) } } : {}),
    ...(Array.isArray(source.muscle_distribution) ? { muscleDistribution: source.muscle_distribution.flatMap((entry): MuscleDistributionEntry[] => { const value = asObject(entry); return value && typeof value.id === 'string' && typeof value.label === 'string' ? [{ id: value.id, label: value.label, value: nonNegativeNumber(value.value) }] : []; }) } : {}),
  };
}

export async function getSocialProfileInsightsBatch(targetIds: readonly string[]): Promise<Record<string, SocialProfileInsights>> {
  const targets = [...new Set(targetIds)].filter(Boolean).slice(0, 50);
  if (!targets.length) return {};
  const { data, error } = await requireClient().rpc('list_social_profile_insights', { targets });
  if (error) throw new Error(error.message);
  const source = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(source).map(([id, insight]) => [id, asSocialProfileInsights(insight)]));
}

function graphCommandRpc(command: GraphCommand): [string, Record<string, unknown>] {
  if (command.command === 'sendRequest') return ['graph_send_request', { target: command.targetId, requested_kind: command.relationshipKind }];
  if (command.command === 'respondRequest') return ['graph_respond_request', { requester_input: command.targetId, accepted: command.accepted }];
  if (command.command === 'cancelRequest') return ['graph_cancel_request', { target: command.targetId }];
  if (command.command === 'downgradePartner') return ['graph_downgrade_partner', { target: command.targetId }];
  if (command.command === 'block') return ['graph_block', { target: command.targetId }];
  return ['graph_unblock', { target: command.targetId }];
}

function graphCommandError(message: string | undefined): string {
  const errors: Record<string, string> = {
    'relationship already exists': 'Esta transición de relación no está disponible.',
    'relationship transition unavailable': 'Esta transición de relación no está disponible.',
    'request already pending': 'Ya hay una solicitud pendiente entre ustedes.',
    'request unavailable': 'La solicitud ya no está disponible.',
    'partner relationship unavailable': 'La relación ya no está disponible.',
    'block unavailable': 'El bloqueo ya no está disponible.',
    'graph action blocked': 'No podés realizar esta acción con este perfil.',
    'profile unavailable': 'Este perfil ya no está disponible.',
    'self graph actions are not allowed': 'Esta acción no está disponible.',
    'self block is not allowed': 'Esta acción no está disponible.',
    'each account can have only one Partner': 'Una de las dos cuentas ya tiene un Partner.',
  };
  return errors[message ?? ''] ?? 'No se pudo completar la acción. Inténtalo de nuevo.';
}

export async function runGraphCommand(command: GraphCommand): Promise<GraphSummary> {
  const client = requireClient();
  const [rpc, args] = graphCommandRpc(command);
  const { error } = await client.rpc(rpc, args);
  if (error) throw new Error(graphCommandError(error.message));
  const { data, error: summaryError } = await client.rpc('graph_summary', { target: command.targetId });
  if (summaryError || !data) throw new Error('No se pudo completar la acción. Inténtalo de nuevo.');
  return data as GraphSummary;
}

/**
 * Uses RLS-authorized Postgres Changes strictly as an invalidation signal.
 * Callers must refetch safe projections/RPC summaries instead of reading event payloads.
 */
export async function subscribeToSocialGraphChanges(onChange: () => void): Promise<SocialRealtimeUnsubscribe> {
  const client = requireClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error(error.message);
  const session = data.session;
  if (!session) return () => undefined;

  await client.realtime.setAuth(session.access_token);
  const channel = client.channel(`social-graph:${session.user.id}`);
  const change = () => onChange();
  channel
    .on('postgres_changes', { event: '*', schema: 'public', table: 'public_profiles' }, change)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'relationships', filter: `member_low=eq.${session.user.id}` }, change)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'relationships', filter: `member_high=eq.${session.user.id}` }, change)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'relationship_requests', filter: `requester_id=eq.${session.user.id}` }, change)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'relationship_requests', filter: `recipient_id=eq.${session.user.id}` }, change)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks', filter: `blocker_id=eq.${session.user.id}` }, change)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks', filter: `blocked_id=eq.${session.user.id}` }, change)
    .subscribe();

  return () => { void client.removeChannel(channel); };
}
