import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  asReceiptOutcome,
  asTicketOutcome,
  EXPO_PUSH_URL,
  EXPO_RECEIPTS_URL,
  expoPushMessage,
  type DispatchDelivery,
} from './logic.ts';

const BATCH_SIZE = 100;
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

function dispatchSecretMatches(request: Request): boolean {
  const configured = Deno.env.get('NOTIFICATION_DISPATCH_SECRET');
  const authorization = request.headers.get('authorization');
  return Boolean(configured && authorization === `Bearer ${configured}`);
}

function apiClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) throw new Error('Notification dispatcher is not configured.');
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function expoPost(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== 'object') {
    throw new Error(`Expo push request failed (${response.status}).`);
  }
  return payload as Record<string, unknown>;
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object') : [];
}

async function settleReceipts(client: ReturnType<typeof apiClient>) {
  const { data, error } = await client.rpc('claim_notification_push_receipts', { batch_size: BATCH_SIZE });
  if (error) throw new Error(error.message);
  const claimed = rows(data);
  if (!claimed.length) return 0;

  const ticketIds = claimed.flatMap((row) => typeof row.expo_ticket_id === 'string' ? [row.expo_ticket_id] : []);
  if (!ticketIds.length) return 0;
  const response = await expoPost(EXPO_RECEIPTS_URL, { ids: ticketIds });
  const receipts = response.data && typeof response.data === 'object' && !Array.isArray(response.data)
    ? response.data as Record<string, unknown>
    : {};
  const outcomes = claimed.flatMap((row) => {
    const ticketId = row.expo_ticket_id as string;
    const receipt = receipts[ticketId];
    // Expo receipts are asynchronous. A missing receipt is not a delivery
    // failure and must remain ticketed for the next polling pass.
    if (!receipt || typeof receipt !== 'object') return [];
    const outcome = asReceiptOutcome(receipt && typeof receipt === 'object' ? receipt : undefined);
    return [{ delivery_id: row.delivery_id, ...outcome }];
  });
  if (!outcomes.length) return 0;
  const { error: recordError } = await client.rpc('record_notification_push_receipts', { receipt_outcomes: outcomes });
  if (recordError) throw new Error(recordError.message);
  return outcomes.length;
}

async function dispatchDeliveries(client: ReturnType<typeof apiClient>) {
  const { data, error } = await client.rpc('claim_notification_push_deliveries', { batch_size: BATCH_SIZE });
  if (error) throw new Error(error.message);
  const deliveries = rows(data) as unknown as DispatchDelivery[];
  if (!deliveries.length) return 0;

  try {
    const response = await expoPost(EXPO_PUSH_URL, deliveries.map(expoPushMessage));
    const tickets = Array.isArray(response.data) ? response.data : [];
    const outcomes = deliveries.map((delivery, index) => ({
      delivery_id: delivery.delivery_id,
      ...asTicketOutcome(tickets[index] && typeof tickets[index] === 'object' ? tickets[index] : undefined),
    }));
    const { error: recordError } = await client.rpc('record_notification_push_tickets', { ticket_outcomes: outcomes });
    if (recordError) throw new Error(recordError.message);
  } catch (error) {
    const { error: recordError } = await client.rpc('record_notification_push_transport_failure', {
      delivery_ids: deliveries.map(({ delivery_id }) => delivery_id),
      failure_message: error instanceof Error ? error.message : 'Expo push request failed.',
    });
    if (recordError) throw new Error(recordError.message);
    throw error;
  }
  return deliveries.length;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!dispatchSecretMatches(request)) return json({ error: 'unauthorized' }, 401);

  try {
    const client = apiClient();
    const receipts = await settleReceipts(client);
    const dispatched = await dispatchDeliveries(client);
    console.info(JSON.stringify({ event: 'notification_dispatch_completed', receipts, dispatched }));
    return json({ receipts, dispatched });
  } catch (error) {
    console.error('notification-dispatch failed', error);
    return json({ error: 'dispatch_failed' }, 502);
  }
});
