export type JointSocialMessageKind = 'preset' | 'custom';
export type JointSocialRelationshipKind = 'bro' | 'partner';

type SocialMessagePreset = { label: string; message: string };

const PARTNER_PRESETS: readonly SocialMessagePreset[] = [
  { label: 'Beso', message: 'Tu pareja te envía un beso 💋' },
  { label: 'Ánimo', message: '¡Vamos! Puedes hacerlo 💪' },
  { label: 'Estoy con vos', message: 'Te están mirando; aquí estoy 😠' },
  { label: 'Necesito apoyo', message: 'Quiero irme 😢' },
];

const BRO_PRESETS: readonly SocialMessagePreset[] = [
  { label: 'Una más', message: '¡Una más, puedes hacerlo! 💪' },
  { label: 'Buen ritmo', message: 'Buen ritmo, sigue así.' },
  { label: 'Descansa', message: 'Descansa bien y volvemos.' },
  { label: 'Vamos', message: '¡Vamos, que sale esa serie!' },
];

export function socialMessagePresetsFor(relationshipKind: JointSocialRelationshipKind): readonly SocialMessagePreset[] {
  return relationshipKind === 'partner' ? PARTNER_PRESETS : BRO_PRESETS;
}
