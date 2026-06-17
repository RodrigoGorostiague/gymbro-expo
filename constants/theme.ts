import { AppTheme, UserProfile } from '../types';

export const THEMES: Record<UserProfile, AppTheme> = {
  rodaja: {
    primary: '#E85D04',
    secondary: '#DC2F02',
    accent: '#F48C06',
    background: ['#1A0A00', '#3D1300', '#6B2A00'],
    glass: 'rgba(255, 120, 40, 0.15)',
    glassBorder: 'rgba(255, 160, 80, 0.35)',
    text: '#FFF5EB',
    textMuted: 'rgba(255, 245, 235, 0.65)',
    onPrimary: '#FFF5EB',
    success: '#52B788',
    blurTint: 'dark',
    tabBarBackground: 'rgba(8, 8, 12, 0.92)',
  },
  brisas: {
    primary: '#D63384',
    secondary: '#9B59B6',
    accent: '#FF85C0',
    background: ['#FFF7FC', '#FDE8F3', '#EDE0F8'],
    glass: 'rgba(255, 255, 255, 0.68)',
    glassBorder: 'rgba(155, 89, 182, 0.28)',
    text: '#3A1F45',
    textMuted: 'rgba(58, 31, 69, 0.62)',
    onPrimary: '#FFFFFF',
    success: '#2E9E6A',
    blurTint: 'light',
    tabBarBackground: 'rgba(255, 247, 252, 0.96)',
  },
};

export const LOGIN_HINT = {
  rodaja: { user: 'rodaja', pass: '1234' },
  brisas: { user: 'brisas', pass: 'sonrisas' },
};
