import { RewardReceipt } from '../types';
import { supabase, supabaseConfigurationError } from './supabase';

export type RewardWallet = {
  balance: number;
  purchasedThemeIds: string[];
  purchasedFrameIds: string[];
  purchasedTitleIds: string[];
  equippedThemeId: string | null;
  combineWithPartner: boolean;
};

export type WelcomeGemReward = { claimed: boolean; wallet: RewardWallet };
export type ReleaseGemReward = { claimed: boolean; wallet: RewardWallet };
export type ReleaseUpdate = { version: string; title: string; message: string; features: string[]; fixes: string[]; rewardGems: number; rewardClaimed: boolean };
export type ReleaseUpdates = { claimed: boolean; wallet: RewardWallet; releases: ReleaseUpdate[] };

function requireClient() {
  if (!supabase) throw new Error(supabaseConfigurationError ?? 'La billetera remota no está configurada.');
  return supabase;
}

function isWallet(value: unknown): value is RewardWallet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const wallet = value as Record<string, unknown>;
  return Number.isInteger(wallet.balance) && (wallet.balance as number) >= 0
    && Array.isArray(wallet.purchasedThemeIds) && wallet.purchasedThemeIds.every((id) => typeof id === 'string')
    && Array.isArray(wallet.purchasedFrameIds) && wallet.purchasedFrameIds.every((id) => typeof id === 'string')
    && Array.isArray(wallet.purchasedTitleIds) && wallet.purchasedTitleIds.every((id) => typeof id === 'string')
    && (wallet.equippedThemeId === null || typeof wallet.equippedThemeId === 'string')
    && typeof wallet.combineWithPartner === 'boolean';
}

function isWelcomeGemReward(value: unknown): value is WelcomeGemReward {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const reward = value as Record<string, unknown>;
  return typeof reward.claimed === 'boolean' && isWallet(reward.wallet);
}

function isReleaseGemReward(value: unknown): value is ReleaseGemReward {
  return isWelcomeGemReward(value);
}

function isReleaseUpdate(value: unknown): value is ReleaseUpdate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const release = value as Record<string, unknown>;
  return typeof release.version === 'string' && typeof release.title === 'string' && typeof release.message === 'string'
    && Array.isArray(release.features) && release.features.every((item) => typeof item === 'string')
    && Array.isArray(release.fixes) && release.fixes.every((item) => typeof item === 'string')
    && Number.isInteger(release.rewardGems) && (release.rewardGems as number) >= 0
    && typeof release.rewardClaimed === 'boolean';
}

function isReleaseUpdates(value: unknown): value is ReleaseUpdates {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const updates = value as Record<string, unknown>;
  return typeof updates.claimed === 'boolean' && isWallet(updates.wallet)
    && Array.isArray(updates.releases) && updates.releases.every(isReleaseUpdate);
}

async function walletRpc(name: string, args: Record<string, unknown> = {}): Promise<RewardWallet> {
  const { data, error } = await requireClient().rpc(name, args);
  if (error) throw new Error(`No se pudo actualizar la billetera: ${error.message}`);
  if (!isWallet(data)) throw new Error('La billetera remota tiene un formato inválido.');
  return data;
}

export const loadRewardWallet = () => walletRpc('load_reward_wallet');
export const purchaseRewardTheme = (themeId: string) => walletRpc('purchase_reward_theme', { theme_id_input: themeId });
export const purchaseRewardFrame = (frameId: string) => walletRpc('purchase_reward_profile_frame', { frame_id_input: frameId });
export const updateRewardWalletPreferences = (equippedThemeId: string | null, combineWithPartner: boolean) => (
  walletRpc('update_reward_wallet_preferences', { equipped_theme_id_input: equippedThemeId, combine_with_partner_input: combineWithPartner })
);

export async function claimWelcomeGemReward(): Promise<WelcomeGemReward> {
  const { data, error } = await requireClient().rpc('claim_welcome_gem_reward', {});
  if (error) throw new Error(`No se pudo acreditar el regalo de bienvenida: ${error.message}`);
  if (!isWelcomeGemReward(data)) throw new Error('El regalo de bienvenida tiene un formato inválido.');
  return data;
}

export async function claimPendingReleaseGemRewards(): Promise<ReleaseGemReward> {
  const { data, error } = await requireClient().rpc('claim_pending_release_gem_rewards', {});
  if (error) throw new Error(`No se pudo acreditar el regalo de la versión: ${error.message}`);
  if (!isReleaseGemReward(data)) throw new Error('El regalo de la versión tiene un formato inválido.');
  return data;
}

export async function claimPendingReleaseUpdates(maxReleaseSequence: number): Promise<ReleaseUpdates> {
  const { data, error } = await requireClient().rpc('claim_pending_release_updates', { max_release_sequence: maxReleaseSequence });
  if (error) throw new Error(`No se pudieron cargar las novedades de la versión: ${error.message}`);
  if (!isReleaseUpdates(data)) throw new Error('Las novedades de versión tienen un formato inválido.');
  return data;
}

export async function acknowledgeReleaseUpdates(versions: readonly string[]): Promise<void> {
  const { error } = await requireClient().rpc('acknowledge_release_updates', { versions: [...versions] });
  if (error) throw new Error(`No se pudieron confirmar las novedades de la versión: ${error.message}`);
}

export function receiptTotal(receipt: RewardReceipt): number {
  return receipt.entries.reduce((total, entry) => total + Math.max(0, entry.amount), 0);
}
