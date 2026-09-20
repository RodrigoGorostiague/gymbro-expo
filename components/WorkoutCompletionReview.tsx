import { WorkoutMuscleRankProgress } from './WorkoutMuscleRankProgress';
import { SessionBodyMap } from './TrainingBodyMap';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useSocial } from '../context/SocialContext';
import { useTheme } from '../context/ThemeContext';
import type { ExperienceReceipt, RewardReceipt, WorkoutSession } from '../types';
import { getWorkoutCompletionPreview, confirmWorkoutCompletion, stageWorkoutCompletion, CompletionPreview } from '../services/workoutCompletionPreview';
import { loadWorkoutReviewSelection, saveWorkoutReviewSelection } from '../services/workoutReviewSelection';
import { recapInputFromSession, recapSharePayload } from '../services/workoutRecapFeed';
import { withTimeout } from '../utils/withTimeout';
import { personalRecordPresentation } from '../utils/personalRecordPresentation';
import { WorkoutVictory } from './WorkoutVictory';
import { WorkoutPublicationCard } from './WorkoutPublicationCard';
import { CommunityMilestoneCard } from './CommunityMilestoneCard';
import { HapticPressable } from './HapticPressable';
import { GlassButton } from './UI';
import { GymBroLoadingOverlay } from './AppThemeLoadingOverlay';

