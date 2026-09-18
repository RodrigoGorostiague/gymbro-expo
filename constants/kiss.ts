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

export const PARTNER_PROFILE: Record<UserProfile, UserProfile> = {
  rodaja: 'brisas',
  brisas: 'rodaja',
};
