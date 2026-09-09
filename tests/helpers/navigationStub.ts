import { createContext, useContext, useEffect } from 'react';

export const NavigationContext = createContext<any>(undefined);

// Mirrors the public hook event contract; native gesture prevention needs device validation.
export function usePreventRemove(prevent: boolean, callback: (event: any) => void) {
  const navigation = useContext(NavigationContext);
  useEffect(() => navigation?.addListener('beforeRemove', (event: any) => {
    if (!prevent) return;
    event.preventDefault();
    callback({ data: event.data });
  }), [navigation, prevent, callback]);
}
