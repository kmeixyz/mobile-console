/** Closest approach of a moving blade and moving fruit in screen space.
 * Scaling before projection keeps circular hit areas correct on wide displays.
 */
export function sliceDistance(from, to, fruitFrom, fruitTo, aspect = 1) {
  const ax = from.x - fruitFrom.x;
  const ay = (from.y - fruitFrom.y) * aspect;
  const bx = to.x - fruitTo.x;
  const by = (to.y - fruitTo.y) * aspect;
  const dx = bx - ax, dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2)) : 0;
  return Math.hypot(ax + dx * t, ay + dy * t);
}

/** Resolve even a perfectly centered contact, without normalizing a zero vector. */
export function strikePuck(puck, mallet, radius, side) {
  const dx = puck.x - mallet.x, dz = puck.z - mallet.z;
  const distance = Math.hypot(dx, dz);
  if (distance >= radius) return false;
  const motion = Math.hypot(mallet.vx - puck.vx, mallet.vz - puck.vz);
  const nx = distance > 0.00001 ? dx / distance : motion > 0.00001 ? (mallet.vx - puck.vx) / motion : 0;
  const nz = distance > 0.00001 ? dz / distance : motion > 0.00001 ? (mallet.vz - puck.vz) / motion : -side;
  puck.x = mallet.x + nx * radius;
  puck.z = mallet.z + nz * radius;
  const into = (puck.vx - mallet.vx) * nx + (puck.vz - mallet.vz) * nz;
  if (into >= 0) return false;
  puck.vx -= 1.9 * into * nx;
  puck.vz -= 1.9 * into * nz;
  return true;
}

/** Shared phone response: reaches 90% of a new aim in about 42 ms.
 * This is Fruit Slice's response curve, independent of display/physics rate. */
export const PHONE_RESPONSE = 55;
export function followAmount(dt, responsiveness = PHONE_RESPONSE) {
  return 1 - Math.exp(-responsiveness * Math.max(0, dt));
}
