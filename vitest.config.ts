import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      'expo-router': resolve(rootDir, 'tests/helpers/expoRouterStub.ts'),
      'expo-blur': resolve(rootDir, 'tests/helpers/expoBlurStub.ts'),
      'expo-haptics': resolve(rootDir, 'tests/helpers/expoHapticsStub.ts'),
      'expo-linear-gradient': resolve(rootDir, 'tests/helpers/expoLinearGradientStub.ts'),
      'react-native': resolve(rootDir, 'tests/helpers/reactNativeStub.ts'),
      'react-native-reanimated': resolve(rootDir, 'tests/helpers/reanimatedStub.ts'),
      'react-native-safe-area-context': resolve(rootDir, 'tests/helpers/safeAreaStub.ts'),
      'react-native-svg': resolve(rootDir, 'tests/helpers/reactNativeSvgStub.ts'),
    },
  },
  test: {
    env: { TZ: 'America/New_York' },
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
