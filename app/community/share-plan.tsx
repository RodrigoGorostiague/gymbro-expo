import React, { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { GlassButton } from '../../components/UI';
import { useSocial } from '../../context/SocialContext';
import { useTheme } from '../../context/ThemeContext';
import { PublicProfile } from '../../services/socialGraph';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { getShopTheme } from '../../constants/shopThemes';
import { LinearGradient } from 'expo-linear-gradient';

export default function SharePlanScreen() {
  const { kind, id, name } = useLocalSearchParams<{ kind: 'routine' | 'mesocycle'; id: string; name: string }>();
  const { theme } = useTheme();
  const { circle, createPrivatePlanShareRequest } = useSocial();
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setProfiles((await circle()).profiles); }
    catch (reason) { Alert.alert('Círculo no disponible', reason instanceof Error ? reason.message : 'Inténtalo de nuevo.'); }
    finally { setLoading(false); }
  }, [circle]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const toggleRecipient = (profileId: string) => {
    if (sending) return;
    setSelectedProfileIds((current) => current.includes(profileId)
      ? current.filter((id) => id !== profileId)
      : [...current, profileId]);
  };

  const send = async () => {
    if (sendingRef.current || (kind !== 'routine' && kind !== 'mesocycle') || !id || !selectedProfileIds.length) return;
    const recipients = profiles.filter((profile) => selectedProfileIds.includes(profile.uid));
    if (!recipients.length) return;

    sendingRef.current = true;
    setSending(true);
    try {
      const results = await Promise.allSettled(recipients.map((profile) => Promise.resolve().then(() => createPrivatePlanShareRequest(profile.uid, kind, id))));
      const successfulIds = new Set(recipients.flatMap((profile, index) => results[index].status === 'fulfilled' ? [profile.uid] : []));
      const failedCount = recipients.length - successfulIds.size;
      setSelectedProfileIds((current) => current.filter((profileId) => !successfulIds.has(profileId)));

      if (!failedCount) {
        Alert.alert('Planes enviados', `${name || 'El plan'} llegará a ${recipients.length} ${recipients.length === 1 ? 'persona' : 'personas'} para que puedan revisarlo.`);
        return;
      }

      Alert.alert(
        successfulIds.size ? 'Envío parcial' : 'No se pudo enviar',
        successfulIds.size
          ? `Se enviaron ${successfulIds.size} de ${recipients.length} solicitudes. ${failedCount} ${failedCount === 1 ? 'persona sigue' : 'personas siguen'} seleccionada${failedCount === 1 ? '' : 's'} para reintentar.`
          : `No se pudo enviar a las ${failedCount} ${failedCount === 1 ? 'persona seleccionada' : 'personas seleccionadas'}. Inténtalo de nuevo.`,
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const label = kind === 'mesocycle' ? 'mesociclo' : 'rutina';
  const selectedCount = selectedProfileIds.length;
  return <ThemeBackground><SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.scroll}>
    <AppNavBar onBack={() => router.back()} />
    <Text style={[styles.title, { color: theme.text }]}>Enviar {label}</Text>
    <Text style={{ color: theme.textMuted }}>Elegí una persona de tu círculo. Recibirá una solicitud y decidirá si agregar una copia a su biblioteca.</Text>
    <GlassCard><Text style={[styles.planName, { color: theme.text }]}>{name || 'Plan de entrenamiento'}</Text><Text style={{ color: theme.textMuted }}>Se envía como una copia independiente.</Text></GlassCard>
    {loading ? <Text style={{ color: theme.textMuted }}>Cargando círculo...</Text> : null}
    {!loading && !profiles.length ? <GlassCard><Text style={{ color: theme.textMuted }}>Necesitas una conexión aceptada para enviar este plan.</Text></GlassCard> : null}
    {profiles.map((profile) => {
      const recipientTheme = getShopTheme(profile.presentationThemeId ?? '') ?? getShopTheme('profile-rodaja')!;
      const relationshipLabel = profile.relationshipStatus === 'partner' ? 'Partner' : 'Bro';
      const selected = selectedProfileIds.includes(profile.uid);
      return <Pressable key={profile.uid} accessibilityRole="checkbox" accessibilityLabel={`Enviar a ${profile.alias}`} accessibilityState={{ selected, disabled: sending }} disabled={sending} onPress={() => toggleRecipient(profile.uid)}><GlassCard style={[styles.member, selected && styles.memberSelected]}><LinearGradient colors={[recipientTheme.primary, recipientTheme.accent, recipientTheme.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.memberBanner}><ProfileAvatar avatarId={profile.avatarId} frameId={profile.frameId} size={48} borderColor="rgba(255,255,255,0.7)" /><View style={styles.copy}><Text style={styles.alias}>{profile.alias}</Text><Text style={styles.relationship}>{relationshipLabel}</Text></View>{selected ? <View style={styles.selectedBadge}><Text style={styles.selectedBadgeText}>Seleccionado</Text></View> : null}</LinearGradient><View style={styles.chips}>{Object.entries(profile.categories).map(([key, value]) => <View key={key} accessibilityLabel={`${key}: ${value}`} style={styles.chip}><Text style={styles.chipText}>{value}</Text></View>)}</View></GlassCard></Pressable>;
    })}
  </ScrollView><View style={styles.action}><Text style={[styles.selectionCount, { color: theme.textMuted }]}>{selectedCount} {selectedCount === 1 ? 'persona seleccionada' : 'personas seleccionadas'}</Text><GlassButton title={`Enviar a ${selectedCount} ${selectedCount === 1 ? 'persona' : 'personas'}`} loading={sending} disabled={sending || !selectedCount} onPress={() => void send()} /></View></SafeAreaView></ThemeBackground>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, scroll: { padding: 20, gap: 12, paddingBottom: 116 }, action: { gap: 8, padding: 16, paddingTop: 12 }, selectionCount: { fontSize: 13, fontWeight: '700', textAlign: 'center' }, title: { fontSize: 26, fontWeight: '900' }, planName: { fontSize: 18, fontWeight: '800', marginBottom: 4 }, member: { gap: 12, paddingVertical: 18 }, memberSelected: { borderColor: '#FFFFFF', borderWidth: 2 }, memberBanner: { alignItems: 'center', borderRadius: 15, flexDirection: 'row', gap: 11, padding: 12 }, copy: { flex: 1, gap: 2 }, alias: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', letterSpacing: 0.1 }, relationship: { color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: '700' }, selectedBadge: { backgroundColor: 'rgba(255,255,255,0.24)', borderColor: 'rgba(255,255,255,0.7)', borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 }, selectedBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }, chipText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' } });
