import React, { useEffect, useRef, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, interpolate, type SharedValue,
  useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { WorkoutSession, ExperienceReceipt, RewardReceipt } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useAnimationActivity } from '../hooks/useAnimationActivity';
import { workoutFacts, workoutShareText } from '../utils/workoutExperience';
import { GlassButton } from './UI';
import { EXPERIENCE } from '../constants/experience';

type Props = {
  session: WorkoutSession;
  experience?: ExperienceReceipt | null;
  rewards?: RewardReceipt | null;
  onDetails?: () => void;
  celebrate?: boolean;
};

function VictoryParticle({ progress, index, color }: {
  progress: SharedValue<number>; index: number; color: string;
}) {
  const angle = Math.PI * 2 * index / 8;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.12, 0.65, 1], [0, 0.7, 0.4, 0]),
    transform: [
      { translateX: Math.cos(angle) * 70 * progress.value },
      { translateY: Math.sin(angle) * 70 * progress.value },
      { rotate: `${progress.value * 90}deg` },
      { scale: 1 - progress.value * 0.6 },
    ],
  }));
  return <Animated.View style={[styles.particle, { backgroundColor: color }, style]} />;
}

function VictoryFact({ label, value, index, progress }: {
  label: string; value: string; index: number; progress: SharedValue<number>;
}) {
  const { theme } = useTheme();
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 0.15 + index * 0.1, 0.55 + index * 0.1, 1], [8, 8, 0, 0]) }],
  }));
  // Values never count up or disappear: assistive technology gets the final fact immediately.
  return <Animated.View style={[styles.metric, style]}>
    <Text style={[styles.value, { color: theme.text }]}>{value}</Text>
    <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
  </Animated.View>;
}

