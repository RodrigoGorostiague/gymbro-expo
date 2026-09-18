import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { ProfileTitleId, profileTitleForId, profileTitleIdOrDefault } from '../constants/profileFrames';
import { useCosmeticAsset } from '../services/cosmetics';

export function ProfileTitleBadge({ titleId, size = 56 }: { titleId?: ProfileTitleId | string | null; size?: number }) {
  const resolvedTitleId = profileTitleIdOrDefault(titleId);
  const title = profileTitleForId(resolvedTitleId);
  const source = useCosmeticAsset('titles', title.id);
  if (titleId === null) return null;
  if (source) return <Image accessibilityLabel={`Título ${title.title}`} cachePolicy="disk" contentFit="contain" source={source} style={{ height: size, width: size * 2.25 }} />;
  return <View accessibilityLabel={`Título ${title.title}`} style={[styles.badge, { backgroundColor: title.titleColor }]}>
    <Text style={styles.text}>{title.title}</Text>
  </View>;
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderColor: 'rgba(255,255,255,0.42)', borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
  text: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.35, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 2, textTransform: 'uppercase' },
});
