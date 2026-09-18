import type { CommunityActivity } from '../types';
export function personalRecordPresentation(activity: CommunityActivity) {
  const payload = activity.kind === 'rank_up' ? {} : activity.payload;
  const kind = payload.record_type;
  const label = kind === 'load' ? 'Récord de carga' : kind === 'reps' ? 'Récord de repeticiones' : kind === 'volume' ? 'Récord de volumen' : 'Récord personal';
  const unit = kind === 'reps' ? 'reps' : kind === 'volume' ? `${payload.score_unit}·reps` : payload.score_unit ?? '';
  const context = kind === 'load' ? `${payload.partition} reps` : kind === 'reps' ? `${payload.partition} ${payload.score_unit}` : '';
  const exercise = [payload.exercise_name ?? 'Ejercicio', payload.variant, context].filter(Boolean).join(' · ');
  return { label, exercise, value: `${payload.best_score ?? ''} ${unit}`.trim(), previous: payload.previous_score === undefined ? null : `${payload.previous_score} ${unit}`.trim() };
}
