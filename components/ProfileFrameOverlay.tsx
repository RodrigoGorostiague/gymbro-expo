import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { profileFrameForId, ProfileFrameId } from '../constants/profileFrames';
import { PROFILE_FRAME_ASSETS } from './profileFrameAssets';

export function ProfileFrameOverlay({ frameId, level, size, locked = false }: {
  frameId: ProfileFrameId;
  level?: number;
  size: number;
  locked?: boolean;
}) {
  const frame = profileFrameForId(frameId);
  const frameSize = size * frame.scale;

  return <View pointerEvents="none" style={[styles.wrap, { width: frameSize, height: frameSize, left: (size - frameSize) / 2, top: (size - frameSize) / 2 + size * frame.verticalOffset }]}>
    <Image source={PROFILE_FRAME_ASSETS[frameId]} resizeMode={frame.resizeMode} style={[styles.image, locked && styles.locked]} />
    {level !== undefined ? <Text accessibilityElementsHidden style={[styles.level, { fontSize: Math.max(8, size * 0.19) }]}>{level}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute' },
  image: { height: '100%', width: '100%' },
  locked: { opacity: 0.62, tintColor: '#9CA3AF' },
  level: { bottom: '8%', color: '#FFFFFF', fontWeight: '900', position: 'absolute', textAlign: 'center', textShadowColor: '#000000', textShadowRadius: 3, width: '100%' },
});
