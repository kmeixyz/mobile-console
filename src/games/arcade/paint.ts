import { motionFrames } from "../render-motion";
import { blankInput, board, botLevel, clamp, distance, pointer, TAU, towards, turnTowards, type Engine, type Options, type Point } from "./types";
import { blob, face, material, outline, random, shadow, tint } from "./draw";
import { aimMark, toyFinish } from "../art";

// Paint Party: everyone drives a paint roller around the floor, covering it
// in their color. Tap to lob a paint bomb where you're pointing; it splats a
// big circle and makes anyone underneath skid. Most floor painted wins.
const MATCH = 30;
const BUCKET_INTERVAL = 5;
const CELL = 15;
const LEFT = 30, TOP = 30, COLS = 56, ROWS = 36; // 840 × 540 of floor
const BRUSH = 2.67, BIG_BRUSH = 4.5, SPLAT = 4.53;
const SIZE = 1.25; // roller scale; edges, bumping and pickups follow it
const EDGE = 14 * SIZE, BUMP = 40 * SIZE;
type Roller = Options["players"][number] & Point & {
  aim: Point; heading: number; cooldown: number; big: number; slow: number; target: Point; retarget: number;
};
type Bomb = Point & { from: Point; to: Point; age: number; owner: number };

/** Round the boundary, including inward corners, without blurring player colors. */
function paintShape(floor: Int8Array, owner: number) {
  type Edge = { x: number; y: number; direction: number; used: boolean };
  const edges: Edge[] = [], from = new Map<number, Edge[]>();
  const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const same = (x: number, y: number) => x >= 0 && x < COLS && y >= 0 && y < ROWS && floor[y * COLS + x] === owner;
  const add = (x: number, y: number, direction: number) => {
    const edge = { x, y, direction, used: false }, key = y * (COLS + 1) + x;
    edges.push(edge);
    const list = from.get(key);
    if (list) list.push(edge); else from.set(key, [edge]);
  };
  floor.forEach((value, i) => {
    if (value !== owner) return;
    const x = i % COLS, y = Math.floor(i / COLS);
    if (!same(x, y - 1)) add(x, y, 0);
    if (!same(x + 1, y)) add(x + 1, y, 1);
    if (!same(x, y + 1)) add(x + 1, y + 1, 2);
    if (!same(x - 1, y)) add(x, y + 1, 3);
  });
  const path = new Path2D();
  for (const first of edges) {
    if (first.used) continue;
    let points: Point[] = [];
    let edge: Edge | undefined = first;
    while (edge && !edge.used) {
      edge.used = true; points.push({ x: edge.x * CELL, y: edge.y * CELL });
      const [dx, dy] = directions[edge.direction];
      const choices: Edge[] = from.get((edge.y + dy) * (COLS + 1) + edge.x + dx) ?? [];
      const direction: number = edge.direction;
      // Keep diagonally touching islands separate; all contours retain their winding.
      edge = undefined;
      for (const turn of [1, 0, 3, 2]) {
        edge = choices.find(next => !next.used && next.direction === (direction + turn) % 4);
        if (edge) break;
      }
    }
    if (points.length < 3) continue;
    // A short local filter removes the cell staircase while keeping the edge crisp.
    for (let pass = 0; pass < 3; pass++) {
      points = points.map((point, i) => {
        const before = points[(i + points.length - 1) % points.length], after = points[(i + 1) % points.length];
        return { x: (before.x + point.x * 2 + after.x) / 4, y: (before.y + point.y * 2 + after.y) / 4 };
      });
    }
    const last = points[points.length - 1];
    path.moveTo((last.x + points[0].x) / 2, (last.y + points[0].y) / 2);
    points.forEach((point, i) => {
      const next = points[(i + 1) % points.length];
      path.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
    });
    path.closePath();
  }
  return path;
}

