import { INK, TAU } from "./types";
import { toyFinish } from "../art";

// Shared pieces of the arcade games' look, matching the cover art: soft
// colors, soft edges, and friendly faces.

export function outline(c: CanvasRenderingContext2D, width = 3) {
  c.strokeStyle = "#304c603d"; c.lineWidth = Math.max(.6, width * .35); c.lineJoin = "round"; c.lineCap = "round"; c.stroke();
}
export function blob(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, line = 3) {
  c.beginPath(); c.arc(x, y, r, 0, TAU);
  if (line > 0 && r > 6 && /^#[\da-f]{6}$/i.test(fill)) {
    c.fillStyle = toyFinish(c, x, y, r, tint(fill, .55), fill, fill);
  } else c.fillStyle = fill;
  c.fill();
  if (line > 0) outline(c, line);
}
let contactShadow: HTMLCanvasElement | undefined;
export function shadow(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  if (rx <= 0 || ry <= 0) return;
  if (!contactShadow) {
    contactShadow = document.createElement("canvas");
    contactShadow.width = contactShadow.height = 128;
    const art = contactShadow.getContext("2d")!;
    const shade = art.createRadialGradient(64, 64, 0, 64, 64, 64);
    shade.addColorStop(0, "#29465a30"); shade.addColorStop(.65, "#29465a20"); shade.addColorStop(1, "#29465a00");
    art.fillStyle = shade; art.fillRect(0, 0, 128, 128);
  }
  c.drawImage(contactShadow, x - rx, y - ry, rx * 2, ry * 2);
}
/** Two round eyes and a smile (or a surprised "o"), scaled to a head of radius r. */
export function face(c: CanvasRenderingContext2D, x: number, y: number, r: number, surprised = false) {
  for (const side of [-1, 1]) {
    c.beginPath(); c.arc(x + side * r * .36, y - r * .12, r * .26, 0, TAU); c.fillStyle = "#fff"; c.fill();
    c.beginPath(); c.arc(x + side * r * .36 + r * .05, y - r * .1, r * .13, 0, TAU); c.fillStyle = INK; c.fill();
  }
  c.beginPath();
  if (surprised) c.arc(x, y + r * .36, r * .13, 0, TAU);
  else { c.moveTo(x - r * .26, y + r * .24); c.quadraticCurveTo(x, y + r * .46, x + r * .26, y + r * .24); }
  c.strokeStyle = INK; c.lineWidth = Math.max(1.5, r * .1); c.lineCap = "round"; c.stroke();
}
export function cloud(c: CanvasRenderingContext2D, x: number, y: number, s = 1, color = "#ffffffd9") {
  c.fillStyle = color; c.beginPath();
  c.roundRect(x - 42 * s, y, 90 * s, 25 * s, 13 * s);
  c.moveTo(x + 11 * s, y); c.arc(x - 12 * s, y, 23 * s, 0, TAU);
  c.moveTo(x + 46 * s, y - 8 * s); c.arc(x + 17 * s, y - 8 * s, 29 * s, 0, TAU);
  c.fill();
}
/** The four-pointed sparkle from the covers. */
export function sparkle(c: CanvasRenderingContext2D, x: number, y: number, s = 1, color = "#ffd668") {
  c.beginPath();
  c.moveTo(x, y - 19 * s); c.lineTo(x + 5 * s, y - 5 * s); c.lineTo(x + 19 * s, y); c.lineTo(x + 5 * s, y + 5 * s);
  c.lineTo(x, y + 19 * s); c.lineTo(x - 5 * s, y + 5 * s); c.lineTo(x - 19 * s, y); c.lineTo(x - 5 * s, y - 5 * s); c.closePath();
  c.fillStyle = color; c.fill();
}
/* Type and surfaces for in-game text, matching the rest of the site: San
   Francisco on Apple devices and Figtree elsewhere, at semibold weights,
   solid panels with soft shadows, and no outlined lettering.

   Words are never painted into the canvas. Each draw call below records its
   text at the canvas's current transform, and the game lays those out as
   real page text over the canvas (see flushScreenText), so it renders in the
   site font at full resolution. The canvas font is still set, to the same
   stack, so measureText can size the panels drawn behind that text. */
