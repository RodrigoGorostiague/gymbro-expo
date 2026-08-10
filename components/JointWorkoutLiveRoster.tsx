import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { JointParticipant } from '../services/jointWorkouts';
import { useTheme } from '../context/ThemeContext';
import { HapticPressable } from './HapticPressable';
import { ProfileAvatar } from './ProfileAvatar';

function formatRest(endsAt?: string, now = Date.now()): string | null {
  if (!endsAt) return null;
  const seconds = Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function participantState(participant: JointParticipant, now: number) {
  if (participant.status === 'completed') return { label: 'Completó', color: '#22C55E' };
  if (participant.status !== 'active') return { label: participant.status === 'invited' ? 'Invitado' : 'No disponible', color: '#94A3B8' };
  const progress = participant.liveProgress;
  if (progress?.state === 'paused') return { label: 'Pausado', color: '#94A3B8' };
  if (progress?.state === 'resting') return { label: `Descanso${formatRest(progress.restEndsAt, now) ? ` ${formatRest(progress.restEndsAt, now)}` : ''}`, color: '#F59E0B' };
  return { label: 'Entrenando', color: '#22C55E' };
}

export function JointWorkoutLiveRoster({ participants, expanded, onToggle }: { participants: readonly JointParticipant[]; expanded: boolean; onToggle: () => void }) {
  const { theme } = useTheme();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!participants.some((participant) => participant.liveProgress?.state === 'resting')) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [participants]);

  return <View style={styles.container}>
    <View style={styles.compactRow}>
      {participants.length ? participants.slice(0, 3).map((participant) => {
        const state = participantState(participant, now);
        return <View key={participant.id} accessibilityLabel={`${participant.alias}: ${state.label}`} style={[styles.avatarWrap, { borderColor: state.color }]}><ProfileAvatar avatarId={participant.avatarId} frameId={participant.frameId} size={30} borderColor={state.color} /><View style={[styles.statusDot, { backgroundColor: state.color }]} /></View>;
      }) : <Text style={[styles.solo, { color: theme.textMuted }]}>Solo</Text>}
      {participants.length > 3 ? <Text style={[styles.overflow, { color: theme.text }]}>+{participants.length - 3}</Text> : null}
      <HapticPressable accessibilityRole="button" accessibilityLabel={expanded ? 'Ocultar entrenamiento conjunto' : 'Mostrar entrenamiento conjunto'} accessibilityState={{ expanded }} onPress={onToggle} style={[styles.toggle, { backgroundColor: expanded ? theme.primary : theme.glass, borderColor: expanded ? theme.primary : theme.glassBorder }]}><Text style={{ color: expanded ? theme.onPrimary : theme.primary, fontSize: 17, fontWeight: '900' }}>{expanded ? '^' : '+'}</Text></HapticPressable>
    </View>
    {expanded ? <View style={[styles.panel, { borderTopColor: theme.glassBorder }]}>
      <Text style={[styles.title, { color: theme.text }]}>Entrenamiento conjunto</Text>
      {participants.length ? participants.map((participant) => {
        const state = participantState(participant, now);
        const progress = participant.liveProgress;
        return <View key={participant.id} style={[styles.member, { borderColor: theme.glassBorder }]}><ProfileAvatar avatarId={participant.avatarId} frameId={participant.frameId} size={38} borderColor={state.color} /><View style={styles.memberCopy}><View style={styles.memberHeader}><Text numberOfLines={1} style={[styles.alias, { color: theme.text }]}>{participant.alias}</Text><Text style={[styles.state, { color: state.color }]}>{state.label}</Text></View><Text style={[styles.metrics, { color: theme.textMuted }]}>{progress ? `Ejercicios ${progress.completedExercises}/${progress.totalExercises} · Series ${progress.completedSets}/${progress.totalSets}` : 'Sin actividad registrada todavía'}</Text></View></View>;
      }) : <Text style={{ color: theme.textMuted }}>Invitá a alguien que esté entrenando ahora.</Text>}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { alignItems: 'flex-end', gap: 8 }, compactRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end' }, avatarWrap: { borderRadius: 999, borderWidth: 2, height: 34, marginLeft: -6, position: 'relative', width: 34 }, statusDot: { borderColor: '#0F172A', borderRadius: 999, borderWidth: 2, bottom: -2, height: 10, position: 'absolute', right: -2, width: 10 }, solo: { fontSize: 12, fontWeight: '800', marginRight: 4 }, overflow: { fontSize: 12, fontWeight: '900', marginLeft: 5 }, toggle: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 32, justifyContent: 'center', marginLeft: 8, width: 32 }, panel: { alignSelf: 'stretch', borderTopWidth: StyleSheet.hairlineWidth, gap: 8, paddingTop: 10, width: '100%' }, title: { fontSize: 14, fontWeight: '900' }, member: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 9, paddingTop: 8 }, memberCopy: { flex: 1, gap: 2 }, memberHeader: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' }, alias: { flex: 1, fontSize: 13, fontWeight: '800' }, state: { fontSize: 11, fontWeight: '900' }, metrics: { fontSize: 12, fontWeight: '700' },
});
