export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
export const SOCIAL_CHANNEL_ID = 'social_v2';
export const COMMUNITY_CHANNEL_ID = 'community_v2';
export const SOCIAL_NOTIFICATION_SOUND = 'notification_social.wav';

export type DispatchDelivery = {
  delivery_id: string;
  notification_id: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  kind: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
};

export type ExpoPushTicket = {
  status?: unknown;
  id?: unknown;
  message?: unknown;
  details?: unknown;
};

export type ExpoPushReceipt = {
  status?: unknown;
  message?: unknown;
  details?: unknown;
};

const SOCIAL_KINDS = new Set([
  'relationship_request',
  'relationship_accepted',
  'partner_message',
]);

export function notificationChannel(kind: string): string {
  return SOCIAL_KINDS.has(kind) ? SOCIAL_CHANNEL_ID : COMMUNITY_CHANNEL_ID;
}

export function internalNotificationUrl(data: Record<string, unknown>): string | undefined {
  const url = data.url;
  return typeof url === 'string' && url.startsWith('/') ? url : undefined;
}

export function expoPushMessage(delivery: DispatchDelivery): Record<string, unknown> {
  const url = internalNotificationUrl(delivery.data);
  return {
    to: delivery.token,
    title: delivery.title,
    ...(delivery.body ? { body: delivery.body } : {}),
    sound: SOCIAL_NOTIFICATION_SOUND,
    channelId: notificationChannel(delivery.kind),
    priority: 'high',
    data: {
      notificationId: delivery.notification_id,
      ...(url ? { url } : {}),
    },
  };
}

export function asTicketOutcome(ticket: ExpoPushTicket | undefined): {
  status: 'ticketed' | 'retry';
  ticketId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  raw: ExpoPushTicket | null;
} {
  if (ticket?.status === 'ok' && typeof ticket.id === 'string') {
    return { status: 'ticketed', ticketId: ticket.id, errorCode: null, errorMessage: null, raw: ticket };
  }
  const details = ticket?.details;
  const errorCode = details && typeof details === 'object' && !Array.isArray(details) && typeof (details as Record<string, unknown>).error === 'string'
    ? (details as Record<string, unknown>).error as string
    : null;
  return {
    status: 'retry',
    ticketId: null,
    errorCode,
    errorMessage: typeof ticket?.message === 'string' ? ticket.message : 'Expo push ticket was not accepted.',
    raw: ticket ?? null,
  };
}

export function isPermanentInvalidDeviceReceipt(receipt: ExpoPushReceipt | undefined): boolean {
  if (receipt?.status !== 'error') return false;
  const details = receipt.details;
  return Boolean(
    details
    && typeof details === 'object'
    && !Array.isArray(details)
    && (details as Record<string, unknown>).error === 'DeviceNotRegistered',
  );
}

export function asReceiptOutcome(receipt: ExpoPushReceipt | undefined): {
  status: 'delivered' | 'retry' | 'invalid_device';
  errorCode: string | null;
  errorMessage: string | null;
  raw: ExpoPushReceipt | null;
} {
  if (receipt?.status === 'ok') {
    return { status: 'delivered', errorCode: null, errorMessage: null, raw: receipt };
  }
  const details = receipt?.details;
  const errorCode = details && typeof details === 'object' && !Array.isArray(details) && typeof (details as Record<string, unknown>).error === 'string'
    ? (details as Record<string, unknown>).error as string
    : null;
  return {
    status: isPermanentInvalidDeviceReceipt(receipt) ? 'invalid_device' : 'retry',
    errorCode,
    errorMessage: typeof receipt?.message === 'string' ? receipt.message : 'Expo push receipt was unavailable.',
    raw: receipt ?? null,
  };
}
