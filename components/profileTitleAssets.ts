import { ImageSourcePropType } from 'react-native';
import { PROFILE_TITLES, ProfileTitleId } from '../constants/profileFrames';

// Vitest runs in Node, where React Native's numeric static assets are unavailable.
const testAsset = process.env.NODE_ENV === 'test' ? 0 : null;

const PROFILE_TITLE_ASSETS: Record<ProfileTitleId, ImageSourcePropType> = {
  principiante: testAsset ?? require('../assets/profile-titles/principiante.png'),
  intermedio: testAsset ?? require('../assets/profile-titles/intermedio.png'),
  avanzado: testAsset ?? require('../assets/profile-titles/avanzado.png'),
  gymbro: testAsset ?? require('../assets/profile-titles/gymbro.png'),
  gymrat: testAsset ?? require('../assets/profile-titles/gymrat.png'),
  'g-boom': testAsset ?? require('../assets/profile-titles/g-boom.png'),
  alfa: testAsset ?? require('../assets/profile-titles/alfa.png'),
  'alfa-user': testAsset ?? require('../assets/profile-titles/alfa-user.png'),
  sigma: testAsset ?? require('../assets/profile-titles/sigma.png'),
  'brawl-rookie': testAsset ?? require('../assets/profile-titles/brawl/rookie.png'),
  'brawl-contender': testAsset ?? require('../assets/profile-titles/brawl/contender.png'),
  'brawl-challenger': testAsset ?? require('../assets/profile-titles/brawl/challenger.png'),
  'brawl-elite': testAsset ?? require('../assets/profile-titles/brawl/elite.png'),
  'brawl-apex': testAsset ?? require('../assets/profile-titles/brawl/apex.png'),
  'brawl-titan': testAsset ?? require('../assets/profile-titles/brawl/titan.png'),
  'brawl-warlord': testAsset ?? require('../assets/profile-titles/brawl/warlord.png'),
  'brawl-legend': testAsset ?? require('../assets/profile-titles/brawl/legend.png'),
};

export function profileTitleAssetForId(value: unknown): ImageSourcePropType | null {
  if (!PROFILE_TITLES.some((title) => title.id === value)) return null;
  return PROFILE_TITLE_ASSETS[value as ProfileTitleId];
}
