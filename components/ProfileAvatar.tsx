import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { AVATARS, AvatarId, avatarIdOrDefault } from '../constants/avatars';
import { ProfileFrameId, profileFrameIdOrDefault } from '../constants/profileFrames';
import { AVATAR_ASSETS } from './avatarAssets';
import { ProfileFrameOverlay } from './ProfileFrameOverlay';

interface ProfileAvatarProps {
  avatarId?: AvatarId | string | null;
  size?: number;
  borderColor?: string;
  frameId?: ProfileFrameId | string;
  level?: number;
  frameLocked?: boolean;
}

export function ProfileAvatar({ avatarId, size = 44, borderColor = 'rgba(255,255,255,0.28)', frameId, level, frameLocked = false }: ProfileAvatarProps) {
  const resolvedAvatarId = avatarIdOrDefault(avatarId);

  return (
    <View
      accessibilityLabel={`Avatar ${AVATARS[resolvedAvatarId].label}`}
      style={[styles.container, { width: size, height: size }]}
    >
      <View style={[styles.wrap, { borderRadius: size / 2, borderColor }]}>
        <Image source={AVATAR_ASSETS[resolvedAvatarId]} resizeMode="cover" style={styles.image} />
      </View>
      {frameId ? <ProfileFrameOverlay frameId={profileFrameIdOrDefault(frameId)} level={level} size={size} locked={frameLocked} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative' },
  wrap: {
    height: '100%',
    overflow: 'hidden',
    borderWidth: 1,
    width: '100%',
  },
  image: { width: '100%', height: '100%' },
});
