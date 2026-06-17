import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

export function vibrateButtonPress(): void {
  if (Platform.OS === 'web') return;

  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
    Vibration.vibrate(10);
  });
}

export function vibrateRestTimerComplete(): void {
  if (Platform.OS === 'web') return;

  void (async () => {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 350, 100, 350, 100, 500]);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 150));
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {
      Vibration.vibrate([0, 400, 150, 400, 150, 600]);
    }
  })();
}

export function withButtonHaptic(onPress?: () => void): () => void {
  return () => {
    vibrateButtonPress();
    onPress?.();
  };
}
