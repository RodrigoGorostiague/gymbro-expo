import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../../components/GlassCard';
import { GlassButton, GlassInput } from '../../../components/UI';
import { WorkoutRecapAnalysis } from '../../../components/WorkoutRecapAnalysis';
import { ProfileAvatar } from '../../../components/ProfileAvatar';
import { ProfileTitleBadge } from '../../../components/ProfileTitleBadge';
import { useAuth } from '../../../context/AuthContext';
import { useData } from '../../../context/DataContext';
import { useSocial } from '../../../context/SocialContext';
import { useTheme } from '../../../context/ThemeContext';
import { getShopTheme } from '../../../constants/shopThemes';
import { THEMES } from '../../../constants/theme';
import { createJointParticipantComment, getJointParticipantPublicationDetail, setJointParticipantReaction } from '../../../services/jointWorkouts';
import { createWorkoutRecapComment, recapImportPlan, setWorkoutRecapReaction } from '../../../services/workoutRecapFeed';
import { WorkoutRecapDetail } from '../../../types';
import { formatRelativeTime } from '../../../utils/feedTimeline';

export default function WorkoutRecapDetailScreen() {
  const { id, workoutId, participantId } = useLocalSearchParams<{ id: string; workoutId?: string; participantId?: string }>();
  const { user } = useAuth();
  const { getWorkoutRecapDetail } = useSocial();
  const { importCatalogContent } = useData();
  const { theme } = useTheme();
  const [recap, setRecap] = useState<WorkoutRecapDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'routine' | 'mesocycle' | null>(null);
  const [saved, setSaved] = useState<Array<'routine' | 'mesocycle'>>([]);
  const [reactionSaving, setReactionSaving] = useState(false);
  const [comment, setComment] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const isJointParticipant = typeof workoutId === 'string' && workoutId.length > 0 && typeof participantId === 'string' && participantId.length > 0;

  const load = useCallback(async () => {
    setError(null);
    try {
      const detail = isJointParticipant
        ? await getJointParticipantPublicationDetail(workoutId!, participantId!)
        : await getWorkoutRecapDetail(id);
      setRecap(detail);
      if (!detail) setError('No se pudo cargar el entrenamiento.');
    } catch (reason) {
      setRecap(null);
      setError(reason instanceof Error ? reason.message : 'No se pudo cargar el resumen.');
    }
  }, [getWorkoutRecapDetail, id, isJointParticipant, participantId, workoutId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (kind: 'routine' | 'mesocycle') => {
    if (!recap?.sharePayload || !user) return;
    setSaving(kind);
    setError(null);
    try {
      await importCatalogContent(recapImportPlan(recap.id, user, recap.sharePayload, kind === 'mesocycle'));
      setSaved((current) => (current.includes(kind) ? current : [...current, kind]));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar la plantilla.');
    } finally {
      setSaving(null);
    }
  };

  const react = async () => {
    if (!recap || reactionSaving) return;
    setReactionSaving(true);
    setError(null);
    try {
      const state = isJointParticipant
        ? await setJointParticipantReaction(workoutId!, participantId!, !recap.viewerHasReacted)
        : await setWorkoutRecapReaction(recap.id, !recap.viewerHasReacted);
      setRecap((current) => (current ? { ...current, viewerHasReacted: state.reacted, reactionCount: state.reactionCount } : current));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo actualizar la reacción.');
    } finally {
      setReactionSaving(false);
    }
  };

  const submitComment = async () => {
    if (!recap || commentSaving) return;
    setCommentSaving(true);
    setError(null);
    try {
      const created = isJointParticipant
        ? await createJointParticipantComment(workoutId!, participantId!, comment)
        : await createWorkoutRecapComment(recap.id, comment);
      setRecap((current) => (current
        ? { ...current, comments: [...current.comments, created], commentCount: (current.commentCount ?? current.comments.length) + 1 }
        : current));
      setComment('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo publicar el comentario.');
    } finally {
      setCommentSaving(false);
    }
  };

  const openMesocycle = () => {
    if (!recap) return;
    router.push({
      pathname: '/social/recap/[id]/mesocycle',
      params: {
        id: recap.id,
        ...(isJointParticipant ? { workoutId: workoutId!, participantId: participantId! } : {}),
      },
    });
  };

  const authorTheme = getShopTheme(recap?.authorThemeId ?? '') ?? (recap?.authorAlias.toLocaleLowerCase() === 'brisas' ? THEMES.brisas : THEMES.rodaja);

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <AppNavBar onBack={() => router.back()} />
        <ScrollView contentContainerStyle={styles.scroll}>
          {error ? (
            <GlassCard>
              <Text accessibilityRole="alert" style={{ color: theme.text }}>{error}</Text>
              <GlassButton title="Reintentar" variant="secondary" onPress={() => void load()} />
            </GlassCard>
          ) : null}
          {!error && !recap ? <Text style={{ color: theme.textMuted }}>Cargando análisis...</Text> : null}
          {recap ? (
            <>
              <LinearGradient colors={[authorTheme.primary, authorTheme.accent, authorTheme.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
                <ProfileAvatar avatarId={recap.authorAvatarId} frameId={recap.authorFrameId} size={58} borderColor="rgba(255,255,255,0.8)" />
                <View style={styles.heroCopy}>
                  <Text style={styles.author}>{recap.authorAlias}</Text>
                  <ProfileTitleBadge titleId={recap.authorTitleId} />
                  <Text style={styles.heroMeta}>{recap.isAuthor ? 'Tu entrenamiento analizado' : 'Entrenamiento compartido'} · {formatRelativeTime(recap.completedAt, Date.now())}</Text>
                </View>
                <Text style={styles.heroKind}>{recap.mesocycleAvailable ? 'MESOCICLO' : 'RUTINA'}</Text>
              </LinearGradient>

              <GlassCard style={styles.analysis}>
                <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{recap.routineName}</Text>
                <WorkoutRecapAnalysis recap={recap} />
              </GlassCard>

              {!recap.isAuthor && (recap.templateAvailable || recap.mesocycleAvailable) ? (
                <GlassCard style={styles.templates}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>Recursos del entrenamiento</Text>
                  {recap.templateAvailable ? <GlassButton title={saved.includes('routine') ? 'Rutina guardada' : 'Guardar rutina'} loading={saving === 'routine'} disabled={!!saving || saved.includes('routine')} onPress={() => void save('routine')} /> : null}
                  {recap.mesocycleAvailable ? (
                    <>
                      <GlassButton title="Ver mesociclo" variant="secondary" onPress={openMesocycle} />
                      <GlassButton title={saved.includes('mesocycle') ? 'Mesociclo guardado' : 'Guardar mesociclo'} variant="secondary" loading={saving === 'mesocycle'} disabled={!!saving || saved.includes('mesocycle')} onPress={() => void save('mesocycle')} />
                    </>
                  ) : null}
                </GlassCard>
              ) : null}

              <GlassCard style={styles.engagement}>
                <View style={styles.communityHeader}>
                  <View>
                    <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>Comunidad</Text>
                    <Text style={{ color: theme.textMuted }}>Reaccioná o sumá una observación.</Text>
                  </View>
                  <GlassButton
                    title={recap.viewerHasReacted ? `Quitar estrella (${recap.reactionCount})` : `Dar estrella (${recap.reactionCount})`}
                    variant="secondary"
                    onPress={() => void react()}
                    loading={reactionSaving}
                    disabled={reactionSaving || recap.isAuthor}
                  />
                </View>
                <Text style={{ color: theme.textMuted }}>{recap.commentCount ?? recap.comments.length} comentario{(recap.commentCount ?? recap.comments.length) === 1 ? '' : 's'}</Text>
                {recap.comments.map((entry) => (
                  <View key={entry.id} style={[styles.comment, { borderTopColor: theme.glassBorder }]}>
                    <Text style={[styles.commentAuthor, { color: theme.text }]}>{entry.authorAlias}</Text>
                    <Text style={{ color: theme.textMuted }}>{entry.body}</Text>
                  </View>
                ))}
                <GlassInput multiline placeholder="Dejá un comentario" value={comment} onChangeText={setComment} style={styles.commentInput} />
                <GlassButton title="Publicar comentario" onPress={() => void submitComment()} loading={commentSaving} disabled={commentSaving || comment.trim().length === 0} />
              </GlassCard>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemeBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20 },
  scroll: { gap: 12, paddingBottom: 36 },
  hero: { alignItems: 'center', borderRadius: 20, flexDirection: 'row', gap: 12, padding: 16 },
  heroCopy: { flex: 1, gap: 3 },
  author: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  heroMeta: { color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: '700' },
  heroKind: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  analysis: { gap: 16 },
  title: { fontSize: 29, fontWeight: '900' },
  templates: { gap: 10 },
  engagement: { gap: 12 },
  communityHeader: { gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  comment: { borderTopWidth: StyleSheet.hairlineWidth, gap: 3, paddingTop: 10 },
  commentAuthor: { fontWeight: '800' },
  commentInput: { minHeight: 88, textAlignVertical: 'top' },
});
