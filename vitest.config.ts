import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  assetsInclude: ['**/*.wav', '**/*.png', '**/*.jpeg'],
  resolve: {
    alias: {
       'expo-router': resolve(rootDir, 'tests/helpers/expoRouterStub.ts'),
       'expo-image': resolve(rootDir, 'tests/helpers/expoImageStub.tsx'),
      'expo-blur': resolve(rootDir, 'tests/helpers/expoBlurStub.ts'),
      'expo-haptics': resolve(rootDir, 'tests/helpers/expoHapticsStub.ts'),
      'expo-linear-gradient': resolve(rootDir, 'tests/helpers/expoLinearGradientStub.ts'),
       'expo-secure-store': resolve(rootDir, 'tests/helpers/secureStoreStub.ts'),
       '@expo/vector-icons/Ionicons': resolve(rootDir, 'tests/helpers/vectorIconStub.tsx'),
       '@expo/vector-icons': resolve(rootDir, 'tests/helpers/vectorIconStub.tsx'),
       'react-native': resolve(rootDir, 'tests/helpers/reactNativeStub.ts'),
       'react-native-gesture-handler': resolve(rootDir, 'tests/helpers/gestureHandlerStub.tsx'),
       'react-native-reanimated': resolve(rootDir, 'tests/helpers/reanimatedStub.ts'),
        'react-native-draggable-flatlist': resolve(rootDir, 'tests/helpers/draggableFlatListStub.tsx'),
        'victory-native': resolve(rootDir, 'tests/helpers/victoryNativeStub.tsx'),
      'react-native-safe-area-context': resolve(rootDir, 'tests/helpers/safeAreaStub.ts'),
      'react-native-svg': resolve(rootDir, 'tests/helpers/reactNativeSvgStub.ts'),
      'react-native-url-polyfill/auto': resolve(rootDir, 'tests/helpers/urlPolyfillStub.ts'),
    },
  },
  test: {
    env: { TZ: 'America/New_York' },
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
