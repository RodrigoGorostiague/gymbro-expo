import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { GlassButton } from '../../components/UI';
import { useSocial } from '../../context/SocialContext';
import { useTheme } from '../../context/ThemeContext';
import { GraphSummary, PublicProfile } from '../../services/socialGraph';
import { ProfileAvatar } from '../../components/ProfileAvatar';

export default function PublicProfileScreen() {
  const { uid } = useLocalSearchParams<{ uid: string }>(); const { theme } = useTheme(); const { getProfile, getSummary, command, realtimeRevision } = useSocial();
  const [profile, setProfile] = useState<PublicProfile | null>(null); const [summary, setSummary] = useState<GraphSummary | null>(null); const [loading, setLoading] = useState(true); const [acting, setActing] = useState(false);
  const load = useCallback(async () => { if (!uid) return; setLoading(true); try { const [nextProfile, nextSummary] = await Promise.all([getProfile(uid), getSummary(uid)]); setProfile(nextProfile); setSummary(nextSummary); } catch (error) { Alert.alert('Perfil no disponible', error instanceof Error ? error.message : 'Este perfil ya no está disponible.'); } finally { setLoading(false); } }, [getProfile, getSummary, uid]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { if (realtimeRevision > 0) void load(); }, [load, realtimeRevision]);
  const act = async (input: Parameters<typeof command>[0]) => { setActing(true); try { setSummary(await command(input)); } catch (error) { Alert.alert('Acción no disponible', error instanceof Error ? error.message : 'Inténtalo de nuevo.'); } finally { setActing(false); } };
  const requestKindLabel = summary?.requestKind === 'partner' ? 'Partner' : 'Bro';
  const downgrade = () => Alert.alert('Bajar a Bro', 'Esta acción conserva la conexión y la cambia de Partner a Bro.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Bajar a Bro', style: 'destructive', onPress: () => void act({ command: 'downgradePartner', targetId: uid }) },
  ]);
  return <ThemeBackground><SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.scroll}><AppNavBar onBack={() => router.back()} />
    {loading ? <Text style={{ color: theme.text }}>Cargando perfil…</Text> : !profile ? <Text style={{ color: theme.text }}>Este perfil no está disponible.</Text> : <GlassCard><View style={styles.identity}><ProfileAvatar avatarId={profile.avatarId} size={76} borderColor={theme.primary} /><Text style={[styles.alias, { color: theme.text }]}>{profile.alias}</Text></View>{Object.entries(profile.categories).map(([key, value]) => <View key={key} style={styles.category}><Text style={{ color: theme.textMuted }}>{key}</Text><Text style={{ color: theme.text }}>{value}</Text></View>)}{summary?.relationshipKind ? <Text style={[styles.state, { color: theme.success }]}>Conexión: {summary.relationshipKind === 'partner' ? 'Partner' : 'Bro'}</Text> : null}{summary?.incomingRequest ? <Text style={[styles.state, { color: theme.text }]}>Solicitud para ser {requestKindLabel}</Text> : null}{summary?.blocked ? <GlassButton title="Desbloquear" onPress={() => void act({ command: 'unblock', targetId: uid })} loading={acting} /> : summary?.incomingRequest ? <><GlassButton title={`Aceptar solicitud de ${requestKindLabel}`} onPress={() => void act({ command: 'respondRequest', targetId: uid, accepted: true })} loading={acting} /><GlassButton title="Rechazar solicitud" variant="secondary" onPress={() => void act({ command: 'respondRequest', targetId: uid, accepted: false })} disabled={acting} /></> : summary?.outgoingRequest ? <GlassButton title="Cancelar solicitud" onPress={() => void act({ command: 'cancelRequest', targetId: uid })} loading={acting} /> : summary?.relationshipKind === 'bro' ? <GlassButton title="Solicitar upgrade a Partner" onPress={() => void act({ command: 'sendRequest', targetId: uid, relationshipKind: 'partner' })} loading={acting} /> : summary?.relationshipKind === 'partner' ? <GlassButton title="Bajar a Bro" variant="secondary" onPress={downgrade} disabled={acting} /> : <><GlassButton title="Invitar como Bro" onPress={() => void act({ command: 'sendRequest', targetId: uid, relationshipKind: 'bro' })} loading={acting} /><GlassButton title="Invitar como Partner" variant="secondary" onPress={() => void act({ command: 'sendRequest', targetId: uid, relationshipKind: 'partner' })} disabled={acting} /></>}<GlassButton title="Bloquear" variant="danger" onPress={() => void act({ command: 'block', targetId: uid })} disabled={acting || !!summary?.blocked} /></GlassCard>}
  </ScrollView></SafeAreaView></ThemeBackground>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, scroll: { padding: 20, gap: 14 }, identity: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 18 }, alias: { fontSize: 28, fontWeight: '900' }, category: { gap: 3, marginBottom: 12 }, state: { fontWeight: '800', marginBottom: 12 } });
