import { useEffect, useState } from "react";

// Phones only: tablets and computers work held either way.
const isPhone = () =>
  /iPhone|iPod|Android.+Mobile/i.test(navigator.userAgent) ||
  (matchMedia("(pointer: coarse)").matches &&
    Math.min(screen.width, screen.height) < 600);
// The orientation type is the reliable signal; some browsers report an angle
// that disagrees with it. Older iPhones only have window.orientation.
const landscape = () => {
  const type = screen.orientation?.type;
  if (type) return type.startsWith("landscape");
  const angle =
    screen.orientation?.angle ??
    (window as unknown as { orientation?: number }).orientation ??
    0;
  return Math.abs(angle) % 180 === 90;
};
// The page must look sideways too: split-screen and some foldables report a
// landscape screen around a portrait window.
const sideways = () =>
  isPhone() && landscape() && window.innerWidth > window.innerHeight;

/** Whether this phone is turned sideways (landscape). */
export function useSideways() {
  const [turned, setTurned] = useState(sideways);
  useEffect(() => {
    const update = () => setTurned(sideways());
    window.addEventListener("orientationchange", update);
    screen.orientation?.addEventListener?.("change", update);
    window.addEventListener("resize", update);
    update();
    return () => {
      window.removeEventListener("orientationchange", update);
      screen.orientation?.removeEventListener?.("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return turned;
}
