import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { AnimatedOrb } from './AnimatedOrb';
import { DualLoginBackground } from './login/DualLoginBackground';
import { ThemeDecorations } from './ThemeDecorations';
import { BackgroundEngine } from './BackgroundEngine';
import type { AppTheme } from '../types';

const { width: W, height: H } = Dimensions.get('window');

interface ThemeBackgroundProps {
  children: React.ReactNode;
  theme?: AppTheme;
}

function SingleThemeBackground({ children, theme: themeOverride }: ThemeBackgroundProps) {
  const { theme: activeTheme, backgroundId } = useTheme();
  const theme = themeOverride ?? activeTheme;
  const breath = useSharedValue(0);

  useEffect(() => {
    breath.value = withRepeat(
      withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [breath]);

  const gradientStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(breath.value, [0, 1], [1, 1.04]) }],
    opacity: interpolate(breath.value, [0, 1], [0.94, 1]),
  }));

  return (
    <View style={styles.fill}>
      <Animated.View style={[StyleSheet.absoluteFill, gradientStyle]}>
        <LinearGradient
          colors={theme.background as [string, string, ...string[]]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>

      {!themeOverride ? <BackgroundEngine backgroundId={backgroundId} /> : null}

      <View style={styles.orbLayer} pointerEvents="none">
        <AnimatedOrb color={theme.primary} size={W * 0.55} left={W * 0.45} top={-H * 0.06} delay={0} />
        <AnimatedOrb color={theme.accent} size={W * 0.28} left={-W * 0.08} top={H * 0.22} delay={500} />
        <AnimatedOrb color={theme.secondary} size={W * 0.18} left={W * 0.62} top={H * 0.58} delay={900} />
      </View>

      {theme.decoration ? (
        <ThemeDecorations decoration={theme.decoration} theme={theme} />
      ) : null}

      {children}
    </View>
  );
}

export function ThemeBackground({ children, theme }: ThemeBackgroundProps) {
  const { dualThemes, isCombined, backgroundId } = useTheme();

  if (!theme && isCombined && dualThemes) {
    return (
      <View style={styles.fill}>
        <DualLoginBackground rodaja={dualThemes.rodaja} brisas={dualThemes.brisas} />
        <BackgroundEngine backgroundId={backgroundId} />
        {children}
      </View>
    );
  }

  return <SingleThemeBackground theme={theme}>{children}</SingleThemeBackground>;
}

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  noPadding?: boolean;
  fill?: boolean;
  blur?: boolean;
  theme?: AppTheme;
}

export function GlassCard({ children, style, intensity = 50, noPadding, fill = false, blur = true, theme: themeOverride }: GlassCardProps) {
  const { theme: activeTheme, dualThemes, isCombined } = useTheme();
  const theme = themeOverride ?? activeTheme;

  const innerGlass =
    theme.blurTint === 'light' ? 'rgba(255,255,255,0.55)' : 'rgba(8,8,14,0.55)';

  const borderColors = (
    !themeOverride && isCombined && dualThemes
      ? [dualThemes.rodaja.primary, dualThemes.brisas.primary, dualThemes.rodaja.primary]
      : [theme.primary, theme.accent, theme.primary]
  ) as [string, string, ...string[]];

  return (
    <View style={[styles.cardOuter, style]}>
      <LinearGradient colors={borderColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.cardBorder, fill && styles.fill]}>
        <View style={[styles.cardInner, fill && styles.fill]}>
          {blur ? <BlurView intensity={intensity} tint={theme.blurTint} style={[styles.cardBlur, fill && styles.fill]}>
            <View style={[noPadding ? undefined : styles.cardContent, fill && styles.fill, { backgroundColor: innerGlass }]}>
              {children}
            </View>
          </BlurView> : <View style={[styles.cardBlur, noPadding ? undefined : styles.cardContent, fill && styles.fill, { backgroundColor: innerGlass }]}>
            {children}
          </View>}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  orbLayer: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  cardOuter: {
    borderRadius: 22,
  },
  cardBorder: {
    borderRadius: 22,
    padding: 1.5,
  },
  cardInner: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  cardBlur: {
    borderRadius: 20,
  },
  cardContent: {
    padding: 16,
  },
});
