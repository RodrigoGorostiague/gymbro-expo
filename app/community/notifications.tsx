import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../components/AppNavBar';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { HapticPressable } from '../../components/HapticPressable';
import { GlassButton } from '../../components/UI';
import { useTheme } from '../../context/ThemeContext';
import {
  listNotificationInbox,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationInboxItem,
} from '../../services/notificationInbox';

function notificationUrl(notification: NotificationInboxItem): string | null {
  const url = notification.data.url;
  return typeof url === 'string' && url.startsWith('/') ? url : null;
}

export default function NotificationInboxScreen() {
  const { theme } = useTheme();
  const [items, setItems] = useState<NotificationInboxItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listNotificationInbox());
    } catch (error) {
      Alert.alert('Notificaciones no disponibles', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const open = async (notification: NotificationInboxItem) => {
    try {
      if (!notification.readAt) {
        await markNotificationRead(notification.id);
        setItems((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
      }
      const url = notificationUrl(notification);
      if (url) router.push(url);
    } catch (error) {
      Alert.alert('No se pudo abrir', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    }
  };

  const markAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    } catch (error) {
      Alert.alert('No se pudieron actualizar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    }
  };

  return <ThemeBackground><SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.scroll}>
    <AppNavBar onBack={() => router.back()} trailing={<GlassButton title="Marcar leídas" variant="secondary" onPress={() => void markAllRead()} />} />
    <Text style={[styles.title, { color: theme.text }]}>Notificaciones</Text>
    <Text style={{ color: theme.textMuted }}>Solicitudes, invitaciones y actividad de tu círculo.</Text>
    {loading ? <Text style={{ color: theme.textMuted }}>Actualizando...</Text> : null}
    {!loading && !items.length ? <GlassCard><Text style={{ color: theme.textMuted }}>No tienes notificaciones nuevas.</Text></GlassCard> : null}
    {items.map((item) => <HapticPressable key={item.id} accessibilityRole="button" accessibilityLabel={item.title} onPress={() => void open(item)}>
      <GlassCard style={[styles.card, !item.readAt && { borderColor: theme.primary }]}>
        <Text style={[styles.itemTitle, { color: theme.text }]}>{item.title}</Text>
        {item.body ? <Text style={{ color: theme.textMuted }}>{item.body}</Text> : null}
        <Text style={[styles.meta, { color: theme.primary }]}>{item.readAt ? 'Leída' : 'Nueva'}</Text>
      </GlassCard>
    </HapticPressable>)}
  </ScrollView></SafeAreaView></ThemeBackground>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 20, gap: 12, paddingBottom: 36 },
  title: { fontSize: 26, fontWeight: '900' },
  card: { gap: 7, paddingVertical: 16, borderWidth: 1 },
  itemTitle: { fontSize: 17, fontWeight: '800' },
  meta: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
});