export function WorkoutVictory({ session, experience, rewards, onDetails, celebrate = false }: Props) {
  const { theme } = useTheme();
  const animate = useAnimationActivity(celebrate);
  const facts = workoutFacts(session);
  const progress = useSharedValue(1);
  const played = useRef(false);
  const mountedAt = useRef(Date.now());
  const [preview, setPreview] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!animate) {
      cancelAnimation(progress);
      progress.value = 1;
      return;
    }
    // React to asynchronously resolved preferences without hiding saved content.
    // Never replay when returning from a share sheet/background or viewing history.
    if (played.current || Date.now() - mountedAt.current > 3000) return;
    played.current = true;
    progress.value = 0;
    progress.value = withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) });
    return () => cancelAnimation(progress);
  }, [animate, progress]);

  const emblemStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 0.2, 0.4, 1], [0.88, 1.08, 1, 1]) }],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    width: `${facts.totalSets ? facts.completedSets / facts.totalSets * 100 * progress.value : 0}%`,
  }));
  const rewardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 0.65, 1], [8, 8, 0]) }],
  }));

  const share = async () => {
    setSharing(true);
    try {
      await Share.share({ message: workoutShareText(session) });
      setPreview(false);
    } catch {
      Alert.alert('No se pudo compartir', 'Tu entrenamiento sigue guardado. Puedes intentarlo otra vez.');
    } finally {
      setSharing(false);
    }
  };

  return <View style={styles.content}>
    <LinearGradient colors={[`${theme.primary}28`, `${theme.secondary}12`]} style={[styles.hero, { borderColor: theme.glassBorder }]}>
      <View style={styles.emblemSpace} accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none">
        {celebrate && animate ? Array.from({ length: 8 }, (_, index) => <VictoryParticle key={index} progress={progress} index={index} color={index % 2 ? theme.secondary : theme.primary} />) : null}
        <Animated.View style={[styles.emblem, { backgroundColor: theme.primary }, emblemStyle]}>
          <Ionicons name="checkmark" size={42} color={theme.onPrimary} />
        </Animated.View>
      </View>
      <Text accessibilityRole="header" style={[styles.eyebrow, { color: theme.primary }]}>ENTRENAMIENTO GUARDADO</Text>
      <Text style={[styles.title, { color: theme.text }]}>{facts.full ? 'Lo hiciste.' : 'Cada serie cuenta.'}</Text>
      <Text style={[styles.name, { color: theme.text }]}>{session.routineName}</Text>
      <View style={styles.metrics}>
        <VictoryFact label="TIEMPO" value={`${Math.floor(session.durationSeconds / 60)} min`} progress={progress} index={0} />
        <VictoryFact label="SERIES" value={`${facts.completedSets}/${facts.totalSets}`} progress={progress} index={1} />
        <VictoryFact label="REPS" value={String(facts.repetitions)} progress={progress} index={2} />
      </View>
      <View accessibilityRole="progressbar" accessibilityLabel="Series realizadas de esta sesión"
        accessibilityValue={{ min: 0, max: Math.max(1, facts.totalSets), now: facts.completedSets, text: `${facts.completedSets} de ${facts.totalSets} series realizadas` }}
        style={[styles.track, { backgroundColor: theme.glassBorder }]}>
        <Animated.View style={[styles.fill, { backgroundColor: theme.primary }, fillStyle]} />
      </View>
      <Text style={[styles.body, { color: theme.textMuted }]}>{facts.full ? 'Completaste todas las series de esta sesión.' : `${facts.completedSets} series realizadas. Las pendientes no se cuentan como completadas.`}</Text>
    </LinearGradient>
    {experience ? <Animated.View style={[styles.reward, { backgroundColor: theme.glass, borderColor: theme.glassBorder }, rewardStyle]}>
      <Ionicons name="sparkles-outline" size={24} color={theme.secondary} />
      <View style={styles.flex}>
        <Text style={[styles.rewardTitle, { color: theme.text }]}>+{experience.earnedXp} XP · Nivel {experience.progress.level}</Text>
        <Text style={[styles.body, { color: theme.textMuted }]}>{experience.entries.some((entry) => entry.kind === 'personal_record') ? 'Récord personal confirmado en esta sesión' : experience.progress.rank}</Text>
      </View>
    </Animated.View> : null}
    {rewards ? <Text style={[styles.body, { color: theme.textMuted }]}>Recompensas: +{rewards.entries.reduce((sum, entry) => sum + entry.amount, 0)} gemas · Saldo {rewards.balance}</Text> : null}
    {onDetails ? <GlassButton title="Explorar mi entrenamiento" onPress={onDetails} /> : null}
    <GlassButton title={preview ? 'Ocultar vista previa' : 'Compartir un resumen'} variant="secondary" onPress={() => setPreview(!preview)} />
    {preview ? <View style={[styles.preview, { borderColor: theme.glassBorder }]}>
      <Text accessibilityRole="header" style={[styles.rewardTitle, { color: theme.text }]}>Tú eliges dónde compartir</Text>
      <Text selectable style={[styles.body, { color: theme.text }]}>{workoutShareText(session)}</Text>
      <Text style={[styles.body, { color: theme.textMuted }]}>Solo se enviará este texto, sin cargas, medidas ni plantillas. Selecciona el destino en la siguiente pantalla. Tus preferencias de publicación en GymBro no cambian.</Text>
      <GlassButton title="Elegir destino" loading={sharing} onPress={() => void share()} />
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  hero: { borderRadius: EXPERIENCE.radius.hero, borderWidth: 1, padding: 24, gap: 16 },
  emblemSpace: { width: 100, height: 100, alignItems: 'center', justifyContent: 'center' },
  emblem: { width: 76, height: 76, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  particle: { position: 'absolute', width: 7, height: 12, borderRadius: 3 },
  eyebrow: { fontSize: 12, letterSpacing: 1.7, fontWeight: '900' },
  title: { fontSize: 40, fontWeight: '900', letterSpacing: -1.5 },
  name: { fontSize: 21, fontWeight: '700' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginTop: 12 },
  metric: { flexGrow: 1, gap: 6 },
  value: { fontSize: 27, fontWeight: '900', fontVariant: ['tabular-nums'] },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  body: { fontSize: 14, lineHeight: 21 },
  reward: { flexDirection: 'row', gap: 12, padding: 16, borderWidth: 1, borderRadius: 20, alignItems: 'center' },
  rewardTitle: { fontSize: 17, fontWeight: '800' },
  flex: { flex: 1 },
  preview: { borderWidth: 1, borderRadius: 20, padding: 18, gap: 14 },
});
