// Apple devices keep their system font, San Francisco; every other device
// uses Figtree instead of its own UI font (Roboto, Segoe UI and the like).
// Chrome reads BlinkMacSystemFont as system-ui, so a single font stack can't
// promise Figtree off Apple; the platform decides the stack instead.
export const APPLE = /Macintosh|iPhone|iPad|iPod/.test(navigator.userAgent);
export const FONT = APPLE
  ? `-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`
  : `"Figtree Variable", sans-serif`;
