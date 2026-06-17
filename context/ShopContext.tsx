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
import { shouldAwardWeeklyGoalBonus } from '../utils/gems';
import { loadShop, saveShop } from '../utils/storage';
import { useAuth } from './AuthContext';
import { useData } from './DataContext';

const DEFAULT_SHOP: ShopState = {
  gems: 0,
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
  awardGems: (amount: number) => void;
  purchaseTheme: (themeId: string) => boolean;
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
  const { sessions } = useData();
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
        Alert.alert('paga ratona 🐭');
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
    loadShop(user).then((loaded) => {
      setShop(loaded);
      syncEquippedTheme(user, loaded.equippedThemeId);
      setIsLoading(false);
    });
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
    (next: ShopState) => {
      if (!user) return;
      setShop(next);
      saveShop(user, next);
      syncEquippedTheme(user, next.equippedThemeId);
    },
    [user],
  );

  const awardGems = useCallback(
    (amount: number) => {
      if (!user || amount <= 0) return;
      setShop((prev) => {
        const next = { ...prev, gems: prev.gems + amount };
        saveShop(user, next);
        return next;
      });
    },
    [user],
  );

  useEffect(() => {
    if (isLoading || !user) return;

    const check = shouldAwardWeeklyGoalBonus(sessions, shop.weeklyGoal.bonusWeekKey);
    if (!check.award) return;

    const next: ShopState = {
      ...shop,
      gems: shop.gems + GEM_REWARDS.weeklyGoalImprovement,
      weeklyGoal: {
        bonusWeekKey: check.weekKey,
        lastWeekWorkouts: check.lastWeek,
      },
    };
    persist(next);
    Alert.alert(
      'Objetivo semanal superado',
      `Superaste la semana anterior (${check.lastWeek} → ${check.currentWeek} rutinas). +${GEM_REWARDS.weeklyGoalImprovement} gemas`,
    );
  }, [isLoading, sessions.length, shop.weeklyGoal.bonusWeekKey, persist, shop, user]);

  const equipTheme = useCallback(
    (themeId: string) => {
      if (!shop.purchasedThemeIds.includes(themeId) && !isProfileThemeId(themeId)) return;
      endPreview(false);
      persist({ ...shop, equippedThemeId: themeId });
    },
    [shop, persist, endPreview],
  );

  const unequipTheme = useCallback(() => {
    persist({ ...shop, equippedThemeId: null });
  }, [shop, persist]);

  const setCombineWithPartner = useCallback(
    (value: boolean) => {
      persist({ ...shop, combineWithPartner: value });
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

      persist({
        ...shop,
        gems: shop.gems - themeItem.price,
        purchasedThemeIds: [...shop.purchasedThemeIds, themeId],
        equippedThemeId: themeId,
      });
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
        awardGems,
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
