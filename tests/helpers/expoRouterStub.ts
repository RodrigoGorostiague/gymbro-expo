import React from 'react';
import { vi } from 'vitest';

let currentParams: Record<string, unknown> = {};
let focusCleanups: Array<() => void> = [];

export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  dismissTo: vi.fn(),
  setParams: vi.fn(),
};

export function __setParams(params: Record<string, unknown>) {
  currentParams = params;
}

export function useLocalSearchParams() {
  return currentParams;
}

export function useFocusEffect(effect: () => void | (() => void)) {
  React.useEffect(() => {
    const cleanup = effect();
    if (cleanup) focusCleanups.push(cleanup);
    return () => {
      if (cleanup) {
        cleanup();
        focusCleanups = focusCleanups.filter((entry) => entry !== cleanup);
      }
    };
  }, [effect]);
}

export function __blurFocus() {
  focusCleanups.forEach((cleanup) => cleanup());
  focusCleanups = [];
}
