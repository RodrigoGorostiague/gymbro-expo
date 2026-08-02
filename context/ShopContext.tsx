import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  GEM_REWARDS,
  getShopTheme,
  isProfileThemeId,
  SHOP_CATEGORIES,
  SHOP_THEMES,
} from '../constants/shopThemes';
import { PARTNER_PROFILE } from '../constants/kiss';
import { subscribeToEquippedThemes, syncEquippedTheme } from '../services/themeSync';
import { UserProfile } from '../types';
import { loadRewardWallet, purchaseRewardTheme, RewardWallet, updateRewardWalletPreferences } from '../services/rewardWallet';
import { useAuth } from './AuthContext';
import { useData } from './DataContext';
import { syncOwnPresentationTheme } from '../services/socialGraph';

const DEFAULT_SHOP: RewardWallet = {
  balance: 0,
  purchasedThemeIds: [],
  equippedThemeId: null,
  combineWithPartner: false,
};

interface ShopContextValue {
  gems: number;
  purchasedThemeIds: string[];
  equippedThemeId: string | null;
  selfEquippedThemeId: string | null;
  partnerEquippedThemeId: string | null;
  combineWithPartner: boolean;
  previewThemeId: string | null;
  isLoading: boolean;
  purchaseTheme: (themeId: string) => Promise<boolean>;
  equipTheme: (themeId: string) => void;
  unequipTheme: () => void;
  setCombineWithPartner: (value: boolean) => void;
  startPreview: (themeId: string) => void;
  stopPreview: () => void;
}

const PREVIEW_DURATION_MS = 5000;

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { attempts } = useData();
  const [shop, setShop] = useState<RewardWallet>(DEFAULT_SHOP);
  const [partnerEquippedThemeId, setPartnerEquippedThemeId] = useState<string | null>(null);
  const [previewThemeId, setPreviewThemeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const walletRequestRef = useRef(0);

  const partner: UserProfile | null = user ? PARTNER_PROFILE[user] : null;

  const clearPreviewTimer = useCallback(() => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
  }, []);

  const endPreview = useCallback(
    (showPayMessage: boolean) => {
      clearPreviewTimer();
      setPreviewThemeId(null);
      if (showPayMessage) {
        Alert.alert('Finalizó la vista previa', 'Compra el tema para seguir usándolo.');
      }
    },
    [clearPreviewTimer],
  );

  useEffect(() => () => clearPreviewTimer(), [clearPreviewTimer]);

  useEffect(() => {
    if (!user) {
      walletRequestRef.current += 1;
      setShop(DEFAULT_SHOP);
      setPartnerEquippedThemeId(null);
      setIsLoading(false);
      return;
    }

    const request = walletRequestRef.current + 1;
    walletRequestRef.current = request;
    let active = true;
    setIsLoading(true);
    void loadRewardWallet().then((loaded) => {
      if (!active || walletRequestRef.current !== request) return;
      setShop(loaded);
      syncEquippedTheme(user, loaded.equippedThemeId);
      void syncOwnPresentationTheme(loaded.equippedThemeId).catch(() => undefined);
    }).finally(() => {
      if (active && walletRequestRef.current === request) setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [user, attempts]);

  useEffect(() => {
    if (!partner) return;

    const unsub = subscribeToEquippedThemes((remote) => {
      if (remote[partner] !== undefined) {
        setPartnerEquippedThemeId(remote[partner] ?? null);
      }
    });

    return unsub;
  }, [partner]);

  const persistPreferences = useCallback((equippedThemeId: string | null, combineWithPartner: boolean) => {
    if (!user) return Promise.resolve();
    return updateRewardWalletPreferences(equippedThemeId, combineWithPartner).then((next) => {
      setShop(next);
      syncEquippedTheme(user, next.equippedThemeId);
      void syncOwnPresentationTheme(next.equippedThemeId).catch(() => undefined);
    });
  }, [user]);

  const equipTheme = useCallback(
    (themeId: string) => {
      if (!shop.purchasedThemeIds.includes(themeId) && !isProfileThemeId(themeId)) return;
      endPreview(false);
      void persistPreferences(themeId, shop.combineWithPartner);
    },
    [shop, persistPreferences, endPreview],
  );

  const unequipTheme = useCallback(() => {
    void persistPreferences(null, shop.combineWithPartner);
  }, [persistPreferences, shop.combineWithPartner]);

  const setCombineWithPartner = useCallback(
    (value: boolean) => {
      void persistPreferences(shop.equippedThemeId, value);
    },
    [shop, persistPreferences],
  );

  const startPreview = useCallback(
    (themeId: string) => {
      if (!getShopTheme(themeId)) return;
      clearPreviewTimer();
      setPreviewThemeId(themeId);
      previewTimerRef.current = setTimeout(() => {
        previewTimerRef.current = null;
        endPreview(true);
      }, PREVIEW_DURATION_MS);
    },
    [clearPreviewTimer, endPreview],
  );

  const stopPreview = useCallback(() => {
    endPreview(false);
  }, [endPreview]);

  const purchaseTheme = useCallback(
    async (themeId: string): Promise<boolean> => {
      const themeItem = getShopTheme(themeId);
      if (!themeItem) return false;

      if (shop.purchasedThemeIds.includes(themeId) || isProfileThemeId(themeId)) {
        equipTheme(themeId);
        return true;
      }

      try {
        const next = await purchaseRewardTheme(themeId);
        setShop(next);
        syncEquippedTheme(user!, next.equippedThemeId);
        void syncOwnPresentationTheme(next.equippedThemeId).catch(() => undefined);
        endPreview(false);
        Alert.alert('Compra exitosa', `Desbloqueaste el tema "${themeItem.name}".`);
        return true;
      } catch (error) {
        Alert.alert('No se pudo comprar', error instanceof Error ? error.message : 'Inténtalo nuevamente.');
        return false;
      }
    },
    [shop, equipTheme, endPreview, user],
  );

  return (
    <ShopContext.Provider
      value={{
        gems: shop.balance,
        purchasedThemeIds: shop.purchasedThemeIds,
        equippedThemeId: shop.equippedThemeId,
        selfEquippedThemeId: shop.equippedThemeId,
        partnerEquippedThemeId,
        combineWithPartner: shop.combineWithPartner,
        previewThemeId,
        isLoading,
        purchaseTheme,
        equipTheme,
        unequipTheme,
        setCombineWithPartner,
        startPreview,
        stopPreview,
      }}
    >
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop must be used within ShopProvider');
  return ctx;
}

export { SHOP_THEMES, SHOP_CATEGORIES, GEM_REWARDS };
