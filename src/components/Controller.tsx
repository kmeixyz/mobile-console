import { hasLiveLink, controlSender } from "../lib/connection-health.mjs";
import { useWakeLock } from "../lib/useWakeLock";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronLeft } from "lucide-react";
import { games, type GameID } from "../lib/store";
import {
  BLOCKED_MESSAGE,
  connectOptions,
  createPeer,
  onDirectFailure,
  roomPeerId,
} from "../lib/peer";
import type { Link } from "../lib/relay";
import type { Peer } from "peerjs";
import { describeDevice } from "../lib/device";
import MotionControls from "./MotionControls";
import TurnHandoff from "./TurnHandoff";
import Dialog from "./Dialog";
type RemoteState = {
  game: GameID | null;
  ready: boolean;
  label: string;
  handoff?: string | null;
  active?: string | null;
  /** This phone's player name, and whether the current turn or handoff is theirs. */
  you?: string;
  yourTurn?: boolean;
  yourHandoff?: boolean;
};
export default function Controller() {
  const [code, setCode] = useState(
    new URLSearchParams(location.search).get("join") || "",
  );
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  useWakeLock(connected);
  const [error, setError] = useState("");
  const [state, setState] = useState<RemoteState>({
    game: null,
    ready: false,
    label: "",
  });
  const [motionReady, setMotionReady] = useState(false);
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("mobile-console-player-name") || "";
    } catch {
      return "";
    }
  });
  const [named, setNamed] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // The name this phone already gave the big screen. Rejoining after a drop or
  // a removal skips the name step, so it is sent again on every join.
  const sentName = useRef("");
  const peer = useRef<Peer | null>(null);
  const conn = useRef<Link | null>(null);
  const session = useRef(crypto.randomUUID());
  const motionStatus = useRef(false);
  const lastHeard = useRef(Date.now());
  const heartbeatSupported = useRef(false);
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnect = useRef<(code: string, recovering?: boolean) => void>(() => {});
  const recover = useRef<() => void>(() => {});
  const [controls] = useState(() => controlSender(() => conn.current));
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);
  const close = () => {
    attempts.current++;
    controls.clear();
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    const old = peer.current;
    const link = conn.current;
    peer.current = null;
    conn.current = null;
    old?.destroy();
    // A relayed link isn't part of the peer, so it closes on its own.
    if (link?.relayed) link.close();
    if (timeout.current) clearTimeout(timeout.current);
  };
  const connect = useCallback((roomCode: string, recovering = false) => {
    if (!/^\d{6}$/.test(roomCode)) {
      setError("Enter the six-digit code shown on your larger screen.");
      return;
    }
    close();
    if (!recovering) retryCount.current = 0;
    setReconnecting(recovering);
    setError("");
    setConnecting(true);
    const attempt = ++attempts.current;
    const current = () => attempts.current === attempt;
    let joined = false;
    const fail = (message: string, retry = recovering) => {
      if (!current()) return;
      close();
      if (retry && retryCount.current < 5) {
        const delay = Math.min(4000, 500 * 2 ** retryCount.current++);
        setReconnecting(true);
        retryTimer.current = setTimeout(() => reconnect.current(roomCode, true), delay);
        return;
      }
      setReconnecting(false);
      setConnected(false);
      setConnecting(false);
      setError(message);
    };
    recover.current = () => fail("Connection lost. Check Wi-Fi and try joining again.", true);
    // Same handling for a direct link and a relayed one.
    const attach = (link: Link) => {
      conn.current = link;
      link.on("data", (raw) => {
        if (conn.current !== link) return;
        if (!raw || typeof raw !== "object") return;
        lastHeard.current = Date.now();
        const data = raw as { type?: string } & Record<string, unknown>;
        if (data.type === "joined") {
          joined = true;
          heartbeatSupported.current = data.heartbeat === true;
          retryCount.current = 0;
          setReconnecting(false);
          if (timeout.current) clearTimeout(timeout.current);
          setError("");
          setConnected(true);
          setConnecting(false);
          setState({ ...(data.state as RemoteState), you: String(data.you || "") });
          if (sentName.current)
            link.send({ type: "name", name: sentName.current });
          link.send({ type: "motion-ready", ready: motionStatus.current });
          describeDevice().then((name) => {
            if (conn.current === link && link.open)
              link.send({ type: "device", name });
          });
        }
        if (data.type === "state") setState(data as unknown as RemoteState);
        // The big screen's feedback: a slice, a hit, a bullseye.
        if (data.type === "buzz")
          navigator.vibrate?.(Math.min(300, Number(data.ms) || 0));
        if (data.type === "error") fail(String(data.message), false);
        if (data.type === "ended")
          fail(
            data.removed
              ? "The big screen removed this phone. Enter the code to rejoin."
              : "The room closed. Enter a new code.",
            false,
          );
      });
      const lost = () =>
        conn.current === link &&
        fail("Connection interrupted. Reconnecting to your game…", true);
      link.on("close", lost);
      link.on("error", lost);
    };
    // When the network won't allow a direct connection, go through the
    // Supabase backup instead. Tried once per attempt.
    let relaying = false;
    const useRelay = () => {
      if (!current() || relaying) return;
      // Broker errors must never tear down a healthy device-to-device link.
      if (joined && hasLiveLink(conn.current)) return;
      if (joined) return fail("Connection interrupted. Reconnecting to your game…", true);
      relaying = true;
      if (timeout.current) clearTimeout(timeout.current);
      const old = peer.current;
      peer.current = null;
      conn.current = null;
      old?.destroy();
      import("../lib/relay")
        .then(({ joinRelay }) => joinRelay(roomCode, session.current))
        .then(
        (link) => {
          if (current()) attach(link);
          else link.close();
        },
        () =>
          fail(
            brokerReached
              ? BLOCKED_MESSAGE
              : "Room not found, or this phone is offline. Check the code and your connection.",
          ),
      );
    };
    let brokerReached = false;
    const self = createPeer();
    peer.current = self;
    // A direct connection normally takes a second or two.
    timeout.current = setTimeout(useRelay, 6000);
    self.on("open", () => {
      if (peer.current !== self) return;
      brokerReached = true;
      const link = self.connect(roomPeerId(roomCode), { ...connectOptions, metadata: { resumeId: session.current } });
      onDirectFailure(link, useRelay);
      attach(link as unknown as Link);
    });
    self.on("error", (err) => {
      if (peer.current !== self) return;
      if (joined && hasLiveLink(conn.current)) return;
      // The room doesn't exist; the backup wouldn't find it either.
      if (err.type === "peer-unavailable")
        fail("Room not found. Check the six-digit code and try again.");
      else useRelay();
    });
  }, []);
  reconnect.current = connect;
  useEffect(() => {
    const initial = new URLSearchParams(location.search).get("join");
    if (initial && /^\d{6}$/.test(initial)) connect(initial);
    return close;
  }, [connect]);
  // Check in with the big screen, and say goodbye when this page closes.
  useEffect(() => {
    if (!connected) return;
    const send = (type: string) => {
      if (conn.current?.open) conn.current.send({ type });
    };
    const check = () => {
      if (document.hidden) return;
      if (!reconnecting && heartbeatSupported.current && Date.now() - lastHeard.current > 20000) {
        recover.current();
        return;
      }
      send("ping");
    };
    const resume = () => {
      if (document.hidden) return;
      lastHeard.current = Date.now();
      send("ping");
    };
    const ping = setInterval(check, 5000);
    const bye = (event: PageTransitionEvent) => { if (!event.persisted) send("leave"); };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("pagehide", bye);
    return () => {
      clearInterval(ping);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("pagehide", bye);
    };
  }, [connected, reconnecting]);
  const reportMotion = useCallback((ready: boolean) => {
    motionStatus.current = ready;
    setMotionReady(ready);
    if (conn.current?.open) conn.current.send({ type: "motion-ready", ready });
  }, []);
  const send = (action: string, value = 0) => {
    if (!reconnecting && motionReady && state.ready && conn.current?.open)
      controls.send(action, value);
  };
  const disconnect = () => {
    setConfirmLeave(false);
    close();
    setConnected(false);
    setReconnecting(false);
    motionStatus.current = false;
    setMotionReady(false);
    setNamed(false);
    sentName.current = "";
    setError("");
    setState({ game: null, ready: false, label: "" });
  };
  // Another player's phone has the turn; this one just watches.
  const waiting =
    !!state.game &&
    !state.handoff &&
    state.label !== "Game complete" &&
    state.yourTurn === false;
  return (
    <div className="controller-page">
      <header className="controller-header">
        <button
          className="brand"
          aria-label="Mobile Console home"
          onClick={() => window.location.reload()}
        >
          <img className="brand-symbol" src="/icon-192.png" alt="" />
        </button>
        {connected && (
          <button
            className="controller-connected"
            aria-label="Connected — disconnect"
            aria-haspopup="dialog"
            onClick={() => setConfirmLeave(true)}
          >
            <span className="connected-label">{reconnecting ? "Reconnecting…" : "Connected"}</span>
            <Check size={16} aria-hidden="true" />
          </button>
        )}
      </header>
      <main>
        {reconnecting && connected && <p className="controller-status" role="status">Reconnecting to your game… Keep this page open.</p>}
        {!connected ? (
          <div className="join-room">
            <h1>Enter room code</h1>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                connect(code);
              }}
            >
              <input
                id="room-code"
                aria-label="Room code"
                aria-describedby={error ? "room-code-error" : undefined}
                aria-invalid={Boolean(error)}
                className="room-code-input"
                inputMode="numeric"
                pattern="[0-9]{6}"
                autoComplete="off"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ""));
                  setError("");
                }}
                required
              />
              <button
                className="primary-button full-width"
                disabled={connecting || code.length !== 6}
              >
                {connecting ? (
                  <>
                    <span className="spinner small" />
                    Connecting…
                  </>
                ) : (
                  <>
                    Join <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
            {error && (
              <p id="room-code-error" className="error-message" role="alert">
                {error}
              </p>
            )}
            <a href="/" className="text-button">
              <ChevronLeft size={17} /> Back
            </a>
          </div>
        ) : !named ? (
          <div className="join-room name-step">
            <h1>Enter name</h1>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const player = name.trim().slice(0, 20);
                if (!player) return;
                try {
                  localStorage.setItem("mobile-console-player-name", player);
                } catch {
                  // Remembering the name is a convenience only.
                }
                if (conn.current?.open)
                  conn.current.send({ type: "name", name: player });
                sentName.current = player;
                setNamed(true);
              }}
            >
              <input
                aria-label="Your name"
                className="name-input"
                autoComplete="nickname"
                autoCapitalize="words"
                enterKeyHint="done"
                maxLength={20}
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <button
                className="primary-button full-width"
                disabled={!name.trim()}
              >
                Continue <ArrowRight size={18} />
              </button>
            </form>
          </div>
        ) : !state.game ? (
          motionReady && (
            <div className="controller-wait">
              <p>Pick a game on the big screen.</p>
            </div>
          )
        ) : (
          <div className="active-controller">
            <h1>{games[state.game].title}</h1>
            {/* The game's own status stays on the big screen; the phone only
                says when it's someone else's turn. */}
            {waiting && (
              <p className="controller-status" aria-live="polite">
                {state.active}’s turn. Watch the big screen.
              </p>
            )}
            {state.handoff &&
              (state.yourHandoff === false ? (
                <p className="controller-status">
                  Waiting for {state.handoff} to get ready.
                </p>
              ) : (
                <TurnHandoff
                  name={state.handoff}
                  disabled={!state.ready || !motionReady}
                  onReady={() => send("next")}
                />
              ))}
            {state.label === "Game complete" && (
              <div className="controller-complete">
                <h2>Nicely played.</h2>
                <p>Choose what’s next on the big screen.</p>
              </div>
            )}
          </div>
        )}
        {connected && named && (
          <MotionControls
            game={state.game}
            handoff={
              !!state.handoff || state.label === "Game complete" || waiting
            }
            ready={!reconnecting && state.ready && motionReady}
            label={state.label}
            onControl={(event) => send(event.action, event.value)}
            onReadyChange={reportMotion}
            suspended={
              reconnecting || (state.label === "Paused on the big screen" && motionReady)
            }
            remote
          />
        )}
        {connected && (
          <button
            className="text-button disconnect-button"
            onClick={disconnect}
          >
            Leave room
          </button>
        )}
      </main>
      {confirmLeave && (
        <Dialog
          title="Disconnect from the big screen?"
          className="end-game-sheet"
          onClose={() => setConfirmLeave(false)}
        >
          <button
            data-initial-focus
            className="primary-button full-width"
            onClick={() => setConfirmLeave(false)}
          >
            Stay connected
          </button>
          <button
            className="secondary-button full-width end-game-button"
            onClick={disconnect}
          >
            Disconnect
          </button>
        </Dialog>
      )}
    </div>
  );
}
