import type { Difficulty } from "../../lib/difficulty";
import { PLAYER_COLORS, PLAYER_TEXT_COLORS } from "../../lib/player-colors";

export type ArcadeID = "basket" | "flashlight" | "kart" | "sumo" | "tanks" | "paint";
export type Point = { x: number; y: number };
export type Input = Point & { held: boolean; tap: boolean; released: boolean };
export type Player = { name: string; bot: boolean; color: string };
export type Standing = { name: string; score: number; bot: boolean; detail?: string; highlights?: string[]; side?: "start" | "end"; seatX?: number };
export type Engine = {
  id: ArcadeID;
  time: number;
  done: boolean;
  label: string;
  message: string;
  hud: string;
  /** Seconds left on the round clock, for the big screen's timer. */
  remaining: number;
  setReducedMotion?: (enabled: boolean) => void;
  standings: () => Standing[];
  step: (dt: number, inputs: Input[]) => void;
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number, interpolation?: number) => void;
};
export type Options = { players: Player[]; difficulty: Difficulty };
export const colors = PLAYER_COLORS;
/** The same colors, deep enough to read as text on a light card. */
export const textColor = (color: string) => PLAYER_TEXT_COLORS[colors.indexOf(color)] ?? color;
export const blankInput = (): Input => ({ x: 0, y: 0, held: false, tap: false, released: false });
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const pointer = (input: Input, w = 900, h = 600): Point => ({
  x: w * (.5 + (Number.isFinite(input.x) ? clamp(input.x, -1, 1) : 0) * .48),
  y: h * (.5 + (Number.isFinite(input.y) ? clamp(input.y, -1, 1) : 0) * .47),
});
/** Shortest-path rotation, independent of the display refresh rate. */
export const turnTowards = (angle: number, target: number, dt: number, response = 16) =>
  angle + Math.atan2(Math.sin(target - angle), Math.cos(target - angle)) * -Math.expm1(-response * dt);
export function towards(p: Point, target: Point, speed: number, dt: number) {
  const d = distance(p, target);
  if (d > 0) {
    const amount = Math.min(-Math.expm1(-16 * dt), speed * dt / d);
    p.x += (target.x - p.x) * amount;
    p.y += (target.y - p.y) * amount;
  }
}
/** Bot skill on the engines' 0–3 scale; Hard keeps the tuning it always had. */
export const botLevel = (d: Difficulty) => ({ Easy: 0, Hard: 2 })[d];
export const TAU = Math.PI * 2;
export const INK = "#29465a";
export function circle(c: CanvasRenderingContext2D, p: Point, radius: number, color: string, stroke?: string) {
  c.beginPath(); c.arc(p.x, p.y, radius, 0, TAU); c.fillStyle = color; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); }
}
export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, r = 12) {
  c.fillStyle = color; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill();
}
export function cursor(c: CanvasRenderingContext2D, p: Point, color = INK) {
  circle(c, p, 10, "#ffffffaa", color);
  c.strokeStyle = color; c.lineWidth = 2;
  c.beginPath(); c.moveTo(p.x - 16, p.y); c.lineTo(p.x - 6, p.y); c.moveTo(p.x + 6, p.y); c.lineTo(p.x + 16, p.y);
  c.moveTo(p.x, p.y - 16); c.lineTo(p.x, p.y - 6); c.moveTo(p.x, p.y + 6); c.lineTo(p.x, p.y + 16); c.stroke();
}
export function board(c: CanvasRenderingContext2D, w: number, h: number, color: string, draw: () => void) {
  c.fillStyle = color; c.fillRect(0, 0, w, h); c.save();
  const scale = Math.min(w / 900, h / 600);
  c.translate((w - 900 * scale) / 2, (h - 600 * scale) / 2); c.scale(scale, scale); draw(); c.restore();
}
export type Rect = { x: number; y: number; w: number; h: number };
export function overlaps(p: Point, radius: number, r: Rect) {
  return distance(p, { x: clamp(p.x, r.x, r.x + r.w), y: clamp(p.y, r.y, r.y + r.h) }) < radius;
}
/** Resolve a circle against an axis-aligned obstacle; return the bounce normal. */
export function separate(p: Point, radius: number, r: Rect): Point | null {
  const q = { x: clamp(p.x, r.x, r.x + r.w), y: clamp(p.y, r.y, r.y + r.h) };
  const d = distance(p, q);
  if (d >= radius) return null;
  if (d > .0001) {
    const n = { x: (p.x - q.x) / d, y: (p.y - q.y) / d };
    p.x = q.x + n.x * radius; p.y = q.y + n.y * radius; return n;
  }
  const edges = [
    { d: p.x - r.x, x: -1, y: 0 }, { d: r.x + r.w - p.x, x: 1, y: 0 },
    { d: p.y - r.y, x: 0, y: -1 }, { d: r.y + r.h - p.y, x: 0, y: 1 },
  ].sort((a, b) => a.d - b.d);
  const n = edges[0]; p.x += n.x * (n.d + radius); p.y += n.y * (n.d + radius); return n;
}
export function reflect(v: Point, n: Point, restitution = .8) {
  const dot = v.x * n.x + v.y * n.y;
  if (dot < 0) { v.x -= (1 + restitution) * dot * n.x; v.y -= (1 + restitution) * dot * n.y; }
}
