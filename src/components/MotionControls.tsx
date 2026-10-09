import { useEffect, useState } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { useMotionInput } from "../lib/useMotionInput";
import type { GameID } from "../lib/store";
import type { RemoteAction } from "../lib/room";
const instructions: Record<GameID, string> = {
  golf: "Aimed at the cup. Tilt left or right to adjust; tilt the top away for more power. Tap Putt.",
  hoops: "Tilt left or right to aim; tilt the top away for more power. Tap Shoot.",
  bowling: "Line up with Move and Aim. Hold, swing, and let go. Twist your wrist as you let go to curve the ball.",
  rally: "Tilt left and right like a steering wheel to move your paddle.",
  target: "Tilt to aim: sideways for left and right, top away or toward you for up and down. Tap Release arrow.",
  fruit: "Tilt to move. Hold the button and tilt quickly to slice.",
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
}: {
  game: GameID | null;
  ready: boolean;
  label: string;
  onControl: (event: RemoteAction) => void;
  onReadyChange?: (enabled: boolean) => void;
  suspended?: boolean;
  remote?: boolean;
  handoff?: boolean;
}) {
  // Bowling line from the Move/Aim buttons, reset after every throw.
  const [line, setLine] = useState({ position: 0, angle: 0 });
  const [padMode, setPadMode] = useState<"position" | "angle">("position");
  const control = (event: RemoteAction) => {
    if (event.action === "throw") setLine({ position: 0, angle: 0 });
    onControl(event);
  };
  const nudge = (delta: number) => {
    const value = Math.max(-1, Math.min(1, line[padMode] + delta));
    setLine((old) => ({ ...old, [padMode]: value }));
    onControl({ action: padMode, value });
  };
  const input = useMotionInput({
    game: game || "bowling",
    ready: !!game && ready && !handoff,
    onControl: control,
    suspended,
  });
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
  const nextRoll =
    game === "bowling" &&
    ["Next roll", "Next player", "See results"].includes(label);
  const fruitPlaying =
    game === "fruit" &&
    ready &&
    label !== "Ready to slice" &&
    label !== "Paused";
  const gesture = (game === "bowling" && !nextRoll) || fruitPlaying;
  const startPauseLabel =
    game === "rally"
      ? label === "Keep the ball in play"
        ? "Pause match"
        : "Play match"
      : label === "Paused"
        ? "Keep slicing"
        : label === "Ready to slice"
          ? "Start slicing"
          : "Pause slicing";
  const buttonLabel =
    game === "golf" || game === "hoops"
      ? label
      : game === "target"
        ? "Release arrow"
        : nextRoll
          ? label
          : game === "bowling"
            ? input.holding
              ? "Swing, then let go"
              : "Hold and swing to bowl"
            : fruitPlaying
              ? input.holding
                ? "Keep holding. Sweep to slice."
                : "Hold to slice"
              : startPauseLabel;
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
            className="primary-button"
            onClick={input.enable}
            disabled={input.requesting}
          >
            {input.requesting
              ? "Allowing motion…"
              : input.error
                ? "Try motion again"
                : "Enable motion"}
          </button>
        </div>
      )}
      {!input.enabled && !input.error && (
        <p className="input-permission-note">
          Tap Enable motion, then allow access.
        </p>
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
          <div className="motion-guidance">
            <p>{instructions[game]}</p>
          </div>
          <div className="calibration-row">
            <span role="status">
              {suspended
                ? "Motion paused"
                : input.tracking
                  ? ""
                  : "Hold still to center…"}
            </span>
            <button
              className="text-button"
              onClick={input.recenter}
              disabled={!input.tracking}
            >
              <RotateCcw size={15} />
              Recenter
            </button>
          </div>
          {game === "bowling" && !nextRoll && (
            <div className="bowl-pad">
              <div className="mode-switch" role="group" aria-label="Adjust">
                <button
                  type="button"
                  className={padMode === "position" ? "selected" : ""}
                  aria-pressed={padMode === "position"}
                  onClick={() => setPadMode("position")}
                >
                  Move
                </button>
                <button
                  type="button"
                  className={padMode === "angle" ? "selected" : ""}
                  aria-pressed={padMode === "angle"}
                  onClick={() => setPadMode("angle")}
                >
                  Aim
                </button>
              </div>
              <div className="bowl-pad-row">
                <button
                  type="button"
                  className="bowl-nudge"
                  aria-label={padMode === "position" ? "Move left" : "Aim left"}
                  disabled={!ready || input.holding}
                  onClick={() => nudge(-0.2)}
                >
                  ◀
                </button>
                <div className="bowl-tracks">
                  {(["position", "angle"] as const).map((key) => (
                    <div
                      key={key}
                      className={`bowl-track ${padMode === key ? "active" : ""}`}
                      aria-label={`${key === "position" ? "Start" : "Angle"} ${Math.round(line[key] * 100)}%`}
                    >
                      <span style={{ left: `${((line[key] + 1) / 2) * 90 + 5}%` }} />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="bowl-nudge"
                  aria-label={padMode === "position" ? "Move right" : "Aim right"}
                  disabled={!ready || input.holding}
                  onClick={() => nudge(0.2)}
                >
                  ▶
                </button>
              </div>
            </div>
          )}
          <button
            className={`primary-button motion-action ${input.holding ? "holding" : ""}`}
            disabled={!ready || suspended || !input.tracking}
            aria-pressed={gesture ? input.holding : undefined}
            onPointerDown={(e) => {
              if (!gesture) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              input.beginHold();
            }}
            onPointerUp={() => {
              if (gesture) input.releaseHold();
            }}
            onPointerCancel={input.cancelHold}
            onKeyDown={(e) => {
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
              if (!gesture)
                onControl({
                  action: game === "target" ? "shoot" : "throw",
                  value: 0,
                });
            }}
          >
            <span>{buttonLabel}</span>
            {!gesture && <ArrowRight size={18} />}
          </button>
          {input.holdHint && game === "bowling" && (
            <p className="motion-hint" role="status">
              {input.holdHint}
            </p>
          )}
          {fruitPlaying && (
            <button
              className="text-button motion-pause"
              disabled={suspended || !ready}
              onClick={() => onControl({ action: "throw", value: 0 })}
            >
              Pause slicing
            </button>
          )}
        </div>
      )}
    </section>
  );
}
