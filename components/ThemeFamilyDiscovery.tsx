import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { THEME_FAMILIES, familyForThemeId } from '../constants/themeFamilies';
import { getShopTheme, ShopTheme } from '../constants/shopThemes';
import { useTheme } from '../context/ThemeContext';
import { HapticPressable } from './HapticPressable';
import { ThemeFamilyTexture } from './ThemeFamilyTexture';
export function ThemeFamilyDiscovery({ equippedId, renderTheme }: {
    equippedId: string | null;
    renderTheme: (theme: ShopTheme) => React.ReactNode;
}) {
    const { theme } = useTheme();
    const [familyId, setFamilyId] = useState(familyForThemeId(equippedId)?.id ?? THEME_FAMILIES[0].id);
    const [variantId, setVariantId] = useState(equippedId);
    const family = THEME_FAMILIES.find(({ id }) => id === familyId)!;
    const selected = getShopTheme(variantId ?? '') ?? getShopTheme(family.representative)!;
    return <View style={styles.content}>
    <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>Ocho formas de entrenar a tu estilo</Text>
    <Text style={{ color: theme.textMuted }}>Elige una familia visual y explora sus variantes. Tu colección y sus identificadores no cambian.</Text>
    <View style={styles.grid}>
      {THEME_FAMILIES.map((candidate) => {
            const palette = getShopTheme(candidate.representative)!;
            return <HapticPressable key={candidate.id} accessibilityRole="button" accessibilityLabel={`Familia ${candidate.name}`} accessibilityState={{ selected: candidate.id === familyId }} onPress={() => { setFamilyId(candidate.id); setVariantId(candidate.representative); }} style={[styles.tile, {
                    borderRadius: candidate.radius, borderColor: candidate.id === familyId ? theme.primary : theme.glassBorder, borderWidth: candidate.border
                }]}>
          <LinearGradient colors={palette.background as [
                string,
                string,
                ...string[]
            ]} style={StyleSheet.absoluteFill}/>
          <ThemeFamilyTexture family={candidate.texture} color={palette.accent} opacity={0.3}/>
          <Text style={[styles.name, { color: palette.text }]}>{candidate.name}</Text>
        </HapticPressable>;
        })}
    </View>
    <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>{family.name}</Text>
    <Text style={{ color: theme.textMuted }}>{family.description}</Text>
    <View style={styles.variants}>
      {family.variants.map((id) => {
            const variant = getShopTheme(id)!;
            return <HapticPressable key={id} accessibilityRole="radio" accessibilityLabel={`Variante ${variant.name}`} accessibilityState={{ selected: selected.id === id }} onPress={() => setVariantId(id)} style={[styles.variant, { borderColor: selected.id === id ? theme.primary : theme.glassBorder, backgroundColor: theme.glass }]}><Text style={{ color: theme.text }}>{variant.name}</Text></HapticPressable>;
        })}
    </View>
    {renderTheme(selected)}
  </View>;
}
const styles = StyleSheet.create({
    content: { gap: 14 }, heading: { fontSize: 24, fontWeight: '900' }, grid: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 12
    }, tile: {
        width: '47%', minHeight: 110, padding: 16, justifyContent: 'flex-end', overflow: 'hidden'
    }, name: { fontSize: 23, fontWeight: '900' }, variants: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 8
    }, variant: {
        minHeight: 48, padding: 12, borderRadius: 14, borderWidth: 1
    }
});
