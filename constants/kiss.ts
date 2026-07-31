import { UserProfile } from '../types';

export type PartnerMessageType = 'kiss' | 'muscle' | 'angry' | 'cry';

export const PARTNER_MESSAGES: Record<
  PartnerMessageType,
  { emoji: string; message: string; title: string; sentLabel: string }
> = {
  kiss: {
    emoji: '💋',
    message: 'Tu pareja te envía un beso 💋',
    title: '💋 GymBro',
    sentLabel: 'Beso enviado',
  },
  muscle: {
    emoji: '💪',
    message: '¡Vamos! Puedes hacerlo 💪',
    title: '💪 GymBro',
    sentLabel: 'Ánimo enviado',
  },
  angry: {
    emoji: '😠',
    message: 'Te están mirando; aquí estoy 😠',
    title: '😠 GymBro',
    sentLabel: 'Advertencia enviada',
  },
  cry: {
    emoji: '😢',
    message: 'Quiero irme 😢',
    title: '😢 GymBro',
    sentLabel: 'Mensaje enviado',
  },
};

/** @deprecated use PARTNER_MESSAGES.kiss.message */
export const KISS_MESSAGE = PARTNER_MESSAGES.kiss.message;
/** @deprecated use PARTNER_MESSAGES.kiss.title */
export const KISS_NOTIFICATION_TITLE = PARTNER_MESSAGES.kiss.title;

export const PARTNER_PROFILE: Record<UserProfile, UserProfile> = {
  rodaja: 'brisas',
  brisas: 'rodaja',
};

export const FIREBASE_COLLECTIONS = {
  pushTokens: 'pushTokens',
  kisses: 'kisses',
  equippedThemes: 'equippedThemes',
  sharedRoutines: 'sharedRoutines',
} as const;

export const SHARE_NOTIFICATION_TYPES = {
  routine_share: {
    title: (from: string, routineName: string) => `${from} compartió '${routineName}' contigo`,
    message: (from: string, routineName: string) => `${from} compartió '${routineName}' contigo`,
  },
  routine_accepted: {
    title: (from: string, routineName: string) => `${from} aceptó tu rutina '${routineName}'`,
    message: (from: string, routineName: string) => `${from} aceptó tu rutina '${routineName}'`,
  },
  routine_rejected: {
    title: (from: string, routineName: string) =>
      `${from} rechazó tu rutina '${routineName}'`,
    message: (from: string, routineName: string) =>
      `${from} rechazó tu rutina '${routineName}'`,
  },
} as const;
