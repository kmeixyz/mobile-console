import { motionFrames } from "../render-motion";
import { blankInput, botLevel, clamp, distance, pointer, TAU, type Engine, type Input, type Options, type Point } from "./types";
import { blob, face, fitSize, font, headline, label, material, outline, popText, shadow, sparkle, tint, toast } from "./draw";
import { DASH_COOLDOWN, SUMO_CAR as CAR, SUMO_CENTER as CENTER, sumoAim, sumoBump, sumoRadius, SHRINK_INTERVAL, SHRINK_DURATION, ROUND_LIMIT } from "./sumo-rules";

import { aimMark, toyFinish } from "../art";

const WINS_TO_MATCH = 3;
const INTERMISSION = 3;
const SINK_TIME = 1.25;
const STEP = 1 / 120;
const ALERT = "#ffc56b"; // the shrink warning's yellow
type Car = Options["players"][number] & Point & {
  vx: number; vy: number; aim: Point; heading: Point; dash: number; cooldown: number; queued: number;
  eliminated: boolean; wonRound: boolean; knockouts: number; falling: number; safe: number; score: number; falls: number; knockback: number;
  charged: boolean; powerDash: boolean; dashes: number; hits: number; cores: number;
  lastHit: { by: number; at: number } | null; spark: number; aiAt: number; aiDash: boolean;
};
const bumpersAt = (time: number, radius: number) => (radius >= 110 ? [0, Math.PI] : []).map(offset => {
  const angle = time * .22 + offset;
  return { x: CENTER.x + Math.cos(angle) * 104, y: CENTER.y + Math.sin(angle) * 104, vx: -Math.sin(angle) * 22.88, vy: Math.cos(angle) * 22.88 };
});

