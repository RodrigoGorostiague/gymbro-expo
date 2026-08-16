import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppScreenHeader } from '../../components/AppScreenHeader';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { GlassButton, GlassInput } from '../../components/UI';
import { useSocial } from '../../context/SocialContext';
import { useShop } from '../../context/ShopContext';
import { useTheme } from '../../context/ThemeContext';
import { useBackgroundParallaxPreference } from '../../context/BackgroundParallaxContext';
import { AVATARS, AvatarId, AvatarSex, avatarIdOrDefault, avatarsForSex, DEFAULT_AVATAR_ID } from '../../constants/avatars';
import { DEFAULT_PROFILE_FRAME_ID, DEFAULT_PROFILE_TITLE_ID, isProfileFrameUnlocked, isProfileTitleUnlocked, orderProfileFrameIds, orderProfileTitleIds, PROFILE_FRAMES, PROFILE_TITLES, ProfileFrameId, ProfileTitleId, profileFrameForId, profileFrameIdOrDefault, profileTitleForId, profileTitleIdOrDefault, visibleBrawlFrames } from '../../constants/profileFrames';
import { getOwnOnboarding } from '../../services/onboarding';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { ProfileTitleBadge } from '../../components/ProfileTitleBadge';
import { HapticPressable } from '../../components/HapticPressable';
import { ExperienceProgressCard } from '../../components/ExperienceProgressCard';
import { MuscleDistributionRadar } from '../../components/MuscleDistributionRadar';
import { useData } from '../../context/DataContext';
import { ownMuscleDistribution } from '../../utils/muscleDistribution';
import { MUSCLE_BALANCE_TARGETS, MuscleBalanceTargetId, muscleBalanceTargetEntries, muscleBalanceTargetForId } from '../../constants/muscleBalanceTargets';

