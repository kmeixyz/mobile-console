import { useCallback, useEffect, useRef, useState } from "react";
import type { GameID } from "./store";
import type { RemoteAction } from "./room";
import {
  FULL_DRAW_MS,
  createSmoother,
  orientationQuaternion,
  pointFromOrientation,
  tiltFromOrientation,
} from "./motion-math.mjs";

type SensorPermission = { requestPermission?: () => Promise<PermissionState> };
type Point = { x: number; y: number };
type Quaternion = [number, number, number, number];
// About 60 updates a second, matching the phone's sensor rate.
const SEND_EVERY = 16;
// Games played by pointing the phone at the screen.
const pointGames: GameID[] = ["target", "fruit", "hockey", "maze", "moles", "rally", "basket", "flashlight", "kart", "sumo", "tanks", "paint"];
// Games with hold gestures: draw a bow, or drag the maze runner.
export const holdGames: GameID[] = ["maze", "target"];
// Set once motion is allowed in this tab, so a reload can turn it back on.
const ALLOWED_KEY = "mobile-console-motion";
const remembered = () => {
  try {
    return sessionStorage.getItem(ALLOWED_KEY) === "1";
  } catch {
    return false;
  }
};
const screenAngle = () =>
  screen.orientation?.angle ??
  (window as unknown as { orientation?: number }).orientation ??
  0;
