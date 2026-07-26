import { vi } from 'vitest';

export const ImpactFeedbackStyle = { Light: 'Light', Heavy: 'Heavy' };
export const NotificationFeedbackType = { Warning: 'Warning' };
export const impactAsync = vi.fn(async () => undefined);
export const notificationAsync = vi.fn(async () => undefined);
