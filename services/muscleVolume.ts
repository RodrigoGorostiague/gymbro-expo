import { supabase, supabaseConfigurationError } from './supabase';
import { MUSCLE_VOLUME_AXES, type MuscleVolume, type VolumeDays, validVolumeGoals } from '../utils/muscleVolume';

export function parseMuscleVolume(value: unknown): MuscleVolume | null {
  if (value === null) return null;
  const v = value as MuscleVolume;
  if (!v || v.metricVersion !== 2 || v.taxonomyVersion !== 1 || ![7,28,90].includes(v.days) || typeof v.subjectId !== 'string' || !Number.isFinite(Date.parse(v.asOf))) throw new Error('La distribución muscular requiere una versión compatible del servidor.');
  for (const period of [v.current,v.previous]) {
    if (!period || !Number.isFinite(Date.parse(period.start)) || !Number.isFinite(Date.parse(period.end)) || period.axes?.length !== MUSCLE_VOLUME_AXES.length) throw new Error('Distribución muscular incompleta.');
    if (![period.eligibleSets,period.unclassifiedSets,period.unsupportedSets,period.effortCount].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)) throw new Error('Cobertura muscular inválida.');
    period.axes.forEach((axis,index) => {
      if (axis.id !== MUSCLE_VOLUME_AXES[index].id || ![axis.direct,axis.indirect,axis.equivalent,axis.days,axis.effortCount,axis.rirCount,axis.rirSum,axis.rpeCount,axis.rpeSum].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)) throw new Error('Datos musculares inválidos.');
    });
  }
  return { ...v, goals: validVolumeGoals(v.goals), shareGoals: v.shareGoals === true };
}

export async function getProfileMuscleVolume(subjectId: string, days: VolumeDays, preview = false): Promise<MuscleVolume | null> {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'Sin conexión.');
  const { data,error } = await supabase.rpc('get_profile_muscle_volume',{target:subjectId,window_days:days,preview});
  if (error) throw new Error(error.message);
  const result = parseMuscleVolume(data);
  if (result && (result.subjectId !== subjectId || result.days !== days)) throw new Error('La distribución no corresponde al perfil solicitado.');
  return result;
}

export async function saveMuscleVolumeGoals(goals: Record<string,number>, share: boolean) {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'Sin conexión.');
  const { error } = await supabase.rpc('save_muscle_volume_goals',{goals_input:goals,share_input:share});
  if (error) throw new Error(error.message);
}
