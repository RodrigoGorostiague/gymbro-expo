import React, { useEffect, useState, useTransition } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
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
import { BackgroundEngine } from '../../components/BackgroundEngine';
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
import { SHOP_BACKGROUNDS, ShopBackground } from '../../constants/backgrounds';
import { useAuth } from '../../context/AuthContext';
import { useShop } from '../../context/ShopContext';
import { useTheme } from '../../context/ThemeContext';
import { ShopThemeRarity, UserProfile } from '../../types';

const RARITY_COLORS: Record<ShopThemeRarity, string> = {
  common: '#B8C2D1',
  rare: '#8B7CFF',
  exclusive: '#F6C453',
};

type ShopTab = 'themes' | 'frames' | 'backgrounds' | 'titles';
type ShopFrame = Extract<(typeof PROFILE_FRAMES)[number], { kind: 'shop' }>;
type ShopCatalogItem =
  | { id: string; type: 'theme-section'; title: string; subtitle?: string; rarityColor?: string }
  | { id: string; type: 'theme'; item: ShopTheme }
  | { id: string; type: 'frame'; item: ShopFrame }
  | { id: string; type: 'background'; item: ShopBackground }
  | { id: string; type: 'titles' };

function getCatalogItems(tab: ShopTab): ShopCatalogItem[] {
  if (tab === 'frames') {
    return PROFILE_FRAMES
      .filter((frame): frame is ShopFrame => frame.kind === 'shop')
      .map((item) => ({ id: item.id, type: 'frame', item }));
  }

  if (tab === 'backgrounds') {
    return SHOP_BACKGROUNDS.map((item) => ({ id: item.id, type: 'background', item }));
  }

  if (tab === 'titles') return [{ id: 'titles-coming-soon', type: 'titles' }];

  const items: ShopCatalogItem[] = [{ id: 'profile-themes', type: 'theme-section', title: 'Temas de perfil' }];
  items.push(...PROFILE_THEMES.map((item) => ({ id: item.id, type: 'theme' as const, item })));
  for (const rarity of SHOP_RARITIES) {
    const themes = getThemesByRarity(rarity.key);
    if (!themes.length) continue;
    items.push({
      id: `rarity-${rarity.key}`,
      type: 'theme-section',
      title: rarity.label,
      subtitle: rarity.description,
      rarityColor: RARITY_COLORS[rarity.key],
    });
    items.push(...themes.map((item) => ({ id: item.id, type: 'theme' as const, item })));
  }
  return items;
}

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