type Props = { session: WorkoutSession; experience?: ExperienceReceipt | null; rewards?: RewardReceipt | null; celebrate?: boolean; onDetails?: () => void; onDone: () => void; children?: React.ReactNode };
export function WorkoutCompletionReview({ session, experience, rewards, celebrate = false, onDetails, onDone, children }: Props) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { ownProfile } = useSocial();
  const { routines = [], mesocycles = [] } = useData();
  const [preview, setPreview] = useState<CompletionPreview | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const selectionRef = useRef<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const submittedRef = useRef(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [ready, setReady] = useState(false);
  const mounted = useRef(true);
  const account = useRef(user); account.current = user;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setReady(false); setError(null);
    if (!user || !ownProfile) return;
    const load = async () => {
      try {
        let value = await withTimeout(getWorkoutCompletionPreview(session.id), 12000, 'Preparar cierre');
        if (!active) return;
        if (value.reviewRequired && !value.joint && value.sharingEnabled) {
          const input = recapInputFromSession(session);
          input.sharePayload = recapSharePayload(session, routines.find((routine) => routine.id === session.routineId), session.lineage ? mesocycles.find((mesocycle) => mesocycle.id === session.lineage?.mesocycleId) : undefined, routines, ownProfile);
          if (!session.recapPublicationKey) throw new Error('No se pudo recuperar la publicación de esta sesión.');
          await withTimeout(stageWorkoutCompletion(session.id, input, session.recapPublicationKey), 12000, 'Preparar publicación');
          if (!active) return;
          value = await withTimeout(getWorkoutCompletionPreview(session.id), 12000, 'Preparar vista previa');
        }
        const stored = value.reviewRequired ? await loadWorkoutReviewSelection(user, session.id) : null;
        if (!active) return;
        const validIds = new Set(value.records.map(({ activity }) => activity.id));
        if (stored?.submitted && stored.ids.some((id) => !validIds.has(id))) throw new Error('No se pudo verificar la selección enviada. Reintentá la consulta antes de publicar.');
        const ids = stored ? stored.ids.filter((id) => validIds.has(id)) : value.records.filter((record) => record.selected).map(({ activity }) => activity.id);
        selectionRef.current = ids; setSelection(ids);
        submittedRef.current = !!stored?.submitted; setSubmitted(!!stored?.submitted);
        setExpanded((current) => current ?? value.records[0]?.activity.id ?? null);
        setPreview(value); setReady(value.confirmed); setError(null);
        if (!value.confirmed) timer = setTimeout(() => void load(), 5000);
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : 'No se pudo preparar el cierre.');
      }
    };
    void load();
    return () => { active = false; clearTimeout(timer); };
    // The route is keyed by session ID. Rebuild a draft if profile preferences change.
  }, [session.id, user, ownProfile, retry]);

  const changeSelection = (ids: string[]) => {
    if (!user || submittedRef.current || busyRef.current) return;
    selectionRef.current = ids; setSelection(ids); setError(null);
    void saveWorkoutReviewSelection(user, session.id, { ids, submitted: false }).catch(() => {
      if (mounted.current && account.current === user) setError('No se pudo guardar la selección en este dispositivo. Al confirmar volveremos a intentarlo.');
    });
  };
  const confirm = async () => {
    if (!user || !preview || !ready || busyRef.current) return;
    if (!preview.reviewRequired) { onDone(); return; }
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const ids = preview.sharingEnabled ? selectionRef.current : [];
      // Persist the exact command before dispatch; ambiguous failures retry the same selection.
      await saveWorkoutReviewSelection(user, session.id, { ids, submitted: true });
      if (!mounted.current || account.current !== user) return;
      submittedRef.current = true; setSubmitted(true);
      const result = await withTimeout(confirmWorkoutCompletion(session.id, ids), 20000, 'Publicar entrenamiento');
      if (result.reviewRequired) throw new Error('La publicación todavía no fue confirmada.');
      if (mounted.current && account.current === user) { setPreview(result); onDone(); }
    } catch {
      if (mounted.current && account.current === user) setError(submittedRef.current ? 'No pudimos confirmar la publicación. Tu entrenamiento y selección están guardados. Reintentá para completar el cierre.' : 'No se pudo guardar la selección en este dispositivo. Reintentá para completar el cierre.');
    } finally {
      busyRef.current = false;
      if (mounted.current && account.current === user) setBusy(false);
    }
  };
  const choosing = ready && preview?.reviewRequired && preview.sharingEnabled;
  const allSelected = !!preview?.records.length && selection.length === preview.records.length;
  return <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      <WorkoutVictory session={session} experience={experience} rewards={rewards} celebrate={celebrate} onDetails={onDetails} />
      <WorkoutMuscleRankProgress attemptId={session.id} subjectId={user} confirmed={ready} />
      <SessionBodyMap session={session} owner={user} compact />
      {!ready ? <Text style={{ color: theme.textMuted }}>Preparando tus logros…</Text> : null}
      {preview?.reviewRequired && preview.records.length > 0 ? <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>Lograste {preview.records.length} {preview.records.length === 1 ? 'récord' : 'récords'}</Text>
        {choosing ? <>
          <Text style={{ color: theme.textMuted }}>Elegí qué récords acompañan tu entrenamiento.</Text>
          <View style={styles.row}><Text style={{ color: theme.textMuted }}>{selection.length} seleccionados</Text><HapticPressable accessibilityRole="button" accessibilityLabel={allSelected ? 'Deseleccionar todos los récords' : 'Seleccionar todos los récords'} disabled={submitted || busy} onPress={() => changeSelection(allSelected ? [] : preview.records.map(({ activity }) => activity.id))} style={styles.target}><Text style={{ color: theme.primary, fontWeight: '700' }}>{allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}</Text></HapticPressable></View>
        </> : null}
        {preview.records.map(({ activity }) => {
          const record = personalRecordPresentation(activity);
          const selected = selection.includes(activity.id);
          return <View key={activity.id} style={[styles.record, { borderColor: selected ? theme.primary : theme.glassBorder, backgroundColor: theme.glass }]}>
            <View style={styles.row}>
              <View style={styles.flex}><Text style={[styles.recordLabel, { color: theme.primary }]}>{record.label}</Text><Text style={[styles.recordName, { color: theme.text }]}>{record.exercise}</Text><Text style={{ color: theme.textMuted }}>{record.previous ? `${record.previous} → ` : ''}{record.value}</Text></View>
              {choosing ? <HapticPressable accessibilityRole="checkbox" accessibilityLabel={`Publicar ${record.label.toLocaleLowerCase()}: ${record.exercise}`} accessibilityState={{ checked: selected, disabled: submitted || busy }} disabled={submitted || busy} onPress={() => changeSelection(selected ? selectionRef.current.filter((id) => id !== activity.id) : [...selectionRef.current, activity.id])} style={styles.target}><Ionicons name={selected ? 'checkbox' : 'square-outline'} size={30} color={selected ? theme.primary : theme.textMuted} /></HapticPressable> : null}
            </View>
            <HapticPressable accessibilityRole="button" accessibilityLabel={`Vista previa de ${record.exercise}, ${record.label}`} accessibilityState={{ expanded: expanded === activity.id }} onPress={() => setExpanded(expanded === activity.id ? null : activity.id)} style={styles.target}><Text style={{ color: theme.textMuted }}>{expanded === activity.id ? 'Ocultar vista previa' : 'Ver vista previa'}</Text></HapticPressable>
            {expanded === activity.id ? <CommunityMilestoneCard activity={activity} now={Date.now()} preview /> : null}
          </View>;
        })}
      </View> : null}
      {preview?.recap ? <View style={styles.section}><Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>Tu entrenamiento</Text><WorkoutPublicationCard recap={preview.recap} preview /></View> : null}
      {children}
      {error ? <View style={styles.section}><Text accessibilityRole="alert" style={{ color: theme.textMuted }}>{error}</Text>{!ready ? <GlassButton title="Reintentar preparación" variant="secondary" onPress={() => setRetry((value) => value + 1)} /> : null}</View> : null}
    </ScrollView>
    <View style={[styles.footer, { backgroundColor: theme.background[0], borderTopColor: theme.glassBorder }]}>
      {choosing && !submitted ? <Text style={[styles.caption, { color: theme.textMuted }]}>{selection.length === 0 ? 'El entrenamiento está listo. Ningún récord seleccionado.' : `${selection.length} ${selection.length === 1 ? 'récord seleccionado' : 'récords seleccionados'}`}</Text> : null}
      <GlassButton title={!ready ? 'Preparando…' : !preview?.reviewRequired ? 'Listo' : submitted ? 'Reintentar publicación' : preview.sharingEnabled ? 'Confirmar y publicar' : 'Finalizar'} disabled={!ready || busy} onPress={() => void confirm()} />
    </View>
    <Modal visible={busy} animationType="fade" onRequestClose={() => undefined}><GymBroLoadingOverlay visible={busy} label={preview?.sharingEnabled ? 'Publicando entrenamiento' : 'Finalizando entrenamiento'} message={preview?.sharingEnabled ? 'Preparando todo para tu publicación…' : 'Guardando el cierre…'} /></Modal>
  </View>;
}
const styles = StyleSheet.create({ screen: { flex: 1 }, content: { paddingTop: 24, paddingBottom: 24, gap: 20 }, section: { gap: 12 }, heading: { fontSize: 22, fontWeight: '900' }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, flex: { flex: 1, gap: 5 }, target: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center' }, record: { borderWidth: 1, borderRadius: 22, padding: 14, gap: 8 }, recordLabel: { fontSize: 12, fontWeight: '900' }, recordName: { fontSize: 17, fontWeight: '800' }, footer: { paddingVertical: 12, borderTopWidth: 1, gap: 8 }, caption: { textAlign: 'center', fontSize: 12 } });
