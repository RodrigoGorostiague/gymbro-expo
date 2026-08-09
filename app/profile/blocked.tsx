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
import { ProfileTitleBadge } from '../../components/ProfileTitleBadge';

export default function BlockedUsersScreen() {
  const { theme } = useTheme(); const { blockedUsers, command, realtimeRevision } = useSocial(); const [profiles, setProfiles] = useState<PublicProfile[]>([]); const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const load = useCallback(async () => { try { setProfiles((await blockedUsers()).profiles); } catch (reason) { Alert.alert('Usuarios bloqueados no disponibles', reason instanceof Error ? reason.message : 'Inténtalo de nuevo.'); } }, [blockedUsers]);
  useFocusEffect(useCallback(() => { void load(); }, [load])); useEffect(() => { if (realtimeRevision > 0) void load(); }, [load, realtimeRevision]);
  const unblock = async (profile: PublicProfile) => { setUnblockingId(profile.uid); try { await command({ command: 'unblock', targetId: profile.uid }); await load(); } catch (reason) { Alert.alert('No se pudo desbloquear', reason instanceof Error ? reason.message : 'Inténtalo de nuevo.'); } finally { setUnblockingId(null); } };
  return <ThemeBackground><SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.scroll}><AppNavBar onBack={() => router.back()} /><Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Usuarios bloqueados</Text>{profiles.length ? profiles.map((profile) => <GlassCard key={profile.uid} style={styles.card}><ProfileAvatar avatarId={profile.avatarId} frameId={profile.frameId} borderColor={theme.primary} /><View style={styles.copy}><Text style={[styles.alias, { color: theme.text }]}>{profile.alias}</Text><ProfileTitleBadge titleId={profile.titleId} /></View><GlassButton title="Desbloquear" variant="secondary" disabled={unblockingId !== null} loading={unblockingId === profile.uid} onPress={() => void unblock(profile)} /></GlassCard>) : <GlassCard><Text style={{ color: theme.textMuted }}>No tienes usuarios bloqueados.</Text></GlassCard>}</ScrollView></SafeAreaView></ThemeBackground>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, scroll: { padding: 20, gap: 12, paddingBottom: 36 }, title: { fontSize: 26, fontWeight: '900' }, card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, copy: { flex: 1 }, alias: { fontSize: 17, fontWeight: '800' } });