function BackgroundCard({ item, previewing, onPreview, onAction }: { item: ShopBackground; previewing: boolean; onPreview: () => void; onAction: () => void }) {
  const { theme } = useTheme();
  const { gems, purchasedBackgroundIds, equippedBackgroundId } = useShop();
  const owned = purchasedBackgroundIds.includes(item.id);
  const equipped = equippedBackgroundId === item.id;
  const canAfford = gems >= item.price;
  return <SelectablePulse selected={previewing || equipped} theme={theme} style={styles.themeCard}>
    <GlassCard style={styles.themeCardInner}>
      <HapticPressable onPress={onPreview}>
        <View style={styles.themeRow}>
          <View style={styles.preview}><BackgroundEngine backgroundId={item.id} parallax={false} /></View>
          <View style={styles.themeInfo}>
            <View style={styles.themeTitleRow}><Text style={[styles.themeName, { color: theme.text }]}>{item.name}</Text><View style={[styles.rarityBadge, { backgroundColor: `${RARITY_COLORS[item.rarity]}30`, borderColor: RARITY_COLORS[item.rarity] }]}><Text style={[styles.rarityLabel, { color: RARITY_COLORS[item.rarity] }]}>{item.rarity}</Text></View></View>
            <Text style={[styles.themeDesc, { color: theme.textMuted }]}>{item.description}</Text>
            <Text style={[styles.themePrice, { color: theme.textMuted }]}>{owned ? 'Desbloqueado' : `${item.price} gema`}</Text>
            {previewing ? <Text style={[styles.equippedTag, { color: theme.primary }]}>Previsualizando</Text> : null}
            {equipped && !previewing ? <Text style={[styles.equippedTag, { color: theme.success }]}>Activo</Text> : null}
          </View>
        </View>
      </HapticPressable>
      <HapticPressable onPress={onAction}>
        <View style={[styles.actionBtn, { backgroundColor: owned && equipped || !owned && !canAfford ? theme.glass : theme.primary }]}><Text style={{ color: owned && equipped || !owned && !canAfford ? theme.textMuted : theme.onPrimary, fontWeight: '700' }}>{owned ? equipped ? 'Quitar fondo' : 'Equipar' : canAfford ? 'Comprar' : 'Sin gemas'}</Text></View>
      </HapticPressable>
    </GlassCard>
  </SelectablePulse>;
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
    purchasedBackgroundIds,
    equippedBackgroundId,
    previewBackgroundId,
    purchaseBackground,
    equipBackground,
    unequipBackground,
    startBackgroundPreview,
    equipTheme,
    unequipTheme,
    startPreview,
  } = useShop();
  const [activeTab, setActiveTab] = useState<ShopTab>('themes');
  const [requestedTab, setRequestedTab] = useState<ShopTab | null>(null);
  const [isTabTransitionPending, startTabTransition] = useTransition();

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

  const handleBuyOrEquipBackground = (background: ShopBackground) => {
    const owned = purchasedBackgroundIds.includes(background.id);
    if (owned) {
      if (equippedBackgroundId === background.id) {
        Alert.alert('Fondo activo', '¿Volver al fondo del tema?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Quitar fondo', onPress: unequipBackground }]);
      } else equipBackground(background.id);
      return;
    }
    Alert.alert('Comprar fondo', `¿Comprar "${background.name}" por ${background.price} gema?`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Comprar', onPress: () => { void purchaseBackground(background.id); } }]);
  };

  useEffect(() => {
    if (!requestedTab || requestedTab === activeTab) {
      if (requestedTab === activeTab) setRequestedTab(null);
      return;
    }

    const frame = requestAnimationFrame(() => {
      startTabTransition(() => setActiveTab(requestedTab));
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, requestedTab, startTabTransition]);

  const catalogItems = getCatalogItems(activeTab);
  const isSwitchingTab = requestedTab !== null && requestedTab !== activeTab;
  const tabLabels: Readonly<Record<ShopTab, string>> = {
    themes: 'Temas',
    frames: 'Marcos',
    backgrounds: 'Fondos',
    titles: 'Títulos',
  };

  const selectTab = (tab: ShopTab) => {
    if (tab !== activeTab) setRequestedTab(tab);
  };

  const catalogHeader = (
    <>
      <CombineWithPartnerCard />
      {activeTab === 'frames' ? <View style={styles.sectionHeaderOnly}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Marcos de perfil</Text>
        <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>Compralos con gemas y elegilos después desde tu perfil.</Text>
      </View> : null}
      {activeTab === 'backgrounds' ? <View style={styles.sectionHeaderOnly}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Fondos animados</Text>
        <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>Se equipan por separado de los temas.</Text>
      </View> : null}
    </>
  );

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
            {(Object.entries(tabLabels) as [ShopTab, string][]).map(([id, label]) => {
              const pending = isSwitchingTab && requestedTab === id;
              const selected = activeTab === id;
              return <HapticPressable
                key={id}
                testID={`shop-tab-${id}`}
                accessibilityRole="tab"
                accessibilityLabel={pending ? `Cargando ${label}` : label}
                accessibilityState={{ selected, busy: pending }}
                onPress={() => selectTab(id)}
                style={[styles.tab, { borderColor: selected || pending ? theme.primary : theme.glassBorder, backgroundColor: selected ? theme.glass : 'transparent' }]}
              >
                {pending ? <ActivityIndicator color={theme.primary} size="small" /> : null}
                <Text style={{ color: selected || pending ? theme.primary : theme.textMuted, fontWeight: '800' }}>{label}</Text>
              </HapticPressable>;
            })}
          </View>
        </View>
        <FlatList
          data={catalogItems}
          extraData={{ previewThemeId, previewBackgroundId, purchasedThemeIds, purchasedBackgroundIds, equippedThemeId, equippedBackgroundId, gems }}
          key={activeTab}
          keyExtractor={(item) => item.id}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
          ListHeaderComponent={catalogHeader}
          ListFooterComponent={activeTab === 'themes' && hasCustomTheme ? <GlassButton title="Usar tema de perfil" onPress={unequipTheme} variant="secondary" /> : null}
          contentContainerStyle={[
            styles.scroll,
            previewThemeId ? styles.scrollWithPreview : null,
          ]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            if (item.type === 'theme-section') {
              return <View style={item.rarityColor ? styles.sectionHeader : styles.sectionHeaderOnly}>
                {item.rarityColor ? <View style={[styles.rarityMarker, { backgroundColor: item.rarityColor }]} /> : null}
                <View style={item.rarityColor ? styles.sectionHeaderCopy : undefined}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>{item.title}</Text>
                  {item.subtitle ? <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>{item.subtitle}</Text> : null}
                </View>
              </View>;
            }
            if (item.type === 'theme') return <ThemeCard item={item.item} user={user} previewing={previewThemeId === item.item.id} onPreview={() => startPreview(item.item.id)} onAction={() => handleBuyOrEquip(item.item.id)} />;
            if (item.type === 'frame') return <FrameCard item={item.item} onBuy={() => Alert.alert('Comprar marco', `¿Comprar "${item.item.label}" por ${item.item.price} gemas?`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Comprar', onPress: () => { void purchaseFrame(item.item.id); } }])} />;
            if (item.type === 'background') return <BackgroundCard item={item.item} previewing={previewBackgroundId === item.item.id} onPreview={() => startBackgroundPreview(item.item.id)} onAction={() => handleBuyOrEquipBackground(item.item)} />;
            return <GlassCard style={styles.comingSoon}><Text style={[styles.sectionTitle, { color: theme.text }]}>Títulos próximamente</Text><Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>La tienda de títulos llegará en una próxima actualización.</Text></GlassCard>;
          }}
        />
      </SafeAreaView>
    </ThemeBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12 },
  commerceBar: { borderBottomWidth: StyleSheet.hairlineWidth, gap: 10, paddingHorizontal: 20, paddingBottom: 12, paddingTop: 8, zIndex: 2, elevation: 2 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 5, justifyContent: 'center', paddingVertical: 10 },
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
  sectionHeaderOnly: { marginTop: 12, marginBottom: 10 },
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
