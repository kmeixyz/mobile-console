import { PHONE_REACH, PHONE_SENSITIVITY } from "./phone-point.mjs";
import { FONT } from "./system-font";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GameID } from "./store";
import type { RemoteAction, RoomPlayer, RoomState, Waiting } from "./room";
export type { Pose, RemoteAction, RoomPlayer, RoomState, Waiting } from "./room";
export const MAX_PHONES = 4;
// Demo mode (npm run demo) swaps this in for ./room.ts: a phone that's always
// connected with motion on, played with the big screen's mouse. Where the
// mouse is over the game is where the phone points, and the mouse button is
// the phone's button.
const player: RoomPlayer = {
  id: "demo",
  name: "",
  device: "Mouse",
  motionReady: true,
  pose: "upright",
  quiet: false,
};
const arenas =
  ".phone-game :is(.court-wrap, .target-wrap, .fruit-arena, .sports-arena, .lane-wrap, .moles-garden)";
// Same as the phone: these labels mean the button is held through a motion.
const holding = (s: RoomState) =>
  (s.game === "maze" && s.label === "Drag") ||
  (s.game === "target" && s.label.startsWith("Arrow"));
export function useRoom(isSuspended = false, _requirePhone = false, _participants: string[] | null = null) {
  const suspended = useRef(isSuspended);
  suspended.current = isSuspended;
  const handler = useRef<((event: RemoteAction) => void) | null>(null);
  const state = useRef<RoomState>({
    game: null,
    ready: false,
    label: "",
    handoff: null,
    active: null,
  });
  const [gameState, setGameState] = useState(state.current);
  const publish = useCallback(
    (
      game: GameID | null,
      ready: boolean,
      label = "",
      handoff: string | null = null,
      active: string | null = null,
    ) => {
      const next = { game, ready, label, handoff, active };
      state.current = next;
      setGameState((prev) =>
        prev.game === game &&
        prev.ready === ready &&
        prev.label === label &&
        prev.handoff === handoff &&
        prev.active === active
          ? prev
          : next,
      );
    },
    [],
  );
  useEffect(() => {
    const live = () =>
      !suspended.current && state.current.game && state.current.ready;
    const send = (event: RemoteAction) => handler.current?.(event);
    const point = (e: PointerEvent) => {
      const arena =
        document.querySelector<HTMLElement>(arenas) || document.querySelector<HTMLElement>(".phone-game");
      if (!arena) return null;
      const box = arena.getBoundingClientRect();
      const clamp = (n: number) => Math.max(-1, Math.min(1, n));
      if (state.current.game === "kart") {
        // Match the first human view, including the full-screen solo racer.
        return {
          x: clamp(((e.clientX - box.left) / (box.width * Number(arena.dataset.firstViewWidth || .5)) - .5) / .48),
          y: clamp(((e.clientY - box.top) / (box.height * Number(arena.dataset.firstViewHeight || .5)) - .5) / .47),
        };
      }
      if (["basket", "flashlight", "sumo", "tanks", "paint"].includes(state.current.game || "")) {
        const scale = Math.min(box.width / 900, box.height / 600);
        return {
          x: clamp(((e.clientX - box.left - (box.width - 900 * scale) / 2) / (900 * scale) - .5) / .48),
          y: clamp(((e.clientY - box.top - (box.height - 600 * scale) / 2) / (600 * scale) - .5) / .47),
        };
      }
      if (["hockey", "rally", "moles", "maze", "fruit"].includes(state.current.game || "")) {
        const views = Number(arena.dataset.phoneViews || 1);
        const width = box.width / views;
        const originX = Number(arena.dataset.phoneOriginX ?? .5);
        let originY = Number(arena.dataset.phoneOriginY ?? .5);
        if (state.current.game === "moles") {
          const scale = Math.min(box.width / 900, box.height / 600);
          originY = .5 + 20 * scale / box.height;
        }
        // The blade rests a little low, at 330 of 600.
        if (state.current.game === "fruit") originY = 330 / 600;
        return {
          x: clamp(((e.clientX - box.left) / width - originX) / PHONE_REACH.x / PHONE_SENSITIVITY),
          y: clamp(((e.clientY - box.top) / box.height - originY) / PHONE_REACH.y / PHONE_SENSITIVITY),
        };
      }
      return {
        x: clamp(((e.clientX - box.left) / box.width) * 2 - 1),
        y: clamp(((e.clientY - box.top) / box.height) * 2 - 1),
      };
    };
    const aim = (e: PointerEvent) => {
      const p = point(e);
      if (!p || !live()) return;
      send({ action: "aim", value: p.x });
      send({ action: "move", value: p.y });
    };
    // Clicks on the big screen's own buttons stay theirs.
    const onUI = (e: Event) =>
      (e.target as Element | null)?.closest?.(
        "button, a, input, select, textarea, label, dialog, .topbar",
      );
    let held: GameID | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || onUI(e) || !live()) return;
      aim(e);
      const s = state.current;
      if (s.handoff) send({ action: "next", value: 0 });
      else if (holding(s)) {
        held = s.game;
        send({ action: "draw", value: 1 });
      } else send({ action: "throw", value: 0 });
    };
    const up = (e: PointerEvent) => {
      if (!held) return;
      const game = held;
      held = null;
      aim(e);
      if (game === "target") send({ action: "shoot", value: 0 });
      else send({ action: "draw", value: 0 });
    };
    window.addEventListener("pointermove", aim, true);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      window.removeEventListener("pointermove", aim, true);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  }, []);
  // What the phone's button would say right now.
  useEffect(() => {
    const chip = document.createElement("div");
    chip.className = "demo-chip";
    chip.setAttribute("aria-hidden", "true");
    Object.assign(chip.style, {
      position: "fixed",
      right: "12px",
      bottom: "12px",
      zIndex: "1000",
      padding: "6px 14px",
      borderRadius: "999px",
      background: "#29465ae6",
      color: "#fff",
      font: `600 13px/1.3 ${FONT}`,
      pointerEvents: "none",
      whiteSpace: "nowrap",
    });
    document.body.append(chip);
    return () => chip.remove();
  }, []);
  useEffect(() => {
    const chip = document.querySelector<HTMLElement>(".demo-chip");
    if (!chip) return;
    const s = gameState;
    chip.textContent = !s.game
      ? "Demo mode · your mouse is the phone"
      : `Demo · mouse = phone · button: ${
          s.handoff ? "click when ready" : holding(s) ? `hold (${s.label})` : s.label || "—"
        }`;
  }, [gameState]);
  const noop = useCallback(() => {}, []);
  return {
    code: "000000",
    suspended,
    paired: true,
    players: [player],
    playerName: "",
    motionReady: true,
    error: "",
    connecting: false,
    create: noop,
    disconnect: noop,
    removePhone: noop as (id: string) => void,
    buzz: noop as (ms: number, player?: string) => void,
    publish,
    handler,
    gameState,
    waiting: [] as Waiting[],
  };
}
