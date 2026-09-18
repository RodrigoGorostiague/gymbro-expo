import React, { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useSensoryPreferences, saveSensoryPreferences } from '../hooks/useSensoryPreferences';
import { SensoryPreferences } from '../utils/sensoryPreferences';
export function SensorySettings() {
    const { theme } = useTheme();
    const preferences = useSensoryPreferences();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const update = async (key: keyof SensoryPreferences, value: boolean) => {
        setBusy(true);
        setError('');
        try {
            await saveSensoryPreferences({ ...preferences, [key]: value });
        }
        catch {
            setError('No se guardó el cambio. Inténtalo de nuevo.');
        }
        finally {
            setBusy(false);
        }
    };
    return <View style={styles.content}><Text style={[styles.heading, { color: theme.text }]}>Entrena a tu ritmo</Text><Text style={{ color: theme.textMuted }}>Estos ajustes se guardan al cambiar y solo afectan este dispositivo. La reducción de movimiento del sistema tiene prioridad. Los sonidos de notificaciones del sistema se controlan desde los ajustes del teléfono.</Text>{([['motion', 'Animaciones decorativas'], ['haptics', 'Vibración al interactuar'], ['sound', 'Sonidos de descanso y avisos']] as const).map(([key, label]) => <View key={key} style={styles.row}><Text style={[styles.label, { color: theme.text }]}>{label}</Text><Switch accessibilityLabel={label} disabled={busy} value={preferences[key]} onValueChange={(value) => void update(key, value)} trackColor={{ true: theme.primary, false: theme.glassBorder }}/></View>)}{error ? <Text accessibilityRole="alert" style={{ color: theme.text }}>{error}</Text> : null}</View>;
}
const styles = StyleSheet.create({ content: { gap: 14 }, heading: { fontSize: 24, fontWeight: '900' }, row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 16 }, label: { flex: 1, fontSize: 16 } });
