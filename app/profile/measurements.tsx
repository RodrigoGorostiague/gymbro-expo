import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnthropometricDraft, AnthropometricFields } from '../../components/AnthropometricFields';
import { AppNavBar } from '../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { GlassButton } from '../../components/UI';
import { anthropometricByType, ANTHROPOMETRICS } from '../../constants/anthropometrics';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { loadBodyMetrics, recordBodyMetric } from '../../services/bodyMetrics';
import { BodyMetric } from '../../types';
import { normalizeDecimalInput } from '../../utils/decimalInput';

export default function MeasurementsScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [draft, setDraft] = useState<AnthropometricDraft>({});
  const [metrics, setMetrics] = useState<BodyMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try { setMetrics(await loadBodyMetrics(user)); }
    catch (error) { Alert.alert('Mediciones no disponibles', error instanceof Error ? error.message : 'Intentá nuevamente.'); }
    finally { setLoading(false); }
  }, [user]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const save = async () => {
    if (!user) return;
    const entries = ANTHROPOMETRICS.flatMap((definition) => {
      const value = normalizeDecimalInput(draft[definition.type] ?? '');
      return value === null ? [] : [{ ...definition, value }];
    });
    if (!entries.length) { Alert.alert('Sin mediciones', 'Ingresá al menos una medición para guardar.'); return; }
    if (entries.some(({ value }) => value <= 0)) { Alert.alert('Medición inválida', 'Cada valor debe ser mayor a cero.'); return; }
    setSaving(true);
    try {
      const measuredAt = new Date().toISOString();
      const saved = await Promise.all(entries.map(({ type, unit, value }) => recordBodyMetric(user, { metricType: type, unit, value, measuredAt })));
      setMetrics((current) => [...saved, ...current]);
      setDraft({});
    } catch (error) { Alert.alert('No se pudo registrar', error instanceof Error ? error.message : 'Intentá nuevamente.'); }
    finally { setSaving(false); }
  };

  return <ThemeBackground><SafeAreaView style={styles.safe}><AppNavBar onBack={() => router.back()} /><ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
    <Text style={[styles.title, { color: theme.text }]}>Antropometrías</Text>
    <Text style={[styles.subtitle, { color: theme.textMuted }]}>Registros privados para seguir tu evolución corporal.</Text>
    <GlassCard><Text style={[styles.section, { color: theme.text }]}>Actualizar mediciones</Text><Text style={[styles.hint, { color: theme.textMuted }]}>Cargá sólo las medidas que quieras actualizar hoy. Tocá el ícono de información para ver cómo tomar cada una.</Text><AnthropometricFields values={draft} onChange={(type, value) => setDraft((current) => ({ ...current, [type]: value }))} theme={theme} /><View style={styles.action}><GlassButton title="Guardar mediciones" loading={saving} disabled={saving} onPress={() => void save()} /></View></GlassCard>
    <GlassCard><Text style={[styles.section, { color: theme.text }]}>Historial</Text>{loading ? <Text style={{ color: theme.textMuted }}>Cargando mediciones...</Text> : metrics.length === 0 ? <Text style={{ color: theme.textMuted }}>Tu primera medición aparecerá acá.</Text> : metrics.map((metric) => <View key={metric.id} style={[styles.row, { borderColor: theme.glassBorder }]}><View><Text style={[styles.rowValue, { color: theme.text }]}>{anthropometricByType[metric.metricType].label}</Text><Text style={{ color: theme.textMuted }}>{new Date(metric.measuredAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}</Text></View><Text style={[styles.value, { color: theme.primary }]}>{metric.value} {metric.unit}</Text></View>)}</GlassCard>
  </ScrollView></SafeAreaView></ThemeBackground>;
}

const styles = StyleSheet.create({ safe: { flex: 1, paddingHorizontal: 20, paddingTop: 8 }, scroll: { gap: 14, paddingBottom: 40 }, title: { fontSize: 28, fontWeight: '900' }, subtitle: { fontSize: 13, lineHeight: 19, marginTop: -8 }, section: { fontSize: 17, fontWeight: '800', marginBottom: 8 }, hint: { fontSize: 12, lineHeight: 18, marginBottom: 14 }, action: { marginTop: 16 }, row: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 }, rowValue: { fontSize: 15, fontWeight: '800' }, value: { fontSize: 16, fontWeight: '900' } });
