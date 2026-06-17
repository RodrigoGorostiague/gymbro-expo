import { UserProfile } from '../types';

export type PartnerMessageType = 'kiss' | 'muscle' | 'angry' | 'cry';

export const PARTNER_MESSAGES: Record<
  PartnerMessageType,
  { emoji: string; message: string; title: string; sentLabel: string }
> = {
  kiss: {
    emoji: '💋',
    message: 'Tu novi@ te manda un beso 💋',
    title: '💋 GymBro',
    sentLabel: 'Beso enviado',
  },
  muscle: {
    emoji: '💪',
    message: 'Vamoooos que vos pode mas 💪',
    title: '💪 GymBro',
    sentLabel: 'Ánimo enviado',
  },
  angry: {
    emoji: '😠',
    message: 'te estan mirando, los cago a paloooos 😠',
    title: '😠 GymBro',
    sentLabel: 'Advertencia enviada',
  },
  cry: {
    emoji: '😢',
    message: 'me quiero ir 😢',
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
} as const;
