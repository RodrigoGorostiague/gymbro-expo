import { supabase, supabaseConfigurationError } from './supabase';

export type OnboardingSex = 'male' | 'female';
export type OnboardingState = {
  completed: boolean;
  realName: string | null;
  birthDate: string | null;
  sex: OnboardingSex | null;
};

function requireClient() {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'El onboarding no está configurado.');
  return supabase;
}

export async function getOwnOnboarding(): Promise<OnboardingState> {
  const { data, error } = await requireClient().rpc('get_own_onboarding');
  if (error) throw new Error(error.message);
  const value = (data ?? {}) as Record<string, unknown>;
  return {
    completed: value.completed === true,
    realName: typeof value.real_name === 'string' ? value.real_name : null,
    birthDate: typeof value.birth_date === 'string' ? value.birth_date : null,
    sex: value.sex === 'male' || value.sex === 'female' ? value.sex : null,
  };
}

export async function completeOwnOnboarding(input: { alias: string; realName: string; birthDate: string; sex: OnboardingSex }): Promise<void> {
  const { error } = await requireClient().rpc('complete_own_onboarding', {
    onboarding_input: { alias: input.alias.trim(), real_name: input.realName.trim(), birth_date: input.birthDate, sex: input.sex },
  });
  if (error) throw new Error(error.message);
}
