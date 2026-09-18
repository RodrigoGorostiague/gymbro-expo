export const DEFAULT_AVATAR_ID = 'capybara-athlete' as const;

export const AVATARS = {
  [DEFAULT_AVATAR_ID]: {
    id: DEFAULT_AVATAR_ID,
    label: 'Capibara atleta',
    sex: 'male',
  },
  'capybara-mark': {
    id: 'capybara-mark',
    label: 'Marca capibara',
    sex: 'male',
  },
  capigirl: {
    id: 'capigirl',
    label: 'Capigirl atleta',
    sex: 'female',
  },
  'capigirl-ponytail': {
    id: 'capigirl-ponytail',
    label: 'Capigirl cola de caballo',
    sex: 'female',
  },
  'capigirl-braid': {
    id: 'capigirl-braid',
    label: 'Capigirl trenza',
    sex: 'female',
  },
  'capigirl-bob': {
    id: 'capigirl-bob',
    label: 'Capigirl cabello corto',
    sex: 'female',
  },
  'capigirl-bun': {
    id: 'capigirl-bun',
    label: 'Capigirl rodete',
    sex: 'female',
  },
  'capybro-spiky': {
    id: 'capybro-spiky',
    label: 'Capybro cabello puntiagudo',
    sex: 'male',
  },
  'capybro-quiff': {
    id: 'capybro-quiff',
    label: 'Capybro copete',
    sex: 'male',
  },
  'capybro-topknot': {
    id: 'capybro-topknot',
    label: 'Capybro rodete alto',
    sex: 'male',
  },
  'capybro-cropped': {
    id: 'capybro-cropped',
    label: 'Capybro cabello corto',
    sex: 'male',
  },
  'capybro-river-tattoo': {
    id: 'capybro-river-tattoo',
    label: 'Capybro River tatuado',
    sex: 'male',
  },
  'capybro-beanie-headphones': {
    id: 'capybro-beanie-headphones',
    label: 'Capybro gorro y auriculares',
    sex: 'male',
  },
  'capybro-cap-headphones': {
    id: 'capybro-cap-headphones',
    label: 'Capybro gorra y auriculares',
    sex: 'male',
  },
  'capybro-cap-tank': {
    id: 'capybro-cap-tank',
    label: 'Capybro gorra deportiva',
    sex: 'male',
  },
  'capybro-beanie-tank': {
    id: 'capybro-beanie-tank',
    label: 'Capybro gorro deportivo',
    sex: 'male',
  },
  'capybro-red-visor': {
    id: 'capybro-red-visor',
    label: 'Capybro visera roja',
    sex: 'male',
  },
  'capybro-argentina-beanie': {
    id: 'capybro-argentina-beanie',
    label: 'Capybro Argentina con gorro',
    sex: 'male',
  },
  'capybro-argentina-visor': {
    id: 'capybro-argentina-visor',
    label: 'Capybro Argentina con visera',
    sex: 'male',
  },
  'capybro-boca': {
    id: 'capybro-boca',
    label: 'Capybro Boca',
    sex: 'male',
  },
  'capybro-river': {
    id: 'capybro-river',
    label: 'Capybro River',
    sex: 'male',
  },
  'capybro-argentina': {
    id: 'capybro-argentina',
    label: 'Capybro Selección Argentina',
    sex: 'male',
  },
  'capigirl-pink-squat': {
    id: 'capigirl-pink-squat',
    label: 'Capigirl sentadilla rosa',
    sex: 'female',
  },
  'capigirl-purple-deadlift': {
    id: 'capigirl-purple-deadlift',
    label: 'Capigirl peso muerto violeta',
    sex: 'female',
  },
  'capigirl-blue-squat': {
    id: 'capigirl-blue-squat',
    label: 'Capigirl sentadilla azul',
    sex: 'female',
  },
  'capigirl-black-pink-deadlift': {
    id: 'capigirl-black-pink-deadlift',
    label: 'Capigirl peso muerto negro y rosa',
    sex: 'female',
  },
  'capigirl-pink-jacket-deadlift': {
    id: 'capigirl-pink-jacket-deadlift',
    label: 'Capigirl peso muerto campera rosa',
    sex: 'female',
  },
  'capigirl-black-dumbbell': {
    id: 'capigirl-black-dumbbell',
    label: 'Capigirl mancuerna negra',
    sex: 'female',
  },
  'capigirl-pink-dumbbell': {
    id: 'capigirl-pink-dumbbell',
    label: 'Capigirl mancuerna rosa',
    sex: 'female',
  },
  'capigirl-purple-tee': {
    id: 'capigirl-purple-tee',
    label: 'Capigirl remera violeta',
    sex: 'female',
  },
  'capigirl-purple-sport': {
    id: 'capigirl-purple-sport',
    label: 'Capigirl conjunto violeta',
    sex: 'female',
  },
} as const;

export type AvatarId = keyof typeof AVATARS;
export type AvatarSex = 'male' | 'female';

export function avatarsForSex(sex: AvatarSex): AvatarId[] {
  return (Object.keys(AVATARS) as AvatarId[]).filter((id) => AVATARS[id].sex === sex);
}

export function avatarIdOrDefault(value: unknown): AvatarId {
  return typeof value === 'string' && value in AVATARS
    ? value as AvatarId
    : DEFAULT_AVATAR_ID;
}
