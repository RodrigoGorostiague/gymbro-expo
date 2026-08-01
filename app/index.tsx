import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DualLoginBackground } from '../components/login/DualLoginBackground';
import { DualLoginFooter } from '../components/login/DualLoginFooter';
import { DualLoginHeader } from '../components/login/DualLoginHeader';
import { LoginFormPanel } from '../components/login/LoginFormPanel';
import { useAuth } from '../context/AuthContext';
import { useLoginThemes } from '../hooks/useLoginThemes';

export default function LoginScreen() {
  const { user, isLoading, authError, login, register } = useAuth();
  const loginThemes = useLoginThemes();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/(tabs)/routines');
    }
  }, [user, isLoading]);

  const submit = async (action: typeof login) => {
    const error = await action(email, password);
    if (error) Alert.alert('Error', error);
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
              activeProfile={null}
            />

            <LoginFormPanel
              rodaja={loginThemes.rodaja}
              brisas={loginThemes.brisas}
              activeProfile={null}
              username={email}
              password={password}
              onUsernameChange={setEmail}
              onPasswordChange={setPassword}
              onSelectProfile={() => undefined}
              onSubmit={() => void submit(login)}
              onRegister={() => void submit(register)}
            />

            <DualLoginFooter rodaja={loginThemes.rodaja} brisas={loginThemes.brisas} />
          </ScrollView>
        </KeyboardAvoidingView>
        {authError ? <Text style={styles.configError}>{authError}</Text> : null}
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
  configError: {
    color: '#FCA5A5',
    paddingHorizontal: 22,
    paddingBottom: 16,
    textAlign: 'center',
  },
});
