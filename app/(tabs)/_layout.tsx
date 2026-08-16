import React, { useEffect, useState } from 'react';
import { Tabs, Redirect, router, useSegments } from 'expo-router';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { ThemePreviewBar } from '../../components/ThemePreviewBar';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useSocial } from '../../context/SocialContext';
import { getCommunityBadgeCounts } from '../../services/communityBadge';
import { useData } from '../../context/DataContext';
import { hasActiveWorkoutReentryIntegrity } from '../../utils/activeWorkoutReentry';
import { deriveMesocycleDayGuidance } from '../../utils/mesocycles';

type TabIconName = keyof typeof Ionicons.glyphMap;

function TabIcon({
  name,
  focused,
}: {
  name: TabIconName;
  focused: boolean;
}) {
  const { theme } = useTheme();

  return (
    <View style={styles.iconWrap}>
      {focused && (
        <LinearGradient
          colors={[theme.primary, theme.accent]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.activePill}
        />
      )}
      <Ionicons
        name={name}
        size={22}
        color={focused ? theme.primary : theme.textMuted}
      />
    </View>
  );
}

function TabBarBackground() {
  const { theme } = useTheme();

  return (
    <View style={StyleSheet.absoluteFill}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={70} tint={theme.blurTint} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.tabBarBackground }]} />
      )}
      <LinearGradient
        colors={[theme.primary, theme.accent, theme.primary]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.tabBarGlow}
      />
    </View>
  );
}

function ActiveWorkoutTabButton() {
  const { theme } = useTheme();
  const { activeWorkoutDraft, routines, mesocycles, cancelActiveWorkout } = useData();
  const segments = useSegments();
  const resumableDraft = hasActiveWorkoutReentryIntegrity(activeWorkoutDraft, routines, mesocycles);
  const activeMesocycle = mesocycles.find((mesocycle) => mesocycle.status === 'active');
  const dayGuidance = activeMesocycle ? deriveMesocycleDayGuidance(activeMesocycle) : null;
  const plannedRoutine = dayGuidance?.state === 'routine' && routines.some((routine) => routine.id === dayGuidance.ref.routineId)
    ? dayGuidance
    : null;
  const onTrainTab = segments.at(-1) === 'train';
  const dailyRoutinePulse = useSharedValue(0);

  useEffect(() => {
    dailyRoutinePulse.value = plannedRoutine && !resumableDraft
      ? withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true)
      : withTiming(0, { duration: 180 });
  }, [dailyRoutinePulse, plannedRoutine, resumableDraft]);

  const dailyRoutinePulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dailyRoutinePulse.value, [0, 1], [0.4, 1]),
    transform: [{ scale: interpolate(dailyRoutinePulse.value, [0, 1], [1, 1.14]) }],
  }));

  const continueActiveWorkout = () => {
    if (resumableDraft) {
      const params: Record<string, string> = { id: activeWorkoutDraft!.routineId };
      if (activeWorkoutDraft!.jointWorkoutId) params.jointWorkoutId = activeWorkoutDraft!.jointWorkoutId;
      if (activeWorkoutDraft!.lineage) {
        params.mesocycleId = activeWorkoutDraft!.lineage.mesocycleId;
        params.weekNumber = String(activeWorkoutDraft!.lineage.weekNumber);
        params.plannedSessionId = activeWorkoutDraft!.lineage.plannedSessionId;
      }
      router.navigate({ pathname: '/routine/execute/[id]', params });
      return;
    }

    if (!onTrainTab) {
      router.navigate('/train');
      return;
    }

    if (plannedRoutine && activeMesocycle) {
      router.navigate({
        pathname: '/routine/execute/[id]',
        params: {
          id: plannedRoutine.ref.routineId,
          mesocycleId: activeMesocycle.id,
          weekNumber: String(plannedRoutine.weekNumber),
          plannedSessionId: plannedRoutine.entryId,
        },
      });
      return;
    }

    if (dayGuidance?.state === 'rest') {
      Alert.alert('Día de descanso', 'Hoy toca descanso. Recuperá energía para tu próxima sesión.');
    }
  };
  const openMenu = () => {
    if (!resumableDraft || !activeWorkoutDraft) return;
    Alert.alert('Entrenamiento en curso', activeWorkoutDraft.routineSnapshot?.name ?? 'Tu entrenamiento', [
      { text: 'Ir a Entrenar', onPress: () => router.navigate('/train') },
      { text: 'Continuar', onPress: continueActiveWorkout },
      {
        text: 'Cancelar entrenamiento',
        style: 'destructive',
        onPress: () => void cancelActiveWorkout().catch((error) => {
          Alert.alert('No se pudo cancelar', error instanceof Error ? error.message : 'Inténtalo nuevamente.');
        }),
      },
      { text: 'Cerrar', style: 'cancel' },
    ]);
  };
  const active = resumableDraft;
  const sets = activeWorkoutDraft?.routineSnapshot?.exercises.flatMap((exercise) =>
    exercise.sets.map((set) => `${exercise.id}-${set.id}`),
  ) ?? [];
  const completedSets = sets.filter((setKey) => activeWorkoutDraft?.completedSets[setKey]).length;
  const progress = sets.length ? completedSets / sets.length : 0;
  const ringSize = 54;
  const ringStroke = 3;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCircumference = 2 * Math.PI * ringRadius;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? `Entrenamiento activo: ${activeWorkoutDraft?.routineSnapshot?.name ?? 'sesión en curso'}, ${completedSets} de ${sets.length} series completadas. Tocá para continuar.` : plannedRoutine ? `Rutina de hoy: ${plannedRoutine.ref.routineName}. Tocá para entrenar.` : 'Entrenar'}
      onPress={continueActiveWorkout}
      onLongPress={openMenu}
      style={({ pressed }) => [styles.workoutTabButton, { opacity: pressed ? 0.82 : 1 }]}
    >
      {!active && plannedRoutine ? <Animated.View pointerEvents="none" style={[styles.dailyRoutinePulse, { borderColor: theme.onPrimary }, dailyRoutinePulseStyle]} /> : null}
      <LinearGradient colors={active ? [theme.accent, theme.primary] : [theme.primary, theme.accent]} style={styles.workoutTabGradient}>
        {active ? <Svg pointerEvents="none" width={ringSize} height={ringSize} style={styles.workoutActivityRing}>
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            fill="none"
            r={ringRadius}
            stroke="rgba(255,255,255,0.28)"
            strokeWidth={ringStroke}
          />
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            fill="none"
            r={ringRadius}
            rotation="-90"
            origin={`${ringSize / 2}, ${ringSize / 2}`}
            stroke={theme.onPrimary}
            strokeDasharray={ringCircumference}
            strokeDashoffset={ringCircumference * (1 - progress)}
            strokeLinecap="round"
            strokeWidth={ringStroke}
          />
        </Svg> : null}
        <Ionicons name={active || plannedRoutine ? 'play' : 'barbell'} size={25} color={theme.onPrimary} />
      </LinearGradient>
      <Text style={[styles.workoutTabLabel, { color: active || plannedRoutine ? theme.accent : theme.textMuted }]}>{active ? `${completedSets}/${sets.length}` : plannedRoutine ? 'HOY' : 'Entrenar'}</Text>
      {plannedRoutine && !active ? <Text numberOfLines={1} style={[styles.workoutRoutineName, { color: theme.textMuted }]}>{plannedRoutine.ref.routineName}</Text> : null}
    </Pressable>
  );
}