export function createSumo({ players, difficulty }: Options): Engine {
  const level = botLevel(difficulty);
  const start = (i: number, n: number): Point => {
    const a = -Math.PI / 2 + i * TAU / n;
    return { x: CENTER.x + Math.cos(a) * 154, y: CENTER.y + Math.sin(a) * 154 };
  };
  // Top and left starts sit left of the title in the top bar; right and
  // bottom starts sit right of it. Starts rotate each round.
  const seat = (i: number) => {
    const k = (i + round - 1) % cars.length, spot = start(k, cars.length);
    return { side: k === 0 || k > cars.length / 2 ? "start" as const : "end" as const, seatX: spot.x };
  };
  const cars: Car[] = players.map((p, i) => ({
    ...p, ...start(i, players.length), vx: 0, vy: 0, aim: { ...CENTER }, heading: { x: 0, y: 1 },
    dash: 0, cooldown: 0, queued: 0, eliminated: false, wonRound: false, knockouts: 0, falling: 0, safe: 1, score: 0, falls: 0, knockback: 0,
    charged: false, powerDash: false, dashes: 0, hits: 0, cores: 0, lastHit: null, spark: 0, aiAt: 0, aiDash: false,
  }));
  const motion = motionFrames<Car>(["x", "y", "falling"]);
  let splashes: { x: number; y: number; age: number }[] = [];
  let pops: { text: string; x: number; y: number; age: number }[] = [];
  let noteUntil = 0, reducedMotion = false, accumulated = 0;
  let round = 1, roundTime = 0, breakLeft = 0, roundResult = "", shrinkNotice = -1;
  let phase: "playing" | "between" = "playing";
  let coreReadyAt = 6, coreDelay = 6;
  // Between events, the hint under the arena shows the controls.
  const DEFAULT = "";
  const note = (text: string) => { engine.message = text; noteUntil = engine.time + 2.5; };
  const pop = (p: Point, text: string) => pops.push({ text, x: p.x, y: p.y - 48, age: 0 });
  const matchWon = () => cars.some(p => p.score >= WINS_TO_MATCH);
  function beginRound() {
    round++; roundTime = 0; phase = "playing"; shrinkNotice = -1;
    coreReadyAt = engine.time + 6; coreDelay = 6; splashes = []; pops = []; noteUntil = 0;
    cars.forEach((p, i) => {
      const spot = start((i + round - 1) % cars.length, cars.length);
      Object.assign(p, spot, { vx: 0, vy: 0, safe: 1, falling: 0, eliminated: false, wonRound: false,
        dash: 0, cooldown: 0, queued: 0, knockback: 0, charged: false, powerDash: false,
        lastHit: null, spark: 0, aiAt: 0, aiDash: false, aim: { ...CENTER } });
      const d = distance(p, CENTER);
      p.heading = { x: (CENTER.x - p.x) / d, y: (CENTER.y - p.y) / d };
    });
    note(`Round ${round}`);
    engine.hud = `Round ${round}`;
    engine.remaining = ROUND_LIMIT;
  }
  const engine: Engine = {
    id: "sumo", time: 0, done: false, label: "Dash", message: DEFAULT, hud: "Round 1", remaining: ROUND_LIMIT,
    setReducedMotion: enabled => { reducedMotion = enabled; },
    standings: () => cars.map((p, i) => ({ ...p, ...seat(i), aim: { ...p.aim }, heading: { ...p.heading }, lastHit: p.lastHit && { ...p.lastHit }, round, roundTime, roundPhase: phase, detail: p.eliminated ? "Eliminated" : p.wonRound ? "Round winner" : "In play" })),
    step(dt, inputs) {
      if (engine.done || !Number.isFinite(dt) || dt <= 0) return;
      // Preserve taps between display frames and accept a slightly early tap
      // near the end of cooldown. Physics stays identical at 30/60/120Hz.
      cars.forEach((p, i) => { if (phase === "playing" && !p.bot && !p.eliminated && inputs[i]?.tap) p.queued = .18; });
      accumulated = Math.min(.1, accumulated + dt);
      while (accumulated + 1e-9 >= STEP && !engine.done) { simulate(STEP, inputs); accumulated = Math.max(0, accumulated - STEP); }
    },
    draw(c, w, h, interpolation = 1) {
      const displayed = motion.sample(cars, interpolation, (p, before) => Math.hypot(p.x - before.x, p.y - before.y) > 60 || p.eliminated !== before.eliminated);
      const water = c.createLinearGradient(0, 0, 0, h);
      water.addColorStop(0, "#e1f3f5"); water.addColorStop(1, "#b9e1e6");
      c.fillStyle = water; c.fillRect(0, 0, w, h);
      // The island and its banner fill the view whatever its shape; the
      // drivers' cards sit in the screen's corners instead of on the board.
      const scale = Math.min(w / 580, h / 600);
      c.save(); c.translate(w / 2 - 450 * scale, h / 2 - 312 * scale); c.scale(scale, scale);
      {
        const R = sumoRadius(roundTime), visualTime = reducedMotion ? 0 : engine.time;
        const left = 450 - w / 2 / scale, top = 312 - h / 2 / scale, spanX = w / scale + 60, spanY = h / scale;
        c.strokeStyle = "#ffffffb8"; c.lineWidth = 2; c.lineCap = "round";
        for (let k = 0, waves = Math.round(spanX * spanY / 37000); k < waves; k++) {
          const x = left + (k * 157 + visualTime * 12) % spanX - 30, y = top + 20 + (k * 89) % Math.max(1, spanY - 40);
          c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 15, y - 8, x + 30, y); c.stroke();
        }
        shadow(c, CENTER.x, CENTER.y + 30, R + 28, R + 18);
        // Sidewall, porcelain lip and soft grass top are separate surfaces.
        blob(c, CENTER.x, CENTER.y + 12, R + 16, "#a9c3bb", 0);
        blob(c, CENTER.x, CENTER.y, R + 16, "#fff5dc", 0);
        c.beginPath(); c.arc(CENTER.x, CENTER.y, R, 0, TAU);
        c.fillStyle = toyFinish(c, CENTER.x, CENTER.y, Math.max(1, R), "#d2edca", "#acd6b8", "#88bda6"); c.fill();
        c.beginPath(); c.arc(CENTER.x, CENTER.y, R + 9, Math.PI * 1.08, Math.PI * 1.88);
        c.strokeStyle = "#ffffffcc"; c.lineWidth = 3; c.stroke();
        const cycle = roundTime % SHRINK_INTERVAL;
        const shrinking = roundTime >= SHRINK_INTERVAL && cycle < SHRINK_DURATION;
        const warning = cycle >= SHRINK_INTERVAL - 2;
        c.beginPath(); c.arc(CENTER.x, CENTER.y, Math.max(0, R - 14), 0, TAU); c.strokeStyle = warning || shrinking ? "#f8ae5f" : "#fffdf5"; c.lineWidth = 3; c.setLineDash([12, 12]); c.stroke(); c.setLineDash([]);
        if (phase === "playing" && (warning || shrinking)) {
          const next = Math.max(0, 250 - (Math.floor(roundTime / SHRINK_INTERVAL) + (shrinking ? 0 : 1)) * 25);
          c.beginPath(); c.arc(CENTER.x, CENTER.y, next, 0, TAU); c.strokeStyle = "#fffdf5b0"; c.lineWidth = 3; c.setLineDash([8, 8]); c.stroke(); c.setLineDash([]);
        }
        // A visible recharge well makes the center worth contesting.
        const coreReady = engine.time >= coreReadyAt;
        if (phase === "playing" && R >= 60) {
          c.beginPath(); c.arc(CENTER.x, CENTER.y, 43, 0, TAU); c.fillStyle = "#ffffff35"; c.fill();
          c.strokeStyle = "#fffdf5"; c.lineWidth = 4; c.stroke();
          if (coreReady) {
            const pulse = reducedMotion ? 1 : 1 + Math.sin(engine.time * 3) * .08;
            blob(c, CENTER.x, CENTER.y, 19 * pulse, "#ffd668", 2.5);
            bolt(c, CENTER.x, CENTER.y, 26, "#fffdf5");
          } else {
            // A gold bolt over a big countdown says what comes back, and when.
            const fraction = 1 - clamp((coreReadyAt - engine.time) / coreDelay, 0, 1);
            c.beginPath(); c.arc(CENTER.x, CENTER.y, 34, -Math.PI / 2, -Math.PI / 2 + TAU * fraction); c.strokeStyle = "#3c7a55"; c.lineWidth = 6; c.lineCap = "round"; c.stroke();
            bolt(c, CENTER.x, CENTER.y - 12, 17, "#ffd668", "#24513a");
            label(c, `${Math.ceil(coreReadyAt - engine.time)}s`, CENTER.x, CENTER.y + 18, 22, "#24513a", 800, "center");
          }
        }
        for (const b of bumpersAt(roundTime, R)) {
          shadow(c, b.x, b.y + 10, 25, 12);
          blob(c, b.x, b.y + 3, 23, "#bb6d89", 0);
          blob(c, b.x, b.y, 23, "#fff5f3", 0);
          c.beginPath(); c.arc(b.x, b.y - 2, 20, 0, TAU);
          c.fillStyle = toyFinish(c, b.x, b.y - 2, 20, "#ffd3df", "#ed91b0", "#d77399"); c.fill();
          blob(c, b.x, b.y - 3, 14, "#fff0f2", 0);
          c.beginPath(); c.moveTo(b.x - 7, b.y - 12);
          for (let k = 0; k < 5; k++) c.lineTo(b.x + (k % 2 ? -7 : 7), b.y - 9 + k * 4);
          c.strokeStyle = "#9c5474"; c.lineWidth = 2.5; c.stroke();
        }
        for (const s of splashes) {
          c.globalAlpha = 1 - s.age / 1.2;
          for (let k = 0; k < 2; k++) { c.beginPath(); c.ellipse(s.x, s.y, 20 + s.age * 60 + k * 14, (20 + s.age * 60 + k * 14) * .45, 0, 0, TAU); c.strokeStyle = "#fffdf5"; c.lineWidth = 4; c.stroke(); }
          if (!reducedMotion) for (let k = 0; k < 6; k++) { const a = k * TAU / 6; blob(c, s.x + Math.cos(a) * (14 + s.age * 50), s.y - 20 - Math.sin(s.age * 3) * 30 + Math.sin(a) * 10, 5, "#e9f8ff", 1.5); }
          c.globalAlpha = 1;
        }
        [...displayed].sort((a, b) => a.y - b.y).forEach(p => drawCar(c, p, R, reducedMotion));
        pops.forEach(p => popText(c, p.text, p.x, p.y - (reducedMotion ? 0 : p.age * 40), 22, "#ffe9a0", 1 - p.age));
        cars.forEach(p => {
          if (p.bot || p.eliminated || phase !== "playing") return;
          aimMark(c, p.aim.x, p.aim.y, 8, p.color, p.cooldown === 0);
        });
        if (phase === "between") {
          // One big line says who won; a small one counts down to what's next.
          // Both shrink to the visible width, which is narrow on a portrait screen.
          const room = w / scale - 48, next = matchWon() ? "Results in " : `Round ${round + 1} in `, count = `${Math.ceil(breakLeft)}s`;
          headline(c, roundResult, 450, 300, fitSize(c, roundResult, 64, room, 700, .72));
          toast(c, next, 450, 384, fitSize(c, next + count, 38, room, 600, 1.7), 1, { text: count, color: ALERT });
        }
      }
      c.restore();
      // The corner counts down to the island's next shrink, turning orange
      // just before and during it; the top bar shows each car's round wins.
      // Top middle would cover the island's rim on wide screens.
      if (phase === "playing") {
        const fit = clamp(Math.min(w, h) / 640, .8, 1.25), u = fit * 1.6, pad = 14 * fit;
        const cycle = roundTime % SHRINK_INTERVAL;
        const alert = cycle >= SHRINK_INTERVAL - 2 || (roundTime >= SHRINK_INTERVAL && cycle < SHRINK_DURATION);
        c.save(); c.scale(u, u);
        pill(c, pad / u, pad / u, `${Math.ceil(SHRINK_INTERVAL - cycle)}s`, (c, x, y, s) => shrinkIcon(c, x, y, s, alert), alert ? ALERT : "#fff");
        c.restore();
      }
    },
  };
  function simulate(dt: number, inputs: Input[]) {
    motion.capture(cars);
    engine.time += dt;
    splashes.forEach(s => { s.age += dt; }); splashes = splashes.filter(s => s.age < 1.2);
    pops.forEach(s => { s.age += dt; }); pops = pops.filter(s => s.age < 1);
    cars.forEach(p => { if (p.eliminated) p.falling = Math.max(0, p.falling - dt); });
    if (phase === "between") {
      breakLeft = Math.max(0, breakLeft - dt);
      // The arena counts down to the next round; the bar keeps the round's result.
      engine.remaining = breakLeft;
      if (!breakLeft) { if (matchWon()) engine.done = true; else beginRound(); }
      return;
    }
    roundTime = Math.min(ROUND_LIMIT, roundTime + dt);
    if (noteUntil && engine.time > noteUntil) { engine.message = DEFAULT; noteUntil = 0; }
    const cycle = roundTime % SHRINK_INTERVAL, shrinkStep = Math.floor(roundTime / SHRINK_INTERVAL);
    if (cycle >= SHRINK_INTERVAL - 2 && shrinkNotice !== shrinkStep) {
      shrinkNotice = shrinkStep; note("The island is shrinking!");
    }
    const R = sumoRadius(roundTime), bumpers = bumpersAt(roundTime, R);
    cars.forEach((p, i) => {
      if (p.eliminated) return;
      p.cooldown = Math.max(0, p.cooldown - dt); p.dash = Math.max(0, p.dash - dt); p.safe = Math.max(0, p.safe - dt);
      p.spark = Math.max(0, p.spark - dt); p.knockback = Math.max(0, p.knockback - dt); p.queued = Math.max(0, p.queued - dt);
      if (p.bot) {
        if (engine.time >= p.aiAt) {
          const plan = botPlan(p, i, R); p.aim = plan.aim; p.aiDash = plan.go; p.aiAt = engine.time + .16 - level * .025;
        }
      } else p.aim = sumoAim(pointer(inputs[i] ?? blankInput()), R);
      const dx = p.aim.x - p.x, dy = p.aim.y - p.y, d = Math.hypot(dx, dy);
      if (d > 8) p.heading = { x: dx / d, y: dy / d };
      if ((p.bot ? p.aiDash && p.safe <= 0 : p.queued > 0) && p.cooldown === 0) {
        p.powerDash = p.charged; p.charged = false; p.dash = p.powerDash ? .32 : .25; p.cooldown = DASH_COOLDOWN;
        p.vx = p.heading.x * (p.powerDash ? 740 : 520); p.vy = p.heading.y * (p.powerDash ? 740 : 520);
        p.safe = 0; p.queued = 0; p.knockback = 0; p.dashes++;
        if (p.powerDash) pop(p, "Power!");
      }
      if (p.dash > 0 || p.knockback > 0) {
        // Keep collision momentum alive instead of clamping it to cruising speed.
        const drag = Math.exp(-(p.dash > 0 ? .9 : 2.2) * dt); p.vx *= drag; p.vy *= drag;
        if (p.dash <= 0 && d > 1) { p.vx += dx / d * 95 * dt; p.vy += dy / d * 95 * dt; }
      } else {
        const speed = Math.min(p.bot ? 205 + level * 12 : 235, d * 4), response = 1 - Math.exp(-7 * dt);
        p.vx += ((d > .01 ? dx / d * speed : 0) - p.vx) * response;
        p.vy += ((d > .01 ? dy / d * speed : 0) - p.vy) * response;
      }
      // A generous safety bound contains repeated pinball contacts without
      // cancelling a legitimate shove on the next simulation step.
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > 950) { p.vx *= 950 / speed; p.vy *= 950 / speed; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      for (const b of bumpers) {
        const gap = distance(p, b);
        if (gap >= CAR + 22) continue;
        const nx = gap > .001 ? (p.x - b.x) / gap : 1, ny = gap > .001 ? (p.y - b.y) / gap : 0;
        p.x = b.x + nx * (CAR + 22); p.y = b.y + ny * (CAR + 22);
        const inward = (p.vx - b.vx) * nx + (p.vy - b.vy) * ny;
        if (inward < 0) {
          const kick = -inward * 1.5 + 130; p.vx += nx * kick; p.vy += ny * kick;
          p.knockback = .4; p.dash = 0; p.spark = .18;
        }
      }
    });
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j], contact = sumoBump(a, b);
      if (!contact) continue;
      if (contact.fromA) { b.lastHit = { by: i, at: engine.time }; a.hits++; }
      if (contact.fromB) { a.lastHit = { by: j, at: engine.time }; b.hits++; }
      if (contact.impact > 150) a.spark = b.spark = .22;
    }
    cars.forEach(p => {
      if (p.eliminated || R > 0 && distance(p, CENTER) < R + 4) return;
      p.eliminated = true; p.falling = SINK_TIME; p.falls++; p.queued = 0; p.charged = false;
      p.vx = p.vy = p.dash = p.knockback = 0;
      splashes.push({ x: p.x, y: p.y, age: 0 });
      const by = p.lastHit && engine.time - p.lastHit.at < 3 ? cars[p.lastHit.by] : null;
      if (by && by !== p) { by.knockouts++; pop(by, "KO!"); note(`${by.name} bumped ${p.name} off!`); }
      else note(`${p.name} fell off!`);
      p.lastHit = null;
    });
    if (engine.time >= coreReadyAt && R >= 60) {
      const taker = cars.filter(p => !p.eliminated && p.safe <= 0 && !p.charged && distance(p, CENTER) < CAR + 18).sort((a, b) => distance(a, CENTER) - distance(b, CENTER))[0];
      if (taker) { taker.charged = true; taker.cores++; coreReadyAt = engine.time + 12; coreDelay = 12; pop(taker, "Charged!"); note(`${taker.name} got a power dash!`); }
    }
    const survivors = cars.filter(p => !p.eliminated);
    engine.remaining = Math.max(0, ROUND_LIMIT - roundTime);
    engine.hud = `Round ${round}`;
    // Resolve after every fall in this physics step, so a double KO is a draw
    // instead of granting the round to whichever car happens to update first.
    if (survivors.length === 0 || cars.length > 1 && survivors.length === 1) {
      const winner = survivors[0];
      if (winner) { winner.score++; winner.wonRound = true; }
      roundResult = winner ? `${winner.name} wins${matchWon() ? " the match" : " the round"}!` : "Draw!";
      phase = "between"; breakLeft = INTERMISSION; engine.message = DEFAULT; noteUntil = 0;
      cars.forEach(p => { p.queued = 0; });
    }
  }

  function botPlan(p: Car, i: number, R: number) {
    const fromCenter = distance(p, CENTER);
    if (fromCenter > R - 62) return { aim: { ...CENTER }, go: false };
    const rivals = cars.filter((o, j) => j !== i && !o.eliminated && o.safe <= 0);
    const target = rivals.sort((a, b) => distance(p, a) - distance(a, CENTER) * .35 - (distance(p, b) - distance(b, CENTER) * .35))[0];
    if (!target) return { aim: { ...CENTER }, go: false };
    const out = distance(target, CENTER) || 1, ox = (target.x - CENTER.x) / out, oy = (target.y - CENTER.y) / out;
    const inside = fromCenter < out - 14, close = distance(p, target) < 105 + level * 15;
    let aim = inside ? { x: target.x + ox * 48, y: target.y + oy * 48 }
      : { x: target.x - ox * 82 + Math.sin(engine.time + i) * 24, y: target.y - oy * 82 };
    let go = inside && close && p.cooldown === 0 && Math.sin(engine.time * (1.5 + level * .5) + i * 2) > .25 - level * .15;
    if (!p.charged && engine.time >= coreReadyAt && !go) aim = { ...CENTER };
    // Route around the spring posts instead of getting trapped driving into one.
    for (const b of bumpersAt(roundTime, R)) {
      const dx = aim.x - p.x, dy = aim.y - p.y, length = Math.hypot(dx, dy) || 1;
      const ahead = ((b.x - p.x) * dx + (b.y - p.y) * dy) / length;
      const across = ((b.x - p.x) * -dy + (b.y - p.y) * dx) / length;
      if (ahead > 0 && ahead < Math.min(length, 110) && Math.abs(across) < 62) {
        const side = across > 0 ? -1 : 1;
        aim = { x: b.x - dy / length * side * 78, y: b.y + dx / length * side * 78 }; go = false;
      }
    }
    return { aim: sumoAim(aim, R), go };
  }
  return engine;
}

