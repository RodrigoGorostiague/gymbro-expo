import { getSensoryPreferences } from './sensoryPreferences';
import { createAudioPlayer } from 'expo-audio';

const player = createAudioPlayer(require('../assets/sounds/notification_rest.wav'));

export function playRestNotificationSound(): void {
  if (!getSensoryPreferences().sound) return;
  void player.seekTo(0).then(() => player.play()).catch(() => undefined);
}
