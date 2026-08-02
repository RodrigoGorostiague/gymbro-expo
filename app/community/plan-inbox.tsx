import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { GlassButton } from '../../components/UI';
import { getShopTheme } from '../../constants/shopThemes';
import { THEMES } from '../../constants/theme';
import { useData } from '../../context/DataContext';
import { useSocial } from '../../context/SocialContext';
import { useTheme } from '../../context/ThemeContext';
import { PrivatePlanShareRequest } from '../../types';
import { LinearGradient } from 'expo-linear-gradient';

export default function PlanInboxScreen() {
  const { theme } = useTheme();
  const { listReceivedPrivatePlanShareRequests, acceptPrivatePlanShareRequest, rejectPrivatePlanShareRequest } = useSocial();
  const { retryData } = useData();
  const [requests, setRequests] = useState<PrivatePlanShareRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRequests(await listReceivedPrivatePlanShareRequests()); }
    catch (reason) { Alert.alert('Planes no disponibles', reason instanceof Error ? reason.message : 'Inténtalo de nuevo.'); }
    finally { setLoading(false); }
  }, [listReceivedPrivatePlanShareRequests]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { void load(); }, [load]);

  const accept = async (request: PrivatePlanShareRequest) => {
    setActing(request.id);
    try {
      const result = await acceptPrivatePlanShareRequest(request.id);
      await retryData();
      setRequests((current) => current.filter(({ id }) => id !== request.id));
      Alert.alert('Plan agregado', request.contentKind === 'mesocycle' ? 'El mesociclo y sus rutinas se agregaron como borrador.' : 'La rutina se agregó a tu biblioteca.', [{ text: 'Ver biblioteca', onPress: () => router.replace(result.mesocycleId ? `/mesocycle/${result.mesocycleId}` : '/routines') }]);
    } catch (reason) { Alert.alert('No se pudo agregar', reason instanceof Error ? reason.message : 'Inténtalo de nuevo.'); }
    finally { setActing(null); }
  };
  const reject = async (request: PrivatePlanShareRequest) => {
    setActing(request.id);
    try { await rejectPrivatePlanShareRequest(request.id); setRequests((current) => current.filter(({ id }) => id !== request.id)); }
    catch (reason) { Alert.alert('No se pudo rechazar', reason instanceof Error ? reason.message : 'Inténtalo de nuevo.'); }
    finally { setActing(null); }
  };

  return <ThemeBackground><SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.scroll}><AppNavBar onBack={() => router.back()} />
    <Text style={[styles.title, { color: theme.text }]}>Planes recibidos</Text><Text style={{ color: theme.textMuted }}>Revisá cada plan antes de agregar una copia a tu biblioteca.</Text>
    {loading ? <Text style={{ color: theme.textMuted }}>Actualizando...</Text> : null}
    {!loading && !requests.length ? <GlassCard><Text style={{ color: theme.textMuted }}>No tienes planes pendientes.</Text></GlassCard> : null}
    {requests.map((request) => {
      const mesocycle = request.snapshot.mesocycle;
      const routines = request.snapshot.routines;
      const title = mesocycle?.name ?? routines[0]?.name ?? 'Plan compartido';
      const senderTheme = getShopTheme(request.senderThemeId ?? '') ?? (request.senderAlias.toLocaleLowerCase() === 'brisas' ? THEMES.brisas : THEMES.rodaja);
      const contentKind = request.contentKind === 'mesocycle' ? 'MESOCICLO' : 'RUTINA';
      return <GlassCard key={request.id} style={styles.card}><LinearGradient accessibilityLabel={`${request.senderAlias} compartió un ${contentKind.toLocaleLowerCase()}`} colors={[senderTheme.primary, senderTheme.accent, senderTheme.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.senderBanner}><ProfileAvatar avatarId={request.senderAvatarId} size={48} borderColor="rgba(255,255,255,0.7)" /><View style={styles.senderCopy}><Text style={styles.senderAlias}>{request.senderAlias}</Text><Text style={styles.senderAction}>Te envió un plan</Text></View><Text style={styles.badge}>{contentKind}</Text></LinearGradient><Text style={[styles.planTitle, { color: theme.text }]}>{title}</Text><Text style={{ color: theme.textMuted }}>{request.contentKind === 'mesocycle' ? `${mesocycle?.durationWeeks ?? 0} semanas · ${routines.length} rutinas incluidas` : `${routines[0]?.exercises.length ?? 0} ejercicios`}</Text><View style={styles.actions}><GlassButton title="Agregar a mi biblioteca" loading={acting === request.id} disabled={!!acting} onPress={() => void accept(request)} /><GlassButton title="Rechazar" variant="secondary" disabled={!!acting} onPress={() => void reject(request)} /></View></GlassCard>;
    })}
  </ScrollView></SafeAreaView></ThemeBackground>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, scroll: { padding: 20, gap: 12, paddingBottom: 36 }, title: { fontSize: 26, fontWeight: '900' }, card: { gap: 12, paddingVertical: 18 }, senderBanner: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 15, padding: 12 }, senderCopy: { flex: 1, gap: 2 }, senderAlias: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', letterSpacing: 0.1 }, senderAction: { color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: '600' }, badge: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 }, planTitle: { fontSize: 21, fontWeight: '900' }, actions: { gap: 8, marginTop: 4 } });
