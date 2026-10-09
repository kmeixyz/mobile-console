import { blankInput, board, distance, pointer, TAU, type Engine, type Options, type Point } from "./types";
import { blob, face, label, material, outline, popText, random, sparkle } from "./draw";

// Flashlight Hunt: a garden at night. Critters peek out of bushes, logs, tree
// holes and the pond; only their eyes glint in the dark. Sweep the flashlight
// to find one, and tap Snap to take its photo before it hides again.
const BATTERY = 60;
const BEAM = 92;
type Kind = "owl" | "frog" | "hedgehog" | "fox" | "bunny" | "raccoon" | "firefly";
const CRITTERS: Record<Kind, { points: number; name: string }> = {
  owl: { points: 30, name: "owl" }, frog: { points: 15, name: "frog" }, hedgehog: { points: 15, name: "hedgehog" },
  fox: { points: 20, name: "fox" }, bunny: { points: 10, name: "bunny" }, raccoon: { points: 20, name: "raccoon" },
  firefly: { points: 50, name: "golden firefly" },
};
type Spot = Point & { cover: "bush" | "log" | "tree" | "pond" | "grass"; kinds: Kind[] };
const SPOTS: Spot[] = [
  { x: 150, y: 430, cover: "bush", kinds: ["fox", "bunny"] },
  { x: 380, y: 470, cover: "bush", kinds: ["bunny", "hedgehog"] },
  { x: 700, y: 455, cover: "bush", kinds: ["fox", "bunny"] },
  { x: 255, y: 520, cover: "log", kinds: ["raccoon", "hedgehog"] },
  { x: 560, y: 535, cover: "log", kinds: ["raccoon", "hedgehog"] },
  { x: 120, y: 205, cover: "tree", kinds: ["owl"] },
  { x: 790, y: 190, cover: "tree", kinds: ["owl"] },
  { x: 470, y: 380, cover: "pond", kinds: ["frog"] },
  { x: 610, y: 390, cover: "pond", kinds: ["frog"] },
  { x: 840, y: 520, cover: "grass", kinds: ["hedgehog", "bunny"] },
];
type Critter = { spot: number; kind: Kind; shown: number; until: number; lit: number; snapped: number };

