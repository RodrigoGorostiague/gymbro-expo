import { supabase } from './supabase';
import { AnthropometricMetricType, BodyMetric } from '../types';
import { assertToday } from '../utils/bodyEvolution';

function client() {
  if (!supabase) throw new Error('Las mediciones no están configuradas.');
  return supabase;
}
export async function loadBodyEvolution(owner: string): Promise<BodyMetric[]> {
  const { data, error } = await client().rpc('list_body_evolution');
  if (error) throw new Error(`No se pudo cargar el historial: ${error.message}`);
  return (data ?? []).map((row: any) => ({ id: row.id, owner, metricType: row.metric_type, value: Number(row.value), unit: row.unit, measuredAt: row.measured_at, source: row.source, ...(row.record_day ? { day: row.record_day } : {}) }));
}
export async function saveBodyDay(day: string, measurements: { metricType: AnthropometricMetricType; value: number }[]) {
  assertToday(day);
  if (!measurements.length || measurements.some(m => !Number.isFinite(m.value) || m.value <= 0 || m.value >= 100000)) throw new Error('Ingresa al menos una medida válida mayor a cero.');
  const { error } = await client().rpc('save_body_day', { day_input: day, timezone_input: Intl.DateTimeFormat().resolvedOptions().timeZone, measurements_input: measurements });
  if (error) throw new Error(`No se guardaron las medidas: ${error.message}`);
}
export async function deleteBodyMeasurements(ids: string[]) {
  if (!ids.length) return;
  const { error } = await client().rpc('delete_body_measurements', { ids_input: ids });
  if (error) throw new Error(`No se eliminaron las medidas: ${error.message}`);
}
