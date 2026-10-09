import { board, INK, TAU } from "./types";
import { staticArt, toyFinish } from "../art";
import { satinPanel } from "../surface";
export { softShadow } from "../art";
// A small seeded random generator, so rounds and tests are repeatable.
export { seededRandom as random } from "../../lib/random.mjs";

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
/** Retain one full-resolution scenery layer per game, including the margins. */
export function boardArt() {
  const cached = staticArt();
  return (c: CanvasRenderingContext2D, w: number, h: number, color: string, paint: (art: CanvasRenderingContext2D) => void) => {
    const m = c.getTransform();
    cached(c, w, h, Math.hypot(m.a, m.b), art => board(art, w, h, color, () => paint(art)));
  };
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
/** The four-pointed sparkle from the covers. */
export function sparkle(c: CanvasRenderingContext2D, x: number, y: number, s = 1, color = "#ffd668") {
  c.beginPath();
  c.moveTo(x, y - 19 * s); c.lineTo(x + 5 * s, y - 5 * s); c.lineTo(x + 19 * s, y); c.lineTo(x + 5 * s, y + 5 * s);
  c.lineTo(x, y + 19 * s); c.lineTo(x - 5 * s, y + 5 * s); c.lineTo(x - 19 * s, y); c.lineTo(x - 5 * s, y - 5 * s); c.closePath();
  c.fillStyle = color; c.fill();
}
/* Type and surfaces for in-game text, matching the site’s platform font:
   SF Pro on Apple and Figtree elsewhere, with their matching weights,
   solid panels with soft shadows, and no outlined lettering.

   Words are never painted into the canvas. Each draw call below records its
   text at the canvas's current transform, and the game lays those out as
   real page text over the canvas (see flushScreenText), so it renders in the
   site font at full resolution. The canvas font is still set, to the same
   stack, so measureText can size the panels drawn behind that text. */
import { FONT, gameType } from "../../lib/system-font";
export const LABEL = "#1d1d1f";
export const SECONDARY = "#6e6e73";
export function font(c: CanvasRenderingContext2D, size: number, weight = 600) {
  const type = gameType(size, weight);
  c.font = `${type.weight} ${size}px ${FONT}`;
  c.letterSpacing = `${size * type.tracking}px`;
}
type TextKind = "label" | "toast" | "headline" | "callout" | "chip";
type Accent = { text: string; color: string };
type ScreenText = { kind: TextKind; text: string; x: number; y: number; size: number; color: string; weight: number; tracking: number; align: CanvasTextAlign; alpha: number; maxWidth: number; accent?: Accent };
let screenItems: ScreenText[] = [];
let pixelRatio = 1;
/** Start a frame's text. Call before drawing, with the canvas's pixel ratio. */
export function beginScreenText(ratio: number) {
  screenItems.length = 0;
  pixelRatio = ratio;
}
/** Record text at canvas point (x, y), in CSS pixels relative to the canvas. */
export function screenText(c: CanvasRenderingContext2D, kind: TextKind, text: string, x: number, y: number, size: number,
  { color = LABEL, weight = 600, align = "left" as CanvasTextAlign, alpha = 1, maxWidth = 0, accent = undefined as Accent | undefined } = {}) {
  const m = c.getTransform(), scale = Math.hypot(m.a, m.b) / pixelRatio;
  const type = gameType(size, weight);
  screenItems.push({
    kind, text, color, ...type, align, alpha: alpha * c.globalAlpha, accent,
    x: (m.a * x + m.c * y + m.e) / pixelRatio, y: (m.b * x + m.d * y + m.f) / pixelRatio,
    size: size * scale, maxWidth: maxWidth * scale,
  });
}
/** Lay out this frame's text in `root`, reusing its elements between frames. */
export function flushScreenText(root: HTMLElement) {
  while (root.children.length < screenItems.length) root.append(document.createElement("span"));
  Array.from(root.children as HTMLCollectionOf<HTMLElement & { appearanceKey?: string; contentKey?: string; transformKey?: string; opacityKey?: string }>).forEach((el, i) => {
    const t = screenItems[i];
    if (!t) { if (!el.hidden) el.hidden = true; return; }
    if (el.hidden) el.hidden = false;
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
    // A floating score changes position every frame, not its font or layout.
    // Keep those writes separate so movement only invalidates compositing.
    const appearance = `${t.kind}|${t.size.toFixed(2)}|${t.color}|${t.weight}|${t.tracking}|${t.maxWidth.toFixed(1)}`;
    if (el.appearanceKey !== appearance) {
      el.appearanceKey = appearance;
      el.className = `screen-text screen-text-${t.kind}`;
      el.style.fontSize = `${t.size.toFixed(2)}px`;
      el.style.fontWeight = String(t.weight);
      el.style.setProperty("--text-color", t.color);
      el.style.letterSpacing = `${t.tracking}em`;
      el.style.maxWidth = t.maxWidth ? `${t.maxWidth.toFixed(1)}px` : "";
    }
    const transform = `translate(${t.x.toFixed(2)}px,${t.y.toFixed(2)}px) translate(${dx},${dy})`;
    const opacity = t.alpha.toFixed(3);
    if (el.transformKey !== transform) { el.transformKey = transform; el.style.transform = transform; }
    if (el.opacityKey !== opacity) { el.opacityKey = opacity; el.style.opacity = opacity; }
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
  satinPanel(c, x, y, w, h, Math.min(r, 12), dark ? "#24444f" : "#f8fcfb");
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
/** A color mixed toward white, for paint and highlights. */
export function tint(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * amount);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}
