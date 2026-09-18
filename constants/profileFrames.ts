const SHOP_FRAME_SQUARE = { kind: 'shop', available: true, resizeMode: 'contain', scale: 1.28, verticalOffset: 0.02 } as const;
const SHOP_FRAME_WIDE = { kind: 'shop', available: true, resizeMode: 'contain', scale: 1.5, verticalOffset: 0.08 } as const;
const SHOP_FRAME_TALL = { kind: 'shop', available: true, resizeMode: 'cover', scale: 1.36, verticalOffset: 0.04 } as const;

export const PROFILE_FRAMES = [
  { id: 'principiante', label: 'Principiante', unlockLevel: 1, kind: 'level', available: true, resizeMode: 'contain', scale: 1.28, verticalOffset: -0.05 },
  { id: 'intermedio', label: 'Intermedio', unlockLevel: 5, kind: 'level', available: true, resizeMode: 'contain', scale: 1.28, verticalOffset: 0.06 },
  { id: 'avanzado', label: 'Avanzado', unlockLevel: 10, kind: 'level', available: true, resizeMode: 'contain', scale: 1.28, verticalOffset: 0.06 },
  { id: 'gymbro', label: 'GymBro', unlockLevel: 20, kind: 'level', available: true, resizeMode: 'contain', scale: 1.28, verticalOffset: 0.06 },
  { id: 'gymrat', label: 'GymRat', unlockLevel: 35, kind: 'level', available: true, resizeMode: 'cover', scale: 1.28, verticalOffset: 0.04 },
  { id: 'g-boom', label: 'G-Boom', unlockLevel: 50, kind: 'level', available: true, resizeMode: 'cover', scale: 1.28, verticalOffset: 0.04 },
  { id: 'alfa', label: 'Alfa', unlockLevel: 70, kind: 'level', available: true, resizeMode: 'contain', scale: 1.28, verticalOffset: 0.06 },
  { id: 'alfa-user', label: 'Alfa User', kind: 'global', available: true, resizeMode: 'contain', scale: 1.28, verticalOffset: 0 },
  { id: 'sigma', label: 'Sigma', unlockLevel: 85, kind: 'level', available: true, resizeMode: 'contain', scale: 1.28, verticalOffset: 0.06 },
  { id: 'brawl-rookie', label: 'Rookie', kind: 'brawl', available: false, resizeMode: 'contain', scale: 1.28, verticalOffset: 0.06 },
  { id: 'brawl-contender', label: 'Contender', kind: 'brawl', available: false, resizeMode: 'contain', scale: 1.28, verticalOffset: 0.06 },
  { id: 'brawl-challenger', label: 'Challenger', kind: 'brawl', available: false, resizeMode: 'contain', scale: 1.28, verticalOffset: 0.06 },
  { id: 'brawl-elite', label: 'Elite', kind: 'brawl', available: false, resizeMode: 'contain', scale: 1.28, verticalOffset: 0.06 },
  { id: 'brawl-apex', label: 'Apex', kind: 'brawl', available: false, resizeMode: 'contain', scale: 1.28, verticalOffset: 0.06 },
  { id: 'brawl-titan', label: 'Titan', kind: 'brawl', available: false, resizeMode: 'contain', scale: 1.28, verticalOffset: 0.06 },
  { id: 'brawl-warlord', label: 'Warlord', kind: 'brawl', available: false, resizeMode: 'contain', scale: 1.28, verticalOffset: 0.06 },
  { id: 'brawl-legend', label: 'Legend', kind: 'brawl', available: false, resizeMode: 'contain', scale: 1.28, verticalOffset: 0.06 },
  { id: 'shop-campeon-indiscutible', label: 'Campeón indiscutible', price: 340, ...SHOP_FRAME_WIDE },
  { id: 'shop-heavy-duty', label: 'Heavy Duty', price: 360, ...SHOP_FRAME_SQUARE },
  { id: 'shop-neon-vital', label: 'Neon Vital', price: 380, ...SHOP_FRAME_SQUARE },
  { id: 'shop-alfa', label: 'Alfa', price: 400, ...SHOP_FRAME_SQUARE },
  { id: 'shop-la-12', label: 'La 12', price: 420, ...SHOP_FRAME_WIDE },
  { id: 'shop-rosa-carmesi', label: 'Rosa carmesí', price: 440, ...SHOP_FRAME_WIDE },
  { id: 'shop-millo', label: 'Millo', price: 460, ...SHOP_FRAME_WIDE },
  { id: 'shop-celtic-spirit', label: 'Celtic Spirit', price: 480, ...SHOP_FRAME_SQUARE },
  { id: 'shop-hierro-fe-disciplina', label: 'Hierro, Fe y Disciplina', price: 500, ...SHOP_FRAME_WIDE },
  { id: 'shop-yo-soy-el-huno', label: 'Yo soy el Huno', price: 520, ...SHOP_FRAME_SQUARE },
  { id: 'shop-spqr', label: 'SPQR', price: 540, ...SHOP_FRAME_SQUARE },
  { id: 'shop-fuerza-rinoceronte', label: 'Fuerza de rinoceronte', price: 560, ...SHOP_FRAME_WIDE },
  { id: 'shop-fuerza-pantera', label: 'Fuerza de pantera', price: 600, ...SHOP_FRAME_SQUARE },
  { id: 'shop-diamond-fit', label: 'Diamond Fit', price: 640, ...SHOP_FRAME_TALL },
  { id: 'shop-ruby-fit', label: 'Ruby Fit', price: 680, ...SHOP_FRAME_SQUARE },
  { id: 'shop-valhalla-training', label: 'Valhalla Training', price: 720, ...SHOP_FRAME_SQUARE },
  { id: 'shop-aurora-fitness', label: 'Aurora Fitness', price: 760, ...SHOP_FRAME_SQUARE },
  { id: 'shop-holy-fit', label: 'Holy Fit', price: 800, ...SHOP_FRAME_TALL },
  { id: 'shop-medjay-core', label: 'Medjay Core', price: 840, ...SHOP_FRAME_SQUARE },
  { id: 'shop-fuerza-cocodrilo', label: 'Fuerza de cocodrilo', price: 880, ...SHOP_FRAME_WIDE },
  { id: 'shop-fuerza-gorila', label: 'Fuerza de gorila', price: 920, ...SHOP_FRAME_SQUARE },
  { id: 'shop-elegante-sport', label: 'Elegante Sport', price: 960, ...SHOP_FRAME_SQUARE },
  { id: 'shop-banzai', label: 'Banzai', price: 1000, ...SHOP_FRAME_WIDE },
  { id: 'shop-neon-gym', label: 'Neon Gym', price: 1020, ...SHOP_FRAME_WIDE },
  { id: 'shop-fuerza-elefante', label: 'Fuerza de elefante', price: 1040, ...SHOP_FRAME_WIDE },
  { id: 'shop-this-is-sparta', label: 'This Is Sparta', price: 1060, ...SHOP_FRAME_WIDE },
  { id: 'shop-fuerza-tigre', label: 'Fuerza de tigre', price: 1080, ...SHOP_FRAME_WIDE },
  { id: 'shop-winter-arc', label: 'Winter Arc', price: 1100, ...SHOP_FRAME_SQUARE },
] as const;

