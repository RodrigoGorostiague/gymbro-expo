import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from '../context/AuthContext';
import { DataProvider } from '../context/DataContext';
import { ShopProvider } from '../context/ShopContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { SocialProvider } from '../context/SocialContext';
import { NotificationRuntime } from '../components/NotificationRuntime';
import { AppNoticeModal } from '../components/AppNoticeModal';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { CURRENT_RELEASE_NOTES } from '../constants/releaseNotes';
import { hasSeenReleaseNotes, markReleaseNotesSeen } from '../utils/storage';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { ProfileTitleBadge } from '../components/ProfileTitleBadge';

function RootStatusBar() {
  const { theme } = useTheme();
  return <StatusBar style={theme.blurTint === 'light' ? 'dark' : 'light'} />;
}

function WelcomeGemRewardNotice() {
  const { welcomeGemReward, dismissWelcomeGemReward } = useShop();
  return <AppNoticeModal
    visible={welcomeGemReward !== null}
    title="250 gemas para vos"
    message="Gracias por usar GymBro. Te regalamos 250 gemas para que empieces con fuerza. Mucha suerte en tus entrenamientos."
    highlight={`+${welcomeGemReward ?? 0} GEMAS`}
    actionLabel="A entrenar"
    onClose={dismissWelcomeGemReward}
  />;
}

function ReleaseNotesNotice() {
  const { user } = useAuth();
  const { ownProfile } = useSocial();
  const { isLoading: isShopLoading, welcomeGemReward } = useShop();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    setVisible(false);
    if (!user || isShopLoading || welcomeGemReward !== null) return () => { active = false; };

    void hasSeenReleaseNotes(user, CURRENT_RELEASE_NOTES.version).then((seen) => {
      if (active && !seen) setVisible(true);
    }).catch(() => undefined);

    return () => { active = false; };
  }, [user, isShopLoading, welcomeGemReward]);

  const dismiss = () => {
    if (!user) return;
    setVisible(false);
    void markReleaseNotesSeen(user, CURRENT_RELEASE_NOTES.version).catch(() => undefined);
  };

  return <AppNoticeModal
    visible={visible}
    title={CURRENT_RELEASE_NOTES.title}
    message={CURRENT_RELEASE_NOTES.message}
    changes={CURRENT_RELEASE_NOTES.changes}
    highlight={CURRENT_RELEASE_NOTES.rewardGems ? `+${CURRENT_RELEASE_NOTES.rewardGems} GEMAS` : `VERSION ${CURRENT_RELEASE_NOTES.version}`}
    version={CURRENT_RELEASE_NOTES.version}
    celebration={<View accessibilityLabel="Vista previa Alfa User" style={{ alignItems: 'center', gap: 4 }}>
      <ProfileAvatar avatarId={ownProfile?.avatarId} frameId="alfa-user" size={92} borderColor="#FBBF24" />
      <ProfileTitleBadge titleId="alfa-user" size={42} />
    </View>}
    actionLabel="A entrenar"
    onClose={dismiss}
  />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <AuthProvider>
        <DataProvider>
          <ShopProvider>
            <SocialProvider>
              <ThemeProvider>
                <RootStatusBar />
                <NotificationRuntime />
                <WelcomeGemRewardNotice />
                <ReleaseNotesNotice />
                <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
                <Stack.Screen name="auth/update-password" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="community/discover" options={{ animation: 'slide_from_right', presentation: 'card' }} />
                <Stack.Screen name="community/circle" options={{ animation: 'slide_from_right', presentation: 'card' }} />
                <Stack.Screen name="community/requests" options={{ animation: 'slide_from_right', presentation: 'card' }} />
                <Stack.Screen name="community/plan-inbox" options={{ animation: 'slide_from_right', presentation: 'card' }} />
                <Stack.Screen name="community/notifications" options={{ animation: 'slide_from_right', presentation: 'card' }} />
                <Stack.Screen name="community/share-plan" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
                <Stack.Screen name="community/joint-workout" options={{ animation: 'slide_from_right', presentation: 'card' }} />
                <Stack.Screen name="community/joint/[id]" options={{ animation: 'slide_from_right', presentation: 'card' }} />
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
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
