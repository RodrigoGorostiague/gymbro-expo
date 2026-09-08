export function shouldRunAnimations({
  appActive,
  enabled = true,
  navigationFocused = true,
  reduceMotion,
}: {
  appActive: boolean;
  enabled?: boolean;
  navigationFocused?: boolean;
  reduceMotion: boolean;
}) {
  return enabled && appActive && navigationFocused && !reduceMotion;
}
