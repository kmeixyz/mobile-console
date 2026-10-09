import { useEffect, useRef, useState } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { useMotionInput } from "../lib/useMotionInput";
import { isArcadeGame, type GameID } from "../lib/store";
import type { Pose, RemoteAction } from "../lib/room";
import { controlHints as phoneHints } from "./GameInstruction";
import "./game-instruction.css";
const actionNames: Record<GameID, string> = {
  basket: "HOP", flashlight: "SNAP", kart: "USE", sumo: "DASH", tanks: "FIRE", paint: "SPLAT",
  moles: "WHACK",
  hockey: "PLAY",
  maze: "DRAG",
  target: "SHOOT",
  rally: "PLAY",
  fruit: "SLICE",
};
export default function MotionControls({
  game,
  ready,
  label,
  onControl,
  onReadyChange,
  suspended = false,
  remote = true,
  handoff = false,
  sideways = false,
  onPoseChange,
}: {
  game: GameID | null;
  ready: boolean;
  label: string;
  onControl: (event: RemoteAction) => void;
  onReadyChange?: (enabled: boolean) => void;
  suspended?: boolean;
  remote?: boolean;
  handoff?: boolean;
  /** The phone is turned sideways; aiming stops until it's upright. */
  sideways?: boolean;
  onPoseChange?: (pose: Pose) => void;
}) {
  // A shot or tap was sent and the big screen hasn't answered yet. The button
  // grays out right away instead of looking pressable through the round trip.
  const [sent, setSent] = useState(false);
  useEffect(() => {
    setSent(false);
  }, [label, ready]);
  useEffect(() => {
    if (!sent) return;
    // In case the big screen ignores the action and nothing changes.
    const unlock = setTimeout(() => setSent(false), 1500);
    return () => clearTimeout(unlock);
  }, [sent]);
  const control = (event: RemoteAction) => {
    if (game !== "moles" && !(game && isArcadeGame(game)) && (event.action === "throw" || event.action === "shoot")) setSent(true);
    onControl(event);
  };
  const input = useMotionInput({
    game: game || "moles",
    ready: !!game && ready && !handoff,
    onControl: control,
    suspended: suspended || sideways,
    playing: !!game && !handoff,
  });
  // Sensor samples move one element; they don't rerender the entire controller.
  const aimPreview = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!input.enabled || !game) return;
    let frame = 0;
    let previousX = NaN, previousY = NaN;
    const draw = () => {
      const p = input.point.current;
      if (aimPreview.current && (p.x !== previousX || p.y !== previousY)) {
        aimPreview.current.style.left = `${50 + p.x * 43}%`;
        aimPreview.current.style.top = `${50 + p.y * 35}%`;
        previousX = p.x; previousY = p.y;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [input.enabled, game, input.point]);
  const [calibrated, setCalibrated] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    if (input.tracking) setCalibrated(true);
    if (!input.enabled) setCalibrated(false);
  }, [input.tracking, input.enabled]);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    onReadyChange?.(input.enabled && calibrated && visible && !input.error);
  }, [input.enabled, input.error, calibrated, visible, onReadyChange]);
  // Turned sideways or put away mid-game, the phone counts as recentering
  // until Ready is tapped again, so the game doesn't run on without its aim.
  const [recovery, setRecovery] = useState<"none" | "waiting" | "centering">("none");
  const playing = !!game && !handoff;
  useEffect(() => {
    if (!playing) setRecovery("none");
    else if (sideways || !visible) setRecovery("waiting");
    else if (input.centering) setRecovery((r) => (r === "waiting" ? "centering" : r));
    else setRecovery((r) => (r === "centering" ? "none" : r));
  }, [playing, sideways, visible, input.centering]);
  const pose: Pose = sideways
    ? "sideways"
    : recovery !== "none" && input.enabled
      ? "recentering"
      : "upright";
  useEffect(() => {
    onPoseChange?.(pose);
  }, [pose, onPoseChange]);
  // The button is held through a motion while a shot is lined up; between
  // shots it's a plain tap ("Next shot", "Pause").
  const gesture =
    (game === "maze" && label === "Drag") ||
    (game === "target" && label.startsWith("Arrow"));
  const startPauseLabel =
    game === "rally"
      ? label === "Keep the ball in play"
        ? "Pause match"
        : "Play match"
      : game === "hockey"
        ? label === "Game on"
          ? "Pause match"
          : "Play match"
      : label === "Paused"
        ? "Keep slicing"
        : label === "Ready to slice"
          ? "Start slicing"
          : "Pause";
  const holdLabel: Partial<Record<GameID, [string, string]>> = {
    maze: ["Hold to drag", "Drag the runner, then let go"],
    target: ["Hold to aim", "Release to shoot"],
  };
  const buttonLabel =
    gesture && game
      ? holdLabel[game]![input.holding ? 1 : 0]
      : game === "moles"
        ? label === "Ready to whack" ? "Start round" : label === "Paused" ? "Resume round" : "Whack"
      : game && (game === "maze" || isArcadeGame(game))
        ? label
        : startPauseLabel;
  // The big screen is paused for another player's phone (room.ts).
  const otherPaused = !suspended && label.startsWith("Waiting for ");
  // While the big screen has a menu open, say so rather than offering an
  // action the disabled button can't take.
  const actionLabel = game
    ? suspended || otherPaused
      ? "PAUSED"
      : gesture
      ? game === "target" ? input.holding ? "RELEASE" : "HOLD" : actionNames[game]
      // Starting and resuming say the same words the big screen asks for.
      : buttonLabel.toUpperCase()
    : buttonLabel;
  // Each game and turn starts by centering: the Ready button stands in for the
  // action button until it's tapped, then becomes Recenter.
  const needsStart = !!game && input.centering;
  const startHint = game === "kart" ? "POINT AT YOUR ROAD" : "POINT AT SCREEN";
  const actionDisabled = !ready || sent || suspended || !input.tracking;
  // Between shots (a ball rolling, an arrow in flight) the grayed-out button
  // asks for a moment instead of showing an action it can’t take.
  const waiting = !suspended && !otherPaused && (!ready || (sent && gesture));
  // Tapping Ready hands focus to the action button that replaces it, once
  // that button can take it.
  const actionButton = useRef<HTMLButtonElement>(null);
  // The big screen can end a hold mid-press (the maze runner reaches the
  // flag). Let go of it then, and don't count lifting that finger as a tap
  // on whatever the button has become.
  const pressedAsGesture = useRef(false);
  useEffect(() => {
    if (!gesture && input.holding) input.cancelHold();
  }, [gesture, input.holding, input.cancelHold]);
  const focusAction = useRef(false);
  useEffect(() => {
    if (needsStart || actionDisabled || !focusAction.current) return;
    focusAction.current = false;
    actionButton.current?.focus();
  }, [needsStart, actionDisabled]);
  if (handoff && input.enabled && calibrated) return null;
  // Once motion is on in the lobby, the page heading says what to do next.
  if (!game && input.enabled && calibrated && !input.error) return null;
  return (
    <section
      className={`motion-input ${input.enabled ? "motion-enabled" : ""} ${remote ? "remote-motion" : ""}`}
      aria-label="Control method"
    >
      {(!input.enabled || input.error) && (
        <div className="input-choice-row">
          <button
            className="primary-button motion-enable"
            onClick={input.enable}
            disabled={input.requesting}
          >
            {input.requesting
              ? "Allowing motion…"
              : input.error
                ? <span>Try motion<br />again</span>
                : <span>Enable<br />motion</span>}
          </button>
        </div>
      )}
      {!game && input.enabled && !calibrated && (
        <p role="status">Move your phone gently…</p>
      )}
      {input.error && (
        <p className="motion-error" role="status">
          {input.error}
        </p>
      )}
      {input.enabled && game && (
        <div className="motion-body">
          {(
            <div className={`phone-aim-preview ${needsStart ? "is-centering" : ""}`} aria-hidden="true">
              <span className="aim-center" />
              <span ref={aimPreview} className="aim-position" style={{ left: "50%", top: "50%" }} />
            </div>
          )}
          <div className="calibration-row">
            {!needsStart && (
              <button
                className="text-button recenter-button"
                onClick={input.recenter}
                disabled={!input.tracking || suspended}
              >
                <RotateCcw size={18} />
                Recenter
              </button>
            )}
            <span role="status">
              {suspended
                ? ""
                : otherPaused
                  ? `${label}…`
                : input.stalled
                  ? "Motion paused. Move your phone gently."
                  : !input.tracking
                    ? "Move your phone gently…"
                    : ""}
            </span>
          </div>
          {needsStart ? (
            <button
              key="start"
              className="primary-button motion-action motion-start"
              disabled={suspended || !input.tracking}
              aria-label={suspended ? "Paused on the big screen" : "Ready"}
              onClick={() => {
                focusAction.current = true;
                input.recenter();
              }}
            >
              <span className="motion-action-label">
                {suspended ? "PAUSED" : "READY"}
              </span>
              {!suspended && (
                <small className="motion-action-hint">{startHint}</small>
              )}
            </button>
          ) : (
            <button
              key="action"
              ref={actionButton}
              className={`primary-button motion-action ${input.holding ? "holding" : ""} ${waiting ? "waiting" : ""}`}
              disabled={actionDisabled}
              aria-label={
                suspended
                  ? "Paused on the big screen"
                  : otherPaused
                    ? `Paused. ${label}.`
                  : waiting
                    ? "One moment"
                    : buttonLabel
              }
              aria-pressed={gesture ? input.holding : undefined}
              onPointerDown={(e) => {
                pressedAsGesture.current = gesture;
                if (!gesture) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                input.beginHold();
              }}
              onPointerUp={() => {
                if (gesture) input.releaseHold();
              }}
              onPointerCancel={input.cancelHold}
              onLostPointerCapture={input.cancelHold}
              onKeyDown={(e) => {
                if (!e.repeat && (e.key === " " || e.key === "Enter"))
                  pressedAsGesture.current = gesture;
                if (gesture && (e.key === " " || e.key === "Enter")) {
                  e.preventDefault();
                  if (!e.repeat) input.beginHold();
                }
              }}
              onKeyUp={(e) => {
                if (gesture && (e.key === " " || e.key === "Enter")) {
                  e.preventDefault();
                  input.releaseHold();
                }
              }}
              onClick={() => {
                const held = pressedAsGesture.current;
                pressedAsGesture.current = false;
                if (!gesture && !held) {
                  if (game === "moles" || (game && isArcadeGame(game))) input.tap();
                  else {
                    setSent(true);
                    onControl({ action: "throw", value: 0 });
                  }
                }
              }}
            >
              <span className="motion-action-label">
                {waiting ? "ONE MOMENT" : actionLabel}
              </span>
              {!waiting && /^(Next|See results|Finish turn)/.test(buttonLabel) && (
                <ArrowRight size={18} />
              )}
            </button>
          )}
          {!needsStart && !suspended && <p className="motion-game-hint">{phoneHints[game]}</p>}
        </div>
      )}
    </section>
  );
}
