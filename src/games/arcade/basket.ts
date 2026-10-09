import { blankInput, board, clamp, pointer, TAU, type Engine, type Options } from "./types";
import { blob, cloud, face, label, LABEL, material, outline, popText, random, shadow, sparkle } from "./draw";

// Basket Catch: a bunny slides a basket along the meadow to catch fruit
// falling from the trees. Mud balls splash and slow it down; golden stars
// glide across higher up, so it has to hop for them.
const ROUND = 60;
const GROUND = 520;
type Kind = "apple" | "pear" | "berry" | "star" | "mud";
const POINTS: Record<Kind, number> = { apple: 10, pear: 10, berry: 15, star: 50, mud: -10 };
type Drop = { kind: Kind; x: number; y: number; vx: number; vy: number; spin: number; done: boolean };
type Pop = { text: string; x: number; y: number; age: number; good: boolean };

export function createBasket({ players }: Options): Engine {
  const rng = random(17);
  let x = 450, hop = 0, hopSpeed = 0, score = 0, caught = 0, streak = 0, best = 0, muddy = 0, spawn = .6, starSpawn = 6, noteUntil = 0;
  let reducedMotion = false, hopBuffer = 0;
  let drops: Drop[] = [];
  let pops: Pop[] = [];
  const multiplier = () => 1 + Math.min(2, Math.floor(streak / 5));
  const note = (text: string) => { engine.message = text; noteUntil = engine.time + 2; };
  const DEFAULT = "Catch fruit. Avoid mud. Tap to hop.";
  const engine: Engine = {
    id: "basket", time: 0, done: false, label: "Hop", message: DEFAULT, hud: `${ROUND}s · 0 points`, remaining: ROUND,
    setReducedMotion: value => { reducedMotion = value; },
    standings: () => [{ ...players[0], score: Math.max(0, score), detail: `${caught} caught` }],
    step(dt, inputs) {
      if (engine.done || !Number.isFinite(dt) || dt <= 0) return;
      engine.time += dt;
      muddy = Math.max(0, muddy - dt);
      if (noteUntil && engine.time > noteUntil) { engine.message = DEFAULT; noteUntil = 0; }
      const input = inputs[0] ?? blankInput();
      // The basket follows the pointer, slower while it's covered in mud.
      const target = clamp(pointer(input).x, 80, 820);
      const speed = muddy > 0 ? 380 : 760;
      const previousRim = { x, y: GROUND - 46 - hop };
      x += clamp((target - x) * -Math.expm1(-24 * dt), -speed * dt, speed * dt);
      hopBuffer = input.tap ? .14 : Math.max(0, hopBuffer - dt);
      if (hopBuffer > 0 && hop === 0) { hopSpeed = 560; hopBuffer = 0; }
      if (hop > 0 || hopSpeed > 0) {
        hop += hopSpeed * dt; hopSpeed -= 1600 * dt;
        if (hop <= 0) { hop = 0; hopSpeed = 0; }
      }
      // Fruit falls faster, and more often, as the round goes on.
      const pace = Math.min(1, engine.time / ROUND);
      spawn -= dt;
      if (spawn <= 0) {
        spawn = (.85 - pace * .4) * (.6 + rng() * .7);
        const roll = rng();
        const kind: Kind = roll < .17 ? "mud" : roll < .35 ? "berry" : roll < .65 ? "pear" : "apple";
        drops.push({ kind, x: 90 + rng() * 720, y: -30, vx: (rng() - .5) * 30, vy: 140 + pace * 120 + rng() * 60, spin: rng() * TAU, done: false });
      }
      starSpawn -= dt;
      if (starSpawn <= 0) {
        starSpawn = 5 + rng() * 4;
        const left = rng() < .5;
        drops.push({ kind: "star", x: left ? -30 : 930, y: 360 + rng() * 30, vx: left ? 170 : -170, vy: 0, spin: 0, done: false });
      }
      const rim = { x, y: GROUND - 46 - hop };
      for (const d of drops) {
        const before = { x: d.x - previousRim.x, y: d.y - previousRim.y };
        if (d.kind === "star") { d.x += d.vx * dt; d.spin += dt; }
        else { d.vy += 90 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.spin += dt * 2; }
        if (d.done) continue;
        const after = { x: d.x - rim.x, y: d.y - rim.y };
        const t = Math.abs(after.y - before.y) > .001 ? clamp(-before.y / (after.y - before.y), 0, 1) : 1;
        const catchX = before.x + (after.x - before.x) * t;
        const catchY = before.y + (after.y - before.y) * t;
        if (Math.abs(catchX) < 62 && Math.abs(catchY) < 26) {
          d.done = true;
          if (d.kind === "mud") {
            score = Math.max(0, score + POINTS.mud); streak = 0; muddy = 1.6;
            pops.push({ text: "Splat!", x: d.x, y: rim.y - 170, age: 0, good: false });
            note("Yuck, mud!");
          } else {
            const points = POINTS[d.kind] * multiplier();
            score += points; caught++; streak++; best = Math.max(best, streak);
            pops.push({ text: `+${points}`, x: d.x, y: rim.y - 170, age: 0, good: true });
            if (streak % 5 === 0 && multiplier() > 1) note(`${streak} in a row! ×${multiplier()} points`);
            if (d.kind === "star") note(`Gold star! +${points}`);
          }
        } else if (d.kind !== "star" && d.y > GROUND + 10) {
          // A dropped fruit breaks the streak; a dodged mud ball doesn't.
          d.done = true;
          if (d.kind !== "mud") streak = 0;
        }
      }
      drops = drops.filter(d => !d.done && d.y < 640 && d.x > -60 && d.x < 960);
      pops.forEach(p => { p.age += dt; });
      pops = pops.filter(p => p.age < 1);
      engine.remaining = Math.max(0, ROUND - engine.time);
      engine.hud = `${Math.ceil(Math.max(0, ROUND - engine.time))}s · ${Math.max(0, score)} points`;
      if (engine.time >= ROUND) engine.done = true;
    },
    draw(c, w, h) {
      const artTime = reducedMotion ? 0 : engine.time;
      board(c, w, h, "#dceff8", () => {
        // Sky and meadow run past the board, so tall and wide screens show no bands.
        const sky = c.createLinearGradient(0, 0, 0, 400); sky.addColorStop(0, "#cfe9f6"); sky.addColorStop(1, "#eef8fb");
        c.fillStyle = "#cfe9f6"; c.fillRect(-600, -900, 2100, 900);
        c.fillStyle = sky; c.fillRect(-600, 0, 2100, 600);
        blob(c, 790, 80, 38, "#fff0bf", 0);
        cloud(c, 150 + Math.sin(artTime * .2) * 20, 80); cloud(c, 560 + Math.sin(artTime * .15 + 1) * 25, 60, .8);
        c.beginPath(); c.moveTo(-600, 400); c.quadraticCurveTo(-300, 330, 0, 420); c.quadraticCurveTo(220, 330, 450, 410); c.quadraticCurveTo(680, 330, 900, 400); c.quadraticCurveTo(1200, 330, 1500, 410); c.lineTo(1500, 1500); c.lineTo(-600, 1500); c.closePath();
        c.fillStyle = "#a6d7b1"; c.fill(); outline(c, 3);
        // Apple trees at both sides, where the fruit comes from.
        for (const tx of [70, 830]) {
          c.beginPath(); c.roundRect(tx - 14, 250, 28, 280, 8); c.fillStyle = "#b9805a"; c.fill(); outline(c, 3);
          for (const [dx, dy, r] of [[-60, 190, 70], [60, 190, 70], [0, 130, 82]]) blob(c, tx + dx, dy, r, "#86cb93", 3);
          for (const [dx, dy] of [[-50, 170], [30, 120], [55, 210], [-10, 200]]) blob(c, tx + dx, dy, 9, "#fa8878", 2);
        }
        c.fillStyle = "#94cb9c"; c.fillRect(-600, GROUND, 2100, 1000);
        c.beginPath(); c.moveTo(-600, GROUND); c.lineTo(1500, GROUND); outline(c, 3);
        for (let k = 0; k < 9; k++) {
          const fx = 40 + k * 105, fy = GROUND + 30 + (k % 2) * 22;
          blob(c, fx, fy, 5, ["#fa8878", "#ffd668", "#8e92dc"][k % 3], 0);
        }
        drops.forEach(d => drawDrop(c, reducedMotion ? { ...d, spin: 0 } : d, artTime));
        // The bunny and its basket.
        const y = GROUND - hop;
        shadow(c, x, GROUND + 6, 70 - hop * .15, 10);
        c.save(); c.translate(x, y);
        for (const side of [-1, 1]) {
          c.save(); c.translate(side * 18, -150); c.rotate(side * .15);
          c.beginPath(); c.ellipse(0, 0, 13, 36, 0, 0, TAU); c.fillStyle = "#fffaf0"; c.fill(); outline(c, 3);
          c.beginPath(); c.ellipse(0, 4, 6, 24, 0, 0, TAU); c.fillStyle = "#f5c7c3"; c.fill();
          c.restore();
        }
        blob(c, 0, -100, 40, "#fffaf0", 3);
        face(c, 0, -98, 34, muddy > 0);
        blob(c, -26, -88, 6, "#f7c9c3", 0); blob(c, 26, -88, 6, "#f7c9c3", 0);
        
        for (const side of [-1, 1]) blob(c, side * 58, -52, 11, "#fffaf0", 3);
        c.beginPath(); c.moveTo(-66, -50); c.lineTo(66, -50); c.lineTo(54, 0); c.quadraticCurveTo(0, 12, -54, 0); c.closePath();
        c.fillStyle = "#d49762"; c.fill(); outline(c, 3.5);
        c.save(); c.clip();
        c.strokeStyle = "#b07745"; c.lineWidth = 3;
        for (let k = -60; k <= 60; k += 16) { c.beginPath(); c.moveTo(k, -50); c.lineTo(k + 10, 10); c.stroke(); }
        for (let k = -40; k <= 0; k += 14) { c.beginPath(); c.moveTo(-66, k); c.lineTo(66, k); c.stroke(); }
        c.restore();
        c.beginPath(); c.roundRect(-70, -58, 140, 14, 7); c.fillStyle = "#e3a874"; c.fill(); outline(c, 3);
        if (muddy > 0) for (const [mx, my, mr] of [[-40, -30, 9], [8, -18, 7], [44, -34, 6]]) blob(c, mx, my, mr, "#8a6a52", 0);
        c.restore();
        pops.forEach(p => popText(c, p.text, p.x, p.y - (reducedMotion ? 0 : p.age * 24), 30, "#fff", 1 - p.age));
        if (multiplier() > 1) {
          material(c, 405, 18, 90, 40, 20);
          label(c, `×${multiplier()}`, 450, 45, 22, LABEL, 700, "center");
        }
      });
    },
  };
  return engine;
}

