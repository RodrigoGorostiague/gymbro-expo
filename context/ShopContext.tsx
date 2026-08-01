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
import { ShopState, UserProfile } from '../types';
import { loadShop, mutateShop } from '../utils/storage';
import { useAuth } from './AuthContext';
import { useData } from './DataContext';

const DEFAULT_SHOP: ShopState = {
  gems: 0,
  rewardReceiptIds: [],
  purchasedThemeIds: ['white', 'black', 'profile-rodaja', 'profile-brisas'],
  equippedThemeId: null,
  combineWithPartner: false,
  weeklyGoal: { bonusWeekKey: null, lastWeekWorkouts: 0 },
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
  purchaseTheme: (themeId: string) => boolean;
  equipTheme: (themeId: string) => void;
  unequipTheme: () => void;
  setCombineWithPartner: (value: boolean) => void;
  startPreview: (themeId: string) => void;
  stopPreview: () => void;
}

const PREVIEW_DURATION_MS = 5000;

const ShopContext = createContext<ShopContextValue | null>(null);

export async function loadRecoveredShop(profile: UserProfile): Promise<ShopState> {
  return loadShop(profile);
}

export function applyThemePurchase(current: Readonly<ShopState>, themeId: string, price: number): ShopState {
  if (current.purchasedThemeIds.includes(themeId) || current.gems < price) return current;
  return {
    ...current,
    gems: current.gems - price,
    purchasedThemeIds: [...current.purchasedThemeIds, themeId],
    equippedThemeId: themeId,
  };
}

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { attempts } = useData();
  const [shop, setShop] = useState<ShopState>(DEFAULT_SHOP);
  const [partnerEquippedThemeId, setPartnerEquippedThemeId] = useState<string | null>(null);
  const [previewThemeId, setPreviewThemeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setShop(DEFAULT_SHOP);
      setPartnerEquippedThemeId(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void loadShop(user).then((loaded) => {
      setShop(loaded);
      syncEquippedTheme(user, loaded.equippedThemeId);
    }).finally(() => setIsLoading(false));
  }, [user]);

  useEffect(() => {
    if (!partner) return;

    loadShop(partner).then((loaded) => {
      setPartnerEquippedThemeId(loaded.equippedThemeId);
    });

    const unsub = subscribeToEquippedThemes((remote) => {
      if (remote[partner] !== undefined) {
        setPartnerEquippedThemeId(remote[partner] ?? null);
      }
    });

    return unsub;
  }, [partner]);

  const persist = useCallback(
    (mutation: (current: Readonly<ShopState>) => ShopState) => {
      if (!user) return Promise.resolve();
      return mutateShop(user, mutation).then((next) => {
        setShop(next);
        syncEquippedTheme(user, next.equippedThemeId);
      });
    },
    [user],
  );

  const equipTheme = useCallback(
    (themeId: string) => {
      if (!shop.purchasedThemeIds.includes(themeId) && !isProfileThemeId(themeId)) return;
      endPreview(false);
      persist((current) => ({ ...current, equippedThemeId: themeId }));
    },
    [shop, persist, endPreview],
  );

  const unequipTheme = useCallback(() => {
    persist((current) => ({ ...current, equippedThemeId: null }));
  }, [persist]);

  const setCombineWithPartner = useCallback(
    (value: boolean) => {
      persist((current) => ({ ...current, combineWithPartner: value }));
    },
    [shop, persist],
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
    (themeId: string): boolean => {
      const themeItem = getShopTheme(themeId);
      if (!themeItem) return false;

      if (shop.purchasedThemeIds.includes(themeId) || isProfileThemeId(themeId)) {
        equipTheme(themeId);
        return true;
      }

      if (shop.gems < themeItem.price) {
        Alert.alert('Gemas insuficientes', `Necesitas ${themeItem.price} gemas para "${themeItem.name}".`);
        return false;
      }

      persist((current) => applyThemePurchase(current, themeId, themeItem.price));
      endPreview(false);
      Alert.alert('Compra exitosa', `Desbloqueaste el tema "${themeItem.name}".`);
      return true;
    },
    [shop, persist, equipTheme, endPreview],
  );

  return (
    <ShopContext.Provider
      value={{
        gems: shop.gems,
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
