import React, { useEffect, useState } from 'react';
import {
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
import { AuthMode, LoginFormPanel } from '../components/login/LoginFormPanel';
import { useAuth } from '../context/AuthContext';
import { LOGIN_THEMES } from '../constants/loginBrand';
import { getOwnOnboarding } from '../services/onboarding';

export default function LoginScreen() {
  const { user, isLoading, authError, login, register, sendPasswordReset } = useAuth();
  const loginThemes = LOGIN_THEMES;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    if (isLoading || !user) return;
    void getOwnOnboarding().then((onboarding) => {
      router.replace(onboarding.completed ? '/(tabs)/train' : '/onboarding');
    }).catch(() => router.replace('/(tabs)/train'));
  }, [user, isLoading]);

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setFeedback(null);
  };

  const submit = async () => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      if (mode === 'signIn') {
        const error = await login(email, password);
        if (error) setFeedback({ tone: 'error', message: error });
        return;
      }
      if (mode === 'signUp') {
        const result = await register(email, password);
        if (result.error) setFeedback({ tone: 'error', message: result.error });
        else if (result.emailConfirmationRequired) setFeedback({ tone: 'success', message: 'Revisá tu correo para confirmar la cuenta antes de ingresar.' });
        return;
      }
      const error = await sendPasswordReset(email);
      setFeedback(error
        ? { tone: 'error', message: error }
        : { tone: 'success', message: 'Si existe una cuenta con ese correo, te enviamos un enlace de recuperación.' });
    } catch {
      setFeedback({ tone: 'error', message: 'No pudimos completar la solicitud. Intentá nuevamente.' });
    } finally {
      setIsSubmitting(false);
    }
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
            />

            <LoginFormPanel
              rodaja={loginThemes.rodaja}
              brisas={loginThemes.brisas}
              mode={mode}
              email={email}
              password={password}
              isSubmitting={isSubmitting}
              feedback={feedback}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
              onModeChange={changeMode}
              onSubmit={() => void submit()}
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
