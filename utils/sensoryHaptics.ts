import * as NativeHaptics from 'expo-haptics';
import { getSensoryPreferences } from './sensoryPreferences';
export * from 'expo-haptics';
export const impactAsync: typeof NativeHaptics.impactAsync = (...args) => getSensoryPreferences().haptics ? NativeHaptics.impactAsync(...args) : Promise.resolve();
export const notificationAsync: typeof NativeHaptics.notificationAsync = (...args) => getSensoryPreferences().haptics ? NativeHaptics.notificationAsync(...args) : Promise.resolve();
export const selectionAsync: typeof NativeHaptics.selectionAsync = (...args) => getSensoryPreferences().haptics ? NativeHaptics.selectionAsync(...args) : Promise.resolve();