function drawDrop(c: CanvasRenderingContext2D, d: Drop, time: number) {
  c.save(); c.translate(d.x, d.y);
  if (d.kind === "star") {
    c.save(); c.rotate(Math.sin(d.spin * 3) * .2);
    c.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 13 : 30; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.fillStyle = "#ffd668"; c.fill(); outline(c, 3);
    face(c, 0, 2, 14);
    c.restore();
    sparkle(c, -36, -18 + Math.sin(time * 6) * 4, .5, "#fff3b0"); sparkle(c, 34, 16, .4, "#fff3b0");
  } else if (d.kind === "mud") {
    c.rotate(d.spin);
    c.beginPath();
    for (let k = 0; k < 9; k++) { const a = k * TAU / 9, r = k % 2 ? 19 : 24; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.fillStyle = "#8a6a52"; c.fill(); outline(c, 3);
    blob(c, -6, -6, 5, "#a5826a", 0);
  } else {
    c.rotate(Math.sin(d.spin) * .25);
    const color = d.kind === "apple" ? "#fa8878" : d.kind === "pear" ? "#9dc968" : "#f06f7f";
    if (d.kind === "pear") {
      // Outline the two overlapping circles as one shape: stroke wide, then fill over it.
      c.beginPath(); c.arc(0, 6, 22, 0, TAU); c.moveTo(14, -12); c.arc(0, -12, 14, 0, TAU);
      outline(c, 6); c.fillStyle = color; c.fill();
    } else if (d.kind === "berry") {
      c.beginPath(); c.moveTo(0, 24); c.quadraticCurveTo(-26, 2, -18, -14); c.quadraticCurveTo(0, -24, 18, -14); c.quadraticCurveTo(26, 2, 0, 24); c.closePath();
      c.fillStyle = color; c.fill(); outline(c, 3);
      c.fillStyle = "#ffe9a0"; for (const [sx, sy] of [[-8, 4], [8, 4], [0, 14], [-10, -6], [10, -6]]) { c.beginPath(); c.arc(sx, sy, 1.8, 0, TAU); c.fill(); }
    } else blob(c, 0, 0, 23, color, 3);
    c.beginPath(); c.moveTo(0, -20); c.quadraticCurveTo(-3, -30, 4, -34); outline(c, 3);
    c.beginPath(); c.ellipse(10, -28, 9, 5, -.5, 0, TAU); c.fillStyle = "#65a77d"; c.fill(); outline(c, 2.5);
    if (d.kind !== "berry") face(c, 0, d.kind === "pear" ? 6 : 2, 16);
  }
  c.restore();
}
