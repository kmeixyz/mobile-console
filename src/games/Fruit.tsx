import TurnHandoff from "../components/TurnHandoff";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Heart, RotateCcw } from "lucide-react";
import { chime, type Settings } from "../lib/store";
import type { useRoom } from "../lib/room";
import { resultTitle } from "../components/ResultPanel";
type FruitItem = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  kind: number;
  rotation: number;
  cut: boolean;
  cutAge: number;
};
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  color: string;
};
const fruits = [
  { name: "Orange", color: "#f49a36", inside: "#ffc66a" },
  { name: "Watermelon", color: "#4e9361", inside: "#f27e73" },
  { name: "Lime", color: "#8dab53", inside: "#d7e789" },
  { name: "Berry", color: "#d85e63", inside: "#f3a8a2" },
];
const ROUND = 45;
export default function Fruit({
  roster,
  relaxed,
  settings,
  suspended = false,
  room,
  onComplete,
  onExit,
}: {
  roster: string[];
  relaxed: boolean;
  settings: Settings;
  suspended?: boolean;
  room: ReturnType<typeof useRoom>;
  onComplete: (score: number, name: string) => void;
  onExit: () => void;
}) {
  const [phase, setPhase] = useState<
    "setup" | "ready" | "playing" | "paused" | "turnover" | "finished"
  >("ready");
  const count = roster.length;
  const names = roster;
  const [turn, setTurn] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [seconds, setSeconds] = useState(ROUND);
  const [lives, setLives] = useState(3);
  const calm = relaxed;
  const canvas = useRef<HTMLCanvasElement>(null);
  const m = useRef({
    phase: "ready",
    items: [] as FruitItem[],
    particles: [] as Particle[],
    trail: [] as { x: number; y: number; age: number }[],
    cursor: { x: 450, y: 300 },
    score: 0,
    lives: 3,
    remaining: ROUND,
    spawn: 0,
    id: 0,
    elapsed: 0,
    combo: 0,
  });
  const refs = useRef({
    settings,
    calm,
    onComplete,
    turn,
    count,
    names,
    scores,
  });
  refs.current = { settings, calm, onComplete, turn, count, names, scores };
  useEffect(() => {
    if (suspended && m.current.phase === "playing") {
      m.current.phase = "paused";
      setPhase("paused");
    }
  }, [suspended]);
  const finish = useCallback(() => {
    const state = m.current;
    if (state.phase !== "playing") return;
    state.phase = "turnover";
    const r = refs.current;
    const updated = [...r.scores, state.score];
    setScores(updated);
    r.onComplete(state.score, r.names[r.turn].trim() || `Player ${r.turn + 1}`);
    setPhase(r.turn + 1 >= r.count ? "finished" : "turnover");
  }, []);
  const resetRound = (autoPlay = false) => {
    const old = m.current;
    m.current = {
      ...old,
      phase: autoPlay ? "playing" : "ready",
      items: [],
      particles: [],
      trail: [],
      score: 0,
      lives: 3,
      remaining: ROUND,
      spawn: 0,
      elapsed: 0,
    };
    setScore(0);
    setLives(3);
    setSeconds(ROUND);
    setPhase(autoPlay ? "playing" : "ready");
  };
  const acceptTurn = () => {
    if (suspended || m.current.phase !== "turnover" || turn + 1 >= count)
      return;
    setTurn((t) => t + 1);
    resetRound(true);
  };
  const start = () => {
    m.current.phase = "playing";
    setPhase("playing");
  };
  const pause = () => {
    if (m.current.phase === "playing") {
      m.current.phase = "paused";
      setPhase("paused");
    } else if (m.current.phase === "paused") start();
  };
  const slice = useCallback(
    (x: number, y: number, previous?: { x: number; y: number }) => {
      const state = m.current;
      if (state.phase !== "playing") return;
      state.cursor = { x, y };
      state.trail.push({ x, y, age: 0 });
      let hits = 0;
      for (const item of state.items) {
        if (item.cut) continue;
        const el = canvas.current;
        const aspect = el ? (el.clientHeight / el.clientWidth) * 1.5 : 1;
        let distance = Math.hypot(item.x - x, (item.y - y) * aspect);
        if (previous) {
          const dx = x - previous.x,
            dy = y - previous.y;
          const t = Math.max(
            0,
            Math.min(
              1,
              ((item.x - previous.x) * dx + (item.y - previous.y) * dy) /
                (dx * dx + dy * dy || 1),
            ),
          );
          distance = Math.min(
            distance,
            Math.hypot(
              item.x - previous.x - t * dx,
              (item.y - previous.y - t * dy) * aspect,
            ),
          );
        }
        if (distance > item.r + 9) continue;
        item.cut = true;
        item.cutAge = 0;
        if (item.kind === 4) {
          state.lives--;
          setLives(state.lives);
          if (state.lives <= 0) {
            finish();
            break;
          }
          continue;
        }
        hits++;
        state.score += 10;
        setScore(state.score);
        const fruit = fruits[item.kind];
        for (let i = 0; i < 8; i++)
          state.particles.push({
            x: item.x,
            y: item.y,
            vx: Math.cos((i * Math.PI) / 4) * 100,
            vy: Math.sin((i * Math.PI) / 4) * 100,
            age: 0,
            color: fruit.inside,
          });
      }
      if (hits > 0) {
        chime(refs.current.settings.sound, hits > 1);
        if (hits > 1) {
          state.score += hits * 5;
          setScore(state.score);
        }
      }
    },
    [finish],
  );
  useEffect(() => {
    room.publish(
      "fruit",
      phase === "playing" ||
        phase === "ready" ||
        phase === "paused" ||
        phase === "turnover",
      phase === "finished"
        ? "Game complete"
        : phase === "playing"
          ? `${names[turn]} · ${seconds} seconds`
          : phase === "paused"
            ? "Paused"
            : phase === "ready"
              ? "Ready to slice"
              : `Your turn, ${names[turn + 1]}.`,
      phase === "turnover" ? names[turn + 1] : null,
      phase === "turnover" ? names[turn + 1] : names[turn],
    );
    room.handler.current = (e) => {
      if (suspended) return;
      if (e.action === "next") {
        acceptTurn();
        return;
      }
      if (e.action === "aim") m.current.cursor.x = 450 + e.value * 420;
      if (e.action === "move") m.current.cursor.y = 300 + e.value * 270;
      if (e.action === "slice") slice(m.current.cursor.x, m.current.cursor.y);
      if (e.action === "throw") {
        if (m.current.phase === "ready") start();
        else pause();
      }
    };
    return () => {
      room.handler.current = null;
    };
  }, [
    room.publish,
    room.handler,
    phase,
    names,
    turn,
    seconds,
    slice,
    suspended,
  ]);
  useEffect(() => {
    const blur = () => {
      if (m.current.phase === "playing") {
        m.current.phase = "paused";
        setPhase("paused");
      }
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!canvas.current) return;
    const node: HTMLCanvasElement = canvas.current;
    const ctx = node.getContext("2d")!;
    let raf = 0,
      last = performance.now();
    const resize = () => {
      const dpr = Math.min(devicePixelRatio, 2);
      node.width = node.clientWidth * dpr;
      node.height = node.clientHeight * dpr;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();
    const drawFruit = (item: FruitItem, half: number) => {
      ctx.save();
      const aspect = (node.height / node.width) * 1.5;
      ctx.translate(
        item.x + (half ? half * item.cutAge * 95 : 0),
        item.y * aspect,
      );
      ctx.rotate(item.rotation + (half ? half * item.cutAge * 2 : 0));
      ctx.globalAlpha = item.cut ? Math.max(0, 1 - item.cutAge * 1.5) : 1;
      const r = item.r;
      if (item.kind === 4) {
        ctx.fillStyle = "#414951";
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.83, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#b3a598";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.8);
        ctx.quadraticCurveTo(2, -r * 1.2, r * 0.4, -r);
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = "600 30px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("×", 0, 0);
        ctx.restore();
        return;
      }
      const fruit = fruits[item.kind];
      ctx.shadowColor = "#62482726";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 7;
      const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, 1, 0, 0, r);
      grad.addColorStop(0, fruit.inside);
      grad.addColorStop(1, fruit.color);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(
        0,
        0,
        r,
        half === -1 ? Math.PI : 0,
        half === 1 ? Math.PI : Math.PI * 2,
      );
      if (half) ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      if (item.kind === 0 || item.kind === 2) {
        ctx.fillStyle = fruit.inside;
        ctx.beginPath();
        ctx.arc(
          0,
          0,
          r * 0.79,
          half === -1 ? Math.PI : 0,
          half === 1 ? Math.PI : Math.PI * 2,
        );
        if (half) ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#fff8dc";
        ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          if ((half === 1 && a > Math.PI) || (half === -1 && a < Math.PI))
            continue;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * r * 0.73, Math.sin(a) * r * 0.73);
          ctx.stroke();
        }
      }
      if (item.kind === 1) {
        ctx.fillStyle = "#f18a7f";
        ctx.beginPath();
        ctx.arc(
          0,
          0,
          r * 0.8,
          half === -1 ? Math.PI : 0,
          half === 1 ? Math.PI : Math.PI * 2,
        );
        if (half) ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#574d43";
        for (let i = 0; i < 7; i++) {
          const a = (i * Math.PI * 2) / 7;
          if ((half === 1 && a > Math.PI) || (half === -1 && a < Math.PI))
            continue;
          ctx.beginPath();
          ctx.ellipse(
            Math.cos(a) * r * 0.5,
            Math.sin(a) * r * 0.5,
            2.5,
            4,
            a,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
      if (item.kind === 3) {
        ctx.fillStyle = "#f9d995";
        for (let i = 0; i < 9; i++) {
          const a = i * 2.4,
            rad = Math.sqrt(i / 9) * r * 0.7,
            x = Math.cos(a) * rad,
            y = Math.sin(a) * rad;
          if ((half === 1 && y < 0) || (half === -1 && y > 0)) continue;
          ctx.beginPath();
          ctx.ellipse(x, y, 1.8, 3, -0.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (!half) {
        ctx.fillStyle = "#558354";
        ctx.beginPath();
        ctx.ellipse(
          r * 0.13,
          -r * 0.88,
          r * 0.25,
          r * 0.11,
          -0.5,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.fillStyle = "#ffffff42";
        ctx.beginPath();
        ctx.ellipse(
          -r * 0.33,
          -r * 0.42,
          r * 0.16,
          r * 0.08,
          -0.6,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.restore();
    };
    function render(now: number) {
      raf = requestAnimationFrame(render);
      const dt = Math.min((now - last) / 1000, 0.035);
      last = now;
      const state = m.current;
      if (state.phase === "playing") {
        state.elapsed += dt;
        state.remaining = Math.max(0, ROUND - state.elapsed);
        if (Math.ceil(state.remaining) !== Math.ceil(state.remaining + dt))
          setSeconds(Math.ceil(state.remaining));
        if (state.remaining <= 0) finish();
        state.spawn -= dt;
        if (state.spawn <= 0) {
          const wave = refs.current.calm ? 2 : 3;
          for (let i = 0; i < wave; i++) {
            const x = 150 + Math.random() * 600;
            state.items.push({
              id: ++state.id,
              x,
              y: 650 + i * 45,
              vx: (450 - x) * 0.35,
              vy: -(460 + Math.random() * 110),
              r: (node.clientWidth < 500 ? 57 : 36) + Math.random() * 8,
              kind:
                !refs.current.calm && Math.random() < 0.15
                  ? 4
                  : Math.floor(Math.random() * 4),
              rotation: Math.random(),
              cut: false,
              cutAge: 0,
            });
          }
          state.spawn = refs.current.calm ? 1.5 : 1.05;
        }
        for (const item of state.items) {
          item.x += item.vx * dt;
          item.y += item.vy * dt;
          item.vy += 330 * dt;
          if (!refs.current.settings.motion) item.rotation += dt * 0.25;
          if (item.cut) item.cutAge += dt;
        }
        state.items = state.items.filter(
          (f) => f.y < 740 && (!f.cut || f.cutAge < 0.7),
        );
        state.particles.forEach((p) => {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 120 * dt;
          p.age += dt;
        });
        state.particles = state.particles.filter((p) => p.age < 0.6);
        state.trail.forEach((p) => (p.age += dt));
        state.trail = state.trail.filter((p) => p.age < 0.18);
      }
      const aspect = (node.height / node.width) * 1.5;
      const height = 600 * aspect;
      ctx.setTransform(node.width / 900, 0, 0, node.width / 900, 0, 0);
      ctx.clearRect(0, 0, 900, height);
      ctx.fillStyle = "#fcf5eb";
      ctx.fillRect(0, 0, 900, height);
      state.items.forEach((item) => {
        if (item.cut) {
          drawFruit(item, -1);
          drawFruit(item, 1);
        } else drawFruit(item, 0);
      });
      if (!refs.current.settings.motion) {
        state.particles.forEach((p) => {
          ctx.globalAlpha = 1 - p.age / 0.6;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y * aspect, 4 * (1 - p.age / 0.6), 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      }
      if (state.trail.length > 1) {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#ef977a";
        ctx.lineWidth = 5;
        ctx.beginPath();
        state.trail.forEach((p, i) =>
          i === 0
            ? ctx.moveTo(p.x, p.y * aspect)
            : ctx.lineTo(p.x, p.y * aspect),
        );
        ctx.stroke();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [
    phase === "setup" || phase === "finished" || phase === "turnover",
    finish,
    slice,
  ]);
  if (phase === "turnover")
    return (
      <TurnHandoff
        name={names[turn + 1]}
        detail={`${names[turn]} scored ${score} points.`}
      />
    );
  if (phase === "finished")
    return (
      <div className="round-finished">
        <h2 tabIndex={-1}>
          {resultTitle(scores.map((s, i) => ({ name: names[i], score: s })))}
        </h2>
        <div className="finish-scores">
          {scores
            .map((s, i) => ({ score: s, name: names[i] }))
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
              resetRound();
            }}
          >
            <RotateCcw size={18} /> Play again
          </button>
          <button className="secondary-button" onClick={onExit}>
            Choose another game
          </button>
        </div>
        <p className="saved-note">
          <Check size={15} /> Saved to Scores
        </p>
      </div>
    );
  return (
    <div className="fruit-game">
      <div className="fruit-scorebar">
        <div>
          <span>{names[turn]}</span>
          <strong>
            {score}
            <small>points</small>
          </strong>
        </div>
        <div
          className="fruit-timer"
          aria-label={`${seconds} seconds remaining`}
        >
          <strong>{seconds}</strong>
          <span>seconds</span>
        </div>
        <div className="fruit-hearts">
          {!calm ? (
            Array.from({ length: 3 }, (_, i) => (
              <Heart
                key={i}
                size={19}
                fill={i < lives ? "currentColor" : "none"}
                aria-label={i < lives ? "Heart remaining" : "Heart lost"}
              />
            ))
          ) : null}
        </div>
      </div>
      <div className="fruit-arena">
        <canvas ref={canvas} role="img" aria-label="Flying fruit." />
        {(phase === "ready" || phase === "paused") && (
          <div className="court-overlay">
            <h2 tabIndex={-1}>
              {phase === "paused" ? "Paused" : `${names[turn]}, ready?`}
            </h2>
            <p>
              {calm
                ? "Slice as much fruit as you can in 45 seconds."
                : "Slice fruit. Avoid bombs (×)."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
