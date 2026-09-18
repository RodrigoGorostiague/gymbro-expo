import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemeBackground, GlassCard } from '../../components/GlassCard';
import { AppNavBar } from '../../components/AppNavBar';
import { SensorySettings } from '../../components/SensorySettings';
import { useTheme } from '../../context/ThemeContext';

export default function TrainingPreferencesScreen() {
  const { theme } = useTheme();
  return <ThemeBackground calm><SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content}>
      <AppNavBar onBack={() => router.back()} />
      <View style={[styles.icon, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}><Ionicons name="options-outline" size={30} color={theme.primary} /></View>
      <Text style={[styles.eyebrow, { color: theme.primary }]}>TU RITMO · TUS REGLAS</Text>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Entrena a tu manera</Text>
      <Text style={[styles.subtitle, { color: theme.textMuted }]}>Elige cuánta energía quieres en cada interacción. Una experiencia más tranquila también es una gran experiencia.</Text>
      <GlassCard blur={false}><SensorySettings /></GlassCard>
      <View style={styles.note}><Ionicons name="phone-portrait-outline" size={20} color={theme.textMuted} /><Text style={[styles.noteText, { color: theme.textMuted }]}>Estos ajustes se guardan en este dispositivo. No cambian tu perfil público ni necesitan Guardar perfil.</Text></View>
    </ScrollView>
  </SafeAreaView></ThemeBackground>;
}
const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' },
  icon: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1 },
  eyebrow: { fontSize: 10, letterSpacing: 1.5, fontWeight: '900' }, title: { fontSize: 32, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { fontSize: 15, lineHeight: 23 }, note: { flexDirection: 'row', gap: 12, padding: 8 }, noteText: { flex: 1, fontSize: 12, lineHeight: 19 },
});
