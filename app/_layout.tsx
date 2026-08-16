import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from '../context/AuthContext';
import { DataProvider } from '../context/DataContext';
import { ShopProvider } from '../context/ShopContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { BackgroundParallaxProvider } from '../context/BackgroundParallaxContext';
import { SocialProvider } from '../context/SocialContext';
import { NotificationRuntime } from '../components/NotificationRuntime';
import { AppNoticeModal } from '../components/AppNoticeModal';
import { useShop } from '../context/ShopContext';
import { useSocial } from '../context/SocialContext';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { ProfileTitleBadge } from '../components/ProfileTitleBadge';
import { AppThemeLoadingOverlay } from '../components/AppThemeLoadingOverlay';

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

function ReleaseUpdatesNotice() {
  const { ownProfile } = useSocial();
  const { isLoading: isShopLoading, welcomeGemReward, releaseUpdates, dismissReleaseUpdates } = useShop();
  const totalGems = releaseUpdates.reduce((total, release) => total + release.rewardGems, 0);
  const firstVersion = releaseUpdates[0]?.version;

  return <AppNoticeModal
    visible={!isShopLoading && welcomeGemReward === null && releaseUpdates.length > 0}
    title={releaseUpdates.length === 1 ? releaseUpdates[0]?.title ?? 'Novedades' : `Novedades desde ${firstVersion ?? ''}`}
    message={releaseUpdates.length === 1 ? releaseUpdates[0]?.message ?? '' : 'Mientras no estuviste, GymBro siguió creciendo. Tus recompensas ya fueron acreditadas y acá tenés el resumen.'}
    highlight={totalGems ? `+${totalGems} GEMAS ACREDITADAS` : undefined}
    celebration={<ScrollView accessibilityLabel="Historial de novedades" contentContainerStyle={styles.releaseHistory} style={styles.releaseScroll}>
      {releaseUpdates.map((release) => <View key={release.version} style={styles.release}>
        <Text style={styles.releaseVersion}>VERSION {release.version}</Text>
        {releaseUpdates.length > 1 ? <><Text style={styles.releaseTitle}>{release.title}</Text><Text style={styles.releaseMessage}>{release.message}</Text></> : null}
        {release.version === '0.4.1' ? <View accessibilityLabel="Vista previa Alfa User" style={styles.alfaPreview}>
          <ProfileAvatar avatarId={ownProfile?.avatarId} frameId="alfa-user" size={92} borderColor="#FBBF24" />
          <ProfileTitleBadge titleId="alfa-user" size={42} />
        </View> : null}
        {release.features.length ? <View><Text style={styles.sectionTitle}>FEATURES</Text>{release.features.map((feature) => <Text key={feature} style={styles.releaseItem}>• {feature}</Text>)}</View> : null}
        {release.fixes.length ? <View><Text style={styles.sectionTitle}>FIXES</Text>{release.fixes.map((fix) => <Text key={fix} style={styles.releaseItem}>• {fix}</Text>)}</View> : null}
        {release.rewardGems ? <Text style={styles.reward}>+{release.rewardGems} GEMAS ACREDITADAS</Text> : null}
      </View>)}
    </ScrollView>}
    actionLabel="A entrenar"
    onClose={() => { void dismissReleaseUpdates(); }}
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
              <BackgroundParallaxProvider>
              <ThemeProvider>
                <RootStatusBar />
                <AppThemeLoadingOverlay />
                <NotificationRuntime />
                <WelcomeGemRewardNotice />
                <ReleaseUpdatesNotice />
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
              </BackgroundParallaxProvider>
            </SocialProvider>
          </ShopProvider>
        </DataProvider>
      </AuthProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  releaseScroll: { alignSelf: 'stretch', maxHeight: 320 },
  releaseHistory: { gap: 14 },
  release: { borderTopColor: 'rgba(148,163,184,0.25)', borderTopWidth: StyleSheet.hairlineWidth, gap: 6, paddingTop: 12 },
  releaseVersion: { color: '#FBBF24', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  releaseTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  releaseMessage: { color: '#CBD5E1', fontSize: 13, lineHeight: 18 },
  sectionTitle: { color: '#94A3B8', fontSize: 11, fontWeight: '900', letterSpacing: 0.8, marginTop: 4 },
  releaseItem: { color: '#CBD5E1', fontSize: 13, lineHeight: 18 },
  reward: { color: '#FBBF24', fontSize: 12, fontWeight: '900', marginTop: 3 },
  alfaPreview: { alignItems: 'center', gap: 4, marginVertical: 6 },
});
