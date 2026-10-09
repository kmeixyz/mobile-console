/** Presentation-only interpolation. Simulation objects are never modified. */
export function motionFrames<T extends object>(keys: readonly (keyof T)[], angles: readonly (keyof T)[] = []) {
  const previous = new WeakMap<T, T>();
  const rendered: T[] = [];
  return {
    capture(items: readonly T[]) {
      items.forEach(item => {
        const before = previous.get(item);
        if (before) Object.assign(before, item);
        else previous.set(item, { ...item });
      });
    },
    sample(items: readonly T[], fraction = 1, snap?: (current: T, before: T) => boolean): T[] {
      const alpha = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 1;
      items.forEach((item, i) => {
        const view = rendered[i] = Object.assign(rendered[i] ?? { ...item }, item);
        const before = previous.get(item);
        if (!before || snap?.(item, before)) return;
        for (const key of keys) {
          const from = before[key], to = item[key];
          if (typeof from !== "number" || typeof to !== "number") continue;
          const delta = angles.includes(key) ? Math.atan2(Math.sin(to - from), Math.cos(to - from)) : to - from;
          view[key] = (from + delta * alpha) as T[typeof key];
        }
      });
      rendered.length = items.length;
      return rendered;
    },
  };
}

/** The simulation time a frame shows: part way through the last step. */
export const shownTime = (time: number, step: number, fraction: number) =>
  Math.max(0, time - step * (1 - fraction));

/**
 * A paused scene paints once, then frames are skipped until it changes: a
 * resize, the reduce-motion setting, or play resuming. "restart" paints but
 * drops the time carried toward the next step.
 */
export function pauseGate() {
  let stale = true, paused = false, shownMotion: boolean | null = null;
  return {
    invalidate() { stale = true; },
    frame(frozen: boolean, reduceMotion: boolean): "skip" | "restart" | "run" {
      const changed = shownMotion !== reduceMotion;
      shownMotion = reduceMotion;
      if (frozen && paused && !stale && !changed) return "skip";
      const restart = frozen || paused;
      paused = frozen;
      stale = false;
      return restart ? "restart" : "run";
    },
  };
}
