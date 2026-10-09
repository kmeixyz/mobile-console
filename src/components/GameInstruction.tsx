import { ChevronRight, Smartphone } from "lucide-react";
import { type RefObject, useLayoutEffect, useRef } from "react";
import { type GameID } from "../lib/store";
import "./game-instruction.css";

export const controlHints: Record<GameID, string> = {
  basket: "Point to move · Tap to hop",
  flashlight: "Point to search · Tap to snap",
  kart: "Point to steer · Tap for power-ups",
  sumo: "Point to drive · Tap to dash",
  tanks: "Point to drive · Tap to fire",
  paint: "Point to roll · Tap to splat",

  target: "Hold to aim · Let go to shoot",
  fruit: "Point to slice · Tap to pause",
  hockey: "Point to move · First to 5",
  rally: "Point to move · First to 5",
  moles: "Whack moles · Skip bunnies and foxes",
  maze: "Hold to drag · Dodge the bots",
};

/** The phone's start button, worded the same on the big screen and the phone. */
export const startLabels: Partial<Record<GameID, string>> = {
  basket: "Start round", flashlight: "Start hunt", kart: "Start race", sumo: "Start match", tanks: "Start battle", paint: "Start painting",
  fruit: "Start slicing", moles: "Start round", hockey: "Play match", rally: "Play match",
};
/** The same button after a pause. */
export const resumeLabels: Partial<Record<GameID, string>> = { fruit: "Keep slicing", moles: "Resume round", hockey: "Play match", rally: "Play match" };

/** A start overlay's title: whose turn it is, small, over a big "Ready?". */
export function ReadyTitle({ player, paused = false }: { player?: string; paused?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useViewportCentered(heading);
  return <>
    {player && !paused && <p className="overlay-eyebrow">{player}</p>}
    <h2 ref={heading} tabIndex={-1}>{paused ? "Paused" : "Ready?"}</h2>
  </>;
}

/** The overlay covers only the game board, which sits below the top bar, so
    its centered content lands low. Pad the overlay's bottom so the content
    centers on the screen instead, as far as the board has room. Overlays
    that pin their content to the bottom (the kart track) are left alone. */
function useViewportCentered(inside: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const overlay = inside.current?.closest<HTMLElement>(".court-overlay, .arcade-overlay");
    if (!overlay) return;
    const center = () => {
      overlay.style.paddingBottom = "";
      const style = getComputedStyle(overlay);
      if (style.justifyContent === "flex-end") return;
      const box = overlay.getBoundingClientRect();
      const children = [...overlay.children].map(child => child.getBoundingClientRect());
      const content = Math.max(...children.map(r => r.bottom)) - Math.min(...children.map(r => r.top));
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const room = Math.max(0, (box.height - content - padding) / 2);
      const lift = Math.min(room, Math.max(0, box.top + box.height / 2 - innerHeight / 2));
      if (lift > 0) overlay.style.paddingBottom = `${parseFloat(style.paddingBottom) + lift * 2}px`;
    };
    center();
    const observer = new ResizeObserver(center);
    observer.observe(document.documentElement);
    addEventListener("resize", center);
    return () => {
      observer.disconnect();
      removeEventListener("resize", center);
      overlay.style.paddingBottom = "";
    };
  }, [inside]);
}

/** Each game and turn begins with the phone's Ready (centering) button, then
    the start button: shown as the buttons themselves, in order. */
export function ReadyInstruction({ game, paused = false }: { game: GameID; paused?: boolean }) {
  const start = paused ? resumeLabels[game] ?? startLabels[game] : startLabels[game];
  return <p className="ready-instruction">
    <span className="ready-step"><Smartphone aria-hidden="true" />{paused ? "Tap" : "Aim at the screen"}</span>
    {!paused && <><ChevronRight className="ready-arrow" aria-hidden="true" /><strong className="phone-key">Ready</strong></>}
    {!paused && <ChevronRight className="ready-arrow" aria-hidden="true" />}
    <strong className="phone-key is-go">{start}</strong>
  </p>;
}
