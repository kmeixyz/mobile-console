/** Angles live in screen space, including the playfield's vertical stretch. */
export function cutDirection(from, to, aspect = 1, fallback = 0) {
  if (!from) return fallback;
  const dx = to.x - from.x, dy = (to.y - from.y) * aspect;
  return Math.hypot(dx, dy) > 2 ? Math.atan2(dy, dx) : fallback;
}

export function halfPose(angle, side, age, reduced = false) {
  const separation = reduced ? 4 : Math.max(0, age) * 95;
  return {
    x: -Math.sin(angle) * side * separation,
    y: Math.cos(angle) * side * separation,
    rotation: angle + (reduced ? 0 : side * age * 1.1),
  };
}

/** Presentation-only speed: packet/frame jitter must not flicker the blade. */
export function bladeSpeed(windowMs = 55) {
  const samples = [];
  return {
    reset() { samples.length = 0; },
    next(x, y, now) {
      const last = samples.at(-1);
      if (last && (now <= last.time || now - last.time > 250)) samples.length = 0;
      samples.push({ x, y, time: now });
      while (samples.length > 2 && samples[1].time <= now - windowMs) samples.shift();
      if (samples.length > 32) samples.shift();
      const first = samples[0], elapsed = (now - first.time) / 1000;
      return elapsed > 0 ? Math.hypot(x - first.x, y - first.y) / elapsed : 0;
    },
  };
}
