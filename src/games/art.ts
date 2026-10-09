/** Quiet, static scenery shared by the illustrated courts. */
export function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  ctx.fillStyle = "#ffffffb8";
  ctx.beginPath();
  ctx.roundRect(-42, 0, 90, 25, 13);
  for (const [cx, cy, r] of [[-12, 0, 23], [17, -8, 29]]) {
    ctx.moveTo(cx + r, cy);
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}
export function meadow(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#e5f3f8"); sky.addColorStop(.65, "#f8fcfb"); sky.addColorStop(1, "#e6f1df");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  cloud(ctx, w * .14, h * .19, w / 1150);
  cloud(ctx, w * .86, h * .25, w / 1350);
  ctx.fillStyle = "#c8e2d2";
  ctx.beginPath();
  ctx.moveTo(0, h * .74);
  ctx.quadraticCurveTo(w * .22, h * .46, w * .5, h * .75);
  ctx.quadraticCurveTo(w * .78, h * .48, w, h * .7);
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
  ctx.fillStyle = "#a9d1bc";
  ctx.beginPath();
  ctx.moveTo(0, h * .89);
  ctx.quadraticCurveTo(w * .5, h * .69, w, h * .89);
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
}

/** A satin toy finish. The edge stays saturated; the light has a single source. */
export function toyFinish(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, light: string, color: string, shade: string) {
  // Broad studio light keeps large toys satin instead of a tiny glossy hotspot.
  const finish = ctx.createLinearGradient(x - r * .65, y - r, x + r * .65, y + r);
  finish.addColorStop(0, light); finish.addColorStop(.48, color); finish.addColorStop(1, shade);
  return finish;
}

/** One owned backing surface; static art is rasterized only on size changes. */
export function staticArt() {
  let surface: HTMLCanvasElement | undefined;
  let lastWidth = 0, lastHeight = 0, lastRatio = 0;
  return (ctx: CanvasRenderingContext2D, width: number, height: number, ratio: number,
    paint: (context: CanvasRenderingContext2D) => void) => {
    if (width <= 0 || height <= 0) return;
    if (!surface || width !== lastWidth || height !== lastHeight || ratio !== lastRatio) {
      surface ??= document.createElement("canvas");
      surface.width = Math.ceil(width * ratio); surface.height = Math.ceil(height * ratio);
      const art = surface.getContext("2d")!;
      art.setTransform(ratio, 0, 0, ratio, 0, 0);
      paint(art);
      lastWidth = width; lastHeight = height; lastRatio = ratio;
    }
    ctx.drawImage(surface, 0, 0, width, height);
  };
}

/** A precise, open aiming mark: the center never obscures the thing being hit. */
export function aimMark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, active = false) {
  if (r <= 0) return;
  ctx.save(); ctx.translate(x, y);
  const scale = Math.min(1, r / 9);
  ctx.scale(scale, scale); r /= scale;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = "#ffffffee"; ctx.lineWidth = 5; ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, active ? 3 : 2, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(r + 5, 0); ctx.lineTo(r + 9, 0);
    ctx.strokeStyle = "#ffffffee"; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
  }
  ctx.restore();
}
export function smile(ctx: CanvasRenderingContext2D, r: number) {
  ctx.fillStyle = "#29465a";
  for (const x of [-r * .24, r * .24]) {
    ctx.beginPath(); ctx.arc(x, 0, r * .055, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = "#29465a";
  ctx.lineWidth = Math.max(2, r * .045);
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(0, r * .12, r * .12, 0, Math.PI); ctx.stroke();
}

/** A single filled blade ribbon: no overlapping translucent segment joins. */
export function sliceRibbon(ctx: CanvasRenderingContext2D, points: readonly { x: number; y: number; age: number }[], aspect: number) {
  if (points.length < 2) return;
  const edges = points.map((point, i) => {
    const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)];
    const dx = after.x - before.x, dy = (after.y - before.y) * aspect, length = Math.hypot(dx, dy) || 1;
    const width = Math.max(0, 1 - point.age / .18) * 5;
    return { x: point.x, y: point.y * aspect, nx: -dy / length * width, ny: dx / length * width };
  });
  const ribbon = (scale: number, color: string) => {
    ctx.beginPath();
    for (let side = 1; side >= -1; side -= 2) {
      for (let n = 0; n < edges.length; n++) {
        const i = side === 1 ? n : edges.length - 1 - n, p = edges[i];
        const x = p.x + p.nx * side * scale, y = p.y + p.ny * side * scale;
        if (side === 1 && n === 0) ctx.moveTo(x, y);
        else if (n === edges.length - 1) ctx.lineTo(x, y);
        else {
          const next = edges[i + side];
          ctx.quadraticCurveTo(x, y, (x + next.x + next.nx * side * scale) / 2, (y + next.y + next.ny * side * scale) / 2);
        }
      }
    }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  };
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - points[points.length - 1].age / .18);
  ribbon(1, "#efb46e"); ribbon(.42, "#fffdf4");
  ctx.restore();
}
