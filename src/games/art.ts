/** Quiet, static scenery shared by the illustrated courts. */
export function meadow(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#dcf0f8"); sky.addColorStop(.6, "#f6fbfb"); sky.addColorStop(1, "#e6f1df");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const unit = Math.min(w, h);
  // A hazy morning sun, off to one side so it never competes with the target.
  const sun = ctx.createRadialGradient(w * .84, h * .13, 0, w * .84, h * .13, unit * .5);
  sun.addColorStop(0, "#fffbe6f0"); sun.addColorStop(.12, "#fff6d8b0"); sun.addColorStop(.45, "#fff3d040"); sun.addColorStop(1, "#fff3d000");
  ctx.fillStyle = sun; ctx.fillRect(0, 0, w, h);
  // Soft clouds from overlapping lobes, flat along the base.
  ctx.fillStyle = "#ffffffc8";
  for (const [x, y, s] of [[.14, .13, 1], [.63, .07, .62], [.93, .3, .78]]) {
    const cx = x * w, cy = y * h, r = unit * .05 * s;
    ctx.beginPath();
    ctx.arc(cx - r * 1.5, cy, r * .8, 0, Math.PI * 2);
    ctx.arc(cx - r * .4, cy - r * .55, r * 1.1, 0, Math.PI * 2);
    ctx.arc(cx + r * .9, cy - r * .2, r * .95, 0, Math.PI * 2);
    ctx.arc(cx + r * 1.9, cy + r * .1, r * .65, 0, Math.PI * 2);
    ctx.roundRect(cx - r * 1.95, cy + r * .05, r * 4.25, r * .75, r * .375);
    ctx.fill();
  }
  const hill = (top: string, base: string, from: number, path: () => void) => {
    const shade = ctx.createLinearGradient(0, h * from, 0, h);
    shade.addColorStop(0, top); shade.addColorStop(1, base);
    ctx.fillStyle = shade;
    ctx.beginPath(); path();
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
  };
  // Distant ridge, mid hills, then the near bank: each a little deeper.
  hill("#dcefe6", "#d3e9dc", .5, () => {
    ctx.moveTo(0, h * .66);
    ctx.bezierCurveTo(w * .3, h * .52, w * .42, h * .66, w * .62, h * .6);
    ctx.bezierCurveTo(w * .8, h * .55, w * .9, h * .6, w, h * .57);
  });
  hill("#cbe5d5", "#bcdcc8", .47, () => {
    ctx.moveTo(0, h * .74);
    ctx.quadraticCurveTo(w * .22, h * .46, w * .5, h * .75);
    ctx.quadraticCurveTo(w * .78, h * .48, w, h * .7);
  });
  hill("#b3d8c2", "#9fcab3", .72, () => {
    ctx.moveTo(0, h * .89);
    ctx.quadraticCurveTo(w * .5, h * .69, w, h * .89);
  });
  ctx.strokeStyle = "#e9f6ec90"; ctx.lineWidth = Math.max(1, unit * .003);
  ctx.beginPath(); ctx.moveTo(0, h * .89); ctx.quadraticCurveTo(w * .5, h * .69, w, h * .89); ctx.stroke();
}

/** A satin toy finish. The edge stays saturated; the light has a single source. */
export function toyFinish(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, light: string, color: string, shade: string) {
  // An off-center, broad light models the curved surface without a glassy glare.
  const finish = ctx.createRadialGradient(x - r * .36, y - r * .48, r * .06, x - r * .12, y - r * .15, r * 1.3);
  finish.addColorStop(0, light); finish.addColorStop(.6, color); finish.addColorStop(1, shade);
  return finish;
}

let contactShadow: HTMLCanvasElement | undefined;
/** One feathered shadow stamp for every toy; never runs a live blur filter. */
export function softShadow(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  if (rx <= 0 || ry <= 0) return;
  if (!contactShadow) {
    contactShadow = document.createElement("canvas");
    contactShadow.width = contactShadow.height = 128;
    const art = contactShadow.getContext("2d")!;
    const shade = art.createRadialGradient(64, 64, 0, 64, 64, 64);
    shade.addColorStop(0, "#29465a38"); shade.addColorStop(.45, "#29465a20"); shade.addColorStop(1, "#29465a00");
    art.fillStyle = shade; art.fillRect(0, 0, 128, 128);
  }
  c.drawImage(contactShadow, x - rx, y - ry, rx * 2, ry * 2);
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

/** Small reusable toy artwork. Its resolution stays fixed as it moves through
 * perspective: no cache churn or rasterization at every new projected size. */
export function toyStamp(width: number, height: number, paint: (c: CanvasRenderingContext2D) => void) {
  let surface: HTMLCanvasElement | undefined;
  return (c: CanvasRenderingContext2D, x: number, y: number, w = width, h = height) => {
    if (!surface) {
      surface = document.createElement("canvas");
      surface.width = width * 2; surface.height = height * 2;
      const art = surface.getContext("2d")!;
      art.scale(2, 2); paint(art);
    }
    c.drawImage(surface, x, y, w, h);
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
    // Widest just behind the tip, so the stroke reads as a blade, not a line.
    const width = Math.max(0, 1 - point.age / .18) ** 1.4 * 6.5;
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
  ribbon(2.3, "#ffc27a38"); ribbon(1, "#f2ac5c"); ribbon(.46, "#fffdf4");
  ctx.restore();
}
