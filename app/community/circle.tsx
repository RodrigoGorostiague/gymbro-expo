import { useLatestRequest } from '../../hooks/useLatestRequest';
import { useAuth } from '../../context/AuthContext';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { useSocial } from '../../context/SocialContext';
import { useTheme } from '../../context/ThemeContext';
import { PublicProfile, SocialProfileInsights } from '../../services/socialGraph';
import { SocialProfileCard } from '../../components/SocialProfileCard';

export default function CircleScreen() {
  const { user } = useAuth();
  const reads = useLatestRequest(user);
  const { theme } = useTheme(); const { circle, getProfileInsightsBatch, realtimeRevision } = useSocial(); const [profiles, setProfiles] = useState<PublicProfile[]>([]); const [insights, setInsights] = useState<Record<string, SocialProfileInsights>>({});
  useEffect(() => { setProfiles([]); setInsights({}); }, [user]);
  const load = useCallback(async () => { const current = reads.begin(); try { const page = await circle(); const nextInsights = await getProfileInsightsBatch(page.profiles.map((profile) => profile.uid)); if (!current()) return; setProfiles(page.profiles); setInsights(nextInsights); } catch (reason) { if (!current()) return; Alert.alert('Círculo no disponible', reason instanceof Error ? reason.message : 'Inténtalo de nuevo.'); } }, [circle, getProfileInsightsBatch, reads, user]);
  useFocusEffect(useCallback(() => { void load(); }, [load])); useEffect(() => { if (realtimeRevision > 0) void load(); }, [load, realtimeRevision]);
  const orderedProfiles = [...profiles].sort((left, right) => Number(right.relationshipStatus === 'partner') - Number(left.relationshipStatus === 'partner') || left.alias.localeCompare(right.alias, 'es'));
  return <ThemeBackground><SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.scroll}><AppNavBar onBack={() => router.back()} /><Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Mi círculo</Text><Text style={{ color: theme.textMuted }}>Tu red de entrenamiento, con perfiles y progreso compartidos.</Text>{orderedProfiles.length ? orderedProfiles.map((profile) => <SocialProfileCard key={profile.uid} profile={profile} insights={insights[profile.uid]} onPress={() => router.push({ pathname: '/social/[uid]', params: { uid: profile.uid } })} />) : <GlassCard><Text style={{ color: theme.textMuted }}>Todavía no tienes conexiones aceptadas. Explorá atletas para armar tu círculo.</Text></GlassCard>}</ScrollView></SafeAreaView></ThemeBackground>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, scroll: { padding: 20, gap: 12, paddingBottom: 36 }, title: { fontSize: 26, fontWeight: '900' } });
