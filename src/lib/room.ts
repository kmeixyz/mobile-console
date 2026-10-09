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
/**
 * How a phone is held: upright and aimed, turned sideways, or upright again
 * but not yet recentered with Ready.
 */
export type Pose = "upright" | "sideways" | "recentering";
const poses: Pose[] = ["upright", "sideways", "recentering"];
export type RoomPlayer = {
  id: string;
  name: string;
  device: string;
  motionReady: boolean;
  pose: Pose;
  /** Connected, but not heard from for a few seconds. */
  quiet: boolean;
};
/** A player the game can't continue without, and why. */
export type Waiting = { name: string; reason: "away" | Exclude<Pose, "upright"> };
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
// Phones check in every 2 seconds; one silent this long has left. Generous
// enough to survive a phone's screen locking briefly between turns.
const PHONE_TIMEOUT = 30000;
// A phone silent this long pauses the game until it's heard from again.
const QUIET_MS = 7000;
// Direct phones send smoothed aim ~60 times a second and every game eases its
// own input, so their aim goes straight to the game. Relayed phones send ~15 a
// second, so their aim eases between updates here.
const RELAY_GLIDE_MS = 60;
// The room code survives a reload of the big screen, so phones (which keep
// retrying it) come straight back instead of needing a new code.
const ROOM_KEY = "mobile-console-room";
const savedRoom = () => {
  try {
    const code = sessionStorage.getItem(ROOM_KEY) || "";
    return /^\d{6}$/.test(code) ? code : "";
  } catch {
    return "";
  }
};
const saveRoom = (code: string) => {
  try {
    if (code) sessionStorage.setItem(ROOM_KEY, code);
    else sessionStorage.removeItem(ROOM_KEY);
  } catch {
    // Reusing the code is a convenience only.
  }
};
// The big screen hosts the room: up to four phones join, and the big screen
// validates everything they send and routes controls to whoever's turn it is.
export function useRoom(isSuspended = false, requirePhone = false, participants: string[] | null = null) {
  const playing = useRef(participants);
  playing.current = participants;
  const peer = useRef<Peer | null>(null);
  // Stops the Supabase backup for the current room.
  const stopRelay = useRef<(() => void) | null>(null);
  const endRelay = () => {
    stopRelay.current?.();
    stopRelay.current = null;
  };
  const creating = useRef(false);
  // A room was asked for and not given up on; failures retry on their own.
  const wanted = useRef(false);
  const retryRoom = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [gameState, setGameState] = useState(state.current);
  // Whose phones the game needs right now: the turn's player, the next one
  // at a handoff, or everyone in a game played at once.
  const needed =
    !participants || !gameState.game || gameState.label === "Game complete"
      ? []
      : gameState.handoff
        ? [gameState.handoff]
        : gameState.active
          ? [gameState.active]
          : participants;
  const waiting = needed.flatMap((name): Waiting[] => {
    const phone = players.find((p) => p.name === name);
    if (!phone?.motionReady || phone.quiet) return [{ name, reason: "away" }];
    return phone.pose === "upright" ? [] : [{ name, reason: phone.pose }];
  });
  const waitingFor = useRef<string[]>([]);
  waitingFor.current = waiting.map((w) => w.name);
  // While the game waits on a phone, the others hold their aim and say who
  // it's waiting for; the phone being waited on keeps its controls, so it can
  // recenter and carry on.
  const wireState = (p?: Phone) => {
    const others = waitingFor.current.filter((name) => name !== p?.name);
    if (!state.current.game) return state.current;
    if (suspended.current)
      return { ...state.current, ready: false, label: "Paused on the big screen" };
    if (others.length && others.length === waitingFor.current.length)
      return { ...state.current, ready: false, label: `Waiting for ${others.join(", ")}` };
    return state.current;
  };
  const sync = () =>
    setPlayers(
      [...phones.current.values()]
        .filter((p) => p.conn.open)
        .map(({ id, name, device, motionReady, pose, quiet }) => ({
          id,
          name,
          device,
          motionReady,
          pose,
          quiet,
        })),
    );
  // Each phone hears whose turn it is and whether that turn is its own.
  const sendState = (p: Phone) => {
    if (!p.conn.open) return;
    p.conn.send({
      type: "state",
      ...wireState(p),
      you: p.name,
      yourTurn: mayControl(p, "aim"),
      yourHandoff: mayControl(p, "next"),
    });
  };
  const broadcast = () => phones.current.forEach(sendState);
  // Each phone eases its own aim, so two players steering at once (air
  // hockey) don't pull one shared value back and forth.
  type Glide = Record<Steer, { target: number; value: number | null }>;
  const glide = useRef(new Map<Phone, Glide>());
  const glideFor = (p: Phone) => {
    let g = glide.current.get(p);
    if (!g) {
      g = {
        aim: { target: 0, value: null },
        move: { target: 0, value: null },
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
        const k = 1 - Math.exp(-dt / RELAY_GLIDE_MS);
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
    // Easing here would also cost a frame: this step runs after the game's own
    // frame has already read the aim.
    if (g.value === null || !p.conn.relayed) {
      g.value = value;
      handler.current?.({ action, value, player: p.name });
      return;
    }
    if (frame.current === null) frame.current = requestAnimationFrame(step);
  };
  /**
   * Selected phones own their turns, including while one is reconnecting.
   * Legacy callers without a roster can still share a phone between names.
   */
  const mayControl = (p: Phone, action: string) => {
    if (playing.current && !playing.current.includes(p.name)) return false;
    const turn =
      action === "next" ? state.current.handoff : state.current.active;
    if (!turn) return true;
    if (playing.current) return p.name === turn;
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
    wanted.current = false;
    creating.current = false;
    if (retryRoom.current) clearTimeout(retryRoom.current);
    saveRoom("");
  }, []);
  const accept = (host: Peer, conn: Link) => {
    const resumeId = conn.metadata?.resumeId;
    if (typeof resumeId === "string" && /^[a-zA-Z0-9-]{20,64}$/.test(resumeId)) {
      for (const [oldId, old] of phones.current) {
        if (old.conn.metadata?.resumeId !== resumeId) continue;
        phones.current.delete(oldId);
        glide.current.delete(old);
        // A rejoining phone has already let go of its old link; one that
        // still listens is a duplicated tab, and stops instead of fighting.
        if (old.conn.open) {
          old.conn.send({ type: "replaced" });
          setTimeout(() => old.conn.close(), 150);
        } else old.conn.close();
      }
    }
    if (phones.current.size >= MAX_PHONES) {
      conn.on("open", () => {
        conn.send({
          type: "error",
          message: `Room full (${MAX_PHONES} phones max).`,
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
      pose: "upright",
      lastSeen: Date.now(),
      quiet: false,
    };
    const allowControl = controlBudget();
    // A phone found the room but the network never let it through.
    const blocked = () => {
      if (conn.open) return;
      conn.close();
      setError(
        "A phone couldn’t connect. This network may block it.",
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
      conn.send({ type: "joined", state: wireState(phone), you: "", heartbeat: true });
    });
    conn.on("data", (raw) => {
      if (phones.current.get(id) !== phone) return;
      phone.lastSeen = Date.now();
      if (phone.quiet) {
        phone.quiet = false;
        sync();
      }
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
      } else if (data.type === "pose") {
        if (!poses.includes(data.pose as Pose)) return;
        phone.pose = data.pose as Pose;
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
    wanted.current = true;
    if (retryRoom.current) clearTimeout(retryRoom.current);
    retryRoom.current = null;
    if (peer.current || creating.current) return;
    creating.current = true;
    setError("");
    setConnecting(true);
    let attempts = 0;
    // Right after a reload the broker may still hold the old page's ID for a
    // moment, so the saved code gets a few tries before a new one is drawn.
    let reuse = savedRoom();
    let reuseTries = 0;
    const giveUp = () => {
      creating.current = false;
      setConnecting(false);
      setError("Couldn’t connect. Trying again…");
      // Keep trying on its own; the network may be back in a moment.
      retryRoom.current = setTimeout(() => {
        retryRoom.current = null;
        if (wanted.current && alive.current && !peer.current) create();
      }, 5000);
    };
    const open = () => {
      const roomCode = reuse || newRoomCode();
      const host = createPeer(roomPeerId(roomCode));
      peer.current = host;
      let opened = false;
      const timeout = setTimeout(() => {
        if (peer.current === host && !host.open) {
          peer.current = null;
          host.destroy();
          giveUp();
        }
      }, 10000);
      host.on("open", () => {
        clearTimeout(timeout);
        if (peer.current !== host) return;
        reconnects = 0;
        if (opened) return;
        opened = true;
        creating.current = false;
        saveRoom(roomCode);
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
      // phones can still find this room. Backs off while the network is down.
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
      let reconnects = 0;
      const rejoinBroker = (delay = Math.min(15000, 1000 * 2 ** reconnects)) => {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (peer.current !== host || host.destroyed || !host.disconnected) return;
          reconnects++;
          host.reconnect();
        }, delay);
      };
      host.on("disconnected", () => rejoinBroker());
      const nudge = () => {
        if (!document.hidden && peer.current === host && host.disconnected) rejoinBroker(0);
      };
      window.addEventListener("online", nudge);
      document.addEventListener("visibilitychange", nudge);
      host.on("close", () => {
        window.removeEventListener("online", nudge);
        document.removeEventListener("visibilitychange", nudge);
        if (reconnectTimer) clearTimeout(reconnectTimer);
      });
      host.on("error", (err) => {
        if (peer.current !== host) return;
        clearTimeout(timeout);
        if (err.type === "unavailable-id") {
          // Our own ID, still held from before a broker drop: the room and its
          // phones are fine, so just try the broker again shortly.
          if (opened) return rejoinBroker(3000);
          peer.current = null;
          host.destroy();
          if (reuse && ++reuseTries < 4) {
            setTimeout(() => {
              if (wanted.current && alive.current && !peer.current) open();
              else creating.current = false;
            }, 1500);
            return;
          }
          reuse = "";
          if (++attempts < 5) return open();
          return giveUp();
        }
        if (err.type === "peer-unavailable" || err.type === "webrtc") return;
        // PeerJS sets open=false when its broker socket drops. The game data
        // channels are independent and must survive that signaling outage.
        if (err.type === "network" || err.type === "socket-error" || err.type === "socket-closed" || err.type === "disconnected") {
          if (opened) return;
          // Never reached the broker: try again from scratch.
          peer.current = null;
          host.destroy();
          return giveUp();
        }
        peer.current = null;
        host.destroy();
        endRelay();
        phones.current.clear();
        sync();
        setCode("");
        giveUp();
      });
    };
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
  const waitingKey = waiting.map((w) => `${w.name}:${w.reason}`).join();
  useEffect(() => {
    broadcast();
  }, [blocked, waitingKey]);
  // Pause for phones that went quiet, and drop ones that stopped checking in
  // (closed tab, lost Wi-Fi, locked screen).
  useEffect(() => {
    const sweep = setInterval(() => {
      let changed = false;
      phones.current.forEach((p, id) => {
        const silent = Date.now() - p.lastSeen;
        if (silent >= QUIET_MS && !p.quiet) {
          p.quiet = true;
          changed = true;
        }
        if (silent < PHONE_TIMEOUT) return;
        phones.current.delete(id);
        p.conn.close();
        changed = true;
      });
      if (changed) {
        resetGlide();
        sync();
      }
    }, 1000);
    return () => clearInterval(sweep);
  }, []);
  useEffect(() => {
    // Tell phones right away when the big screen closes or reloads. A reload
    // keeps the room code, so they wait and retry rather than give up.
    const goodbye = () =>
      phones.current.forEach((p) => p.conn.open && p.conn.send({ type: "away" }));
    window.addEventListener("pagehide", goodbye);
    alive.current = true;
    return () => {
      alive.current = false;
      creating.current = false;
      if (retryRoom.current) clearTimeout(retryRoom.current);
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
    waiting,
  };
}
