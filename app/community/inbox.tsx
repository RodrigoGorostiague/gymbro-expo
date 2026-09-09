import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../components/AppNavBar';
import { AppScreenHeader } from '../../components/AppScreenHeader';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { GlassButton } from '../../components/UI';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useSocial } from '../../context/SocialContext';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import { listJointWorkouts } from '../../services/jointWorkouts';
import { listNotificationInbox } from '../../services/notificationInbox';

type Kind = 'connections' | 'plans' | 'joint' | 'notifications';
type PendingItem = { id: string; title: string; detail: string; path: string };
type PendingSection = { items: PendingItem[]; loaded: boolean; error: string | null; more?: boolean };
const destinations: { kind: Kind; title: string; path: string }[] = [
  { kind: 'connections', title: 'Solicitudes de conexión', path: '/community/requests' },
  { kind: 'plans', title: 'Planes compartidos', path: '/community/plan-inbox' },
  { kind: 'joint', title: 'Entrenamientos juntos', path: '/community/joint-workout' },
  { kind: 'notifications', title: 'Notificaciones', path: '/community/notifications' },
];
const emptySections = (): Record<Kind, PendingSection> => ({
  connections: { items: [], loaded: false, error: null },
  plans: { items: [], loaded: false, error: null },
  joint: { items: [], loaded: false, error: null },
  notifications: { items: [], loaded: false, error: null },
});
type InboxRow = { type: 'section'; kind: Kind } | { type: 'item'; kind: Kind; item: PendingItem };

export default function CommunityInboxScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { requests, listReceivedPrivatePlanShareRequests, realtimeRevision } = useSocial();
  const reads = useLatestRequest(user);
  const [state, setState] = useState({ owner: user, sections: emptySections() });
  const [loading, setLoading] = useState(true);
  // Never display the previous account's pending work, even before effects clear it.
  const sections = state.owner === user ? state.sections : emptySections();

  const load = useCallback(async () => {
    const current = reads.begin();
    setLoading(true);
    const sources: Record<Kind, () => Promise<{ items: PendingItem[]; more?: boolean }>> = {
      connections: async () => {
        const page = await requests(null);
        return { items: page.profiles.map((profile) => ({ id: profile.uid, title: profile.alias, detail: 'Quiere formar parte de tu círculo.', path: `/social/${profile.uid}` })), more: !!page.nextCursor };
      },
      plans: async () => ({ items: (await listReceivedPrivatePlanShareRequests()).map((request) => ({
        id: request.id,
        title: request.snapshot.mesocycle?.name ?? request.snapshot.routines[0]?.name ?? 'Plan compartido',
        detail: `${request.senderAlias} · ${request.contentKind === 'mesocycle' ? 'Mesociclo' : 'Rutina'} pendiente de revisar`,
        path: '/community/plan-inbox',
      })) }),
      joint: async () => ({ items: (await listJointWorkouts()).filter((workout) => !workout.completedAt && workout.participants.some((participant) => participant.isSelf && participant.status === 'invited')).map((workout) => ({
        id: workout.id, title: workout.participants.find((participant) => !participant.isSelf)?.alias ?? 'Entrenamiento conjunto',
        detail: 'Invitación pendiente. Revisa antes de unirte con tu rutina activa.', path: '/community/joint-workout',
      })) }),
      notifications: async () => {
        const recent = await listNotificationInbox(50);
        return { items: recent.filter((notification) => !notification.readAt).map((notification) => ({ id: notification.id, title: notification.title, detail: notification.body ?? 'Aviso sin leer', path: '/community/notifications' })), more: recent.length === 50 };
      },
    };
    await Promise.all(destinations.map(async ({ kind }) => {
      try {
        const result = await sources[kind]();
        if (!current()) return;
        setState((previous) => ({ owner: user, sections: { ...(previous.owner === user ? previous.sections : emptySections()), [kind]: { ...result, loaded: true, error: null } } }));
      } catch (reason) {
        if (!current()) return;
        setState((previous) => {
          const existing = previous.owner === user ? previous.sections : emptySections();
          return { owner: user, sections: { ...existing, [kind]: { ...existing[kind], error: reason instanceof Error ? reason.message : 'No se pudo actualizar esta sección.' } } };
        });
      }
    }));
    if (current()) setLoading(false);
  }, [user, reads, requests, listReceivedPrivatePlanShareRequests]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { if (realtimeRevision > 0) void load(); }, [load, realtimeRevision]);
  const rows: InboxRow[] = destinations.flatMap(({ kind }) => [{ type: 'section' as const, kind }, ...sections[kind].items.map((item) => ({ type: 'item' as const, kind, item }))]);

  return <ThemeBackground><SafeAreaView style={styles.safe}>
    <AppNavBar onBack={() => router.back()} />
    <FlatList data={rows} keyExtractor={(row) => row.type === 'section' ? row.kind : `${row.kind}-${row.item.id}`} initialNumToRender={12} contentContainerStyle={styles.content}
      ListHeaderComponent={<View style={styles.header}>
        <AppScreenHeader title="Tu bandeja" subtitle="Pendientes reales, agrupados por tipo" />
        <Text style={{ color: theme.textMuted }}>Revisa cada solicitud antes de responder. Los avisos pueden referirse a solicitudes que también aparecen en otra sección.</Text>
        <GlassButton title={loading ? 'Actualizando bandeja' : 'Actualizar bandeja'} loading={loading} onPress={() => void load()} />
      </View>}
      renderItem={({ item: row }) => {
        if (row.type === 'item') return <GlassCard blur={false} style={styles.item}>
          <Text style={[styles.itemTitle, { color: theme.text }]}>{row.item.title}</Text>
          <Text style={{ color: theme.textMuted }}>{row.item.detail}</Text>
          <GlassButton title={`Revisar: ${row.item.title}`} variant="secondary" onPress={() => router.push(row.item.path)} />
        </GlassCard>;
        const destination = destinations.find(({ kind }) => kind === row.kind)!;
        const section = sections[row.kind];
        return <View style={styles.section}>
          <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>{destination.title}{section.loaded ? ` · ${section.items.length}${section.more ? '+' : ''}` : ''}</Text>
          {row.kind === 'notifications' ? <Text style={{ color: theme.textMuted }}>Sin leer entre los últimos 50 avisos.</Text> : null}
          {section.error ? <><Text accessibilityRole="alert" style={{ color: theme.text }}>{section.error}{section.loaded ? ' Mostrando la última actualización disponible.' : ''}</Text><GlassButton title={`Reintentar ${destination.title}`} variant="secondary" disabled={loading} onPress={() => void load()} /></> : null}
          {!section.loaded && !section.error ? <Text accessibilityLiveRegion="polite" style={{ color: theme.textMuted }}>Cargando pendientes…</Text> : null}
          {section.loaded && !section.error && !section.items.length ? <Text style={{ color: theme.textMuted }}>No hay pendientes en esta sección.</Text> : null}
          {section.more ? <Text style={{ color: theme.textMuted }}>Hay más resultados; abre la sección completa.</Text> : null}
          <GlassButton title={destination.title} variant="secondary" onPress={() => router.push(destination.path)} />
        </View>;
      }} />
  </SafeAreaView></ThemeBackground>;
}
const styles = StyleSheet.create({ safe: { flex: 1, paddingHorizontal: 20 }, content: { gap: 12, paddingBottom: 32 }, header: { gap: 12 }, section: { gap: 10, marginTop: 16 }, heading: { fontSize: 21, fontWeight: '800' }, item: { gap: 10 }, itemTitle: { fontSize: 17, fontWeight: '700' } });