export function createPaint({ players, difficulty }: Options): Engine {
  const level = botLevel(difficulty);
  const rng = random(31);
  const floor = new Int8Array(COLS * ROWS).fill(-1);
  const starts = [{ x: 120, y: 110 }, { x: 780, y: 490 }, { x: 780, y: 110 }, { x: 120, y: 490 }];
  const rollers: Roller[] = players.map((p, i) => ({ ...p, ...starts[i], aim: { ...starts[i] }, heading: 0, cooldown: 1, big: 0, slow: 0, target: { x: 450, y: 300 }, retarget: 0 }));
  const motion = motionFrames<Roller>(["x", "y", "heading"], ["heading"]);
  let reducedMotion = false;
  const paints = rollers.map(p => tint(p.color, .24));
  const paintPaths: (Path2D | undefined)[] = players.map(() => undefined);
  const dirtyOwners = new Set<number>();
  const owned = players.map(() => 0);
  let bombs: Bomb[] = [];
  let splats: { x: number; y: number; age: number; color: string }[] = [];
  const buckets: Point[] = [];
  let nextBucket = BUCKET_INTERVAL;
  let noteUntil = 0;
  // Between events, the hint under the arena shows the controls.
  const DEFAULT = "";
  const note = (text: string) => { engine.message = text; noteUntil = engine.time + 2.2; };
  const counts = () => owned;
  const paintCircle = (p: Point, r: number, owner: number) => {
    const cx = (p.x - LEFT) / CELL, cy = (p.y - TOP) / CELL;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
      if ((x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 <= r * r && floor[y * COLS + x] !== owner) {
        const previous = floor[y * COLS + x];
        if (previous >= 0) { owned[previous]--; dirtyOwners.add(previous); }
        floor[y * COLS + x] = owner; owned[owner]++; dirtyOwners.add(owner);
      }
    }
  };
  const percent = (n: number) => Math.round(n / floor.length * 100);
  const engine: Engine = {
    id: "paint", time: 0, done: false, label: "Paint bomb", message: DEFAULT, hud: `${MATCH}s`, remaining: MATCH,
    setReducedMotion: value => { reducedMotion = value; },
    standings: () => { const n = counts(); return rollers.map((p, i) => ({ ...p, score: percent(n[i]), detail: `${n[i]} tiles` })); },
    step(dt, inputs) {
      if (engine.done || !Number.isFinite(dt) || dt <= 0) return;
      dt = Math.min(dt, MATCH - engine.time);
      motion.capture(rollers);
      engine.time += dt;
      // Drops follow the round clock, independently of when earlier buckets are collected.
      while (engine.time + 1e-9 >= nextBucket && nextBucket < MATCH) {
        buckets.push(nextBucket === BUCKET_INTERVAL ? { x: 450, y: 300 } : { x: 150 + rng() * 600, y: 120 + rng() * 360 });
        nextBucket += BUCKET_INTERVAL;
      }
      if (noteUntil && engine.time > noteUntil) { engine.message = DEFAULT; noteUntil = 0; }
      rollers.forEach((p, i) => {
        p.cooldown = Math.max(0, p.cooldown - dt); p.big = Math.max(0, p.big - dt); p.slow = Math.max(0, p.slow - dt);
        let throwBomb = false;
        if (p.bot) {
          p.retarget -= dt;
          if (p.retarget <= 0) { p.target = botTarget(i); p.retarget = 1.4 - level * .25; }
          p.aim = p.target;
          const rival = rollers.find((o, j) => j !== i && distance(o, p) < 230 && distance(o, p) > 80);
          if (p.cooldown === 0 && (rival || rng() < .01)) { p.aim = rival ? { x: rival.x, y: rival.y } : p.target; throwBomb = true; }
        } else { const input = inputs[i] ?? blankInput(); p.aim = pointer(input); throwBomb = input.tap; }
        const speed = (p.bot ? 150 + level * 20 : 200) * (p.slow > 0 ? .4 : 1);
        const before = { x: p.x, y: p.y };
        towards(p, p.bot ? p.target : p.aim, speed, dt);
        p.x = clamp(p.x, LEFT + EDGE, LEFT + COLS * CELL - EDGE); p.y = clamp(p.y, TOP + EDGE, TOP + ROWS * CELL - EDGE);
        if (distance(before, p) > .001) p.heading = turnTowards(p.heading, Math.atan2(p.y - before.y, p.x - before.x), dt);
        paintCircle(p, p.big > 0 ? BIG_BRUSH : BRUSH, i);
        if (throwBomb && p.cooldown === 0) {
          const dx = p.aim.x - p.x, dy = p.aim.y - p.y, d = Math.hypot(dx, dy) || 1, reach = Math.min(240, d);
          const to = { x: clamp(p.x + dx / d * reach, LEFT, LEFT + COLS * CELL), y: clamp(p.y + dy / d * reach, TOP, TOP + ROWS * CELL) };
          bombs.push({ x: p.x, y: p.y, from: { x: p.x, y: p.y }, to, age: 0, owner: i });
          p.cooldown = 3.2;
        }
        for (let bucket = buckets.length - 1; bucket >= 0; bucket--) {
          if (distance(p, buckets[bucket]) < 34 * SIZE) {
            p.big = 6;
            buckets.splice(bucket, 1);
            note(`${p.name} got the big roller!`);
          }
        }
      });
      // Rollers bump apart instead of overlapping.
      for (let i = 0; i < rollers.length; i++) for (let j = i + 1; j < rollers.length; j++) {
        const a = rollers[i], b = rollers[j], d = distance(a, b);
        if (d < BUMP) { const nx = d > .01 ? (b.x - a.x) / d : 1, ny = d > .01 ? (b.y - a.y) / d : 0; a.x -= nx * (BUMP - d) / 2; a.y -= ny * (BUMP - d) / 2; b.x += nx * (BUMP - d) / 2; b.y += ny * (BUMP - d) / 2; }
      }
      rollers.forEach(p => { p.x = clamp(p.x, LEFT + EDGE, LEFT + COLS * CELL - EDGE); p.y = clamp(p.y, TOP + EDGE, TOP + ROWS * CELL - EDGE); });
      for (const b of bombs) {
        b.age += dt;
        const t = Math.min(1, b.age / .55);
        b.x = b.from.x + (b.to.x - b.from.x) * t; b.y = b.from.y + (b.to.y - b.from.y) * t;
        if (t >= 1) {
          paintCircle(b.to, SPLAT, b.owner);
          splats.push({ x: b.to.x, y: b.to.y, age: 0, color: rollers[b.owner].color });
          rollers.forEach((r, j) => {
            if (j === b.owner || distance(r, b.to) > SPLAT * CELL) return;
            r.slow = 1; note(`${rollers[b.owner].name} splatted ${r.name}!`);
          });
        }
      }
      bombs = bombs.filter(b => b.age < .55);
      splats.forEach(s => { s.age += dt; }); splats = splats.filter(s => s.age < .6);
      engine.remaining = Math.max(0, MATCH - engine.time);
      engine.hud = `${Math.ceil(Math.max(0, MATCH - engine.time))}s`;
      if (engine.time >= MATCH) engine.done = true;
    },
    draw(c, w, h, interpolation = 1) {
      const displayed = motion.sample(rollers, interpolation);
      board(c, w, h, "#eaf0f2", () => {
        c.save(); c.shadowColor = "#304b6020"; c.shadowBlur = 22; c.shadowOffsetY = 9;
        c.beginPath(); c.roundRect(LEFT - 16, TOP - 16, COLS * CELL + 32, ROWS * CELL + 32, 26); c.fillStyle = "#ffffff"; c.fill(); c.restore();
        c.beginPath(); c.roundRect(LEFT - 5, TOP - 5, COLS * CELL + 10, ROWS * CELL + 10, 18); c.fillStyle = "#cad9df"; c.fill();
        c.beginPath(); c.roundRect(LEFT, TOP, COLS * CELL, ROWS * CELL, 14); c.fillStyle = "#fbfdfc"; c.fill();
        c.save(); c.beginPath(); c.roundRect(LEFT, TOP, COLS * CELL, ROWS * CELL, 14); c.clip();
        // Rebuild only changed ownership contours. Draw them at the display's
        // native resolution so curved paint edges stay crisp on large screens.
        for (const owner of dirtyOwners) paintPaths[owner] = paintShape(floor, owner);
        dirtyOwners.clear();
        c.translate(LEFT, TOP);
        paintPaths.forEach((path, owner) => {
          if (!path) return;
          c.fillStyle = paints[owner]; c.fill(path);
        });
        c.restore();
        for (const s of reducedMotion ? [] : splats) {
          c.globalAlpha = 1 - s.age / .6;
          // Rounded droplets expand out of the landing point, like wet paint.
          const spread = 30 + 60 * (1 - (1 - s.age / .6) ** 3);
          for (let k = 0; k < 9; k++) {
            const a = k * TAU / 9, r = (k % 3 + 3) * (1 - s.age / .6);
            blob(c, s.x + Math.cos(a) * spread, s.y + Math.sin(a) * spread, r, s.color, 0);
          }
          c.beginPath(); c.arc(s.x, s.y, spread * .7, 0, TAU);
          c.strokeStyle = "#ffffffbb"; c.lineWidth = 3 * (1 - s.age / .6); c.stroke(); c.globalAlpha = 1;
        }
        for (const can of buckets) {
          const bob = reducedMotion ? 0 : Math.sin(engine.time * 4) * 3;
          shadow(c, can.x, can.y + 18, 20, 6);
          c.beginPath(); c.roundRect(can.x - 16, can.y - 18 + bob, 32, 34, 6); c.fillStyle = "#e3e8ee"; c.fill(); outline(c, 3);
          c.beginPath(); c.ellipse(can.x, can.y - 18 + bob, 16, 6, 0, 0, TAU); c.fillStyle = "#ffd668"; c.fill(); outline(c, 2.5);
          c.beginPath(); c.arc(can.x, can.y - 22 + bob, 14, Math.PI, TAU); outline(c, 2.5);
        }
        for (const b of bombs) {
          const t = b.age / .55, lift = Math.sin(t * Math.PI) * 80;
          shadow(c, b.x, b.y + 6, 12, 5);
          blob(c, b.x, b.y - lift, 13, rollers[b.owner].color, 3);
          c.beginPath(); c.ellipse(b.x - 4, b.y - lift - 5, 4, 2.5, -.5, 0, TAU); c.fillStyle = "#ffffff99"; c.fill();
        }
        [...displayed].sort((a, b) => a.y - b.y).forEach(p => drawRoller(c, p));
        displayed.forEach(p => {
          if (p.bot) return;
          aimMark(c, p.aim.x, p.aim.y, 9, p.color, p.cooldown === 0);
          if (p.cooldown > 0) { c.beginPath(); c.arc(p.x, p.y - 40 * SIZE, 7, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.cooldown / 3.2)); c.strokeStyle = p.color; c.lineWidth = 3; c.stroke(); }
        });
        // Live share of the floor, as a strip across the top.
        const n = counts(), total = floor.length;
        let x = 300;
        material(c, 294, 4, 312, 20, 10);
        c.save(); c.beginPath(); c.roundRect(300, 9, 300, 10, 5); c.clip();
        c.fillStyle = "rgba(60, 60, 67, .12)"; c.fillRect(300, 9, 300, 10);
        rollers.forEach((p, i) => { const width = 300 * n[i] / total; if (width > 0) { c.fillStyle = p.color; c.fillRect(x, 9, width, 10); x += width; } });
        c.restore();

      });
    },
  };
  // Bots head for a nearby patch that isn't theirs yet; harder bots look
  // farther and prefer stealing a rival's paint.
  function botTarget(i: number): Point {
    const me = rollers[i];
    let best: Point = { x: 450, y: 300 }, bestScore = -Infinity;
    for (let k = 0; k < 14 + level * 8; k++) {
      const x = Math.floor(rng() * COLS), y = Math.floor(rng() * ROWS), v = floor[y * COLS + x];
      if (v === i) continue;
      const p = { x: LEFT + x * CELL + CELL / 2, y: TOP + y * CELL + CELL / 2 };
      const score = (v >= 0 ? .5 + level * .3 : 1) - distance(me, p) / 600;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }
  return engine;
}

