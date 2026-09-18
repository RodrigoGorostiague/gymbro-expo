export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const url = new URL(path, 'gymbro:///');
    if (url.protocol === 'gymbro:' && url.hostname === 'auth' && url.pathname === '/update-password') {
      return `/auth/update-password?recoveryUrl=${encodeURIComponent(path)}`;
    }
    return path;
  } catch {
    return '/';
  }
}
