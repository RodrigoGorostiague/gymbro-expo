import { supabase } from './supabase';
export type RecordGemReward = { amount: 25; recordType: 'load' | 'reps' | 'volume'; exerciseId: string; variant: string; unit: 'kg' | 'lb' };
/** Read immutable server-awarded evidence, never infer payment from current comparisons. */
export async function getRecordGemRewards(attemptId: string): Promise<RecordGemReward[]> {
  if (!supabase) throw new Error('No se pudo consultar la recompensa confirmada.');
  const { data, error } = await supabase.rpc('get_record_gem_rewards', { attempt_id_input: attemptId });
  if (error) throw error;
  if (!Array.isArray(data) || data.some((value) => !value || value.amount !== 25
    || !['load', 'reps', 'volume'].includes(value.recordType) || !['kg', 'lb'].includes(value.unit)
    || typeof value.exerciseId !== 'string' || typeof value.variant !== 'string')) {
    throw new Error('La confirmación de recompensas no es válida.');
  }
  return data;
}
