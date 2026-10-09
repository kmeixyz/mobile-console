/** Quiet, static scenery shared by the illustrated courts. */
export function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  ctx.fillStyle = "#ffffffb8";
  ctx.beginPath();
  ctx.roundRect(-42, 0, 90, 25, 13);
  ctx.fill();
  for (const [cx, cy, r] of [[-12, 0, 23], [17, -8, 29]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
export function meadow(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#dceff8";
  ctx.fillRect(0, 0, w, h);
  cloud(ctx, w * .16, h * .19, w / 850);
  cloud(ctx, w * .82, h * .25, w / 1000);
  ctx.fillStyle = "#a6d7b1";
  ctx.beginPath();
  ctx.moveTo(0, h * .74);
  ctx.quadraticCurveTo(w * .22, h * .46, w * .5, h * .75);
  ctx.quadraticCurveTo(w * .78, h * .48, w, h * .7);
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
  ctx.fillStyle = "#82bb96";
  ctx.beginPath();
  ctx.moveTo(0, h * .89);
  ctx.quadraticCurveTo(w * .5, h * .69, w, h * .89);
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
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
