import { supabase } from './supabase';
import { asActivity } from './experience';
import { asRecap, recapPayload } from './workoutRecapFeed';
import type { CommunityActivity, WorkoutRecap, WorkoutRecapInput } from '../types';

export type CompletionPreview = {
  confirmed: boolean;
  status: 'published' | 'pending' | 'private' | 'joint' | 'removed' | 'review';
  reviewRequired: boolean;
  sharingEnabled: boolean;
  joint: boolean;
  records: Array<{ activity: CommunityActivity; selected: boolean }>;
  recap: WorkoutRecap | null;
  activities: CommunityActivity[];
};
export async function getWorkoutCompletionPreview(attemptId: string): Promise<CompletionPreview> {
  if (!supabase) throw new Error('Sin conexión para consultar publicaciones.');
  const { data, error } = await supabase.rpc('get_workout_completion_preview', { attempt_id_input: attemptId });
  if (error) throw error;
  return parseCompletionPreview(data);
}

export function parseCompletionPreview(data: any): CompletionPreview {
  if (!data || typeof data.confirmed !== 'boolean' || !['published', 'pending', 'private', 'joint', 'removed', 'review'].includes(data.status) || !Array.isArray(data.activities)) throw new Error('Respuesta de publicaciones inválida.');
  const records = Array.isArray(data.records) ? data.records.map((value: any) => {
    const activity = asActivity(value);
    if (!activity || activity.kind !== 'personal_record' || typeof value.selected !== 'boolean') throw new Error('No se pudieron verificar todos los récords.');
    return { activity, selected: value.selected };
  }) : [];
  if (data.review_required === true && (!Array.isArray(data.records) || typeof data.sharing_enabled !== 'boolean' || typeof data.joint !== 'boolean')) throw new Error('La revisión de récords no está lista.');
  return { reviewRequired: data.review_required === true, sharingEnabled: data.sharing_enabled === true, joint: data.joint === true,
    records,
    confirmed: data.confirmed, status: data.status, recap: data.recap ? asRecap(data.recap) : null,
    activities: data.activities.flatMap((value: unknown) => { const activity = asActivity(value); return activity?.kind === 'personal_record' ? [activity] : []; }) };
}

export async function stageWorkoutCompletion(attemptId: string, input: WorkoutRecapInput, publicationKey: string): Promise<boolean> {
  if (!supabase) throw new Error('No se pudo preparar la publicación.');
  const { data, error } = await supabase.rpc('stage_workout_completion', { attempt_id_input: attemptId, recap_input: recapPayload(input, publicationKey) });
  if (error) throw error;
  if (typeof data !== 'boolean') throw new Error('La preparación no fue confirmada.');
  return data;
}
export async function confirmWorkoutCompletion(attemptId: string, selectedRecordIds: string[]): Promise<CompletionPreview> {
  if (!supabase) throw new Error('No se pudo confirmar la publicación.');
  const { data, error } = await supabase.rpc('confirm_workout_completion', { attempt_id_input: attemptId, selected_record_ids: selectedRecordIds });
  if (error) throw error;
  return parseCompletionPreview(data);
}
export async function listPendingWorkoutReviews(): Promise<Array<{ attemptId: string; routineName: string }>> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('list_pending_workout_reviews');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('No se pudieron consultar los cierres pendientes.');
  return data.flatMap((value) => typeof value?.attempt_id === 'string' && typeof value?.routine_name === 'string' ? [{ attemptId: value.attempt_id, routineName: value.routine_name }] : []);
}
