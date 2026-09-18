import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { BODY_POSES, BodyPose, localDay } from '../../utils/bodyEvolution';
import { copyBodyPhotoToGallery, storeBodyPhoto } from '../../services/bodyPhotos';
import { PoseGuide } from './PoseGuide';

type Capture = { uri: string; day: string; capturedAt: string };
export function BodyCamera({ owner, pose, onClose, onSaved }: { owner: string; pose: BodyPose; onClose: () => void; onSaved: () => void }) {
  const definition = BODY_POSES.find(p => p.id === pose)!;
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [count, setCount] = useState<number | null>(null);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [busy, setBusy] = useState(false);
  const [opacity, setOpacity] = useState(0.65);
  const camera = useRef<CameraView>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const temp = useRef<string | null>(null);
  const lock = useRef(false);
  const beep = useAudioPlayer(require('../../assets/sounds/body_countdown.wav'));
  const shutter = useAudioPlayer(require('../../assets/sounds/body_capture.wav'));
  const play = () => { try { void beep.seekTo(0).then(() => { if (mounted.current) beep.play(); }).catch(() => undefined); } catch {} };
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      setActive(state === 'active');
      if (state !== 'active') { generation.current++; setCount(null); setReady(false); }
    });
    return () => { mounted.current = false; generation.current++; subscription.remove(); if (temp.current) void FileSystem.deleteAsync(temp.current, { idempotent: true }).catch(() => undefined); };
  }, []);
  useEffect(() => {
    if (count === null) return;
    play();
    if (count > 0) {
      const timer = setTimeout(() => setCount(n => n === null ? null : n - 1), 1000);
      return () => clearTimeout(timer);
    }
    setCount(null);
    const token = generation.current;
    lock.current = true; setBusy(true);
    void (async () => {
      try {
        const picture = await camera.current?.takePictureAsync({ quality: 0.85 });
        if (!picture) throw new Error('No se pudo tomar la foto.');
        if (!mounted.current || token !== generation.current) { await FileSystem.deleteAsync(picture.uri, { idempotent: true }); return; }
        try { void shutter.seekTo(0).then(() => shutter.play()).catch(() => undefined); } catch {}
        temp.current = picture.uri;
        setCapture({ uri: picture.uri, day: localDay(), capturedAt: new Date().toISOString() });
      } catch (error) { if (mounted.current) Alert.alert('Cámara', error instanceof Error ? error.message : 'Intenta nuevamente.'); }
      finally { lock.current = false; if (mounted.current) setBusy(false); }
    })();
  }, [count]);
  async function confirm() {
    if (!capture || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const saved = await storeBodyPhoto(owner, { ...capture, pose });
      const gallery = await copyBodyPhotoToGallery(saved.uri);
      if (mounted.current) {
        Alert.alert('Foto guardada', gallery ? 'Guardada en GymBro y en la galería.' : 'Guardada en GymBro. No se pudo guardar la copia en la galería.');
        onSaved();
      }
    } catch (error) { if (mounted.current) Alert.alert('No se guardó la foto', error instanceof Error ? error.message : 'Intenta nuevamente.'); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  const action = (label: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.4 }]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
  return <Modal animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}><SafeAreaView style={styles.screen}>
    <View style={styles.header}><Text style={styles.title}>{definition.title}</Text>{action('Cerrar', onClose, busy)}</View>
    {Platform.OS === 'web' ? <Text style={styles.help}>La captura con almacenamiento local está disponible en la app para Android y iOS.</Text> : !started ? <>
      <View style={styles.illustration}><PoseGuide pose={pose} /></View><Text style={styles.help}>{definition.help}</Text><Text style={styles.help}>Apoya el teléfono. Activa el sonido del teléfono. Tendrás 10 segundos para acomodarte; una señal doble indica que la captura terminó. Mantén una iluminación y distancia similares entre sesiones.</Text>
      <Text style={styles.help}>Al confirmar, también intentaremos guardar una copia en tu galería. Su respaldo en la nube depende de la configuración del teléfono.</Text>
      {action('Abrir cámara', () => setStarted(true))}
    </> : !permission?.granted ? <><Text style={styles.help}>Necesitamos acceso a la cámara para tomar la foto. No usamos el micrófono.</Text>{action(permission?.canAskAgain === false ? 'Abrir ajustes' : 'Permitir cámara', () => { if (permission?.canAskAgain === false) void Linking.openSettings(); else void requestPermission().catch(() => Alert.alert('Cámara no disponible')); })}</> : <>
      <View style={styles.preview}>
        {capture ? <Image source={{ uri: capture.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" /> : active ? <CameraView key={facing} ref={camera} facing={facing} mirror={false} mode="picture" ratio="4:3" style={StyleSheet.absoluteFill} onCameraReady={() => setReady(true)} onMountError={() => { setReady(false); Alert.alert('Cámara no disponible', 'Cierra esta pantalla y vuelve a intentar.'); }} /> : null}
        {!capture && <View pointerEvents="none" style={StyleSheet.absoluteFill}><PoseGuide pose={pose} opacity={opacity} /></View>}
        {count !== null && <View pointerEvents="none" style={styles.count}><Text accessibilityLiveRegion="assertive" style={styles.number}>{count || '¡Foto!'}</Text></View>}
      </View>
      {capture ? <View style={styles.controls}>{action('Repetir', () => { if (temp.current) void FileSystem.deleteAsync(temp.current, { idempotent: true }).catch(() => undefined); temp.current = null; setReady(false); setCapture(null); }, busy)}{action(busy ? 'Guardando…' : 'Confirmar foto', () => void confirm(), busy)}</View> : <>
        <View style={styles.controls}>{action('Cambiar cámara', () => { setReady(false); setFacing(v => v === 'front' ? 'back' : 'front'); }, busy || count !== null)}{action('Transparencia', () => setOpacity(v => v > 0.5 ? 0.3 : 0.65), busy || count !== null)}</View>
        {count !== null ? action('Cancelar cuenta regresiva', () => setCount(null)) : action(busy ? 'Capturando…' : 'Tomar foto · 10 s', () => { if (!lock.current) setCount(10); }, !ready || busy || !active)}
      </>}
    </>}
  </SafeAreaView></Modal>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#10121B', padding: 16, gap: 12 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, title: { color: '#fff', fontSize: 20, fontWeight: '800', flex: 1 }, help: { color: '#D1D5DB', fontSize: 15, lineHeight: 22 }, illustration: { flex: 1, minHeight: 100, maxHeight: 260 }, preview: { flex: 1, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' }, button: { minHeight: 48, backgroundColor: '#29314A', borderRadius: 14, padding: 14, justifyContent: 'center', alignItems: 'center' }, buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 }, controls: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' }, count: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center' }, number: { fontSize: 80, color: '#fff', fontWeight: '900', textShadowColor: '#000', textShadowRadius: 12 } });