export type ProfileFrameId = (typeof PROFILE_FRAMES)[number]['id'];

export const PROFILE_TITLES = [
  { id: 'principiante', label: 'Principiante', title: 'Forjando Base', titleColor: '#94A3B8', unlockLevel: 1, kind: 'level', available: true },
  { id: 'intermedio', label: 'Intermedio', title: 'Pulso de Acero', titleColor: '#84CC16', unlockLevel: 5, kind: 'level', available: true },
  { id: 'avanzado', label: 'Avanzado', title: 'Disciplina de Hierro', titleColor: '#F97316', unlockLevel: 10, kind: 'level', available: true },
  { id: 'gymbro', label: 'GymBro', title: 'Hermandad de Hierro', titleColor: '#FB923C', unlockLevel: 20, kind: 'level', available: true },
  { id: 'gymrat', label: 'GymRat', title: 'Dueño del Hierro', titleColor: '#EF4444', unlockLevel: 35, kind: 'level', available: true },
  { id: 'g-boom', label: 'G-Boom', title: 'Fuerza Explosiva', titleColor: '#38BDF8', unlockLevel: 50, kind: 'level', available: true },
  { id: 'alfa', label: 'Alfa', title: 'Cima de Acero', titleColor: '#3B82F6', unlockLevel: 70, kind: 'level', available: true },
  { id: 'alfa-user', label: 'Alfa User', title: 'Alfa User', titleColor: '#FBBF24', kind: 'global', available: true },
  { id: 'sigma', label: 'Sigma', title: 'Leyenda Solitaria', titleColor: '#A855F7', unlockLevel: 85, kind: 'level', available: true },
  { id: 'brawl-rookie', label: 'Rookie', title: 'Rookie', titleColor: '#F97316', kind: 'brawl', available: false },
  { id: 'brawl-contender', label: 'Contender', title: 'Contender', titleColor: '#EF4444', kind: 'brawl', available: false },
  { id: 'brawl-challenger', label: 'Challenger', title: 'Challenger', titleColor: '#DC2626', kind: 'brawl', available: false },
  { id: 'brawl-elite', label: 'Elite', title: 'Elite', titleColor: '#F59E0B', kind: 'brawl', available: false },
  { id: 'brawl-apex', label: 'Apex', title: 'Apex', titleColor: '#EA580C', kind: 'brawl', available: false },
  { id: 'brawl-titan', label: 'Titan', title: 'Titan', titleColor: '#FF6B00', kind: 'brawl', available: false },
  { id: 'brawl-warlord', label: 'Warlord', title: 'Warlord', titleColor: '#E11D48', kind: 'brawl', available: false },
  { id: 'brawl-legend', label: 'Legend', title: 'Legend', titleColor: '#FACC15', kind: 'brawl', available: false },
] as const;

