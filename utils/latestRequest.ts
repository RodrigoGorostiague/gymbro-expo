/** Invalidate responses after a newer read, account change, or unmount. */
export function createLatestRequest() {
  let revision = 0;
  return {
    begin: () => { const captured = ++revision; return () => captured === revision; },
    invalidate: () => { revision += 1; },
  };
}
