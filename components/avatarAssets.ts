import { ImageSourcePropType } from 'react-native';
import { AvatarId } from '../constants/avatars';

export const AVATAR_ASSETS: Record<AvatarId, ImageSourcePropType> = {
  'capybara-athlete': require('../assets/capybara-athlete.png'),
  'capybara-mark': require('../assets/avatar-capybara-mark.png'),
  capigirl: require('../assets/capigirl.png'),
};
