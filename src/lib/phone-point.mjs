// Fruit Slice's pointing gain, expressed as a fraction of the game viewport.
// Keep sensitivity separate from the easing used to smooth incoming samples.
export const PHONE_SENSITIVITY = 1.075;
export const PHONE_REACH = { x: 380 / 900, y: 260 / 600 };
export const phoneSteer = value => Math.max(-1, Math.min(1, value * PHONE_SENSITIVITY));
export const phoneOffset = (x, y) => ({
  x: phoneSteer(x) * PHONE_REACH.x,
  y: phoneSteer(y) * PHONE_REACH.y,
});

/** Convert viewport travel into board units, including any letterboxing. */
export function boardPoint(x, y, width, height, scale, centerX, centerY) {
  const offset = phoneOffset(x, y);
  return { x: centerX + offset.x * width / scale, y: centerY + offset.y * height / scale };
}
