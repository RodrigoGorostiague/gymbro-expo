import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useTheme } from '../context/ThemeContext';
import { useAnimationActivity } from '../hooks/useAnimationActivity';
import { CompletionPreview, getWorkoutCompletionPreview } from '../services/workoutCompletionPreview';
import { WorkoutPublicationCard } from './WorkoutPublicationCard';
import { CommunityMilestoneCard } from './CommunityMilestoneCard';
import { HapticPressable } from './HapticPressable';

export function WorkoutCompletionFeedPreview({ attemptId }: { attemptId: string }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { realtimeRevision } = useSocial();
  const [result, setResult] = useState<{ key: string; value: CompletionPreview } | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const motion = useAnimationActivity();
  const key = `${user}:${attemptId}`;
  const preview = result?.key === key ? result.value : null;
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setError(false);
    if (!user) return;
    const load = async () => {
      try {
        const value = await getWorkoutCompletionPreview(attemptId);
        if (!active) return;
        setResult({ key, value }); setError(false);
        if (value.status === 'pending') timer = setTimeout(() => void load(), 5000);
      } catch { if (active) setError(true); }
    };
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [attemptId, user, key, retry, realtimeRevision]);
  useEffect(() => { setPage(0); scroll.current?.scrollTo({ x: 0, animated: false }); }, [key]);
  const cards = preview?.reviewRequired ? [] : [
    ...(preview?.recap ? [{ id: preview.recap.id, label: 'Tu entrenamiento', node: <WorkoutPublicationCard recap={preview.recap} preview /> }] : []),
    ...(preview?.activities.map((activity) => ({ id: activity.id, label: 'Tu récord', node: <CommunityMilestoneCard activity={activity} now={Date.now()} preview /> })) ?? []),
  ];
  const cardWidth = Math.max(1, width - (cards.length > 1 ? 20 : 0));
  const stride = cardWidth + 12;
  const status = !preview ? 'Consultando publicaciones…' : preview.reviewRequired ? 'Pendiente de revisión' : preview.status === 'pending' ? 'Publicación pendiente de sincronización'
    : preview.status === 'private' ? 'Entrenamiento privado · Solo vos'
    : preview.status === 'joint' ? 'La ejecución se comparte en la publicación del grupo'
    : preview.status === 'removed' ? 'La publicación de este entrenamiento fue eliminada' : 'Publicado en el feed';
  return <View style={styles.section} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
    <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>Tu entrenamiento en el feed</Text>
    <Text style={[styles.status, { color: theme.textMuted }]}>{error ? 'No se pudieron consultar las publicaciones.' : status}</Text>
    {error ? <HapticPressable accessibilityRole="button" accessibilityLabel="Actualizar publicaciones" onPress={() => setRetry((value) => value + 1)} style={styles.retry}><Text style={{ color: theme.primary }}>Actualizar publicaciones</Text></HapticPressable> : null}
    {cards.length && width > 0 ? <>
      <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} snapToInterval={stride} decelerationRate="fast" disableIntervalMomentum contentContainerStyle={{ gap: 12, paddingRight: cards.length > 1 ? 20 : 0 }} onMomentumScrollEnd={(event) => setPage(Math.max(0, Math.min(cards.length - 1, Math.round(event.nativeEvent.contentOffset.x / stride))))}>
        {cards.map((card, index) => <View key={card.id} style={{ width: cardWidth, gap: 8 }}><Text style={[styles.label, { color: theme.textMuted }]}>{card.label} · Publicado</Text>{card.node}</View>)}
      </ScrollView>
      {cards.length > 1 ? <View style={styles.pagination} accessibilityLabel={`Publicación ${page + 1} de ${cards.length}`}>
        {cards.map((card, index) => <HapticPressable key={card.id} accessibilityRole="button" accessibilityLabel={`Ver ${card.label.toLocaleLowerCase()}, ${index + 1} de ${cards.length}`} accessibilityState={{ selected: page === index }} onPress={() => { setPage(index); scroll.current?.scrollTo({ x: index * stride, animated: motion }); }} style={styles.dotTarget}><View style={[styles.dot, { backgroundColor: index === page ? theme.primary : theme.glassBorder, width: index === page ? 22 : 7 }]} /></HapticPressable>)}
      </View> : null}
    </> : null}
  </View>;
}
const styles = StyleSheet.create({ section: { gap: 10 }, heading: { fontSize: 20, fontWeight: '800' }, status: { fontSize: 13, lineHeight: 19 }, label: { fontSize: 12, fontWeight: '700' }, pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, dotTarget: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, dot: { height: 7, borderRadius: 4 }, retry: { minHeight: 44, justifyContent: 'center' } });
