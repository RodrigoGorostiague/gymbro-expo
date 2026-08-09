export function feedDayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function formatFeedDay(value: string, now: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'SIN FECHA';
  const today = new Date(now);
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const currentDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const daysAgo = Math.round((currentDay - day) / 86_400_000);
  if (daysAgo === 0) return 'HOY';
  if (daysAgo === 1) return 'AYER';
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(date).toUpperCase();
}

export function formatRelativeTime(value: string, now: number): string {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '';
  const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1_000));
  if (elapsedSeconds < 60) return 'ahora';
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'ayer' : `hace ${days} días`;
}
