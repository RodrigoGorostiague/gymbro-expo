import AsyncStorage from '@react-native-async-storage/async-storage';
import { Exercise, Routine, ShopState, UserProfile, WorkoutSession } from '../types';

const KEYS = {
  user: '@gymbro/user',
  exercises: '@gymbro/exercises',
  routines: '@gymbro/routines',
  sessions: '@gymbro/sessions',
  storageVersion: '@gymbro/storageVersion',
  hiddenSharedRoutineIds: '@gymbro/hiddenSharedRoutineIds',
  shop: (profile: UserProfile) => `@gymbro/shop/${profile}`,
  legacyShop: '@gymbro/shop',
};

const STORAGE_VERSION = 'exercise-catalog-v1';
let storageMigrationPromise: Promise<void> | null = null;

const STARTER_THEME_IDS = ['white', 'black', 'profile-rodaja', 'profile-brisas'] as const;

const DEFAULT_SHOP: ShopState = {
  gems: 0,
  purchasedThemeIds: [...STARTER_THEME_IDS],
  equippedThemeId: null,
  combineWithPartner: false,
  weeklyGoal: {
    bonusWeekKey: null,
    lastWeekWorkouts: 0,
  },
};

function withStarterThemes(state: ShopState): { state: ShopState; changed: boolean } {
  const purchased = new Set(state.purchasedThemeIds);
  let changed = false;
  for (const id of STARTER_THEME_IDS) {
    if (!purchased.has(id)) {
      purchased.add(id);
      changed = true;
    }
  }
  if (!changed) return { state, changed: false };
  return { state: { ...state, purchasedThemeIds: [...purchased] }, changed: true };
}

async function runStorageMigration(): Promise<void> {
  const currentVersion = await AsyncStorage.getItem(KEYS.storageVersion);
  if (currentVersion === STORAGE_VERSION) return;

  await AsyncStorage.multiRemove([KEYS.routines, KEYS.sessions]);
  await AsyncStorage.setItem(KEYS.storageVersion, STORAGE_VERSION);
}

async function ensureStorageSchema(): Promise<void> {
  if (!storageMigrationPromise) {
    storageMigrationPromise = runStorageMigration().catch((error) => {
      storageMigrationPromise = null;
      throw error;
    });
  }

  await storageMigrationPromise;
}

export async function saveUser(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(KEYS.user, profile);
}

export async function loadUser(): Promise<UserProfile | null> {
  const value = await AsyncStorage.getItem(KEYS.user);
  return value as UserProfile | null;
}

export async function clearUser(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.user);
}

export async function saveExercises(exercises: Exercise[]): Promise<void> {
  await ensureStorageSchema();
  await AsyncStorage.setItem(KEYS.exercises, JSON.stringify(exercises));
}

export async function loadExercises(): Promise<Exercise[]> {
  await ensureStorageSchema();
  const value = await AsyncStorage.getItem(KEYS.exercises);
  return value ? JSON.parse(value) : [];
}

export async function saveRoutines(routines: Routine[]): Promise<void> {
  await ensureStorageSchema();
  await AsyncStorage.setItem(KEYS.routines, JSON.stringify(routines));
}

export async function loadRoutines(): Promise<Routine[]> {
  await ensureStorageSchema();
  const value = await AsyncStorage.getItem(KEYS.routines);
  return value ? JSON.parse(value) : [];
}

export async function saveSessions(sessions: WorkoutSession[]): Promise<void> {
  await ensureStorageSchema();
  await AsyncStorage.setItem(KEYS.sessions, JSON.stringify(sessions));
}

export async function loadSessions(): Promise<WorkoutSession[]> {
  await ensureStorageSchema();
  const value = await AsyncStorage.getItem(KEYS.sessions);
  return value ? JSON.parse(value) : [];
}

export async function saveHiddenSharedRoutineIds(shareIds: string[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.hiddenSharedRoutineIds, JSON.stringify(shareIds));
}

export async function loadHiddenSharedRoutineIds(): Promise<string[]> {
  const value = await AsyncStorage.getItem(KEYS.hiddenSharedRoutineIds);
  return value ? JSON.parse(value) : [];
}

export async function saveShop(profile: UserProfile, state: ShopState): Promise<void> {
  await AsyncStorage.setItem(KEYS.shop(profile), JSON.stringify(state));
}

export async function loadShop(profile: UserProfile): Promise<ShopState> {
  const value = await AsyncStorage.getItem(KEYS.shop(profile));
  if (value) {
    const parsed = { ...DEFAULT_SHOP, ...JSON.parse(value) };
    const { state, changed } = withStarterThemes(parsed);
    if (changed) await saveShop(profile, state);
    return state;
  }

  const legacy = await AsyncStorage.getItem(KEYS.legacyShop);
  if (legacy) {
    const { state } = withStarterThemes({ ...DEFAULT_SHOP, ...JSON.parse(legacy) });
    await saveShop(profile, state);
    return state;
  }

  return DEFAULT_SHOP;
}

export async function loadEquippedThemes(): Promise<Record<UserProfile, string | null>> {
  const [rodaja, brisas] = await Promise.all([loadShop('rodaja'), loadShop('brisas')]);
  return {
    rodaja: rodaja.equippedThemeId,
    brisas: brisas.equippedThemeId,
  };
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
