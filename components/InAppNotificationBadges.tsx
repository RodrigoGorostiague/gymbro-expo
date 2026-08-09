import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated as RNAnimated, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { markNotificationRead, listNotificationInbox, NotificationInboxItem, subscribeToNotificationInboxChanges } from '../services/notificationInbox';
import { inviteActiveWorkoutMember, respondToJointInvite } from '../services/jointWorkouts';
import { ProfileAvatar } from './ProfileAvatar';
import { HapticPressable } from './HapticPressable';
import { playSocialNotificationSound } from '../utils/socialNotificationSound';

function invitationWorkoutId(item: NotificationInboxItem): string | null {
  return item.kind === 'joint_workout_invite' && typeof item.data.workout_id === 'string' ? item.data.workout_id : null;
}

function workoutStartActorId(item: NotificationInboxItem): string | null {
  return item.kind === 'circle_workout_started' && typeof item.data.actor_id === 'string' ? item.data.actor_id : null;
}

export function shouldDismissNotificationBadge(translationX: number, velocityX: number): boolean {
  'worklet';
  return Math.abs(translationX) >= 96 || Math.abs(velocityX) >= 650;
}

function InAppNotificationBadge({ item, busy, canInviteWorkoutStart, onAct, onDismiss }: {
  item: NotificationInboxItem;
  busy: boolean;
  canInviteWorkoutStart: boolean;
  onAct: () => void;
  onDismiss: () => void;
}) {
  const { theme } = useTheme();
  const entrance = useRef(new RNAnimated.Value(84)).current;
  const translateX = useSharedValue(0);
  const avatarId = typeof item.data.actor_avatar_id === 'string' ? item.data.actor_avatar_id : undefined;
  const isInvite = invitationWorkoutId(item) !== null;
  const isWorkoutStart = workoutStartActorId(item) !== null && canInviteWorkoutStart;
  const swipeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onUpdate((event) => { translateX.value = event.translationX; })
    .onEnd((event) => {
      if (shouldDismissNotificationBadge(event.translationX, event.velocityX)) {
        const direction = event.translationX || event.velocityX;
        translateX.value = withTiming(direction < 0 ? -480 : 480, { duration: 160 }, (finished) => {
          if (finished) runOnJS(onDismiss)();
        });
      }
      else translateX.value = withTiming(0, { duration: 160 });
    });

  useEffect(() => {
    RNAnimated.spring(entrance, { toValue: 0, useNativeDriver: true, friction: 9, tension: 75 }).start();
    playSocialNotificationSound();
  }, [entrance]);

  return <GestureDetector gesture={pan}><Animated.View style={swipeStyle}><RNAnimated.View accessibilityRole="alert" style={[styles.badge, { backgroundColor: theme.tabBarBackground, borderColor: theme.primary, transform: [{ translateY: entrance }] }]}>
    <ProfileAvatar avatarId={avatarId} size={42} borderColor={theme.primary} />
    <View style={styles.copy}><Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>{item.title}</Text>{item.body ? <Text numberOfLines={2} style={[styles.body, { color: theme.textMuted }]}>{item.body}</Text> : null}</View>
    <HapticPressable accessibilityRole="button" accessibilityLabel={isInvite ? 'Aceptar invitación' : isWorkoutStart ? 'Invitar a entrenar' : 'Abrir notificación'} disabled={busy} onPress={onAct} style={[styles.action, { backgroundColor: theme.primary }]}><Text style={[styles.actionText, { color: theme.onPrimary }]}>{isInvite ? 'Aceptar' : isWorkoutStart ? 'Invitar' : 'Ver'}</Text></HapticPressable>
    <HapticPressable accessibilityRole="button" accessibilityLabel="Cerrar notificación" disabled={busy} onPress={onDismiss} style={styles.close}><Text style={[styles.closeText, { color: theme.textMuted }]}>×</Text></HapticPressable>
  </RNAnimated.View></Animated.View></GestureDetector>;
}

export function InAppNotificationBadges() {
  const { user } = useAuth();
  const { activeWorkoutDraft, updateActiveWorkout } = useData();
  const { theme } = useTheme();
  const [items, setItems] = useState<NotificationInboxItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => setItems((await listNotificationInbox(8)).filter((item) => !item.readAt).sort((left, right) => left.createdAt.localeCompare(right.createdAt))), []);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: () => void = () => undefined;
    if (!user) { setItems([]); return undefined; }
    void load().catch(() => undefined);
    void subscribeToNotificationInboxChanges(() => { void load().catch(() => undefined); }).then((cleanup) => {
      if (mounted) unsubscribe = cleanup;
      else cleanup();
    }).catch(() => undefined);
    return () => { mounted = false; unsubscribe(); };
  }, [load, user]);

  const dismiss = async (item: NotificationInboxItem) => {
    setBusy(item.id);
    try {
      await markNotificationRead(item.id);
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    } finally { setBusy(null); }
  };
  const act = async (item: NotificationInboxItem) => {
    const workoutId = invitationWorkoutId(item);
    const actorId = workoutStartActorId(item);
    setBusy(item.id);
    try {
      if (workoutId) {
        await respondToJointInvite(workoutId, true);
        if (activeWorkoutDraft) await updateActiveWorkout({ ...activeWorkoutDraft, jointWorkoutId: workoutId });
      } else if (actorId && activeWorkoutDraft?.routineSnapshot) {
        const jointWorkoutId = await inviteActiveWorkoutMember(actorId, activeWorkoutDraft.routineSnapshot);
        await updateActiveWorkout({ ...activeWorkoutDraft, jointWorkoutId });
      } else if (typeof item.data.url === 'string' && item.data.url.startsWith('/')) {
        router.push(item.data.url);
      }
      await markNotificationRead(item.id);
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    } catch (error) {
      if (error instanceof Error && error.message === 'joint workout unavailable') {
        // The invitation was resolved or expired on another device. Remove its stale badge.
        await markNotificationRead(item.id).catch(() => undefined);
        setItems((current) => current.filter((candidate) => candidate.id !== item.id));
        return;
      }
      Alert.alert('No se pudo procesar la invitación', error instanceof Error ? error.message : 'Intentá nuevamente.');
    } finally { setBusy(null); }
  };

  const visibleItems = items.filter((item) => {
    if (item.kind !== 'circle_workout_started') return true;
    const expiresAt = typeof item.data.expires_at === 'string' ? Date.parse(item.data.expires_at) : Number.NaN;
    return Boolean(activeWorkoutDraft?.routineSnapshot) && Number.isFinite(expiresAt) && expiresAt > Date.now();
  });

  return <View pointerEvents="box-none" style={styles.stack}>
    {visibleItems.map((item) => <InAppNotificationBadge key={item.id} item={item} busy={busy === item.id} canInviteWorkoutStart={Boolean(activeWorkoutDraft?.routineSnapshot)} onAct={() => void act(item)} onDismiss={() => void dismiss(item)} />)}
  </View>;
}

const styles = StyleSheet.create({
  stack: { bottom: 24, gap: 8, left: 12, position: 'absolute', right: 12, zIndex: 100 },
  badge: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 10, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, elevation: 8 },
  copy: { flex: 1, gap: 2 }, title: { fontSize: 14, fontWeight: '900' }, body: { fontSize: 12, lineHeight: 16 },
  action: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }, actionText: { fontSize: 12, fontWeight: '900' },
  close: { padding: 2 }, closeText: { fontSize: 24, lineHeight: 24 },
});
