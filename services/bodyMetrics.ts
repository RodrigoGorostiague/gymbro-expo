import { BodyMetric } from '../types';
import { supabase, supabaseConfigurationError } from './supabase';

type BodyMetricRow = {
  id: string;
  metric_type: 'body_weight';
  value: number | string;
  unit: 'kg';
  measured_at: string;
  source: 'manual';
  notes: string | null;
};

function requireClient() {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'Las mediciones no están configuradas.');
  return supabase;
}

function toMetric(row: BodyMetricRow, owner: string): BodyMetric {
  const value = Number(row.value);
  if (!row.id || !Number.isFinite(value) || value <= 0 || !row.measured_at) {
    throw new Error('La medición guardada tiene un formato inválido.');
  }
  return {
    id: row.id,
    owner,
    metricType: row.metric_type,
    value,
    unit: row.unit,
    measuredAt: row.measured_at,
    source: row.source,
    ...(row.notes ? { notes: row.notes } : {}),
  };
}

export async function loadBodyMetrics(owner: string): Promise<BodyMetric[]> {
  const { data, error } = await requireClient().rpc('list_body_metrics');
  if (error) throw new Error(`No se pudieron cargar las mediciones: ${error.message}`);
  return ((data ?? []) as BodyMetricRow[]).map((row) => toMetric(row, owner));
}

export async function recordBodyWeight(owner: string, input: { value: number; measuredAt: string; notes?: string }): Promise<BodyMetric> {
  const { data, error } = await requireClient().rpc('record_body_metric', {
    metric_type_input: 'body_weight',
    value_input: input.value,
    unit_input: 'kg',
    measured_at_input: input.measuredAt,
    notes_input: input.notes ?? null,
  });
  if (error) throw new Error(`No se pudo guardar el peso: ${error.message}`);
  const row = (data as BodyMetricRow[] | null)?.[0];
  if (!row) throw new Error('No recibimos la medición guardada.');
  return toMetric(row, owner);
}
