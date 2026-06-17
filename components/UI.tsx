import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { HapticPressable } from './HapticPressable';
import { useTheme } from '../context/ThemeContext';

interface GlassButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
}

export function GlassButton({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
}: GlassButtonProps) {
  const { theme, dualThemes, isCombined } = useTheme();

  if (variant === 'primary') {
    const colors = (
      isCombined && dualThemes
        ? [dualThemes.rodaja.primary, dualThemes.brisas.primary]
        : [theme.primary, theme.accent]
    ) as [string, string];

    return (
      <HapticPressable
        onPress={onPress}
        disabled={disabled || loading}
        style={({ pressed }) => [styles.gradientWrap, { opacity: pressed || disabled || loading ? 0.75 : 1 }]}
      >
        <LinearGradient colors={colors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.button}>
          {loading ? (
            <ActivityIndicator color={theme.onPrimary} />
          ) : (
            <Text style={[styles.buttonText, { color: theme.onPrimary }]}>{title}</Text>
          )}
        </LinearGradient>
      </HapticPressable>
    );
  }

  const bg = variant === 'danger' ? '#C0392B' : 'transparent';
  const textColor = variant === 'danger' ? '#FFF' : theme.text;

  return (
    <HapticPressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: theme.glassBorder,
          opacity: pressed || disabled ? 0.7 : 1,
        },
        variant === 'secondary' && styles.secondaryBtn,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.buttonText, { color: textColor }]}>{title}</Text>
      )}
    </HapticPressable>
  );
}

export function GlassInput(props: TextInputProps) {
  const { theme } = useTheme();

  return (
    <TextInput
      {...props}
      placeholderTextColor={theme.textMuted}
      style={[
        styles.input,
        {
          color: theme.text,
          borderColor: theme.primary,
          backgroundColor: theme.blurTint === 'light' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.07)',
        },
        props.style,
      ]}
    />
  );
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const { theme } = useTheme();

  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionEyebrow, { color: theme.primary }]}>Portal</Text>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gradientWrap: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  button: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    borderWidth: 1.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
  },
  sectionHeader: {
    marginBottom: 4,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  sectionSubtitle: {
    fontSize: 13,
    marginTop: 4,
    letterSpacing: 0.2,
  },
});
