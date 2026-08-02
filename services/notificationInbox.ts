import { supabase, supabaseConfigurationError } from './supabase';

export type NotificationInboxItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export type NotificationDevicePlatform = 'ios' | 'android' | 'web';

function client() {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'Supabase is unavailable.');
  return supabase;
}

function asNotification(value: unknown): NotificationInboxItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.kind !== 'string' || typeof row.title !== 'string' || typeof row.created_at !== 'string') return null;
  if (row.body !== null && typeof row.body !== 'string') return null;
  if (row.read_at !== null && typeof row.read_at !== 'string') return null;
  if (!row.data || typeof row.data !== 'object' || Array.isArray(row.data)) return null;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body as string | null,
    data: row.data as Record<string, unknown>,
    readAt: row.read_at as string | null,
    createdAt: row.created_at,
  };
}

export async function listNotificationInbox(limit: number = 50): Promise<NotificationInboxItem[]> {
  const { data, error } = await client().rpc('list_notification_inbox', { limit_count: limit });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data.flatMap((row) => {
    const notification = asNotification(row);
    return notification ? [notification] : [];
  }) : [];
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await client().rpc('mark_notification_read', { notification_id: notificationId });
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await client().rpc('mark_all_notifications_read', {});
  if (error) throw new Error(error.message);
}

export async function registerNotificationDeviceToken(
  token: string,
  platform: NotificationDevicePlatform,
): Promise<void> {
  const { error } = await client().rpc('register_notification_device_token', {
    token_input: token,
    platform_input: platform,
  });
  if (error) throw new Error(error.message);
}

export async function unregisterNotificationDeviceToken(token: string): Promise<void> {
  const { error } = await client().rpc('unregister_notification_device_token', {
    token_input: token,
  });
  if (error) throw new Error(error.message);
}