export function useMotionInput({
  game,
  ready,
  onControl,
  suspended = false,
  playing = true,
}: {
  game: GameID;
  ready: boolean;
  onControl: (event: RemoteAction) => void;
  suspended?: boolean;
  /** This phone is in a game and it's this player's turn. */
  playing?: boolean;
}) {
  const [sensorRun, setSensorRun] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  // Sensor data stopped for a moment. Unlike an error, the phone stays ready:
  // the game keeps its place and tracking picks up when data flows again.
  const [stalled, setStalled] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [holding, setHolding] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const point = useRef<Point>({ x: 0, y: 0 });
  // Every game and turn waits for the player to tap Ready, which centers on
  // the pose the phone is held in. Nothing is sent until then.
  const [centering, setCentering] = useState(false);
  const awaitingCenter = useRef(false);
  const granted = useRef(false);
  const requestID = useRef(0);
  const baseline = useRef<Quaternion | null>(null);
  const latest = useRef<Quaternion | null>(null);
  const hasHeading = useRef(false);
  const lastSample = useRef(0);
  const lastScreenAngle = useRef(screenAngle());
  const lastSent = useRef(0);
  const sent = useRef<Point>({ x: 0, y: 0 });
  const filtered = useRef<Point>({ x: 0, y: 0 });
  const smoothX = useRef(createSmoother());
  const smoothY = useRef(createSmoother());
  const pressed = useRef(false);
  const drawTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const received = useRef(false);
  const active = useRef({ game, ready, onControl, suspended, enabled, playing });
  active.current = { game, ready, onControl, suspended, enabled, playing };

  const cancelHold = useCallback(() => {
    const wasPressed = pressed.current;
    pressed.current = false;
    setHolding(false);
    setDrawn(false);
    if (drawTimer.current) clearTimeout(drawTimer.current);
    // Lifting the finger without firing eases the bow back down, or drops
    // the maze runner.
    const s = active.current;
    if (wasPressed && holdGames.includes(s.game) && s.ready)
      s.onControl({ action: "draw", value: 0 });
  }, []);
  /** Quietly: retrying after a reload, with no tap; failing just shows the button. */
  const enable = async (quietly = false) => {
    const fail = (message: string) => {
      if (!quietly) setError(message);
    };
    setError("");
    setStalled(false);
    const mobile =
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!mobile) {
      fail(
        "Use a phone or tablet.",
      );
      return;
    }
    if (!window.isSecureContext) {
      fail(
        "Motion needs an HTTPS link.",
      );
      return;
    }
    if (
      !("DeviceOrientationEvent" in window) &&
      !("DeviceMotionEvent" in window)
    ) {
      fail(
        "No motion sensors. Try Safari or Chrome.",
      );
      return;
    }
    const id = ++requestID.current;
    setRequesting(true);
    try {
      if (!granted.current) {
        // Both requests start within the same user gesture, before awaiting either.
        const constructors = [
          window.DeviceOrientationEvent,
          window.DeviceMotionEvent,
        ].filter(Boolean);
        const permissions = constructors.map((sensor) => {
          const request = (sensor as unknown as SensorPermission)
            .requestPermission;
          return request ? request.call(sensor) : Promise.resolve("granted");
        });
        const answers = await Promise.all(permissions);
        if (answers.some((answer) => answer !== "granted"))
          throw new Error("denied");
        granted.current = true;
        try {
          sessionStorage.setItem(ALLOWED_KEY, "1");
        } catch {
          // Only skips the Enable tap after a reload.
        }
      }
      if (requestID.current !== id) return;
      baseline.current = null;
      latest.current = null;
      filtered.current = { x: 0, y: 0 };
      received.current = false;
      point.current = { x: 0, y: 0 };
      setTracking(false);
      setEnabled(true);
      setSensorRun((run) => run + 1);
    } catch {
      if (requestID.current === id) {
        // Without a tap, Safari may refuse even an allowed page: not an error.
        fail(
          "Motion is off. Allow it in browser settings.",
        );
        setEnabled(false);
      }
    } finally {
      if (requestID.current === id) setRequesting(false);
    }
  };
  // Sends where the phone points: left/right, and up/down where the game uses
  // it. Air hockey's mallet and the table tennis paddle follow both.
  const sendAim = (p: Point) => {
    const s = active.current;
    if (!s.ready || !s.playing || s.suspended || !pointGames.includes(s.game)) return;
    s.onControl({ action: "aim", value: p.x });
    s.onControl({ action: "move", value: p.y });
  };
  const recenter = useCallback(() => {
    if (!latest.current) return;
    baseline.current = latest.current;
    awaitingCenter.current = false;
    setCentering(false);
    smoothX.current.reset();
    smoothY.current.reset();
    filtered.current = { x: 0, y: 0 };
    sent.current = { x: 0, y: 0 };
    lastSent.current = 0;
    point.current = { x: 0, y: 0 };
    cancelHold();
    if (received.current) setError("");
    sendAim({ x: 0, y: 0 });
  }, [cancelHold]);
  // Each new game or turn, and any break in tracking, asks the player to
  // center again before the action button comes back.
  const requireCenter = useCallback(() => {
    cancelHold();
    awaitingCenter.current = true;
    setCentering(true);
  }, [cancelHold]);
  const beginHold = useCallback(() => {
    const s = active.current;
    if (
      !s.enabled ||
      !s.ready ||
      !s.playing ||
      pressed.current ||
      s.suspended ||
      !received.current ||
      awaitingCenter.current ||
      !holdGames.includes(s.game)
    )
      return;
    sendAim(filtered.current);
    pressed.current = true;
    setHolding(true);
    // Continuous actions and charged putts begin with the same hold signal.
    if (s.game !== "target") s.onControl({ action: "draw", value: 1 });
    if (s.game === "target") {
      s.onControl({ action: "draw", value: 1 });
      // A short buzz when the bow reaches full draw.
      drawTimer.current = setTimeout(() => {
        if (!pressed.current) return;
        setDrawn(true);
        navigator.vibrate?.(30);
      }, FULL_DRAW_MS);
    }
  }, []);
  // Shot games end the hold with one shoot event; continuous actions release it.
  const releaseHold = useCallback(() => {
    const wasHeld = pressed.current;
    pressed.current = false;
    cancelHold();
    const s = active.current;
    if (wasHeld && s.game !== "target" && holdGames.includes(s.game) && s.ready)
      s.onControl({ action: "draw", value: 0 });
    if (!wasHeld || !s.enabled || !s.ready || !s.playing || s.suspended) return;
    // Commit the latest aim before the shot on the ordered data channel.
    sendAim(filtered.current);
    if (s.game === "target") {
      s.onControl({ action: "shoot", value: 0 });
      navigator.vibrate?.(40);
    }
  }, [cancelHold]);

  const tap = () => {
    const s = active.current;
    if (!s.enabled || !s.ready || !s.playing || s.suspended ||
        !received.current || awaitingCenter.current) return;
    sendAim(filtered.current);
    s.onControl({ action: "throw", value: 0 });
  };

  useEffect(() => {
    if (playing) requireCenter();
    else recenter();
  }, [game, playing, requireCenter, recenter]);
  useEffect(() => {
    if (!ready || suspended) cancelHold();
  }, [ready, suspended, cancelHold]);
  useEffect(() => {
    if (!enabled || suspended) return;
    received.current = false;
    setTracking(false);
    // Turning motion on mid-game, or coming back from a pause, centers afresh.
    if (active.current.playing) requireCenter();
    let noDataTimer: ReturnType<typeof setTimeout>;
    const orientation = (e: DeviceOrientationEvent) => {
      if (
        document.hidden ||
        !active.current.enabled ||
        active.current.suspended ||
        !Number.isFinite(e.beta) ||
        !Number.isFinite(e.gamma)
      )
        return;
      const now = performance.now();
      const angle = screenAngle();
      const heading = Number.isFinite(e.alpha);
      if (received.current && (angle !== lastScreenAngle.current ||
          heading !== hasHeading.current || now - lastSample.current > 1000)) {
        requireCenter();
      }
      lastSample.current = now;
      lastScreenAngle.current = angle;
      hasHeading.current = heading;
      const q = orientationQuaternion(
        hasHeading.current ? (e.alpha as number) : 0,
        e.beta as number,
        e.gamma as number,
        angle,
      ) as Quaternion;
      latest.current = q;
      if (!received.current) {
        received.current = true;
        setTracking(true);
        setError("");
        setStalled(false);
        clearTimeout(noDataTimer);
      }
      if (awaitingCenter.current) return;
      if (!baseline.current) {
        baseline.current = q;
        smoothX.current.reset();
        smoothY.current.reset();
      }
      const s = active.current;
      let raw = pointFromOrientation(q, baseline.current);
      // Without a heading (rare), tipping the phone still moves left/right.
      if (!hasHeading.current)
        raw = { ...raw, x: tiltFromOrientation(q, baseline.current).x };
      filtered.current = {
        x: smoothX.current.next(raw.x, now),
        y: smoothY.current.next(raw.y, now),
      };
      if (now - lastSent.current < SEND_EVERY) return;
      const p = filtered.current;
      // Skip near-identical updates, but refresh a few times a second.
      if (
        Math.abs(p.x - sent.current.x) < 0.003 &&
        Math.abs(p.y - sent.current.y) < 0.003 &&
        now - lastSent.current < 250
      )
        return;
      lastSent.current = now;
      sent.current = { ...p };
      point.current = { ...p };
      sendAim(p);
    };
    const onHide = () => {
      if (document.hidden) cancelHold();
      else if (active.current.playing) requireCenter();
    };
    const onRotate = () => {
      latest.current = null;
      baseline.current = null;
      requireCenter();
    };
    window.addEventListener("deviceorientation", orientation);
    window.addEventListener("blur", cancelHold);
    window.addEventListener("orientationchange", onRotate);
    screen.orientation?.addEventListener?.("change", onRotate);
    document.addEventListener("visibilitychange", onHide);
    noDataTimer = setTimeout(() => {
      if (!received.current)
        setError(
          "No motion yet. Move your phone gently.",
        );
    }, 4500);
    const staleDataTimer = setInterval(() => {
      if (!received.current || document.hidden || performance.now() - lastSample.current < 1500) return;
      received.current = false;
      setTracking(false);
      requireCenter();
      setStalled(true);
    }, 500);
    return () => {
      clearInterval(staleDataTimer);
      clearTimeout(noDataTimer);
      window.removeEventListener("deviceorientation", orientation);
      window.removeEventListener("blur", cancelHold);
      window.removeEventListener("orientationchange", onRotate);
      screen.orientation?.removeEventListener?.("change", onRotate);
      document.removeEventListener("visibilitychange", onHide);
      pressed.current = false;
    };
  }, [enabled, suspended, cancelHold, requireCenter, sensorRun]);
  // Allowed earlier in this tab (before a reload): turn motion back on where
  // the browser lets it happen without a tap.
  useEffect(() => {
    if (remembered()) void enable(true);
  }, []);
  useEffect(
    () => () => {
      requestID.current++;
      pressed.current = false;
      if (drawTimer.current) clearTimeout(drawTimer.current);
    },
    [],
  );
  return {
    enabled,
    requesting,
    error,
    stalled,
    tracking,
    holding,
    drawn,
    centering,
    point,
    enable: () => enable(),
    recenter,
    tap,
    beginHold,
    releaseHold,
    cancelHold,
  };
}
