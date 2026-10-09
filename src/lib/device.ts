// A short, human label for the connected phone, e.g. "Pixel 8 · Chrome" or "iPhone · Safari".
// Browsers don't expose the exact iPhone model; Chromium on Android can report it via client hints.
type UserAgentData = {
  getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string }>;
};

export async function describeDevice(): Promise<string> {
  const ua = navigator.userAgent;
  const iPad =
    /iPad/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let model = iPad
    ? "iPad"
    : /iPhone/.test(ua)
      ? "iPhone"
      : /Android/.test(ua)
        ? "Android phone"
        : /Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows PC"
            : "Phone";
  const browser = /EdgiOS|EdgA|Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /FxiOS|Firefox/.test(ua)
        ? "Firefox"
        : /CriOS|Chrome/.test(ua)
          ? "Chrome"
          : /Safari/.test(ua)
            ? "Safari"
            : "";
  try {
    const data = (navigator as Navigator & { userAgentData?: UserAgentData })
      .userAgentData;
    const hints = await data?.getHighEntropyValues?.(["model"]);
    if (hints?.model) model = hints.model;
  } catch {
    // Client hints are optional; keep the generic name.
  }
  return browser ? `${model} · ${browser}` : model;
}
