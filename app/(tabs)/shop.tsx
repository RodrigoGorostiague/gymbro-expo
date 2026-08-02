import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HapticPressable } from '../../components/HapticPressable';
import { AppScreenHeader } from '../../components/AppScreenHeader';
import { CombineWithPartnerCard } from '../../components/CombineWithPartnerCard';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { LogoutButton } from '../../components/LogoutButton';
import { SelectablePulse } from '../../components/SelectablePulse';
import { ThemeDecorations } from '../../components/ThemeDecorations';
import { GlassButton } from '../../components/UI';
import {
  getShopTheme,
  getThemesByCategory,
  isProfileThemeId,
  SHOP_CATEGORIES,
  ShopTheme,
} from '../../constants/shopThemes';
import { useAuth } from '../../context/AuthContext';
import { useShop } from '../../context/ShopContext';
import { useTheme } from '../../context/ThemeContext';
import { UserProfile } from '../../types';

function isThemeEquipped(
  itemId: string,
  equippedThemeId: string | null,
  user: UserProfile,
): boolean {
  if (equippedThemeId === itemId) return true;
  return equippedThemeId === null && itemId === `profile-${user}`;
}

function ThemeCard({
  item,
  previewing,
  onPreview,
  onAction,
  user,
}: {
  item: ShopTheme;
  previewing: boolean;
  onPreview: () => void;
  onAction: () => void;
  user: UserProfile;
}) {
  const { theme } = useTheme();
  const { gems, purchasedThemeIds, equippedThemeId } = useShop();
  const owned = purchasedThemeIds.includes(item.id) || isProfileThemeId(item.id);
  const equipped = isThemeEquipped(item.id, equippedThemeId, user);
  const canAfford = gems >= item.price;
  const selected = previewing || equipped;

  return (
    <SelectablePulse selected={selected} theme={item} style={styles.themeCard}>
      <GlassCard style={styles.themeCardInner}>
        <HapticPressable onPress={onPreview}>
          <View style={styles.themeRow}>
            <LinearGradient
              colors={item.background as [string, string, ...string[]]}
              style={styles.preview}
            >
              {item.decoration ? (
                <ThemeDecorations decoration={item.decoration} theme={item} compact />
              ) : (
                <View style={[styles.previewDot, { backgroundColor: item.primary }]} />
              )}
            </LinearGradient>

            <View style={styles.themeInfo}>
              <Text style={[styles.themeName, { color: theme.text }]}>{item.name}</Text>
              {item.description ? (
                <Text style={[styles.themeDesc, { color: theme.textMuted }]}>{item.description}</Text>
              ) : null}
              <Text style={[styles.themePrice, { color: theme.textMuted }]}>
                {isProfileThemeId(item.id)
                  ? 'Por defecto · incluido'
                  : owned
                    ? 'Desbloqueado'
                    : `${item.price} gemas`}
              </Text>
              {previewing && (
                <Text style={[styles.equippedTag, { color: theme.primary }]}>Previsualizando</Text>
              )}
              {equipped && !previewing && (
                <Text style={[styles.equippedTag, { color: theme.success }]}>Activo</Text>
              )}
            </View>
          </View>
        </HapticPressable>

        <HapticPressable onPress={onAction}>
          <LinearGradient
            colors={
              owned && !equipped
                ? [theme.primary, theme.accent]
                : owned && equipped
                  ? [theme.glassBorder, theme.glassBorder]
                  : canAfford
                    ? [theme.primary, theme.accent]
                    : [theme.glassBorder, theme.glassBorder]
            }
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.actionBorder}
          >
            <View
              style={[
                styles.actionBtn,
                {
                  backgroundColor:
                    owned && equipped
                      ? theme.glass
                      : owned && !equipped
                        ? 'transparent'
                        : canAfford
                          ? 'transparent'
                          : theme.glass,
                },
              ]}
            >
              <Text
                style={{
                  color:
                    owned && equipped
                      ? theme.textMuted
                      : owned && !equipped
                        ? theme.onPrimary
                        : canAfford
                          ? theme.onPrimary
                          : theme.textMuted,
                  fontWeight: '700',
                }}
              >
                {owned
                  ? equipped
                    ? isProfileThemeId(item.id)
                      ? 'Tema base'
                      : 'Quitar tema'
                    : 'Equipar'
                  : canAfford
                    ? 'Comprar'
                    : 'Sin gemas'}
              </Text>
            </View>
          </LinearGradient>
        </HapticPressable>
      </GlassCard>
    </SelectablePulse>
  );
}

