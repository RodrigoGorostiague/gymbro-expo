import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DualLoginBackground } from '../components/login/DualLoginBackground';
import { DualLoginFooter } from '../components/login/DualLoginFooter';
import { DualLoginHeader } from '../components/login/DualLoginHeader';
import { LoginFormPanel } from '../components/login/LoginFormPanel';
import { getRandomWelcomeMessage } from '../constants/welcome';
import { useAuth } from '../context/AuthContext';
import { useLoginThemes } from '../hooks/useLoginThemes';
import { UserProfile } from '../types';

function resolveActiveProfile(username: string): UserProfile | null {
  const value = username.trim().toLowerCase();
  if (value === 'rodaja' || value.startsWith('rod')) return 'rodaja';
  if (value === 'brisas' || value.startsWith('bri')) return 'brisas';
  return null;
}

export default function LoginScreen() {
  const { user, isLoading, login, setWelcomeMessage } = useAuth();
  const loginThemes = useLoginThemes();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const activeProfile = useMemo(() => resolveActiveProfile(username), [username]);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/(tabs)/routines');
    }
  }, [user, isLoading]);

  const handleLogin = () => {
    const success = login(username.trim(), password);
    if (!success) {
      Alert.alert('Error', 'Usuario o contraseña incorrectos');
      return;
    }

    if (username.trim().toLowerCase() === 'brisas') {
      setWelcomeMessage(getRandomWelcomeMessage());
    }

    router.replace('/(tabs)/routines');
  };

  const handleSelectProfile = (profile: UserProfile) => {
    setUsername(profile);
  };

  return (
    <View style={styles.container}>
      <DualLoginBackground rodaja={loginThemes.rodaja} brisas={loginThemes.brisas} />

      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <DualLoginHeader
              rodaja={loginThemes.rodaja}
              brisas={loginThemes.brisas}
              activeProfile={activeProfile}
            />

            <LoginFormPanel
              rodaja={loginThemes.rodaja}
              brisas={loginThemes.brisas}
              activeProfile={activeProfile}
              username={username}
              password={password}
              onUsernameChange={setUsername}
              onPasswordChange={setPassword}
              onSelectProfile={handleSelectProfile}
              onSubmit={handleLogin}
            />

            <DualLoginFooter rodaja={loginThemes.rodaja} brisas={loginThemes.brisas} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 16,
  },
});
