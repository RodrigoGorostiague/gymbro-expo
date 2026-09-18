import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { listPendingWorkoutReviews } from '../services/workoutCompletionPreview';
import { GlassCard } from './GlassCard';
import { GlassButton } from './UI';
export function PendingWorkoutReviews() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [result, setResult] = useState<{ owner: string; items: Awaited<ReturnType<typeof listPendingWorkoutReviews>> } | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (!user) return;
    setError(false);
    void listPendingWorkoutReviews().then((items) => { if (active) setResult({ owner: user, items }); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [user, retry]));
  const items = result?.owner === user ? result.items : [];
  if (!items.length && !error) return null;
  return <GlassCard><View style={{ gap: 12 }}>
    {items.length ? <><Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>Tenés {items.length} {items.length === 1 ? 'cierre pendiente' : 'cierres pendientes'}</Text>
      {items.map((item) => <GlassButton key={item.attemptId} title={`Revisar ${item.routineName}`} variant="secondary" onPress={() => router.push({ pathname: '/session/completion/[id]', params: { id: item.attemptId } })} />)}</> : null}
    {error ? <GlassButton title="Reintentar consulta de cierres pendientes" variant="secondary" onPress={() => setRetry((value) => value + 1)} /> : null}
  </View></GlassCard>;
}
