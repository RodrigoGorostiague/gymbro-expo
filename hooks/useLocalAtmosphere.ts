import { useEffect, useSyncExternalStore } from 'react';
export const ATMOSPHERES = [
    {
        id: 'local-forge', name: 'Forja', description: 'Calor ascendente y placas de acero.'
    },
    {
        id: 'local-aurora', name: 'Aurora', description: 'Cintas luminosas sobre una noche polar.'
    },
    {
        id: 'local-summit', name: 'Cumbre', description: 'Montañas estratificadas y nubes lentas.'
    },
    {
        id: 'local-orbit', name: 'Órbita', description: 'Un sistema de anillos y cuerpos celestes.'
    },
] as const;
export type AtmosphereId = typeof ATMOSPHERES[number]['id'];
const key = 'gymbro:local-atmosphere:v1';
let current: AtmosphereId | null = null;
let load: Promise<void> | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
export const isAtmosphereId = (value: unknown): value is AtmosphereId => ATMOSPHERES.some(({ id }) => id === value);
export const getLocalAtmosphere = () => current;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function ensureLoaded() {
    return load ??= import('@react-native-async-storage/async-storage').then(async ({ default: storage }) => {
        const value = await storage.getItem(key);
        current = isAtmosphereId(value) ? value : null;
        notify();
    }).catch(() => undefined);
}
export function useLocalAtmosphere() {
    const value = useSyncExternalStore(subscribe, getLocalAtmosphere, () => null);
    useEffect(() => { void ensureLoaded(); }, []);
    return value;
}
export async function saveLocalAtmosphere(value: AtmosphereId | null) {
    if (value !== null && !isAtmosphereId(value))
        throw new Error('Atmósfera no válida.');
    await ensureLoaded();
    const { default: storage } = await import('@react-native-async-storage/async-storage');
    if (value)
        await storage.setItem(key, value);
    else
        await storage.removeItem(key);
    current = value;
    notify();
}
