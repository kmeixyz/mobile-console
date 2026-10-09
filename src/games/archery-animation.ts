// One continuous shot: flight, a close look at the hit, then back to the bow.
export const SHOT_FLIGHT_MS = 520;
export const SHOT_HOLD_MS = 1650;
export const SHOT_END_MS = 2300;
export const AIM_ZOOM_MS = 1500;
const smooth = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
export const aimCamera = (elapsed: number) => smooth(elapsed / AIM_ZOOM_MS);

/** A visible bow connects the phone's hold gesture to the shot being readied. */
export function drawBow(ctx: CanvasRenderingContext2D, w: number, h: number, draw: number, held: boolean) {
  const size = Math.min(w * 0.2, h * 0.23);
  const x = w / 2, y = h + size * 0.08;
  const pull = held ? draw : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#805a40";
  ctx.lineWidth = size * 0.065;
  ctx.beginPath();
  ctx.moveTo(-size, -size * .16);
  ctx.bezierCurveTo(-size * .65, -size * .8 + pull * size * .12, size * .65, -size * .8 + pull * size * .12, size, -size * .16);
  ctx.stroke();
  ctx.strokeStyle = "#e7ba86";
  ctx.lineWidth = size * .026;
  ctx.stroke();
  ctx.strokeStyle = "#fff8e7";
  ctx.lineWidth = size * .014;
  ctx.beginPath();
  ctx.moveTo(-size, -size * .16);
  ctx.lineTo(0, -size * (.24 - pull * .2));
  ctx.lineTo(size, -size * .16);
  ctx.stroke();
  ctx.strokeStyle = "#29465a";
  ctx.lineWidth = size * .09;
  ctx.beginPath(); ctx.moveTo(-size * .1, -size * .62 + pull * size * .09); ctx.lineTo(size * .1, -size * .62 + pull * size * .09); ctx.stroke();
  if (held) drawArrow(ctx, 0, -size * .9 + pull * size * .25, size * .6, -Math.PI / 2);
  ctx.restore();
}
export function shotCamera(elapsed: number, startZoom = 0) {
  return elapsed <= SHOT_HOLD_MS
    ? startZoom + (1 - startZoom) * smooth(elapsed / 450)
    : 1 - smooth((elapsed - SHOT_HOLD_MS) / (SHOT_END_MS - SHOT_HOLD_MS));
}

/** A clockwise countdown ring, outside the crosshair so the hit stays visible. */
export function drawAimTimer(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number, scale: number) {
  const radius = 28 * scale;
  const start = -Math.PI / 2;
  const end = start + Math.PI * 2 * Math.min(1, Math.max(0, progress));
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "#fff8e7";
  ctx.lineWidth = 7 * scale;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "#29465a45";
  ctx.lineWidth = 4 * scale;
  ctx.stroke();
  if (progress > 0) {
    ctx.strokeStyle = progress >= 0.8 ? "#d16443" : "#267b78";
    ctx.beginPath(); ctx.arc(x, y, radius, start, end); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(x + Math.cos(end) * radius, y + Math.sin(end) * radius, 3.5 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawRange(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  cx: number, cy: number, radius: number, zoom: number,
) {
  // A broad meadow path gives the camera move depth without a fast-moving backdrop.
  ctx.save();
  ctx.fillStyle = "#ecdfac";
  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.65, cy + radius * 0.8);
  ctx.lineTo(cx + radius * 0.65, cy + radius * 0.8);
  ctx.lineTo(w * 0.91, h);
  ctx.lineTo(w * 0.09, h);
  ctx.closePath();
  ctx.fill();
  // Small flowers sit outside the shooting lane.
  for (const [px, py, size] of [[0.09, 0.8, 1], [0.88, 0.85, 1.2], [0.18, 0.68, 0.7], [0.82, 0.64, 0.6]]) {
    const x = (px - 0.5) * w * (1 + zoom * 0.15) + w / 2;
    const y = py * h;
    const r = Math.min(w, h) * 0.009 * size;
    ctx.strokeStyle = "#568b65";
    ctx.lineWidth = r * 0.65;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x, y + r * 4); ctx.stroke();
    ctx.fillStyle = "#fff8e7";
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#f6b753";
    ctx.beginPath(); ctx.arc(x, y, r * 0.65, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.lineCap = "round";
  ctx.strokeStyle = "#ffffff90";
  ctx.lineWidth = size * 0.12;
  ctx.beginPath(); ctx.moveTo(-size * 1.7, 0); ctx.lineTo(-size, 0); ctx.stroke();
  ctx.strokeStyle = "#93613e";
  ctx.lineWidth = size * 0.065;
  ctx.beginPath(); ctx.moveTo(-size, 0); ctx.lineTo(0, 0); ctx.stroke();
  // Rounded mint tip and coral feathers, like a little toy arrow.
  ctx.fillStyle = "#73b6b1";
  ctx.beginPath(); ctx.ellipse(0, 0, size * 0.1, size * 0.075, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f48979";
  for (const direction of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-size * 0.62, 0);
    ctx.lineTo(-size * 0.84, size * 0.18 * direction);
    ctx.quadraticCurveTo(-size * 1.08, size * 0.23 * direction, -size, 0);
    ctx.fill();
  }
  ctx.restore();
}

export function drawShotSparkles(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, elapsed: number) {
  const t = Math.min(elapsed / 900, 1);
  if (t >= 1) return;
  ctx.save();
  ctx.globalAlpha = Math.sin(Math.PI * Math.sqrt(t));
  for (let i = 0; i < 7; i++) {
    const angle = i * Math.PI * 2 / 7 - Math.PI / 2;
    const spread = radius * (0.12 + t * 0.44);
    const size = radius * 0.045 * (1 - t * 0.4);
    ctx.save();
    ctx.translate(x + Math.cos(angle) * spread, y + Math.sin(angle) * spread);
    ctx.rotate(angle + t * 0.4);
    ctx.fillStyle = ["#ffda78", "#fff8e7", "#f48979"][i % 3];
    ctx.strokeStyle = "#b37d3e";
    ctx.lineWidth = radius * 0.003;
    ctx.beginPath();
    for (let p = 0; p < 10; p++) {
      const a = p * Math.PI / 5 - Math.PI / 2;
      const r = size * (p % 2 ? 0.45 : 1);
      if (p === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
