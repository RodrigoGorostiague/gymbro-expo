import { RewardReceipt } from '../types';
import { supabase, supabaseConfigurationError } from './supabase';

export type RewardWallet = {
  balance: number;
  purchasedThemeIds: string[];
  equippedThemeId: string | null;
  combineWithPartner: boolean;
};

export type WelcomeGemReward = { claimed: boolean; wallet: RewardWallet };

function requireClient() {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'La billetera remota no está configurada.');
  return supabase;
}

function isWallet(value: unknown): value is RewardWallet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const wallet = value as Record<string, unknown>;
  return Number.isInteger(wallet.balance) && (wallet.balance as number) >= 0
    && Array.isArray(wallet.purchasedThemeIds) && wallet.purchasedThemeIds.every((id) => typeof id === 'string')
    && (wallet.equippedThemeId === null || typeof wallet.equippedThemeId === 'string')
    && typeof wallet.combineWithPartner === 'boolean';
}

function isWelcomeGemReward(value: unknown): value is WelcomeGemReward {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const reward = value as Record<string, unknown>;
  return typeof reward.claimed === 'boolean' && isWallet(reward.wallet);
}

async function walletRpc(name: string, args: Record<string, unknown> = {}): Promise<RewardWallet> {
  const { data, error } = await requireClient().rpc(name, args);
  if (error) throw new Error(`No se pudo actualizar la billetera: ${error.message}`);
  if (!isWallet(data)) throw new Error('La billetera remota tiene un formato inválido.');
  return data;
}

export const loadRewardWallet = () => walletRpc('load_reward_wallet');
export const purchaseRewardTheme = (themeId: string) => walletRpc('purchase_reward_theme', { theme_id_input: themeId });
export const updateRewardWalletPreferences = (equippedThemeId: string | null, combineWithPartner: boolean) => (
  walletRpc('update_reward_wallet_preferences', { equipped_theme_id_input: equippedThemeId, combine_with_partner_input: combineWithPartner })
);

export async function claimWelcomeGemReward(): Promise<WelcomeGemReward> {
  const { data, error } = await requireClient().rpc('claim_welcome_gem_reward', {});
  if (error) throw new Error(`No se pudo acreditar el regalo de bienvenida: ${error.message}`);
  if (!isWelcomeGemReward(data)) throw new Error('El regalo de bienvenida tiene un formato inválido.');
  return data;
}

export function receiptTotal(receipt: RewardReceipt): number {
  return receipt.entries.reduce((total, entry) => total + Math.max(0, entry.amount), 0);
}
