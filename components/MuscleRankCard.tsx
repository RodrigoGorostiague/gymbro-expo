import React, { useCallback, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import type { AppTheme } from '../types';
import { getProfileMuscleRanks, setMuscleRankPause } from '../services/muscleRank';
import { MUSCLE_RANKS, muscleRankIndex } from '../constants/muscleRanks';
import { MUSCLE_VOLUME_AXES } from '../utils/muscleVolume';
import type { MuscleRanks } from '../utils/muscleRank';
import { projectRankBody, VOLUME_BODY_REGIONS } from '../utils/bodyMapProjection';
import { MuscleBodyMap } from './MuscleBodyMap';
import { MuscleRankInfo } from './MuscleRankInfo';

export function MuscleRankCard({ subjectId, own, preview, palette, revision }: { subjectId: string; own: boolean; preview: boolean; palette?: AppTheme; revision: number }) {
  const { theme } = useTheme(); const colors = palette ?? theme;
  const [result, setResult] = useState<{ subjectId: string; preview: boolean; ranks: MuscleRanks | null } | null>(null);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null), [saveError, setSaveError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const request = useRef(0), mounted = useRef(false), pauseInFlight = useRef(false);
  const refresh = useCallback(async () => {
    const id = ++request.current; setResult(null); setLoading(true); setError(null);
    try { const ranks = await getProfileMuscleRanks(subjectId, preview); if (request.current === id && mounted.current) setResult({ subjectId, preview, ranks }); }
    catch (e) { if (request.current === id && mounted.current) setError(e instanceof Error ? e.message : 'No se pudieron consultar los rangos.'); }
    finally { if (request.current === id && mounted.current) setLoading(false); }
  }, [subjectId, preview, revision]);
  useFocusEffect(useCallback(() => {
    mounted.current = true; void refresh();
    // Refresh on resume and each UTC boundary, without mutating stored points.
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => { timer = setTimeout(() => { void refresh(); schedule(); }, 86400000 - Date.now() % 86400000 + 100); };
    schedule();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { mounted.current = false; request.current++; clearTimeout(timer); subscription.remove(); };
  }, [refresh]));
  const ranks = result?.subjectId === subjectId && result.preview === preview ? result.ranks : null;
  const projection = ranks ? projectRankBody(ranks) : null;
  const tomorrowPaused = !!ranks?.pauseStartsOn && !ranks.pauseEndsOn;
  const togglePause = async () => {
    if (pauseInFlight.current) return;
    pauseInFlight.current = true; setSaving(true); setSaveError(null);
    try { await setMuscleRankPause(!tomorrowPaused); if (mounted.current) await refresh(); }
    catch (e) { if (mounted.current) setSaveError(e instanceof Error ? e.message : 'No se pudo guardar la pausa.'); }
    finally { pauseInFlight.current = false; if (mounted.current) setSaving(false); }
  };
  const button = (label: string, action: () => void, disabled = false) => <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} onPress={action} style={[styles.button, { borderColor: colors.glassBorder }]}><Text style={{ color: colors.primary }}>{label}</Text></Pressable>;
  return <View style={styles.container}>
    <View style={styles.row}><View style={{ flex: 1 }}><Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Ranked muscular</Text><Text style={{ color: colors.textMuted }}>Un rango por grupo · constancia registrada</Text></View><MuscleRankInfo /></View>
    {loading ? <Text style={{ color: colors.textMuted }}>Cargando rangos…</Text> : error ? <View style={styles.container}><Text accessibilityRole="alert" style={{ color: colors.text }}>No pudimos consultar los rangos. {error}</Text>{button('Reintentar rangos', () => void refresh())}</View> : !ranks ? <Text style={{ color: colors.textMuted }}>El mapa muscular no está compartido.</Text> : null}
    {!loading && ranks && projection ? <>
      <Text style={{ color: colors.textMuted }}>{ranks.paused ? 'Pausa de recuperación activa · sin ganancias ni descenso.' : 'Rangos activos · siete días de protección por grupo.'}</Text>
      {ranks.pauseStartsOn && !ranks.paused ? <Text style={{ color: colors.textMuted }}>Pausa programada: {ranks.pauseStartsOn} a las 00:00 UTC.</Text> : null}
      {ranks.pauseEndsOn ? <Text style={{ color: colors.textMuted }}>Se retoma el {ranks.pauseEndsOn} a las 00:00 UTC.</Text> : null}
      {own && !preview ? <>{button(saving ? 'Guardando pausa…' : tomorrowPaused ? ranks.paused ? 'Retomar desde mañana (UTC)' : 'Cancelar pausa programada' : ranks.paused ? 'Mantener pausa' : 'Pausar desde mañana (UTC)', () => void togglePause(), saving)}{saveError ? <Text accessibilityRole="alert" style={{ color: colors.text }}>{saveError}</Text> : null}</> : null}
      <MuscleBodyMap projection={projection} title="Mapa Ranked" palette={colors} showRegionList={false} selectedRegions={selected ? VOLUME_BODY_REGIONS[selected] : []} onSelectRegion={region => {
        const id = projection.entries.find(e => e.id === region)?.rankAxisId;
        if (id) setSelected(current => current === id ? null : id);
      }} />
      <View style={styles.legend}>{MUSCLE_RANKS.map((rank, i) => <View key={rank.name} style={styles.legendItem}><View style={[styles.dot, { backgroundColor: rank.color }]} /><Text style={{ color: colors.textMuted }}>{i + 1}. {rank.name}</Text></View>)}</View>
      {ranks.axes.map(axis => {
        const label = MUSCLE_VOLUME_AXES.find(a => a.id === axis.id)!.label;
        const index = muscleRankIndex(axis.xp), rank = MUSCLE_RANKS[index], next = MUSCLE_RANKS[index + 1];
        const progress = next ? (axis.xp - rank.xp) / (next.xp - rank.xp) : 1;
        return <View key={axis.id} style={[styles.axis, { borderColor: colors.glassBorder }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Rango de ${label}`} accessibilityState={{ expanded: selected === axis.id }} onPress={() => setSelected(selected === axis.id ? null : axis.id)} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: axis.lastActivity ? rank.color : colors.glassBorder }]} /><Text style={{ color: colors.text, fontWeight: '800', flex: 1 }}>{label}</Text><Text style={{ color: colors.text }}>{axis.lastActivity ? `${index + 1}. ${rank.name}` : 'Sin registros'}</Text>
          </Pressable>
          {axis.lastActivity ? <>
            <View accessibilityRole="progressbar" accessibilityLabel={`Progreso de ${label}`} accessibilityValue={{ min: 0, max: next ? next.xp - rank.xp : 1000, now: next ? axis.xp - rank.xp : axis.xp - rank.xp, text: next ? `${axis.xp} de ${next.xp} XP para ${next.name}` : 'Rango máximo' }} style={[styles.track, { backgroundColor: colors.glassBorder }]}><View style={{ height: 7, width: `${Math.max(0, Math.min(1, progress)) * 100}%`, backgroundColor: rank.color }} /></View>
            <Text style={{ color: colors.textMuted }}>{axis.xp.toLocaleString('es-AR')} XP{next ? ` / ${next.xp.toLocaleString('es-AR')} para ${next.name}` : ' · rango máximo'}</Text>
          </> : null}
          {selected === axis.id ? <View style={styles.container}>
            <Text style={{ color: colors.textMuted }}>{axis.lastActivity ? `Última actividad registrada: ${axis.lastActivity} (UTC)` : 'Todavía no hay series válidas registradas.'}</Text>
            {axis.lastActivity ? <><Text style={{ color: colors.textMuted }}>Mejor rango del historial: {MUSCLE_RANKS[muscleRankIndex(axis.peakXp)].name}</Text><Text style={{ color: colors.textMuted }}>{ranks.paused ? 'Reloj de descenso pausado' : axis.protectionDays ? `Protección restante: ${axis.protectionDays} días` : 'Sin protección restante; el descuento se aplica desde el día 8.'}</Text><Text style={{ color: colors.textMuted }}>XP de hoy: {axis.earnedToday}/60 · últimos siete días: {axis.earnedSevenDays}/120</Text></> : null}
            {!VOLUME_BODY_REGIONS[axis.id]?.length ? <Text style={{ color: colors.textMuted }}>Región profunda: consultá su rango en esta fila.</Text> : null}
          </View> : null}
        </View>;
      })}
      <Text style={{ color: colors.textMuted }}>Historial sincronizado al {new Date(ranks.asOf).toLocaleString('es-AR')}. La falta de registros no demuestra falta de entrenamiento.</Text>
    </> : null}
  </View>;
}
const styles = StyleSheet.create({ container: { gap: 12 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, flexWrap: 'wrap' }, title: { fontSize: 23, fontWeight: '900' }, button: { borderWidth: 1, borderRadius: 14, padding: 12, minHeight: 44 }, axis: { borderTopWidth: 1, paddingTop: 10, gap: 8 }, track: { height: 7, borderRadius: 4, overflow: 'hidden' }, dot: { width: 12, height: 12, borderRadius: 4 }, legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 } });