const categoryKeys = ['about'] as const;
type CustomizationSection = 'avatar' | 'frame' | 'title' | 'target' | null;

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
  const { experienceProgress, attempts, catalogMuscleGroups = [] } = useData();
  const { ownProfile, refreshOwnProfile, saveProfile } = useSocial();
  const [alias, setAlias] = useState('');
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [about, setAbout] = useState('');
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [autoShare, setAutoShare] = useState(true);
  const [shareRoutine, setShareRoutine] = useState(true);
  const [shareMesocycle, setShareMesocycle] = useState(true);
  const [shareSets, setShareSets] = useState(true);
  const [shareSocialActivity, setShareSocialActivity] = useState(true);
  const [shareSocialProgress, setShareSocialProgress] = useState(true);
  const [shareSocialConsistency, setShareSocialConsistency] = useState(true);
  const [shareSocialStatistics, setShareSocialStatistics] = useState(true);
  const [shareSocialMuscleDistribution, setShareSocialMuscleDistribution] = useState(true);
  const [muscleBalanceTargetId, setMuscleBalanceTargetId] = useState<MuscleBalanceTargetId>('balanced');
  const [avatarId, setAvatarId] = useState<AvatarId>(DEFAULT_AVATAR_ID);
  const [frameId, setFrameId] = useState<ProfileFrameId>(DEFAULT_PROFILE_FRAME_ID);
  const [titleId, setTitleId] = useState<ProfileTitleId | null>(DEFAULT_PROFILE_TITLE_ID);
  const [sex, setSex] = useState<AvatarSex | null>(null);
  const [customizationSection, setCustomizationSection] = useState<CustomizationSection>(null);
  const [previewFrameId, setPreviewFrameId] = useState<ProfileFrameId | null>(null);
  const [previewEndsAt, setPreviewEndsAt] = useState<number | null>(null);
  const [previewSeconds, setPreviewSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const profile = isRecord(ownProfile) ? ownProfile : null;
  const { purchasedFrameIds } = useShop();
  const { enabled: backgroundParallaxEnabled, setEnabled: setBackgroundParallaxEnabled } = useBackgroundParallaxPreference();
  const muscleDistribution = useMemo(() => ownMuscleDistribution(attempts ?? [], catalogMuscleGroups), [attempts, catalogMuscleGroups]);
  const muscleBalanceTarget = useMemo(() => muscleBalanceTargetEntries(catalogMuscleGroups, muscleBalanceTargetId), [catalogMuscleGroups, muscleBalanceTargetId]);
  const displayedFrameId = previewFrameId ?? frameId;

  useEffect(() => {
    if (!previewFrameId || !previewEndsAt) return undefined;
    const updatePreview = () => {
      const remaining = Math.max(0, Math.ceil((previewEndsAt - Date.now()) / 1000));
      setPreviewSeconds(remaining);
      if (remaining === 0) {
        setPreviewFrameId(null);
        setPreviewEndsAt(null);
      }
    };
    updatePreview();
    const timer = setInterval(updatePreview, 250);
    return () => clearInterval(timer);
  }, [previewEndsAt, previewFrameId]);

  const requestFramePreview = (candidate: (typeof PROFILE_FRAMES)[number]) => {
    const brawl = candidate.kind === 'brawl';
    const message = brawl
      ? 'Las Brawls se acercan. Podés ver este marco durante 15 segundos.'
      : candidate.kind === 'shop'
        ? `Comprá ${candidate.label} en la tienda para desbloquearlo. Podés verlo durante 15 segundos.`
        : candidate.kind === 'global'
          ? `${candidate.label} está disponible para todos durante la Alfa.`
        : `Alcanzá el nivel ${candidate.unlockLevel} para desbloquear ${candidate.label}. Podés verlo durante 15 segundos.`;
    Alert.alert(brawl ? 'Brawls próximamente' : 'Marco bloqueado', message, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Previsualizar 15 s', onPress: () => {
        setPreviewFrameId(candidate.id);
        setPreviewEndsAt(Date.now() + 15_000);
      } },
    ]);
  };

  useEffect(() => {
    if (!profile) return;
    const nextCategories = stringRecord(profile.categories);
    setAlias(stringOrEmpty(profile.alias));
    setAvatarId(avatarIdOrDefault(profile.avatarId));
    setFrameId(profileFrameIdOrDefault(profile.frameId));
    setTitleId(profile.titleId === null ? null : profileTitleIdOrDefault(profile.titleId));
    setCategories(nextCategories);
    setAbout(nextCategories.about ?? '');
    setVisibility(booleanRecord(profile.categoryVisibility));
    setAutoShare(booleanOrDefault(profile.autoShareCompletedWorkouts));
    setShareRoutine(booleanOrDefault(profile.shareRoutineTemplate));
    setShareMesocycle(booleanOrDefault(profile.shareMesocycleTemplate));
    setShareSets(booleanOrDefault(profile.sharePerformedSetDetails));
    setShareSocialActivity(booleanOrDefault(profile.shareSocialActivity));
    setShareSocialProgress(booleanOrDefault(profile.shareSocialProgress));
    setShareSocialConsistency(booleanOrDefault(profile.shareSocialConsistency));
    setShareSocialStatistics(booleanOrDefault(profile.shareSocialStatistics));
    setShareSocialMuscleDistribution(booleanOrDefault(profile.shareSocialMuscleDistribution));
    setMuscleBalanceTargetId(muscleBalanceTargetForId(profile.muscleBalanceTargetId));
  }, [profile]);

  useFocusEffect(useCallback(() => {
    const refresh = async () => {
      try {
        const [, onboarding] = await Promise.all([refreshOwnProfile(), getOwnOnboarding()]);
        setSex(onboarding.sex);
      } catch (reason) {
        Alert.alert('Perfil no disponible', reason instanceof Error ? reason.message : 'Inténtalo de nuevo.');
      }
    };
    void refresh();
  }, [refreshOwnProfile]));

  const save = async () => {
    const nextCategories = { ...categories };
    delete nextCategories.trainingStyle;
    if (about) nextCategories.about = about;
    else delete nextCategories.about;

    setSaving(true);
    try {
      await saveProfile({
        alias,
        avatarId,
        frameId,
        titleId,
        categories: nextCategories,
        categoryVisibility: visibility,
        autoShareCompletedWorkouts: autoShare,
        shareRoutineTemplate: shareRoutine,
        shareMesocycleTemplate: shareMesocycle,
        sharePerformedSetDetails: shareSets,
        shareSocialActivity,
        shareSocialProgress,
        shareSocialConsistency,
        shareSocialStatistics,
        shareSocialMuscleDistribution,
        muscleBalanceTargetId,
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
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Así te ve la comunidad</Text>
            <View style={[styles.preview, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
              <ProfileAvatar avatarId={avatarId} frameId={displayedFrameId} level={experienceProgress?.level} size={78} borderColor={theme.primary} />
              <View style={styles.previewCopy}>
                <Text style={[styles.previewAlias, { color: theme.text }]}>{alias || 'Tu alias'}</Text>
                <ProfileTitleBadge titleId={titleId} />
                <Text style={[styles.previewRank, { color: theme.textMuted }]}>Nivel {experienceProgress?.level ?? 1} · {experienceProgress?.rank ?? 'Principiante'}</Text>
                {previewFrameId ? <Text style={[styles.previewTimer, { color: theme.primary }]}>Previsualización: {previewSeconds}s</Text> : null}
              </View>
            </View>
           </GlassCard>
           <GlassCard><ExperienceProgressCard progress={experienceProgress} frameId={frameId} theme={theme} title="Tu rango" /></GlassCard>
           <GlassCard>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Tu distribución muscular</Text>
             <Text style={[styles.identityHint, { color: theme.textMuted }]}>{shareSocialMuscleDistribution ? 'Así se ve tu distribución en tu círculo.' : 'Tu distribución está privada para tu círculo.'}</Text>
             <MuscleDistributionRadar data={muscleDistribution} reference={muscleBalanceTarget} />
             <View style={styles.targetHeader}><View style={styles.targetCopy}><Text style={[styles.targetTitle, { color: theme.text }]}>Objetivo de distribución</Text><Text style={[styles.identityHint, { color: theme.textMuted }]}>{MUSCLE_BALANCE_TARGETS.find((target) => target.id === muscleBalanceTargetId)?.description}</Text></View><HapticPressable accessibilityRole="button" accessibilityLabel="Elegir objetivo muscular" onPress={() => setCustomizationSection((current) => current === 'target' ? null : 'target')} style={[styles.targetButton, { borderColor: theme.primary }]}><Text style={[styles.editAvatarText, { color: theme.primary }]}>Cambiar</Text></HapticPressable></View>
             {customizationSection === 'target' ? <View accessibilityRole="radiogroup" style={styles.targetOptions}>{MUSCLE_BALANCE_TARGETS.map((target) => <HapticPressable key={target.id} accessibilityRole="radio" accessibilityLabel={target.label} accessibilityState={{ selected: muscleBalanceTargetId === target.id }} onPress={() => { setMuscleBalanceTargetId(target.id); setCustomizationSection(null); }} style={[styles.targetOption, { borderColor: muscleBalanceTargetId === target.id ? theme.primary : theme.glassBorder, backgroundColor: muscleBalanceTargetId === target.id ? theme.glass : 'transparent' }]}><Text style={[styles.avatarOptionLabel, { color: theme.text }]}>{target.label}</Text><Text style={[styles.identityHint, { color: theme.textMuted }]}>{target.description}</Text></HapticPressable>)}</View> : null}
           </GlassCard>
           <GlassCard>
            <View style={styles.identityRow}>
              <ProfileAvatar avatarId={avatarId} frameId={frameId} level={experienceProgress?.level} size={88} borderColor={theme.primary} />
              <View style={styles.identityCopy}>
                <Text accessibilityRole="header" style={[styles.identityTitle, { color: theme.text }]}>Personalizá tu perfil</Text>
                <Text style={{ color: theme.textMuted }}>Avatar, marco y título para tu comunidad.</Text>
              </View>
            </View>
            <View style={styles.customizationActions}>
              {(['avatar', 'frame', 'title'] as const).map((section) => <HapticPressable key={section} accessibilityRole="tab" accessibilityState={{ selected: customizationSection === section }} accessibilityLabel={`Elegir ${section === 'avatar' ? 'avatar' : section === 'frame' ? 'marco' : 'título'}`} onPress={() => setCustomizationSection((current) => current === section ? null : section)} style={[styles.customizationAction, { borderColor: customizationSection === section ? theme.primary : theme.glassBorder, backgroundColor: customizationSection === section ? theme.glass : 'transparent' }]}><Text style={[styles.editAvatarText, { color: theme.text }]}>{section === 'avatar' ? 'Avatar' : section === 'frame' ? 'Marco' : 'Título'}</Text></HapticPressable>)}
            </View>
            {customizationSection === 'avatar' && !sex ? <Text style={[styles.identityHint, { color: theme.textMuted }]}>Cargando tus avatares...</Text> : null}
            {customizationSection === 'avatar' && sex ? <View accessibilityRole="radiogroup" style={styles.avatarOptions}>{avatarsForSex(sex).map((candidate) => <HapticPressable key={candidate} accessibilityRole="radio" accessibilityLabel={AVATARS[candidate].label} accessibilityState={{ selected: avatarId === candidate }} onPress={() => { setAvatarId(candidate); setCustomizationSection(null); }} style={[styles.avatarOption, { borderColor: avatarId === candidate ? theme.primary : theme.glassBorder, backgroundColor: avatarId === candidate ? theme.glass : 'transparent' }]}><ProfileAvatar avatarId={candidate} frameId={displayedFrameId} level={experienceProgress?.level} size={54} borderColor={avatarId === candidate ? theme.primary : theme.glassBorder} /><Text style={[styles.avatarOptionLabel, { color: theme.text }]}>{AVATARS[candidate].label}</Text></HapticPressable>)}</View> : null}
            {customizationSection === 'frame' ? <View accessibilityRole="radiogroup" style={styles.avatarOptions}>{orderProfileFrameIds([...PROFILE_FRAMES.filter((frame) => frame.kind === 'level' || frame.kind === 'shop' || frame.kind === 'global').map((frame) => frame.id), ...visibleBrawlFrames(frameId).map((frame) => frame.id)], experienceProgress?.level ?? 1, purchasedFrameIds).map((id) => {
               const candidate = profileFrameForId(id);
              const unlocked = isProfileFrameUnlocked(candidate.id, experienceProgress?.level ?? 1, purchasedFrameIds);
              const brawl = candidate.kind === 'brawl';
              const shopFrame = candidate.kind === 'shop';
              return <HapticPressable key={candidate.id} accessibilityRole="radio" accessibilityLabel={candidate.label} accessibilityHint={brawl ? 'Las Brawls se acercan' : shopFrame ? unlocked ? 'Marco comprado' : 'Compralo en la tienda para desbloquearlo' : candidate.kind === 'global' ? 'Disponible para todos durante la Alfa' : unlocked ? `Se desbloquea en el nivel ${candidate.unlockLevel}` : `Bloqueado. Se desbloquea en el nivel ${candidate.unlockLevel}`} accessibilityState={{ disabled: !unlocked, selected: frameId === candidate.id }} onPress={() => {
                if (!unlocked) { requestFramePreview(candidate); return; }
                setFrameId(candidate.id); setPreviewFrameId(null); setPreviewEndsAt(null); setCustomizationSection(null);
              }} style={[styles.avatarOption, { borderColor: frameId === candidate.id ? theme.primary : theme.glassBorder, backgroundColor: frameId === candidate.id ? theme.glass : 'transparent' }]}><View style={styles.framePreview}><ProfileAvatar avatarId={avatarId} frameId={candidate.id} level={experienceProgress?.level} size={54} borderColor={frameId === candidate.id ? theme.primary : theme.glassBorder} />{!unlocked ? <View style={styles.frameLock}><Ionicons name="lock-closed" size={13} color="#FFFFFF" /></View> : null}</View><Text style={[styles.avatarOptionLabel, { color: theme.text }]}>{candidate.label}</Text><Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '700', textAlign: 'center' }}>{brawl ? 'Brawls próximamente' : shopFrame ? unlocked ? 'Comprado' : `${candidate.price} gemas · Tienda` : candidate.kind === 'global' ? 'Disponible ahora' : unlocked ? `Nivel ${candidate.unlockLevel}` : `Requiere nivel ${candidate.unlockLevel}`}</Text></HapticPressable>;
            })}</View> : null}
              {customizationSection === 'title' ? <View accessibilityRole="radiogroup" style={styles.avatarOptions}><HapticPressable accessibilityRole="radio" accessibilityLabel="Sin título" accessibilityState={{ selected: titleId === null }} onPress={() => { setTitleId(null); setCustomizationSection(null); }} style={[styles.avatarOption, { borderColor: titleId === null ? theme.primary : theme.glassBorder, backgroundColor: titleId === null ? theme.glass : 'transparent' }]}><Text style={[styles.avatarOptionLabel, { color: theme.text }]}>Sin título</Text><Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '700', textAlign: 'center' }}>Ocultar título</Text></HapticPressable>{orderProfileTitleIds(PROFILE_TITLES.map((title) => title.id), experienceProgress?.level ?? 1).map((id) => {
                const candidate = profileTitleForId(id);
               const unlocked = isProfileTitleUnlocked(candidate.id, experienceProgress?.level ?? 1);
               const brawl = candidate.kind === 'brawl';
                return <HapticPressable key={candidate.id} accessibilityRole="radio" accessibilityLabel={candidate.title} accessibilityHint={brawl ? 'Las Brawls se acercan' : candidate.kind === 'global' ? 'Disponible para todos durante la Alfa' : unlocked ? `Se desbloquea en el nivel ${candidate.unlockLevel}` : `Bloqueado. Se desbloquea en el nivel ${candidate.unlockLevel}`} accessibilityState={{ disabled: !unlocked, selected: titleId === candidate.id }} disabled={!unlocked} onPress={() => { setTitleId(candidate.id); setCustomizationSection(null); }} style={[styles.avatarOption, { borderColor: titleId === candidate.id ? candidate.titleColor : theme.glassBorder, backgroundColor: titleId === candidate.id ? theme.glass : 'transparent' }]}><View style={styles.titlePreview}><ProfileTitleBadge titleId={candidate.id} size={62} />{!unlocked ? <View style={styles.frameLock}><Ionicons name="lock-closed" size={13} color="#FFFFFF" /></View> : null}</View><Text style={[styles.avatarOptionLabel, { color: theme.text }]}>{candidate.label}</Text><Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '700', textAlign: 'center' }}>{brawl ? 'Brawls próximamente' : candidate.kind === 'global' ? 'Disponible ahora' : unlocked ? `Nivel ${candidate.unlockLevel}` : `Requiere nivel ${candidate.unlockLevel}`}</Text></HapticPressable>;
             })}</View> : null}
            <Text style={[styles.identityHint, { color: theme.textMuted }]}>Los cambios se ven arriba al instante y se aplican al guardar el perfil.</Text>
          </GlassCard>
          <GlassCard>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Perfil público</Text>
            <GlassInput placeholder="Alias público" value={alias} onChangeText={setAlias} autoCapitalize="none" />
            <GlassInput placeholder="Sobre ti" value={about} onChangeText={setAbout} style={styles.input} multiline />
            {categoryKeys.map((key) => (
              <ProfileSetting
                key={key}
                label="Mostrar descripción"
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
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Fondos</Text>
            <ProfileSetting label="Parallax de fondos" value={backgroundParallaxEnabled} onValueChange={setBackgroundParallaxEnabled} primaryColor={theme.primary} />
            <Text style={{ color: theme.textMuted }}>Usa el movimiento del dispositivo cuando haya un fondo equipado.</Text>
          </GlassCard>
          <GlassCard>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Perfil en tu círculo</Text>
            <Text style={[styles.identityHint, { color: theme.textMuted }]}>Tus conexiones aceptadas ven estos resúmenes sólo cuando estén habilitados.</Text>
            <ProfileSetting label="Actividad reciente" value={shareSocialActivity} onValueChange={setShareSocialActivity} primaryColor={theme.primary} />
            <ProfileSetting label="Nivel y rango" value={shareSocialProgress} onValueChange={setShareSocialProgress} primaryColor={theme.primary} />
            <ProfileSetting label="Consistencia" value={shareSocialConsistency} onValueChange={setShareSocialConsistency} primaryColor={theme.primary} />
            <ProfileSetting label="Estadísticas resumidas" value={shareSocialStatistics} onValueChange={setShareSocialStatistics} primaryColor={theme.primary} />
            <ProfileSetting label="Distribución muscular" value={shareSocialMuscleDistribution} onValueChange={setShareSocialMuscleDistribution} primaryColor={theme.primary} />
          </GlassCard>
          <GlassCard>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Mediciones</Text>
            <Text style={{ color: theme.textMuted }}>Actualizá peso, talla y perímetros de forma privada para seguir tu evolución.</Text>
            <GlassButton title="Actualizar antropometrías" variant="secondary" onPress={() => router.push('/profile/measurements')} />
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
  preview: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 16, padding: 14 },
  previewCopy: { flex: 1, gap: 6 },
  previewAlias: { fontSize: 21, fontWeight: '900' },
  previewRank: { fontSize: 12, fontWeight: '700' },
  previewTimer: { fontSize: 11, fontWeight: '900' },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  identityCopy: { flex: 1, gap: 3 },
  identityTitle: { fontSize: 18, fontWeight: '800' },
  identityHint: { fontSize: 12, lineHeight: 17 },
  editAvatar: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, marginTop: 6, paddingHorizontal: 10, paddingVertical: 6 },
  editAvatarText: { fontSize: 12, fontWeight: '800' },
  customizationActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  customizationAction: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flex: 1, paddingHorizontal: 8, paddingVertical: 9 },
  avatarOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  avatarOption: { alignItems: 'center', borderWidth: 1.5, borderRadius: 14, gap: 6, padding: 8, width: 92 },
  framePreview: { position: 'relative' },
  titlePreview: { alignItems: 'center', justifyContent: 'center', minHeight: 62, position: 'relative' },
  frameLock: { alignItems: 'center', backgroundColor: 'rgba(15,23,42,0.88)', borderColor: 'rgba(255,255,255,0.45)', borderRadius: 999, borderWidth: 1, bottom: -3, height: 22, justifyContent: 'center', position: 'absolute', right: -5, width: 22 },
  avatarOptionLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  setting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginVertical: 8 },
   settingCopy: { flex: 1 },
   targetHeader: { alignItems: 'center', flexDirection: 'row', gap: 12, marginTop: 12 },
   targetCopy: { flex: 1, gap: 3 },
   targetTitle: { fontSize: 14, fontWeight: '800' },
   targetButton: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
   targetOptions: { gap: 8, marginTop: 12 },
   targetOption: { borderRadius: 12, borderWidth: 1, gap: 3, padding: 10 },
});
