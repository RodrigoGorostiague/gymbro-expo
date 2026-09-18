import React, { memo, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import { bodyFront } from '../constants/bodyMap/bodyFront';
import { bodyBack } from '../constants/bodyMap/bodyBack';
import { bodyFemaleFront } from '../constants/bodyMap/bodyFemaleFront';
import { bodyFemaleBack } from '../constants/bodyMap/bodyFemaleBack';
import { BodyRegion, bodyRegionForSlug } from '../constants/bodyMapMapping';
import { BodyMapEntry, BodyMapMetric, BodyMapProjection, bodyColorLevel, bodyMetricValue } from '../utils/bodyMapProjection';
import { HapticPressable } from './HapticPressable';

export const bodyGeometry = { a: { front: bodyFront, back: bodyBack }, b: { front: bodyFemaleFront, back: bodyFemaleBack } };
const boxes = { a: { front: '0 80 724 1310', back: '724 80 724 1310' }, b: { front: '-50 -40 734 1538', back: '756 0 774 1448' } };
const INTENSITIES = [0.3, 0.5, 0.75, 1];
const metricLabels: Record<BodyMapMetric, string> = { volume: 'Volumen', frequency: 'Días', rir: 'RIR', rpe: 'RPE' };
export const formatBodyValue = (value: number) => Number.isInteger(value) ? String(value) : value.toLocaleString('es', { maximumFractionDigits: 1 });
export type BodyMapPalette = { primary: string; secondary: string; text: string; textMuted: string; glassBorder: string; glass: string };
export function bodyAppearance(entry: BodyMapEntry | undefined, projection: BodyMapProjection, metric: BodyMapMetric, max: number, palette: BodyMapPalette) {
  const value = entry ? bodyMetricValue(entry, metric) : null;
  const level = bodyColorLevel(value, metric, max);
  const opacity = projection.mode === 'participation' && entry?.value ? entry.role === 'Principal' ? 1 : entry.role === 'Secundario' ? .5 : .3 : level ? INTENSITIES[level - 1] : .25;
  return { fill: level || (projection.mode === 'participation' && entry?.value) ? palette.primary : palette.glassBorder, opacity };
}
function fillFor(entry: BodyMapEntry | undefined, projection: BodyMapProjection, metric: BodyMapMetric, max: number, palette: BodyMapPalette) {
  return bodyAppearance(entry, projection, metric, max, palette).fill;
}
const BodyCanvas = memo(function BodyCanvas({ shape, side, projection, metric, max, selected, onSelect, compact, palette }: {
  shape: 'a' | 'b'; side: 'front' | 'back'; projection: BodyMapProjection; metric: BodyMapMetric; max: number;
  selected: readonly BodyRegion[]; onSelect?: (id: BodyRegion) => void; compact: boolean; palette: BodyMapPalette;
}) {
  const byId = useMemo(() => new Map(projection.entries.map((entry) => [entry.id, entry])), [projection]);
  return <View style={[styles.figure, compact && styles.compactFigure]}>
    <Svg width="100%" height={compact ? 150 : 285} viewBox={boxes[shape][side]} accessible={false} aria-hidden={true} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {bodyGeometry[shape][side].flatMap((part) => {
        const region = bodyRegionForSlug(part.slug);
        const entry = region ? byId.get(region) : undefined;
        const active = !!region && selected.includes(region);
        return Object.values(part.path).flat().map((path, index) => <Path key={`${part.slug}-${index}`} d={path}
          fill={fillFor(entry, projection, metric, max, palette)}
          fillOpacity={bodyAppearance(entry, projection, metric, max, palette).opacity}
          stroke={active ? palette.text : palette.glassBorder} strokeWidth={active ? 5 : 1.5}
          onPress={region && onSelect ? () => onSelect(region) : undefined} />);
      })}
    </Svg>
    <Text style={[styles.viewLabel, { color: palette.textMuted }]}>{side === 'front' ? 'FRENTE' : 'ESPALDA'}</Text>
  </View>;
});

export function MuscleBodyMap({ projection, title = 'Mapa muscular', compact = false, scaleMax, palette: override, selectedRegions, onSelectRegion, shape: controlledShape, onShapeChange, showRegionList = true }: {
  projection: BodyMapProjection; title?: string; compact?: boolean; scaleMax?: number; palette?: Partial<BodyMapPalette>; selectedRegions?: readonly BodyRegion[]; onSelectRegion?: (id: BodyRegion) => void; shape?: 'a' | 'b'; onShapeChange?: (shape: 'a' | 'b') => void; showRegionList?: boolean;
}) {
  const { theme } = useTheme();
  const palette: BodyMapPalette = {
    primary: theme.primary ?? '#7C3AED', secondary: theme.secondary ?? '#22D3EE', text: theme.text ?? '#FFFFFF',
    textMuted: theme.textMuted ?? '#94A3B8', glassBorder: theme.glassBorder ?? '#64748B', glass: theme.glass ?? 'transparent', ...override,
  };
  const [localShape, setLocalShape] = useState<'a' | 'b'>('a');
  const shape = controlledShape ?? localShape;
  const setShape = (value: 'a' | 'b') => { setLocalShape(value); onShapeChange?.(value); };
  const [view, setView] = useState<'both' | 'front' | 'back'>('both');
  const [selected, setSelected] = useState<BodyRegion | null>(null);
  const [requestedMetric, setMetric] = useState<BodyMapMetric>('volume');
  const [expanded, setExpanded] = useState(false);
  const [allRegions, setAllRegions] = useState(false);
  const isCompact = compact && !expanded;
  const metrics: BodyMapMetric[] = !showRegionList ? ['volume'] : (projection.mode === 'completed' || projection.mode === 'volume-summary') ? ['volume', 'frequency', 'rir', 'rpe'] : projection.mode === 'shared-sets' ? ['volume', 'rir', 'rpe'] : ['volume'];
  const metric = metrics.includes(requestedMetric) ? requestedMetric : 'volume';
  const values = projection.entries.map((entry) => bodyMetricValue(entry, metric));
  const max = metric === 'volume' ? Math.max(1, scaleMax ?? 0, ...values.map((value) => value ?? 0)) : Math.max(1, ...values.map((value) => value ?? 0));
  const activeEntries = projection.entries.filter((entry) => entry.value > 0);
  const focused = projection.entries.find((entry) => entry.id === selected);
  const unit = metric === 'volume' ? projection.unit : metric === 'frequency' ? 'Días con entrenamiento' : `${metric.toUpperCase()} medio registrado`;
  const toggle = (id: BodyRegion) => { setSelected((current) => current === id ? null : id); onSelectRegion?.(id); };
  const chip = (label: string, chosen: boolean, action: () => void) => <HapticPressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: chosen }} onPress={action} style={[styles.control, { borderColor: chosen ? palette.primary : palette.glassBorder, backgroundColor: chosen ? palette.glass : 'transparent' }]}><Text style={{ color: chosen ? palette.primary : palette.textMuted, fontSize: 12, fontWeight: '700' }}>{label}</Text></HapticPressable>;
  const numeric = (entry: BodyMapEntry) => {
    if (projection.mode === 'participation') return entry.value > 0 ? entry.role : 'Sin participación registrada';
    const value = bodyMetricValue(entry, metric);
    return value === null ? 'Sin registro' : formatBodyValue(value);
  };
  return <View testID="muscle-body-map" style={[styles.card, { borderColor: palette.glassBorder, backgroundColor: palette.glass }]}>
    <View style={styles.heading}><View style={{ flex: 1, gap: 4 }}><Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>{title}</Text><Text style={[styles.subtitle, { color: palette.textMuted }]}>{unit}{projection.period ? ` · ${projection.period}` : ''}</Text></View><View style={[styles.counter, { borderColor: palette.glassBorder }]}><Text style={{ color: palette.text, fontWeight: '800' }}>{activeEntries.length}</Text><Text style={{ color: palette.textMuted, fontSize: 10 }}>zonas</Text></View></View>
    {!isCompact && <>
      {metrics.length > 1 && <View style={styles.controls}>{metrics.map((key) => chip(metricLabels[key], metric === key, () => setMetric(key)))}</View>}
      <View style={styles.controls}>{chip('Ambas vistas', view === 'both', () => setView('both'))}{chip('Frente', view === 'front', () => setView('front'))}{chip('Espalda', view === 'back', () => setView('back'))}</View>
    </>}
    <View style={styles.bodies}>{(isCompact || view === 'both' ? ['front', 'back'] as const : [view] as ('front' | 'back')[]).map((side) => <BodyCanvas key={side} shape={shape} side={side} projection={projection} metric={metric} max={max} selected={isCompact ? [] : selectedRegions ?? (selected ? [selected] : [])} onSelect={isCompact ? undefined : toggle} compact={isCompact} palette={palette} />)}</View>
    {projection.mode === 'participation' ? <View style={styles.legend}>{(['Principal', 'Secundario', 'Rol sin especificar'] as const).map((label, index) => <View key={label} style={styles.legendItem}><View style={[styles.dot, { backgroundColor: palette.primary, opacity: [1, .5, .3][index] }]} /><Text style={{ color: palette.textMuted, fontSize: 11 }}>{label}</Text></View>)}</View> : <View style={styles.scale}><View style={styles.scaleBar}>{INTENSITIES.map((opacity) => <View key={opacity} style={[styles.scaleStep, { backgroundColor: palette.primary, opacity }]} />)}</View><View style={styles.scaleLabels}><Text style={{ color: palette.textMuted, fontSize: 11 }}>{metric === 'rir' ? '5 RIR · menor esfuerzo' : metric === 'rpe' ? '6 RPE' : 'Menor cantidad'}</Text><Text style={{ color: palette.textMuted, fontSize: 11 }}>{metric === 'rir' ? '0 RIR · mayor esfuerzo' : metric === 'rpe' ? '10 RPE' : `${formatBodyValue(max)} · máximo de la vista`}</Text></View></View>}
    {!activeEntries.length && <Text style={{ color: palette.textMuted }}>Todavía no hay actividad representable en esta vista.</Text>}
    {!isCompact && <>
      <View style={styles.controls}>{chip('Silueta A', shape === 'a', () => setShape('a'))}{chip('Silueta B', shape === 'b', () => setShape('b'))}</View>
      <Text style={[styles.subtitle, { color: palette.textMuted }]}>Toca una zona o elige su nombre para explorar. Las zonas agrupan músculos; ambos lados muestran el mismo registro.</Text>
      {showRegionList && <><View style={styles.regions}>{(allRegions ? projection.entries : activeEntries).map((entry) => <HapticPressable key={entry.id} accessibilityLabel={`${entry.label}: ${numeric(entry)}${projection.mode === 'participation' ? '' : ` ${unit}`}`} accessibilityState={{ selected: selected === entry.id }} onPress={() => toggle(entry.id)} style={[styles.region, { borderColor: selected === entry.id ? palette.primary : palette.glassBorder }]}><View style={[styles.dot, { backgroundColor: fillFor(entry, projection, metric, max, palette) }]} /><Text style={{ flex: 1, color: palette.text, fontSize: 12 }}>{entry.label}</Text><Text style={{ color: palette.textMuted, fontSize: 12 }}>{numeric(entry)}</Text></HapticPressable>)}</View>
      <HapticPressable onPress={() => setAllRegions(!allRegions)} accessibilityLabel={allRegions ? 'Mostrar solo zonas activas' : 'Mostrar todas las zonas'} style={styles.link}><Text style={{ color: palette.primary }}>{allRegions ? 'Solo zonas activas' : 'Ver todas las zonas'}</Text></HapticPressable>
      {focused && <View accessibilityLiveRegion="polite" style={[styles.detail, { borderColor: palette.primary }]}><Text style={[styles.title, { color: palette.text }]}>{focused.label}</Text><Text style={{ color: palette.text }}>{numeric(focused)}{projection.mode === 'participation' ? '' : ` · ${unit}`}</Text>
        {(projection.mode === 'planned' || projection.mode === 'completed' || projection.mode === 'volume-summary') && <Text style={{ color: palette.textMuted }}>{formatBodyValue(focused.direct)} directas · {formatBodyValue(focused.indirect)} indirectas{focused.unspecified ? ` · ${formatBodyValue(focused.unspecified)} sin rol` : ''}{projection.mode === 'volume-summary' ? ' en el período' : ''}</Text>}
        {(metric === 'rir' || metric === 'rpe') && <Text style={{ color: palette.textMuted }}>{focused[metric].count} de {focused.effortSets} registros de serie con {metric.toUpperCase()}. No se usa el esfuerzo planificado.</Text>}
        <Text style={{ color: palette.textMuted }}>{focused.sources.length ? `Grupos: ${focused.sources.join(' · ')}` : 'Sin actividad registrada para esta zona.'}</Text>
        {focused.exercises.length > 0 && <Text style={{ color: palette.textMuted }}>{focused.exercises.join(' · ')}</Text>}
      </View>}
      </>}{(projection.mode === 'planned' || projection.mode === 'completed') && <Text style={[styles.note, { color: palette.textMuted }]}>Color = series × relevancia del catálogo (máximo por zona y ejercicio). Sin calentamientos; cada bloque drop cuenta una vez. Sin ponderación disponible se cuentan asociaciones con rol no especificado. Más color no significa mejor entrenamiento.</Text>}
      {projection.mode === 'volume-summary' && <Text style={[styles.note, { color: palette.textMuted }]}>Volumen registrado: directas + ½ indirectas, como promedio semanal. Los grupos amplios colorean varias zonas sin atribuirles trabajo individual. En zonas superpuestas se muestra el grupo de mayor volumen.</Text>}
      {projection.mode === 'shared-sets' && <Text style={[styles.note, { color: palette.textMuted }]}>Solo series completadas del resumen. Este registro no distingue calentamientos, bloques drop ni roles musculares.</Text>}
      {projection.mode === 'distribution' && <Text style={[styles.note, { color: palette.textMuted }]}>Distribución compartida por grupos. Si varios grupos se superponen, la zona muestra el mayor valor; no equivale a series ni a esfuerzo.</Text>}
    </>}
    {projection.unmapped.length > 0 && <Text style={[styles.note, { color: palette.textMuted }]}>Sin región superficial específica: {projection.unmapped.join(' · ')}.</Text>}
    {projection.missingSessions > 0 && <Text style={[styles.note, { color: palette.textMuted }]}>Cobertura parcial: {projection.missingSessions} sesiones sin rutina disponible.</Text>}
    {compact && <HapticPressable accessibilityLabel={expanded ? 'Contraer mapa muscular' : 'Explorar mapa muscular'} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.link}><Text style={{ color: palette.primary, fontWeight: '700' }}>{expanded ? 'Contraer mapa' : 'Explorar mapa muscular'}</Text></HapticPressable>}
  </View>;
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 22, padding: 16, gap: 12, overflow: 'hidden' },
  heading: { flexDirection: 'row', gap: 10, alignItems: 'center' }, title: { fontSize: 18, fontWeight: '800' }, subtitle: { fontSize: 12, lineHeight: 18 },
  counter: { borderWidth: 1, borderRadius: 14, minWidth: 44, padding: 8, alignItems: 'center' }, controls: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  control: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, minHeight: 44, justifyContent: 'center' },
  bodies: { flexDirection: 'row', justifyContent: 'center', gap: 6 }, figure: { flex: 1, maxWidth: 190, alignItems: 'center' }, compactFigure: { maxWidth: 110 }, viewLabel: { fontSize: 10, letterSpacing: 1.6, fontWeight: '800', marginTop: 4 },
  legend: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 }, dot: { width: 9, height: 9, borderRadius: 5 },
  scale: { gap: 5 }, scaleBar: { flexDirection: 'row', height: 5, borderRadius: 4, overflow: 'hidden' }, scaleStep: { flex: 1 }, scaleLabels: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 5 },
  regions: { gap: 6 }, region: { flexDirection: 'row', alignItems: 'center', minHeight: 44, padding: 10, gap: 8, borderRadius: 12, borderWidth: 1 },
  detail: { gap: 7, borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 8 }, note: { fontSize: 11, lineHeight: 17 }, link: { minHeight: 44, justifyContent: 'center' },
});
