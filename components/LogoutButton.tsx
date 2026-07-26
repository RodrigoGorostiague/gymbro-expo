import { Alert, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { HapticPressable } from './HapticPressable';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export function LogoutButton() {
  const { logout } = useAuth();
  const { theme } = useTheme();

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Quieres volver a la pantalla de acceso?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: () => logout().then(() => router.replace('/')),
      },
    ]);
  };

  return (
    <HapticPressable onPress={handleLogout} style={styles.wrap}>
      <LinearGradient
        colors={[theme.primary, theme.accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.border}
      >
        <View
          style={[
            styles.button,
            {
              backgroundColor:
                theme.blurTint === 'light' ? 'rgba(255,255,255,0.7)' : 'rgba(8,8,14,0.65)',
            },
          ]}
        >
          <Ionicons name="log-out-outline" size={15} color={theme.primary} />
          <Text style={[styles.label, { color: theme.textMuted }]}>Salir</Text>
        </View>
      </LinearGradient>
    </HapticPressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  border: {
    borderRadius: 14,
    padding: 1.5,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});
