import { createContext, useContext } from 'react';
import { GuidanceAction, GuidancePreferences, newGuidancePreferences } from '../utils/functionalGuidance';

export interface FunctionalGuidanceValue {
  ready: boolean;
  active: boolean;
  error: string | null;
  preferences: GuidancePreferences;
  progress: { visible: boolean; prepared: boolean; recorded: boolean; reviewed: boolean; next: GuidanceAction };
  accept: () => void;
  dismiss: () => void;
  dismissTopic: (id: string, explicit?: boolean) => void;
  selectRoutine: (id: string) => void;
  reviewResult: (id: string) => void;
  acknowledgeMesocycles: () => void;
  nextAction: () => GuidanceAction;
}
const fallback: FunctionalGuidanceValue = {
  ready: false, active: false, error: null, preferences: newGuidancePreferences(),
  progress: { visible: false, prepared: false, recorded: false, reviewed: false, next: { type: 'blocked' } },
  accept() {}, dismiss() {}, dismissTopic() {}, selectRoutine() {}, reviewResult() {}, acknowledgeMesocycles() {},
  nextAction: () => ({ type: 'blocked' }),
};
export const FunctionalGuidanceContext = createContext<FunctionalGuidanceValue>(fallback);
export const useFunctionalGuidance = () => useContext(FunctionalGuidanceContext);
