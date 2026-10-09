/** Cap backing pixels, rather than lowering the resolution of every screen.
 * Small Retina surfaces retain 2× detail; large displays avoid giant buffers. */
export function surfaceRatio(width: number, height: number, cap = 2) {
  const native = Math.min(window.devicePixelRatio || 1, cap);
  return Math.min(native, Math.max(1, Math.sqrt(4_000_000 / Math.max(1, width * height))));
}

/** Baked instrument surfaces: soft elevation without a blur on every frame.
 * A bounded cache also handles changing score widths without retaining a round. */
const panels = new Map<string, HTMLCanvasElement>();
let panelPixels = 0;
export function satinPanel(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number, fill: string) {
  if (w <= 0 || h <= 0) return;
  const m = c.getTransform();
  const ratio = Math.min(3, Math.max(1, Math.ceil(Math.hypot(m.a, m.b) * 2) / 2));
  const pad = 20, key = `${w}|${h}|${radius}|${fill}|${ratio}`;
  let surface = panels.get(key);
  if (!surface) {
    surface = document.createElement("canvas");
    surface.width = Math.ceil((w + pad * 2) * ratio);
    surface.height = Math.ceil((h + pad * 2) * ratio);
    const art = surface.getContext("2d")!;
    art.scale(ratio, ratio);
    art.shadowColor = "#24444f18"; art.shadowBlur = 12; art.shadowOffsetY = 4;
    art.beginPath(); art.roundRect(pad, pad, w, h, radius); art.fillStyle = fill; art.fill();
    art.shadowBlur = 0; art.shadowOffsetY = 0;
    art.save(); art.clip();
    const light = art.createLinearGradient(0, pad, 0, pad + h);
    light.addColorStop(0, "#ffffff20"); light.addColorStop(.5, "#ffffff00"); light.addColorStop(1, "#24444f04");
    art.fillStyle = light; art.fillRect(pad, pad, w, h); art.restore();
    const pixels = surface.width * surface.height;
    while (panels.size && (panels.size >= 48 || panelPixels + pixels > 4_000_000)) {
      const oldest = panels.keys().next().value!;
      const retired = panels.get(oldest)!;
      panelPixels -= retired.width * retired.height;
      panels.delete(oldest);
    }
    if (pixels <= 4_000_000) { panels.set(key, surface); panelPixels += pixels; }
  }
  // Use source dimensions to avoid stretching fractional-sized cached panels.
  c.drawImage(surface, x - pad, y - pad, surface.width / ratio, surface.height / ratio);
}
