import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppScreenHeader } from '../../components/AppScreenHeader';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { GlassButton, GlassInput } from '../../components/UI';
import { useSocial } from '../../context/SocialContext';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { PublicProfile } from '../../services/socialGraph';
import { WorkoutRecap, WorkoutSession } from '../../types';
import { recapInputFromSession } from '../../services/workoutRecapFeed';
import { muscleGroupLabels } from '../../utils/catalogMuscleGroups';

const categoryKeys = ['trainingStyle', 'about'];

export default function SocialScreen() {
  const { theme } = useTheme();
  const { ownProfile, refreshOwnProfile, saveProfile, discover, search, circle, requests, blockedUsers, command, getWorkoutRecaps, createWorkoutRecap, deleteWorkoutRecap, failedAutoRecapSessionIds, clearFailedAutoRecapSession, realtimeRevision } = useSocial();
  const { sessions = [], ensureRecapPublicationKey, catalogMuscleGroups = [] } = useData();
  const [alias, setAlias] = useState(''); const [trainingStyle, setTrainingStyle] = useState(''); const [about, setAbout] = useState('');
  const [visibility, setVisibility] = useState<Record<string, boolean>>({}); const [query, setQuery] = useState('');
  const [discoverProfiles, setDiscoverProfiles] = useState<PublicProfile[]>([]); const [discoverCursor, setDiscoverCursor] = useState<string | null>(null);
  const [circleProfiles, setCircleProfiles] = useState<PublicProfile[]>([]); const [requestProfiles, setRequestProfiles] = useState<PublicProfile[]>([]); const [blockedProfiles, setBlockedProfiles] = useState<PublicProfile[]>([]);
  const [searchProfiles, setSearchProfiles] = useState<PublicProfile[]>([]); const [searchCursor, setSearchCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false); const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [recaps, setRecaps] = useState<WorkoutRecap[]>([]); const [recapCursor, setRecapCursor] = useState<string | null>(null);
  const [recapLoading, setRecapLoading] = useState(false); const [recapError, setRecapError] = useState<string | null>(null);
  const [caption, setCaption] = useState(''); const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const applyOwn = useCallback(() => {
    if (!ownProfile) return;
    setAlias(ownProfile.alias); setTrainingStyle(ownProfile.categories.trainingStyle ?? ''); setAbout(ownProfile.categories.about ?? ''); setVisibility(ownProfile.categoryVisibility);
  }, [ownProfile]);
  useEffect(applyOwn, [applyOwn]);
  useFocusEffect(useCallback(() => { void refreshOwnProfile().catch((error) => Alert.alert('Perfil no disponible', error.message)); }, [refreshOwnProfile]));
  const loadRecaps = useCallback(async (cursor: string | null = null, append = false) => {
    setRecapLoading(true); setRecapError(null);
    try {
      const page = await getWorkoutRecaps(cursor);
      setRecaps((current) => append ? [...current, ...page.recaps.filter((recap) => !current.some(({ id }) => id === recap.id))] : page.recaps);
      setRecapCursor(page.nextCursor);
    } catch (error) {
      if (!append) setRecaps([]);
      setRecapError(error instanceof Error ? error.message : 'No se pudo actualizar el feed.');
    } finally { setRecapLoading(false); }
  }, [getWorkoutRecaps]);
  useFocusEffect(useCallback(() => { void loadRecaps(); }, [loadRecaps]));

  const loadDiscover = async (nextCursor: string | null = null, append = false) => {
    setLoading(true);
    try {
      const result = await discover(nextCursor);
      setDiscoverProfiles((current) => append ? [...current, ...result.profiles.filter((profile) => !current.some(({ uid }) => uid === profile.uid))] : result.profiles);
      setDiscoverCursor(result.nextCursor);
    } catch (error) { Alert.alert('Descubrimiento no disponible', error instanceof Error ? error.message : 'Inténtalo de nuevo.'); }
    finally { setLoading(false); }
  };
  const loadSearch = async (nextCursor: string | null = null, append = false) => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const result = await search(query, nextCursor);
      setSearchProfiles((current) => append ? [...current, ...result.profiles.filter((profile) => !current.some(({ uid }) => uid === profile.uid))] : result.profiles);
      setSearchCursor(result.nextCursor);
    } catch (error) { Alert.alert('Búsqueda no disponible', error instanceof Error ? error.message : 'Inténtalo de nuevo.'); }
    finally { setLoading(false); }
  };
  const loadRelationshipSections = async () => {
    try {
      const [nextCircle, nextRequests, nextBlocked] = await Promise.all([circle(), requests(), blockedUsers()]);
      setCircleProfiles(nextCircle.profiles); setRequestProfiles(nextRequests.profiles); setBlockedProfiles(nextBlocked.profiles);
    } catch (error) { Alert.alert('Conexiones no disponibles', error instanceof Error ? error.message : 'Inténtalo de nuevo.'); }
  };
  useEffect(() => {
    if (query.trim()) void loadSearch();
    else { setSearchProfiles([]); setSearchCursor(null); void loadDiscover(); }
    void loadRelationshipSections();
  }, [query, realtimeRevision]);
  useEffect(() => { void loadRecaps(); }, [realtimeRevision, loadRecaps]);
  const save = async () => {
    setSaving(true);
    try { await saveProfile({ alias, categories: { ...(trainingStyle ? { trainingStyle } : {}), ...(about ? { about } : {}) }, categoryVisibility: visibility, autoShareCompletedWorkouts: ownProfile?.autoShareCompletedWorkouts ?? true }); Alert.alert('Perfil guardado', 'Tus ajustes de privacidad se actualizaron.'); }
    catch (error) { Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Revisa el alias e inténtalo de nuevo.'); }
    finally { setSaving(false); }
  };
  const toggle = (key: string) => setVisibility((current) => ({ ...current, [key]: !(current[key] ?? true) }));
  const statusLabel = (profile: PublicProfile) => {
    const labels: Partial<Record<NonNullable<PublicProfile['relationshipStatus']>, string>> = { bro: 'Bro', partner: 'Partner', incoming_request: 'Solicitud recibida', outgoing_request: 'Solicitud enviada' };
    return labels[profile.relationshipStatus ?? 'discover'] ?? 'Disponible';
  };
  const requestKindLabel = (profile: PublicProfile) => profile.requestedKind === 'partner' ? 'Solicitud para ser Partner' : 'Solicitud para ser Bro';
  const publishRecap = async () => {
    const session = sessions.find(({ id }) => id === selectedSessionId);
    if (!session) return;
    setRecapLoading(true);
    try {
      await createWorkoutRecap(recapInputFromSession(session, caption), await ensureRecapPublicationKey(session.id));
      clearFailedAutoRecapSession(session.id);
      setCaption(''); setSelectedSessionId(null);
      await loadRecaps();
    } catch (error) { Alert.alert('No se pudo compartir', error instanceof Error ? error.message : 'Inténtalo de nuevo.'); }
    finally { setRecapLoading(false); }
  };
  const removeRecap = async (recap: WorkoutRecap) => {
    try { await deleteWorkoutRecap(recap.id); await loadRecaps(); }
    catch (error) { Alert.alert('No se pudo eliminar', error instanceof Error ? error.message : 'Inténtalo de nuevo.'); }
  };
  const unblock = async (profile: PublicProfile) => {
    setUnblockingId(profile.uid);
    try {
      await command({ command: 'unblock', targetId: profile.uid });
      await Promise.all([loadDiscover(), loadRelationshipSections()]);
    } catch (error) { Alert.alert('No se pudo desbloquear', error instanceof Error ? error.message : 'Inténtalo de nuevo.'); }
    finally { setUnblockingId(null); }
  };
  const recapCard = (recap: WorkoutRecap) => <GlassCard key={recap.id}><Text style={[styles.alias, { color: theme.text }]}>{recap.authorAlias}</Text><Text style={[styles.recapTitle, { color: theme.text }]}>{recap.routineName}</Text><Text style={{ color: theme.textMuted }}>{recap.exerciseCount} ejercicios · {Math.round(recap.durationSeconds / 60)} min · {new Date(recap.completedAt).toLocaleDateString()}</Text>{recap.muscleGroupIds.length ? <Text style={{ color: theme.textMuted }}>{muscleGroupLabels(catalogMuscleGroups, recap.muscleGroupIds).join(' · ')}</Text> : null}{recap.metrics.volume !== undefined ? <Text style={{ color: theme.textMuted }}>Volumen: {Math.round(recap.metrics.volume)} kg</Text> : null}{recap.caption ? <Text style={[styles.caption, { color: theme.text }]}>{recap.caption}</Text> : null}<GlassButton title="Ver detalle" variant="secondary" onPress={() => router.push({ pathname: '/social/recap/[id]', params: { id: recap.id } })} />{recap.authorAlias === ownProfile?.alias ? <GlassButton title="Eliminar" variant="secondary" onPress={() => void removeRecap(recap)} /> : null}</GlassCard>;
  const sessionOption = (session: WorkoutSession) => <GlassButton key={session.id} title={selectedSessionId === session.id ? `Seleccionado: ${session.routineName}` : `Compartir: ${session.routineName}`} variant="secondary" onPress={() => setSelectedSessionId(session.id)} />;
  const profileCard = (profile: PublicProfile) => <GlassCard key={profile.uid} style={styles.card}><View><Text style={[styles.alias, { color: theme.text }]}>{profile.alias}</Text><Text style={{ color: theme.textMuted }}>{Object.values(profile.categories).join(' · ') || 'Perfil público'}</Text>{profile.relationshipStatus && profile.relationshipStatus !== 'discover' ? <Text style={[styles.status, { color: theme.success }]}>{profile.relationshipStatus.includes('request') ? requestKindLabel(profile) : statusLabel(profile)}</Text> : null}</View><GlassButton title="Ver" variant="secondary" onPress={() => router.push({ pathname: '/social/[uid]', params: { uid: profile.uid } })} /></GlassCard>;
  const blockedProfileCard = (profile: PublicProfile) => <GlassCard key={profile.uid} style={styles.card}><View><Text style={[styles.alias, { color: theme.text }]}>{profile.alias}</Text><Text style={{ color: theme.textMuted }}>{Object.values(profile.categories).join(' · ') || 'Perfil bloqueado'}</Text></View><GlassButton title="Desbloquear" variant="secondary" disabled={unblockingId !== null} loading={unblockingId === profile.uid} onPress={() => void unblock(profile)} /></GlassCard>;

  return <ThemeBackground><SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={recapLoading} onRefresh={() => void loadRecaps()} tintColor={theme.primary} />}>
    <AppScreenHeader title="Comunidad" subtitle="Descubre atletas y controla tu perfil" />
    <Text style={[styles.title, { color: theme.text }]}>Entrenamientos compartidos</Text>
      {!ownProfile?.autoShareCompletedWorkouts || failedAutoRecapSessionIds.size ? <GlassCard><Text style={[styles.recapTitle, { color: theme.text }]}>Comparte un resumen</Text><Text style={{ color: theme.textMuted }}>{ownProfile?.autoShareCompletedWorkouts ? 'No se pudo publicar automáticamente uno de tus resúmenes. Podés reintentarlo acá.' : 'La publicación automática está desactivada. Solo se comparte un resumen sin series, notas ni datos locales.'}</Text>
        {sessions.filter((session) => !ownProfile?.autoShareCompletedWorkouts || failedAutoRecapSessionIds.has(session.id)).slice(0, 5).map(sessionOption)}
        <GlassInput placeholder="Caption opcional" value={caption} onChangeText={setCaption} maxLength={280} style={styles.input} multiline />
        <GlassButton title="Publicar resumen" disabled={!selectedSessionId || recapLoading} loading={recapLoading} onPress={() => void publishRecap()} />
      </GlassCard> : null}
      {recapError ? <GlassCard><Text style={{ color: theme.text }}>{recapError}</Text><GlassButton title="Reintentar" variant="secondary" onPress={() => void loadRecaps()} /></GlassCard> : null}
      {!recapLoading && !recapError && !recaps.length ? <Text style={{ color: theme.textMuted }}>Todavía no hay entrenamientos de tus conexiones.</Text> : null}
      {recaps.map(recapCard)}
      {recapCursor ? <GlassButton title={recapLoading ? 'Cargando…' : 'Ver más'} disabled={recapLoading} variant="secondary" onPress={() => void loadRecaps(recapCursor, true)} /> : null}
    <GlassCard><Text style={[styles.title, { color: theme.text }]}>Tu perfil</Text><GlassInput placeholder="Alias público" value={alias} onChangeText={setAlias} autoCapitalize="none" />
      <GlassInput placeholder="Estilo de entrenamiento" value={trainingStyle} onChangeText={setTrainingStyle} style={styles.input} />
      <GlassInput placeholder="Sobre ti" value={about} onChangeText={setAbout} style={styles.input} multiline />
      {categoryKeys.map((key) => <View key={key} style={styles.privacy}><Text style={{ color: theme.text }}>{key === 'trainingStyle' ? 'Mostrar estilo' : 'Mostrar descripción'}</Text><Switch value={visibility[key] ?? true} onValueChange={() => toggle(key)} trackColor={{ true: theme.primary }} /></View>)}
      <View style={styles.privacy}><Text style={{ color: theme.text }}>Compartir entrenamientos completados automáticamente</Text><Switch value={ownProfile?.autoShareCompletedWorkouts ?? true} onValueChange={(autoShareCompletedWorkouts) => { if (!ownProfile) return; void saveProfile({ alias, categories: ownProfile.categories, categoryVisibility: ownProfile.categoryVisibility, autoShareCompletedWorkouts }).catch((error) => Alert.alert('No se pudo guardar', error.message)); }} trackColor={{ true: theme.primary }} /></View>
      <GlassButton title={ownProfile ? 'Guardar perfil' : 'Crear perfil'} onPress={save} loading={saving} />
    </GlassCard>
    <Text style={[styles.title, { color: theme.text }]}>Buscar por alias</Text><GlassInput placeholder="Buscar conexiones o nuevos atletas" value={query} onChangeText={setQuery} autoCapitalize="none" />
    {query.trim() ? <>{searchProfiles.map(profileCard)}<GlassButton title={loading ? 'Cargando…' : searchCursor ? 'Ver más' : 'Buscar de nuevo'} onPress={() => void loadSearch(searchCursor, !!searchCursor)} disabled={loading} variant="secondary" /></> : <>
      <Text style={[styles.title, { color: theme.text }]}>Mi círculo</Text>{circleProfiles.length ? circleProfiles.map(profileCard) : <Text style={{ color: theme.textMuted }}>Todavía no tienes conexiones aceptadas.</Text>}
       <Text style={[styles.title, { color: theme.text }]}>Solicitudes</Text>{requestProfiles.length ? requestProfiles.map(profileCard) : <Text style={{ color: theme.textMuted }}>No tienes solicitudes pendientes.</Text>}
       <Text style={[styles.title, { color: theme.text }]}>Usuarios bloqueados</Text>{blockedProfiles.length ? blockedProfiles.map(blockedProfileCard) : <Text style={{ color: theme.textMuted }}>No tienes usuarios bloqueados.</Text>}
       <Text style={[styles.title, { color: theme.text }]}>Descubrir</Text>{discoverProfiles.map(profileCard)}
      <GlassButton title={loading ? 'Cargando…' : discoverCursor ? 'Ver más' : 'Actualizar'} onPress={() => void loadDiscover(discoverCursor, !!discoverCursor)} disabled={loading} variant="secondary" />
    </>}
  </ScrollView></SafeAreaView></ThemeBackground>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, scroll: { padding: 20, gap: 12, paddingBottom: 36 }, title: { fontSize: 20, fontWeight: '800', marginTop: 8 }, input: { marginTop: 10 }, privacy: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 }, card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, alias: { fontSize: 17, fontWeight: '800' }, status: { fontSize: 12, fontWeight: '700', marginTop: 4 }, recapTitle: { fontSize: 16, fontWeight: '800', marginTop: 6 }, caption: { marginTop: 8 } });
