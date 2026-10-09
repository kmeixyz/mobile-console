export const holes = [
  { x: 50, y: 25 },
  { x: 75, y: 34 },
  { x: 25, y: 20 },
];
export const baskets = [
  { x: 50, power: 0.64 },
  { x: 70, power: 0.72 },
  { x: 30, power: 0.56 },
  { x: 60, power: 0.8 },
  { x: 40, power: 0.68 },
];
const clamp = (n, min, max) =>
  Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
// Aim is relative to the cup: 0 putts straight at it, full aim turns 60° away.
// That keeps recovery putts (when the cup is behind the ball) just as easy.
export const PUTT_ANGLE = 60;
export function putt(start, aim, power, hole) {
  const toCup = Math.atan2(hole.x - start.x, start.y - hole.y);
  const angle = toCup + (clamp(aim, -1, 1) * PUTT_ANGLE * Math.PI) / 180;
  const distance = clamp(power, 0.1, 1) * 70;
  const end = {
    x: clamp(start.x + Math.sin(angle) * distance, 7, 93),
    y: clamp(start.y - Math.cos(angle) * distance, 7, 93),
  };
  const sunk = Math.hypot(end.x - hole.x, end.y - hole.y) <= 5;
  return { end: sunk ? { ...hole } : end, sunk };
}
export function golfPoints(strokes, sunk) {
  return sunk ? [100, 70, 40, 10][clamp(strokes, 1, 4) - 1] : 0;
}
export function shootBasket(aim, power, basket) {
  const x = 50 + clamp(aim, -1, 1) * 40;
  const made =
    Math.abs(x - basket.x) <= 6 &&
    Math.abs(clamp(power, 0.1, 1) - basket.power) <= 0.075;
  return { x, made, points: made ? 2 : 0 };
}
