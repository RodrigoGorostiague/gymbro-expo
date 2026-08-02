import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { SimpleLineChart } from '../../components/LineChart';
import { GlassButton, GlassInput } from '../../components/UI';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { BodyMetric } from '../../types';
import { loadBodyMetrics, recordBodyWeight } from '../../services/bodyMetrics';
import { normalizeDecimalInput } from '../../utils/decimalInput';

export default function MeasurementsScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [weight, setWeight] = useState('');
  const [metrics, setMetrics] = useState<BodyMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setMetrics(await loadBodyMetrics(user));
    } catch (error) {
      Alert.alert('Mediciones no disponibles', error instanceof Error ? error.message : 'Intentá nuevamente.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const save = async () => {
    if (!user) return;
    const value = normalizeDecimalInput(weight);
    if (value === null || value <= 0) {
      Alert.alert('Peso inválido', 'Ingresá un peso mayor a cero.');
      return;
    }
    setSaving(true);
    try {
      const saved = await recordBodyWeight(user, { value, measuredAt: new Date().toISOString() });
      setMetrics((current) => [saved, ...current]);
      setWeight('');
    } catch (error) {
      Alert.alert('No se pudo registrar el peso', error instanceof Error ? error.message : 'Intentá nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  const latest = metrics[0];
  return <ThemeBackground><SafeAreaView style={styles.safe}><AppNavBar onBack={() => router.back()} /><ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
    <Text style={[styles.title, { color: theme.text }]}>Peso corporal</Text>
    <Text style={[styles.subtitle, { color: theme.textMuted }]}>Registro privado para contextualizar tu fuerza relativa.</Text>
    <GlassCard style={styles.hero}>
      <Text style={[styles.eyebrow, { color: theme.primary }]}>ÚLTIMO REGISTRO</Text>
      <Text style={[styles.value, { color: theme.text }]}>{latest ? `${latest.value} kg` : 'Sin registro'}</Text>
      {latest ? <Text style={{ color: theme.textMuted }}>{new Date(latest.measuredAt).toLocaleDateString('es')}</Text> : null}
    </GlassCard>
    <GlassCard>
      <Text style={[styles.section, { color: theme.text }]}>Registrar peso</Text>
      <GlassInput accessibilityLabel="Peso corporal en kilogramos" keyboardType="decimal-pad" value={weight} onChangeText={setWeight} placeholder="Ej.: 72,5 kg" />
      <Text style={[styles.hint, { color: theme.textMuted }]}>Por ahora registramos peso corporal. Esta base admite futuras mediciones antropométricas.</Text>
      <GlassButton title="Guardar peso" loading={saving} disabled={saving} onPress={() => void save()} />
    </GlassCard>
    <GlassCard>
      <Text style={[styles.section, { color: theme.text }]}>Historial</Text>
      {loading ? <Text style={{ color: theme.textMuted }}>Cargando mediciones…</Text> : metrics.length === 0 ? <Text style={{ color: theme.textMuted }}>Tu primera medición aparecerá acá.</Text> : metrics.map((metric) => <View key={metric.id} style={[styles.row, { borderColor: theme.glassBorder }]}><Text style={[styles.rowValue, { color: theme.text }]}>{metric.value} kg</Text><Text style={{ color: theme.textMuted }}>{new Date(metric.measuredAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}</Text></View>)}
    </GlassCard>
    {metrics.length > 0 ? <GlassCard><SimpleLineChart data={[...metrics].reverse().map((metric) => ({ date: metric.measuredAt, label: new Date(metric.measuredAt).toLocaleDateString('es', { day: 'numeric', month: 'numeric' }), maxWeight: metric.value, totalReps: 0, tonnage: 0 }))} dataKey="maxWeight" unit=" kg" label="Evolución del peso corporal" summary="Registros manuales ordenados por fecha." /></GlassCard> : null}
  </ScrollView></SafeAreaView></ThemeBackground>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20, paddingTop: 8 }, scroll: { paddingBottom: 40, gap: 14 },
  title: { fontSize: 28, fontWeight: '900' }, subtitle: { fontSize: 13, lineHeight: 19, marginTop: -8 },
  hero: { gap: 4 }, eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1 }, value: { fontSize: 34, fontWeight: '900' },
  section: { fontSize: 17, fontWeight: '800', marginBottom: 10 }, hint: { fontSize: 12, lineHeight: 18, marginVertical: 10 },
  row: { borderTopWidth: 1, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, rowValue: { fontSize: 16, fontWeight: '800' },
});
