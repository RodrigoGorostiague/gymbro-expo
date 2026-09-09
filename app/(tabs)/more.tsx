import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppScreenHeader } from '../../components/AppScreenHeader';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { HapticPressable } from '../../components/HapticPressable';
import { useTheme } from '../../context/ThemeContext';
const destinations = [
  ['person-outline', 'Mi perfil', 'Identidad, privacidad y medidas', '/profile'],
  ['options-outline', 'Preferencias de entrenamiento', 'Movimiento, vibración y sonido', '/profile/preferences'],
  ['color-palette-outline', 'Apariencia y recompensas', 'Tus temas, fondos y coleccionables', '/(tabs)/shop'],
  ['mail-outline', 'Bandeja de entrada', 'Invitaciones, planes y notificaciones', '/community/inbox'],
] as const;
export default function MoreScreen() {
  const { theme } = useTheme();
  return <ThemeBackground><SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content}><AppScreenHeader title="Más" subtitle="Tu espacio, a tu manera" />{destinations.map(([icon, title, subtitle, path]) => <HapticPressable key={path} accessibilityLabel={title} onPress={() => router.push(path)}><GlassCard blur={false}><View style={styles.row}><Ionicons name={icon} color={theme.primary} size={27} /><View style={styles.flex}><Text style={[styles.title, { color: theme.text }]}>{title}</Text><Text style={[styles.subtitle, { color: theme.textMuted }]}>{subtitle}</Text></View><Ionicons name="chevron-forward" color={theme.textMuted} size={18} /></View></GlassCard></HapticPressable>)}</ScrollView></SafeAreaView></ThemeBackground>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, content: { padding: 20, gap: 16 }, row: { minHeight: 68, flexDirection: 'row', gap: 16, alignItems: 'center' }, flex: { flex: 1, gap: 6 }, title: { fontSize: 19, fontWeight: '800' }, subtitle: { fontSize: 14, lineHeight: 20 } });
