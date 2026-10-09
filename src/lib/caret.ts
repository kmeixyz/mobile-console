// Draws a taller, bolder text caret than the browser's native one. The native
// caret is hidden only while this one is showing, so it falls back cleanly.
const TEXT_TYPES = new Set(["text", "search", "tel", "url", "password"]);
const FONT_PROPS = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontStretch",
  "fontVariant",
  "fontFeatureSettings",
  "fontKerning",
  "letterSpacing",
  "wordSpacing",
  "textTransform",
] as const;

export function installTextCaret() {
  const caret = document.createElement("div");
  caret.className = "text-caret";
  caret.setAttribute("aria-hidden", "true");
  const ruler = document.createElement("span");
  ruler.className = "text-caret-ruler";
  ruler.setAttribute("aria-hidden", "true");

  let input: HTMLInputElement | null = null;
  let frame = 0;
  let lastX = NaN;
  let measuredKey = "";
  let before = 0;
  let full = 0;

  const textWidth = (text: string, style: CSSStyleDeclaration) => {
    for (const prop of FONT_PROPS) ruler.style[prop] = style[prop];
    ruler.textContent = text;
    return ruler.getBoundingClientRect().width;
  };

  const detach = () => {
    cancelAnimationFrame(frame);
    if (input) delete input.dataset.textCaret;
    input = null;
    caret.remove();
    ruler.remove();
  };

  // Follows the input every frame so typing, scrolling, sheet animations and
  // React-driven value changes all keep the caret in place.
  const update = () => {
    const el = input;
    if (!el) return;
    if (!el.isConnected || document.activeElement !== el) return detach();
    frame = requestAnimationFrame(update);
    const start = el.selectionStart;
    if (start === null || start !== el.selectionEnd || !document.hasFocus()) {
      caret.style.visibility = "hidden";
      return;
    }
    const s = getComputedStyle(el);
    const text = el.type === "password" ? "•".repeat(el.value.length) : el.value;
    const key = `${text}|${start}|${s.fontFamily}|${s.fontSize}|${s.fontWeight}|${s.letterSpacing}|${s.textTransform}`;
    if (key !== measuredKey) {
      before = textWidth(text.slice(0, start), s);
      full = textWidth(text, s);
      measuredKey = key;
    }
    const r = el.getBoundingClientRect();
    const left = r.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft);
    const right = r.right - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight);
    const top = r.top + parseFloat(s.borderTopWidth) + parseFloat(s.paddingTop);
    const bottom = r.bottom - parseFloat(s.borderBottomWidth) - parseFloat(s.paddingBottom);
    const free = Math.max(0, right - left - full);
    const align = s.textAlign;
    const shift = align.includes("center")
      ? free / 2
      : align === "right" || align === "end"
        ? free
        : 0;
    const x = Math.min(Math.max(left + shift + before - el.scrollLeft, left), right);
    const height = Math.min(
      parseFloat(s.fontSize) * 1.35,
      r.height - parseFloat(s.borderTopWidth) - parseFloat(s.borderBottomWidth) - 6,
    );
    const y = (top + bottom) / 2 - height / 2;

    // Fixed positioning can be offset by a transformed ancestor (an opening
    // sheet), so measure where the caret's origin actually sits.
    const at = caret.getBoundingClientRect();
    const originX = at.left - parseFloat(caret.style.left || "0");
    const originY = at.top - parseFloat(caret.style.top || "0");
    caret.style.left = `${x - originX - at.width / 2}px`;
    caret.style.top = `${y - originY}px`;
    caret.style.height = `${height}px`;
    caret.style.visibility = "visible";
    // Stay solid while the caret moves, like the native one.
    if (Math.abs(x - lastX) > 0.5) {
      const blink = caret.getAnimations()[0];
      if (blink) blink.currentTime = 0;
    }
    lastX = x;
  };

  const attach = (el: HTMLInputElement) => {
    detach();
    input = el;
    el.dataset.textCaret = "";
    lastX = NaN;
    measuredKey = "";
    caret.style.visibility = "hidden";
    // Modal sheets render in the top layer; the caret has to live inside them.
    (el.closest("dialog") ?? document.body).append(caret);
    document.body.append(ruler);
    frame = requestAnimationFrame(update);
  };

  document.addEventListener("focusin", (e) => {
    const target = e.target;
    if (
      target instanceof HTMLInputElement &&
      TEXT_TYPES.has(target.type) &&
      !target.readOnly
    )
      attach(target);
    else detach();
  });
  document.addEventListener("focusout", (e) => {
    if (e.target === input) detach();
  });
}
