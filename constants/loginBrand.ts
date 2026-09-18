import type { AppTheme } from '../types';

const base: Omit<AppTheme, 'primary' | 'accent'> = {
  secondary: '#C56B00',
  background: ['#090909', '#15110B', '#090909'],
  glass: 'rgba(24, 20, 15, 0.86)',
  glassBorder: 'rgba(255, 190, 66, 0.35)',
  text: '#FFF8ED',
  textMuted: '#C9BBA8',
  onPrimary: '#1A0D00',
  success: '#9FE870',
  blurTint: 'dark',
  tabBarBackground: '#0D0D0D',
};

export const LOGIN_THEMES: Record<'rodaja' | 'brisas', AppTheme> = {
  rodaja: { ...base, primary: '#FF9700', accent: '#FFE1A6' },
  brisas: { ...base, primary: '#E8DDD0', accent: '#FF9700' },
};
