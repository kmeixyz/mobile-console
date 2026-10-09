import { phoneSteer as steer } from "../lib/phone-point.mjs";
import GameInstruction, { ReadyInstruction } from "../components/GameInstruction";
import { cloud, smile } from "./art";
import TurnHandoff from "../components/TurnHandoff";
import PointsStar from "../components/PointsStar";
import { Hud } from "../components/GameHud";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Heart, RotateCcw, Timer } from "lucide-react";
import { chime, type Settings } from "../lib/store";
import type { useRoom } from "../lib/room";
import { resultTitle } from "../components/ResultPanel";
import { followAmount, sliceDistance } from "../lib/game-physics.mjs";
import {
  BOMB,
  COMBO_GAP,
  CRITICAL_BONUS,
  CRITICAL_CHANCE,
  DOUBLE,
  EFFECT_SECONDS,
  FREEZE,
  FREEZE_SPEED,
  FRENZY,
  FRENZY_EVERY,
  FRUIT_POINTS,
  POWER_UPS,
  ROUND,
  comboBonus,
  frenzyLaunch,
  hitRadius,
  intensity,
  planWave,
} from "../lib/fruit.mjs";
type FruitItem = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  r: number;
  kind: number;
  rotation: number;
  spin: number;
  cut: boolean;
  cutAge: number;
  previousX?: number;
  previousY?: number;
};
type Launch = ReturnType<typeof frenzyLaunch>;
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  size: number;
  color: string;
};
type Label = {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  age: number;
};
const fruits = [
  { name: "Orange", color: "#ffad49", inside: "#ffc66a" },
  { name: "Watermelon", color: "#65a77d", inside: "#f27e73" },
  { name: "Lime", color: "#9dc968", inside: "#d7e789" },
  { name: "Berry", color: "#fa7e84", inside: "#f3a8a2" },
];
// Bananas that start a power-up when sliced.
const powers: Record<number, { name: string; icon: string; color: string }> = {
  [DOUBLE]: { name: "Double score", icon: "×2", color: "#3f6fd8" },
  [FRENZY]: { name: "Frenzy", icon: "!!", color: "#c84a22" },
  [FREEZE]: { name: "Freeze", icon: "❄", color: "#1a7ba3" },
};
const effectSeconds = EFFECT_SECONDS as Record<number, number>;
const BOMB_COLORS = ["#414951", "#ff9f43", "#ffd166"];
const isActive = (
  state: { effects: Record<number, number>; elapsed: number },
  kind: number,
) => (state.effects[kind] ?? 0) > state.elapsed;
const burst = (
  particles: Particle[],
  x: number,
  y: number,
  colors: string[],
  count: number,
  speed: number,
) => {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2,
      v = speed * (0.4 + Math.random() * 0.8);
    particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 40,
      age: 0,
      size: 0.6 + Math.random() * 0.9,
      color: colors[i % colors.length],
    });
  }
};
// Fruit a second at an intensity of 1.
const BASE_RATE = 7;
const CALM_RATE = 5;
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
// Pointing the phone covers the area fruit flies through, centered on it, so
// pointing up and down reaches the same amount of fruit either way.
const CENTER = { x: 450, y: 330 };
const REACH = { x: 380, y: 260 };
// The blade cuts wherever it is, even held still. Moving faster than this
// (screen units a second) it also leaves a trail and lights up.
const SLICE_SPEED = 600;
export default function Fruit({
  roster,
  relaxed,
  hard = false,
  settings,
  suspended = false,
  room,
  onComplete,
  onExit,
}: {
  roster: string[];
  relaxed: boolean;
  hard?: boolean;
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
    cursor: { ...CENTER },
    targetCursor: { ...CENTER },
    lastCursor: { ...CENTER },
    slicing: false,
    score: 0,
    lives: 3,
    remaining: ROUND,
    spawn: 0,
    id: 0,
    elapsed: 0,
    // Fruit cut in the current swing, scored as a combo once it ends.
    chain: { count: 0, last: 0, x: 0, y: 0 },
    // When each running power-up ends, in seconds into the turn.
    effects: {} as Record<number, number>,
    frenzySpawn: 0,
    labels: [] as Label[],
    shake: 0,
    flash: 0,
  });
  const refs = useRef({
    settings,
    calm,
    hard,
    onComplete,
    turn,
    count,
    names,
    scores,
  });
  refs.current = { settings, calm, hard, onComplete, turn, count, names, scores };
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
      cursor: { ...old.targetCursor },
      lastCursor: { ...old.targetCursor },
      slicing: false,
      score: 0,
      lives: 3,
      remaining: ROUND,
      spawn: 0,
      elapsed: 0,
      chain: { count: 0, last: 0, x: 0, y: 0 },
      effects: {},
      frenzySpawn: 0,
      labels: [],
      shake: 0,
      flash: 0,
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
      const el = canvas.current;
      const aspect = el ? (el.clientHeight / el.clientWidth) * 1.5 : 1;
      const multiplier = isActive(state, DOUBLE) ? 2 : 1;
      let hits = 0;
      for (const item of state.items) {
        if (item.cut) continue;
        let distance = Math.hypot(item.x - x, (item.y - y) * aspect);
        if (previous) {
          distance = sliceDistance(previous, { x, y },
            { x: item.previousX ?? item.x, y: item.previousY ?? item.y }, item, aspect);
        }
        if (distance > hitRadius(item.kind, item.r)) continue;
        item.cut = true;
        item.cutAge = 0;
        if (item.kind === BOMB) {
          // The explosion replaces the bomb, and the swing's combo is lost.
          item.cutAge = 1;
          burst(state.particles, item.x, item.y, BOMB_COLORS, 22, 260);
          state.chain.count = 0;
          state.shake = 0.35;
          state.flash = 0.22;
          state.labels.push({
            x: item.x,
            y: item.y,
            text: "Bomb!",
            color: "#c2412d",
            size: 34,
            age: 0,
          });
          room.buzz(250);
          state.lives--;
          setLives(state.lives);
          if (state.lives <= 0) {
            finish();
            break;
          }
          continue;
        }
        const power = powers[item.kind];
        if (power) {
          state.effects[item.kind] = state.elapsed + effectSeconds[item.kind];
          if (item.kind === FRENZY) state.frenzySpawn = 0;
          burst(state.particles, item.x, item.y, ["#ffd84d", power.color], 14, 180);
          state.labels.push({
            x: item.x,
            y: item.y,
            text: `${power.name}!`,
            color: power.color,
            size: 34,
            age: 0,
          });
          room.buzz(80);
          chime(refs.current.settings.sound, true);
          continue;
        }
        hits++;
        const critical = Math.random() < CRITICAL_CHANCE;
        const points =
          (FRUIT_POINTS + (critical ? CRITICAL_BONUS : 0)) * multiplier;
        state.score += points;
        if (critical)
          state.labels.push({
            x: item.x,
            y: item.y,
            text: `Critical! +${points}`,
            color: "#d9480f",
            size: 30,
            age: 0,
          });
        else state.labels.push({ x: item.x, y: item.y - item.r, text: `+${points}`, color: "#526d35", size: 22, age: 0 });
        const fruit = fruits[item.kind];
        burst(state.particles, item.x, item.y, [fruit.inside, fruit.color], 12, 170);
        state.chain = {
          count: state.chain.count + 1,
          last: state.elapsed,
          x: item.x,
          y: item.y,
        };
      }
      if (hits > 0) {
        setScore(state.score);
        room.buzz(25);
        chime(refs.current.settings.sound);
      }
    },
    [finish, room.buzz],
  );
  // A swing ends once nothing more is cut for a moment; three or more fruit
  // in it score again.
  const settleCombo = useCallback(() => {
    const state = m.current;
    const { count, x, y } = state.chain;
    state.chain.count = 0;
    if (state.phase !== "playing") return;
    const bonus = comboBonus(count) * (isActive(state, DOUBLE) ? 2 : 1);
    if (!bonus) return;
    state.score += bonus;
    setScore(state.score);
    state.labels.push({
      x,
      y: y - 40,
      text: `${count} fruit combo +${bonus}`,
      color: "#6c4fd1",
      size: 32,
      age: 0,
    });
    room.buzz(60);
    chime(refs.current.settings.sound, true);
  }, [room.buzz]);
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
          ? `${names[turn]} · ${clock(seconds)} left`
          : phase === "paused"
            ? "Paused"
            : phase === "ready"
              ? "Ready to slice"
              : `Your turn, ${names[turn + 1]}.`,
      phase === "turnover" ? names[turn + 1] : null,
      phase === "turnover" ? names[turn + 1] : names[turn],
    );
    room.handler.current = (e) => {
      if (suspended || !Number.isFinite(e.value)) return;
      if (e.action === "next") {
        acceptTurn();
        return;
      }
      if (e.action === "aim")
        m.current.targetCursor.x = CENTER.x + steer(e.value) * REACH.x;
      if (e.action === "move")
        m.current.targetCursor.y = CENTER.y + steer(e.value) * REACH.y;
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
      const power = powers[item.kind];
      if (power) {
        // A banana in a colored ring; cut, each half keeps its side.
        if (half) {
          ctx.beginPath();
          ctx.rect(-r * 2, half === -1 ? -r * 2 : 0, r * 4, r * 2);
          ctx.clip();
        }
        ctx.fillStyle = `${power.color}2e`;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = power.color;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = "#ffd84d";
        ctx.beginPath();
        ctx.arc(0, -r * 0.3, r * 0.8, 0.2 * Math.PI, 0.8 * Math.PI);
        ctx.arc(0, -r * 0.62, r * 0.8, 0.8 * Math.PI, 0.2 * Math.PI, true);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#29465a";
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = power.color;
        ctx.font = `700 ${Math.round(r * 0.55)}px -apple-system, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(power.icon, 0, -r * 0.35);
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
      ctx.strokeStyle = "#29465a";
      ctx.lineWidth = 3;
      ctx.stroke();
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
      if (half) {
        ctx.strokeStyle = "#fff2c7";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-r * .85, 0); ctx.lineTo(r * .85, 0); ctx.stroke();
      }
      if (!half) {
        smile(ctx, r);
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
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const state = m.current;
      const jumpToTarget = Math.hypot(state.targetCursor.x - state.cursor.x, state.targetCursor.y - state.cursor.y);
      const follow = jumpToTarget > 200 ? 1 : followAmount(dt);
      state.cursor.x += (state.targetCursor.x - state.cursor.x) * follow;
      state.cursor.y += (state.targetCursor.y - state.cursor.y) * follow;
      if (state.phase === "playing") {
        state.elapsed += dt;
        state.remaining = Math.max(0, ROUND - state.elapsed);
        if (Math.ceil(state.remaining) !== Math.ceil(state.remaining + dt))
          setSeconds(Math.ceil(state.remaining));
        if (
          state.chain.count &&
          (state.elapsed - state.chain.last > COMBO_GAP || state.remaining <= 0)
        )
          settleCombo();
        if (state.remaining <= 0) finish();
        const running = POWER_UPS.filter((k) => isActive(state, k));
        // Freeze slows the fruit; the clock keeps its pace.
        const step = dt * (running.includes(FREEZE) ? FREEZE_SPEED : 1);
        const add = (launch: Launch) =>
          state.items.push({
            ...launch,
            id: ++state.id,
            r: (node.clientWidth < 500 ? 57 : 36) + Math.random() * 8,
            rotation: Math.random(),
            cut: false,
            cutAge: 0,
          });
        state.spawn -= step;
        if (state.spawn <= 0) {
          const rate =
            (refs.current.calm ? CALM_RATE : BASE_RATE) *
            intensity(state.elapsed);
          const wave: Launch[] = planWave(state.elapsed, {
            calm: refs.current.calm,
            hard: refs.current.hard,
            active: running,
          });
          wave.forEach(add);
          state.spawn = wave.length / rate;
        }
        if (running.includes(FRENZY)) {
          state.frenzySpawn -= step;
          while (state.frenzySpawn <= 0) {
            add(frenzyLaunch());
            state.frenzySpawn += FRENZY_EVERY;
          }
        }
        for (const item of state.items) {
          item.previousX = item.x;
          item.previousY = item.y;
          item.x += item.vx * step;
          item.y += item.vy * step;
          item.vy += item.g * step;
          if (!refs.current.settings.motion) item.rotation += item.spin * step;
          if (item.cut) item.cutAge += step;
        }
        state.items = state.items.filter(
          (f) =>
            (f.vy < 0 || f.y < 740) &&
            f.x > -200 &&
            f.x < 1100 &&
            (!f.cut || f.cutAge < 0.7),
        );
        state.particles.forEach((p) => {
          p.x += p.vx * step;
          p.y += p.vy * step;
          p.vy += 120 * step;
          p.age += step;
        });
        state.particles = state.particles.filter((p) => p.age < 0.6);
        state.labels.forEach((l) => (l.age += dt));
        state.labels = state.labels.filter((l) => l.age < 1);
        state.shake = Math.max(0, state.shake - dt);
        state.flash = Math.max(0, state.flash - dt);
        // The blade cuts where it is, and along its whole path since the
        // last frame.
        const from = state.lastCursor;
        const at = { ...state.cursor };
        const aspectNow = (node.height / node.width) * 1.5;
        const speed =
          Math.hypot(at.x - from.x, (at.y - from.y) * aspectNow) / Math.max(dt, 0.001);
        const jump = Math.hypot(at.x - from.x, at.y - from.y);
        // A jump across the screen in one frame is re-centering, not a swing.
        state.slicing = speed > SLICE_SPEED && jump < 200;
        if (state.slicing) {
          if (!state.trail.length) state.trail.push({ ...from, age: dt });
          state.trail.push({ ...at, age: 0 });
        }
        slice(at.x, at.y, jump < 200 ? from : undefined);
        state.lastCursor = at;
        state.trail.forEach((p) => (p.age += dt));
        state.trail = state.trail.filter((p) => p.age < 0.18);
      }
      if (state.phase !== "playing") {
        state.lastCursor = { ...state.cursor };
        state.slicing = false;
        state.trail.length = 0;
      }
      if (!node.width || !node.height) return;
      const aspect = (node.height / node.width) * 1.5;
      const height = 600 * aspect;
      const still = refs.current.settings.motion;
      ctx.setTransform(node.width / 900, 0, 0, node.width / 900, 0, 0);
      ctx.clearRect(0, 0, 900, height);
      if (state.shake > 0 && !still)
        ctx.translate(
          (Math.random() - 0.5) * state.shake * 40,
          (Math.random() - 0.5) * state.shake * 40,
        );
      ctx.fillStyle = "#fff0d8";
      ctx.fillRect(-20, -20, 940, height + 40);
      cloud(ctx, 100, height * .13, 1.2);
      cloud(ctx, 790, height * .2, 1);
      ctx.fillStyle = "#f8dba6";
      ctx.beginPath();
      ctx.moveTo(0, height * .95);
      ctx.quadraticCurveTo(450, height * .79, 900, height * .96);
      ctx.lineTo(900, height); ctx.lineTo(0, height); ctx.fill();
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
          ctx.arc(
            p.x,
            p.y * aspect,
            4 * p.size * (1 - p.age / 0.6),
            0,
            Math.PI * 2,
          );
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      }
      const running = POWER_UPS.filter((k) => isActive(state, k));
      if (running.includes(FREEZE)) {
        ctx.fillStyle = "#a9dcf047";
        ctx.fillRect(-20, -20, 940, height + 40);
      }
      if (state.trail.length > 1 && !still) {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        // Each segment tapers and fades independently, so old motion dissolves
        // rather than disappearing as one hard-edged strip.
        for (let i = 1; i < state.trail.length; i++) {
          const a = state.trail[i - 1], b = state.trail[i];
          const life = Math.max(0, 1 - b.age / 0.18);
          ctx.globalAlpha = life * .8;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y * aspect);
          ctx.lineTo(b.x, b.y * aspect);
          ctx.strokeStyle = "#ef9650"; ctx.lineWidth = 10 * life; ctx.stroke();
          ctx.strokeStyle = "#fffdf4"; ctx.lineWidth = 4 * life; ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      // The blade, so players can see where their phone points before slicing.
      // A dark ring with a white halo stands out on the cream sky and on fruit.
      if (state.phase === "playing" || state.phase === "paused") {
        const slicing = state.phase === "playing" && state.slicing;
        const r = slicing ? 11 : 9;
        ctx.beginPath();
        ctx.arc(state.cursor.x, state.cursor.y * aspect, r, 0, Math.PI * 2);
        ctx.fillStyle = slicing ? "#ea580c" : "#fff";
        ctx.fill();
        ctx.lineWidth = 6;
        ctx.strokeStyle = "#ffffffe6";
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#1d1d1f";
        ctx.stroke();
      }
      if (state.flash > 0 && !still) {
        ctx.fillStyle = "#fff";
        ctx.globalAlpha = Math.min(0.6, state.flash * 3);
        ctx.fillRect(-20, -20, 940, height + 40);
        ctx.globalAlpha = 1;
      }
      // Combo, critical, bomb and power-up callouts rise and fade, below the
      // power-up chips.
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      for (const l of state.labels) {
        ctx.globalAlpha = 1 - l.age;
        ctx.font = `700 ${l.size}px -apple-system, sans-serif`;
        const x = Math.max(140, Math.min(760, l.x)),
          y = Math.max(90, l.y * aspect - l.age * 50);
        ctx.lineWidth = 6;
        ctx.strokeStyle = "#fff";
        ctx.strokeText(l.text, x, y);
        ctx.fillStyle = l.color;
        ctx.fillText(l.text, x, y);
      }
      ctx.globalAlpha = 1;
      // Running power-ups and their seconds left, held still above the shake.
      ctx.setTransform(node.width / 900, 0, 0, node.width / 900, 0, 0);
      const chip = 200,
        gap = 12;
      running.forEach((kind, i) => {
        const power = powers[kind];
        const x = 450 - (running.length * (chip + gap) - gap) / 2 + i * (chip + gap);
        ctx.fillStyle = "#ffffffeb";
        ctx.beginPath();
        ctx.roundRect(x, 16, chip, 44, 22);
        ctx.fill();
        ctx.strokeStyle = power.color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = power.color;
        ctx.font = "600 19px -apple-system, sans-serif";
        ctx.fillText(
          `${power.icon}  ${power.name} ${Math.ceil(state.effects[kind] - state.elapsed)}`,
          x + chip / 2,
          39,
        );
      });
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
    settleCombo,
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
                  <PointsStar />
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
      <Hud slot="start">
        <strong className="hud-score fruit-hud-score">
          <span>{score}</span>
          <PointsStar />
        </strong>
      </Hud>
      <Hud slot="end">
        <div
          className="fruit-timer"
          aria-label={`${seconds} seconds remaining`}
        >
          <Timer aria-hidden="true" />
          <strong>{clock(seconds)}</strong>
        </div>
      </Hud>
      {!calm && (
        <Hud slot="corner">
          <div className="fruit-hearts">
            {Array.from({ length: 3 }, (_, i) => (
              <Heart
                key={i}
                size={22}
                fill={i < lives ? "currentColor" : "none"}
                aria-label={i < lives ? "Heart remaining" : "Heart lost"}
              />
            ))}
          </div>
        </Hud>
      )}
      <div className="fruit-arena">
        <canvas ref={canvas} role="img" aria-label="Flying fruit." />
        {(phase === "ready" || phase === "paused") && (
          <div className="court-overlay">
            <h2 tabIndex={-1}>
              {phase === "paused" ? "Paused" : `${names[turn]}, ready?`}
            </h2>
            <ReadyInstruction game="fruit" paused={phase === "paused"} />
          </div>
        )}
      </div>
      <GameInstruction game="fruit" />
    </div>
  );
}
