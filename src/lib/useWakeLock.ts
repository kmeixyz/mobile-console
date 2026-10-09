import { useEffect } from "react";

/** Keep the controller and game screen awake; reacquire after returning to Safari. */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let stopped = false;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      if (document.hidden || lock) return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (stopped) { void next.release(); return; }
        lock = next;
        next.addEventListener("release", () => { if (lock === next) lock = null; });
      } catch { /* Low Power Mode may deny a wake lock; play remains available. */ }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  }, [enabled]);
}
