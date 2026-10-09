import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Places in the game's top bar where a game can show its score and clock:
 * centered in the left or right half, or beside the Pause button.
 */
export type HudSlots = {
  start: HTMLElement | null;
  end: HTMLElement | null;
  corner: HTMLElement | null;
};
export const HudContext = createContext<HudSlots>({
  start: null,
  end: null,
  corner: null,
});
export function Hud({
  slot,
  children,
}: {
  slot: keyof HudSlots;
  children: ReactNode;
}) {
  const target = useContext(HudContext)[slot];
  return target ? createPortal(children, target) : null;
}
