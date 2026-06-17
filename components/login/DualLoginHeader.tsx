import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { AppTheme, UserProfile } from '../../types';

interface DualLoginHeaderProps {
  rodaja: AppTheme;
  brisas: AppTheme;
  activeProfile: UserProfile | null;
}

function WorldNode({
  label,
  theme,
  side,
  active,
}: {
  label: string;
  theme: AppTheme;
  side: 'left' | 'right';
  active: boolean;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: active ? 1200 : 2400, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: active ? 1200 : 2400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [active, pulse]);

  const nodeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: active ? 1 + pulse.value * 0.18 : 1 + pulse.value * 0.08 }],
    shadowOpacity: active ? 0.9 : 0.4,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: active ? interpolate(pulse.value, [0, 1], [0.5, 1]) : 0.35,
    transform: [{ scale: 1 + pulse.value * 0.35 }],
  }));

  return (
    <View style={[styles.nodeWrap, side === 'right' && styles.nodeWrapRight]}>
      <Animated.View
        style={[
          styles.nodeRing,
          { borderColor: theme.primary },
          ringStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.node,
          {
            backgroundColor: theme.glass,
            borderColor: theme.primary,
            shadowColor: theme.primary,
          },
          nodeStyle,
        ]}
      >
        <View style={[styles.nodeCore, { backgroundColor: theme.primary }]} />
      </Animated.View>
      <Text style={[styles.nodeLabel, { color: theme.primary }]}>{label}</Text>
    </View>
  );
}

export function DualLoginHeader({ rodaja, brisas, activeProfile }: DualLoginHeaderProps) {
  const enter = useSharedValue(0);
  const bridge = useSharedValue(0);

  useEffect(() => {
    enter.value = withSpring(1, { damping: 14, stiffness: 90 });
    bridge.value = withDelay(
      300,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
  }, [bridge, enter]);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: interpolate(enter.value, [0, 1], [28, 0]) }],
  }));

  const bridgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(bridge.value, [0, 1], [0.35, 0.95]),
    transform: [{ scaleX: interpolate(bridge.value, [0, 1], [0.92, 1.04]) }],
  }));

  const bridgeDotStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(bridge.value, [0, 1], [-6, 6]) }],
  }));

  return (
    <Animated.View style={[styles.wrap, headerStyle]}>
      <View style={styles.worldsRow}>
        <WorldNode
          label="rodaja"
          theme={rodaja}
          side="left"
          active={activeProfile === 'rodaja'}
        />
        <Animated.View style={[styles.bridge, bridgeStyle]}>
          <View style={[styles.bridgeLine, { backgroundColor: rodaja.primary }]} />
          <Animated.View style={[styles.bridgeDot, bridgeDotStyle]}>
            <Text style={styles.bridgeSymbol}>∞</Text>
          </Animated.View>
          <View style={[styles.bridgeLine, { backgroundColor: brisas.primary }]} />
        </Animated.View>
        <WorldNode
          label="brisas"
          theme={brisas}
          side="right"
          active={activeProfile === 'brisas'}
        />
      </View>

      <Text style={styles.logo}>
        <Text style={styles.logoGym}>Gym</Text>
        <Text style={[styles.logoHalf, { color: rodaja.primary }]}>B</Text>
        <Text style={[styles.logoHalf, { color: brisas.primary }]}>ro</Text>
      </Text>
      <Text style={styles.tagline}>Dos mundos · Una app · Mismo gym</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginBottom: 28,
  },
  worldsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 8,
  },
  nodeWrap: {
    alignItems: 'center',
    width: 72,
  },
  nodeWrapRight: {},
  nodeRing: {
    position: 'absolute',
    top: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
  },
  node: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    elevation: 6,
  },
  nodeCore: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  nodeLabel: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  bridge: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 88,
    marginHorizontal: 4,
  },
  bridgeLine: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    opacity: 0.7,
  },
  bridgeDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  bridgeSymbol: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    fontWeight: '300',
    marginTop: -1,
  },
  logo: {
    fontSize: 46,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  logoGym: {
    color: '#FFFFFF',
  },
  logoHalf: {
    fontWeight: '900',
  },
  tagline: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    marginTop: 8,
    letterSpacing: 0.3,
  },
});
