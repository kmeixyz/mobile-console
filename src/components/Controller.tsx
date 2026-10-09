import { hasLiveLink, controlSender } from "../lib/connection-health.mjs";
import { useWakeLock } from "../lib/useWakeLock";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronLeft, Smartphone } from "lucide-react";
import { games, type GameID } from "../lib/store";
import {
  BLOCKED_MESSAGE,
  connectOptions,
  createPeer,
  onDirectFailure,
  roomPeerId,
} from "../lib/peer";
import type { Link } from "../lib/relay";
import type { Pose } from "../lib/room";
import { useSideways } from "../lib/useSideways";
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
// This tab's place in a room, so a reload (or the browser restoring a tab it
// put to sleep) rejoins as the same player without asking for the name again.
// Per tab: two phones' tabs in one browser must stay two players.
type Seat = { session: string; code?: string; name?: string };
const SEAT_KEY = "mobile-console-seat";
const newSession = () =>
  globalThis.crypto?.randomUUID?.() ??
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
const loadSeat = (): Seat => {
  try {
    const seat = JSON.parse(sessionStorage.getItem(SEAT_KEY) || "null");
    if (typeof seat?.session === "string") return seat;
  } catch {
    // A fresh seat works the same, just without resuming.
  }
  return { session: newSession() };
};
const saveSeat = (seat: Seat) => {
  try {
    sessionStorage.setItem(SEAT_KEY, JSON.stringify(seat));
  } catch {
    // Resuming after a reload is a convenience only.
  }
};
// A lost link keeps retrying this long (while the page is in view) before
// asking the player to tap Join.
const RETRY_FOR = 60000;
// A direct link that hears nothing back for this long has dropped; relayed
// messages can take longer to arrive.
const SILENCE_MS = 9000;
const RELAY_SILENCE_MS = 20000;
// Coming back to the page, the big screen should answer a ping this quickly.
const PROBE_MS = 3000;
const RELAY_PROBE_MS = 7000;
export default function Controller() {
  const [seat] = useState(loadSeat);
  const urlCode = new URLSearchParams(location.search).get("join") || "";
  // The link's code wins; a reloaded /?join= page (code typed in) uses the seat's.
  const [initialCode] = useState(() =>
    /^\d{6}$/.test(urlCode) ? urlCode : seat.code || "",
  );
  const resuming = !!seat.name && seat.code === initialCode;
  const [code, setCode] = useState(initialCode);
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
  const [named, setNamed] = useState(resuming);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // The name this phone already gave the big screen. Rejoining after a drop or
  // a removal skips the name step, so it is sent again on every join.
  const sentName = useRef(resuming ? seat.name! : "");
  const peer = useRef<Peer | null>(null);
  const conn = useRef<Link | null>(null);
  const session = useRef(seat.session);
  const motionStatus = useRef(false);
  const poseStatus = useRef<Pose>("upright");
  const sideways = useSideways();
  const lastHeard = useRef(Date.now());
  // Counts every message from the big screen, so a probe can tell if any came.
  const heard = useRef(0);
  // When the current outage began, for RETRY_FOR.
  const lostAt = useRef(0);
  // A room to retry as soon as the page is back in view or online.
  const retryWhenBack = useRef("");
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
      setError("Enter the 6-digit code.");
      return;
    }
    close();
    retryWhenBack.current = "";
    if (!recovering) {
      retryCount.current = 0;
      lostAt.current = 0;
    }
    setReconnecting(recovering);
    setError("");
    setConnecting(true);
    const attempt = ++attempts.current;
    const current = () => attempts.current === attempt;
    let joined = false;
    const fail = (message: string, retry = recovering) => {
      if (!current()) return;
      close();
      if (retry) {
        lostAt.current ||= Date.now();
        if (Date.now() - lostAt.current < RETRY_FOR) {
          setReconnecting(true);
          // A hidden page's timers barely run, and its network may be asleep:
          // wait to retry until the player is back instead of using up tries.
          if (document.hidden) {
            retryWhenBack.current = roomCode;
            return;
          }
          const delay = Math.min(3000, 500 * 2 ** retryCount.current++);
          retryTimer.current = setTimeout(() => reconnect.current(roomCode, true), delay);
          return;
        }
        // Out of tries for now; coming back to the page tries once more.
        retryWhenBack.current = roomCode;
        message = "Lost the big screen. Tap Join to try again.";
      } else saveSeat({ session: session.current });
      lostAt.current = 0;
      setReconnecting(false);
      setConnected(false);
      setConnecting(false);
      setError(message);
    };
    recover.current = () => fail("Connection lost. Try again.", true);
    // Same handling for a direct link and a relayed one.
    const attach = (link: Link) => {
      conn.current = link;
      link.on("data", (raw) => {
        if (conn.current !== link) return;
        if (!raw || typeof raw !== "object") return;
        lastHeard.current = Date.now();
        heard.current++;
        const data = raw as { type?: string } & Record<string, unknown>;
        if (data.type === "joined") {
          joined = true;
          heartbeatSupported.current = data.heartbeat === true;
          retryCount.current = 0;
          lostAt.current = 0;
          setReconnecting(false);
          if (timeout.current) clearTimeout(timeout.current);
          setError("");
          setConnected(true);
          setConnecting(false);
          setState({ ...(data.state as RemoteState), you: String(data.you || "") });
          if (sentName.current)
            link.send({ type: "name", name: sentName.current });
          saveSeat({ session: session.current, code: roomCode, name: sentName.current || undefined });
          // Keep the code in the address, so reloading rejoins this room.
          if (new URLSearchParams(location.search).get("join") !== roomCode)
            history.replaceState(history.state, "", `/?join=${roomCode}`);
          link.send({ type: "motion-ready", ready: motionStatus.current });
          link.send({ type: "pose", pose: poseStatus.current });
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
        // The big screen is reloading or closing; it keeps the same code, so
        // keep trying until it's back.
        if (data.type === "away") fail("Reconnecting…", true);
        if (data.type === "replaced") {
          // Rejoining from this tab takes a seat of its own.
          session.current = newSession();
          fail("This controller opened in another tab.", false);
        }
        if (data.type === "ended")
          fail(
            data.removed
              ? "Removed. Enter the code to rejoin."
              : "The room closed. Enter a new code.",
            false,
          );
      });
      const lost = () =>
        conn.current === link &&
        fail("Reconnecting…", true);
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
      if (joined) return fail("Reconnecting…", true);
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
              : "Room not found. Check the code.",
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
        fail("Room not found. Check the code.");
      else useRelay();
    });
  }, []);
  reconnect.current = connect;
  useEffect(() => {
    if (/^\d{6}$/.test(initialCode)) connect(initialCode);
    return close;
  }, [connect]);
  // Back in view or back online: retry a lost room right away.
  useEffect(() => {
    const retry = () => {
      if (document.hidden) return;
      const room = retryWhenBack.current;
      if (room) {
        retryWhenBack.current = "";
        retryCount.current = 0;
        lostAt.current = 0;
        reconnect.current(room, true);
      } else if (retryTimer.current) {
        // Waiting out a backoff; the network just came back, so go now.
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
        retryCount.current = 0;
        const room = code;
        if (/^\d{6}$/.test(room)) reconnect.current(room, true);
      }
    };
    document.addEventListener("visibilitychange", retry);
    window.addEventListener("online", retry);
    window.addEventListener("pageshow", retry);
    return () => {
      document.removeEventListener("visibilitychange", retry);
      window.removeEventListener("online", retry);
      window.removeEventListener("pageshow", retry);
    };
  }, [code]);
  // Check in with the big screen, and say goodbye when this page closes.
  useEffect(() => {
    if (!connected) return;
    const send = (type: string) => {
      if (conn.current?.open) conn.current.send({ type });
    };
    // Hidden pages keep checking in where the browser lets them, so the big
    // screen doesn't drop a player who only glanced at another app.
    const check = () => {
      const silence = conn.current?.relayed ? RELAY_SILENCE_MS : SILENCE_MS;
      if (
        !document.hidden &&
        !reconnecting &&
        heartbeatSupported.current &&
        Date.now() - lastHeard.current > silence
      ) {
        recover.current();
        return;
      }
      send("ping");
    };
    // Back from another tab, the lock screen, or a network change, the link
    // may look open but be dead: ask the big screen, and reconnect at once
    // if it doesn't answer.
    let probe: ReturnType<typeof setTimeout> | null = null;
    const resume = () => {
      if (document.hidden || reconnecting) return;
      lastHeard.current = Date.now();
      const asked = heard.current;
      send("ping");
      if (probe) clearTimeout(probe);
      if (!heartbeatSupported.current) return;
      probe = setTimeout(() => {
        probe = null;
        if (!document.hidden && heard.current === asked) recover.current();
      }, conn.current?.relayed ? RELAY_PROBE_MS : PROBE_MS);
    };
    const ping = setInterval(check, 2000);
    const bye = (event: PageTransitionEvent) => { if (!event.persisted) send("leave"); };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("pagehide", bye);
    return () => {
      clearInterval(ping);
      if (probe) clearTimeout(probe);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("pagehide", bye);
    };
  }, [connected, reconnecting]);
  const reportPose = useCallback((pose: Pose) => {
    poseStatus.current = pose;
    if (conn.current?.open) conn.current.send({ type: "pose", pose });
  }, []);
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
    retryWhenBack.current = "";
    lostAt.current = 0;
    saveSeat({ session: session.current });
    // Left on purpose: a reload shouldn't walk back in.
    history.replaceState(history.state, "", "/?join=");
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
        {reconnecting && connected && <p className="controller-status" role="status">Reconnecting…</p>}
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
                placeholder="000000"
                value={code}
                onChange={(e) => {
                  // Digits only, trimmed after removing spaces, so a pasted
                  // "932 849" (as the big screen shows it) keeps all six.
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
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
                saveSeat({ session: session.current, code, name: player });
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
                {state.active ? `${state.active}’s turn.` : "Watching."}
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
                <h2>Great game!</h2>
                <p>Choose what’s next.</p>
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
            sideways={sideways}
            onPoseChange={reportPose}
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
      {connected && sideways && (
        <div className="rotate-prompt" role="alert">
          <Smartphone className="rotate-prompt-phone" size={64} strokeWidth={1.6} aria-hidden="true" />
          <h2>Turn your phone upright</h2>
          <p>
            {state.game && state.yourTurn !== false
              ? "The game is paused until you do."
              : "The controller works held upright."}
          </p>
        </div>
      )}
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
