import { supabase, supabaseConfigurationError } from './supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

export type ProfileCategories = Record<string, string>;
export type ProfileVisibility = Record<string, boolean>;
export type RelationshipStatus = 'discover' | 'bro' | 'partner' | 'incoming_request' | 'outgoing_request';
export type RelationshipKind = 'bro' | 'partner';
export type PublicProfile = { uid: string; alias: string; categories: ProfileCategories; relationshipStatus?: RelationshipStatus; requestedKind?: RelationshipKind };
export type OwnProfile = PublicProfile & {
  categoryVisibility: ProfileVisibility;
  autoShareCompletedWorkouts: boolean;
  shareRoutineTemplate: boolean;
  shareMesocycleTemplate: boolean;
  sharePerformedSetDetails: boolean;
};
export type OwnProfileSave = Omit<OwnProfile, 'uid' | 'shareRoutineTemplate' | 'shareMesocycleTemplate' | 'sharePerformedSetDetails'> & Partial<Pick<OwnProfile, 'shareRoutineTemplate' | 'shareMesocycleTemplate' | 'sharePerformedSetDetails'>>;
export type GraphSummary = {
  targetId: string;
  relationshipKind?: RelationshipKind | null;
  requestKind?: RelationshipKind | null;
  outgoingRequest?: boolean;
  incomingRequest?: boolean;
  blocked?: boolean;
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
        categories: (value.categories ?? {}) as ProfileCategories,
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
  const { data, error } = await requireClient().from('profiles').select('id, alias, categories, category_visibility, auto_share_completed_workouts, share_routine_template, share_mesocycle_template, share_performed_set_details').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { uid: data.id, alias: data.alias, categories: stringRecord(data.categories), categoryVisibility: booleanRecord(data.category_visibility), autoShareCompletedWorkouts: booleanOrDefault(data.auto_share_completed_workouts), shareRoutineTemplate: booleanOrDefault(data.share_routine_template), shareMesocycleTemplate: booleanOrDefault(data.share_mesocycle_template), sharePerformedSetDetails: booleanOrDefault(data.share_performed_set_details) };
}

export async function saveOwnProfile(profile: OwnProfileSave): Promise<void> {
  const { data: auth, error: authError } = await requireClient().auth.getUser();
  if (authError || !auth.user) throw new Error('Authentication is required to save a profile.');
  const { error } = await requireClient().from('profiles').upsert({
    id: auth.user.id,
    alias: profile.alias.trim(),
    categories: profile.categories,
    category_visibility: profile.categoryVisibility,
    auto_share_completed_workouts: profile.autoShareCompletedWorkouts,
    share_routine_template: profile.shareRoutineTemplate ?? true,
    share_mesocycle_template: profile.shareMesocycleTemplate ?? true,
    share_performed_set_details: profile.sharePerformedSetDetails ?? true,
  });
  if (error) throw new Error(error.message);
}

export async function getPublicProfile(uid: string): Promise<PublicProfile | null> {
  const { data, error } = await requireClient().from('public_profiles').select('id, alias, categories').eq('id', uid).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { uid: data.id, alias: data.alias, categories: data.categories ?? {} } : null;
}

export async function getGraphSummary(targetId: string): Promise<GraphSummary> {
  const { data, error } = await requireClient().rpc('graph_summary', { target: targetId });
  if (error) throw new Error(error.message);
  return data as GraphSummary;
}

export async function runGraphCommand(command: GraphCommand): Promise<GraphSummary> {
  const { data, error } = await requireClient().functions.invoke('social-graph', { body: command });
  if (error instanceof FunctionsHttpError) {
    let safeMessage: string | null = null;
    try {
      const body = await error.context.json() as { message?: unknown };
      if (typeof body.message === 'string') safeMessage = body.message;
    } catch {
      // Fall back to the SDK error if the response body is not valid JSON.
    }
    if (safeMessage) throw new Error(safeMessage);
  }
  if (error) throw new Error(error.message);
  if (!data?.summary) throw new Error('The relationship action did not return a summary.');
  return data.summary as GraphSummary;
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
