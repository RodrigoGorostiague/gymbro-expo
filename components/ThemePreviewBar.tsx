import { Alert, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { HapticPressable } from './HapticPressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getShopTheme } from '../constants/shopThemes';
import { useShop } from '../context/ShopContext';
import { useTheme } from '../context/ThemeContext';

export function ThemePreviewBar() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const {
    previewThemeId,
    gems,
    purchasedThemeIds,
    stopPreview,
    purchaseTheme,
    equipTheme,
  } = useShop();

  if (!previewThemeId) return null;

  const item = getShopTheme(previewThemeId);
  if (!item) return null;

  const owned = purchasedThemeIds.includes(previewThemeId);
  const canAfford = gems >= item.price;

  const handlePrimary = () => {
    if (owned) {
      equipTheme(previewThemeId);
      return;
    }

    if (!canAfford) {
      Alert.alert('Gemas insuficientes', `Necesitas ${item.price} gemas para "${item.name}".`);
      return;
    }

    Alert.alert('Comprar tema', `¿Comprar "${item.name}" por ${item.price} gemas?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Comprar', onPress: () => purchaseTheme(previewThemeId) },
    ]);
  };

  const innerGlass =
    theme.blurTint === 'light' ? 'rgba(255,255,255,0.75)' : 'rgba(8,8,14,0.72)';

  return (
    <View style={[styles.wrap, { bottom: 68, paddingBottom: Math.max(insets.bottom, 8) }]}>
      <LinearGradient
        colors={[theme.primary, theme.accent, theme.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.border}
      >
        <View style={styles.inner}>
          <BlurView intensity={55} tint={theme.blurTint} style={styles.blur}>
            <View style={[styles.content, { backgroundColor: innerGlass }]}>
              <View style={styles.info}>
                <Text style={[styles.label, { color: theme.primary }]}>Vista previa</Text>
                <Text style={[styles.name, { color: theme.text }]}>{item.name}</Text>
              </View>

              <View style={styles.actions}>
                <HapticPressable onPress={handlePrimary} style={styles.primaryWrap}>
                  <LinearGradient
                    colors={[theme.primary, theme.accent]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.primaryBtn}
                  >
                    <Text style={[styles.primaryText, { color: theme.onPrimary }]}>
                      {owned ? 'Equipar' : canAfford ? 'Comprar' : 'Sin gemas'}
                    </Text>
                  </LinearGradient>
                </HapticPressable>

                <HapticPressable
                  onPress={stopPreview}
                  style={[styles.closeBtn, { borderColor: theme.glassBorder }]}
                >
                  <Text style={[styles.closeText, { color: theme.textMuted }]}>Cerrar</Text>
                </HapticPressable>
              </View>
            </View>
          </BlurView>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  border: {
    borderRadius: 20,
    padding: 1.5,
  },
  inner: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  blur: {
    borderRadius: 18,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  info: {
    flex: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  name: {
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryWrap: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  primaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryText: {
    fontSize: 13,
    fontWeight: '800',
  },
  closeBtn: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  closeText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
