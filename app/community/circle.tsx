import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { GlassButton } from '../../components/UI';
import { useSocial } from '../../context/SocialContext';
import { useTheme } from '../../context/ThemeContext';
import { PublicProfile } from '../../services/socialGraph';
import { ProfileAvatar } from '../../components/ProfileAvatar';

export default function CircleScreen() {
  const { theme } = useTheme(); const { circle, realtimeRevision } = useSocial(); const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const load = useCallback(async () => { try { setProfiles((await circle()).profiles); } catch (reason) { Alert.alert('Círculo no disponible', reason instanceof Error ? reason.message : 'Inténtalo de nuevo.'); } }, [circle]);
  useFocusEffect(useCallback(() => { void load(); }, [load])); useEffect(() => { if (realtimeRevision > 0) void load(); }, [load, realtimeRevision]);
  return <ThemeBackground><SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.scroll}><AppNavBar onBack={() => router.back()} /><Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Mi círculo</Text><Text style={{ color: theme.textMuted }}>Tus conexiones aceptadas.</Text>{profiles.length ? profiles.map((profile) => <GlassCard key={profile.uid} style={styles.card}><ProfileAvatar avatarId={profile.avatarId} borderColor={theme.primary} /><View style={styles.copy}><Text style={[styles.alias, { color: theme.text }]}>{profile.alias}</Text><Text style={{ color: theme.textMuted }}>{Object.values(profile.categories).join(' · ') || 'Perfil público'}</Text></View><GlassButton title="Ver" variant="secondary" onPress={() => router.push({ pathname: '/social/[uid]', params: { uid: profile.uid } })} /></GlassCard>) : <GlassCard><Text style={{ color: theme.textMuted }}>Todavía no tienes conexiones aceptadas.</Text></GlassCard>}</ScrollView></SafeAreaView></ThemeBackground>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, scroll: { padding: 20, gap: 12, paddingBottom: 36 }, title: { fontSize: 26, fontWeight: '900' }, card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, copy: { flex: 1 }, alias: { fontSize: 17, fontWeight: '800' } });
