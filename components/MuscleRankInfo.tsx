import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { MUSCLE_RANKS } from '../constants/muscleRanks';

export function MuscleRankInfo() {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const copy = { color: theme.textMuted, fontSize: 14, lineHeight: 22 };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Cómo funcionan los rangos musculares" onPress={() => setOpen(true)} style={styles.button}><Text style={{ color: theme.primary, fontSize: 22 }}>ⓘ</Text></Pressable>
    {open ? <Modal visible animationType="slide" onRequestClose={() => setOpen(false)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background[0] }}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.row}><Text accessibilityRole="header" style={{ color: theme.text, fontSize: 24, fontWeight: '900', flex: 1 }}>Rangos musculares</Text><Pressable accessibilityRole="button" accessibilityLabel="Cerrar explicación de rangos" onPress={() => setOpen(false)} style={styles.button}><Text style={{ color: theme.primary }}>Cerrar</Text></Pressable></View>
          <Text style={copy}>Cada grupo tiene un rango de constancia según el entrenamiento registrado en GymBro. Es independiente de tu nivel general. No mide fuerza, tamaño muscular ni salud.</Text>
          <Text accessibilityRole="header" style={{ color: theme.text, fontWeight: '800' }}>Un rango, un color</Text>
          {MUSCLE_RANKS.map((rank, i) => <View key={rank.name} style={styles.row}><View style={[styles.swatch, { backgroundColor: rank.color }]} /><Text style={{ color: theme.text, flex: 1 }}>{i + 1}. {rank.name}</Text><Text style={copy}>{rank.xp.toLocaleString('es-AR')} XP</Text></View>)}
          <Text style={copy}>Principiante empieza con el primer registro válido. Antes se muestra «Sin registros». La tabla indica XP acumulada: los primeros rangos llegan antes y los siguientes requieren más constancia.</Text>
          <Text accessibilityRole="header" style={{ color: theme.text, fontWeight: '800' }}>Cómo sumás XP y gemas</Text>
          <Text style={copy}>Cada serie directa válida aporta 10 XP y cada indirecta, 5 XP al grupo correspondiente. No cuentan calentamientos, series omitidas ni duplicadas. Un bloque drop cuenta una vez. Los registros por tiempo y técnicas sin equivalencia no suman XP muscular.</Text>
          <Text style={copy}>Cada músculo puede sumar hasta 60 XP por día UTC y 120 XP entre hoy y los seis días anteriores. Son límites del juego, no objetivos de entrenamiento. No necesitás hacer más series cuando llegás al límite.</Text>
          <Text style={copy}>Cada primer ascenso de rango por músculo regala 25 gemas. Dos ascensos en un grupo dan 50; tres grupos que suben un rango dan 75. Recuperar un rango ya premiado no vuelve a dar gemas. Principiante es el rango inicial y no da premio. Las gemas se acreditan al finalizar y sincronizar la sesión; el historial anterior a esta función no recibe premios retroactivos.</Text>
          <Text accessibilityRole="header" style={{ color: theme.text, fontWeight: '800' }}>Descanso y descenso gradual</Text>
          <Text style={copy}>El primer registro activa siete días de protección. Luego, un día con al menos dos series equivalentes (directas + ½ indirectas) renueva la protección, incluso si alcanzaste el límite de XP. Una serie aislada posterior no la renueva.</Text>
          <Text style={copy}>Desde el octavo día sin actividad suficiente, el grupo pierde 0,5 % de sus puntos por día activo. Con 1.000 XP, siete descuentos dejan aproximadamente 966 XP. Los decimales se conservan para el cálculo y se muestran puntos enteros. Puede bajar el rango actual; conservás el máximo del historial registrado.</Text>
          <Text style={copy}>Sigma tiene una reserva máxima de 1.000 XP sobre sus 10.000 XP de entrada. Así, acumular puntos durante años no oculta una interrupción prolongada.</Text>
          <Text accessibilityRole="header" style={{ color: theme.text, fontWeight: '800' }}>Pausa de recuperación</Text>
          <Text style={copy}>Podés pausar todos los rangos: durante la pausa no ganás XP muscular ni avanza el reloj de descenso. Pausar o retomar rige desde las 00:00 UTC del día siguiente. El estado pausado es visible con el mapa, sin pedir ni compartir un motivo.</Text>
          <Text style={copy}>Ambos mapas respetan tu privacidad. Los rangos usan el historial sincronizado disponible; no registrar actividad no prueba que no hayas entrenado. Un fallo de conexión no se interpreta como ausencia de entrenamiento.</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal> : null}
  </>;
}
const styles = StyleSheet.create({ button: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }, content: { padding: 20, gap: 16 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, swatch: { width: 18, height: 18, borderRadius: 5 } });
