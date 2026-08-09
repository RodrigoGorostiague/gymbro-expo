import React, { useState } from 'react';
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
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { DEFAULT_AVATAR_ID } from '../../constants/avatars';
import { PROFILE_FRAMES } from '../../constants/profileFrames';
import {
  getShopTheme,
  getThemesByRarity,
  isProfileThemeId,
  PROFILE_THEMES,
  SHOP_RARITIES,
  ShopTheme,
} from '../../constants/shopThemes';
import { useAuth } from '../../context/AuthContext';
import { useShop } from '../../context/ShopContext';
import { useTheme } from '../../context/ThemeContext';
import { ShopThemeRarity, UserProfile } from '../../types';

const RARITY_COLORS: Record<ShopThemeRarity, string> = {
  common: '#B8C2D1',
  rare: '#8B7CFF',
  exclusive: '#F6C453',
};

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
  const rarityColor = RARITY_COLORS[item.rarity];

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
              <View style={styles.themeTitleRow}>
                <Text style={[styles.themeName, { color: theme.text }]}>{item.name}</Text>
                {!isProfileThemeId(item.id) && (
                  <View style={[styles.rarityBadge, { backgroundColor: `${rarityColor}30`, borderColor: rarityColor }]}>
                    <Text style={[styles.rarityLabel, { color: rarityColor }]}>{item.rarity}</Text>
                  </View>
                )}
              </View>
              {item.description ? (
                <Text style={[styles.themeDesc, { color: theme.textMuted }]}>{item.description}</Text>
              ) : null}
              {item.interaction && (
                <Text style={[styles.effectHint, { color: item.accent }]}>Destello al completar una serie</Text>
              )}
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

