import 'react-native-gesture-handler';
import 'react-native-reanimated';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../context/AuthContext';
import { DataProvider } from '../context/DataContext';
import { ShopProvider } from '../context/ShopContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { SocialProvider } from '../context/SocialContext';

function RootStatusBar() {
  const { theme } = useTheme();
  return <StatusBar style={theme.blurTint === 'light' ? 'dark' : 'light'} />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <DataProvider>
        <ShopProvider>
          <SocialProvider>
            <ThemeProvider>
              <RootStatusBar />
              <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="auth/update-password" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="community/discover" options={{ animation: 'slide_from_right', presentation: 'card' }} />
                <Stack.Screen name="community/circle" options={{ animation: 'slide_from_right', presentation: 'card' }} />
                <Stack.Screen name="community/requests" options={{ animation: 'slide_from_right', presentation: 'card' }} />
                <Stack.Screen name="community/plan-inbox" options={{ animation: 'slide_from_right', presentation: 'card' }} />
                <Stack.Screen name="community/share-plan" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
                <Stack.Screen name="profile/blocked" options={{ animation: 'slide_from_right', presentation: 'card' }} />
                <Stack.Screen name="social/[uid]" options={{ animation: 'slide_from_right', presentation: 'card' }} />
                <Stack.Screen name="social/recap/[id]" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
                <Stack.Screen
                  name="routine/[id]"
                  options={{ animation: 'slide_from_right', presentation: 'card' }}
                />
                <Stack.Screen
                  name="routine/create"
                  options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
                />
                <Stack.Screen
                  name="exercise/[id]"
                  options={{ animation: 'slide_from_right', presentation: 'card' }}
                />
                <Stack.Screen
                  name="mesocycle/create"
                  options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
                />
                <Stack.Screen
                  name="mesocycle/summary/[id]"
                  options={{ animation: 'slide_from_right', presentation: 'card' }}
                />
                <Stack.Screen
                  name="mesocycle/[id]"
                  options={{ animation: 'slide_from_right', presentation: 'card' }}
                />
                <Stack.Screen
                  name="routine/execute/[id]"
                  options={{ animation: 'slide_from_right', presentation: 'fullScreenModal' }}
                />
                <Stack.Screen
                  name="session/[id]"
                  options={{ animation: 'slide_from_right', presentation: 'card' }}
                />
              </Stack>
            </ThemeProvider>
          </SocialProvider>
        </ShopProvider>
      </DataProvider>
    </AuthProvider>
  );
}
