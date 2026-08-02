export const DEFAULT_AVATAR_ID = 'capybara-athlete' as const;

export const AVATARS = {
  [DEFAULT_AVATAR_ID]: {
    id: DEFAULT_AVATAR_ID,
    label: 'Capibara atleta',
  },
  'capybara-mark': {
    id: 'capybara-mark',
    label: 'Marca capibara',
  },
  capigirl: {
    id: 'capigirl',
    label: 'Capigirl atleta',
  },
} as const;

export type AvatarId = keyof typeof AVATARS;

export function avatarIdOrDefault(value: unknown): AvatarId {
  return typeof value === 'string' && value in AVATARS
    ? value as AvatarId
    : DEFAULT_AVATAR_ID;
}
