import { controlBudget } from "./connection-health.mjs";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GameID } from "./store";
import { createPeer, newRoomCode, onDirectFailure, roomPeerId } from "./peer";
import type { Link } from "./relay";
import type { Peer } from "peerjs";
export type RemoteAction = {
  action:
    | "aim"
    | "throw"
    | "move"
    | "shoot"
    | "draw"
    | "next"
    | "position"
    | "angle"
    | "spin";
  value: number;
  /** Name of the phone that sent it, for games where players move at once. */
  player?: string;
};
export type RoomState = {
  game: GameID | null;
  ready: boolean;
  label: string;
  /** Next player to tap "I'm ready" between turns. */
  handoff: string | null;
  /** Player whose phone controls the game right now. */
  active: string | null;
};
export type RoomPlayer = {
  id: string;
  name: string;
  device: string;
  motionReady: boolean;
};
export const MAX_PHONES = 4;
const actions = [
  "aim",
  "throw",
  "move",
  "shoot",
  // Archery: the phone's button is held to draw the bow (1), or let go (0).
  "draw",
  "next",
  // Bowling: starting spot and angle from the phone's buttons, spin from the swing.
  "position",
  "angle",
  "spin",
];
type Steer = "aim" | "move";
type Phone = RoomPlayer & { conn: Link; lastSeen: number };
// Phones check in every 5 seconds; one silent this long has left. Generous
// enough to survive a phone's screen locking briefly between turns.
const PHONE_TIMEOUT = 30000;
// Aim arrives ~60 times a second; a short ease hides gaps between updates.
// Relayed phones send ~15 a second, so their aim eases over a longer time.
const GLIDE_MS = 12;
const RELAY_GLIDE_MS = 60;
// The big screen hosts the room: up to four phones join, and the big screen
// validates everything they send and routes controls to whoever's turn it is.
export function useRoom(isSuspended = false, requirePhone = false) {
  const peer = useRef<Peer | null>(null);
  // Stops the Supabase backup for the current room.
  const stopRelay = useRef<(() => void) | null>(null);
  const endRelay = () => {
    stopRelay.current?.();
    stopRelay.current = null;
  };
  const creating = useRef(false);
  const alive = useRef(true);
  const phones = useRef(new Map<string, Phone>());
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const paired = players.length > 0;
  const motionReady = players.some((p) => p.motionReady);
  const playerName = players.find((p) => p.name)?.name || "";
  const blocked = isSuspended || (requirePhone && (!paired || !motionReady));
  const suspended = useRef(blocked);
  suspended.current = blocked;
  const handler = useRef<((event: RemoteAction) => void) | null>(null);
  const state = useRef<RoomState>({
    game: null,
    ready: false,
    label: "",
    handoff: null,
    active: null,
  });
  const wireState = () =>
    suspended.current && state.current.game
      ? { ...state.current, ready: false, label: "Paused on the big screen" }
      : state.current;
  const [gameState, setGameState] = useState(state.current);
  const sync = () =>
    setPlayers(
      [...phones.current.values()]
        .filter((p) => p.conn.open)
        .map(({ id, name, device, motionReady }) => ({
          id,
          name,
          device,
          motionReady,
        })),
    );
  // Each phone hears whose turn it is and whether that turn is its own.
  const sendState = (p: Phone) => {
    if (!p.conn.open) return;
    p.conn.send({
      type: "state",
      ...wireState(),
      you: p.name,
      yourTurn: mayControl(p, "aim"),
      yourHandoff: mayControl(p, "next"),
    });
  };
  const broadcast = () => phones.current.forEach(sendState);
  // Each phone eases its own aim, so two players steering at once (air
  // hockey) don't pull one shared value back and forth.
  type Glide = Record<Steer, { target: number; value: number | null; ms: number }>;
  const glide = useRef(new Map<Phone, Glide>());
  const glideFor = (p: Phone) => {
    let g = glide.current.get(p);
    if (!g) {
      g = {
        aim: { target: 0, value: null, ms: GLIDE_MS },
        move: { target: 0, value: null, ms: GLIDE_MS },
      };
      glide.current.set(p, g);
    }
    return g;
  };
  const frame = useRef<number | null>(null);
  const lastFrame = useRef(0);
  const resetGlide = () => {
    glide.current.clear();
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    lastFrame.current = 0;
  };
  const step = (time: number) => {
    frame.current = null;
    if (suspended.current) return resetGlide();
    const dt = lastFrame.current ? Math.min(time - lastFrame.current, 100) : 16;
    lastFrame.current = time;
    let moving = false;
    glide.current.forEach((axes, p) => {
      for (const action of ["aim", "move"] as const) {
        const g = axes[action];
        if (g.value === null || g.value === g.target) continue;
        const k = 1 - Math.exp(-dt / g.ms);
        g.value =
          Math.abs(g.target - g.value) < 0.002
            ? g.target
            : g.value + (g.target - g.value) * k;
        handler.current?.({ action, value: g.value, player: p.name });
        if (g.value !== g.target) moving = true;
      }
    });
    if (moving) frame.current = requestAnimationFrame(step);
    else lastFrame.current = 0;
  };
  const steer = (p: Phone, action: Steer, value: number) => {
    const g = glideFor(p)[action];
    g.target = value;
    g.ms = p.conn.relayed ? RELAY_GLIDE_MS : GLIDE_MS;
    if (g.value === null) {
      g.value = value;
      handler.current?.({ action, value, player: p.name });
      return;
    }
    if (frame.current === null) frame.current = requestAnimationFrame(step);
  };
  /**
   * Only the current player's phone steers the game. If nobody's phone carries
   * that name (one phone passed around the room), any ready phone may play.
   */
  const mayControl = (p: Phone, action: string) => {
    const turn =
      action === "next" ? state.current.handoff : state.current.active;
    if (!turn) return true;
    const owner = [...phones.current.values()].some(
      (other) => other.conn.open && other.name === turn,
    );
    return !owner || p.name === turn;
  };
  // Names must be unique so turns can be routed by name.
  const uniqueName = (wanted: string, id: string) => {
    const taken = (n: string) =>
      [...phones.current.values()].some((p) => p.id !== id && p.name === n);
    let name = wanted;
    for (let i = 2; taken(name); i++) name = `${wanted} ${i}`;
    return name;
  };
  /**
   * A short vibration on the phone that's playing (where phones support it),
   * or on the named player's phone when several play at once.
   */
  const buzz = useCallback((ms: number, player?: string) => {
    phones.current.forEach((p) => {
      if (
        p.conn.open &&
        p.motionReady &&
        (player ? p.name === player : mayControl(p, "aim"))
      )
        p.conn.send({ type: "buzz", ms });
    });
  }, []);
  const removePhone = (id: string) => {
    const p = phones.current.get(id);
    if (!p) return;
    phones.current.delete(id);
    if (p.conn.open) {
      p.conn.send({ type: "ended", removed: true });
      setTimeout(() => p.conn.close(), 150);
    }
    resetGlide();
    sync();
  };
  const disconnect = useCallback(() => {
    const host = peer.current;
    peer.current = null;
    phones.current.forEach((p) => p.conn.open && p.conn.send({ type: "ended" }));
    // Give the goodbye a moment to arrive before tearing down.
    setTimeout(() => {
      host?.destroy();
      endRelay();
    }, 150);
    phones.current.clear();
    resetGlide();
    sync();
    setCode("");
    setConnecting(false);
  }, []);
  const accept = (host: Peer, conn: Link) => {
    const resumeId = conn.metadata?.resumeId;
    if (typeof resumeId === "string" && /^[a-zA-Z0-9-]{20,64}$/.test(resumeId)) {
      for (const [oldId, old] of phones.current) {
        if (old.conn.metadata?.resumeId !== resumeId) continue;
        phones.current.delete(oldId);
        glide.current.delete(old);
        old.conn.close();
      }
    }
    if (phones.current.size >= MAX_PHONES) {
      conn.on("open", () => {
        conn.send({
          type: "error",
          message: `This room is full. Up to ${MAX_PHONES} phones can play at once.`,
        });
        setTimeout(() => conn.close(), 300);
      });
      return;
    }
    const id = conn.connectionId;
    const phone: Phone = {
      id,
      conn,
      name: "",
      device: "",
      motionReady: false,
      lastSeen: Date.now(),
    };
    const allowControl = controlBudget();
    // A phone found the room but the network never let it through.
    const blocked = () => {
      if (conn.open) return;
      conn.close();
      setError(
        "A phone found this room but couldn’t connect. This network may block devices from talking to each other.",
      );
    };
    onDirectFailure(conn, blocked);
    const openTimer = setTimeout(blocked, 15000);
    conn.on("open", () => {
      clearTimeout(openTimer);
      if (peer.current !== host) return conn.close();
      setError("");
      phone.lastSeen = Date.now();
      phones.current.set(id, phone);
      sync();
      conn.send({ type: "joined", state: wireState(), you: "", heartbeat: true });
    });
    conn.on("data", (raw) => {
      if (phones.current.get(id) !== phone) return;
      phone.lastSeen = Date.now();
      const data = raw as Record<string, unknown>;
      if (!data || typeof data !== "object") return;
      if (data.type === "leave") return leave();
      // Relayed phones can't see the connection drop, so they listen for this.
      if (data.type === "ping") conn.send({ type: "pong" });
      if (data.type === "device") {
        phone.device = String(data.name || "").slice(0, 60);
        sync();
      } else if (data.type === "name") {
        const wanted = String(data.name || "")
          .trim()
          .slice(0, 20);
        phone.name = wanted ? uniqueName(wanted, id) : "";
        sync();
        sendState(phone);
      } else if (data.type === "motion-ready") {
        phone.motionReady = data.ready === true;
        sync();
      } else if (data.type === "control") {
        if (!allowControl(Date.now())) return;
        if (!phone.motionReady || !state.current.ready || suspended.current)
          return;
        if (!actions.includes(String(data.action))) return;
        const value = Number(data.value);
        if (!Number.isFinite(value)) return;
        const action = data.action as RemoteAction["action"];
        if (!mayControl(phone, action)) return;
        const clamped = Math.max(-1, Math.min(1, value));
        if (action === "aim" || action === "move")
          steer(phone, action, clamped);
        else {
          // Finish smoothing before an action uses the aim. Otherwise a shot
          // can land at the previous animation frame's position.
          const axes = glide.current.get(phone);
          if (
            axes &&
            (action === "shoot" || action === "throw" || action === "draw")
          ) {
            for (const axis of ["aim", "move"] as const) {
              const g = axes[axis];
              if (g.value !== null) {
                g.value = g.target;
                handler.current?.({
                  action: axis,
                  value: g.target,
                  player: phone.name,
                });
              }
            }
          }
          handler.current?.({ action, value: clamped, player: phone.name });
        }
      }
    });
    function leave() {
      if (phones.current.get(id) !== phone) return;
      phones.current.delete(id);
      conn.close();
      resetGlide();
      sync();
    }
    conn.on("close", leave);
    conn.on("error", leave);
    // The browser noticed the link is gone (closing a tab doesn't always say so).
    conn.peerConnection?.addEventListener("connectionstatechange", () => {
      const s = conn.peerConnection?.connectionState;
      if (s === "failed" || s === "closed") leave();
    });
  };
  const create = useCallback(() => {
    if (peer.current || creating.current) return;
    creating.current = true;
    setError("");
    setConnecting(true);
    let attempts = 0;
    const open = () => {
      const roomCode = newRoomCode();
      const host = createPeer(roomPeerId(roomCode));
      peer.current = host;
      const timeout = setTimeout(() => {
        if (peer.current === host && !host.open) {
          setError("Couldn’t connect. Check your connection and try again.");
          setConnecting(false);
          peer.current = null;
          host.destroy();
        }
      }, 10000);
      host.on("open", () => {
        clearTimeout(timeout);
        if (peer.current !== host) return;
        setError("");
        setCode(roomCode);
        setConnecting(false);
        // Phones whose network blocks a direct connection come in this way.
        import("./relay").then(({ hostRelay }) => {
          if (peer.current !== host || stopRelay.current) return;
          stopRelay.current = hostRelay(roomCode, (link) => {
            if (peer.current === host) accept(host, link);
            else link.close();
          });
        });
      });
      host.on("connection", (conn) => {
        if (peer.current === host) accept(host, conn as unknown as Link);
        else conn.close();
      });
      // Losing the broker keeps current phones connected; reconnect so new
      // phones can still find this room.
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
      host.on("disconnected", () => {
        if (reconnectTimer) return;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (peer.current === host && !host.destroyed && host.disconnected) host.reconnect();
        }, 1000);
      });
      host.on("error", (err) => {
        if (peer.current !== host) return;
        clearTimeout(timeout);
        if (err.type === "unavailable-id" && ++attempts < 5) {
          peer.current = null;
          host.destroy();
          open();
          return;
        }
        if (err.type === "peer-unavailable" || err.type === "webrtc") return;
        // PeerJS sets open=false when its broker socket drops. The game data
        // channels are independent and must survive that signaling outage.
        if (err.type === "network" || err.type === "socket-error" || err.type === "socket-closed" || err.type === "disconnected") return;
        peer.current = null;
        host.destroy();
        endRelay();
        phones.current.clear();
        sync();
        setCode("");
        setConnecting(false);
        setError("Couldn’t connect. Check your connection and try again.");
      });
    };
    creating.current = false;
    open();
  }, []);
  const publish = useCallback(
    (
      game: GameID | null,
      ready: boolean,
      label = "",
      handoff: string | null = null,
      active: string | null = null,
    ) => {
      const old = state.current;
      // A new game or turn starts from the phone's current aim, not a glide.
      if (game !== old.game || ready !== old.ready || active !== old.active)
        resetGlide();
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
      broadcast();
    },
    [],
  );
  useEffect(() => {
    broadcast();
  }, [blocked]);
  // Drop phones that stopped checking in (closed tab, lost Wi-Fi, locked screen).
  useEffect(() => {
    const sweep = setInterval(() => {
      let changed = false;
      phones.current.forEach((p, id) => {
        if (Date.now() - p.lastSeen < PHONE_TIMEOUT) return;
        phones.current.delete(id);
        p.conn.close();
        changed = true;
      });
      if (changed) {
        resetGlide();
        sync();
      }
    }, 3000);
    return () => clearInterval(sweep);
  }, []);
  useEffect(() => {
    // Tell phones right away when the big screen closes or reloads.
    const goodbye = () =>
      phones.current.forEach((p) => p.conn.open && p.conn.send({ type: "ended" }));
    window.addEventListener("pagehide", goodbye);
    alive.current = true;
    return () => {
      alive.current = false;
      window.removeEventListener("pagehide", goodbye);
      const host = peer.current;
      peer.current = null;
      host?.destroy();
      endRelay();
    };
  }, []);
  return {
    code,
    suspended,
    paired,
    players,
    playerName,
    motionReady,
    error,
    connecting,
    create,
    disconnect,
    removePhone,
    buzz,
    publish,
    handler,
    gameState,
  };
}
