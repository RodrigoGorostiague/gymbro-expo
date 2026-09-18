import React from 'react';
import { Text, View } from 'react-native';
import { SimpleLineChart } from './LineChart';
import { MesocycleEvolution as Evolution, exposureEffortLabel } from '../utils/mesocycleEvolution';

export function MesocycleEvolution({ groups, finished, theme }: { groups: Evolution[]; finished: boolean; theme: { text: string; textMuted: string; glassBorder: string } }) {
  const delta = (value: number) => `${value > 0 ? '+' : ''}${Number(value.toFixed(1))}`;
  return <View style={{ gap: 16, marginTop: 16 }}>
    <Text style={{ color: theme.text, fontWeight: '800' }}>{finished ? 'Balance del mesociclo' : 'Evolución dentro del mesociclo'}</Text>
    <Text style={{ color: theme.textMuted }}>Comparación de series efectivas equivalentes. Revisá carga, repeticiones y esfuerzo juntos; los cambios de estructura se muestran por separado.</Text>
    {!groups.length ? <Text style={{ color: theme.textMuted }}>Guardá una sesión para comenzar el seguimiento.</Text> : null}
    {groups.map((group) => {
      const first = group.points[0], last = group.points[group.points.length - 1];
      const loadLabel = group.mode === 'assisted' ? 'Asistencia máxima' : group.mode === 'bodyweight' ? 'Peso corporal' : 'Carga máxima';
      return <View key={group.id} style={{ gap: 8, borderTopWidth: 1, borderTopColor: theme.glassBorder, paddingTop: 12 }}>
        <Text style={{ color: theme.text, fontWeight: '800' }}>{group.name} · {group.routineName}</Text>
        {group.points.length > 1 ? <>
          <SimpleLineChart data={group.points.map((point) => ({ date: point.at, label: `S${point.weekNumber}`, maxWeight: point.load, totalReps: point.reps, tonnage: point.volume ?? 0 }))} dataKey="maxWeight" unit={` ${group.unit}`} label={loadLabel} summary={`${first.load} → ${last.load} ${group.unit}`} />
          <Text style={{ color: theme.text }}>{loadLabel}: {delta(last.load - first.load)} {group.unit} · Repeticiones totales: {delta(last.reps - first.reps)}</Text>
          {first.volume !== null && last.volume !== null ? <Text style={{ color: theme.textMuted }}>Volumen: {delta(last.volume - first.volume)} {group.unit}·reps entre primera y última sesión comparable.</Text> : null}
        </> : <Text style={{ color: theme.textMuted }}>Falta otra ejecución comparable para calcular el cambio.</Text>}
        {group.points.map((point) => <View key={point.attemptId} style={{ gap: 3 }}>
          <Text style={{ color: theme.text }}>Semana {point.weekNumber} · {new Date(point.at).toLocaleDateString('es')} · {loadLabel.toLowerCase()} {point.load} {group.unit} · {point.reps} reps · {point.sets} series</Text>
          <Text style={{ color: theme.textMuted }}>{exposureEffortLabel(point)}</Text>
        </View>)}
      </View>;
    })}
  </View>;
}
