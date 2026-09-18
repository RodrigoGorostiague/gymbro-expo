import { Mesocycle, PrivatePlanShareImport, PrivatePlanShareRequest, ProfilePlanLibrary, Routine } from '../types';
import { avatarIdOrDefault } from '../constants/avatars';
import { supabase, supabaseConfigurationError } from './supabase';

function requireClient() {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'La planificación compartida no está configurada.');
  return supabase;
}

function asRoutine(value: unknown): Routine | null {
  if (!value || typeof value !== 'object') return null;
  const routine = value as Routine;
  return typeof routine.id === 'string' && typeof routine.name === 'string'
    && Array.isArray(routine.muscleGroups) && Array.isArray(routine.exercises) ? routine : null;
}

function asMesocycle(value: unknown): Mesocycle | null {
  if (!value || typeof value !== 'object') return null;
  const mesocycle = value as Mesocycle;
  return typeof mesocycle.id === 'string' && typeof mesocycle.name === 'string'
    && Array.isArray(mesocycle.weeks) && Number.isInteger(mesocycle.durationWeeks) ? mesocycle : null;
}

function asLibrary(value: unknown): ProfilePlanLibrary {
  const input = value as Record<string, unknown> | null;
  return {
    routines: Array.isArray(input?.routines) ? input.routines.flatMap((item) => {
      const routine = asRoutine(item);
      return routine ? [routine] : [];
    }) : [],
    mesocycles: Array.isArray(input?.mesocycles) ? input.mesocycles.flatMap((item) => {
      const mesocycle = asMesocycle(item);
      return mesocycle ? [mesocycle] : [];
    }) : [],
  };
}

export async function getProfilePlanLibrary(profileId: string): Promise<ProfilePlanLibrary> {
  const { data, error } = await requireClient().rpc('get_profile_plan_library', { source_profile_id: profileId });
  if (error) throw new Error(error.message);
  return asLibrary(data);
}

export async function createPrivatePlanShareRequest(targetId: string, kind: 'routine' | 'mesocycle', contentId: string): Promise<string> {
  const { data, error } = await requireClient().rpc('create_private_plan_share_request', {
    target_profile_id: targetId,
    content_kind_input: kind,
    content_id: contentId,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function listReceivedPrivatePlanShareRequests(): Promise<PrivatePlanShareRequest[]> {
  const { data, error } = await requireClient().rpc('list_received_private_plan_share_requests');
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || typeof row.senderAlias !== 'string'
      || (row.contentKind !== 'routine' && row.contentKind !== 'mesocycle') || typeof row.createdAt !== 'string') return [];
    const library = asLibrary((row.snapshot ?? {}) as Record<string, unknown>);
    const mesocycle = asMesocycle((row.snapshot as Record<string, unknown> | undefined)?.mesocycle);
    return [{
      id: row.id,
      senderAlias: row.senderAlias,
      senderAvatarId: avatarIdOrDefault(row.senderAvatarId),
      senderFrameId: typeof row.senderFrameId === 'string' ? row.senderFrameId : undefined,
      senderTitleId: typeof row.senderTitleId === 'string' ? row.senderTitleId : undefined,
      senderThemeId: typeof row.senderThemeId === 'string' ? row.senderThemeId : null,
      contentKind: row.contentKind,
      createdAt: row.createdAt,
      snapshot: { ...library, ...(mesocycle ? { mesocycle } : {}) },
    }];
  });
}

export async function acceptPrivatePlanShareRequest(requestId: string): Promise<PrivatePlanShareImport> {
  const { data, error } = await requireClient().rpc('accept_private_plan_share_request', { request_id: requestId });
  if (error) throw new Error(error.message);
  const result = data as Record<string, unknown> | null;
  return {
    routineIds: Array.isArray(result?.routineIds) ? result.routineIds.filter((id): id is string => typeof id === 'string') : [],
    mesocycleId: typeof result?.mesocycleId === 'string' ? result.mesocycleId : null,
  };
}

export async function rejectPrivatePlanShareRequest(requestId: string): Promise<void> {
  const { error } = await requireClient().rpc('reject_private_plan_share_request', { request_id: requestId });
  if (error) throw new Error(error.message);
}
