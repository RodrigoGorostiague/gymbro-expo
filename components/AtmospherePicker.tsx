import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ATMOSPHERES, AtmosphereId, saveLocalAtmosphere, useLocalAtmosphere } from '../hooks/useLocalAtmosphere';
import { useTheme } from '../context/ThemeContext';
import { HapticPressable } from './HapticPressable';
import { GlassButton } from './UI';
import { ProceduralAtmosphere } from './ProceduralAtmosphere';
export function AtmospherePicker() {
    const { theme } = useTheme();
    const selected = useLocalAtmosphere();
    const [preview, setPreview] = useState<AtmosphereId | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        if (!preview)
            return;
        const timeout = setTimeout(() => setPreview(null), 12000);
        return () => clearTimeout(timeout);
    }, [preview]);
    const choose = async (id: AtmosphereId | null) => {
        if (busy)
            return;
        setBusy(true);
        setError('');
        try {
            await saveLocalAtmosphere(id);
            setPreview(null);
        }
        catch {
            setError('No se guardó la atmósfera. La selección anterior sigue activa.');
        }
        finally {
            setBusy(false);
        }
    };
    return <View style={styles.content}>
    <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Atmósferas incluidas</Text>
    <Text style={{ color: theme.textMuted }}>Gratis · solo este dispositivo. No gastan gemas ni cambian tu colección. No se sincronizan con tu perfil.</Text>
    <View style={styles.grid}>{ATMOSPHERES.map((scene) => <HapticPressable key={scene.id} accessibilityLabel={`Previsualizar ${scene.name}`} accessibilityState={{ selected: selected === scene.id }} onPress={() => setPreview(scene.id)} style={[styles.option, { borderColor: selected === scene.id ? theme.primary : theme.glassBorder }]}><Text style={[styles.name, { color: theme.text }]}>{scene.name}{selected === scene.id ? ' · Activa' : ''}</Text><Text style={{ color: theme.textMuted }}>{scene.description}</Text></HapticPressable>)}</View>
    {preview ? <View style={styles.preview}><ProceduralAtmosphere id={preview}/><View style={styles.previewActions}><GlassButton title={`Usar ${ATMOSPHERES.find(({ id }) => id === preview)!.name} en este dispositivo`} loading={busy} onPress={() => void choose(preview)}/><GlassButton title="Cerrar vista previa" variant="secondary" onPress={() => setPreview(null)}/></View></View> : null}
    <GlassButton title="Usar fondo de mi colección" variant="secondary" loading={busy} onPress={() => void choose(null)}/>
    {error ? <Text accessibilityRole="alert" style={{ color: theme.text }}>{error}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
    content: { gap: 14, paddingVertical: 16 }, title: { fontSize: 24, fontWeight: '900' }, grid: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 10
    }, option: {
        width: '47%', minHeight: 104, padding: 14, borderWidth: 1, borderRadius: 18, gap: 8
    }, name: { fontSize: 20, fontWeight: '800' }, preview: {
        minHeight: 320, borderRadius: 24, overflow: 'hidden', justifyContent: 'flex-end'
    }, previewActions: {
        padding: 16, gap: 10, backgroundColor: 'rgba(0,0,0,0.4)'
    }
});