function drawCar(c: CanvasRenderingContext2D, p: Car, R: number, reducedMotion: boolean) {
  if (p.eliminated && p.falling === 0) return;
  const sinking = p.falling > 0 ? Math.min(1, (SINK_TIME - p.falling) / .7) : 0;
  if (sinking >= 1) return;
  c.save(); c.translate(p.x, p.y); c.scale(1 - sinking * .6, 1 - sinking * .6); c.globalAlpha = 1 - sinking;
  if (!sinking) shadow(c, 0, 14, CAR + 4, 10);
  if (p.safe > 0) { c.beginPath(); c.arc(0, 0, CAR + 10, 0, TAU); c.fillStyle = "#ffffff40"; c.fill(); c.strokeStyle = "#ffffff"; c.lineWidth = 3; c.stroke(); }
  if (p.charged) { c.beginPath(); c.arc(0, 0, CAR + 7, 0, TAU); c.strokeStyle = "#ffe17a"; c.lineWidth = 5; c.stroke(); }
  if (!p.bot && !p.falling && p.cooldown === 0) {
    const { x, y } = p.heading;
    c.beginPath(); c.moveTo(x * (CAR + 19), y * (CAR + 19));
    c.lineTo(x * (CAR + 8) - y * 7, y * (CAR + 8) + x * 7);
    c.lineTo(x * (CAR + 8) + y * 7, y * (CAR + 8) - x * 7); c.closePath();
    c.fillStyle = p.charged ? "#ffd668" : p.color; c.fill(); c.strokeStyle = "#fffdf5"; c.lineWidth = 2; c.stroke();
  }
  if (p.dash > 0 && !reducedMotion) {
    const speed = Math.hypot(p.vx, p.vy) || 1, bx = -p.vx / speed, by = -p.vy / speed;
    c.strokeStyle = p.powerDash ? "#ffe17a" : "#ffffffcc"; c.lineWidth = p.powerDash ? 6 : 4; c.lineCap = "round";
    for (const off of [-12, 0, 12]) { c.beginPath(); c.moveTo(bx * 34 - by * off, by * 34 + bx * off); c.lineTo(bx * 60 - by * off, by * 60 + bx * off); c.stroke(); }
  }
  c.save();
  // The shell compresses on contact; collision geometry stays perfectly circular.
  if (!reducedMotion && p.spark > 0) {
    const squash = Math.sin(Math.min(1, p.spark / .22) * Math.PI) * .08;
    c.scale(1 + squash, 1 - squash);
  }
  blob(c, 0, 6, CAR + 3, "#365260", 0);
  c.beginPath(); c.arc(0, 6, CAR + 1, .1, Math.PI - .1);
  c.strokeStyle = "#7e9ba3"; c.lineWidth = 2; c.stroke();
  blob(c, 0, 1, CAR + 1, "#f7fcfa", 0);
  c.beginPath(); c.arc(0, -2, CAR - 2, 0, TAU);
  c.fillStyle = toyFinish(c, 0, -2, CAR - 2, tint(p.color, .65), p.color, p.color); c.fill();
  c.beginPath(); c.arc(0, -2, CAR - 7, .15, Math.PI - .15); c.strokeStyle = "#ffffff60"; c.lineWidth = 2; c.stroke();
  c.beginPath(); c.ellipse(-8, -12, 9, 5, -.5, 0, TAU); c.fillStyle = tint(p.color, .55); c.fill();
  // A recessed seat, pearl helmet and front lamps read as a tiny bumper car.
  c.beginPath(); c.ellipse(0, -4, 19, 21, 0, 0, TAU); c.fillStyle = "#345463"; c.fill();
  for (const side of [-1, 1]) {
    c.save(); c.translate(side * 21, 10); c.rotate(side * -.35);
    c.beginPath(); c.roundRect(-4, -2, 8, 4, 2); c.fillStyle = "#fff3c2"; c.fill(); c.restore();
  }
  blob(c, 0, -6, 15, "#ffe1c4", 0);
  c.beginPath(); c.arc(0, -8, 15, Math.PI * 1.02, Math.PI * 1.98); c.lineTo(0, -8); c.closePath();
  c.fillStyle = toyFinish(c, 0, -8, 15, "#ffffff", "#eef6ef", "#a4c1c8"); c.fill();
  c.beginPath(); c.ellipse(0, -17, 3, 6, 0, 0, TAU); c.fillStyle = p.color; c.fill();
  face(c, 0, -3, 11, p.falling > 0 || p.spark > 0);
  c.beginPath(); c.ellipse(0, 15, 9, 5, 0, 0, TAU); c.strokeStyle = "#365260"; c.lineWidth = 3; c.stroke();
  for (const side of [-1, 1]) blob(c, side * 9, 13, 3, "#ffe1c4", 0);
  c.restore();
  if (p.cooldown > 0) { c.beginPath(); c.arc(0, 0, CAR + 6, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.cooldown / DASH_COOLDOWN)); c.strokeStyle = "#fffdf5"; c.lineWidth = 3; c.stroke(); }
  if (p.spark > 0) sparkle(c, 0, -CAR - 10, .8, "#ffe27a");
  if (!p.falling && distance(p, CENTER) > R - 42) {
    // A steady inward chevron makes recovery direction immediately clear.
    const angle = Math.atan2(CENTER.y - p.y, CENTER.x - p.x);
    c.save(); c.rotate(angle); c.beginPath(); c.moveTo(CAR + 18, -6); c.lineTo(CAR + 24, 0); c.lineTo(CAR + 18, 6);
    c.strokeStyle = "#bd633b"; c.lineWidth = 3; c.lineCap = "round"; c.stroke(); c.restore();
  }
  c.restore();
}
type Icon = (c: CanvasRenderingContext2D, x: number, y: number, s: number) => void;
/** A dark capsule with a little drawn icon and short text, from its left edge. */
function pill(c: CanvasRenderingContext2D, left: number, top: number, text: string, icon: Icon, ink = "#fff") {
  const size = 26, h = 42, s = 32, padX = 10, gap = 8;
  font(c, size, 700);
  const w = padX * 2 + s + gap + c.measureText(text).width + 2, y = top + h / 2;
  material(c, left, top, w, h, h / 2, true);
  icon(c, left + padX + s / 2, y, s);
  label(c, text, left + padX + s + gap, y + size * .36, size, ink, 700);
}
/** A tiny island with four arrows pointing in at it. */
function shrinkIcon(c: CanvasRenderingContext2D, x: number, y: number, s: number, alert: boolean) {
  c.beginPath(); c.arc(x, y, s * .2, 0, TAU); c.fillStyle = "#9fd290"; c.fill();
  c.strokeStyle = "#f3dfaa"; c.lineWidth = s * .08; c.stroke();
  c.fillStyle = alert ? ALERT : "#fffdf5";
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4, cx = Math.cos(a), cy = Math.sin(a), tip = s * .32, back = s * .52, wide = s * .13;
    c.beginPath(); c.moveTo(x + cx * tip, y + cy * tip);
    c.lineTo(x + cx * back - cy * wide, y + cy * back + cx * wide);
    c.lineTo(x + cx * back + cy * wide, y + cy * back - cx * wide); c.closePath(); c.fill();
  }
}
/** A lightning bolt, s tall, centered on (x, y). */
function bolt(c: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string, line = "") {
  const k = s / 26;
  c.beginPath(); c.moveTo(x + 3 * k, y - 13 * k); c.lineTo(x - 10 * k, y + 2 * k); c.lineTo(x - 1 * k, y + 2 * k);
  c.lineTo(x - 4 * k, y + 13 * k); c.lineTo(x + 11 * k, y - 3 * k); c.lineTo(x + 2 * k, y - 3 * k); c.closePath();
  c.fillStyle = fill; c.fill();
  if (line) { c.strokeStyle = line; c.lineWidth = 1.5; c.lineJoin = "round"; c.stroke(); }
}
