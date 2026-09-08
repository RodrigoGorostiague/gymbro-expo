import { useEffect, useRef } from 'react';
import { createLatestRequest } from '../utils/latestRequest';

export function useLatestRequest(scope: unknown) {
  const guard = useRef(createLatestRequest());
  const previous = useRef(scope);
  if (previous.current !== scope) {
    guard.current.invalidate();
    previous.current = scope;
  }
  useEffect(() => () => guard.current.invalidate(), []);
  return guard.current;
}
