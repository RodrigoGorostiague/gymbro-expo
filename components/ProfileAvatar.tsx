import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { AVATARS, AvatarId, avatarIdOrDefault } from '../constants/avatars';
import { AVATAR_ASSETS } from './avatarAssets';

interface ProfileAvatarProps {
  avatarId?: AvatarId | string | null;
  size?: number;
  borderColor?: string;
}

export function ProfileAvatar({ avatarId, size = 44, borderColor = 'rgba(255,255,255,0.28)' }: ProfileAvatarProps) {
  const resolvedAvatarId = avatarIdOrDefault(avatarId);

  return (
    <View
      accessibilityLabel={`Avatar ${AVATARS[resolvedAvatarId].label}`}
      style={[styles.wrap, { width: size, height: size, borderRadius: size / 2, borderColor }]}
    >
      <Image source={AVATAR_ASSETS[resolvedAvatarId]} resizeMode="cover" style={styles.image} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    borderWidth: 1,
  },
  image: { width: '100%', height: '100%' },
});
