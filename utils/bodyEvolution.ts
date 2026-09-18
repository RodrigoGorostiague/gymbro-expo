import { BodyMetric } from '../types';

export const BODY_POSES = [
  { id: 'front-biceps', title: 'Doble bíceps', subtitle: 'De frente · cuerpo completo', help: 'Apoya el teléfono a la altura del torso. Eleva ambos brazos, flexiona los codos y mantén los pies sobre las marcas.' },
  { id: 'front-legs', title: 'Piernas', subtitle: 'De frente · cintura a pies', help: 'Encuadra desde la cintura hasta los pies. Reparte el peso entre ambas piernas y repite la misma separación.' },
  { id: 'back', title: 'Espalda', subtitle: 'De espaldas · cuerpo completo', help: 'Alinea los pies antes de girarte. Separa ligeramente los brazos y espera la señal sonora de captura.' },
  { id: 'side-glutes', title: 'Perfil y glúteos', subtitle: 'Perfil izquierdo · postura natural', help: 'Muestra siempre tu lado izquierdo. Mantén la pelvis neutra, sin exagerar el arco lumbar. Esta guía está disponible para cualquier persona.' },
] as const;
export type BodyPose = typeof BODY_POSES[number]['id'];
export type BodyPhoto = { id: string; day: string; pose: BodyPose; uri: string; capturedAt: string };
export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function elapsedDays(a: string, b: string): number {
  return Math.abs(Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000));
}
export function dayLabel(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function groupBodyHistory(metrics: BodyMetric[], photos: BodyPhoto[]) {
  const groups = new Map<string, { day: string; metrics: BodyMetric[]; photos: BodyPhoto[] }>();
  const get = (day: string) => {
    if (!groups.has(day)) groups.set(day, { day, metrics: [], photos: [] });
    return groups.get(day)!;
  };
  // Legacy rows are retained, including repeated measurements on the same day.
  for (const metric of metrics) get((metric as BodyMetric & { day?: string }).day ?? localDay(new Date(metric.measuredAt))).metrics.push(metric);
  for (const photo of photos) get(photo.day).photos.push(photo);
  return [...groups.values()].sort((a, b) => b.day.localeCompare(a.day));
}
export function assertToday(day: string, now = new Date()) {
  if (day !== localDay(now)) throw new Error('El día cambió. Vuelve a Hoy para crear una captura nueva.');
}
