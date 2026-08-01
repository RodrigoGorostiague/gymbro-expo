import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { GlassButton, GlassInput } from '../../components/UI';
import { useSocial } from '../../context/SocialContext';
import { useTheme } from '../../context/ThemeContext';
import { PublicProfile } from '../../services/socialGraph';

export default function DiscoverScreen() {
  const { theme } = useTheme(); const { discover, search, realtimeRevision } = useSocial();
  const [query, setQuery] = useState(''); const [profiles, setProfiles] = useState<PublicProfile[]>([]); const [cursor, setCursor] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  const load = useCallback(async (nextCursor: string | null = null, append = false) => {
    setLoading(true);
    try { const page = query.trim() ? await search(query, nextCursor) : await discover(nextCursor); setProfiles((current) => append ? [...current, ...page.profiles.filter((profile) => !current.some(({ uid }) => uid === profile.uid))] : page.profiles); setCursor(page.nextCursor); }
    catch (reason) { Alert.alert(query.trim() ? 'Búsqueda no disponible' : 'Descubrimiento no disponible', reason instanceof Error ? reason.message : 'Inténtalo de nuevo.'); }
    finally { setLoading(false); }
  }, [discover, query, search]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { if (realtimeRevision > 0) void load(); }, [load, realtimeRevision]);
  return <ThemeBackground><SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled"><AppNavBar onBack={() => router.back()} /><Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Explorar atletas</Text><Text style={{ color: theme.textMuted }}>Buscá por alias o descubrí nuevas conexiones.</Text><GlassInput testID="alias-search" placeholder="Buscar por alias" value={query} onChangeText={setQuery} autoCapitalize="none" style={styles.input} />
    {profiles.length ? profiles.map((profile) => <GlassCard key={profile.uid} style={styles.card}><View style={styles.copy}><Text style={[styles.alias, { color: theme.text }]}>{profile.alias}</Text><Text style={{ color: theme.textMuted }}>{Object.values(profile.categories).join(' · ') || 'Perfil público'}</Text></View><GlassButton title="Ver" variant="secondary" onPress={() => router.push({ pathname: '/social/[uid]', params: { uid: profile.uid } })} /></GlassCard>) : !loading ? <GlassCard><Text style={{ color: theme.textMuted }}>{query.trim() ? 'No encontramos atletas con ese alias.' : 'Todavía no hay atletas para descubrir.'}</Text></GlassCard> : null}
    <GlassButton title={loading ? 'Cargando…' : cursor ? 'Ver más' : query.trim() ? 'Buscar' : 'Actualizar'} disabled={loading} variant="secondary" onPress={() => void load(cursor, !!cursor)} />
  </ScrollView></SafeAreaView></ThemeBackground>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, scroll: { padding: 20, gap: 12, paddingBottom: 36 }, title: { fontSize: 26, fontWeight: '900' }, input: { marginTop: 4 }, card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, copy: { flex: 1 }, alias: { fontSize: 17, fontWeight: '800' } });
