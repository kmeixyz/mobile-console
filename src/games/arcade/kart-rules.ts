/** Physical distance around the circuit, independent of a racer's lap count. */
export const forwardGap = (from: number, to: number, length: number) => ((to - from) % length + length) % length;
export const trackGap = (from: number, to: number, length: number) => forwardGap(from + length / 2, to, length) - length / 2;

/** Includes the swept interval, even if a frame ends beyond the object. */
export function crossesPoint(from: number, to: number, point: number, length: number, radius = 0) {
  return forwardGap(from - radius, point, length) <= to - from + radius * 2;
}

export function crossingTime(from: number, to: number, line: number, time: number, dt: number) {
  return time - dt + dt * Math.max(0, Math.min(1, (line - from) / Math.max(.000001, to - from)));
}

type Protection = { safe: number; star: number; shield: number; ram: number };
export const protectedFromHit = (p: Pick<Protection, "safe" | "star">) => p.safe > 0 || p.star > 0;
// A drift, pad, or trick turbo is speed, not an offensive weapon.
export const canRam = (p: Pick<Protection, "shield" | "star" | "ram">) => p.shield > 0 || p.star > 0 || p.ram > 0;

export function projectileTouches(distance: number, laneGap: number, height: number) {
  return Math.abs(distance) < 8 && Math.abs(laneGap) < .26 && height < 5;
}

/** Ease into a pointed lane without snapping or overshooting on sensor jitter. */
export function steerToward(lane: number, target: number, rate: number, dt: number) {
  const delta = (target - lane) * -Math.expm1(-12 * dt);
  return lane + Math.max(-rate * dt, Math.min(rate * dt, delta));
}
