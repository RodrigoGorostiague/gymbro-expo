import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { GlassButton } from '../../components/UI';
import { useSocial } from '../../context/SocialContext';
import { useTheme } from '../../context/ThemeContext';
import { PublicProfile } from '../../services/socialGraph';
import { SocialProfileCard } from '../../components/SocialProfileCard';

export default function RequestsScreen() {
  const { theme } = useTheme(); const { requests, realtimeRevision } = useSocial(); const [profiles, setProfiles] = useState<PublicProfile[]>([]); const [cursor, setCursor] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  const load = useCallback(async (nextCursor: string | null = null, append = false) => { setLoading(true); try { const page = await requests(nextCursor); setProfiles((current) => append ? [...current, ...page.profiles.filter((profile) => !current.some(({ uid }) => uid === profile.uid))] : page.profiles); setCursor(page.nextCursor); } catch (reason) { Alert.alert('Solicitudes no disponibles', reason instanceof Error ? reason.message : 'Inténtalo de nuevo.'); } finally { setLoading(false); } }, [requests]);
  useFocusEffect(useCallback(() => { void load(); }, [load])); useEffect(() => { if (realtimeRevision > 0) void load(); }, [load, realtimeRevision]);
  return <ThemeBackground><SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.scroll}><AppNavBar onBack={() => router.back()} /><Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Solicitudes</Text><Text style={{ color: theme.textMuted }}>Respondé las invitaciones pendientes sin interrumpir el feed.</Text>{profiles.length ? profiles.map((profile) => <SocialProfileCard key={profile.uid} profile={profile} onPress={() => router.push({ pathname: '/social/[uid]', params: { uid: profile.uid }})} />) : !loading ? <GlassCard><Text style={{ color: theme.textMuted }}>No tienes solicitudes pendientes.</Text></GlassCard> : null}{cursor ? <GlassButton title={loading ? 'Cargando…' : 'Ver más'} disabled={loading} variant="secondary" onPress={() => void load(cursor, true)} /> : null}</ScrollView></SafeAreaView></ThemeBackground>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, scroll: { padding: 20, gap: 12, paddingBottom: 36 }, title: { fontSize: 26, fontWeight: '900' } });
