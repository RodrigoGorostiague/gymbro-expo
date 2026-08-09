import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { getShopTheme } from '../constants/shopThemes';
import type { PublicProfile, SocialProfileInsights } from '../services/socialGraph';
import { HapticPressable } from './HapticPressable';
import { MiniMuscleDistributionRadar } from './MiniMuscleDistributionRadar';
import { ProfileAvatar } from './ProfileAvatar';

export function SocialProfileCard({ profile, insights, onPress }: { profile: PublicProfile; insights?: SocialProfileInsights; onPress: () => void }) {
  const { theme } = useTheme();
  const relationship = profile.relationshipStatus === 'partner' ? 'Partner' : profile.relationshipStatus === 'bro' ? 'Bro' : null;
  const categories = Object.values(profile.categories).filter(Boolean).join(' · ');
  const profileTheme = relationship ? getShopTheme(profile.presentationThemeId ?? '') : undefined;
  const connected = Boolean(relationship && profileTheme);
  const palette = profileTheme ?? theme;
  const content = <><ProfileAvatar avatarId={profile.avatarId} size={56} borderColor={connected ? '#FFFFFF' : '#A1A1AA'} /><View style={styles.copy}><View style={styles.identity}><Text numberOfLines={1} style={[styles.alias, { color: connected ? '#FFFFFF' : theme.text }]}>{profile.alias}</Text>{relationship ? <Text style={[styles.badge, { backgroundColor: connected ? 'rgba(0,0,0,0.2)' : '#52525B', color: '#FFFFFF' }]}>{relationship}</Text> : null}</View><Text numberOfLines={1} style={{ color: connected ? 'rgba(255,255,255,0.84)' : theme.textMuted }}>{categories || 'Perfil público'}</Text>{connected && insights?.progress ? <Text style={styles.rank}>Nivel {insights.progress.level} · {insights.progress.rank}</Text> : null}</View>{connected && insights?.muscleDistribution ? <MiniMuscleDistributionRadar data={insights.muscleDistribution} color="#FFFFFF" fill={palette.accent} /> : null}<Text accessibilityElementsHidden style={[styles.chevron, { color: connected ? '#FFFFFF' : '#A1A1AA' }]}>›</Text></>;
  return <HapticPressable accessibilityRole="button" accessibilityLabel={`Ver perfil de ${profile.alias}`} accessibilityHint="Abre el detalle del atleta" onPress={onPress} style={styles.pressable}>{connected ? <LinearGradient colors={[palette.primary, palette.accent, palette.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>{content}</LinearGradient> : <View style={[styles.card, styles.disconnected]}>{content}</View>}</HapticPressable>;
}

const styles = StyleSheet.create({ pressable: { borderRadius: 18, overflow: 'hidden' }, card: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 78, padding: 12 }, disconnected: { backgroundColor: '#3F3F46', borderColor: '#71717A', borderWidth: 1 }, copy: { flex: 1, gap: 5 }, identity: { alignItems: 'center', flexDirection: 'row', gap: 7 }, alias: { flexShrink: 1, fontSize: 17, fontWeight: '900' }, badge: { borderRadius: 999, fontSize: 10, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3, textTransform: 'uppercase' }, rank: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' }, chevron: { fontSize: 28, fontWeight: '300' } });
