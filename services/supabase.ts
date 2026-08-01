import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigurationError = !supabaseUrl || !supabaseAnonKey
  ? 'Falta la configuración pública de Supabase. Define EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY.'
  : null;

export const supabase: SupabaseClient | null = supabaseConfigurationError
  ? null
  : createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

export function setSupabaseAppState(state: string): void {
  if (!supabase || Platform.OS === 'web') return;
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
    if (!supabase.realtime.isConnected()) supabase.realtime.connect();
  } else {
    supabase.auth.stopAutoRefresh();
  }
}

export function subscribeToSupabaseAppState(): () => void {
  if (!supabase || Platform.OS === 'web') return () => undefined;
  return AppState.addEventListener('change', setSupabaseAppState).remove;
}
