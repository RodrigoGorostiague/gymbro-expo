import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ActiveWorkoutInviteCandidate, JointParticipant } from '../services/jointWorkouts';
import { useTheme } from '../context/ThemeContext';
import { HapticPressable } from './HapticPressable';
import { ProfileAvatar } from './ProfileAvatar';
import { socialMessagePresetsFor, type JointSocialMessageKind } from '../constants/jointSocialMessages';
import { sendJointSocialMessage } from '../services/jointSocialMessages';
import { listNotificationInbox, subscribeToNotificationInboxChanges } from '../services/notificationInbox';

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

type ReceivedMessage = { actorId: string; body: string; createdAt: string };

function messageFromNotification(value: Awaited<ReturnType<typeof listNotificationInbox>>[number], workoutId: string): ReceivedMessage | null {
  if (value.kind !== 'joint_social_message' || value.data.workout_id !== workoutId || typeof value.data.actor_id !== 'string' || !value.body) return null;
  if (Date.now() - Date.parse(value.createdAt) > 15 * 60_000) return null;
  return { actorId: value.data.actor_id, body: value.body, createdAt: value.createdAt };
}

function TypingBubble({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const animation = Animated.timing(pulse, { toValue: 1, duration: 260, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [pulse]);
  return <Animated.View style={[styles.typingBubble, { backgroundColor: color, opacity: pulse }]}><Text style={styles.typingText}>...</Text></Animated.View>;
}

export function JointWorkoutLiveRoster({ workoutId, participants, availableCandidates = [], expanded, onToggle }: { workoutId?: string; participants: readonly JointParticipant[]; availableCandidates?: readonly ActiveWorkoutInviteCandidate[]; expanded: boolean; onToggle: () => void }) {
  const { theme } = useTheme();
  const [now, setNow] = useState(Date.now());
  const [messages, setMessages] = useState<ReceivedMessage[]>([]);
  const [recipient, setRecipient] = useState<JointParticipant | null>(null);
  const [customMessage, setCustomMessage] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const activeParticipants = participants.filter((participant) => participant.status === 'active');
  useEffect(() => {
    if (!participants.some((participant) => participant.liveProgress?.state === 'resting')) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [participants]);

  const loadMessages = useCallback(async () => {
    if (!workoutId) return setMessages([]);
    const inbox = await listNotificationInbox(50);
    const latestByActor = new Map<string, ReceivedMessage>();
    inbox.map((item) => messageFromNotification(item, workoutId)).filter((item): item is ReceivedMessage => item !== null).forEach((item) => {
      const current = latestByActor.get(item.actorId);
      if (!current || current.createdAt < item.createdAt) latestByActor.set(item.actorId, item);
    });
    setMessages([...latestByActor.values()]);
  }, [workoutId]);

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => undefined;
    void loadMessages().catch(() => undefined);
    void subscribeToNotificationInboxChanges(() => { void loadMessages().catch(() => undefined); }).then((cleanup) => {
      if (active) unsubscribe = cleanup;
      else cleanup();
    }).catch(() => undefined);
    return () => { active = false; unsubscribe(); };
  }, [loadMessages]);

  const openMenu = (participant: JointParticipant) => {
    if (!workoutId || participant.isSelf || !participant.relationshipKind) return;
    setRecipient(participant); setCustomMessage(false); setDraft('');
  };
  const closeMenu = () => { if (!sending) setRecipient(null); };
  const send = async (message: string, kind: JointSocialMessageKind) => {
    if (!workoutId || !recipient || sending) return;
    setSending(true);
    try {
      await sendJointSocialMessage(workoutId, recipient.id, message, kind);
      setRecipient(null);
    } catch (error) {
      Alert.alert('No se pudo enviar', error instanceof Error ? error.message : 'Inténtalo nuevamente.');
    } finally { setSending(false); }
  };

  return <View style={styles.container}>
    <View style={styles.compactRow}>
      {activeParticipants.length ? activeParticipants.slice(0, 3).map((participant) => {
        const state = participantState(participant, now);
        const hasMessage = messages.some((message) => message.actorId === participant.id);
        return <HapticPressable key={participant.id} accessibilityRole="button" accessibilityLabel={`${participant.alias}: ${state.label}`} disabled={participant.isSelf || !participant.relationshipKind} onPress={() => openMenu(participant)} style={[styles.avatarWrap, { borderColor: state.color }]}><ProfileAvatar avatarId={participant.avatarId} frameId={participant.frameId} size={30} borderColor={state.color} /><View style={[styles.statusDot, { backgroundColor: state.color }]} />{hasMessage ? <TypingBubble color={theme.primary} /> : null}</HapticPressable>;
      }) : <Text style={[styles.solo, { color: theme.textMuted }]}>Solo</Text>}
      {activeParticipants.length > 3 ? <Text style={[styles.overflow, { color: theme.text }]}>+{activeParticipants.length - 3}</Text> : null}
      {availableCandidates.slice(0, Math.max(0, 3 - activeParticipants.length)).map((candidate) => <HapticPressable key={candidate.id} accessibilityRole="button" accessibilityLabel={`${candidate.alias} está entrenando y disponible para invitar`} onPress={onToggle} style={[styles.avatarWrap, styles.availableAvatar]}><ProfileAvatar avatarId={candidate.avatarId} frameId={candidate.frameId} size={30} borderColor="#38BDF8" /><View style={[styles.statusDot, styles.availableDot]} /></HapticPressable>)}
      {availableCandidates.length > Math.max(0, 3 - activeParticipants.length) ? <Text style={[styles.overflow, { color: theme.text }]}>+{availableCandidates.length - Math.max(0, 3 - activeParticipants.length)}</Text> : null}
      <HapticPressable accessibilityRole="button" accessibilityLabel={expanded ? 'Ocultar entrenamiento conjunto' : 'Mostrar entrenamiento conjunto'} accessibilityState={{ expanded }} onPress={onToggle} style={[styles.toggle, { backgroundColor: expanded ? theme.primary : theme.glass, borderColor: expanded ? theme.primary : theme.glassBorder }]}><Ionicons name="people-outline" size={18} color={expanded ? theme.onPrimary : theme.primary} /></HapticPressable>
    </View>
    {expanded ? <View style={[styles.panel, { borderTopColor: theme.glassBorder }]}>
      <Text style={[styles.title, { color: theme.text }]}>Entrenamiento conjunto</Text>
      {participants.length ? participants.map((participant) => {
        const state = participantState(participant, now);
        const progress = participant.liveProgress;
        const message = messages.find((item) => item.actorId === participant.id);
        return <HapticPressable key={participant.id} accessibilityRole="button" accessibilityLabel={`Enviar mensaje a ${participant.alias}`} disabled={participant.isSelf || !participant.relationshipKind} onPress={() => openMenu(participant)} style={[styles.member, { borderColor: theme.glassBorder }]}><ProfileAvatar avatarId={participant.avatarId} frameId={participant.frameId} size={38} borderColor={state.color} /><View style={styles.memberCopy}><View style={styles.memberHeader}><Text numberOfLines={1} style={[styles.alias, { color: theme.text }]}>{participant.alias}</Text><Text style={[styles.state, { color: state.color }]}>{state.label}</Text></View><Text style={[styles.metrics, { color: theme.textMuted }]}>{progress ? `Ejercicios ${progress.completedExercises}/${progress.totalExercises} · Series ${progress.completedSets}/${progress.totalSets}` : 'Sin actividad registrada todavía'}</Text>{message ? <View style={[styles.messageBubble, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}><Text style={[styles.messageText, { color: theme.text }]}>{message.body}</Text></View> : null}</View></HapticPressable>;
      }) : <Text style={{ color: theme.textMuted }}>Invitá a alguien que esté entrenando ahora.</Text>}
    </View> : null}
    {recipient ? <Modal transparent animationType="fade" visible onRequestClose={closeMenu}>
      <View style={styles.modalBackdrop}><View style={[styles.menu, { backgroundColor: theme.tabBarBackground, borderColor: theme.glassBorder }]}>
        <Text style={[styles.menuTitle, { color: theme.text }]}>Mensaje para {recipient?.alias}</Text>
        {!customMessage && recipient?.relationshipKind ? <View style={styles.actions}>{socialMessagePresetsFor(recipient.relationshipKind).map((preset) => <HapticPressable key={preset.message} accessibilityRole="button" accessibilityLabel={preset.message} disabled={sending} onPress={() => void send(preset.message, 'preset')} style={[styles.action, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}><Text style={[styles.actionText, { color: theme.text }]}>{preset.label}</Text></HapticPressable>)}</View> : null}
        {customMessage ? <><TextInput autoFocus editable={!sending} maxLength={120} multiline onChangeText={setDraft} placeholder="Escribe un mensaje breve" placeholderTextColor={theme.textMuted} value={draft} style={[styles.input, { borderColor: theme.glassBorder, color: theme.text }]} /><HapticPressable accessibilityRole="button" accessibilityLabel="Enviar mensaje personalizado" disabled={sending || !draft.trim()} onPress={() => void send(draft, 'custom')} style={[styles.send, { backgroundColor: theme.primary }]}><Text style={[styles.sendText, { color: theme.onPrimary }]}>Enviar</Text></HapticPressable></> : <HapticPressable accessibilityRole="button" accessibilityLabel="Escribir mensaje personalizado" disabled={sending} onPress={() => setCustomMessage(true)} style={styles.customAction}><Text style={[styles.customText, { color: theme.primary }]}>Escribir mensaje</Text></HapticPressable>}
        <HapticPressable accessibilityRole="button" accessibilityLabel="Cerrar mensajes" disabled={sending} onPress={closeMenu} style={styles.cancel}><Text style={{ color: theme.textMuted }}>Cancelar</Text></HapticPressable>
      </View></View>
    </Modal> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { alignItems: 'flex-end', gap: 8 }, compactRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end' }, avatarWrap: { borderRadius: 999, borderWidth: 2, height: 34, marginLeft: -6, position: 'relative', width: 34 }, availableAvatar: { borderColor: '#38BDF8', borderStyle: 'dashed' }, statusDot: { borderColor: '#0F172A', borderRadius: 999, borderWidth: 2, bottom: -2, height: 10, position: 'absolute', right: -2, width: 10 }, availableDot: { backgroundColor: '#38BDF8' }, typingBubble: { alignItems: 'center', borderRadius: 10, justifyContent: 'center', minWidth: 24, paddingHorizontal: 4, paddingBottom: 4, position: 'absolute', right: -12, top: -13 }, typingText: { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 1 }, solo: { fontSize: 12, fontWeight: '800', marginRight: 4 }, overflow: { fontSize: 12, fontWeight: '900', marginLeft: 5 }, toggle: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 32, justifyContent: 'center', marginLeft: 8, width: 32 }, panel: { alignSelf: 'stretch', borderTopWidth: StyleSheet.hairlineWidth, gap: 8, paddingTop: 10, width: '100%' }, title: { fontSize: 14, fontWeight: '900' }, member: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 9, paddingTop: 8 }, memberCopy: { flex: 1, gap: 2 }, memberHeader: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' }, alias: { flex: 1, fontSize: 13, fontWeight: '800' }, state: { fontSize: 11, fontWeight: '900' }, metrics: { fontSize: 12, fontWeight: '700' }, messageBubble: { alignSelf: 'flex-start', borderRadius: 12, borderWidth: 1, marginTop: 5, paddingHorizontal: 9, paddingVertical: 6 }, messageText: { fontSize: 12, fontWeight: '700' }, modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', flex: 1, justifyContent: 'center', padding: 20 }, menu: { borderRadius: 20, borderWidth: 1, gap: 10, maxWidth: 360, padding: 18, width: '100%' }, menuTitle: { fontSize: 17, fontWeight: '900' }, actions: { gap: 8 }, action: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 }, actionText: { fontWeight: '800' }, customAction: { alignItems: 'center', paddingVertical: 8 }, customText: { fontWeight: '900' }, input: { borderRadius: 12, borderWidth: 1, minHeight: 72, padding: 10, textAlignVertical: 'top' }, send: { alignItems: 'center', borderRadius: 12, paddingVertical: 12 }, sendText: { fontWeight: '900' }, cancel: { alignItems: 'center', paddingVertical: 6 },
});
