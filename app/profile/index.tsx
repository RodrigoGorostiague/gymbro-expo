import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppScreenHeader } from '../../components/AppScreenHeader';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { GlassButton, GlassInput } from '../../components/UI';
import { useSocial } from '../../context/SocialContext';
import { useTheme } from '../../context/ThemeContext';

const categoryKeys = ['trainingStyle', 'about'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => typeof entry === 'string')) as Record<string, string>;
}

function booleanRecord(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => typeof entry === 'boolean')) as Record<string, boolean>;
}

function booleanOrDefault(value: unknown): boolean {
  return typeof value === 'boolean' ? value : true;
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function ProfileSetting({ label, value, onValueChange, primaryColor }: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  primaryColor: string;
}) {
  return (
    <View style={styles.setting}>
      <Text style={[styles.settingCopy, { color: primaryColor }]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: primaryColor }}
      />
    </View>
  );
}

export default function ProfileScreen() {
  const { theme } = useTheme();
  const { ownProfile, refreshOwnProfile, saveProfile } = useSocial();
  const [alias, setAlias] = useState('');
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [trainingStyle, setTrainingStyle] = useState('');
  const [about, setAbout] = useState('');
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [autoShare, setAutoShare] = useState(true);
  const [shareRoutine, setShareRoutine] = useState(true);
  const [shareMesocycle, setShareMesocycle] = useState(true);
  const [shareSets, setShareSets] = useState(true);
  const [saving, setSaving] = useState(false);
  const profile = isRecord(ownProfile) ? ownProfile : null;

  useEffect(() => {
    if (!profile) return;
    const nextCategories = stringRecord(profile.categories);
    setAlias(stringOrEmpty(profile.alias));
    setCategories(nextCategories);
    setTrainingStyle(nextCategories.trainingStyle ?? '');
    setAbout(nextCategories.about ?? '');
    setVisibility(booleanRecord(profile.categoryVisibility));
    setAutoShare(booleanOrDefault(profile.autoShareCompletedWorkouts));
    setShareRoutine(booleanOrDefault(profile.shareRoutineTemplate));
    setShareMesocycle(booleanOrDefault(profile.shareMesocycleTemplate));
    setShareSets(booleanOrDefault(profile.sharePerformedSetDetails));
  }, [profile]);

  useFocusEffect(useCallback(() => {
    const refresh = async () => {
      try {
        await refreshOwnProfile();
      } catch (reason) {
        Alert.alert('Perfil no disponible', reason instanceof Error ? reason.message : 'Inténtalo de nuevo.');
      }
    };
    void refresh();
  }, [refreshOwnProfile]));

  const save = async () => {
    const nextCategories = { ...categories };
    if (trainingStyle) nextCategories.trainingStyle = trainingStyle;
    else delete nextCategories.trainingStyle;
    if (about) nextCategories.about = about;
    else delete nextCategories.about;

    setSaving(true);
    try {
      await saveProfile({
        alias,
        categories: nextCategories,
        categoryVisibility: visibility,
        autoShareCompletedWorkouts: autoShare,
        shareRoutineTemplate: shareRoutine,
        shareMesocycleTemplate: shareMesocycle,
        sharePerformedSetDetails: shareSets,
      });
      Alert.alert('Perfil guardado', 'Tus ajustes de privacidad se actualizaron.');
    } catch (reason) {
      Alert.alert('No se pudo guardar', reason instanceof Error ? reason.message : 'Revisa el alias e inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <AppScreenHeader title="Perfil" subtitle="Tu identidad y privacidad" />
          <GlassCard>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Perfil público</Text>
            <GlassInput placeholder="Alias público" value={alias} onChangeText={setAlias} autoCapitalize="none" />
            <GlassInput placeholder="Estilo de entrenamiento" value={trainingStyle} onChangeText={setTrainingStyle} style={styles.input} />
            <GlassInput placeholder="Sobre ti" value={about} onChangeText={setAbout} style={styles.input} multiline />
            {categoryKeys.map((key) => (
              <ProfileSetting
                key={key}
                label={key === 'trainingStyle' ? 'Mostrar estilo' : 'Mostrar descripción'}
                value={booleanOrDefault(visibility[key])}
                onValueChange={(next) => setVisibility((current) => ({ ...current, [key]: next }))}
                primaryColor={theme.primary}
              />
            ))}
          </GlassCard>
          <GlassCard>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Compartir entrenamientos</Text>
            <ProfileSetting label="Publicar resúmenes automáticamente" value={autoShare} onValueChange={setAutoShare} primaryColor={theme.primary} />
            <ProfileSetting label="Incluir plantilla de rutina" value={shareRoutine} onValueChange={setShareRoutine} primaryColor={theme.primary} />
            <ProfileSetting label="Incluir plantilla de mesociclo vinculada" value={shareMesocycle} onValueChange={setShareMesocycle} primaryColor={theme.primary} />
            <ProfileSetting label="Incluir detalle de series realizadas" value={shareSets} onValueChange={setShareSets} primaryColor={theme.primary} />
            <Text style={{ color: theme.textMuted }}>Estos controles aplican solo a publicaciones futuras. Las publicaciones existentes conservan su privacidad original.</Text>
          </GlassCard>
          <GlassCard>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Privacidad</Text>
            <GlassButton title="Usuarios bloqueados" variant="secondary" onPress={() => router.push('/profile/blocked')} />
          </GlassCard>
          <GlassButton title={profile ? 'Guardar perfil' : 'Crear perfil'} loading={saving} disabled={saving} onPress={() => void save()} />
        </ScrollView>
      </SafeAreaView>
    </ThemeBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 20, gap: 12, paddingBottom: 36 },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 10 },
  input: { marginTop: 10 },
  setting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginVertical: 8 },
  settingCopy: { flex: 1 },
});
