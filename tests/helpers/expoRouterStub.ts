import { vi } from 'vitest';

let currentParams: Record<string, unknown> = {};

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
