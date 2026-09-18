import { useDirtyExitGuard } from '../../hooks/useDirtyExitGuard';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
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
import { ProfileAction, ProfileHistorySummary, ProfileOverview } from '../../components/ProfileOverview';
import { summarizeProfileHistory } from '../../utils/profileOverview';
import { useAuth } from '../../context/AuthContext';
import { MuscleVolumeCard } from '../../components/MuscleVolumeCard';
import { useData } from '../../context/DataContext';
import { MuscleBalanceTargetId, muscleBalanceTargetForId } from '../../constants/muscleBalanceTargets';

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
  const { theme } = useTheme();
  return (
    <View style={[styles.setting, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.glassBorder }]}>
      <Text style={[styles.settingCopy, { color: theme.text }]}>{label}</Text>
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
  const { user } = useAuth();
  return <ProfileEditor key={user ?? 'signed-out'} ownerId={user} />;
}

function ProfileEditor({ ownerId }: { ownerId: string | null }) {
  const { theme } = useTheme();
  const [section, setSection] = useState<'athlete' | 'identity' | 'privacy' | 'appearance'>('athlete');
  const scrollRef = useRef<ScrollView>(null);
  const { experienceProgress, attempts, sessions = [], isLoading: dataLoading, dataState, retryData } = useData();
  const history = useMemo(() => summarizeProfileHistory(sessions), [sessions]);
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
  const saveInFlight = useRef(false);
  const refreshRevision = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const profile = isRecord(ownProfile) && (typeof ownProfile.uid !== 'string' || ownProfile.uid === ownerId) ? ownProfile : null;
  const latestConfirmedProfile = useRef<Record<string, unknown> | null>(profile);
  // Track confirmed refreshes even while hydration is intentionally paused for a dirty draft.
  useEffect(() => { latestConfirmedProfile.current = profile; }, [profile]);
  const { purchasedFrameIds } = useShop();
  const { enabled: backgroundParallaxEnabled, setEnabled: setBackgroundParallaxEnabled } = useBackgroundParallaxPreference();
  const displayedFrameId = previewFrameId ?? frameId;
  const [baselineProfile, setBaselineProfile] = useState<Record<string, unknown> | null>(null);
  const dirty = !!baselineProfile && (
    alias !== stringOrEmpty(baselineProfile.alias) || about !== (stringRecord(baselineProfile.categories).about ?? '')
    || avatarId !== avatarIdOrDefault(baselineProfile.avatarId) || frameId !== profileFrameIdOrDefault(baselineProfile.frameId)
    || titleId !== (baselineProfile.titleId === null ? null : profileTitleIdOrDefault(baselineProfile.titleId))
    || JSON.stringify(visibility) !== JSON.stringify(booleanRecord(baselineProfile.categoryVisibility))
    || autoShare !== booleanOrDefault(baselineProfile.autoShareCompletedWorkouts)
    || shareRoutine !== booleanOrDefault(baselineProfile.shareRoutineTemplate) || shareMesocycle !== booleanOrDefault(baselineProfile.shareMesocycleTemplate)
    || shareSets !== booleanOrDefault(baselineProfile.sharePerformedSetDetails) || shareSocialActivity !== booleanOrDefault(baselineProfile.shareSocialActivity)
    || shareSocialProgress !== booleanOrDefault(baselineProfile.shareSocialProgress) || shareSocialConsistency !== booleanOrDefault(baselineProfile.shareSocialConsistency)
    || shareSocialStatistics !== booleanOrDefault(baselineProfile.shareSocialStatistics) || shareSocialMuscleDistribution !== booleanOrDefault(baselineProfile.shareSocialMuscleDistribution)
    || muscleBalanceTargetId !== muscleBalanceTargetForId(baselineProfile.muscleBalanceTargetId)
  );
  useDirtyExitGuard(dirty, saving);
  const draftSnapshot = { alias, about, avatarId, frameId, titleId, visibility, autoShare, shareRoutine, shareMesocycle, shareSets, shareSocialActivity, shareSocialProgress, shareSocialConsistency, shareSocialStatistics, shareSocialMuscleDistribution, muscleBalanceTargetId };
  const latestDraft = useRef(draftSnapshot);
  latestDraft.current = draftSnapshot;
  const dirtyDraft = useRef(dirty);
  dirtyDraft.current = dirty;


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

  const applyProfile = (profile: Record<string, unknown>, submitted?: typeof draftSnapshot) => {
    // Reconcile only fields untouched since this save began; newer edits remain dirty.
    const unchanged = (key: keyof typeof draftSnapshot) => !submitted
      || JSON.stringify(latestDraft.current[key]) === JSON.stringify(submitted[key]);
    latestConfirmedProfile.current = profile;
    setBaselineProfile(profile);
    const nextCategories = stringRecord(profile.categories);
    if (unchanged('alias')) setAlias(stringOrEmpty(profile.alias));
    if (unchanged('avatarId')) setAvatarId(avatarIdOrDefault(profile.avatarId));
    if (unchanged('frameId')) setFrameId(profileFrameIdOrDefault(profile.frameId));
    if (unchanged('titleId')) setTitleId(profile.titleId === null ? null : profileTitleIdOrDefault(profile.titleId));
    setCategories(nextCategories);
    if (unchanged('about')) setAbout(nextCategories.about ?? '');
    if (unchanged('visibility')) setVisibility(booleanRecord(profile.categoryVisibility));
    if (unchanged('autoShare')) setAutoShare(booleanOrDefault(profile.autoShareCompletedWorkouts));
    if (unchanged('shareRoutine')) setShareRoutine(booleanOrDefault(profile.shareRoutineTemplate));
    if (unchanged('shareMesocycle')) setShareMesocycle(booleanOrDefault(profile.shareMesocycleTemplate));
    if (unchanged('shareSets')) setShareSets(booleanOrDefault(profile.sharePerformedSetDetails));
    if (unchanged('shareSocialActivity')) setShareSocialActivity(booleanOrDefault(profile.shareSocialActivity));
    if (unchanged('shareSocialProgress')) setShareSocialProgress(booleanOrDefault(profile.shareSocialProgress));
    if (unchanged('shareSocialConsistency')) setShareSocialConsistency(booleanOrDefault(profile.shareSocialConsistency));
    if (unchanged('shareSocialStatistics')) setShareSocialStatistics(booleanOrDefault(profile.shareSocialStatistics));
    if (unchanged('shareSocialMuscleDistribution')) setShareSocialMuscleDistribution(booleanOrDefault(profile.shareSocialMuscleDistribution));
    if (unchanged('muscleBalanceTargetId')) setMuscleBalanceTargetId(muscleBalanceTargetForId(profile.muscleBalanceTargetId));
  };

  useEffect(() => {
    if (!profile || dirtyDraft.current || saving) return;
    applyProfile(profile);
  }, [profile]);

  const refresh = useCallback(async () => {
    const revision = ++refreshRevision.current;
    const current = () => mounted.current && revision === refreshRevision.current;
    setRefreshing(true);
    setLoadError(null);
    try {
      // Avatar metadata failure must not hide an otherwise available profile.
      await refreshOwnProfile();
      const onboarding = await getOwnOnboarding();
      if (current()) setSex(onboarding.sex);
    } catch (reason) {
      if (current()) setLoadError(reason instanceof Error ? reason.message : 'Inténtalo de nuevo.');
    } finally {
      if (current()) setRefreshing(false);
    }
  }, [refreshOwnProfile]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const selectSection = (next: typeof section) => {
    setSection(next);
    setCustomizationSection(null);
    setPreviewFrameId(null);
    setPreviewEndsAt(null);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  const discard = () => Alert.alert('¿Descartar los cambios?', 'Se restaurará la última versión guardada de tu perfil. Los ajustes del dispositivo no cambian.', [
    { text: 'Seguir editando', style: 'cancel' },
    { text: 'Descartar', style: 'destructive', onPress: () => {
      if (!mounted.current || saveInFlight.current) return;
      const confirmed = latestConfirmedProfile.current ?? baselineProfile;
      if (confirmed) applyProfile(confirmed);
      setPreviewFrameId(null);
      setPreviewEndsAt(null);
      setCustomizationSection(null);
    } },
  ]);

  const save = async () => {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    const submitted = latestDraft.current;
    const nextCategories = { ...categories };
    delete nextCategories.trainingStyle;
    if (about) nextCategories.about = about;
    else delete nextCategories.about;

    setSaving(true);
    try {
      const accepted = await saveProfile({
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
      if (!mounted.current) return;
      if (!accepted) throw new Error('No se pudo confirmar el perfil actualizado. Tus cambios siguen disponibles.');
      applyProfile(accepted, submitted);
      Alert.alert('Perfil guardado', 'Tu identidad, apariencia y privacidad están actualizadas.');
    } catch (reason) {
      if (mounted.current) Alert.alert('No se pudo guardar', reason instanceof Error ? reason.message : 'Revisa el alias e inténtalo de nuevo.');
    } finally {
      saveInFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.primary} />}>
          <AppScreenHeader title="Perfil" subtitle="Una identidad que crece contigo" />
          {loadError ? <GlassCard><Text accessibilityRole="alert" style={{ color: theme.text }}>No se pudo actualizar el perfil. {profile ? 'Conservamos la última información disponible.' : 'Reintenta para recuperar tus datos.'}</Text><Text style={{ color: theme.textMuted }}>{loadError}</Text><GlassButton title="Reintentar" variant="secondary" onPress={() => void refresh()} /></GlassCard> : null}
          {refreshing && !profile ? <Text accessibilityLiveRegion="polite" style={{ color: theme.textMuted }}>Cargando tu perfil…</Text> : null}
          {section === 'athlete' ? <ProfileOverview alias={alias} about={about} avatarId={avatarId} frameId={frameId} titleId={titleId} progress={experienceProgress ?? null} draft={dirty} onEdit={() => selectSection('identity')} onAppearance={() => selectSection('appearance')} /> : null}
          <View style={styles.sectionNav}>{([
            ['athlete', 'Atleta', 'Tu recorrido', 'fitness-outline'],
            ['identity', 'Identidad', 'Tu voz', 'person-outline'],
            ['appearance', 'Apariencia', 'Tu estilo', 'sparkles-outline'],
            ['privacy', 'Privacidad', 'Tu control', 'shield-checkmark-outline'],
          ] as const).map(([key, label, hint, icon]) => <HapticPressable key={key} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: section === key }} onPress={() => selectSection(key)} style={[styles.sectionTab, { borderColor: section === key ? theme.primary : theme.glassBorder, backgroundColor: section === key ? theme.primary : theme.glass }]}><Ionicons name={icon} size={20} color={section === key ? theme.onPrimary : theme.primary} /><View style={{ flex: 1 }}><Text style={{ color: section === key ? theme.onPrimary : theme.text, fontWeight: '800' }}>{label}</Text><Text style={{ color: section === key ? theme.onPrimary : theme.textMuted, fontSize: 11 }}>{hint}</Text></View></HapticPressable>)}</View>
          {section === 'athlete' ? <>
            <GlassCard>{dataLoading ? <Text accessibilityLiveRegion="polite" style={{ color: theme.textMuted }}>Cargando tu recorrido…</Text> : dataState === 'error' ? <><Text style={{ color: theme.text }}>No se pudo cargar tu historial.</Text><GlassButton title="Reintentar historial" variant="secondary" onPress={retryData} /></> : <ProfileHistorySummary summary={history} onHistory={() => router.push('/history')} onTrain={() => router.push('/(tabs)/train')} />}</GlassCard>
            <View style={styles.quickActions}><ProfileAction icon="analytics-outline" label="Explorar mi progreso" hint="Tendencias y evolución" onPress={() => router.push('/(tabs)/progress')} /><ProfileAction icon="options-outline" label="Preferencias de entrenamiento" hint="Movimiento, sonido y vibración" onPress={() => router.push('/profile/preferences')} /></View>
           <GlassCard>
            {ownerId ? <MuscleVolumeCard subjectId={ownerId} own attempts={attempts} localAvailable={!dataLoading && dataState !== 'error'} /> : null}
           </GlassCard>
           </> : null}
           {section === 'appearance' ? <GlassCard>
            {previewFrameId ? <View style={{ alignItems: 'center', gap: 8, marginBottom: 16 }}><ProfileAvatar avatarId={avatarId} frameId={displayedFrameId} level={experienceProgress?.level} size={96} borderColor={theme.primary} /><Text accessibilityLiveRegion="polite" style={{ color: theme.primary }}>Previsualización: {previewSeconds}s</Text></View> : null}
            <View style={styles.identityRow}>
              <ProfileAvatar avatarId={avatarId} frameId={frameId} level={experienceProgress?.level} size={88} borderColor={theme.primary} />
              <View style={styles.identityCopy}>
                <Text accessibilityRole="header" style={[styles.identityTitle, { color: theme.text }]}>Diseña tu identidad</Text>
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
          : null}
          {section === 'identity' ? <GlassCard>
            <Text style={[styles.eyebrow, { color: theme.primary }]}>PRESENTACIÓN</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Una identidad propia</Text>
            <Text style={[styles.sectionHint, { color: theme.textMuted }]}>Tu alias te identifica en la comunidad. Tu descripción cuenta lo que te mueve.</Text>
            <Text style={[styles.fieldLabel, { color: theme.text }]}>Alias público</Text>
            <GlassInput accessibilityLabel="Alias público" placeholder="Alias público" value={alias} onChangeText={setAlias} autoCapitalize="none" />
            <Text style={[styles.fieldLabel, { color: theme.text }]}>Sobre ti</Text>
            <GlassInput accessibilityLabel="Sobre ti" placeholder="Sobre ti" value={about} onChangeText={setAbout} style={styles.input} multiline />
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
          : null}
          {section === 'privacy' ? <GlassCard>
            <Text style={[styles.eyebrow, { color: theme.primary }]}>TÚ DECIDES QUÉ SE VE</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Compartir entrenamientos</Text>
            <ProfileSetting label="Publicar resúmenes automáticamente" value={autoShare} onValueChange={setAutoShare} primaryColor={theme.primary} />
            <ProfileSetting label="Incluir plantilla de rutina" value={shareRoutine} onValueChange={setShareRoutine} primaryColor={theme.primary} />
            <ProfileSetting label="Incluir plantilla de mesociclo vinculada" value={shareMesocycle} onValueChange={setShareMesocycle} primaryColor={theme.primary} />
            <ProfileSetting label="Incluir detalle de series realizadas" value={shareSets} onValueChange={setShareSets} primaryColor={theme.primary} />
            <Text style={{ color: theme.textMuted }}>Estos controles aplican solo a publicaciones futuras. Las publicaciones existentes conservan su privacidad original.</Text>
          </GlassCard>
          : null}
          {section === 'appearance' ? <GlassCard>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Tu ambiente de entrenamiento</Text>
            <ProfileAction icon="color-palette-outline" label="Explorar temas y fondos" hint="Colecciones, colores y ambientes" onPress={() => router.push('/(tabs)/shop')} />
            <ProfileSetting label="Parallax de fondos" value={backgroundParallaxEnabled} onValueChange={setBackgroundParallaxEnabled} primaryColor={theme.primary} />
            <Text style={{ color: theme.textMuted }}>Usa el movimiento del dispositivo cuando haya un fondo equipado. Este ajuste se guarda al cambiar, sin usar Guardar perfil.</Text>
          </GlassCard>
          : null}
          {section === 'privacy' ? <GlassCard>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Perfil en tu círculo</Text>
            <Text style={[styles.identityHint, { color: theme.textMuted }]}>Tus conexiones aceptadas ven estos resúmenes sólo cuando estén habilitados.</Text>
            <ProfileSetting label="Actividad reciente" value={shareSocialActivity} onValueChange={setShareSocialActivity} primaryColor={theme.primary} />
            <ProfileSetting label="Nivel y rango" value={shareSocialProgress} onValueChange={setShareSocialProgress} primaryColor={theme.primary} />
            <ProfileSetting label="Consistencia" value={shareSocialConsistency} onValueChange={setShareSocialConsistency} primaryColor={theme.primary} />
            <ProfileSetting label="Estadísticas resumidas" value={shareSocialStatistics} onValueChange={setShareSocialStatistics} primaryColor={theme.primary} />
            <ProfileSetting label="Distribución muscular" value={shareSocialMuscleDistribution} onValueChange={setShareSocialMuscleDistribution} primaryColor={theme.primary} />
          </GlassCard>
          : null}
          {section === 'athlete' ? <GlassCard>
            <Text style={[styles.eyebrow, { color: theme.primary }]}>SOLO PARA TI</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Tu evolución, en privado</Text>
            <Text style={{ color: theme.textMuted }}>Actualizá peso, talla y perímetros de forma privada para seguir tu evolución.</Text>
            <GlassButton title="Ver evolución corporal" variant="secondary" onPress={() => router.push('/body')} />
          </GlassCard>
          : null}
          {section === 'privacy' ? <GlassCard>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Privacidad</Text>
            <GlassButton title="Usuarios bloqueados" variant="secondary" onPress={() => router.push('/profile/blocked')} />
          </GlassCard>
          : null}
          {section !== 'athlete' ? <><Text style={{ color: theme.textMuted }}>Los cambios de identidad, apariencia y privacidad se aplican al guardar. Si hay un error, tus cambios permanecen aquí.</Text>
          {!profile ? <GlassButton title="Crear perfil" loading={saving} disabled={saving || refreshing} onPress={() => void save()} /> : !dirty ? <Text accessibilityLiveRegion="polite" style={{ color: theme.primary }}>Todo guardado</Text> : null}</> : null}
        </ScrollView>
        {dirty ? <View style={[styles.saveDock, { backgroundColor: theme.background?.[0] ?? theme.glass, borderColor: theme.glassBorder }]}><Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontWeight: '800' }}>Cambios pendientes de guardar</Text><View style={styles.dockActions}><HapticPressable accessibilityRole="button" accessibilityLabel="Descartar cambios" accessibilityState={{ disabled: saving }} disabled={saving} onPress={discard} style={styles.discard}><Text style={{ color: theme.textMuted, fontWeight: '700' }}>Descartar</Text></HapticPressable><View style={{ flex: 1 }}><GlassButton title="Guardar cambios" loading={saving} onPress={() => void save()} /></View></View></View> : null}
      </SafeAreaView>
    </ThemeBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 20, gap: 18, paddingBottom: 40, maxWidth: 760, width: '100%', alignSelf: 'center' },
  sectionNav: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectionTab: { flexGrow: 1, flexBasis: '45%', flexDirection: 'row', gap: 10, alignItems: 'center', padding: 14, borderRadius: 18, borderWidth: 1, minHeight: 62 },
  quickActions: { gap: 10 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '800', marginTop: 14, marginBottom: 8 },
  sectionHint: { fontSize: 14, lineHeight: 21, marginBottom: 8 },
  saveDock: { padding: 16, gap: 10, borderTopWidth: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },
  dockActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  discard: { padding: 12, minHeight: 48, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 10 },
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
  setting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 12, minHeight: 56 },
   settingCopy: { flex: 1 },
   targetHeader: { alignItems: 'center', flexDirection: 'row', gap: 12, marginTop: 12 },
   targetCopy: { flex: 1, gap: 3 },
   targetTitle: { fontSize: 14, fontWeight: '800' },
   targetButton: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
   targetOptions: { gap: 8, marginTop: 12 },
   targetOption: { borderRadius: 12, borderWidth: 1, gap: 3, padding: 10 },
});