export type ProfileTitleId = (typeof PROFILE_TITLES)[number]['id'];

export const DEFAULT_PROFILE_FRAME_ID: ProfileFrameId = 'principiante';
export const DEFAULT_PROFILE_TITLE_ID: ProfileTitleId = 'principiante';

export function profileFrameIdOrDefault(value: unknown): ProfileFrameId {
  return PROFILE_FRAMES.some((frame) => frame.id === value)
    ? value as ProfileFrameId
    : DEFAULT_PROFILE_FRAME_ID;
}

export function profileFrameForId(id: ProfileFrameId) {
  return PROFILE_FRAMES.find((frame) => frame.id === id)!;
}

export function profileTitleIdOrDefault(value: unknown): ProfileTitleId {
  return PROFILE_TITLES.some((title) => title.id === value)
    ? value as ProfileTitleId
    : DEFAULT_PROFILE_TITLE_ID;
}

export function isProfileFrameUnlocked(id: ProfileFrameId, level: number, purchasedFrameIds: readonly string[] = []): boolean {
  const frame = profileFrameForId(id);
  return frame.available && (
    frame.kind === 'global'
    || (frame.kind === 'level' && level >= frame.unlockLevel)
    || (frame.kind === 'shop' && purchasedFrameIds.includes(id))
  );
}

export function profileTitleForId(id: ProfileTitleId) {
  return PROFILE_TITLES.find((title) => title.id === id)!;
}

export function isProfileTitleUnlocked(id: ProfileTitleId, level: number): boolean {
  const title = profileTitleForId(id);
  return title.available && (title.kind === 'global' || (title.kind === 'level' && level >= title.unlockLevel));
}

export function orderProfileFrameIds(ids: readonly ProfileFrameId[], level: number, purchasedFrameIds: readonly string[] = []): ProfileFrameId[] {
  return [...ids].sort((left, right) => {
    const leftUnlocked = isProfileFrameUnlocked(left, level, purchasedFrameIds);
    const rightUnlocked = isProfileFrameUnlocked(right, level, purchasedFrameIds);
    if (leftUnlocked !== rightUnlocked) return leftUnlocked ? -1 : 1;
    const leftFrame = profileFrameForId(left);
    const rightFrame = profileFrameForId(right);
    return (leftFrame.kind === 'global' ? 0 : leftFrame.kind === 'level' ? leftFrame.unlockLevel : Number.MAX_SAFE_INTEGER) - (rightFrame.kind === 'global' ? 0 : rightFrame.kind === 'level' ? rightFrame.unlockLevel : Number.MAX_SAFE_INTEGER)
      || leftFrame.label.localeCompare(rightFrame.label);
  });
}

export function orderProfileTitleIds(ids: readonly ProfileTitleId[], level: number): ProfileTitleId[] {
  return [...ids].sort((left, right) => {
    const leftUnlocked = isProfileTitleUnlocked(left, level);
    const rightUnlocked = isProfileTitleUnlocked(right, level);
    if (leftUnlocked !== rightUnlocked) return leftUnlocked ? -1 : 1;
    const leftTitle = profileTitleForId(left);
    const rightTitle = profileTitleForId(right);
    return (leftTitle.kind === 'global' ? 0 : leftTitle.kind === 'level' ? leftTitle.unlockLevel : Number.MAX_SAFE_INTEGER) - (rightTitle.kind === 'global' ? 0 : rightTitle.kind === 'level' ? rightTitle.unlockLevel : Number.MAX_SAFE_INTEGER)
      || leftTitle.label.localeCompare(rightTitle.label);
  });
}

export function unlockedProfileTitles(level: number) {
  return PROFILE_TITLES.filter((title) => isProfileTitleUnlocked(title.id, level));
}

export function visibleBrawlFrames(equippedFrameId: ProfileFrameId) {
  const equippedFrame = profileFrameForId(equippedFrameId);
  if (equippedFrame.kind === 'brawl') return [equippedFrame];
  return PROFILE_FRAMES.filter((frame) => frame.kind === 'brawl').slice(0, 1);
}
