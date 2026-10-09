import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { chime, type Settings } from "../lib/store";
import type { useRoom } from "../lib/room";
import {
  baskets,
  golfPoints,
  holes,
  PUTT_ANGLE,
  putt,
  shootBasket,
} from "../lib/sports.mjs";
import TurnHandoff from "../components/TurnHandoff";
import { resultTitle } from "../components/ResultPanel";
type Point = { x: number; y: number };
type Phase = "ready" | "moving" | "feedback" | "handoff" | "finished";
export default function ActionSports({
  game,
  roster,
  settings,
  room,
  suspended,
  onComplete,
  onExit,
}: {
  game: "golf" | "hoops";
  roster: string[];
  settings: Settings;
  room: ReturnType<typeof useRoom>;
  suspended: boolean;
  onComplete: (score: number, name: string) => void;
  onExit: () => void;
}) {
  const golf = game === "golf";
  const [phase, setPhase] = useState<Phase>("ready");
  const phaseRef = useRef<Phase>("ready");
  const changePhase = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const [turn, setTurn] = useState(0);
  const [round, setRound] = useState(0);
  const [strokes, setStrokes] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [aim, setAim] = useState(0);
  const [power, setPower] = useState(0.6);
  const [ball, setBall] = useState<Point>({ x: 50, y: 82 });
  const [flight, setFlight] = useState<{
    start: Point;
    end: Point;
    made: boolean;
    points: number;
  } | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState(
    golf ? "Line up your first putt." : "Line up your first shot.",
  );
  const hole = holes[round % holes.length];
  const basket = baskets[round % baskets.length];
  const maxRounds = golf ? 3 : 5;
  const preview = golf
    ? putt(ball, aim, power, hole).end
    : { x: 50 + aim * 40, y: 26 + (basket.power - power) * 55 };
  const sunk = Boolean(flight?.made);
  const holeDone = sunk || strokes >= 4;
  const roundDone = !golf || holeDone;
  const last = roundDone && round === maxRounds - 1;
  const actionLabel =
    phase === "feedback"
      ? last
        ? "Finish turn"
        : golf
          ? holeDone
            ? "Next hole"
            : "Next putt"
          : "Next shot"
      : golf
        ? "Putt"
        : "Shoot";
  const act = () => {
    if (suspended) return;
    if (phaseRef.current === "feedback") {
      changePhase("ready");
      if (last) {
        onComplete(score, roster[turn]);
        setScores((old) => [...old, score]);
        changePhase(turn === roster.length - 1 ? "finished" : "handoff");
      } else {
        if (roundDone) {
          setRound((r) => r + 1);
          setBall({ x: 50, y: 82 });
          setAim(0);
          setPower(0.6);
          setStrokes(0);
        }
        setFlight(null);
        setProgress(0);
        setMessage(
          golf
            ? "Follow the dotted line toward the cup."
            : "New position. Line up your next shot.",
        );
      }
      return;
    }
    if (phaseRef.current !== "ready") return;
    changePhase("moving");
    setProgress(0);
    if (golf) {
      const shot = putt(ball, aim, power, hole);
      setStrokes((s) => s + 1);
      setFlight({
        start: ball,
        end: shot.end,
        made: shot.sunk,
        points: golfPoints(strokes + 1, shot.sunk),
      });
    } else {
      const shot = shootBasket(aim, power, basket);
      setFlight({
        start: { x: 50 + aim * 40, y: 82 },
        end: { x: shot.x, y: 26 + (basket.power - power) * 55 },
        made: shot.made,
        points: shot.points,
      });
    }
  };
  const acceptTurn = () => {
    if (suspended || phaseRef.current !== "handoff") return;
    setTurn((t) => t + 1);
    reset();
  };
  const latest = useRef({ act, acceptTurn, suspended, settings });
  latest.current = { act, acceptTurn, suspended, settings };
  useEffect(() => {
    if (phase !== "moving" || !flight) return;
    let raf = 0,
      elapsed = 0,
      previous = 0;
    const duration = settings.motion ? 150 : golf ? 900 : 750;
    const tick = (now: number) => {
      if (previous && !latest.current.suspended && !document.hidden)
        elapsed += Math.min(now - previous, 64);
      previous = now;
      const t = Math.min(elapsed / duration, 1);
      setProgress(t);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (golf) setBall(flight.end);
      setScore((old) => old + flight.points);
      setMessage(
        golf
          ? flight.made
            ? `${strokes === 1 ? "Hole in one!" : "In the cup!"} ${flight.points} points.`
            : strokes >= 4
              ? "Four strokes. On to a fresh hole."
              : "A little closer. Aim from your new position."
          : flight.made
            ? "Swish! Two points."
            : "Just missed. A fresh shot is up next.",
      );
      chime(latest.current.settings.sound, flight.made);
      changePhase("feedback");
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, flight, golf, strokes, settings.motion]);
  useEffect(() => {
    room.publish(
      game,
      !suspended &&
        (phase === "ready" || phase === "feedback" || phase === "handoff"),
      phase === "finished"
        ? "Game complete"
        : phase === "handoff"
          ? `Your turn, ${roster[turn + 1]}.`
          : phase === "moving"
            ? "Nice and easy…"
            : actionLabel,
      phase === "handoff" ? roster[turn + 1] : null,
      phase === "handoff" ? roster[turn + 1] : roster[turn],
    );
    room.handler.current = (e) => {
      if (latest.current.suspended) return;
      if (e.action === "next") {
        latest.current.acceptTurn();
        return;
      }
      if (phaseRef.current === "ready") {
        if (e.action === "aim") setAim(e.value);
        if (e.action === "move") setPower(0.1 + (1 - e.value) * 0.45);
      }
      if (e.action === "throw" || e.action === "shoot") latest.current.act();
    };
    return () => {
      room.handler.current = null;
    };
  }, [game, phase, suspended, actionLabel, room.publish, room.handler]);
  const reset = () => {
    changePhase("ready");
    setRound(0);
    setStrokes(0);
    setScore(0);
    setAim(0);
    setPower(0.6);
    setBall({ x: 50, y: 82 });
    setFlight(null);
    setProgress(0);
    setMessage(golf ? "Line up your first putt." : "Line up your first shot.");
  };
  if (phase === "handoff")
    return (
      <TurnHandoff
        name={roster[turn + 1]}
        detail={`${roster[turn]} scored ${score} points.`}
      />
    );
  if (phase === "finished")
    return (
      <div className="round-finished">
        <h2 tabIndex={-1}>
          {resultTitle(scores.map((n, i) => ({ name: roster[i], score: n })))}
        </h2>
        <div className="finish-scores">
          {scores
            .map((n, i) => ({ name: roster[i], score: n }))
            .sort((a, b) => b.score - a.score)
            .map((p, i) => (
              <div key={i}>
                <span>{p.name}</span>
                <strong>
                  {p.score}
                  <small>points</small>
                </strong>
              </div>
            ))}
        </div>
        <div className="finish-actions">
          <button
            className="primary-button"
            onClick={() => {
              setTurn(0);
              setScores([]);
              reset();
            }}
          >
            <RotateCcw size={18} />
            Play again
          </button>
          <button className="secondary-button" onClick={onExit}>
            Choose another game
          </button>
        </div>
        <p className="saved-note">
          <Check size={15} />
          Saved to Scores
        </p>
      </div>
    );
  const t = 1 - Math.pow(1 - progress, 2);
  const drawn =
    flight && phase === "moving"
      ? {
          x: flight.start.x + (flight.end.x - flight.start.x) * t,
          y:
            flight.start.y +
            (flight.end.y - flight.start.y) * t -
            (golf ? 0 : Math.sin(t * Math.PI) * 30),
        }
      : golf
        ? ball
        : phase === "feedback" && flight
          ? flight.end
          : { x: 50 + aim * 40, y: 82 };
  return (
    <div className={`sports-game ${game}-game`}>
      <div className="sports-scorebar">
        <div>
          <strong>{roster[turn]}</strong>
          <span>
            {golf
              ? `Hole ${round + 1} of 3 · Stroke ${Math.min(strokes + 1, 4)} of 4`
              : `Shot ${round + 1} of 5`}
          </span>
        </div>
        <div>
          <strong>
            {score}
            <small> / {golf ? 300 : 10}</small>
          </strong>
          <span>points</span>
        </div>
      </div>
      <div className="sports-arena">
        <svg
          viewBox="0 0 100 100"
          role="img"
          aria-label={
            golf
              ? `Mini golf. Cup ${Math.round(hole.x)} percent from left, ${Math.round(hole.y)} percent from top. Ball at ${Math.round(ball.x)}, ${Math.round(ball.y)}.`
              : `Basketball. Hoop ${Math.round(basket.x)} percent from left. Aim ${Math.round(((basket.x - 50) / 40) * 100)} percent and power ${Math.round(basket.power * 100)} percent.`
          }
        >
          {golf ? (
            <>
              <rect width="100" height="100" fill="#e3eee5" />
              <rect
                x="5"
                y="5"
                width="90"
                height="90"
                rx="18"
                fill="#82b297"
                stroke="#fff"
                strokeWidth="1.2"
              />
              <rect
                x="11"
                y="11"
                width="78"
                height="78"
                rx="14"
                fill="#75a98b"
              />
              <circle cx={hole.x} cy={hole.y} r="4" fill="#254d3c" />
              <path
                d={`M${hole.x} ${hole.y}v-15l10 4-10 4`}
                fill="#fff7dc"
                stroke="#fff7dc"
                strokeWidth=".9"
              />
              {phase === "ready" && (
                <>
                  <path
                    d={`M${ball.x} ${ball.y}L${preview.x} ${preview.y}`}
                    stroke="#fff"
                    strokeWidth=".65"
                    strokeDasharray="1.2 2"
                  />
                  <circle
                    cx={preview.x}
                    cy={preview.y}
                    r="3"
                    fill="none"
                    stroke="#fff"
                    strokeWidth=".6"
                  />
                </>
              )}
            </>
          ) : (
            <>
              <rect width="100" height="100" fill="#f2eaf7" />
              <path
                d="M5 96V7H95V96M5 56H95M30 7V40Q50 58 70 40V7M18 7V26Q50 87 82 26V7"
                fill="none"
                stroke="#c3b1cb"
                strokeWidth=".65"
              />
              <rect
                x={basket.x - 13}
                y="12"
                width="26"
                height="17"
                rx="1.5"
                fill="#fff"
                stroke="#a08bac"
                strokeWidth=".7"
              />
              <rect
                x={basket.x - 5}
                y="20"
                width="10"
                height="7"
                fill="none"
                stroke="#b392c2"
                strokeWidth=".7"
              />
              <path
                d={`M${basket.x - 7} 27l3 13h8l3-13m-12 2l9 9m1-9l-9 9`}
                fill="none"
                stroke="#fff"
                strokeWidth="1"
              />
              <ellipse
                cx={basket.x}
                cy="27"
                rx="7"
                ry="2"
                fill="none"
                stroke="#b3512e"
                strokeWidth="1.2"
              />
              {phase === "ready" && (
                <path
                  d={`M${50 + aim * 40} 80L${50 + aim * 40} 30`}
                  stroke="#806487"
                  strokeWidth=".6"
                  strokeDasharray="1 2"
                />
              )}
            </>
          )}
          <ellipse
            cx={drawn.x}
            cy={golf ? drawn.y + 1.2 : 87}
            rx={golf ? 2.4 : 4}
            ry="1"
            fill="#1b302d26"
          />
          <circle
            cx={drawn.x}
            cy={drawn.y}
            r={golf ? 2.4 : 4.5}
            fill={golf ? "#fff" : "#d46b32"}
            stroke={golf ? "#e0e7df" : "#783e23"}
            strokeWidth=".45"
          />
          {!golf && (
            <path
              d={`M${drawn.x - 4.3} ${drawn.y}h8.6m-4.3-4.3v8.6`}
              stroke="#783e23"
              strokeWidth=".45"
            />
          )}
        </svg>
      </div>
      <p className="sports-message" role="status">
        {message}
      </p>
      <p className="sports-live-guide">
        {golf
          ? `Aim ${Math.round(aim * PUTT_ANGLE)}° · Power ${Math.round(power * 100)}%`
          : `Power ${Math.round(power * 100)}% · this shot needs about ${Math.round(basket.power * 100)}%`}
      </p>
    </div>
  );
}
