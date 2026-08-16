import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { profileFrameForId, ProfileFrameId } from '../constants/profileFrames';
import { useCosmeticAsset } from '../services/cosmetics';

const fallbackFrame = process.env.NODE_ENV === 'test' ? 0 : require('../assets/profile-frames/principiante.png');

export function ProfileFrameOverlay({ frameId, level, size, locked = false }: {
  frameId: ProfileFrameId;
  level?: number;
  size: number;
  locked?: boolean;
}) {
  const frame = profileFrameForId(frameId);
  const frameSize = size * frame.scale;
  const source = useCosmeticAsset('frames', frameId) ?? fallbackFrame;
  const contentFit = frame.resizeMode === 'contain' ? 'contain' : 'cover';

  return <View pointerEvents="none" style={[styles.wrap, { width: frameSize, height: frameSize, left: (size - frameSize) / 2, top: (size - frameSize) / 2 + size * frame.verticalOffset }]}>
    <Image cachePolicy="disk" contentFit={contentFit} source={source} style={[styles.image, locked && styles.locked]} />
    {level !== undefined ? <Text accessibilityElementsHidden style={[styles.level, { fontSize: Math.max(8, size * 0.19) }]}>{level}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute' },
  image: { height: '100%', width: '100%' },
  locked: { opacity: 0.62, tintColor: '#9CA3AF' },
  level: { bottom: '8%', color: '#FFFFFF', fontWeight: '900', position: 'absolute', textAlign: 'center', textShadowColor: '#000000', textShadowRadius: 3, width: '100%' },
});
