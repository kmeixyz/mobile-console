import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronLeft } from "lucide-react";
import { games, type GameID } from "../lib/store";
import {
  BLOCKED_MESSAGE,
  connectOptions,
  createPeer,
  loadRelays,
  onDirectFailure,
  roomPeerId,
  type DataConnection,
} from "../lib/peer";
import type { Peer } from "peerjs";
import { describeDevice } from "../lib/device";
import MotionControls from "./MotionControls";
import TurnHandoff from "./TurnHandoff";
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
  const peer = useRef<Peer | null>(null);
  const conn = useRef<DataConnection | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);
  const close = () => {
    attempts.current++;
    const old = peer.current;
    peer.current = null;
    conn.current = null;
    old?.destroy();
    if (timeout.current) clearTimeout(timeout.current);
  };
  const connect = useCallback((roomCode: string) => {
    if (!/^\d{6}$/.test(roomCode)) {
      setError("Enter the six-digit code shown on your larger screen.");
      return;
    }
    close();
    setError("");
    setConnecting(true);
    const attempt = ++attempts.current;
    // Relay credentials first (at most a few seconds), so blocked networks can use them.
    loadRelays().then(() => {
      if (attempts.current !== attempt) return;
      const self = createPeer();
      peer.current = self;
      const fail = (message: string) => {
        if (peer.current !== self) return;
        close();
        setConnected(false);
        setConnecting(false);
        setError(message);
      };
      timeout.current = setTimeout(
        () =>
          fail(
            !self.open
              ? "Couldn’t reach the connection service. Check this phone’s internet connection."
              : conn.current
                ? BLOCKED_MESSAGE
                : "Connection timed out. Check your Wi-Fi and try again.",
          ),
        12000,
      );
      self.on("open", () => {
        if (peer.current !== self) return;
        const link = self.connect(roomPeerId(roomCode), connectOptions);
        conn.current = link;
        onDirectFailure(link, () => fail(BLOCKED_MESSAGE));
        link.on("data", (raw) => {
          if (conn.current !== link) return;
          const data = raw as { type?: string } & Record<string, unknown>;
          if (data.type === "joined") {
            if (timeout.current) clearTimeout(timeout.current);
            setError("");
            setConnected(true);
            setConnecting(false);
            setState({ ...(data.state as RemoteState), you: String(data.you || "") });
            describeDevice().then((name) => {
              if (conn.current === link && link.open)
                link.send({ type: "device", name });
            });
          }
          if (data.type === "state") setState(data as unknown as RemoteState);
          if (data.type === "error") fail(String(data.message));
          if (data.type === "ended")
            fail(
              data.removed
                ? "The big screen removed this phone. Enter the code to rejoin."
                : "The room closed. Enter a new code.",
            );
        });
        link.on("close", () =>
          fail("Disconnected. Check your connection and join again."),
        );
        link.on("error", () =>
          fail("Disconnected. Check your connection and join again."),
        );
      });
      self.on("error", (err) =>
        fail(
          err.type === "peer-unavailable"
            ? "Room not found. Check the six-digit code and try again."
            : "Couldn’t connect. Check your Wi-Fi and try again.",
        ),
      );
    });
  }, []);
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
    const ping = setInterval(() => send("ping"), 5000);
    const bye = () => send("leave");
    window.addEventListener("pagehide", bye);
    return () => {
      clearInterval(ping);
      window.removeEventListener("pagehide", bye);
    };
  }, [connected]);
  const reportMotion = useCallback((ready: boolean) => {
    setMotionReady(ready);
    if (conn.current?.open) conn.current.send({ type: "motion-ready", ready });
  }, []);
  const send = (action: string, value = 0) => {
    if (motionReady && state.ready && conn.current?.open)
      conn.current.send({ type: "control", action, value });
  };
  const disconnect = () => {
    close();
    setConnected(false);
    setMotionReady(false);
    setNamed(false);
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
        <a className="brand" href="/" aria-label="Mobile Console home">
          Mobile Console
        </a>
        {connected && (
          <>
            <button
              className="room-pill"
              aria-label={`Leave room ${code}`}
              onClick={disconnect}
            >
              {code}
            </button>
            <span className="controller-connected">
              <Check size={14} aria-hidden="true" />
              <span className="connected-label">Connected</span>
            </span>
          </>
        )}
      </header>
      <main>
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
                className="room-code-input"
                inputMode="numeric"
                pattern="[0-9]{6}"
                autoComplete="off"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
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
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <a href="/" className="text-button">
              <ChevronLeft size={17} /> Back
            </a>
          </div>
        ) : !named ? (
          <div className="join-room name-step">
            <h1>What’s your name?</h1>
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
          <div className="controller-wait">
            <h1>You’re connected.</h1>
            <p>
              {motionReady
                ? "Pick a game on the big screen."
                : "Enable motion to continue."}
            </p>
          </div>
        ) : (
          <div className="active-controller">
            <h1>{games[state.game].title}</h1>
            {(!state.handoff || !state.ready) && (
              <p className="controller-status" aria-live="polite">
                {waiting
                  ? `${state.active}’s turn. Watch the big screen.`
                  : state.label || "Ready when you are."}
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
            ready={state.ready && motionReady}
            label={state.label}
            onControl={(event) => send(event.action, event.value)}
            onReadyChange={reportMotion}
            suspended={
              state.label === "Paused on the big screen" && motionReady
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
    </div>
  );
}
