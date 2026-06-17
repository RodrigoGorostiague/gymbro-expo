import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { HapticPressable } from './HapticPressable';
import { GlassCard } from './GlassCard';
import { PARTNER_PROFILE } from '../constants/kiss';
import { useAuth } from '../context/AuthContext';
import { useShop } from '../context/ShopContext';
import { useTheme } from '../context/ThemeContext';
import { resolveActiveTheme } from '../utils/theme';

export function CombineWithPartnerCard() {
  const { user } = useAuth();
  const { theme, dualThemes } = useTheme();
  const {
    combineWithPartner,
    setCombineWithPartner,
    selfEquippedThemeId,
    partnerEquippedThemeId,
  } = useShop();

  if (!user) return null;

  const partner = PARTNER_PROFILE[user];
  const selfTheme = resolveActiveTheme(user, selfEquippedThemeId);
  const partnerTheme = resolveActiveTheme(partner, partnerEquippedThemeId);
  const previewRodaja = user === 'rodaja' ? selfTheme : partnerTheme;
  const previewBrisas = user === 'brisas' ? selfTheme : partnerTheme;

  return (
    <GlassCard style={styles.card}>
      <Text style={[styles.title, { color: theme.text }]}>Combinar con {partner}</Text>
      <Text style={[styles.subtitle, { color: theme.textMuted }]}>
        Mezcla tu tema con el de {partner}, como en el login. Al desactivar, solo queda el tuyo.
      </Text>

      <View style={styles.preview}>
        <LinearGradient
          colors={previewRodaja.background as [string, string, ...string[]]}
          style={styles.previewHalf}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <LinearGradient
          colors={previewBrisas.background as [string, string, ...string[]]}
          style={[styles.previewHalf, styles.previewHalfRight]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
        <View style={styles.previewSeam} />
        <View style={styles.previewLabels}>
          <View style={[styles.chip, { backgroundColor: previewRodaja.glass }]}>
            <View style={[styles.dot, { backgroundColor: previewRodaja.primary }]} />
            <Text style={styles.chipText}>rodaja</Text>
          </View>
          <Text style={styles.infinity}>∞</Text>
          <View style={[styles.chip, { backgroundColor: previewBrisas.glass }]}>
            <View style={[styles.dot, { backgroundColor: previewBrisas.primary }]} />
            <Text style={styles.chipText}>brisas</Text>
          </View>
        </View>
      </View>

      <HapticPressable
        onPress={() => setCombineWithPartner(!combineWithPartner)}
        style={styles.toggleWrap}
      >
        <LinearGradient
          colors={
            combineWithPartner
              ? [selfTheme.primary, partnerTheme.primary]
              : [theme.glassBorder, theme.glassBorder]
          }
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.toggleBorder}
        >
          <View
            style={[
              styles.toggleInner,
              {
                backgroundColor:
                  theme.blurTint === 'light' ? 'rgba(255,255,255,0.65)' : 'rgba(8,8,14,0.65)',
              },
            ]}
          >
            <Text style={[styles.toggleText, { color: theme.text }]}>
              {combineWithPartner ? `Combinando con ${partner}` : `Combinar con ${partner}`}
            </Text>
            <View
              style={[
                styles.togglePill,
                {
                  backgroundColor: combineWithPartner ? theme.success : theme.glass,
                  borderColor: theme.glassBorder,
                },
              ]}
            >
              <Text style={[styles.toggleState, { color: combineWithPartner ? '#FFF' : theme.textMuted }]}>
                {combineWithPartner ? 'ON' : 'OFF'}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </HapticPressable>

      {combineWithPartner && dualThemes ? (
        <Text style={[styles.activeHint, { color: theme.primary }]}>
          Modo dual activo en toda la app
        </Text>
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 14,
  },
  preview: {
    height: 88,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
  },
  previewHalf: {
    ...StyleSheet.absoluteFill,
    width: '55%',
  },
  previewHalfRight: {
    left: '45%',
    width: '60%',
    opacity: 0.92,
    transform: [{ skewY: '-6deg' }, { translateY: -8 }],
  },
  previewSeam: {
    position: 'absolute',
    top: '46%',
    left: -8,
    right: -8,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.45)',
    transform: [{ rotate: '-6deg' }],
  },
  previewLabels: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  chipText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  infinity: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  toggleWrap: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  toggleBorder: {
    borderRadius: 14,
    padding: 1.5,
  },
  toggleInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    paddingRight: 8,
  },
  togglePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  toggleState: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  activeHint: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 10,
    letterSpacing: 0.3,
  },
});
