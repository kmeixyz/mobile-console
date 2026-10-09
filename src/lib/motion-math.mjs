export const clamp = (value, min = -1, max = 1) =>
  Math.max(min, Math.min(max, value));
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const wrap = (deg) => ((deg + 540) % 360) - 180;

// Quaternions are [w, x, y, z]. Device frame: x right, y toward the top of
// the screen, z out of the screen. World frame: z points up.
const multiply = ([aw, ax, ay, az], [bw, bx, by, bz]) => [
  aw * bw - ax * bx - ay * by - az * bz,
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
];
const conjugate = ([w, x, y, z]) => [w, -x, -y, -z];
const rotate = (q, [x, y, z]) => {
  const [, rx, ry, rz] = multiply(multiply(q, [0, x, y, z]), conjugate(q));
  return [rx, ry, rz];
};

/**
 * Phone orientation from a deviceorientation event (W3C Z-X'-Y'' angles),
 * adjusted so "up" is the top of the screen in its current rotation.
 * Quaternions stay smooth where the raw angles jump, e.g. near upright.
 */
export function orientationQuaternion(alpha, beta, gamma, screenAngle = 0) {
  const x = (beta * RAD) / 2,
    y = (gamma * RAD) / 2,
    z = (alpha * RAD) / 2;
  const cX = Math.cos(x),
    cY = Math.cos(y),
    cZ = Math.cos(z);
  const sX = Math.sin(x),
    sY = Math.sin(y),
    sZ = Math.sin(z);
  const device = [
    cX * cY * cZ - sX * sY * sZ,
    sX * cY * cZ - cX * sY * sZ,
    cX * sY * cZ + sX * cY * sZ,
    cX * cY * sZ + sX * sY * cZ,
  ];
  const h = (-screenAngle * RAD) / 2;
  return multiply(device, [Math.cos(h), 0, 0, Math.sin(h)]);
}

// Tilt steering, matched to Wii Playground's kart: tilting the phone like a
// wheel steers, and ~0.6 rad (about 34°) of tilt is full lock. Tilting the top
// edge away or toward you drives up/down the same way. Angles come from the
// phone's full orientation, so the reading stays steady flat or upright.
export const TILT_FULL = 0.6;
const upInScreen = (q) => rotate(conjugate(q), [0, 0, 1]);
const sideTilt = (q) => {
  const [x, y, z] = upInScreen(q);
  return -Math.atan2(x, Math.hypot(y, z));
};
const forwardTilt = (q) => {
  const [, y, z] = upInScreen(q);
  return Math.atan2(y, z);
};
/**
 * x is -1 (left) to 1 (right) from tilting sideways; y is -1 (up) to 1 (down)
 * from tilting the top edge away from or toward you. Matches screen coordinates.
 */
export function tiltFromOrientation(q, baseline, full = TILT_FULL) {
  const turn = ((forwardTilt(q) - forwardTilt(baseline) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return {
    x: clamp((sideTilt(q) - sideTilt(baseline)) / full),
    y: clamp(turn / full),
  };
}

/**
 * One Euro filter: steady when the phone is still, near-instant when it moves.
 * https://gery.casiez.net/1euro/
 */
export function createSmoother({ minCutoff = 2, beta = 25, dCutoff = 1 } = {}) {
  let last = null,
    lastSpeed = 0,
    lastTime = 0;
  const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
  return {
    reset() {
      last = null;
    },
    next(value, time) {
      if (last === null || time <= lastTime) {
        last = value;
        lastSpeed = 0;
        lastTime = time;
        return value;
      }
      const dt = Math.min((time - lastTime) / 1000, 0.25);
      lastTime = time;
      const speed = (value - last) / dt;
      lastSpeed += alpha(dCutoff, dt) * (speed - lastSpeed);
      const cutoff = minCutoff + beta * Math.abs(lastSpeed);
      last += alpha(cutoff, dt) * (value - last);
      return last;
    },
  };
}

// Bowling swing, ported from Wii Playground's phone controller: power from the
// hardest moment of the swing, spin from how fast the wrist twists at release.
const G = 9.81;
const POWER_NOISE = 2.5;
const POWER_FULL = 28;
const SPIN_NOISE = 40;
const SPIN_FULL = 420;
export const MIN_HOLD_MS = 150;
const num = (value) => (Number.isFinite(value) ? value : 0);
/**
 * samples: { ax, ay, az } = accelerationIncludingGravity (m/s²) and
 * gamma = rotationRate.gamma (°/s), recorded while the button is held.
 */
export function throwFromMotion(samples) {
  if (!samples || samples.length === 0) return { power: 0.5, spin: 0 };
  let peak = 0;
  for (const s of samples)
    peak = Math.max(peak, Math.hypot(num(s.ax), num(s.ay), num(s.az)));
  const excess = Math.max(0, peak - G);
  const power = clamp((excess - POWER_NOISE) / POWER_FULL, 0, 1);
  let release = 0;
  for (let i = Math.floor(samples.length * 0.6); i < samples.length; i++) {
    const rate = num(samples[i].gamma);
    if (Math.abs(rate) > Math.abs(release)) release = rate;
  }
  const twist = Math.sign(release) * Math.max(0, Math.abs(release) - SPIN_NOISE);
  return { power, spin: clamp(twist / SPIN_FULL, -1, 1) };
}