export default function TabsLayout() {
  const { user, isLoading } = useAuth();
  const { theme } = useTheme();
  const { realtimeRevision } = useSocial();
  const insets = useSafeAreaInsets();
  const [communityBadge, setCommunityBadge] = useState<number | string | undefined>();

  useEffect(() => {
    let active = true;
    const refresh = () => void getCommunityBadgeCounts().then((counts) => {
      if (!active) return;
      setCommunityBadge(counts.total > 99 ? '99+' : counts.total || undefined);
    }).catch(() => {
      if (active) setCommunityBadge(undefined);
    });
    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, [realtimeRevision]);

  if (isLoading) return null;
  if (!user) return <Redirect href="/" />;

  return (
    <View style={styles.container}>
      <Tabs
        initialRouteName="train"
        screenOptions={{
          headerShown: false,
          tabBarBackground: () => <TabBarBackground />,
          tabBarStyle: {
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            height: 58 + insets.bottom,
            paddingTop: 6,
            paddingBottom: Math.max(insets.bottom, 10),
            elevation: 0,
          },
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.textMuted,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 0.3,
            marginTop: 2,
          },
        }}
      >
        <Tabs.Screen
          name="progress"
          options={{
            title: 'Progreso',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'analytics' : 'analytics-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="community"
          options={{
            title: 'Comunidad',
            tabBarBadge: communityBadge,
            tabBarAccessibilityLabel: communityBadge ? `Comunidad, ${communityBadge} pendientes` : 'Comunidad',
            tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'people' : 'people-outline'} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="train"
          options={{
            title: 'Entrenar',
            tabBarButton: () => <ActiveWorkoutTabButton />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Perfil',
            tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'person' : 'person-outline'} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'Más',
            tabBarIcon: ({ focused }) => (
              <TabIcon name={focused ? 'grid' : 'grid-outline'} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen name="mesocycles/index" options={{ href: null }} />
        <Tabs.Screen name="routines/index" options={{ href: null }} />
        <Tabs.Screen name="exercises/index" options={{ href: null }} />
        <Tabs.Screen name="social" options={{ href: null }} />
        <Tabs.Screen name="shop" options={{ href: null }} />
      </Tabs>
      <ThemePreviewBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBarGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    opacity: 0.85,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 28,
  },
  activePill: {
    position: 'absolute',
    top: -4,
    width: 22,
    height: 3,
    borderRadius: 2,
  },
  workoutTabButton: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: -30,
    position: 'relative',
    width: 76,
  },
  workoutTabGradient: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.45)',
    borderRadius: 31,
    borderWidth: 2,
    height: 62,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 62,
  },
  workoutActivityRing: {
    position: 'absolute',
  },
  dailyRoutinePulse: {
    borderRadius: 35,
    borderWidth: 2,
    height: 70,
    position: 'absolute',
    top: -4,
    width: 70,
  },
  workoutTabLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.2,
    marginTop: 3,
  },
  workoutRoutineName: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 1,
    maxWidth: 76,
  },
});