export default function ShopScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const {
    gems,
    purchasedThemeIds,
    equippedThemeId,
    previewThemeId,
    purchaseTheme,
    equipTheme,
    unequipTheme,
    startPreview,
  } = useShop();

  if (!user) return null;

  const showGemsHelp = () => {
    Alert.alert(
      'Cómo ganar gemas',
      [
        'Cada serie válida suma +1 gema (máximo 12 por rutina).',
        'Con 70-99% de adherencia: +4. Con 100%: +10 y +6 de perfección.',
        'Al alcanzar tu meta semanal: +25; hasta dos rutinas extra dan +10. Los mesociclos planificados también tienen bonos.',
      ].join('\n\n'),
      [{ text: 'Entendido' }],
    );
  };

  const handleBuyOrEquip = (themeId: string) => {
    const owned = purchasedThemeIds.includes(themeId) || isProfileThemeId(themeId);
    const equipped = isThemeEquipped(themeId, equippedThemeId, user);
    const item = getShopTheme(themeId);
    if (!item) return;

    if (owned) {
      if (equipped) {
        if (isProfileThemeId(themeId)) return;
        Alert.alert('Tema activo', '¿Volver al tema de tu perfil?', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Quitar tema', onPress: unequipTheme },
        ]);
      } else {
        equipTheme(themeId);
      }
      return;
    }

    Alert.alert('Comprar tema', `¿Comprar "${item.name}" por ${item.price} gemas?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Comprar', onPress: () => { void purchaseTheme(themeId); } },
    ]);
  };

  const hasCustomTheme =
    equippedThemeId !== null && !isProfileThemeId(equippedThemeId);

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            previewThemeId ? styles.scrollWithPreview : null,
          ]}
          showsVerticalScrollIndicator={false}
        >
          <AppScreenHeader
            title="Más"
            subtitle="Tienda, temas y ayuda"
            trailing={<LogoutButton />}
          />

          <GlassCard style={styles.balanceCard}>
            <View style={styles.balanceHeader}>
              <Text style={[styles.balanceLabel, { color: theme.textMuted }]}>Tus gemas</Text>
              <HapticPressable
                onPress={showGemsHelp}
                style={({ pressed }) => [
                  styles.helpBtn,
                  {
                    borderColor: theme.glassBorder,
                    backgroundColor: theme.glass,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Ionicons name="help-circle-outline" size={16} color={theme.primary} />
                <Text style={[styles.helpBtnText, { color: theme.primary }]}>Ayuda</Text>
              </HapticPressable>
            </View>
            <Text style={[styles.balanceValue, { color: theme.primary }]}>{gems}</Text>
          </GlassCard>

          <CombineWithPartnerCard />

          {SHOP_CATEGORIES.map((category) => {
            const items = getThemesByCategory(category.key);
            if (items.length === 0) return null;

            return (
              <View key={category.key} style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>{category.label}</Text>
                {items.map((item) => (
                  <ThemeCard
                    key={item.id}
                    item={item}
                    user={user}
                    previewing={previewThemeId === item.id}
                    onPreview={() => startPreview(item.id)}
                    onAction={() => handleBuyOrEquip(item.id)}
                  />
                ))}
              </View>
            );
          })}

          {hasCustomTheme && (
            <GlassButton title="Usar tema de perfil" onPress={unequipTheme} variant="secondary" />
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemeBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 20, paddingTop: 12, paddingBottom: 40 },
  scrollWithPreview: { paddingBottom: 120 },
  balanceCard: {
    alignItems: 'center',
    marginVertical: 12,
    paddingVertical: 20,
  },
  balanceHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  balanceLabel: { fontSize: 13, fontWeight: '600' },
  helpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  helpBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  balanceValue: { fontSize: 40, fontWeight: '900', marginTop: 4 },
  section: { marginBottom: 8 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
    marginTop: 4,
  },
  themeCard: { marginBottom: 12 },
  themeCardInner: { marginBottom: 0 },
  themeRow: { flexDirection: 'row', gap: 14, marginBottom: 12 },
  preview: {
    width: 72,
    height: 72,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  themeInfo: { flex: 1, justifyContent: 'center' },
  themeName: { fontSize: 17, fontWeight: '800' },
  themeDesc: { fontSize: 12, marginTop: 2 },
  themePrice: { fontSize: 13, marginTop: 4 },
  equippedTag: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  actionBorder: {
    borderRadius: 12,
    padding: 1.5,
  },
  actionBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