function drawRoller(c: CanvasRenderingContext2D, p: Roller) {
  const big = p.big > 0 ? 1.35 : 1;
  shadow(c, p.x, p.y + 16 * SIZE, 24 * big * SIZE, 7 * SIZE);
  c.save(); c.translate(p.x, p.y); c.scale(SIZE, SIZE);
  // The roller drum lies across the direction of travel.
  c.save(); c.rotate(p.heading);
  // An exposed drum and a slim metal frame stay legible against wet paint.
  c.beginPath(); c.moveTo(8, 0); c.lineTo(16, 0); c.lineTo(16, -20 * big - 4); c.lineTo(25, -20 * big - 4); c.lineTo(25, -18 * big);
  c.strokeStyle = "#63828d"; c.lineWidth = 3; c.lineJoin = "round"; c.stroke();
  c.beginPath(); c.roundRect(19, -20 * big, 13, 40 * big, 6);
  const drum = c.createLinearGradient(19, 0, 32, 0);
  drum.addColorStop(0, tint(p.color, .3)); drum.addColorStop(.4, tint(p.color, .65)); drum.addColorStop(1, p.color);
  c.fillStyle = drum; c.fill();
  c.strokeStyle = "#fffdf5"; c.lineWidth = 1.5; c.stroke();
  c.restore();
  // A cream rim sets the roller apart from its own paint.
  blob(c, 0, 3, 23, "#47616f", 0);
  blob(c, 0, 0, 22, "#fffdf5", 0);
  c.beginPath(); c.arc(0, -2, 18, 0, TAU);
  c.fillStyle = toyFinish(c, 0, -2, 18, tint(p.color, .6), p.color, p.color); c.fill();
  c.beginPath(); c.arc(0, -2, 15, Math.PI * 1.12, Math.PI * 1.7); c.strokeStyle = "#ffffff80"; c.lineWidth = 1.5; c.stroke();
  face(c, 0, 0, 14, p.slow > 0);
  if (p.slow > 0) for (const [dx, dy] of [[-9, -12], [10, -8]]) blob(c, dx, dy, 4, p.color, 0);
  c.restore();
}
