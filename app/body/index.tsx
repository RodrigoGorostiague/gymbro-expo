import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppNavBar } from '../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { GlassButton } from '../../components/UI';
import { AnthropometricDraft, AnthropometricFields } from '../../components/AnthropometricFields';
import { BodyCamera } from '../../components/body/BodyCamera';
import { PhotoComparison } from '../../components/body/PhotoComparison';
import { PoseGuide } from '../../components/body/PoseGuide';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ANTHROPOMETRICS, anthropometricByType } from '../../constants/anthropometrics';
import { deleteBodyMeasurements, loadBodyEvolution, saveBodyDay } from '../../services/bodyEvolution';
import { loadBodyPhotos, removeBodyPhotos } from '../../services/bodyPhotos';
import { BODY_POSES, BodyPhoto, BodyPose, dayLabel, groupBodyHistory, localDay } from '../../utils/bodyEvolution';
import { BodyMetric } from '../../types';

export default function BodyEvolutionScreen() {
  const { user } = useAuth();
  // Account-keyed remount prevents one account's photos or drafts appearing in another.
  return user ? <BodyEvolution key={user} owner={user} /> : null;
}
function BodyEvolution({ owner }: { owner: string }) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<'today' | 'history'>('today');
  const [day, setDay] = useState(localDay());
  const [metrics, setMetrics] = useState<BodyMetric[]>([]);
  const [photos, setPhotos] = useState<BodyPhoto[]>([]);
  const [draft, setDraft] = useState<AnthropometricDraft>({});
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [camera, setCamera] = useState<BodyPose | null>(null);
  const [poseFilter, setPoseFilter] = useState<BodyPose>('front-biceps');
  const [selected, setSelected] = useState<BodyPhoto[]>([]);
  const [compare, setCompare] = useState(false);
  const mounted = useRef(true);
  const operation = useRef(false);
  const loadVersion = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true); setError('');
    const [numbers, images] = await Promise.allSettled([loadBodyEvolution(owner), Platform.OS === 'web' ? Promise.resolve([]) : loadBodyPhotos(owner)]);
    if (!mounted.current || version !== loadVersion.current) return;
    const errors: string[] = [];
    if (numbers.status === 'fulfilled') setMetrics(numbers.value); else errors.push(numbers.reason instanceof Error ? numbers.reason.message : 'No se cargaron las medidas.');
    if (images.status === 'fulfilled') setPhotos(images.value); else errors.push('No se cargaron las fotos locales. Intenta nuevamente.');
    setError(errors.join('\n')); setLoading(false);
  }, [owner]);
  useFocusEffect(useCallback(() => { void load(); return () => { setCamera(null); setCompare(false); }; }, [load]));
  useEffect(() => {
    const refresh = () => {
      const next = localDay();
      if (next !== day) {
        setDay(next); setDraft({});
        setStatus('Comenzó un nuevo día. El registro anterior quedó en el historial.');
        void load();
      }
    };
    const timer = setInterval(refresh, 15000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [day, load]);
  const history = groupBodyHistory(metrics, photos);
  const today = history.find(g => g.day === day);
  const text = { color: theme.text };
  const muted = { color: theme.textMuted };
  const button = (label: string, action: () => void, active = false, disabled = false) => <Pressable accessibilityRole="button" accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={action} style={[styles.button, { backgroundColor: active ? theme.primary : theme.glass, borderColor: theme.glassBorder }, disabled && { opacity: 0.4 }]}><Text style={[styles.buttonText, { color: active ? '#10121B' : theme.text }]}>{label}</Text></Pressable>;
  async function save() {
    if (operation.current) return;
    const values: { metricType: typeof ANTHROPOMETRICS[number]['type']; value: number }[] = [];
    for (const metric of ANTHROPOMETRICS) {
      const raw = draft[metric.type]?.trim();
      if (!raw) continue;
      if (!/^\d+(?:[.,]\d{1,3})?$/.test(raw) || Number(raw.replace(',', '.')) <= 0) {
        setError(`${metric.label}: ingresa un número positivo con hasta tres decimales.`); return;
      }
      values.push({ metricType: metric.type, value: Number(raw.replace(',', '.')) });
    }
    operation.current = true; setBusy(true); setStatus('');
    try { await saveBodyDay(day, values); if (mounted.current) { setDraft({}); setStatus('Medidas guardadas. Puedes completar las fotos más tarde.'); await load(); } }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'No se guardaron las medidas.'); }
    finally { operation.current = false; if (mounted.current) setBusy(false); }
  }
  function confirmDelete(metricIds: string[], photoIds: string[]) {
    Alert.alert('¿Eliminar de GymBro?', 'Se eliminarán los datos seleccionados. Las copias de la galería permanecerán. No puedes volver a completar días anteriores.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => void (async () => {
      if (operation.current) return;
      operation.current = true; setBusy(true);
      try {
        await deleteBodyMeasurements(metricIds);
        await removeBodyPhotos(owner, photoIds);
        if (mounted.current) { setSelected([]); setStatus('Eliminado de GymBro. Las copias de la galería no se modificaron.'); }
      } catch (e) { if (mounted.current) Alert.alert('No se completó la eliminación', `${e instanceof Error ? e.message : 'Intenta nuevamente.'} Se actualizará el historial para mostrar lo que permanece.`); }
      finally { operation.current = false; if (mounted.current) { setBusy(false); void load(); } }
    })() }]);
  }
  function openPose(pose: BodyPose) {
    if (photos.some(p => p.day === day && p.pose === pose)) Alert.alert('¿Reemplazar la foto de hoy?', 'La foto actual seguirá en la galería. Puedes cancelar antes de confirmar la nueva.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Continuar', onPress: () => setCamera(pose) }]);
    else setCamera(pose);
  }
  return <ThemeBackground><SafeAreaView style={styles.safe}><AppNavBar onBack={() => router.back()} /><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={[styles.eyebrow, { color: theme.primary }]}>TU REGISTRO PERSONAL</Text>
    <Text style={[styles.title, text]}>Evolución corporal</Text>
    <Text style={[styles.subtitle, muted]}>Medidas y fotos. A tu ritmo, sin compararte con nadie más.</Text>
    <View style={styles.row}>{button('Hoy', () => setTab('today'), tab === 'today')}{button('Historial', () => setTab('history'), tab === 'history')}</View>
    {loading && <Text style={muted}>Actualizando registros…</Text>}
    {!!error && <GlassCard><Text accessibilityRole="alert" style={text}>{error}</Text>{button('Reintentar carga', () => void load(), false, loading)}</GlassCard>}
    {!!status && <Text accessibilityLiveRegion="polite" style={text}>{status}</Text>}
    {tab === 'today' ? <>
      <GlassCard><Text style={[styles.section, text]}>{dayLabel(day)}</Text><Text style={[styles.hint, muted]}>Un registro por día. Guarda solo lo que quieras registrar.</Text>
        <AnthropometricFields definitions={ANTHROPOMETRICS.filter(m => m.type === 'body_weight')} values={draft} onChange={(type, value) => setDraft(d => ({ ...d, [type]: value }))} theme={theme} />
        {today?.metrics.find(m => m.metricType === 'body_weight') && <Text style={[styles.hint, muted]}>Hoy: {today.metrics.find(m => m.metricType === 'body_weight')!.value} kg</Text>}
        {button(expanded ? 'Ocultar medidas' : 'Agregar o actualizar medidas', () => setExpanded(!expanded), expanded)}
        {expanded && <AnthropometricFields definitions={ANTHROPOMETRICS.filter(m => m.type !== 'body_weight')} values={draft} onChange={(type, value) => setDraft(d => ({ ...d, [type]: value }))} theme={theme} />}
        <View style={styles.space}><GlassButton title="Guardar medidas de hoy" loading={busy} disabled={busy || !Object.values(draft).some(v => v?.trim())} onPress={() => void save()} /></View>
      </GlassCard>
      <Text style={[styles.section, text]}>Fotos guiadas</Text><Text style={[styles.hint, muted]}>Teléfono apoyado, manos libres. Una foto por pose cada día.</Text>
      <View style={styles.grid}>{BODY_POSES.map(pose => {
        const photo = today?.photos.find(p => p.pose === pose.id);
        return <Pressable accessibilityRole="button" accessibilityLabel={`${pose.title}, ${photo ? 'reemplazar foto' : 'tomar foto'}`} disabled={busy || loading} key={pose.id} onPress={() => openPose(pose.id)} style={[styles.pose, { borderColor: theme.glassBorder, backgroundColor: theme.glass }]}>
          <View style={styles.poseArt}>{photo ? <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <PoseGuide pose={pose.id} color={theme.primary} />}</View>
          <Text style={[styles.poseTitle, text]}>{pose.title}</Text><Text style={[styles.hint, muted]}>{pose.subtitle}</Text><Text style={{ color: theme.primary }}>{photo ? 'Guardada · reemplazar' : 'Ver guía y tomar foto'}</Text>
        </Pressable>;
      })}</View>
      <Text style={[styles.hint, muted]}>Las fotos de GymBro están en este dispositivo. Las medidas se guardan en tu cuenta. La galería puede tener su propio respaldo en la nube.</Text>
    </> : <>
      <GlassCard><View style={styles.row}><Ionicons name="git-compare-outline" color={theme.primary} size={24} /><Text style={[styles.section, text]}>Comparar una pose</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>{BODY_POSES.map(p => <View key={p.id}>{button(p.title, () => { setPoseFilter(p.id); setSelected([]); }, poseFilter === p.id)}</View>)}</ScrollView>
        <Text style={[styles.hint, muted]}>Selecciona dos fechas de la misma pose. {selected.length}/2 seleccionadas.</Text>
        <ScrollView horizontal contentContainerStyle={styles.row}>{photos.filter(p => p.pose === poseFilter).sort((a, b) => a.day.localeCompare(b.day)).map(p => <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Foto del ${dayLabel(p.day)}`} accessibilityState={{ selected: selected.some(s => s.id === p.id) }} onPress={() => setSelected(current => current.some(s => s.id === p.id) ? current.filter(s => s.id !== p.id) : current.length < 2 ? [...current, p] : [current[0], p])} style={[styles.thumbnail, { borderColor: selected.some(s => s.id === p.id) ? theme.primary : theme.glassBorder }]}><Image source={{ uri: p.uri }} style={styles.thumbnailImage} /><Text style={text}>{dayLabel(p.day)}</Text></Pressable>)}</ScrollView>
        {photos.filter(p => p.pose === poseFilter).length < 2 && <Text style={[styles.hint, muted]}>Necesitas fotos de esta pose en dos días distintos para comparar.</Text>}
        {button('Comparar fotos', () => setCompare(true), true, selected.length !== 2)}
      </GlassCard>
      {!history.length && !loading && <GlassCard><Text style={[styles.section, text]}>Tu historia empieza con un registro</Text><Text style={muted}>Puedes comenzar solo con tu peso o una foto.</Text>{button('Registrar hoy', () => setTab('today'))}</GlassCard>}
      {history.map(group => <GlassCard key={group.day}><Text style={[styles.section, text]}>{dayLabel(group.day)}</Text>
        {group.metrics.map(m => <View key={m.id} style={styles.metricRow}><Text style={[styles.metricLabel, text]}>{anthropometricByType[m.metricType]?.label ?? m.metricType}</Text><Text style={text}>{m.value} {m.unit}</Text></View>)}
        {new Set(group.metrics.map(m => m.metricType)).size < group.metrics.length && <Text style={[styles.hint, muted]}>Se conservan las mediciones históricas repetidas de esta fecha.</Text>}
        {group.photos.map(p => <View key={p.id} style={styles.metricRow}><Image source={{ uri: p.uri }} style={styles.smallImage} /><Text style={[styles.metricLabel, text]}>{BODY_POSES.find(x => x.id === p.pose)?.title}</Text>{button('Eliminar foto', () => confirmDelete([], [p.id]), false, busy)}</View>)}
        {button('Eliminar registro', () => confirmDelete(group.metrics.map(m => m.id), group.photos.map(p => p.id)), false, busy || loading)}
      </GlassCard>)}
    </>}
  </ScrollView>{camera && <BodyCamera owner={owner} pose={camera} onClose={() => setCamera(null)} onSaved={() => { setCamera(null); void load(); }} />}{compare && selected.length === 2 && <PhotoComparison photos={selected as [BodyPhoto, BodyPhoto]} onClose={() => setCompare(false)} />}</SafeAreaView></ThemeBackground>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, content: { padding: 20, paddingBottom: 48, gap: 16 }, eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5 }, title: { fontSize: 32, fontWeight: '900' }, subtitle: { fontSize: 15, lineHeight: 23 }, section: { fontSize: 20, fontWeight: '800', marginBottom: 8 }, hint: { fontSize: 13, lineHeight: 20, marginVertical: 8 }, row: { flexDirection: 'row', gap: 10, alignItems: 'center' }, button: { minHeight: 48, padding: 14, marginVertical: 4, borderWidth: 1, borderRadius: 14, justifyContent: 'center' }, buttonText: { fontSize: 14, fontWeight: '700' }, space: { marginTop: 16 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, pose: { width: '48%', flexGrow: 1, borderWidth: 1, borderRadius: 20, padding: 14, overflow: 'hidden' }, poseArt: { height: 170, marginBottom: 12, overflow: 'hidden', borderRadius: 12 }, poseTitle: { fontSize: 17, fontWeight: '800' }, thumbnail: { borderWidth: 3, padding: 6, borderRadius: 12, gap: 6 }, thumbnailImage: { width: 100, height: 130, borderRadius: 8 }, metricRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }, metricLabel: { flex: 1, fontSize: 14 }, smallImage: { width: 48, height: 64, borderRadius: 8 } });
