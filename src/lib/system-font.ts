// Apple devices keep their system font, San Francisco; every other device
// uses Figtree instead of its own UI font (Roboto, Segoe UI and the like).
// Chrome reads BlinkMacSystemFont as system-ui, so a single font stack can't
// promise Figtree off Apple; the platform decides the stack instead.
export const APPLE = /Macintosh|iPhone|iPad|iPod/.test(navigator.userAgent);
export const FONT = APPLE
  ? `-apple-system, BlinkMacSystemFont, system-ui, "Figtree Variable", sans-serif`
  : `"Figtree Variable", sans-serif`;
// Live game text uses it too, including in canvas measurements.
// Pre-rendered tutorial videos bundle Figtree instead.

/** Match each platform’s type styling in canvas measurements and overlays.
 * Sizes are logical game pixels, before the playfield is scaled. */
export function gameType(size: number, appleWeight = 600) {
  return APPLE
    ? { weight: appleWeight, tracking: size >= 20 ? -.018 : 0 }
    : size >= 20
      ? { weight: 400, tracking: -.035 }
      : { weight: 500, tracking: -.015 };
}