export function createFlashlight({ players }: Options): Engine {
  const rng = random(23);
  let reducedMotion = false;
  let critters: Critter[] = [];
  let beam: Point = { x: 450, y: 300 };
  let score = 0, photos = 0, flash = 0, cooldown = 0, spawn = .8, noteUntil = 0;
  const album = new Set<Kind>();
  // The golden firefly drifts around the garden instead of hiding in one spot.
  const firefly = { x: 450, y: 200, until: 0, next: 12 + rng() * 8, snapped: 0 };
  let pops: { text: string; x: number; y: number; age: number }[] = [];
  const DEFAULT = "Find critters. Tap to snap.";
  const note = (text: string) => { engine.message = text; noteUntil = engine.time + 2; };
  const spotPoint = (c: Critter) => SPOTS[c.spot];
  const engine: Engine = {
    id: "flashlight", time: 0, done: false, label: "Snap", message: DEFAULT, hud: `${BATTERY}s battery · 0 points`, remaining: BATTERY,
    setReducedMotion: value => { reducedMotion = value; },
    standings: () => [{ ...players[0], score, detail: `${photos} photos` }],
    step(dt, inputs) {
      if (engine.done || !Number.isFinite(dt) || dt <= 0) return;
      engine.time += dt;
      flash = Math.max(0, flash - dt); cooldown = Math.max(0, cooldown - dt);
      if (noteUntil && engine.time > noteUntil) { engine.message = DEFAULT; noteUntil = 0; }
      const input = inputs[0] ?? blankInput();
      const target = pointer(input), follow = -Math.expm1(-32 * dt);
      beam.x += (target.x - beam.x) * follow; beam.y += (target.y - beam.y) * follow;
      // A critter peeks out of a free hiding spot every so often.
      spawn -= dt;
      const busy = new Set(critters.map(c => c.spot));
      if (spawn <= 0 && critters.length < 3) {
        spawn = 1.2 + rng() * 1.6;
        const free = SPOTS.map((_, i) => i).filter(i => !busy.has(i));
        if (free.length) {
          const spot = free[Math.floor(rng() * free.length)];
          const kinds = SPOTS[spot].kinds;
          critters.push({ spot, kind: kinds[Math.floor(rng() * kinds.length)], shown: engine.time, until: engine.time + 3.5 + rng() * 2.5, lit: 0, snapped: 0 });
        }
      }
      // Critters in the light freeze for a moment, then get shy and hide.
      for (const c of critters) {
        if (distance(spotPoint(c), beam) < BEAM) { c.lit += dt; if (c.lit > 2.2) c.until = Math.min(c.until, engine.time + .3); }
      }
      if (firefly.until > engine.time) {
        const t = engine.time * .6;
        firefly.x = 450 + Math.sin(t * 1.3) * 320; firefly.y = 230 + Math.sin(t * 2.1) * 110;
      } else if (engine.time > firefly.next) {
        firefly.until = engine.time + 7; firefly.next = engine.time + 18 + rng() * 6; firefly.snapped = 0;
        note("A golden firefly!");
      }
      if (input.tap && cooldown === 0) {
        flash = .25; cooldown = .45;
        const inBeam = critters.filter(c => !c.snapped && c.until > engine.time && distance(spotPoint(c), beam) < BEAM).sort((a, b) => distance(spotPoint(a), beam) - distance(spotPoint(b), beam))[0];
        const fireflyLit = firefly.until > engine.time && !firefly.snapped && distance(firefly, beam) < BEAM;
        if (fireflyLit) {
          firefly.snapped = engine.time; firefly.until = engine.time + .6;
          score += CRITTERS.firefly.points; photos++; album.add("firefly");
          pops.push({ text: `+${CRITTERS.firefly.points}`, x: firefly.x, y: firefly.y - 30, age: 0 });
          note("Golden firefly! +50");
        } else if (inBeam) {
          inBeam.snapped = engine.time; inBeam.until = engine.time + .7;
          const info = CRITTERS[inBeam.kind], first = !album.has(inBeam.kind);
          const points = info.points + (first ? 10 : 0);
          score += points; photos++; album.add(inBeam.kind);
          const p = spotPoint(inBeam);
          pops.push({ text: `+${points}`, x: p.x, y: p.y - 60, age: 0 });
          note(`${info.name[0].toUpperCase()}${info.name.slice(1)}! +${points}`);
        } else note("Look for glowing eyes");
      }
      critters = critters.filter(c => c.until > engine.time);
      pops.forEach(p => { p.age += dt; }); pops = pops.filter(p => p.age < 1);
      engine.remaining = Math.max(0, BATTERY - engine.time);
      engine.hud = `${Math.ceil(Math.max(0, BATTERY - engine.time))}s battery · ${score} points`;
      if (engine.time >= BATTERY) engine.done = true;
    },
    draw(c, w, h) {
      board(c, w, h, "#2d3c69", () => {
        // The dark only covers the garden, so nothing may spill past its edges.
        c.beginPath(); c.rect(0, 0, 900, 600); c.clip();
        const artTime = reducedMotion ? 0 : engine.time;
        garden(c, artTime);
        // Critters, behind or inside their hiding spots.
        for (const cr of critters) {
          const p = spotPoint(cr), age = engine.time - cr.shown, left = cr.until - engine.time;
          const peek = Math.min(1, age * 3, left * 3);
          drawCritter(c, cr.kind, p, peek, !!cr.snapped);
        }
        if (firefly.until > engine.time) {
          c.save(); c.globalAlpha = Math.min(1, (firefly.until - engine.time) * 2);
          blob(c, firefly.x, firefly.y, 26, "#fff3b066", 0);
          blob(c, firefly.x, firefly.y, 10, "#ffd668", 2.5); face(c, firefly.x, firefly.y, 9);
          for (const s of [-1, 1]) { c.beginPath(); c.ellipse(firefly.x + s * 12, firefly.y - 8, 9, 5, s * .5, 0, TAU); c.fillStyle = "#ffffffaa"; c.fill(); outline(c, 1.5); }
          c.restore();
        }
        // The dark, with a soft hole where the flashlight shines.
        const dark = c.createRadialGradient(beam.x, beam.y, BEAM * .7, beam.x, beam.y, BEAM * 1.25);
        dark.addColorStop(0, "rgba(30, 40, 80, 0)"); dark.addColorStop(1, "rgba(30, 40, 80, .72)");
        c.fillStyle = dark; c.beginPath(); c.rect(0, 0, 900, 600); c.arc(beam.x, beam.y, BEAM * 1.25, 0, TAU, true); c.fill("evenodd");
        c.beginPath(); c.arc(beam.x, beam.y, BEAM * 1.25, 0, TAU); c.fill();
        const warm = c.createRadialGradient(beam.x, beam.y, 0, beam.x, beam.y, BEAM);
        warm.addColorStop(0, "rgba(255, 240, 190, .18)"); warm.addColorStop(1, "rgba(255, 240, 190, 0)");
        c.fillStyle = warm; c.beginPath(); c.arc(beam.x, beam.y, BEAM, 0, TAU); c.fill();
        // Eyes glint in the dark: the hint of where to look.
        for (const cr of critters) {
          const p = spotPoint(cr);
          if (cr.snapped || distance(p, beam) < BEAM) continue;
          const eye = eyeOffset(cr.kind);
          for (const s of [-1, 1]) blob(c, p.x + s * eye.dx, p.y + eye.dy, 3.5, "#ffe27a", 0);
        }
        // Little fireflies drifting about, glowing through the dark.
        for (let k = 0; k < 14; k++) {
          const fx = (k * 137 + Math.sin(artTime * .5 + k) * 60 + 900) % 900, fy = 120 + (k * 71) % 380 + Math.cos(artTime * .7 + k) * 20;
          c.globalAlpha = .4 + .4 * Math.sin(artTime * 3 + k); blob(c, fx, fy, 3, "#fff3b0", 0); c.globalAlpha = 1;
        }
        c.beginPath(); c.arc(beam.x, beam.y, BEAM, 0, TAU); c.strokeStyle = "#fff3b055"; c.lineWidth = 3; c.stroke();
        if (flash > 0) { c.beginPath(); c.arc(beam.x, beam.y, BEAM * (reducedMotion ? 1 : 1.1 - flash * .4), 0, TAU); c.strokeStyle = `rgba(255, 244, 211, ${flash * 3})`; c.lineWidth = 4; c.stroke(); }
        pops.forEach(p => popText(c, p.text, p.x, p.y - (reducedMotion ? 0 : p.age * 24), 30, "#ffe9a0", 1 - p.age));
        // The photo album: one slot for each kind of critter.
        material(c, 258, 546, 384, 46, 23);
        (Object.keys(CRITTERS) as Kind[]).forEach((kind, k) => {
          const x = 290 + k * 53, y = 570;
          if (album.has(kind)) { c.save(); c.translate(x, y); c.scale(.36, .36); drawCritter(c, kind, { x: 0, y: 18 }, 1, false, true); c.restore(); }
          else { blob(c, x, y, 14, "#e5e5ea", 0); label(c, "?", x, y + 5.5, 15, "#8e8e93", 600, "center"); }
        });
      });
    },
  };
  return engine;
}

