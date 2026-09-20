import { MuscleRankCard } from './MuscleRankCard';
import { loadMuscleMapMode, saveMuscleMapMode, type MuscleMapMode } from '../services/muscleMapPreference';
import { useBodyShape } from '../context/BodyShapeContext';
import { MuscleBodyMap } from './MuscleBodyMap';
import { projectVolumeBody, VOLUME_BODY_REGIONS } from '../utils/bodyMapProjection';
import { useDirtyExitGuard } from '../hooks/useDirtyExitGuard';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import type { AppTheme, WorkoutAttempt } from '../types';
import { deriveMuscleVolume, muscleVolumeScale, MUSCLE_VOLUME_AXES, type MuscleVolume, type VolumeDays, weeklyVolumeEntries } from '../utils/muscleVolume';
import { getProfileMuscleVolume, saveMuscleVolumeGoals } from '../services/muscleVolume';
import { MuscleRegionGlyph } from './MuscleRegionGlyph';

const number = (value: number) => value.toLocaleString('es-AR', { maximumFractionDigits: 1 });
const date = (value: string) => new Date(value).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

type MuscleMapProps = { subjectId: string; own?: boolean; attempts?: readonly WorkoutAttempt[]; palette?: AppTheme; revision?: number; localAvailable?: boolean };
export function MuscleVolumeCard(props: MuscleMapProps) {
  const { theme } = useTheme(); const colors = props.palette ?? theme;
  const [mode, setMode] = useState<MuscleMapMode>('volume');
  const [preview, setPreview] = useState(false), [editing, setEditing] = useState(false);
  const [preferenceError, setPreferenceError] = useState(false);
  const chosen = useRef(false);
  useEffect(() => {
    let active = true;
    void loadMuscleMapMode().then(value => { if (active && !chosen.current) setMode(value); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const select = (value: MuscleMapMode) => {
    chosen.current = true; setMode(value); setPreferenceError(false);
    void saveMuscleMapMode(value).catch(() => setPreferenceError(true));
  };
  return <View style={styles.container}>
    <View style={styles.row}>{(['volume', 'ranked'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value === 'volume' ? 'Mapa de volumen' : 'Mapa Ranked'} accessibilityState={{ selected: mode === value, disabled: editing }} disabled={editing} onPress={() => select(value)} style={[styles.button, { borderColor: colors.glassBorder, backgroundColor: mode === value ? colors.primary : colors.glass }]}><Text style={{ color: mode === value ? colors.onPrimary : colors.text, fontWeight: '800' }}>{value === 'volume' ? 'Volumen' : 'Ranked'}</Text></Pressable>)}</View>
    {preferenceError ? <Text style={{ color: colors.textMuted }}>No se pudo recordar el tipo de mapa en este dispositivo.</Text> : null}
    {props.own ? <Pressable accessibilityRole="button" disabled={editing} accessibilityState={{ disabled: editing }} onPress={() => setPreview(!preview)} style={[styles.button, { borderColor: colors.glassBorder }]}><Text style={{ color: colors.primary }}>{preview ? 'Volver a mi vista' : 'Ver como otros'}</Text></Pressable> : null}
    {mode === 'ranked' ? <MuscleRankCard key={`${props.subjectId}:${preview}`} subjectId={props.subjectId} own={!!props.own} preview={preview} palette={props.palette} revision={props.revision ?? 0} /> : <VolumeMapContent {...props} preview={preview} onEditingChange={setEditing} />}
  </View>;
}
function VolumeMapContent({ subjectId, own = false, attempts = [], palette, revision = 0, localAvailable = true, preview, onEditingChange }: MuscleMapProps & { preview: boolean; onEditingChange: (editing: boolean) => void }) {
  const { theme } = useTheme(); const colors = palette ?? theme;
  const [days, setDays] = useState<VolumeDays>(28);
  const [local, setLocal] = useState(false);
  useEffect(() => { setLocal(false); }, [preview]);
  const [loaded, setLoaded] = useState<MuscleVolume | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const request = useRef(0);
  const [comparison, setComparison] = useState<'none' | 'previous' | 'goal'>('previous');
  const [editing, setEditing] = useState(false); const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string,string>>({}); const [share, setShare] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const shape = useBodyShape();
  useDirtyExitGuard(editing, saving);
  useEffect(() => { onEditingChange(editing); }, [editing, onEditingChange]);
  const [goalError, setGoalError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const id = ++request.current; setLoading(true); setError(null); setLoaded(null); setNow(Date.now());
    try { const next = await getProfileMuscleVolume(subjectId,days,preview); if (id === request.current) setLoaded(next); }
    catch (e) { if (id === request.current) setError(e instanceof Error ? e.message : 'No se pudo cargar la distribución.'); }
    finally { if (id === request.current) setLoading(false); }
  }, [subjectId,days,preview,revision]);
  useFocusEffect(useCallback(() => { void refresh(); return () => { request.current++; }; }, [refresh]));
  const provisional = own && localAvailable && !preview && (local || !!error);
  const volume = useMemo(() => provisional ? { ...deriveMuscleVolume(attempts,subjectId,days,now), goals: loaded?.goals ?? {}, shareGoals: loaded?.shareGoals ?? false } : loaded, [provisional,attempts,subjectId,days,now,loaded]);
  const current = volume ? weeklyVolumeEntries(volume) : [];
  const previous = volume ? weeklyVolumeEntries(volume,true) : [];
  const goals = current.map(axis => ({ ...axis, value: volume?.goals[axis.id] ?? 0 }));
  const max = volume ? muscleVolumeScale(volume) : 5;
  const projection = volume ? projectVolumeBody(volume) : null;
  const button = (label: string, selected: boolean, onPress: () => void, disabled = false) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={[styles.button, { backgroundColor: selected ? colors.primary : colors.glass, borderColor: colors.glassBorder, opacity: disabled ? .5 : 1 }]}><Text style={{ color: selected ? colors.onPrimary : colors.text, fontWeight: '700' }}>{label}</Text></Pressable>;
  const beginEdit = () => { setDraft(Object.fromEntries(Object.entries(loaded?.goals ?? {}).map(([id,v]) => [id,String(v)]))); setShare(loaded?.shareGoals ?? false); setGoalError(null); setEditing(true); };
  const save = async () => {
    const goals: Record<string,number> = {};
    for (const [id,text] of Object.entries(draft)) {
      if (!text.trim()) continue;
      const value = Number(text.replace(',','.'));
      if (!/^\d+(?:[.,]\d+)?$/.test(text.trim()) || !Number.isFinite(value) || value < 0 || value > 100) { setGoalError('Usá valores entre 0 y 100 series por semana, o dejá el campo vacío.'); return; }
      goals[id] = value;
    }
    setSaving(true); setGoalError(null);
    try { await saveMuscleVolumeGoals(goals,share); setEditing(false); await refresh(); }
    catch (e) { setGoalError(e instanceof Error ? e.message : 'No se guardaron los objetivos.'); }
    finally { setSaving(false); }
  };
  return <View style={styles.container}>
    <View><Text style={[styles.eyebrow,{color:colors.primary}]}>TU VOLUMEN · MÚSCULO A MÚSCULO</Text><Text accessibilityRole="header" style={[styles.title,{color:colors.text}]}>Distribución muscular</Text><Text style={[styles.copy,{color:colors.textMuted}]}>Series directas + ½ indirectas. Una estimación del trabajo registrado.</Text></View>
    <View style={styles.row}>{([7,28,90] as const).map(n => button(`${n} días`,days===n,() => { setLoaded(null); setLoading(true); setDays(n); },editing))}</View>
    {own ? <View style={styles.row}>{!preview ? button(local ? 'Ver sincronizado' : 'Incluir registros locales',local,() => setLocal(!local),editing || !localAvailable) : null}</View> : null}
    {preview ? <Text style={{color:colors.textMuted}}>Vista compartida con tus conexiones. Usa las preferencias guardadas.</Text> : null}
    {loading ? <Text accessibilityLiveRegion="polite" style={{color:colors.textMuted}}>Cargando distribución…</Text> : error ? <View style={styles.container}><Text accessibilityRole="alert" style={{color:colors.text}}>No pudimos consultar la distribución compartida. {error}</Text>{button('Reintentar',false,() => void refresh())}</View> : !volume ? <Text style={{color:colors.textMuted}}>La distribución muscular no está compartida.</Text> : null}
    {!loading && volume ? <>
      <View style={[styles.summary,{borderColor:colors.glassBorder,backgroundColor:colors.glass}]}><Text style={[styles.metric,{color:colors.text}]}>{number(volume.current.eligibleSets)} series de trabajo</Text><Text style={{color:colors.textMuted}}>{date(volume.current.start)} – {date(volume.current.end)} · corte UTC</Text><Text style={{color:colors.textMuted}}>Gráfico y barras: promedio semanal sobre {days} días.</Text></View>
      <Text style={[styles.copy,{color:colors.textMuted}]}>{provisional ? 'Vista local provisional: puede diferir de lo compartido hasta sincronizar. ' : `Datos sincronizados al ${new Date(volume.asOf).toLocaleString('es-AR')}. `}Basado en registros disponibles; cobertura histórica no verificada.</Text>
      <View style={styles.row}>{button('Sin comparación',comparison==='none',() => setComparison('none'))}{button('Período anterior',comparison==='previous',() => setComparison('previous'))}{Object.keys(volume.goals).length ? button('Objetivo',comparison==='goal',() => setComparison('goal')) : null}</View>
      <MuscleBodyMap projection={projection!} title="Mapa muscular" scaleMax={max} palette={colors} shape={shape} showRegionList={false} selectedRegions={selected ? VOLUME_BODY_REGIONS[selected] : []} onSelectRegion={region => {
        const candidates = current.filter(axis => VOLUME_BODY_REGIONS[axis.id]?.includes(region)).sort((a,b) => b.value-a.value);
        const id = candidates[0]?.id; if (id) setSelected(selected === id ? null : id);
      }} />
      {comparison !== 'none' && <Text style={{color:colors.textMuted}}>La marca en cada barra indica {comparison === 'goal' ? 'el objetivo semanal' : 'el período anterior'}.</Text>}
      {comparison === 'goal' && goals.some(a => a.value > max) ? <Text style={{color:colors.textMuted}}>Los objetivos que superan la escala se marcan en el extremo; su valor completo aparece abajo.</Text> : null}
      <Text style={[styles.copy,{color:colors.textMuted}]}>Más intensidad indica más volumen registrado, no mayor crecimiento muscular. Cada grupo reúne músculos; no implica que todos hayan trabajado por igual.</Text>
      <View style={styles.container}>{volume.current.axes.map((axis,index) => {
        const value = current[index].value; const before = previous[index].value; const goal = volume.goals[axis.id];
        return <View key={axis.id} style={[styles.axis,{borderColor:colors.glassBorder}]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Detalle de ${axis.label}`} accessibilityState={{expanded:selected===axis.id}} onPress={() => setSelected(selected===axis.id?null:axis.id)} style={[styles.between,{minHeight:44}]}><MuscleRegionGlyph axisId={axis.id} projection={projection!} max={max} palette={colors} shape={shape} /><Text style={[styles.axisTitle,{color:colors.text,flex:1}]}>{axis.label}</Text><Text style={[styles.axisTitle,{color:colors.primary}]}>{number(value)} /sem {selected===axis.id?'−':'+'}</Text></Pressable>
          <View accessible accessibilityRole="summary" accessibilityLabel={`${axis.label}: ${number(value)} series equivalentes por semana; ${axis.direct} directas y ${axis.indirect} indirectas en ${days} días.`} style={[styles.track,{backgroundColor:colors.glassBorder}]}><View style={{width:`${value/max*100}%`,height:7,backgroundColor:colors.primary,borderRadius:4}} />{comparison !== 'none' && (comparison === 'previous' || goal !== undefined) ? <View testID={`comparison-${axis.id}`} style={{position:'absolute',left:`${Math.min(100, (comparison === 'previous' ? before : goal!)/max*100)}%`,marginLeft:-2,width:3,height:7,backgroundColor:colors.text}} /> : null}</View>
          <Text style={[styles.copy,{color:colors.textMuted}]}>{axis.direct} directas · {axis.indirect} indirectas · {axis.days} días (UTC)</Text>
          <Text style={[styles.copy,{color:colors.textMuted}]}>Anterior: {number(before)}/sem · cambio {value-before>0?'+':''}{number(value-before)}/sem{goal!==undefined ? ` · objetivo ${number(goal)}/sem` : ''}</Text>
          {selected === axis.id ? <Text style={[styles.copy,{color:colors.textMuted}]}>Esfuerzo: {axis.effortCount}/{axis.direct+axis.indirect} series{axis.rirCount ? ` · RIR ${number(axis.rirSum/axis.rirCount)} (${axis.rirCount})` : ''}{axis.rpeCount ? ` · RPE ${number(axis.rpeSum/axis.rpeCount)} (${axis.rpeCount})` : ''}</Text> : null}
        </View>;
      })}</View>
      <Text style={[styles.copy,{color:colors.textMuted}]}>Esfuerzo registrado: {volume.current.effortCount}/{volume.current.eligibleSets} series. {volume.current.unclassifiedSets} series con músculos sin clasificar. {volume.current.unsupportedSets} registros por tiempo o técnicas sin equivalencia, excluidos. Cada grupo de drop sets cuenta una vez; se usa el esfuerzo del primer segmento válido.</Text>
      {own && !preview && !editing ? button('Editar objetivos semanales',false,beginEdit,!!error || local) : null}
    </> : null}
    {own && !preview && editing ? <View style={[styles.summary,{borderColor:colors.glassBorder}]}>
      <Text accessibilityRole="header" style={[styles.axisTitle,{color:colors.text}]}>Tus objetivos · series equivalentes/semana</Text><Text style={{color:colors.textMuted}}>Borrador. Vacío significa sin objetivo. Elegí metas acordes a tu plan; no hay un reparto ideal universal.</Text>
      {MUSCLE_VOLUME_AXES.map(axis => <View key={axis.id} style={styles.between}><Text style={{color:colors.text,flex:1}}>{axis.label}</Text><TextInput accessibilityLabel={`Objetivo semanal ${axis.label}`} keyboardType="decimal-pad" editable={!saving} value={draft[axis.id]??''} placeholder="Sin objetivo" placeholderTextColor={colors.textMuted} onChangeText={value => setDraft(old => ({...old,[axis.id]:value}))} style={[styles.input,{color:colors.text,borderColor:colors.glassBorder}]} /></View>)}
      <View style={styles.between}><Text style={{color:colors.text,flex:1}}>Compartir objetivos con mis conexiones</Text><Switch accessibilityLabel="Compartir objetivos musculares" value={share} disabled={saving} onValueChange={setShare} /></View>
      {goalError ? <Text accessibilityRole="alert" style={{color:colors.text}}>{goalError}</Text> : null}
      <View style={styles.row}>{button(saving?'Guardando…':'Guardar objetivos',true,() => void save(),saving)}{button('Cancelar objetivos',false,() => setEditing(false),saving)}</View>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({ container:{gap:14},row:{flexDirection:'row',flexWrap:'wrap',gap:8},between:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},title:{fontSize:23,fontWeight:'900',marginVertical:6},eyebrow:{fontSize:10,fontWeight:'800',letterSpacing:1.2},copy:{fontSize:12,lineHeight:18},button:{minHeight:44,paddingHorizontal:12,paddingVertical:12,borderWidth:1,borderRadius:14,justifyContent:'center'},summary:{padding:14,borderWidth:1,borderRadius:16,gap:8},metric:{fontSize:22,fontWeight:'900'},axis:{borderTopWidth:1,paddingTop:12,gap:6},axisTitle:{fontSize:14,fontWeight:'800',flexShrink:1},track:{height:7,borderRadius:4,overflow:'hidden'},input:{borderWidth:1,borderRadius:10,minHeight:44,width:110,padding:10} });
