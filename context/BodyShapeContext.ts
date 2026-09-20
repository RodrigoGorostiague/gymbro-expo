import { createContext, useContext } from 'react';

export type BodyShape = 'a' | 'b';
export const BodyShapeContext = createContext<BodyShape>('a');
export const bodyShapeForSex = (sex: 'male' | 'female' | null | undefined): BodyShape => sex === 'female' ? 'b' : 'a';
/** Viewer preference only: onboarding sex is private and never added to public payloads. */
export const useBodyShape = () => useContext(BodyShapeContext);