function eyeOffset(kind: Kind) {
  return kind === "owl" ? { dx: 9, dy: -14 } : kind === "frog" ? { dx: 10, dy: -16 } : { dx: 7, dy: -18 };
}
/** The night garden: moon, trees with holes, a pond, bushes and logs. */
function garden(c: CanvasRenderingContext2D, time: number) {
  const sky = c.createLinearGradient(0, 0, 0, 360); sky.addColorStop(0, "#3f5585"); sky.addColorStop(1, "#6580ab");
  c.fillStyle = sky; c.fillRect(0, 0, 900, 600);
  blob(c, 650, 80, 34, "#fff6d8", 0); blob(c, 664, 72, 30, "#46609a", 0);
  for (let k = 0; k < 18; k++) sparkle(c, (k * 211) % 900, 20 + (k * 53) % 150, .18 + (k % 3) * .06, `rgba(255, 246, 216, ${.5 + .4 * Math.sin(time * 2 + k)})`);
  c.beginPath(); c.moveTo(0, 330); c.quadraticCurveTo(250, 270, 480, 320); c.quadraticCurveTo(700, 280, 900, 310); c.lineTo(900, 600); c.lineTo(0, 600); c.closePath();
  c.fillStyle = "#5f9a78"; c.fill(); outline(c, 3);
  // Trees with owl holes.
  for (const [tx, ty] of [[120, 205], [790, 190]]) {
    c.beginPath(); c.roundRect(tx - 26, ty - 20, 52, 400, 12); c.fillStyle = "#8a6247"; c.fill(); outline(c, 3);
    for (const [dx, dy, r] of [[-55, -90, 62], [55, -90, 62], [0, -140, 72]]) blob(c, tx + dx, ty + dy, r, "#4f8a6a", 3);
    c.beginPath(); c.ellipse(tx, ty, 18, 24, 0, 0, TAU); c.fillStyle = "#3b2a22"; c.fill(); outline(c, 2.5);
  }
  // The pond.
  c.beginPath(); c.ellipse(540, 395, 150, 46, 0, 0, TAU); c.fillStyle = "#4f86a8"; c.fill(); outline(c, 3);
  c.strokeStyle = "#ffffff40"; c.lineWidth = 3; for (const x of [470, 590]) { c.beginPath(); c.moveTo(x - 20, 390); c.lineTo(x + 20, 390); c.stroke(); }
  for (const [x, y] of [[440, 405], [640, 400]]) { c.beginPath(); c.ellipse(x, y, 22, 8, 0, .4, TAU - .2); c.lineTo(x, y); c.fillStyle = "#6fb07d"; c.fill(); outline(c, 2); }
}
/** A critter peeking out of its spot; `peek` slides it up from cover. */
function drawCritter(c: CanvasRenderingContext2D, kind: Kind, p: Point, peek: number, snapped: boolean, icon = false) {
  const rise = (1 - peek) * 40;
  c.save(); c.translate(p.x, p.y);
  if (!icon) { c.beginPath(); c.rect(-80, -140, 160, 140 + (kind === "owl" ? 30 : 0)); c.clip(); }
  c.translate(0, rise);
  const body: Record<Exclude<Kind, "firefly">, string> = { owl: "#b98a63", frog: "#7cc08b", hedgehog: "#a07a5a", fox: "#f39a5b", bunny: "#e8e2da", raccoon: "#9aa3ab" };
  if (kind === "firefly") { blob(c, 0, -20, 12, "#ffd668", 2.5); face(c, 0, -20, 11); c.restore(); return; }
  if (kind === "owl") {
    blob(c, 0, -6, 20, body.owl, 2.5);
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 8, -22); c.lineTo(s * 16, -32); c.lineTo(s * 18, -18); c.fillStyle = body.owl; c.fill(); outline(c, 2); }
    for (const s of [-1, 1]) blob(c, s * 9, -12, 8, "#fff6e0", 2);
    face(c, 0, -10, 22, snapped);
    c.beginPath(); c.moveTo(-3, -4); c.lineTo(3, -4); c.lineTo(0, 1); c.closePath(); c.fillStyle = "#f6b753"; c.fill();
  } else if (kind === "frog") {
    c.beginPath(); c.ellipse(0, -8, 24, 16, 0, 0, TAU); c.fillStyle = body.frog; c.fill(); outline(c, 2.5);
    for (const s of [-1, 1]) blob(c, s * 10, -20, 8, body.frog, 2.5);
    face(c, 0, -14, 26, snapped);
  } else {
    if (kind === "bunny") for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 9, -44, 6, 16, s * .2, 0, TAU); c.fillStyle = body.bunny; c.fill(); outline(c, 2.5); }
    if (kind === "fox") for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 6, -34); c.lineTo(s * 18, -46); c.lineTo(s * 20, -24); c.fillStyle = body.fox; c.fill(); outline(c, 2.5); }
    if (kind === "hedgehog") { c.beginPath(); for (let k = 0; k < 9; k++) { const a = Math.PI + k * Math.PI / 8; c.lineTo(Math.cos(a) * (k % 2 ? 22 : 28), -14 + Math.sin(a) * (k % 2 ? 20 : 26)); } c.fillStyle = "#6f5440"; c.fill(); outline(c, 2.5); }
    blob(c, 0, -16, 20, body[kind], 2.5);
    if (kind === "raccoon") { c.beginPath(); c.ellipse(0, -18, 17, 7, 0, 0, TAU); c.fillStyle = "#3e4a55"; c.fill(); }
    if (kind === "fox") { c.beginPath(); c.ellipse(0, -8, 11, 8, 0, 0, TAU); c.fillStyle = "#fff6e0"; c.fill(); }
    face(c, 0, -16, 20, snapped);
  }
  if (snapped && !icon) { c.restore(); c.save(); c.translate(p.x, p.y - 64); popHeart(c); }
  c.restore();
  if (!icon) cover(c, kind, p);
}
function popHeart(c: CanvasRenderingContext2D) {
  c.beginPath(); c.moveTo(0, 8); c.bezierCurveTo(-16, -4, -8, -16, 0, -8); c.bezierCurveTo(8, -16, 16, -4, 0, 8);
  c.fillStyle = "#fa8878"; c.fill(); outline(c, 2);
}
/** The bush, log or grass in front of a critter's spot. */
function cover(c: CanvasRenderingContext2D, kind: Kind, p: Point) {
  const spot = SPOTS.find(s => s.x === p.x && s.y === p.y);
  if (!spot) return;
  if (spot.cover === "bush") for (const [dx, dy, r] of [[-28, 4, 24], [28, 4, 24], [0, -6, 28]]) blob(c, p.x + dx, p.y + dy, r, "#5e9c74", 3);
  if (spot.cover === "log") {
    c.beginPath(); c.roundRect(p.x - 52, p.y - 14, 104, 32, 16); c.fillStyle = "#9b6e4f"; c.fill(); outline(c, 3);
    c.beginPath(); c.ellipse(p.x + 46, p.y + 2, 9, 15, 0, 0, TAU); c.fillStyle = "#d9a679"; c.fill(); outline(c, 2.5);
  }
  if (spot.cover === "grass") for (let k = -3; k <= 3; k++) { c.beginPath(); c.moveTo(p.x + k * 9, p.y + 8); c.quadraticCurveTo(p.x + k * 11, p.y - 14, p.x + k * 13, p.y - 24); outline(c, 3); c.strokeStyle = "#7cc08b"; c.lineWidth = 2; c.stroke(); }
  if (spot.cover === "pond" && kind === "frog") { c.beginPath(); c.ellipse(p.x, p.y + 4, 30, 9, 0, 0, TAU); c.fillStyle = "#6fb07d"; c.fill(); outline(c, 2.5); }
}
