import React, { useEffect } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { HapticPressable } from '../HapticPressable';
import { AppTheme, UserProfile } from '../../types';

interface LoginFormPanelProps {
  rodaja: AppTheme;
  brisas: AppTheme;
  activeProfile: UserProfile | null;
  username: string;
  password: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSelectProfile: (profile: UserProfile) => void;
  onSubmit: () => void;
}

function ProfileChip({
  profile,
  theme,
  selected,
  onPress,
  delay,
}: {
  profile: UserProfile;
  theme: AppTheme;
  selected: boolean;
  onPress: () => void;
  delay: number;
}) {
  const enter = useSharedValue(0);
  const glow = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    enter.value = withDelay(delay, withSpring(1, { damping: 12, stiffness: 100 }));
  }, [delay, enter]);

  useEffect(() => {
    glow.value = withTiming(selected ? 1 : 0, { duration: 280, easing: Easing.out(Easing.quad) });
  }, [glow, selected]);

  const chipStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateY: interpolate(enter.value, [0, 1], [16, 0]) },
      { scale: interpolate(glow.value, [0, 1], [1, 1.04]) },
    ],
    borderColor: selected ? theme.primary : 'rgba(255,255,255,0.15)',
    shadowOpacity: interpolate(glow.value, [0, 1], [0, 0.55]),
  }));

  return (
    <Animated.View style={[styles.chipOuter, { shadowColor: theme.primary }, chipStyle]}>
      <HapticPressable
        onPress={onPress}
        style={[styles.chip, { backgroundColor: theme.glass }]}
      >
        <View style={[styles.chipDot, { backgroundColor: theme.primary }]} />
        <Text style={styles.chipText}>{profile}</Text>
        {selected ? (
          <View style={[styles.chipBadge, { backgroundColor: theme.primary }]}>
            <Text style={[styles.chipBadgeText, { color: theme.onPrimary }]}>●</Text>
          </View>
        ) : null}
      </HapticPressable>
    </Animated.View>
  );
}

export function LoginFormPanel({
  rodaja,
  brisas,
  activeProfile,
  username,
  password,
  onUsernameChange,
  onPasswordChange,
  onSelectProfile,
  onSubmit,
}: LoginFormPanelProps) {
  const panelEnter = useSharedValue(0);
  const accent = activeProfile === 'brisas' ? brisas : activeProfile === 'rodaja' ? rodaja : null;

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

  const borderColors = accent
    ? ([accent.primary, accent.accent] as [string, string])
    : ([rodaja.primary, brisas.primary] as [string, string]);

  const inputBorder = accent?.primary ?? 'rgba(255,255,255,0.22)';

  return (
    <Animated.View style={[styles.panelOuter, panelStyle]}>
      <LinearGradient
        colors={[...borderColors, borderColors[0]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.panelBorder}
      >
        <View style={styles.panelInner}>
          <BlurView intensity={55} tint="dark" style={styles.blur}>
            <View style={styles.glassContent}>
              <Text style={styles.portalLabel}>Portal de acceso</Text>
              <Text style={styles.portalHint}>Elige tu mundo o escribe tu usuario</Text>

              <View style={styles.chipsRow}>
                <ProfileChip
                  profile="rodaja"
                  theme={rodaja}
                  selected={activeProfile === 'rodaja'}
                  onPress={() => onSelectProfile('rodaja')}
                  delay={280}
                />
                <ProfileChip
                  profile="brisas"
                  theme={brisas}
                  selected={activeProfile === 'brisas'}
                  onPress={() => onSelectProfile('brisas')}
                  delay={360}
                />
              </View>

              <TextInput
                placeholder="Usuario"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={username}
                onChangeText={onUsernameChange}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { borderColor: inputBorder }]}
              />
              <TextInput
                placeholder="Contraseña"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={password}
                onChangeText={onPasswordChange}
                secureTextEntry
                style={[styles.input, styles.inputSpaced, { borderColor: inputBorder }]}
              />

              <HapticPressable onPress={onSubmit} style={styles.submitWrap}>
                <LinearGradient
                  colors={borderColors}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.submitBtn}
                >
                  <Text style={styles.submitText}>Entrar al gym</Text>
                </LinearGradient>
              </HapticPressable>
            </View>
          </BlurView>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panelOuter: {
    borderRadius: 28,
  },
  panelBorder: {
    borderRadius: 28,
    padding: 1.5,
  },
  panelInner: {
    borderRadius: 26,
    overflow: 'hidden',
  },
  blur: {
    borderRadius: 26,
  },
  glassContent: {
    padding: 22,
    backgroundColor: 'rgba(8,8,14,0.55)',
  },
  portalLabel: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  portalHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 18,
  },
  chipsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 18,
  },
  chipOuter: {
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 7,
  },
  chipDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  chipText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  chipBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  chipBadgeText: {
    fontSize: 8,
    lineHeight: 10,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    color: '#FFF',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  inputSpaced: {
    marginTop: 10,
  },
  submitWrap: {
    marginTop: 18,
    borderRadius: 16,
    overflow: 'hidden',
  },
  submitBtn: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  submitText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