import { FONT } from "../../lib/system-font";
export { FONT };
export const LABEL = "#1d1d1f";
export const SECONDARY = "#6e6e73";
export function font(c: CanvasRenderingContext2D, size: number, weight = 600) {
  c.font = `${weight} ${size}px ${FONT}`;
  // Display sizes tighten slightly, like SF Pro Display.
  (c as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = size >= 20 ? `${(-size * .018).toFixed(2)}px` : "0px";
}
type TextKind = "label" | "toast" | "headline" | "callout" | "chip";
type Accent = { text: string; color: string };
type ScreenText = { kind: TextKind; text: string; x: number; y: number; size: number; color: string; weight: number; align: CanvasTextAlign; alpha: number; maxWidth: number; accent?: Accent };
let screenItems: ScreenText[] = [];
let pixelRatio = 1;
/** Start a frame's text. Call before drawing, with the canvas being drawn. */
export function beginScreenText(canvas: HTMLCanvasElement) {
  screenItems.length = 0;
  pixelRatio = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1;
}
/** Record text at canvas point (x, y), in CSS pixels relative to the canvas. */
export function screenText(c: CanvasRenderingContext2D, kind: TextKind, text: string, x: number, y: number, size: number,
  { color = LABEL, weight = 600, align = "left" as CanvasTextAlign, alpha = 1, maxWidth = 0, accent = undefined as Accent | undefined } = {}) {
  const m = c.getTransform(), scale = Math.hypot(m.a, m.b) / pixelRatio;
  screenItems.push({
    kind, text, color, weight, align, alpha: alpha * c.globalAlpha, accent,
    x: (m.a * x + m.c * y + m.e) / pixelRatio, y: (m.b * x + m.d * y + m.f) / pixelRatio,
    size: size * scale, maxWidth: maxWidth * scale,
  });
}
/** Lay out this frame's text in `root`, reusing its elements between frames. */
export function flushScreenText(root: HTMLElement) {
  while (root.children.length < screenItems.length) root.append(document.createElement("span"));
  Array.from(root.children as HTMLCollectionOf<HTMLElement & { key?: string; contentKey?: string }>).forEach((el, i) => {
    const t = screenItems[i];
    if (!t) { el.hidden = true; el.key = ""; return; }
    const key = `${t.kind}|${t.text}|${t.x.toFixed(1)}|${t.y.toFixed(1)}|${t.size.toFixed(2)}|${t.color}|${t.weight}|${t.align}|${t.alpha.toFixed(2)}|${t.maxWidth}|${t.accent?.text ?? ""}|${t.accent?.color ?? ""}`;
    if (el.key === key) return;
    el.key = key; el.hidden = false;
    el.className = `screen-text screen-text-${t.kind}`;
    // An accent is a trailing run in its own color, like a countdown.
    const contentKey = `${t.text}|${t.accent?.text ?? ""}|${t.accent?.color ?? ""}`;
    if (el.contentKey !== contentKey && t.accent) {
      const run = document.createElement("span");
      run.style.color = t.accent.color; run.textContent = t.accent.text;
      el.replaceChildren(t.text, run);
    } else if (el.contentKey !== contentKey) el.textContent = t.text;
    el.contentKey = contentKey;
    // Alphabetic baselines sit at y, like fillText; capsules center on it.
    const dx = t.align === "center" ? "-50%" : t.align === "right" || t.align === "end" ? "-100%" : "0";
    const dy = t.kind === "toast" || t.kind === "chip" ? "-50%" : "-.86em";
    el.style.cssText = `font-size:${t.size.toFixed(2)}px;font-weight:${t.weight};--text-color:${t.color};opacity:${t.alpha.toFixed(2)};`
      + `${t.size >= 20 ? `letter-spacing:${(-t.size * .018).toFixed(2)}px;` : ""}${t.maxWidth ? `max-width:${t.maxWidth.toFixed(1)}px;` : ""}`
      + `transform:translate(${t.x.toFixed(1)}px,${t.y.toFixed(1)}px) translate(${dx},${dy})`;
  });
}
/** The largest size, up to `size`, at which `value` and its `pad` (in ems, both sides together) fit in `width`. */
export function fitSize(c: CanvasRenderingContext2D, value: string, size: number, width: number, weight = 600, pad = 0) {
  font(c, size, weight);
  return Math.min(size, size * width / (c.measureText(value).width + pad * size));
}
export function label(c: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color = LABEL, weight = 600, align: CanvasTextAlign = "left", maxWidth = 0) {
  font(c, size, weight);
  screenText(c, "label", value, x, y, size, { color, weight, align, maxWidth });
}
/** Quiet, opaque instruments that remain readable on moving playfields. */
export function material(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, dark = false) {
  c.save();
  c.shadowColor = "#24444f14"; c.shadowBlur = 18; c.shadowOffsetY = 6;
  c.beginPath(); c.roundRect(x, y, w, h, Math.min(r, 12)); c.fillStyle = dark ? "#24444f" : "#f8fcfb"; c.fill();
  c.restore();
}
/** A short message in a dark capsule, centered on x, with an optional colored ending. */
export function toast(c: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, alpha = 1, accent?: Accent) {
  screenText(c, "toast", value, x, y, size, { color: "#fff", align: "center", alpha, accent });
}
/** A large white headline with a soft shadow, for moments like "Final lap". */
export function headline(c: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, alpha = 1, color = "#fff") {
  screenText(c, "headline", value, x, y, size, { color, weight: 700, align: "center", alpha });
}
/** Pop-ups like "+10" or "Splat": white headline text that drifts and fades. */
export function popText(c: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, fill = "#fff", alpha = 1) {
  headline(c, value, x, y, size, alpha, fill);
}
/** A small seeded random generator, so rounds and tests are repeatable. */
export function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A color mixed toward white, for paint and highlights. */
export function tint(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * amount);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}
