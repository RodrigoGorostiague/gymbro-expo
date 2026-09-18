import { useEffect, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useState } from 'react';
import { applySensoryPreferences, getSensoryPreferences, normalizeSensoryPreferences, SensoryPreferences, subscribeSensoryPreferences } from '../utils/sensoryPreferences';
let loaded: Promise<void> | undefined;
const KEY = 'gymbro:sensory:v1';
let preferencesReady = false;
const readyListeners = new Set<() => void>();
const subscribeReady = (listener: () => void) => {
    readyListeners.add(listener);
    return () => { readyListeners.delete(listener); };
};
export function useSensoryPreferences() {
    const preferences = useSyncExternalStore(subscribeSensoryPreferences, getSensoryPreferences, getSensoryPreferences);
    useEffect(() => {
        loaded ??= import('@react-native-async-storage/async-storage').then(async ({ default: storage }) => {
            const value = await storage.getItem(KEY);
            if (value)
                applySensoryPreferences(normalizeSensoryPreferences(JSON.parse(value)));
        }).catch(() => undefined).finally(() => {
            preferencesReady = true;
            readyListeners.forEach((listener) => listener());
        });
    }, []);
    return preferences;
}
export async function saveSensoryPreferences(value: SensoryPreferences) {
    const { default: storage } = await import('@react-native-async-storage/async-storage');
    await loaded;
    await storage.setItem(KEY, JSON.stringify(value));
    applySensoryPreferences(value);
}
export function useMotionPreference() {
    const { motion } = useSensoryPreferences();
    const ready = useSyncExternalStore(subscribeReady, () => preferencesReady, () => false);
    const initial = useReducedMotion();
    const [reduced, setReduced] = useState(initial);
    useEffect(() => {
        let active = true;
        void AccessibilityInfo?.isReduceMotionEnabled?.().then((value) => { if (active)
            setReduced(value); }).catch(() => undefined);
        const subscription = AccessibilityInfo?.addEventListener?.('reduceMotionChanged', setReduced);
        return () => { active = false; subscription?.remove(); };
    }, []);
    return ready && motion && !reduced;
}
