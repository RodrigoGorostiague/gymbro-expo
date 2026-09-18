import React from 'react';
import { vi } from 'vitest';

let currentParams: Record<string, unknown> = {};
let focusCleanups: Array<() => void> = [];
let currentSegments: string[] = [];

const staticRouteModules = {
  '/mesocycles': 'mesocycles/index',
  '/routines': 'routines/index',
  '/exercises': 'exercises/index',
} as const;

export const router = {
  navigate: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  dismissTo: vi.fn(),
  setParams: vi.fn(),
};

type TabsProps = { children?: React.ReactNode };
type TabScreenProps = { name: string; options?: Record<string, unknown> };

export const Tabs: React.FC<TabsProps> & { Screen: React.FC<TabScreenProps> } = Object.assign(
  ({ children }: TabsProps) => React.createElement('Tabs', null, children),
  { Screen: (props: TabScreenProps) => React.createElement('TabsScreen', props) },
);

export function Redirect({ href }: { href: string }) {
  return React.createElement('Redirect', { href });
}

export function __setParams(params: Record<string, unknown>) {
  currentParams = params;
}

export function __setSegments(segments: string[]) {
  currentSegments = segments;
}

export function __resolveHref(href: string) {
  return staticRouteModules[href as keyof typeof staticRouteModules] ?? null;
}

export function useLocalSearchParams() {
  return currentParams;
}

export function useSegments() {
  return currentSegments;
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
