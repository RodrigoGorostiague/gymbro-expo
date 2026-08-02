import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { HapticPressable } from '../HapticPressable';
import { AppTheme } from '../../types';

export type AuthMode = 'signIn' | 'signUp' | 'forgotPassword';

interface LoginFormPanelProps {
  rodaja: AppTheme;
  brisas: AppTheme;
  mode: AuthMode;
  email: string;
  password: string;
  isSubmitting: boolean;
  feedback: { tone: 'error' | 'success'; message: string } | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: () => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordRequirements(password: string) {
  return [
    { label: '8 o más caracteres', met: password.length >= 8 },
    { label: 'Una mayúscula', met: /[A-Z]/.test(password) },
    { label: 'Una minúscula', met: /[a-z]/.test(password) },
    { label: 'Un número', met: /\d/.test(password) },
  ];
}

export function LoginFormPanel({
  rodaja,
  brisas,
  mode,
  email,
  password,
  isSubmitting,
  feedback,
  onEmailChange,
  onPasswordChange,
  onModeChange,
  onSubmit,
}: LoginFormPanelProps) {
  const panelEnter = useSharedValue(0);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const requirements = passwordRequirements(password);
  const hasValidEmail = EMAIL_PATTERN.test(email.trim());
  const isPasswordValid = requirements.every((requirement) => requirement.met);
  const canSubmit = mode === 'forgotPassword' ? hasValidEmail : hasValidEmail && password.length > 0 && (mode !== 'signUp' || isPasswordValid);
  const title = mode === 'signIn' ? 'Bienvenido de nuevo' : mode === 'signUp' ? 'Creá tu cuenta' : 'Recuperá tu acceso';
  const hint = mode === 'signIn'
    ? 'Volvé a entrenar donde lo dejaste.'
    : mode === 'signUp'
      ? 'Tu perfil de entrenamiento lo configuramos después.'
      : 'Te mandaremos un enlace seguro para crear una nueva contraseña.';
  const submitLabel = mode === 'signIn' ? 'Entrar al gimnasio' : mode === 'signUp' ? 'Crear cuenta' : 'Enviar enlace de recuperación';

  useEffect(() => {
    panelEnter.value = withDelay(180, withSpring(1, { damping: 15, stiffness: 85 }));
  }, [panelEnter]);

  const panelStyle = useAnimatedStyle(() => ({
    opacity: panelEnter.value,
    transform: [
      { translateY: interpolate(panelEnter.value, [0, 1], [40, 0]) },
      { scale: interpolate(panelEnter.value, [0, 1], [0.96, 1]) },
    ],
  }));

  const borderColors = [rodaja.primary, brisas.primary] as [string, string];

  return (
    <Animated.View style={[styles.panelOuter, panelStyle]}>
      <LinearGradient colors={[...borderColors, borderColors[0]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.panelBorder}>
        <View style={styles.panelInner}>
          <BlurView intensity={55} tint="dark" style={styles.blur}>
            <View style={styles.glassContent}>
              <Text style={styles.portalLabel}>{title}</Text>
              <Text style={styles.portalHint}>{hint}</Text>

              <TextInput
                accessibilityLabel="Correo electrónico"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={onEmailChange}
                placeholder="Correo electrónico"
                placeholderTextColor="rgba(255,255,255,0.4)"
                returnKeyType={mode === 'forgotPassword' ? 'send' : 'next'}
                style={styles.input}
                textContentType="emailAddress"
                value={email}
                onSubmitEditing={mode === 'forgotPassword' && canSubmit ? onSubmit : undefined}
              />

              {mode !== 'forgotPassword' ? (
                <View style={styles.passwordGroup}>
                  <TextInput
                    accessibilityLabel="Contraseña"
                    autoCapitalize="none"
                    autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                    onChangeText={onPasswordChange}
                    onSubmitEditing={canSubmit ? onSubmit : undefined}
                    placeholder="Contraseña"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    returnKeyType="go"
                    secureTextEntry={!passwordVisible}
                    style={[styles.input, styles.passwordInput]}
                    textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
                    value={password}
                  />
                  <HapticPressable
                    accessibilityLabel={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    accessibilityRole="button"
                    onPress={() => setPasswordVisible((visible) => !visible)}
                    style={styles.visibilityButton}
                  >
                    <Text style={styles.visibilityText}>{passwordVisible ? 'Ocultar' : 'Mostrar'}</Text>
                  </HapticPressable>
                </View>
              ) : null}

              {mode === 'signUp' ? (
                <View accessibilityLabel="Requisitos de contraseña" style={styles.requirements}>
                  {requirements.map((requirement) => (
                    <Text key={requirement.label} style={[styles.requirement, requirement.met && styles.requirementMet]}>
                      {requirement.met ? '✓' : '○'} {requirement.label}
                    </Text>
                  ))}
                </View>
              ) : null}

              {feedback ? <Text accessibilityLiveRegion="polite" style={[styles.feedback, feedback.tone === 'error' ? styles.feedbackError : styles.feedbackSuccess]}>{feedback.message}</Text> : null}

              <HapticPressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSubmit || isSubmitting, busy: isSubmitting }}
                disabled={!canSubmit || isSubmitting}
                onPress={onSubmit}
                style={[styles.submitWrap, (!canSubmit || isSubmitting) && styles.submitDisabled]}
              >
                <LinearGradient colors={borderColors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.submitBtn}>
                  {isSubmitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>{submitLabel}</Text>}
                </LinearGradient>
              </HapticPressable>

              {mode === 'signIn' ? (
                <>
                  <HapticPressable accessibilityRole="button" onPress={() => onModeChange('forgotPassword')} style={styles.linkWrap}>
                    <Text style={styles.linkText}>¿Olvidaste tu contraseña?</Text>
                  </HapticPressable>
                  <HapticPressable accessibilityRole="button" onPress={() => onModeChange('signUp')} style={styles.linkWrap}>
                    <Text style={styles.registerText}>¿Primera vez? Crear cuenta</Text>
                  </HapticPressable>
                </>
              ) : (
                <HapticPressable accessibilityRole="button" onPress={() => onModeChange('signIn')} style={styles.linkWrap}>
                  <Text style={styles.registerText}>Volver a iniciar sesión</Text>
                </HapticPressable>
              )}
            </View>
          </BlurView>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panelOuter: { borderRadius: 28 },
  panelBorder: { borderRadius: 28, padding: 1.5 },
  panelInner: { borderRadius: 26, overflow: 'hidden' },
  blur: { borderRadius: 26 },
  glassContent: { padding: 22, backgroundColor: 'rgba(8,8,14,0.55)' },
  portalLabel: { color: 'rgba(255,255,255,0.92)', fontSize: 20, fontWeight: '800', textAlign: 'center', letterSpacing: 0.2 },
  portalHint: { color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 5, marginBottom: 20 },
  input: { borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, color: '#FFF', backgroundColor: 'rgba(255,255,255,0.07)' },
  passwordGroup: { marginTop: 10, position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 88 },
  visibilityButton: { position: 'absolute', right: 6, paddingHorizontal: 12, paddingVertical: 10 },
  visibilityText: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '700' },
  requirements: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  requirement: { color: 'rgba(255,255,255,0.42)', fontSize: 11 },
  requirementMet: { color: '#A7F3D0' },
  feedback: { borderRadius: 10, fontSize: 12, lineHeight: 17, marginTop: 14, paddingHorizontal: 12, paddingVertical: 9, textAlign: 'center' },
  feedbackError: { backgroundColor: 'rgba(239,68,68,0.18)', color: '#FCA5A5' },
  feedbackSuccess: { backgroundColor: 'rgba(16,185,129,0.18)', color: '#A7F3D0' },
  submitWrap: { marginTop: 18, borderRadius: 16, overflow: 'hidden' },
  submitDisabled: { opacity: 0.48 },
  submitBtn: { minHeight: 52, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  linkWrap: { alignSelf: 'center', marginTop: 14, paddingHorizontal: 12, paddingVertical: 4 },
  linkText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  registerText: { color: 'rgba(255,255,255,0.88)', fontSize: 13, fontWeight: '800', textAlign: 'center' },
});
