import React, { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BodyPhoto, dayLabel, elapsedDays } from '../../utils/bodyEvolution';

export function PhotoComparison({ photos, onClose }: { photos: [BodyPhoto, BodyPhoto]; onClose: () => void }) {
  const [position, setPosition] = useState(0.5);
  const [width, setWidth] = useState(1);
  const [failed, setFailed] = useState(false);
  const [aligning, setAligning] = useState(false);
  const [alignment, setAlignment] = useState({ x: 0, y: 0, scale: 1 });
  const [older, newer] = [...photos].sort((a, b) => a.day.localeCompare(b.day));
  const days = elapsedDays(older.day, newer.day);
  const update = (x: number) => setPosition(Math.max(0, Math.min(1, x / width)));
  return <Modal animationType="slide" onRequestClose={onClose}><SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.row}><Text style={styles.title}>Comparar fotos</Text><Pressable style={styles.button} accessibilityRole="button" onPress={onClose}><Text style={styles.text}>Cerrar</Text></Pressable></View>
    <Text style={styles.text}>{Math.floor(days / 7)} semanas y {days % 7} días entre fotos</Text>
    <View style={styles.row}><Text style={styles.text}>{dayLabel(older.day)}</Text><Text style={styles.text}>{dayLabel(newer.day)}</Text></View>
    <View style={styles.images} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      <Image source={{ uri: newer.uri }} resizeMode="contain" style={[StyleSheet.absoluteFill, { transform: [{ translateX: alignment.x }, { translateY: alignment.y }, { scale: alignment.scale }] }]} onError={() => setFailed(true)} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { width: width * position, overflow: 'hidden' }]}>
        <Image source={{ uri: older.uri }} resizeMode="contain" style={{ width, height: '100%' }} onError={() => setFailed(true)} />
      </View>
      <View accessibilityRole="adjustable" accessibilityLabel="Divisor de comparación" accessibilityValue={{ min: 0, max: 100, now: Math.round(position * 100) }} accessibilityActions={[{ name: 'increment', label: 'Mostrar más de la foto anterior' }, { name: 'decrement', label: 'Mostrar más de la foto reciente' }]} onAccessibilityAction={e => setPosition(p => Math.max(0, Math.min(1, p + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1))))}
        onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true} onResponderGrant={e => update(e.nativeEvent.locationX)} onResponderMove={e => update(e.nativeEvent.locationX)} style={StyleSheet.absoluteFill}>
        <View pointerEvents="none" style={[styles.divider, { left: width * position }]}><View style={styles.handle}><Text style={styles.text}>↔</Text></View></View>
      </View>
      {failed && <Text style={[styles.text, styles.error]}>Una foto ya no está disponible en este dispositivo.</Text>}
    </View>
    <Pressable accessibilityRole="button" style={styles.button} onPress={() => setAligning(v => !v)}><Text style={styles.text}>{aligning ? 'Cerrar ajuste' : 'Ajustar encuadre de la foto reciente'}</Text></Pressable>
    {aligning && <View style={{ gap: 8 }}>
      <Text style={styles.text}>Solo cambia la vista. Los originales se conservan.</Text>
      <View style={[styles.row, { flexWrap: 'wrap' }]}>{[
        { label: 'Izquierda', x: -8, y: 0 }, { label: 'Derecha', x: 8, y: 0 },
        { label: 'Arriba', x: 0, y: -8 }, { label: 'Abajo', x: 0, y: 8 },
      ].map(direction => <Pressable key={direction.label} accessibilityRole="button" style={styles.button} onPress={() => setAlignment(a => ({ ...a, x: Math.max(-width, Math.min(width, a.x + direction.x)), y: Math.max(-width, Math.min(width, a.y + direction.y)) }))}><Text style={styles.text}>{direction.label}</Text></Pressable>)}</View>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => setAlignment(a => ({ ...a, scale: Math.max(0.5, a.scale - 0.05) }))}><Text style={styles.text}>Alejar</Text></Pressable>
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => setAlignment(a => ({ ...a, scale: Math.min(2, a.scale + 0.05) }))}><Text style={styles.text}>Acercar</Text></Pressable>
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => setAlignment({ x: 0, y: 0, scale: 1 })}><Text style={styles.text}>Restablecer</Text></Pressable>
      </View>
    </View>}
    <Text style={styles.text}>Desliza el divisor o usa los botones. Las fotos no se deforman ni se retocan.</Text>
    <View style={styles.row}>{[['Anterior', 1], ['Mitad', 0.5], ['Reciente', 0]].map(([label, value]) => <Pressable accessibilityRole="button" style={styles.button} key={label} onPress={() => setPosition(Number(value))}><Text style={styles.text}>{label}</Text></Pressable>)}</View>
  </ScrollView></SafeAreaView></Modal>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#10121B' }, content: { flexGrow: 1, padding: 16, gap: 16 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, title: { color: '#fff', fontSize: 22, fontWeight: '800' }, text: { color: '#E5E7EB', fontSize: 14 }, images: { flex: 1, minHeight: 300, backgroundColor: '#000', overflow: 'hidden', borderRadius: 16 }, divider: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#fff', justifyContent: 'center' }, handle: { width: 48, height: 48, marginLeft: -23, backgroundColor: '#29314A', borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }, button: { minHeight: 48, padding: 14, borderRadius: 14, backgroundColor: '#29314A', justifyContent: 'center' }, error: { padding: 20, backgroundColor: '#10121B' } });
