import { useCallback, useEffect, useRef, useState } from "react";
import type { GameID } from "./store";
import type { RemoteAction } from "./room";
import {
  MIN_HOLD_MS,
  createSmoother,
  orientationQuaternion,
  throwFromMotion,
  tiltFromOrientation,
} from "./motion-math.mjs";

type SensorPermission = { requestPermission?: () => Promise<PermissionState> };
type Point = { x: number; y: number };
type Quaternion = [number, number, number, number];
type SwingSample = { ax: number; ay: number; az: number; gamma: number };
// About 60 updates a second, matching the phone's sensor rate.
const SEND_EVERY = 16;
const screenAngle = () =>
  screen.orientation?.angle ??
  (window as unknown as { orientation?: number }).orientation ??
  0;
export function useMotionInput({
  game,
  ready,
  onControl,
  suspended = false,
}: {
  game: GameID;
  ready: boolean;
  onControl: (event: RemoteAction) => void;
  suspended?: boolean;
}) {
  const [sensorRun, setSensorRun] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const [tracking, setTracking] = useState(false);
  const [holding, setHolding] = useState(false);
  const [point, setPoint] = useState<Point>({ x: 0, y: 0 });
  const [holdHint, setHoldHint] = useState("");
  const granted = useRef(false);
  const requestID = useRef(0);
  const baseline = useRef<Quaternion | null>(null);
  const latest = useRef<Quaternion | null>(null);
  const lastSent = useRef(0);
  const sent = useRef<Point>({ x: 0, y: 0 });
  const filtered = useRef<Point>({ x: 0, y: 0 });
  const smoothX = useRef(createSmoother());
  const smoothY = useRef(createSmoother());
  const pressed = useRef(false);
  const holdStart = useRef(0);
  const swing = useRef<SwingSample[]>([]);
  const received = useRef(false);
  const active = useRef({ game, ready, onControl, suspended, enabled });
  active.current = { game, ready, onControl, suspended, enabled };

  const cancelHold = useCallback(() => {
    pressed.current = false;
    swing.current = [];
    setHolding(false);
  }, []);
  const enable = async () => {
    setError("");
    const mobile =
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!mobile) {
      setError(
        "Motion controllers need a phone or tablet. Scan the code with a mobile device.",
      );
      return;
    }
    if (!window.isSecureContext) {
      setError(
        "Could not enable motion. An HTTPS link is required on your phone.",
      );
      return;
    }
    if (
      !("DeviceOrientationEvent" in window) &&
      !("DeviceMotionEvent" in window)
    ) {
      setError(
        "This browser doesn’t provide motion sensors. Open this link in Safari or Chrome on a phone or tablet.",
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
      }
      if (requestID.current !== id) return;
      baseline.current = null;
      latest.current = null;
      filtered.current = { x: 0, y: 0 };
      received.current = false;
      setPoint({ x: 0, y: 0 });
      setTracking(false);
      setEnabled(true);
      setSensorRun((run) => run + 1);
    } catch {
      if (requestID.current === id) {
        setError(
          "Motion access wasn’t allowed. Allow Motion & Orientation in your browser’s site settings, then try again.",
        );
        setEnabled(false);
      }
    } finally {
      if (requestID.current === id) setRequesting(false);
    }
  };
  const recenter = useCallback(() => {
    baseline.current = latest.current;
    smoothX.current.reset();
    smoothY.current.reset();
    filtered.current = { x: 0, y: 0 };
    setPoint({ x: 0, y: 0 });
    cancelHold();
    if (received.current) setError("");
    const s = active.current;
    // Bowling aims with its own buttons, so tilt never steers it.
    if (s.ready && s.game !== "bowling") {
      s.onControl({ action: s.game === "rally" ? "move" : "aim", value: 0 });
      if (
        s.game === "target" ||
        s.game === "fruit" ||
        s.game === "golf" ||
        s.game === "hoops"
      )
        s.onControl({ action: "move", value: 0 });
    }
  }, [cancelHold]);
  const beginHold = useCallback(() => {
    const s = active.current;
    if (!s.enabled || !s.ready || s.suspended || !received.current) return;
    pressed.current = true;
    holdStart.current = performance.now();
    swing.current = [];
    setHoldHint("");
    setHolding(true);
  }, []);
  // Bowling release, as in Wii Playground: too-short holds don't count;
  // otherwise the recorded swing sets power and wrist twist sets spin.
  const releaseHold = useCallback(() => {
    const wasHeld = pressed.current;
    const held = performance.now() - holdStart.current;
    const samples = swing.current;
    cancelHold();
    const s = active.current;
    if (!wasHeld || !s.enabled || !s.ready || s.suspended || s.game !== "bowling")
      return;
    if (held < MIN_HOLD_MS) {
      setHoldHint("Hold longer and swing!");
      return;
    }
    const { power, spin } = throwFromMotion(samples);
    s.onControl({ action: "spin", value: spin });
    s.onControl({ action: "throw", value: power });
    navigator.vibrate?.(100);
  }, [cancelHold]);

  useEffect(() => {
    recenter();
  }, [game, recenter]);
  useEffect(() => {
    if (!ready || suspended) cancelHold();
  }, [ready, suspended, cancelHold]);
  useEffect(() => {
    if (!enabled || suspended) return;
    received.current = false;
    setTracking(false);
    let noDataTimer: ReturnType<typeof setTimeout>;
    // Tilt like a steering wheel (Wii Playground's kart controls): sideways for
    // left/right, top edge away or toward you for up/down, relative to how the
    // phone was held when centered.
    const orientation = (e: DeviceOrientationEvent) => {
      if (
        document.hidden ||
        !active.current.enabled ||
        active.current.suspended ||
        !Number.isFinite(e.beta) ||
        !Number.isFinite(e.gamma)
      )
        return;
      const q = orientationQuaternion(
        Number.isFinite(e.alpha) ? (e.alpha as number) : 0,
        e.beta as number,
        e.gamma as number,
        screenAngle(),
      ) as Quaternion;
      latest.current = q;
      if (!received.current) {
        received.current = true;
        setTracking(true);
        setError("");
        clearTimeout(noDataTimer);
      }
      if (!baseline.current) {
        baseline.current = q;
        smoothX.current.reset();
        smoothY.current.reset();
      }
      const raw = tiltFromOrientation(q, baseline.current);
      const now = performance.now();
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
      setPoint({ ...p });
      const s = active.current;
      if (!s.ready || s.game === "bowling") return;
      s.onControl({ action: s.game === "rally" ? "move" : "aim", value: p.x });
      if (
        s.game === "target" ||
        s.game === "fruit" ||
        s.game === "golf" ||
        s.game === "hoops"
      )
        s.onControl({ action: "move", value: p.y });
      if (s.game === "fruit" && pressed.current)
        s.onControl({ action: "slice", value: 0 });
    };
    // Records the bowling swing while the button is held.
    const motion = (e: DeviceMotionEvent) => {
      if (document.hidden || active.current.suspended || !pressed.current)
        return;
      const acc = e.accelerationIncludingGravity;
      const rot = e.rotationRate;
      if (!acc) return;
      swing.current.push({
        ax: acc.x ?? 0,
        ay: acc.y ?? 0,
        az: acc.z ?? 0,
        gamma: rot?.gamma ?? 0,
      });
    };
    const onHide = () => {
      if (document.hidden) cancelHold();
    };
    const onRotate = () => {
      baseline.current = null;
      latest.current = null;
      smoothX.current.reset();
      smoothY.current.reset();
      filtered.current = { x: 0, y: 0 };
      cancelHold();
    };
    window.addEventListener("deviceorientation", orientation);
    window.addEventListener("devicemotion", motion);
    window.addEventListener("blur", cancelHold);
    window.addEventListener("orientationchange", onRotate);
    document.addEventListener("visibilitychange", onHide);
    noDataTimer = setTimeout(() => {
      if (!received.current)
        setError(
          "No motion data yet. Check sensor access and move your phone gently. Try Safari or Chrome on a phone or tablet.",
        );
    }, 4500);
    return () => {
      clearTimeout(noDataTimer);
      window.removeEventListener("deviceorientation", orientation);
      window.removeEventListener("devicemotion", motion);
      window.removeEventListener("blur", cancelHold);
      window.removeEventListener("orientationchange", onRotate);
      document.removeEventListener("visibilitychange", onHide);
      pressed.current = false;
    };
  }, [enabled, suspended, cancelHold, sensorRun]);
  useEffect(
    () => () => {
      requestID.current++;
      pressed.current = false;
    },
    [],
  );
  return {
    enabled,
    requesting,
    error,
    tracking,
    holding,
    holdHint,
    point,
    enable,
    recenter,
    beginHold,
    releaseHold,
    cancelHold,
  };
}
