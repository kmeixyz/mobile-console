import { clamp, type Point } from "./types";

export const SUMO_CENTER = { x: 450, y: 315 };
export const SUMO_CAR = 26;
export const DASH_COOLDOWN = 1.35;
export const SHRINK_INTERVAL = 5;
export const SHRINK_DURATION = 2;
export const ROUND_LIMIT = 72;
/** Every five seconds, ease inward over two seconds, then hold the new size. */
export const sumoRadius = (time: number) => {
  const step = Math.floor(Math.max(0, time) / SHRINK_INTERVAL);
  if (!step) return 250;
  const t = clamp((time - step * SHRINK_INTERVAL) / SHRINK_DURATION, 0, 1);
  return Math.max(0, 250 - (step - 1) * 25 - 25 * t * t * (3 - 2 * t));
};

/** Normal driving stops on the island; a dash or shove can still cross the edge. */
export function sumoAim(aim: Point, radius: number): Point {
  const dx = aim.x - SUMO_CENTER.x, dy = aim.y - SUMO_CENTER.y;
  const ratio = Math.min(1, Math.max(0, radius - SUMO_CAR - 10) / (Math.hypot(dx, dy) || 1));
  return { x: SUMO_CENTER.x + dx * ratio, y: SUMO_CENTER.y + dy * ratio };
}

type Body = Point & { vx: number; vy: number; dash: number; powerDash: boolean; safe: number; falling: number; knockback: number; eliminated?: boolean };
/** Resolve contact once, returning who actually drove into whom for KO credit. */
export function sumoBump(a: Body, b: Body) {
  if (a.eliminated || b.eliminated || a.falling > 0 || b.falling > 0 || a.safe > 0 || b.safe > 0) return null;
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d >= SUMO_CAR * 2) return null;
  // Identical positions must separate too, instead of staying permanently stuck.
  const velocity = Math.hypot(a.vx - b.vx, a.vy - b.vy);
  const nx = d > .001 ? dx / d : velocity > .001 ? (a.vx - b.vx) / velocity : 1;
  const ny = d > .001 ? dy / d : velocity > .001 ? (a.vy - b.vy) / velocity : 0;
  const overlap = (SUMO_CAR * 2 - d) / 2;
  a.x -= nx * overlap; a.y -= ny * overlap; b.x += nx * overlap; b.y += ny * overlap;
  const av = a.vx * nx + a.vy * ny, bv = b.vx * nx + b.vy * ny, closing = av - bv;
  if (closing <= 0) return null;
  const massA = a.dash > 0 ? a.powerDash ? 3 : 1.8 : 1;
  const massB = b.dash > 0 ? b.powerDash ? 3 : 1.8 : 1;
  const impulse = 1.85 * closing / (1 / massA + 1 / massB);
  a.vx -= nx * impulse / massA; a.vy -= ny * impulse / massA;
  b.vx += nx * impulse / massB; b.vy += ny * impulse / massB;
  if (closing > 50) a.knockback = b.knockback = .45;
  const attackA = Math.max(0, av) * massA, attackB = Math.max(0, -bv) * massB;
  return {
    impact: closing,
    fromA: closing > 45 && attackA > 65 && attackA >= attackB * .65,
    fromB: closing > 45 && attackB > 65 && attackB >= attackA * .65,
  };
}
