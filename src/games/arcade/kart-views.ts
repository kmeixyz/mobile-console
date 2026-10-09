import { satinPanel } from "../surface";
import { clamp, TAU, type Player } from "./types";
import { font, label, LABEL } from "./draw";

export const kartScale = (w: number, h: number) => Math.min(w / 300,
  clamp(Math.min(w / 640, h / 360), w >= 300 && h >= 300 ? 1 : .75, 1.3));

export function kartViews(players: Player[]) {
  // Kart Clash fills all four seats, including bots. Every racer gets one
  // full-height column, in the same left-to-right order as their seat.
  return players.map((_, player) => ({
    player, x: player / players.length, y: 0, w: 1 / players.length, h: 1,
  }));
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
    satinPanel(c, pad, pad, tagW, tagH, 10 * u, "#f8fcfb");
    c.beginPath(); c.arc(pad + 16 * u, pad + tagH / 2, 5 * u, 0, TAU); c.fillStyle = p.color; c.fill();
    label(c, p.name, pad + 27 * u, pad + tagH / 2 + 5 * u, 14 * u, LABEL, 600, "left", nameWidth + 2);
    c.restore();
  }
}
