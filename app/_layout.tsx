import 'react-native-gesture-handler';
import 'react-native-reanimated';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../context/AuthContext';
import { DataProvider } from '../context/DataContext';
import { KissProvider } from '../context/KissContext';
import { ShareProvider } from '../context/ShareContext';
import { ShopProvider } from '../context/ShopContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';

function RootStatusBar() {
  const { theme } = useTheme();
  return <StatusBar style={theme.blurTint === 'light' ? 'dark' : 'light'} />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <KissProvider>
        <ShareProvider>
          <DataProvider>
            <ShopProvider>
            <ThemeProvider>
            <RootStatusBar />
            <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="routine/[id]"
              options={{ animation: 'slide_from_right', presentation: 'card' }}
            />
            <Stack.Screen
              name="routine/create"
              options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
            />
            <Stack.Screen
              name="exercise/create"
              options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
            />
            <Stack.Screen
              name="routine/execute/[id]"
              options={{ animation: 'slide_from_right', presentation: 'fullScreenModal' }}
            />
            </Stack>
            </ThemeProvider>
          </ShopProvider>
        </DataProvider>
      </ShareProvider>
      </KissProvider>
    </AuthProvider>
  );
}
