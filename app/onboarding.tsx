import React, { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnthropometricDraft, AnthropometricFields } from '../components/AnthropometricFields';
import { GlassButton, GlassInput } from '../components/UI';
import { ThemeBackground } from '../components/GlassCard';
import { ANTHROPOMETRICS } from '../constants/anthropometrics';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { recordBodyMetric } from '../services/bodyMetrics';
import { completeOwnOnboarding, OnboardingSex } from '../services/onboarding';
import { normalizeDecimalInput } from '../utils/decimalInput';

function formattedBirthDate(date: Date) {
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function OnboardingScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [realName, setRealName] = useState('');
  const [alias, setAlias] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [sex, setSex] = useState<OnboardingSex | null>(null);
  const [measurements, setMeasurements] = useState<AnthropometricDraft>({});
  const [saving, setSaving] = useState(false);

  const continueToMeasurements = () => {
    if (!realName.trim() || alias.trim().length < 3 || !birthDate || !sex) {
      Alert.alert('Completá tus datos', 'Nombre real, alias, fecha de nacimiento y sexo son obligatorios.');
      return;
    }
    setStep(2);
  };

  const complete = async (includeMeasurements: boolean) => {
    if (!user || !birthDate || !sex) return;
    setSaving(true);
    try {
      await completeOwnOnboarding({ alias, realName, birthDate: birthDate.toISOString().slice(0, 10), sex });
      const measuredAt = new Date().toISOString();
      for (const metric of includeMeasurements ? ANTHROPOMETRICS : []) {
        const value = normalizeDecimalInput(measurements[metric.type] ?? '');
        if (value === null) continue;
        if (value <= 0) throw new Error(`${metric.label}: ingresá un valor mayor a cero.`);
        await recordBodyMetric(user, { metricType: metric.type, value, unit: metric.unit, measuredAt });
      }
      router.replace('/(tabs)/train');
    } catch (error) {
      Alert.alert('No pudimos completar tu perfil', error instanceof Error ? error.message : 'Intentá nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  return <ThemeBackground><SafeAreaView style={styles.safe}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}><ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
    <LinearGradient colors={['rgba(0,255,179,0.26)', 'rgba(124,58,237,0.22)', 'rgba(0,0,0,0)']} style={styles.hero}>
      <Image source={require('../assets/gymbro-icon.png')} style={styles.logo} />
      <Text style={[styles.eyebrow, { color: theme.primary }]}>GYMBRO · {step}/2</Text>
      <Text style={[styles.title, { color: theme.text }]}>{step === 1 ? 'Tu punto de partida' : 'Medí tu progreso'}</Text>
      <Text style={[styles.subtitle, { color: theme.textMuted }]}>{step === 1 ? 'Armemos tu identidad de atleta. Estos datos son privados.' : 'Podés cargar estas medidas ahora o actualizarlas cuando quieras desde tu perfil.'}</Text>
    </LinearGradient>
    {step === 1 ? <View style={styles.form}>
      <GlassInput value={realName} onChangeText={setRealName} placeholder="Nombre real" autoCapitalize="words" accessibilityLabel="Nombre real" />
      <GlassInput value={alias} onChangeText={setAlias} placeholder="Alias público" autoCapitalize="none" accessibilityLabel="Alias público" />
      <GlassButton title={birthDate ? formattedBirthDate(birthDate) : 'Elegir fecha de nacimiento'} variant="secondary" onPress={() => setShowDatePicker(true)} />
      {showDatePicker ? <DateTimePicker value={birthDate ?? new Date(2000, 0, 1)} mode="date" maximumDate={new Date()} onChange={(_event, date) => { setShowDatePicker(Platform.OS === 'ios'); if (date) setBirthDate(date); }} /> : null}
      <Text style={[styles.fieldLabel, { color: theme.text }]}>Sexo</Text>
      <View style={styles.sexRow}>{(['male', 'female'] as const).map((candidate) => <GlassButton key={candidate} title={candidate === 'male' ? 'Masculino' : 'Femenino'} variant={sex === candidate ? 'primary' : 'secondary'} onPress={() => setSex(candidate)} />)}</View>
      <GlassButton title="Continuar" onPress={continueToMeasurements} />
    </View> : <View style={styles.form}>
      <AnthropometricFields values={measurements} onChange={(type, value) => setMeasurements((current) => ({ ...current, [type]: value }))} theme={theme} />
      <GlassButton title="Finalizar" loading={saving} disabled={saving} onPress={() => void complete(true)} />
      <GlassButton title="Omitir por ahora" variant="secondary" disabled={saving} onPress={() => void complete(false)} />
      <GlassButton title="Volver" variant="secondary" disabled={saving} onPress={() => setStep(1)} />
    </View>}
  </ScrollView></KeyboardAvoidingView></SafeAreaView></ThemeBackground>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, flex: { flex: 1 }, scroll: { gap: 20, padding: 22, paddingBottom: 44 }, hero: { alignItems: 'center', borderRadius: 28, gap: 10, overflow: 'hidden', padding: 24 }, logo: { height: 84, resizeMode: 'contain', width: 84 }, eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 1.6 }, title: { fontSize: 30, fontWeight: '900', textAlign: 'center' }, subtitle: { fontSize: 14, lineHeight: 21, textAlign: 'center' }, form: { gap: 14 }, fieldLabel: { fontSize: 15, fontWeight: '800' }, sexRow: { gap: 10 } });
