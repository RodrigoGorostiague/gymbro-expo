import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { HapticPressable } from '../../components/HapticPressable';
import { useAuth } from '../../context/AuthContext';
import { useLoginThemes } from '../../hooks/useLoginThemes';
import { DualLoginBackground } from '../../components/login/DualLoginBackground';

const isValidPassword = (value: string) => value.length >= 8 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value);

export default function UpdatePasswordScreen() {
  const url = Linking.useLinkingURL();
  const { recoveryUrl } = useLocalSearchParams<{ recoveryUrl?: string }>();
  const { establishRecoverySession, updatePassword } = useAuth();
  const themes = useLoginThemes();
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recoveryLink = url ?? recoveryUrl ?? null;

  useEffect(() => {
    if (!recoveryLink) return;
    let active = true;
    void establishRecoverySession(recoveryLink).then((sessionError) => {
      if (!active) return;
      setError(sessionError);
      setIsVerifying(false);
    }).catch(() => {
      if (active) {
        setError('No pudimos validar el enlace de recuperación. Pedí uno nuevo.');
        setIsVerifying(false);
      }
    });
    return () => { active = false; };
  }, [establishRecoverySession, recoveryLink]);

  const submit = async () => {
    if (!isValidPassword(password) || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const updateError = await updatePassword(password);
      if (updateError) setError(updateError);
      else router.replace('/');
    } catch {
      setError('No pudimos actualizar la contraseña. Intentá nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <DualLoginBackground rodaja={themes.rodaja} brisas={themes.brisas} />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
          <View style={styles.card}>
            <Text style={styles.title}>Nueva contraseña</Text>
            <Text style={styles.hint}>Elegí una contraseña fuerte para volver a tu entrenamiento.</Text>
            {isVerifying ? <ActivityIndicator color="#FFF" style={styles.loader} /> : null}
            {!isVerifying && !error ? (
              <>
                <View style={styles.passwordGroup}>
                  <TextInput
                    accessibilityLabel="Nueva contraseña"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    onChangeText={setPassword}
                    onSubmitEditing={submit}
                    placeholder="Nueva contraseña"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    returnKeyType="go"
                    secureTextEntry={!passwordVisible}
                    style={styles.input}
                    textContentType="newPassword"
                    value={password}
                  />
                  <HapticPressable onPress={() => setPasswordVisible((visible) => !visible)} style={styles.visibilityButton}>
                    <Text style={styles.visibilityText}>{passwordVisible ? 'Ocultar' : 'Mostrar'}</Text>
                  </HapticPressable>
                </View>
                <Text style={styles.requirements}>8+ caracteres, mayúscula, minúscula y número.</Text>
                <HapticPressable disabled={!isValidPassword(password) || isSubmitting} onPress={() => void submit()} style={[styles.submitWrap, (!isValidPassword(password) || isSubmitting) && styles.disabled]}>
                  <LinearGradient colors={[themes.rodaja.primary, themes.brisas.primary]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.submit}>
                    {isSubmitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>Guardar contraseña</Text>}
                  </LinearGradient>
                </HapticPressable>
              </>
            ) : null}
            {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
            {error ? <HapticPressable onPress={() => router.replace('/')} style={styles.back}><Text style={styles.backText}>Volver al inicio</Text></HapticPressable> : null}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', padding: 22 },
  card: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 28, padding: 24, backgroundColor: 'rgba(8,8,14,0.78)' },
  title: { color: '#FFF', fontSize: 23, fontWeight: '800', textAlign: 'center' },
  hint: { color: 'rgba(255,255,255,0.62)', fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: 'center' },
  loader: { marginTop: 28 },
  passwordGroup: { marginTop: 24, position: 'relative', justifyContent: 'center' },
  input: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.22)', borderRadius: 14, borderWidth: 1.5, color: '#FFF', fontSize: 16, paddingHorizontal: 16, paddingRight: 88, paddingVertical: 14 },
  visibilityButton: { position: 'absolute', right: 6, paddingHorizontal: 12, paddingVertical: 10 },
  visibilityText: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '700' },
  requirements: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 10, textAlign: 'center' },
  submitWrap: { borderRadius: 16, marginTop: 20, overflow: 'hidden' },
  disabled: { opacity: 0.48 },
  submit: { alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  error: { backgroundColor: 'rgba(239,68,68,0.18)', borderRadius: 10, color: '#FCA5A5', fontSize: 13, lineHeight: 18, marginTop: 20, padding: 12, textAlign: 'center' },
  back: { alignSelf: 'center', marginTop: 16, padding: 8 },
  backText: { color: '#FFF', fontWeight: '700' },
});
