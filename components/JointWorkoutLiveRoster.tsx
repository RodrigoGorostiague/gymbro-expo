import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ActiveWorkoutInviteCandidate, JointParticipant } from '../services/jointWorkouts';
import { useTheme } from '../context/ThemeContext';
import { HapticPressable } from './HapticPressable';
import { ProfileAvatar } from './ProfileAvatar';
import { listJointWorkoutChatMessages, sendJointWorkoutChatMessage, subscribeToJointWorkoutChatChanges, type JointWorkoutChatMessage } from '../services/jointWorkoutChat';

function formatRest(endsAt?: string, now = Date.now()): string | null {
  if (!endsAt) return null;
  const seconds = Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function participantState(participant: JointParticipant, now: number) {
  if (participant.status === 'completed') return { label: 'Completó', color: '#94A3B8' };
  if (participant.status !== 'active') return { label: participant.status === 'invited' ? 'Invitado' : 'No disponible', color: '#94A3B8' };
  const progress = participant.liveProgress;
  if (progress?.state === 'paused') return { label: 'Pausado', color: '#94A3B8' };
  if (progress?.state === 'resting') return { label: `Descanso${formatRest(progress.restEndsAt, now) ? ` ${formatRest(progress.restEndsAt, now)}` : ''}`, color: '#F59E0B' };
  return { label: 'Entrenando', color: '#22C55E' };
}

export function JointWorkoutLiveRoster({ workoutId, participants, availableCandidates = [], expanded, onToggle }: { workoutId?: string; participants: readonly JointParticipant[]; availableCandidates?: readonly ActiveWorkoutInviteCandidate[]; expanded: boolean; onToggle: () => void }) {
  const { theme } = useTheme();
  const [now, setNow] = useState(Date.now());
  const [messages, setMessages] = useState<JointWorkoutChatMessage[]>([]);
  const [mentionedParticipantIds, setMentionedParticipantIds] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [hasUnreadChatMessage, setHasUnreadChatMessage] = useState(false);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const activeParticipants = participants.filter((participant) => participant.status === 'active');
  const mentionQuery = draft.match(/(?:^|\s)@([^\s]*)$/)?.[1]?.toLocaleLowerCase();
  const mentionCandidates = mentionQuery === undefined
    ? []
    : activeParticipants.filter((participant) => !participant.isSelf && participant.alias.toLocaleLowerCase().includes(mentionQuery));
  useEffect(() => {
    if (!participants.some((participant) => participant.liveProgress?.state === 'resting')) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [participants]);

  useEffect(() => {
    if (expanded) setHasUnreadChatMessage(false);
  }, [expanded]);

  const loadMessages = useCallback(async () => {
    if (!workoutId) return setMessages([]);
    setMessages(await listJointWorkoutChatMessages(workoutId));
  }, [workoutId]);

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => undefined;
    void loadMessages().catch(() => undefined);
    if (!workoutId) return () => { active = false; unsubscribe(); };
    void subscribeToJointWorkoutChatChanges(workoutId, () => {
      if (!expandedRef.current) setHasUnreadChatMessage(true);
      void loadMessages().catch(() => undefined);
    }).then((cleanup) => {
      if (active) unsubscribe = cleanup;
      else cleanup();
    }).catch(() => undefined);
    return () => { active = false; unsubscribe(); };
  }, [loadMessages]);

  const selectMention = (participant: JointParticipant) => {
    setDraft((current) => current.replace(/@[^\s]*$/, `@${participant.alias} `));
    setMentionedParticipantIds((current) => current.includes(participant.id) ? current : [...current, participant.id]);
  };
  const send = async () => {
    if (!workoutId || sending) return;
    setSending(true);
    try {
      await sendJointWorkoutChatMessage(workoutId, draft.trim(), mentionedParticipantIds);
      setDraft(''); setMentionedParticipantIds([]);
      await loadMessages();
    } catch (error) {
      Alert.alert('No se pudo enviar', error instanceof Error ? error.message : 'Inténtalo nuevamente.');
    } finally { setSending(false); }
  };

  return <View style={styles.container}>
    <View style={styles.compactRow}>
      {activeParticipants.length ? activeParticipants.slice(0, 3).map((participant) => {
        const state = participantState(participant, now);
        return <View key={participant.id} accessibilityLabel={`${participant.alias}: ${state.label}`} style={[styles.avatarWrap, { borderColor: state.color }]}><ProfileAvatar avatarId={participant.avatarId} frameId={participant.frameId} size={30} borderColor={state.color} /><View style={[styles.statusDot, { backgroundColor: state.color }]} /></View>;
      }) : <Text style={[styles.solo, { color: theme.textMuted }]}>Solo</Text>}
      {activeParticipants.length > 3 ? <Text style={[styles.overflow, { color: theme.text }]}>+{activeParticipants.length - 3}</Text> : null}
      {availableCandidates.slice(0, Math.max(0, 3 - activeParticipants.length)).map((candidate) => <HapticPressable key={candidate.id} accessibilityRole="button" accessibilityLabel={`${candidate.alias} está entrenando y disponible para invitar`} onPress={onToggle} style={[styles.avatarWrap, styles.availableAvatar]}><ProfileAvatar avatarId={candidate.avatarId} frameId={candidate.frameId} size={30} borderColor="#38BDF8" /><View style={[styles.statusDot, styles.availableDot]} /></HapticPressable>)}
      {availableCandidates.length > Math.max(0, 3 - activeParticipants.length) ? <Text style={[styles.overflow, { color: theme.text }]}>+{availableCandidates.length - Math.max(0, 3 - activeParticipants.length)}</Text> : null}
      <View style={styles.toggleWrap}><HapticPressable accessibilityRole="button" accessibilityLabel={expanded ? 'Ocultar entrenamiento conjunto' : hasUnreadChatMessage ? 'Mostrar entrenamiento conjunto, mensaje sin leer' : 'Mostrar entrenamiento conjunto'} accessibilityState={{ expanded }} onPress={onToggle} style={[styles.toggle, { backgroundColor: expanded ? theme.primary : theme.glass, borderColor: expanded ? theme.primary : theme.glassBorder }]}><Ionicons name="people-outline" size={18} color={expanded ? theme.onPrimary : theme.primary} /></HapticPressable>{hasUnreadChatMessage && !expanded ? <View testID="joint-workout-chat-unread" style={[styles.unreadDot, { backgroundColor: theme.accent }]} /> : null}</View>
    </View>
    {expanded ? <View style={[styles.panel, { borderTopColor: theme.glassBorder }]}>
      <Text style={[styles.title, { color: theme.text }]}>Entrenamiento conjunto</Text>
      {participants.length ? participants.map((participant) => {
        const state = participantState(participant, now);
        const progress = participant.liveProgress;
        return <View key={participant.id} style={[styles.member, { borderColor: theme.glassBorder }]}><ProfileAvatar avatarId={participant.avatarId} frameId={participant.frameId} size={38} borderColor={state.color} /><View style={styles.memberCopy}><View style={styles.memberHeader}><Text numberOfLines={1} style={[styles.alias, { color: theme.text }]}>{participant.alias}</Text><Text style={[styles.state, { color: state.color }]}>{state.label}</Text></View><Text style={[styles.metrics, { color: theme.textMuted }]}>{progress ? `Ejercicios ${progress.completedExercises}/${progress.totalExercises} · Series ${progress.completedSets}/${progress.totalSets}` : 'Sin actividad registrada todavía'}</Text></View></View>;
      }) : <Text style={{ color: theme.textMuted }}>Invitá a alguien que esté entrenando ahora.</Text>}
      {workoutId ? <View style={[styles.chat, { borderColor: theme.glassBorder }]}>
        <Text style={[styles.chatTitle, { color: theme.text }]}>Chat del entrenamiento</Text>
        {messages.map((message) => <View key={message.id} style={[styles.messageBubble, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}><Text style={[styles.messageSender, { color: theme.primary }]}>{message.senderAlias}</Text><Text style={[styles.messageText, { color: theme.text }]}>{message.body}</Text></View>)}
        <TextInput editable={!sending} maxLength={500} multiline onChangeText={setDraft} placeholder="Mensaje para todos. Escribí @ para hacerlo privado" placeholderTextColor={theme.textMuted} value={draft} style={[styles.input, { borderColor: theme.glassBorder, color: theme.text }]} />
        {mentionCandidates.length ? <View style={styles.mentions}>{mentionCandidates.map((participant) => <HapticPressable key={participant.id} accessibilityRole="button" accessibilityLabel={`Agregar mención para ${participant.alias}`} disabled={sending} onPress={() => selectMention(participant)} style={[styles.mention, { borderColor: theme.glassBorder, backgroundColor: theme.glass }]}><Text style={{ color: theme.text }}>@+{participant.alias}</Text></HapticPressable>)}</View> : null}
        <HapticPressable accessibilityRole="button" accessibilityLabel="Enviar mensaje del entrenamiento" disabled={sending || !draft.trim()} onPress={() => void send()} style={[styles.send, { backgroundColor: theme.primary }]}><Text style={[styles.sendText, { color: theme.onPrimary }]}>Enviar</Text></HapticPressable>
      </View> : null}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { alignItems: 'flex-end', gap: 8 }, compactRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end' }, avatarWrap: { borderRadius: 999, borderWidth: 2, height: 34, marginLeft: -6, position: 'relative', width: 34 }, availableAvatar: { borderColor: '#38BDF8', borderStyle: 'dashed' }, statusDot: { borderColor: '#0F172A', borderRadius: 999, borderWidth: 2, bottom: -2, height: 10, position: 'absolute', right: -2, width: 10 }, availableDot: { backgroundColor: '#38BDF8' }, solo: { fontSize: 12, fontWeight: '800', marginRight: 4 }, overflow: { fontSize: 12, fontWeight: '900', marginLeft: 5 }, toggleWrap: { marginLeft: 8, position: 'relative' }, toggle: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 }, unreadDot: { borderColor: '#0F172A', borderRadius: 999, borderWidth: 2, height: 10, position: 'absolute', right: -2, top: -2, width: 10 }, panel: { alignSelf: 'stretch', borderTopWidth: StyleSheet.hairlineWidth, gap: 8, paddingTop: 10, width: '100%' }, title: { fontSize: 14, fontWeight: '900' }, member: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 9, paddingTop: 8 }, memberCopy: { flex: 1, gap: 2 }, memberHeader: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' }, alias: { flex: 1, fontSize: 13, fontWeight: '800' }, state: { fontSize: 11, fontWeight: '900' }, metrics: { fontSize: 12, fontWeight: '700' }, chat: { alignSelf: 'stretch', borderTopWidth: StyleSheet.hairlineWidth, gap: 8, marginTop: 4, paddingTop: 10 }, chatTitle: { fontSize: 14, fontWeight: '900' }, mentions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, mention: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5 }, messageBubble: { alignSelf: 'flex-start', borderRadius: 12, borderWidth: 1, marginTop: 2, paddingHorizontal: 9, paddingVertical: 6 }, messageSender: { fontSize: 11, fontWeight: '900' }, messageText: { fontSize: 12, fontWeight: '700' }, input: { borderRadius: 12, borderWidth: 1, minHeight: 72, padding: 10, textAlignVertical: 'top' }, send: { alignItems: 'center', borderRadius: 12, paddingVertical: 12 }, sendText: { fontWeight: '900' },
});
