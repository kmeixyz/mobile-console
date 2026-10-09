import { clamp, TAU, type Player } from "./types";
import { font, label, LABEL } from "./draw";

export const kartScale = (w: number, h: number) => clamp(Math.min(w / 640, h / 360), w >= 300 && h >= 300 ? 1 : .75, 1.3);

/** Opaque, quiet instruments stay legible against every district. */
export function kartPanel(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 12, fill = "#f8fcfb") {
  c.save();
  c.shadowColor = "#1c48541a"; c.shadowBlur = 12; c.shadowOffsetY = 4;
  c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill();
  c.restore();
}

export function kartViews(players: Player[]) {
  const humans = players.flatMap((p, i) => p.bot ? [] : [i]);
  const indices = humans.length ? humans : players.map((_, i) => i);
  // Two racers get wide, stacked views. A third racer gets the entire bottom
  // row instead of leaving a quarter of the screen unused.
  return indices.map((player, i) => {
    const count = indices.length;
    if (count === 1) return { player, x: 0, y: 0, w: 1, h: 1 };
    if (count === 2) return { player, x: 0, y: i / 2, w: 1, h: .5 };
    return { player, x: count === 3 && i === 2 ? 0 : i % 2 / 2, y: Math.floor(i / 2) / 2, w: count === 3 && i === 2 ? 1 : .5, h: .5 };
  });
}

export function drawKartViews(c: CanvasRenderingContext2D, w: number, h: number, players: Player[], draw: (i: number, vw: number, vh: number) => void) {
  c.fillStyle = "#f3f7f6"; c.fillRect(0, 0, w, h);
  const views = kartViews(players);
  for (const view of views) {
    const vw = w * view.w - 2, vh = h * view.h - 2, p = players[view.player];
    c.save(); c.translate(w * view.x + 1, h * view.y + 1);
    c.beginPath(); c.rect(0, 0, vw, vh); c.clip(); draw(view.player, vw, vh);
    // Split screens get a compact identity tag, clear of the instruments.
    if (views.length === 1) { c.restore(); continue; }
    const u = kartScale(vw, vh), pad = 14 * u;
    font(c, 14 * u, 600);
    const nameWidth = Math.min(c.measureText(p.name).width, vw * .3);
    const tagW = nameWidth + 40 * u, tagH = 32 * u;
    kartPanel(c, pad, pad, tagW, tagH, 10 * u);
    c.beginPath(); c.arc(pad + 16 * u, pad + tagH / 2, 5 * u, 0, TAU); c.fillStyle = p.color; c.fill();
    label(c, p.name, pad + 27 * u, pad + tagH / 2 + 5 * u, 14 * u, LABEL, 600, "left", nameWidth + 2);
    c.restore();
  }
}
