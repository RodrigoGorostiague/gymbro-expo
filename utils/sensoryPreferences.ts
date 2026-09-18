export type SensoryPreferences = {
    motion: boolean;
    haptics: boolean;
    sound: boolean;
};
export const DEFAULT_SENSORY_PREFERENCES: SensoryPreferences = { motion: true, haptics: true, sound: true };
let current = DEFAULT_SENSORY_PREFERENCES;
const listeners = new Set<() => void>();
export const getSensoryPreferences = () => current;
export const subscribeSensoryPreferences = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function normalizeSensoryPreferences(value: unknown): SensoryPreferences {
    const source = value && typeof value === 'object' ? value as Partial<SensoryPreferences> : {};
    return Object.fromEntries(Object.entries(DEFAULT_SENSORY_PREFERENCES).map(([key, fallback]) => [key, typeof source[key as keyof SensoryPreferences] === 'boolean' ? source[key as keyof SensoryPreferences] : fallback])) as SensoryPreferences;
}
export function applySensoryPreferences(value: SensoryPreferences) {
    current = normalizeSensoryPreferences(value);
    listeners.forEach((listener) => listener());
}
