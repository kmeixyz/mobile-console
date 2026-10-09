/** Presentation-only interpolation. Simulation objects are never modified. */
export function motionFrames<T extends object>(keys: readonly (keyof T)[], angles: readonly (keyof T)[] = []) {
  const previous: T[] = [], rendered: T[] = [], identities: T[] = [];
  return {
    capture(items: readonly T[]) {
      items.forEach((item, i) => {
        previous[i] = Object.assign(previous[i] ?? { ...item }, item);
        identities[i] = item;
      });
    },
    sample(items: readonly T[], fraction = 1, snap?: (current: T, before: T) => boolean): T[] {
      const alpha = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 1;
      items.forEach((item, i) => {
        const view = rendered[i] = Object.assign(rendered[i] ?? { ...item }, item);
        const before = previous[i];
        if (!before || identities[i] !== item || snap?.(item, before)) return;
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
