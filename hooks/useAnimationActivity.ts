import { useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { useReducedMotion } from 'react-native-reanimated';
import { shouldRunAnimations } from '../utils/animationActivity';

export function useAnimationActivity(enabled = true) {
  const navigation = useContext(NavigationContext);
  const reduceMotion = useReducedMotion();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [navigationFocused, setNavigationFocused] = useState(() => navigation?.isFocused() ?? true);

  useEffect(() => {
    if (!enabled) return undefined;
    setAppActive(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => subscription.remove();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (!navigation) {
      setNavigationFocused(true);
      return undefined;
    }
    setNavigationFocused(navigation.isFocused());
    const unsubscribeFocus = navigation.addListener('focus', () => setNavigationFocused(true));
    const unsubscribeBlur = navigation.addListener('blur', () => setNavigationFocused(false));
    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [enabled, navigation]);

  return shouldRunAnimations({ appActive, enabled, navigationFocused, reduceMotion });
}
