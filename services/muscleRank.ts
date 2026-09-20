import { supabase, supabaseConfigurationError } from './supabase';
import { MUSCLE_VOLUME_AXES } from '../utils/muscleVolume';
import type { MuscleRanks } from '../utils/muscleRank';

export type MuscleRankReward = { muscleId: string; rankIndex: number; amount: number };
export type MuscleRankProgress = { attemptId: string; before: MuscleRanks; after: MuscleRanks; rewards: MuscleRankReward[] };
const dateOrNull = (v: unknown) => v === null || typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v));
export function parseMuscleRanks(value: unknown): MuscleRanks | null {
  if (value === null) return null;
  const v = value as MuscleRanks;
  if (!v || v.policyVersion !== 1 || typeof v.subjectId !== 'string' || !Number.isFinite(Date.parse(v.asOf)) || typeof v.paused !== 'boolean'
    || !dateOrNull(v.pauseStartsOn) || !dateOrNull(v.pauseEndsOn) || !Array.isArray(v.axes) || v.axes.length !== MUSCLE_VOLUME_AXES.length) throw new Error('Los rangos musculares requieren una versión compatible del servidor.');
  v.axes.forEach((axis, i) => {
    if (axis.id !== MUSCLE_VOLUME_AXES[i].id || !dateOrNull(axis.lastActivity)
      || ![axis.xp, axis.peakXp, axis.protectionDays, axis.earnedToday, axis.earnedSevenDays].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)
      || !Number.isInteger(axis.xp) || !Number.isInteger(axis.peakXp) || !Number.isInteger(axis.protectionDays)
      || axis.xp > axis.peakXp || axis.peakXp > 11000 || axis.protectionDays > 7 || axis.earnedToday > 60 || axis.earnedSevenDays > 120) throw new Error('Progreso muscular inválido.');
  });
  return v;
}
async function rpc(name: string, args: Record<string, unknown>) {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'Sin conexión.');
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
export async function getProfileMuscleRanks(subjectId: string, preview = false) {
  const ranks = parseMuscleRanks(await rpc('get_profile_muscle_ranks', { target: subjectId, preview }));
  if (ranks && ranks.subjectId !== subjectId) throw new Error('Los rangos no corresponden al perfil solicitado.');
  return ranks;
}
export async function setMuscleRankPause(paused: boolean) {
  await rpc('set_muscle_rank_pause', { paused_input: paused });
}
export async function getWorkoutMuscleRankProgress(attemptId: string, subjectId: string): Promise<MuscleRankProgress> {
  const value = await rpc('get_workout_muscle_rank_progress', { attempt_id: attemptId });
  const before = parseMuscleRanks(value?.before), after = parseMuscleRanks(value?.after);
  if (value?.attemptId !== attemptId || !before || !after || before.subjectId !== subjectId || after.subjectId !== subjectId
    || before.asOf !== after.asOf || !Array.isArray(value.rewards) || value.rewards.some((r: MuscleRankReward) => !MUSCLE_VOLUME_AXES.some(a => a.id === r.muscleId) || !Number.isInteger(r.rankIndex) || r.rankIndex < 1 || r.rankIndex > 7 || r.amount !== 25)) throw new Error('No se pudo verificar la progresión de esta sesión.');
  return { attemptId, before, after, rewards: value.rewards };
}
