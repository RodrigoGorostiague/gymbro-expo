import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useTheme } from '../context/ThemeContext';
import { ProfileAvatar } from './ProfileAvatar';

interface AppScreenHeaderProps {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}

export function AppScreenHeader({ title, subtitle, trailing }: AppScreenHeaderProps) {
  const { theme } = useTheme();
  const { userEmail } = useAuth();
  const { ownProfile } = useSocial();
  const enter = useSharedValue(0);

  useEffect(() => {
    enter.value = withSpring(1, { damping: 14, stiffness: 90 });
  }, [enter]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: interpolate(enter.value, [0, 1], [14, 0]) }],
  }));

  return (
    <Animated.View style={[styles.wrap, animStyle]}>
      <View style={styles.main}>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: theme.glass, borderColor: theme.primary }]}>
            <ProfileAvatar avatarId={ownProfile?.avatarId} size={26} borderColor={theme.primary} />
            <Text style={[styles.badgeText, { color: theme.primary }]}>{ownProfile?.alias ?? userEmail ?? 'Atleta'}</Text>
          </View>
          <View style={[styles.badgeLine, { backgroundColor: theme.primary }]} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
  },
  main: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  badgeLine: {
    flex: 1,
    height: 1.5,
    borderRadius: 1,
    opacity: 0.45,
    maxWidth: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    letterSpacing: 0.2,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: 10,
  },
});