function FrameCard({ item, onBuy }: { item: Extract<(typeof PROFILE_FRAMES)[number], { kind: 'shop' }>; onBuy: () => void }) {
  const { theme } = useTheme();
  const { gems, purchasedFrameIds } = useShop();
  const owned = purchasedFrameIds.includes(item.id);
  const canAfford = gems >= item.price;
  return <GlassCard style={styles.frameCard}>
    <View style={styles.frameRow}>
      <View style={styles.frameArt}><ProfileAvatar avatarId={DEFAULT_AVATAR_ID} frameId={item.id} size={68} borderColor={theme.primary} /></View>
      <View style={styles.themeInfo}>
        <Text style={[styles.themeName, { color: theme.text }]}>{item.label}</Text>
        <Text style={[styles.themeDesc, { color: theme.textMuted }]}>Marco de perfil</Text>
        <Text style={[styles.themePrice, { color: theme.textMuted }]}>{owned ? 'Desbloqueado' : `${item.price} gemas`}</Text>
      </View>
    </View>
    <HapticPressable disabled={owned || !canAfford} onPress={onBuy} style={[styles.frameAction, { backgroundColor: owned || !canAfford ? theme.glass : theme.primary }]}>
      <Text style={{ color: owned || !canAfford ? theme.textMuted : theme.onPrimary, fontWeight: '700' }}>{owned ? 'Desbloqueado' : canAfford ? 'Comprar' : 'Sin gemas'}</Text>
    </HapticPressable>
  </GlassCard>;
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
    purchaseFrame,
    equipTheme,
    unequipTheme,
    startPreview,
  } = useShop();
  const [activeTab, setActiveTab] = useState<'themes' | 'frames' | 'titles'>('themes');

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
        <View style={styles.header}><AppScreenHeader title="Más" subtitle="Tienda, temas y ayuda" trailing={<LogoutButton />} /></View>
        <View style={[styles.commerceBar, { backgroundColor: theme.background?.[0] ?? theme.glass, borderColor: theme.glassBorder }]}>
          <View style={styles.balanceHeader}>
            <View style={styles.balanceSummary}><Ionicons name="diamond" size={18} color={theme.primary} /><Text style={[styles.balanceLabel, { color: theme.textMuted }]}>Gemas</Text><Text style={[styles.balanceValue, { color: theme.primary }]}>{gems}</Text></View>
            <HapticPressable onPress={showGemsHelp} style={({ pressed }) => [styles.helpBtn, { borderColor: theme.glassBorder, backgroundColor: theme.glass, opacity: pressed ? 0.75 : 1 }]}><Ionicons name="help-circle-outline" size={16} color={theme.primary} /><Text style={[styles.helpBtnText, { color: theme.primary }]}>Ayuda</Text></HapticPressable>
          </View>
          <View accessibilityRole="tablist" style={styles.tabs}>
            {([['themes', 'Temas'], ['frames', 'Marcos'], ['titles', 'Títulos']] as const).map(([id, label]) => <HapticPressable key={id} accessibilityRole="tab" accessibilityState={{ selected: activeTab === id }} onPress={() => setActiveTab(id)} style={[styles.tab, { borderColor: activeTab === id ? theme.primary : theme.glassBorder, backgroundColor: activeTab === id ? theme.glass : 'transparent' }]}><Text style={{ color: activeTab === id ? theme.primary : theme.textMuted, fontWeight: '800' }}>{label}</Text></HapticPressable>)}
          </View>
        </View>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            previewThemeId ? styles.scrollWithPreview : null,
          ]}
          showsVerticalScrollIndicator={false}
        >
          <CombineWithPartnerCard />

          {activeTab === 'themes' && <><View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Temas de perfil</Text>
            {PROFILE_THEMES.map((item) => (
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

          {SHOP_RARITIES.map((rarity) => {
            const items = getThemesByRarity(rarity.key);
            if (items.length === 0) return null;

            return (
              <View key={rarity.key} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.rarityMarker, { backgroundColor: RARITY_COLORS[rarity.key] }]} />
                  <View style={styles.sectionHeaderCopy}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>{rarity.label}</Text>
                    <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>{rarity.description}</Text>
                  </View>
                </View>
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
          </>}

          {activeTab === 'frames' && <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Marcos de perfil</Text>
            <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>Compralos con gemas y elegilos después desde tu perfil.</Text>
            {PROFILE_FRAMES.filter((frame): frame is Extract<(typeof PROFILE_FRAMES)[number], { kind: 'shop' }> => frame.kind === 'shop').map((item) => <FrameCard key={item.id} item={item} onBuy={() => Alert.alert('Comprar marco', `¿Comprar "${item.label}" por ${item.price} gemas?`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Comprar', onPress: () => { void purchaseFrame(item.id); } }])} />)}
          </View>}

          {activeTab === 'titles' && <GlassCard style={styles.comingSoon}><Text style={[styles.sectionTitle, { color: theme.text }]}>Títulos próximamente</Text><Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>La tienda de títulos llegará en una próxima actualización.</Text></GlassCard>}
        </ScrollView>
      </SafeAreaView>
    </ThemeBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12 },
  commerceBar: { borderBottomWidth: StyleSheet.hairlineWidth, gap: 10, paddingHorizontal: 20, paddingBottom: 12, paddingTop: 8, zIndex: 2, elevation: 2 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flex: 1, paddingVertical: 10 },
  frameCard: { gap: 12 },
  frameRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  frameArt: { alignItems: 'center', height: 72, justifyContent: 'center', width: 72 },
  frameAction: { alignItems: 'center', borderRadius: 12, paddingVertical: 11 },
  comingSoon: { gap: 6, padding: 18 },
  scroll: { padding: 20, paddingTop: 16, paddingBottom: 40 },
  scrollWithPreview: { paddingBottom: 120 },
  balanceHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceSummary: { alignItems: 'center', flexDirection: 'row', gap: 6 },
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
  balanceValue: { fontSize: 20, fontWeight: '900' },
  section: { marginBottom: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12, marginBottom: 10 },
  sectionHeaderCopy: { flex: 1 },
  rarityMarker: { width: 4, alignSelf: 'stretch', borderRadius: 4 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  sectionSubtitle: { fontSize: 12, marginTop: 2 },
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
  themeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  themeName: { fontSize: 17, fontWeight: '800' },
  rarityBadge: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 6, paddingVertical: 2 },
  rarityLabel: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  themeDesc: { fontSize: 12, marginTop: 2 },
  effectHint: { fontSize: 11, fontWeight: '700', marginTop: 3 },
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
