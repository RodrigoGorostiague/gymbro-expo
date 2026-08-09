import { createAudioPlayer } from 'expo-audio';

const player = createAudioPlayer(require('../assets/sounds/notification_social.wav'));

/** Reuses the installed social cue without scheduling another system notification. */
export function playSocialNotificationSound(): void {
  void player.seekTo(0).then(() => player.play()).catch(() => undefined);
}
