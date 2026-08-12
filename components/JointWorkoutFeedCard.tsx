import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { getJointWorkoutDetail, JointParticipant, JointWorkout, setJointParticipantReaction } from '../services/jointWorkouts';
import { GlassCard } from './GlassCard';
import { GlassButton } from './UI';
import { HapticPressable } from './HapticPressable';
import { JointParticipantProfileCard } from './JointParticipantProfileCard';
import { ProfileAvatar } from './ProfileAvatar';
import { ProfileTitleBadge } from './ProfileTitleBadge';
import type { WorkoutRecap } from '../types';
import { WorkoutPublicationCard } from './WorkoutPublicationCard';
import { formatRelativeTime } from '../utils/feedTimeline';

type Props = {
  workoutId: string;
  participants: readonly JointParticipant[];
  publishedAt: string;
  now?: number;
};

function participantRecap(participant: JointParticipant, publishedAt: string): WorkoutRecap | null {
  if (participant?.status !== 'completed' || !participant.workout) return null;
  const counts = new Map<string, number>();
  participant.workout.exercises.forEach((exercise) => {
    new Set(exercise.muscleGroupIds).forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  });
  return {
    id: `joint:${participant.id}`,
    authorId: participant.id,
    authorAlias: participant.alias,
    authorAvatarId: participant.avatarId,
    authorThemeId: participant.themeId ?? null,
    authorFrameId: participant.frameId,
    authorTitleId: participant.titleId,
    routineName: participant.workout.routineName,
    durationSeconds: participant.workout.durationSeconds,
    exerciseCount: participant.workout.exercises.length,
    metrics: { volume: participant.workout.exercises.reduce((total, exercise) => total + exercise.sets.reduce((sets, set) => sets + (set.completed ? set.weight * set.reps : 0), 0), 0) },
    muscleGroupIds: [...counts.keys()] as WorkoutRecap['muscleGroupIds'],
    muscleDistribution: [...counts].map(([id, value]) => ({ id: id as WorkoutRecap['muscleGroupIds'][number], value })),
    caption: null,
    completedAt: publishedAt,
    createdAt: publishedAt,
    templateAvailable: !!participant.sharePayload?.routine,
    mesocycleAvailable: !!participant.sharePayload?.mesocycle,
    isAuthor: participant.isSelf === true,
    reactionCount: participant.reactionCount ?? 0,
    commentCount: participant.commentCount ?? 0,
    viewerHasReacted: participant.viewerHasReacted === true,
  };
}

export function JointWorkoutFeedCard({ workoutId, participants: previewParticipants, publishedAt, now = Date.now() }: Props) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [workout, setWorkout] = useState<JointWorkout | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void getJointWorkoutDetail(workoutId).then((detail) => {
      setWorkout(detail);
      if (!detail) setError('El detalle ya no está disponible.');
    }).catch(() => setError('No se pudo cargar el detalle del grupo.'));
  }, [workoutId]);
  useEffect(() => { if (expanded) load(); }, [expanded, load]);
  useFocusEffect(useCallback(() => { if (expanded) load(); }, [expanded, load]));

  const participants = workout?.participants ?? previewParticipants;
  const toggleReaction = async (participant: JointParticipant) => {
    if (!workout) return;
    const reacted = !participant.viewerHasReacted;
    setWorkout((current) => current ? { ...current, participants: current.participants.map((item) => item.id === participant.id ? { ...item, viewerHasReacted: reacted, reactionCount: Math.max(0, (item.reactionCount ?? 0) + (reacted ? 1 : -1)) } : item) } : current);
    try {
      const state = await setJointParticipantReaction(workout.id, participant.id, reacted);
      setWorkout((current) => current ? { ...current, participants: current.participants.map((item) => item.id === participant.id ? { ...item, viewerHasReacted: state.reacted, reactionCount: state.reactionCount } : item) } : current);
    } catch {
      setWorkout((current) => current ? { ...current, participants: current.participants.map((item) => item.id === participant.id ? participant : item) } : current);
    }
  };

  return <GlassCard style={styles.card}>
    <HapticPressable accessibilityRole="button" accessibilityLabel="Expandir entrenamiento conjunto" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={styles.trigger}>
      <View style={styles.heading}><View><Text style={[styles.title, { color: theme.text }]}>Entrenamiento conjunto</Text><Text style={{ color: theme.textMuted }}>{expanded ? 'Ocultar participantes' : 'Ver participantes y resultados'}</Text></View><View style={styles.headingMeta}><Text style={[styles.publishedAt, { color: theme.textMuted }]}>{formatRelativeTime(publishedAt, now)}</Text><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={theme.primary} /></View></View>
      <View style={styles.people}>{participants.map((participant) => <View key={participant.id} style={styles.person}><ProfileAvatar avatarId={participant.avatarId} frameId={participant.frameId} size={30} borderColor={theme.primary} /><View style={styles.personCopy}><Text numberOfLines={1} style={{ color: theme.text }}>{participant.alias}</Text>{participant.titleId ? <ProfileTitleBadge titleId={participant.titleId} /> : null}</View></View>)}</View>
    </HapticPressable>
    {expanded ? <View style={styles.detail}>{error ? <Text accessibilityRole="alert" style={{ color: theme.textMuted }}>{error}</Text> : null}{!workout && !error ? <Text style={{ color: theme.textMuted }}>Cargando resultados...</Text> : null}{workout ? <View style={styles.participants}>{participants.map((participant) => {
      const recap = participantRecap(participant, publishedAt);
      if (!recap || (!participant.relationshipKind && !participant.isSelf)) return <JointParticipantProfileCard key={participant.id} participant={participant} onPress={() => router.push({ pathname: '/social/[uid]', params: { uid: participant.id } })}><Text style={{ color: theme.textMuted }}>{participant.canInviteBro ? 'Ver perfil e invitar como Bro' : 'Ver perfil público'}</Text></JointParticipantProfileCard>;
      return <WorkoutPublicationCard key={participant.id} recap={recap} now={now} onProfilePress={() => router.push(participant.isSelf ? '/profile' : { pathname: '/social/[uid]', params: { uid: participant.id } })} onPress={() => router.push({ pathname: '/social/recap/[id]', params: { id: recap.id, workoutId, participantId: participant.id } })} onToggleReaction={!participant.isSelf ? () => void toggleReaction(participant) : undefined} />;
    })}</View> : null}</View> : null}
  </GlassCard>;
}

const styles = StyleSheet.create({
  card: { gap: 12, paddingVertical: 16 },
  trigger: { gap: 10 },
  heading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headingMeta: { alignItems: 'flex-end' },
  publishedAt: { fontSize: 11, fontWeight: '700' },
  title: { fontSize: 20, fontWeight: '900' },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  person: { alignItems: 'center', flexDirection: 'row', gap: 6, maxWidth: 180 },
  personCopy: { flexShrink: 1, gap: 3 },
  detail: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#9CA3AF', paddingTop: 12 },
  participants: { gap: 8 },
});
