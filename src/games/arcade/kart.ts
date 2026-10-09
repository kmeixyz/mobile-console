import { motionFrames } from "../render-motion";
import { blankInput, botLevel, clamp, INK, roundRect, TAU, type Engine, type Options, type Player } from "./types";

import { canRam, crossesPoint, crossingTime, forwardGap, projectileTouches, protectedFromHit, trackGap, steerToward } from "./kart-rules";
import { drawKartViews, kartPanel, kartScale } from "./kart-views";
import { ordinal } from "../../lib/store";
import { font, headline, label, toast } from "./draw";

// A ground-hugging arcade racer. Project world positions before drawing: interpolating
// screen coordinates makes nearby karts pulse in size at every segment boundary.
const SEG = 20; // length of one road segment
const RW = 26; // half the road's width: five lanes
const CH = 24; // camera height above the road
const KART_Z = 36; // how far ahead of the camera the kart sits
const DRAW = 48; // segments drawn ahead
const CURVE = .45; // how far a bend moves the road per segment
const GRAVITY = 180;
const LAPS = 3;
const TOP_SPEED = 150;
/** Lane centers, as fractions of the road's half-width. */
const LANES = [-.8, -.4, 0, .4, .8];
/** How far off the road a kart can go before the fence stops it. */
const EDGE = 1.4;
const KART_WIDTH = .37; // a kart's width in the same units, a bit under a lane

type Scenery = "tree" | "pine" | "bush" | "flowers" | "sign-left" | "sign-right" | "balloons" | "arch" | "palm" | "crystal" | "tower" | "danger" | "portal" | "pylon";
type Zone = "festival" | "orchard" | "coast" | "frost" | "foundry" | "meadow" | "skyway";
const ZONES: Record<Zone, { name: string; grass: string; verge: string; road: string; stripe: string }> = {
  festival: { name: "Festival Circuit", grass: "#b9dfbb", verge: "#b6dcba", road: "#627c87", stripe: "#ff8c78" },
  orchard: { name: "Alpine Switchbacks", grass: "#85c6a0", verge: "#81c29c", road: "#627982", stripe: "#f2c65e" },
  coast: { name: "Cliffside Coast", grass: "#f1dfb0", verge: "#eddbac", road: "#889a9e", stripe: "#40c1c4" },
  frost: { name: "Summit Run", grass: "#e0eff4", verge: "#cfdfec", road: "#85aaba", stripe: "#8f9ddd" },
  foundry: { name: "Crystal Tunnel", grass: "#778899", verge: "#6f8091", road: "#546574", stripe: "#ffc657" },
  meadow: { name: "Waterfall Viaduct", grass: "#a9d782", verge: "#98c870", road: "#7b9492", stripe: "#f6a3a8" },
  skyway: { name: "Eagle Ridge", grass: "#b1a7d8", verge: "#a399ce", road: "#8a8fa8", stripe: "#ffd27c" },
};
type Obstacle = { lane: number; kind: "cone" | "hay" | "barrel" | "oil"; down: number };
type Box = { lane: number; ready: number };
type Terrain = "ground" | "cliff" | "bridge" | "tunnel";
type Segment = {
  curve: number; y1: number; y2: number; zone: Zone;
  terrain: Terrain; width: number; cliffSide: number; hole?: { lane: number; width: number }; gap?: boolean; launch?: number; warning?: string;
  scenery: { kind: Scenery; offset: number }[];
  obstacles: Obstacle[]; boxes: Box[]; coins: number[];
  coinHeight?: number; ramp?: boolean; pad?: number; sheep?: number; sweeper?: number; boulder?: number; shortcut?: number;
};

// A small seeded random generator keeps the track's dressing, and races
// between bots, the same every time.
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTrack() {
  const track: Segment[] = [];
  const rng = random(11);
  let height = 0;
  const section = (zone: Zone, n: number, curve: number, rise: number, terrain: Terrain, width: number, dress?: (s: Segment, k: number) => void) => {
    const start = height;
    const at = (k: number) => start + rise * (1 - Math.cos(Math.PI * k / n)) / 2;
    for (let k = 0; k < n; k++) {
      const s: Segment = { zone, terrain, width, cliffSide: curve < 0 ? -1 : 1, curve: curve * Math.sin(Math.PI * (k + .5) / n), y1: at(k), y2: at(k + 1), scenery: [], obstacles: [], boxes: [], coins: [] };
      const side = terrain === "cliff" ? s.cliffSide : track.length % 2 ? 1 : -1;
      const kind: Scenery = zone === "coast" ? "palm" : zone === "frost" || terrain === "tunnel" ? "crystal" : rng() < .5 ? "tree" : "pine";
      if (terrain === "ground" && k % 2 === 0 || terrain === "cliff" && k % 4 === 0)
        s.scenery.push({ kind, offset: side * (width + .8 + rng() * .8) });
      if (terrain === "tunnel" && k % 4 === 0) s.scenery.push({ kind: "crystal", offset: side * (width + .25) });
      if (terrain === "bridge" && k % 6 === 0) s.scenery.push({ kind: "pylon", offset: 0 });
      if (Math.abs(curve) >= 4 && k % 4 === 0)
        s.scenery.push({ kind: curve > 0 ? "sign-right" : "sign-left", offset: (curve > 0 ? -1 : 1) * (width + .2) });
      dress?.(s, k); track.push(s);
    }
    height = start + rise;
  };
  const boxes = (s: Segment) => { s.boxes = [-.55, 0, .55].map(lane => ({ lane: lane * s.width, ready: 0 })); };
  const obstacle = (s: Segment, kind: Obstacle["kind"], ...lanes: number[]) => { s.obstacles = lanes.map(lane => ({ kind, lane, down: 0 })); };
  section("festival", 16, 0, 0, "ground", 1, (s, k) => {
    if (k === 0) s.scenery = [{ kind: "balloons", offset: -1.7 }, { kind: "balloons", offset: 1.7 }];
    if (k === 6) boxes(s);
    if (k > 8 && k < 14) s.coins = [-.4, .4];
    if (k === 14) s.pad = 0;
  });
  // Climb into the mountains on alternating hairpins.
  section("orchard", 18, 6, 35, "ground", 1, (s, k) => {
    if (k > 2 && k < 15) s.coins = [.4];
    if (k === 8 || k === 9) s.hole = { lane: -.45, width: .35 };
    if (k === 14) boxes(s);
  });
  section("orchard", 14, -7, 25, "cliff", .9, (s, k) => {
    if (k > 2 && k < 11) s.coins = [-.4];
    if (k === 6 || k === 7) s.hole = { lane: .4, width: .35 };
    if (k === 10) s.pad = -.4;
  });
  section("coast", 16, 4.5, 20, "cliff", .85, (s, k) => {
    if (k === 2) boxes(s);
    if (k === 7) obstacle(s, "barrel", -.4);
    if (k > 4 && k < 14) s.coins = [.4];
    if (k === 12 || k === 13) s.hole = { lane: -.45, width: .32 };
  });
  // A suspension bridge with a broken span. The launch is automatic and
  // guarantees enough takeoff speed even after a collision on the approach.
  section("coast", 12, -2, 10, "bridge", .72, (s, k) => {
    if (k === 2) { s.ramp = true; s.launch = 82; }
    if (k === 4 || k === 5) { s.gap = true; s.scenery = []; }
    if (k > 2 && k < 7) { s.coins = [-.3, 0, .3]; s.coinHeight = 10; }
    if (k === 9) boxes(s);
  });
  section("frost", 18, 8, 50, "cliff", .85, (s, k) => {
    if (k === 1) boxes(s);
    if (k === 7 || k === 13) s.boulder = k;
    if (k > 3 && k < 15) s.coins = [.3];
  });
  section("frost", 14, -7.5, -15, "cliff", .8, (s, k) => {
    if (k === 4) s.pad = -.3;
    if (k === 7 || k === 8) s.hole = { lane: .35, width: .32 };
    if (k > 3 && k < 11) s.coins = [-.35];
  });
  section("foundry", 16, 2.5, -20, "tunnel", .82, (s, k) => {
    if (k === 0 || k === 15) s.scenery.push({ kind: "portal", offset: 0 });
    if (k === 2 || k === 13) boxes(s);
    if (k === 7) s.sweeper = k;
    if (k === 10) obstacle(s, "oil", -.45);
    if (k > 3 && k < 12) s.coins = [.35];
  });
  section("meadow", 18, -5, -25, "bridge", .75, (s, k) => {
    if (k === 2) boxes(s);
    if (k === 6 || k === 7) s.hole = { lane: -.35, width: .3 };
    if (k > 3 && k < 15) s.coins = [.35];
    if (k === 12) s.pad = .35;
  });
  section("skyway", 18, 7, 25, "cliff", .9, (s, k) => {
    if (k === 2) boxes(s);
    if (k === 5) s.pad = .35;
    if (k === 11) { s.ramp = true; s.launch = 88; }
    if (k === 13 || k === 14 || k === 15) { s.gap = true; s.scenery = []; }
    if (k >= 11) { s.coins = [0, .35]; s.coinHeight = 12; }
  });
  section("skyway", 16, -6, -65, "cliff", .95, (s, k) => {
    if (k < 2) { s.coins = [0, .35]; s.coinHeight = 8; }
    if (k > 3 && k < 12) s.coins = [-.4];
    if (k === 8 || k === 9) s.hole = { lane: .45, width: .35 };
    if (k === 12) boxes(s);
  });
  section("festival", 18, 3, -40, "ground", 1, (s, k) => {
    // A fast dirt shoulder rewards racers who spot the final shortcut.
    if (k > 2 && k < 13) { s.shortcut = -1; s.coins = [-1.22]; }
    if (k === 6) s.pad = -1.22;
    if (k === 13) s.pad = 0;
    if (k > 13) s.scenery.push({ kind: "balloons", offset: k % 2 ? -1.8 : 1.8 });
    if (k === 17) s.scenery.push({ kind: "arch", offset: 0 });
  });
  // Warn before the first segment of every hole, with enough sight distance
  // to choose a lane. Repeated hole segments share one approach warning.
  track.forEach((s, i) => {
    const previous = track[(i - 1 + track.length) % track.length];
    if ((!s.hole || previous.hole) && (!s.gap || previous.gap)) return;
    const warning = s.gap ? "Canyon jump · Stay on the ramp" : `Hole ahead · Keep ${s.hole!.lane < 0 ? "right" : "left"}`;
    for (let n = 1; n <= 4; n++) {
      const approach = track[(i - n + track.length) % track.length];
      approach.warning = warning;
      if (n === 3) for (const side of [-1, 1]) approach.scenery.push({ kind: "danger", offset: side * (approach.width + .22) });
    }
  });
  return track;
}
const TRACK = buildTrack();
/** Mixes two #rrggbb colors. */
function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) + (((pb >> shift) & 255) - ((pa >> shift) & 255)) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}
// Each segment's colors, blended over a few segments either side of a zone
// change so the road and grass don't snap from one district to the next.
const BLEND = 6;
const PALETTES = TRACK.map((seg, i) => {
  const own = ZONES[seg.zone];
  let toward = own, t = 0;
  for (let j = 1; j <= BLEND; j++) {
    const ahead = TRACK[(i + j) % TRACK.length].zone;
    if (ahead !== seg.zone) { toward = ZONES[ahead]; t = .5 * (1 - (j - 1) / BLEND); break; }
    const behind = TRACK[(i - j + 1 + TRACK.length) % TRACK.length], before = TRACK[(i - j + TRACK.length) % TRACK.length].zone;
    if (behind.zone === seg.zone && before !== seg.zone) { toward = ZONES[before]; t = .5 * (1 - j / BLEND); break; }
  }
  const blend = (key: "grass" | "verge" | "road" | "stripe") => mix(own[key], toward[key], t);
  return { grass: blend("grass"), verge: blend("verge"), road: blend("road"), shoulder: mix(blend("road"), "#324f60", .1), stripe: blend("stripe") };
});
export const LAP_LENGTH = TRACK.length * SEG;
const mod = (n: number, m: number) => ((n % m) + m) % m;
const segAt = (z: number) => TRACK[Math.floor(mod(z, LAP_LENGTH) / SEG)];
const groundAt = (z: number) => {
  const s = segAt(z), t = mod(z, SEG) / SEG;
  return s.y1 + (s.y2 - s.y1) * t;
};
/**
 * How far to tilt the view so the kart's road sits at the same height on
 * screen, even on a slope between the camera and the kart.
 */
const tiltFor = (progress: number) => clamp((groundAt(progress) - groundAt(progress - KART_Z)) / (2 * KART_Z), -.15, .15);

type Item = "Rocket" | "Shield" | "Goo" | "Bubble" | "Cloud" | "Honk" | "Magnet" | "Star" | "Spring" | "Triple" | "Oil";
const ITEMS: Item[] = ["Rocket", "Shield", "Goo", "Bubble", "Cloud", "Honk", "Magnet", "Star", "Spring", "Triple", "Oil"];
const ITEM_NAMES: Record<Item, string> = { Rocket: "Rocket", Shield: "Shield", Goo: "Goo", Bubble: "Bubble", Cloud: "Rain Cloud", Honk: "Honk", Magnet: "Coin Magnet", Star: "Super Star", Spring: "Jump Spring", Triple: "Bubble Trio", Oil: "Oil Slick" };
const ITEM_HELP: Record<Item, string> = {
  Rocket: "Tap for a speed burst.", Shield: "Tap to block a hit.",
  Goo: "Tap to drop a trap.", Bubble: "Tap to hit the racer ahead.",
  Cloud: "Tap to slow the leader.", Honk: "Tap to push rivals away.",
  Magnet: "Tap to pull in coins.", Star: "Tap to become invincible.",
  Spring: "Tap to jump.", Triple: "Tap to fire three bubbles.", Oil: "Tap to drop an oil slick.",
};
type Skill = "drifts" | "tricks" | "drafts" | "nearMisses";
// Leaders get defensive items; racers further back get ones that catch up
// or slow the leader down.
const ODDS: Record<number, number[]> = {
  1: [4, 18, 16, 6, 0, 12, 12, 2, 12, 4, 14],
  2: [12, 12, 8, 12, 6, 8, 12, 6, 10, 8, 6],
  3: [16, 6, 4, 12, 10, 4, 10, 14, 8, 14, 2],
  4: [18, 4, 2, 10, 12, 4, 8, 18, 6, 16, 2],
};

type Kart = Player & {
  progress: number; lane: number; speed: number; y: number; vy: number; flying: boolean; airTime: number;
  item: Item | null; pending: Item | null; roll: number; held: number;
  boost: number; ram: number; shield: number; spin: number; safe: number; shake: number; offRoad: number;
  /** Sideways shove from bumps and honks, and how fast the kart moves across lanes. */
  push: number; drift: number; bumped: number; spark: number;
  draft: number; cloud: number; honk: number; magnet: number; star: number;
  driftGrace: number; driftCharge: number; driftDirection: number; trick: boolean; aiAt: number; aiLane: number;
  chain: number; chainUntil: number; bestChain: number; stats: Record<Skill, number>;
  lapStarted: number; bestLap: number; lastLap: number; coach: string; warning: string; warningUntil: number;
  coins: number; taken: Set<string>; finish: number; rank: number; lap: number;
  banner: { text: string; since: number; until: number; big: boolean }; cursor: { x: number; y: number }; sky: number;
  rejoin: number; coinFlash: number; zone: Zone; rescue: number; rescueZ: number; rescueLane: number; falls: number;
};
type Projected = { x: number; y: number; scale: number };
type ViewSeg = { index: number; seg: Segment; worldX: number; worldDX: number; z: number; p1: Projected; p2: Projected; clip: number; visible: boolean };

/** Projects the track ahead of a camera onto a view of width w and height h. */
export function projectTrack(camZ: number, camY: number, w: number, h: number, camX = 0, tilt = 0, drawCount = DRAW) {
  const lapZ = mod(camZ, LAP_LENGTH), base = Math.floor(lapZ / SEG), percent = lapZ / SEG - base;
  const horizon = h * (.4 + tilt);
  const project = (x: number, y: number, z: number): Projected => {
    const scale = 1 / Math.max(z, 1);
    return { x: w / 2 + scale * (x - camX) * w / 2, y: horizon + scale * (camY - y) * h / 2, scale };
  };
  // Anchor the curve position AND its tangent at the camera. Resetting x to
  // zero at each segment makes the entire road snap sideways at every join.
  const baseBend = TRACK[base].curve * CURVE;
  let x = baseBend * percent * percent / 2, dx = -baseBend * percent, maxY = h;
  const out: ViewSeg[] = [];
  for (let n = 0; n < drawCount; n++) {
    const index = (base + n) % TRACK.length, seg = TRACK[index];
    const z1 = (n - percent) * SEG, z2 = z1 + SEG;
    const worldX = x, worldDX = dx, bend = seg.curve * CURVE;
    const near = clamp((1 - z1) / SEG, 0, 1);
    const p1 = project(x + dx * near + bend * near * near / 2, seg.y1 + (seg.y2 - seg.y1) * near, Math.max(1, z1)), p2 = project(x + dx + bend / 2, seg.y2, z2);
    x += dx + bend / 2; dx += bend;
    const visible = z2 > 1 && p2.y < p1.y && p2.y < maxY;
    out.push({ index, seg, worldX, worldDX, z: z1, p1, p2, clip: maxY, visible });
    if (visible) maxY = p2.y;
  }
  return { segs: out, lapZ, percent, camX, camY, horizon };
}
/** Where a point on the track (by distance ahead of the camera) lands in a view. */
export function projectTrackPoint(v: ReturnType<typeof projectTrack>, ahead: number, lane: number, lift: number, w: number, h: number) {
  const along = ahead + v.percent * SEG, n = Math.floor(along / SEG), t = along / SEG - n;
  const s = v.segs[n];
  if (!s || n < 0) return null;
  // Interpolate in world space, then project once using the actual depth.
  const scale = 1 / Math.max(1, ahead);
  const cx = w / 2 + (s.worldX + s.worldDX * t + s.seg.curve * CURVE * t * t / 2 - v.camX) * scale * w / 2;
  const ground = s.seg.y1 + (s.seg.y2 - s.seg.y1) * t;
  const cy = v.horizon + (v.camY - ground) * scale * h / 2;
  return { x: cx + lane * RW * scale * w / 2, y: cy - lift * scale * h / 2, ground: cy, unit: scale * w / 2, clip: s.clip, half: RW * scale * w / 2 };
}

export function createKart({ players, difficulty }: Options): Engine {
  const level = botLevel(difficulty);
  const rng = random(29);
  const karts: Kart[] = players.map((p, i) => ({
    ...p, progress: -i * 14, lane: [-.4, .4, -.8, .8][i % 4], speed: 0, y: groundAt(-i * 14), vy: 0, flying: false, airTime: 0,
    item: null, pending: null, roll: 0, held: 0, boost: 0, ram: 0, shield: 0, spin: 0, safe: 1.5, shake: 0, offRoad: 0,
    push: 0, drift: 0, bumped: 0, spark: 0, draft: 0, cloud: 0, honk: 0, magnet: 0, star: 0, driftGrace: 0, driftCharge: 0, driftDirection: 0, trick: false, aiAt: 0, aiLane: 0,
    chain: 0, chainUntil: 0, bestChain: 0, stats: { drifts: 0, tricks: 0, drafts: 0, nearMisses: 0 },
    lapStarted: 0, bestLap: 0, lastLap: 0, coach: "Point to steer.", warning: "", warningUntil: 0,
    coins: 0, taken: new Set(), finish: 0, rank: i + 1, lap: 1, banner: { text: "", since: 0, until: 0, big: false }, cursor: { x: .5, y: .65 }, sky: 0,
    rejoin: 0, coinFlash: 0, zone: "festival", rescue: 0, rescueZ: 0, rescueLane: 0, falls: 0,
  }));
  const motion = motionFrames<Kart>(["progress", "lane", "y", "sky", "drift"]);
  // Fresh copies, so cones knocked over and boxes taken belong to this race.
  const track = TRACK.map(s => ({ ...s, obstacles: s.obstacles.map(o => ({ ...o })), boxes: s.boxes.map(b => ({ ...b })) }));
  let traps: { z: number; lane: number; owner: number; expires: number; oil?: boolean }[] = [];
  let bubbles: { z: number; lane: number; owner: number; speed: number; until: number }[] = [];
  let reducedMotion = false;
  let finishers = 0, remaining = 120, messageUntil = 0, finishWindow = false;
  const defaultMessage = "Point to steer. Tap to use a power-up.";
  const say = (p: Kart, text: string, seconds = 1.6, big = false) => { p.banner = { text, since: engine.time, until: engine.time + seconds, big }; };
  const announce = (text: string) => { engine.message = text; messageUntil = engine.time + 2.5; };
  const skill = (p: Kart, kind: Skill, label: string, boost: number) => {
    p.chain = engine.time < p.chainUntil ? Math.min(5, p.chain + 1) : 1;
    p.chainUntil = engine.time + 5;
    p.bestChain = Math.max(p.bestChain, p.chain); p.stats[kind]++;
    p.boost = Math.max(p.boost, boost * (1 + (p.chain - 1) * .12));
    say(p, label, 1.1);
  };
  const rescueKart = (p: Kart) => {
    if (p.rescue > 0 || p.finish) return;
    p.rescue = .85; p.falls++; p.speed = 0; p.vy = 0; p.flying = false;
    p.boost = 0; p.ram = 0; p.spin = 0; p.push = 0; p.driftCharge = 0; p.chain = 0; p.trick = false;
    p.coins = Math.max(0, p.coins - 2);
    // Return to solid road beyond the hole, never to the same hole again.
    const first = Math.floor(p.progress / SEG);
    for (let n = 1; n <= 12; n++) {
      const z = (first + n) * SEG + SEG / 2, s = segAt(z);
      if (s.gap) continue;
      const lane = [0, -.4, .4, -.65, .65].find(lane => Math.abs(lane) < s.width - .1 && (!s.hole || Math.abs(lane - s.hole.lane) > s.hole.width + .12));
      if (lane === undefined) continue;
      p.rescueZ = z; p.rescueLane = lane; break;
    }
    say(p, "Rescue!", 1.3);
  };
  const spinOut = (p: Kart, why: string) => {
    // A short grace period after any hit, so one obstacle can't hit twice.
    if (protectedFromHit(p) || p.rescue > 0) return;
    if (p.shield > 0) { p.shield = 0; p.safe = .6; say(p, "Blocked!"); return; }
    p.driftCharge = 0; p.chain = 0; p.chainUntil = 0; p.spin = .75; p.safe = 2.2; p.shake = .3; p.coins = Math.max(0, p.coins - 2); say(p, why);
  };
  // Karts that touch shove each other apart. Steering into someone shoves
  // them harder (and can steal a coin); a kart with a Rocket or Shield going
  // rams them into a spin; running into the back of someone slows you and
  // nudges them on.
  const bump = (a: Kart, b: Kart, salt: number) => {
    if (a.finish || b.finish || a.rescue > 0 || b.rescue > 0 || Math.abs(a.y - b.y) > 4) return;
    const dz = trackGap(b.progress, a.progress, LAP_LENGTH), gap = a.lane - b.lane;
    if (Math.abs(dz) > 10 || Math.abs(gap) > KART_WIDTH) return;
    const side = gap === 0 ? (salt % 2 ? 1 : -1) : Math.sign(gap); // a is on this side of b
    const overlap = (KART_WIDTH - Math.abs(gap)) / 2;
    a.lane = clamp(a.lane + side * overlap, -EDGE, EDGE); b.lane = clamp(b.lane - side * overlap, -EDGE, EDGE);
    if (a.bumped > 0 || b.bumped > 0 || a.safe > 0 || b.safe > 0) return;
    a.bumped = b.bumped = .45; a.spark = b.spark = .3; a.shake = Math.max(a.shake, .15); b.shake = Math.max(b.shake, .15);
    const tough = canRam;
    const force = (k: Kart, toward: number) => Math.max(0, k.drift * toward) * .8 + (tough(k) ? 1.5 : 0) + k.speed / TOP_SPEED * .3;
    const fa = force(a, -side), fb = force(b, side);
    a.push += side * (.8 + fb * 1.8); b.push -= side * (.8 + fa * 1.8);
    for (const [hitter, victim] of [[a, b], [b, a]] as const) {
      if (!tough(hitter) || tough(victim)) continue;
      const spinning = victim.spin;
      spinOut(victim, hitter.shield > 0 ? "Shield bash" : "Rammed");
      if (victim.spin > spinning) { hitter.coins = Math.min(10, hitter.coins + 1); say(hitter, "+1 coin"); }
      if (hitter.shield > 0) hitter.shield = Math.max(0, hitter.shield - 3);
      return;
    }
    if (Math.abs(dz) > 6 && Math.abs(gap) < .25) {
      const back = dz < 0 ? a : b, front = back === a ? b : a;
      back.speed *= .8; front.speed += 15; say(back, "Bonk!", 1); say(front, "Nudged!", 1);
      return;
    }
    const strong = fa > fb + .3 ? a : fb > fa + .3 ? b : null, weak = strong === a ? b : a;
    if (strong && weak.coins > 0) { weak.coins--; strong.coins = Math.min(10, strong.coins + 1); say(strong, "+1 coin", 1.2); say(weak, "Shoved!", 1.2); }
    else { say(a, "Bump!", .8); say(b, "Bump!", .8); }
  };
  const lapZ = (p: Kart) => mod(p.progress, LAP_LENGTH);
  // Things on the track between `from` and `from + range` (lap distances).
  const ahead = (p: Kart, range: number) => {
    const found: { dz: number; s: Segment; index: number }[] = [];
    const first = Math.floor(lapZ(p) / SEG);
    for (let n = 0; n * SEG <= range + SEG; n++) {
      const index = (first + n) % track.length;
      const dz = mod(index * SEG + SEG / 2 - lapZ(p), LAP_LENGTH);
      if (dz <= range) found.push({ dz, s: track[index], index });
    }
    return found;
  };
  const sheepLane = (s: Segment) => Math.sin(engine.time * .7 + (s.sheep ?? 0)) * 1.15;
  const movingLane = (phase: number, speed = .9) => Math.sin(engine.time * speed + phase) * .85;
  const steerTarget = (p: Kart, i: number) => {
    const look = 60 + level * 35;
    let best = p.lane, score = -Infinity;
    const things = ahead(p, 220);
    const rivals = karts.filter((o, j) => j !== i && !o.finish);
    const tough = canRam(p);
    for (const lane of LANES.map(lane => lane * Math.min(segAt(p.progress).width, segAt(p.progress + 60).width))) {
      let s = -Math.abs(lane - p.lane) * .4 - Math.abs(lane) * .1;
      for (const { dz, s: seg } of things) {
        const near = 1 - dz / 220;
        if (dz < look) {
          if (Math.abs(lane) > seg.width - .12) s -= 8 * near;
          if (seg.hole && Math.abs(seg.hole.lane - lane) < seg.hole.width + .16) s -= 12 * near;
          for (const o of seg.obstacles) if (o.down <= engine.time && Math.abs(o.lane - lane) < .4) s -= 4 * near;
          if (seg.sheep !== undefined && Math.abs(sheepLane(seg) - lane) < .45) s -= 3 * near;
          const moving = seg.sweeper ?? seg.boulder;
          if (moving !== undefined && Math.abs(movingLane(moving) - lane) < .5) s -= 5 * near;
        }
        if (!p.item && !p.pending) for (const b of seg.boxes) if (b.ready <= engine.time && Math.abs(b.lane - lane) < .2) s += 1.6 * near;
        if (seg.pad !== undefined && Math.abs(seg.pad - lane) < .2) s += 1.2 * near;
        for (const c of seg.coins) if (Math.abs(c - lane) < .2) s += .25 * near;
      }
      for (const t of traps) {
        const dz = mod(t.z - lapZ(p), LAP_LENGTH);
        if (t.owner !== i && dz < look && Math.abs(t.lane - lane) < .4) s -= 4 * (1 - dz / 220);
      }
      // Lean on rivals alongside (harder bots more so), ram them when
      // shielded or boosting, and keep clear of anyone who is.
      if (!p.finish) for (const o of rivals) {
        const dz = trackGap(p.progress, o.progress, LAP_LENGTH);
        if (Math.abs(o.lane - lane) > .25) continue;
        if (Math.abs(dz) < 25) {
          const near = 1 - Math.abs(dz) / 25;
          if (canRam(o)) s -= 2.5 * near;
          else s += (tough ? 2 : .3 + level * .3) * near;
        } else if (dz > 15 && dz < 80) s += .35; // tuck in for a slipstream
      }
      if (s > score) { score = s; best = lane; }
    }
    // Easier bots wander a little.
    return best + Math.sin(engine.time * .8 + i * 2) * .12 * (3 - level) / 3;
  };
  const useItem = (p: Kart, i: number) => {
    const item = p.item; if (!item) return;
    p.item = null; p.held = 0;
    if (item === "Magnet") { p.magnet = 8; say(p, "Coin Magnet", 1); }
    if (item === "Star") { p.star = 5; p.spin = 0; p.cloud = 0; say(p, "Super Star"); }
    if (item === "Spring") { p.flying = true; p.vy = 65; p.airTime = 0; p.trick = false; say(p, "Jump Spring"); }
    if (item === "Triple") {
      for (const offset of [-.4, 0, .4]) bubbles.push({ z: p.progress + 12, lane: p.lane + offset, owner: i, speed: p.speed + 110, until: engine.time + 4 });
      say(p, "Bubble Trio");
    }
    if (item === "Oil") { traps.push({ z: mod(p.progress - 14, LAP_LENGTH), lane: p.lane, owner: i, expires: engine.time + 18, oil: true }); say(p, "Oil Slick"); }
    if (item === "Rocket") { p.boost = 2.2; p.ram = 2.2; say(p, "Rocket"); }
    if (item === "Shield") { p.shield = 8; say(p, "Shield"); }
    if (item === "Goo") { traps.push({ z: mod(p.progress - 14, LAP_LENGTH), lane: p.lane, owner: i, expires: engine.time + 20 }); say(p, "Goo"); }
    if (item === "Bubble") { bubbles.push({ z: p.progress + 12, lane: p.lane, owner: i, speed: p.speed + 110, until: engine.time + 4 }); say(p, "Bubble"); }
    if (item === "Cloud") {
      // Rains on the leader, or on whoever is chasing you if you lead.
      const order = karts.filter(o => !o.finish).sort((a, b) => b.progress - a.progress);
      const target = order[0] === p ? order[1] : order[0];
      if (!target) return;
      if (target.star > 0) { say(p, "Blocked!"); return; }
      if (target.shield > 0) { target.shield = 0; target.safe = .6; say(target, "Blocked!"); say(p, "Blocked!"); return; }
      target.cloud = 3.5; say(target, "Rain cloud!"); say(p, `Rain on ${target.name}!`);
      announce(`${p.name} sent a rain cloud to ${target.name}.`);
    }
    if (item === "Honk") {
      p.honk = .5; say(p, "Honk");
      bubbles.forEach(b => { if (b.owner !== i && Math.abs(trackGap(p.progress, b.z, LAP_LENGTH)) < 90) b.until = 0; });
      karts.forEach((o, j) => {
        if (j === i || o.finish) return;
        const dz = trackGap(p.progress, o.progress, LAP_LENGTH), dl = o.lane - p.lane;
        if (Math.abs(dz) > 45 || Math.abs(dl) > 1 || protectedFromHit(o) || Math.abs(o.y - p.y) > 5) return;
        if (o.shield > 0) { o.shield = 0; o.safe = .6; say(o, "Blocked!"); return; }
        o.push += (dl >= 0 ? 1 : -1) * (1 + 3 * (1 - Math.abs(dz) / 45));
        if (Math.abs(dz) < 16 && Math.abs(dl) < .5) spinOut(o, "Honked!"); else say(o, "Honk!");
      });
    }
  };
  const botWantsItem = (p: Kart, i: number) => {
    if (!p.item) return false;
    if (p.rescue > 0) return false;
    if (p.item === "Spring" && ahead(p, 220).some(({ s }) => s.launch || s.gap)) return false;
    if (p.held > 6) return true;
    const others = karts.filter((_, j) => j !== i && !karts[j].finish);
    if (p.item === "Rocket") return p.y - groundAt(p.progress) < 1 && Math.abs(segAt(p.progress + 60).curve) < 2.5 && p.spin <= 0;
    if (["Magnet", "Star", "Spring", "Triple"].includes(p.item)) return p.held > 1;
    if (p.item === "Goo" || p.item === "Oil") return others.some(o => p.progress - o.progress > 10 && p.progress - o.progress < 110);
    if (p.item === "Bubble") return others.some(o => o.progress - p.progress > 20 && o.progress - p.progress < 350);
    if (p.item === "Cloud") return p.rank > 1 || p.held > 2;
    if (p.item === "Honk") return others.some(o => Math.abs(o.progress - p.progress) < 30 && Math.abs(o.lane - p.lane) < .8);
    const danger = ahead(p, 70).some(({ s }) => s.obstacles.some(o => o.down <= engine.time && Math.abs(o.lane - p.lane) < .35))
      || bubbles.some(b => b.owner !== i && p.progress - b.z > 0 && p.progress - b.z < 120);
    return danger;
  };

  const engine: Engine = {
    id: "kart", time: 0, done: false, label: "Use power-up", message: defaultMessage, hud: "3 laps · 120s remaining", remaining: 120,
    setReducedMotion: enabled => { reducedMotion = enabled; },
    standings: () => karts.map(p => ({ ...p, stats: { ...p.stats }, score: (5 - p.rank) * 25, detail: ordinal(p.rank) })),
    step(dt, inputs) {
      if (engine.done || !Number.isFinite(dt) || dt <= 0) return;
      motion.capture(karts);
      engine.time += dt; remaining -= dt;
      if (messageUntil && engine.time > messageUntil) { engine.message = defaultMessage; messageUntil = 0; }
      const crossings: Kart[] = [];
      const humans = karts.filter(p => !p.bot);
      const leadHuman = humans.length ? Math.max(...humans.map(p => p.progress)) : null;
      karts.forEach((p, i) => {
        if (p.rescue > 0) {
          p.rescue = Math.max(0, p.rescue - dt); p.y -= dt * 90;
          if (p.rescue === 0) {
            p.progress = p.rescueZ; p.lane = p.rescueLane; p.y = groundAt(p.progress);
            p.speed = 85; p.safe = 2.2; p.boost = .5; p.rejoin = .85;
            say(p, "Back in the race", .8);
          }
          return;
        }
        p.rejoin = Math.max(0, p.rejoin - dt); p.coinFlash = Math.max(0, p.coinFlash - dt);
        const wasSpinning = p.spin > 0;
        p.ram = Math.max(0, p.ram - dt);
        p.boost = Math.max(0, p.boost - dt); p.shield = Math.max(0, p.shield - dt);
        p.spin = Math.max(0, p.spin - dt);
        if (wasSpinning && p.spin === 0) { p.boost = Math.max(p.boost, .5); say(p, "Back in the race", .8); }
        if (p.chain && engine.time >= p.chainUntil) p.chain = 0;
        p.safe = Math.max(0, p.safe - dt); p.shake = Math.max(0, p.shake - dt);
        p.bumped = Math.max(0, p.bumped - dt); p.spark = Math.max(0, p.spark - dt);
        p.magnet = Math.max(0, p.magnet - dt); p.star = Math.max(0, p.star - dt);
        p.cloud = Math.max(0, p.cloud - dt); p.honk = Math.max(0, p.honk - dt);
        if (p.item) p.held += dt;
        if (p.roll > 0) {
          p.roll -= dt;
          if (p.roll <= 0 && p.pending) { p.item = p.pending; p.pending = null; say(p, `${ITEM_NAMES[p.item]}!`); }
        }
        const seg = segAt(p.progress);
        if (seg.zone !== p.zone) p.zone = seg.zone;
        // Steering: point at the road, or let the bot (and finished karts) drive.
        let target: number;
        const input = inputs[i] ?? blankInput();
        const think = engine.time >= p.aiAt;
        if (p.bot || p.finish) {
          // Think at 10Hz instead of rescanning the road on every physics substep.
          if (think) { p.aiLane = steerTarget(p, i); p.aiAt = engine.time + .1; }
          target = p.aiLane;
        }
        else {
          p.cursor = { x: .5 + (Number.isFinite(input.x) ? clamp(input.x, -1, 1) : 0) * .48, y: .5 + (Number.isFinite(input.y) ? clamp(input.y, -1, 1) : 0) * .47 };
          target = pointedLane(p, p.cursor);
          // Give a rescued racer time to reorient before restoring full steering.
          if (p.rejoin > 0) target = p.rescueLane + (target - p.rescueLane) * (1 - p.rejoin / .85);
          if (input.tap && p.flying) {
            // Every airborne tap has the same meaning, including the first
            // instant after takeoff. Never accidentally spend a held gadget.
            if (!p.trick) { p.trick = true; say(p, "Trick!", .8); }
          } else if (input.tap && p.item) useItem(p, i);
          else if (input.tap && !p.pending) say(p, "Find a ? box", 1.2);
        }
        if (p.bot && think && !p.finish && botWantsItem(p, i)) useItem(p, i);
        const grounded = !p.flying;
        const rate = p.spin > 0 ? 0 : grounded ? (seg.zone === "frost" ? 1.8 : 2.8) : 1.4, was = p.lane;
        p.lane = steerToward(p.lane, target, rate, dt);
        // Shoves carry a kart sideways, fading quickly.
        p.lane += p.push * dt; p.push *= Math.exp(-5 * dt);
        // Bends push karts outward; faster karts feel it more.
        if (grounded) p.lane -= seg.curve * CURVE * .18 * (p.driftCharge > .2 ? .7 : 1) * (p.speed / TOP_SPEED) ** 2 * dt;
        if (seg.terrain === "bridge" || seg.terrain === "tunnel") {
          const rail = seg.width - .08;
          if (Math.abs(p.lane) > rail) { p.lane = clamp(p.lane, -rail, rail); p.push *= -.25; p.speed *= Math.exp(-dt * 1.6); }
        }
        p.lane = clamp(p.lane, -EDGE, EDGE);
        p.drift = (p.lane - was) / dt;
        // Steering into a bend charges a drift; exiting it releases the turbo.
        const drifting = grounded && p.spin <= 0 && p.speed > 85 && Math.abs(seg.curve) > 1.2 && target * seg.curve > .18 && Math.abs(p.lane) < seg.width;
        if (drifting) {
          p.driftDirection = Math.sign(seg.curve);
          p.driftCharge = Math.min(2.4, p.driftCharge + dt); p.driftGrace = .22;
        } else if (p.driftCharge > 0 && (p.driftGrace -= dt) <= 0) {
          if (p.driftCharge >= .65 && grounded && p.spin <= 0) {
            skill(p, "drifts", p.driftCharge >= 1.6 ? "Super turbo!" : "Turbo!", p.driftCharge >= 1.6 ? 1.6 : .85);
          }
          p.driftCharge = 0; p.driftDirection = 0;
        }
        // Slipstream: following close behind someone builds up a boost.
        const leader = karts.find(o => o !== p && !o.finish && forwardGap(p.progress, o.progress, LAP_LENGTH) > 12 && forwardGap(p.progress, o.progress, LAP_LENGTH) < 70 && Math.abs(o.lane - p.lane) < .25);
        if (leader && grounded && !p.finish) {
          p.draft += dt;
          if (p.draft > 1.2) { p.draft = 0; skill(p, "drafts", "Slipstream!", .9); }
        } else p.draft = Math.max(0, p.draft - dt * 2);
        // Speed.
        let top = p.bot ? 126 + level * 9 : TOP_SPEED;
        top *= 1 + p.coins * .01;
        if (p.bot && leadHuman !== null) top *= clamp(1 - (p.progress - leadHuman) / 4000, .88, 1.1);
        if (p.finish) top *= .6;
        const shortcut = seg.shortcut !== undefined && p.lane * seg.shortcut > 1.04;
        const offRoad = grounded && Math.abs(p.lane) > seg.width + .05 && !shortcut && p.star <= 0;
        if (shortcut) top *= 1.18;
        if (offRoad) { top *= .55; p.offRoad += dt; if (p.offRoad > .5 && p.offRoad - dt <= .5 && !p.bot) say(p, "Back to the road!"); } else p.offRoad = 0;
        if (grounded) top *= 1 - clamp((groundAt(p.progress + 5) - groundAt(p.progress - 5)) / 10, -.6, .6) * .3;
        if (p.spin > 0) top *= .3;
        if (p.cloud > 0) top *= .7;
        if (p.boost > 0) top *= 1.5;
        if (p.star > 0) top *= 1.25;
        p.speed += (top - p.speed) * Math.min(1, dt * (top > p.speed ? 1.6 : 2.5));
        const before = p.progress;
        p.progress += p.speed * dt;
        const next = groundAt(p.progress), road = segAt(p.progress);
        const unsupported = road.gap || road.hole && Math.abs(p.lane - road.hole.lane) < road.hole.width || road.terrain === "cliff" && Math.abs(p.lane) > road.width + .18;
        // Cruise firmly on the ground. Only ramps and springs launch a kart.
        // This avoids repeated micro-jumps caused by piecewise road slopes.
        if (!p.flying) {
          p.y = next; p.vy = 0;
          if (segAt(p.progress).ramp && segAt(before) !== segAt(p.progress) && !p.finish) {
            const launch = segAt(p.progress).launch;
            if (launch) {
              // A hit on the approach must not turn a mandatory jump into an
              // unavoidable fall. The launch pad rights and accelerates you.
              p.speed = Math.max(180, p.speed); p.spin = 0; p.push = 0; p.safe = Math.max(p.safe, 1);
            }
            p.vy = launch ?? 55 + p.speed * .08; p.flying = true; p.airTime = 0; p.trick = false;
            if (!p.bot) say(p, "Tap for a trick!", 1);
          }
        } else {
          p.vy -= GRAVITY * dt; p.y += p.vy * dt; p.airTime += dt;
          if (p.bot && p.airTime > .2) p.trick = true;
          if (p.y <= next) {
            p.y = next; p.vy = 0; p.flying = false;
            if (p.airTime > .25 && !unsupported) {
              if (p.trick) skill(p, "tricks", "Trick turbo!", 1.4);
              else { p.boost = Math.max(p.boost, .6); say(p, "Nice landing!", 1); }
            }
            p.trick = false;
          }
        }
        if (!p.finish && p.y - next < 1.5 && unsupported) { rescueKart(p); return; }
        p.sky += seg.curve * p.speed * dt * .0012;
        // Laps.
        const lap = Math.floor(Math.max(0, p.progress) / LAP_LENGTH) + 1;
        if (lap !== p.lap && !p.finish) {
          const crossedAt = crossingTime(before, p.progress, (lap - 1) * LAP_LENGTH, engine.time, dt);
          p.lastLap = crossedAt - p.lapStarted; p.lapStarted = crossedAt;
          p.bestLap = p.bestLap ? Math.min(p.bestLap, p.lastLap) : p.lastLap;
          p.lap = lap; p.taken.clear();
          if (lap === LAPS) { say(p, "Final lap!", 2, true); announce(`${p.name} is on the final lap.`); }
          else if (lap < LAPS) say(p, `Lap ${lap}`, 1.6, true);
        }
        if (p.progress >= LAP_LENGTH * LAPS && !p.finish) {
          p.finish = crossingTime(before, p.progress, LAP_LENGTH * LAPS, engine.time, dt);
          crossings.push(p);
        }
        if (p.finish) return;
        // What the kart drives through. Airborne karts sail over everything.
        const low = p.y - next < 2;
        const crossed = (z: number, reach: number) => crossesPoint(before, p.progress, z, LAP_LENGTH, reach);
        // Scan the swept span, not only objects still ahead at the end of the
        // frame. Otherwise pickups and hazards can be skipped at high speed.
        const first = Math.floor((before - 6) / SEG), last = Math.floor((p.progress + 6) / SEG);
        for (let n = first; n <= last; n++) {
          const index = mod(n, track.length), s = track[index], z = index * SEG + SEG / 2;
          if (!crossed(z, 6)) continue;
          if (low) for (const o of s.obstacles) {
            if (o.down > engine.time || Math.abs(o.lane - p.lane) > (o.kind === "hay" ? .26 : .18)) continue;
            if (o.kind === "cone" || o.kind === "barrel") o.down = engine.time + 5;
            spinOut(p, o.kind === "cone" ? "Hit a cone" : o.kind === "hay" ? "Hit a hay bale" : o.kind === "oil" ? "Slid on oil" : "Hit a barrel");
          }
          const moving = s.sweeper ?? s.boulder;
          if (low && moving !== undefined && Math.abs(movingLane(moving) - p.lane) < .3) spinOut(p, s.boulder !== undefined ? "Hit a snowball" : "Hit the sweeper");
          if (low && s.sheep !== undefined && Math.abs(sheepLane(s) - p.lane) < .24) spinOut(p, "Mind the sheep");
          if (low && s.pad !== undefined && Math.abs(s.pad - p.lane) < .2 && p.boost < .3) { p.boost = 1.1; if (!p.bot) say(p, "Boost!", 1); }
          for (const b of s.boxes) {
            if (!low || p.item || p.pending || b.ready > engine.time || Math.abs(b.lane - p.lane) > .22) continue;
            b.ready = engine.time + 3;
            if (!p.item && !p.pending) {
              const odds = ODDS[clamp(p.rank, 1, 4)];
              let r = rng() * odds.reduce((sum, weight) => sum + weight, 0), pick = 0;
              while (pick < ITEMS.length - 1 && r > odds[pick]) { r -= odds[pick]; pick++; }
              p.pending = ITEMS[pick]; p.roll = .75;
            }
          }
          const missKey = `near:${lap}:${index}`;
          if (low && p.speed > 95 && p.safe <= 0 && p.star <= 0 && crossed(z, 0) && !p.taken.has(missKey)) {
            const lanes = s.obstacles.filter(o => o.down <= engine.time).map(o => o.lane);
            if (moving !== undefined) lanes.push(movingLane(moving));
            if (s.sheep !== undefined) lanes.push(sheepLane(s));
            if (lanes.some(lane => Math.abs(lane - p.lane) > .36 && Math.abs(lane - p.lane) < .62)) {
              p.taken.add(missKey); skill(p, "nearMisses", "Close call!", .4);
            }
          }
          s.coins.forEach((c, k) => {
            const key = `${lap}:${index}:${k}`;
            if ((p.magnet > 0 || Math.abs(p.y - next - (s.coinHeight ?? 0)) < 5) && Math.abs(c - p.lane) < (p.magnet > 0 ? 1.6 : .24) && !p.taken.has(key)) { p.taken.add(key); p.coins = Math.min(10, p.coins + 1); p.coinFlash = .35; }
          });
        }
        if (low) traps.forEach(t => {
          if (t.owner !== i && t.expires > engine.time && crossed(t.z, 6) && Math.abs(t.lane - p.lane) < (t.oil ? .38 : .22)) { t.expires = 0; spinOut(p, t.oil ? "Slid on oil" : "Stuck in goo"); }
        });
      });
      // Assign photo finishes by the fractional crossing time, never seat order.
      crossings.sort((a, b) => a.finish - b.finish).forEach(p => {
        p.rank = ++finishers;
        // A fast bot must not cut short a beginner's race. The sprint-to-finish
        // window starts with a human finisher (or the leader in bot-only races).
        if (!p.bot || humans.length === 0) { remaining = Math.min(remaining, 15); finishWindow = true; }
        say(p, `${ordinal(p.rank)}!`, 99, true); announce(`${p.name} finished ${ordinal(p.rank)}.`);
      });
      // Homing and collisions share the same wrapped physical track distance.
      bubbles.forEach(b => {
        if (b.until <= engine.time) return;
        b.z += b.speed * dt;
        const target = karts.filter((p, j) => j !== b.owner && !p.finish && forwardGap(b.z, p.progress, LAP_LENGTH) < 600)
          .sort((x, y) => forwardGap(b.z, x.progress, LAP_LENGTH) - forwardGap(b.z, y.progress, LAP_LENGTH))[0];
        if (target) b.lane += clamp(target.lane - b.lane, -1.5 * dt, 1.5 * dt);
        karts.forEach((p, j) => {
          if (j === b.owner || p.finish || p.rescue > 0 || b.until <= engine.time) return;
          const distance = trackGap(b.z, p.progress, LAP_LENGTH);
          if (!p.bot && distance > 0 && distance < 100 && Math.abs(p.lane - b.lane) < .5) {
            p.warning = "Bubble behind you. Move over."; p.warningUntil = engine.time + .3;
          }
          if (projectileTouches(distance, p.lane - b.lane, p.y - groundAt(p.progress))) { b.until = 0; spinOut(p, "Bubbled"); }
        });
      });
      bubbles = bubbles.filter(b => b.until > engine.time);
      traps = traps.filter(t => t.expires > engine.time);
      for (let i = 0; i < karts.length; i++) for (let j = i + 1; j < karts.length; j++) bump(karts[i], karts[j], i);
      karts.filter(p => !p.finish).sort((a, b) => b.progress - a.progress).forEach((p, i) => { p.rank = finishers + i + 1; });
      karts.forEach(p => {
        if (!p.bot && !p.finish) p.coach = coaching(p);
      });
      if (messageUntil <= engine.time) engine.message = karts.find(p => !p.bot && !p.finish)?.coach ?? defaultMessage;
      engine.remaining = Math.max(0, remaining);
      engine.hud = `3 laps ·${Math.ceil(Math.max(0, remaining))}s${finishWindow ? " to finish" : " remaining"}`;
      engine.done = remaining <= 0 || finishers === karts.length || humans.length > 0 && humans.every(p => p.finish > 0);
    },
    draw(c, w, h, interpolation = 1) {
      // A canvas collapsing during layout would give negative sizes.
      if (w < 40 || h < 40) return;
      const drivers = motion.sample(karts, interpolation, (p, before) => (p.rescue > 0) !== (before.rescue > 0) || Math.abs(p.progress - before.progress) > 10);
      drawKartViews(c, w, h, players, (i, vw, vh) => {
        const p = drivers[i];
        const shake = !reducedMotion && p.shake > 0 ? Math.sin(engine.time * 90) * p.shake * 10 : 0;
        c.save(); c.translate(shake, shake * .5);
        // Wide, short views (two or three racers) watch from higher up and
        // farther back, so the kart shrinks and more of the road ahead fits.
        const squish = clamp(vw / vh / 1.9 - 1, 0, 1), back = KART_Z * (1 + .4 * squish);
        const camZ = p.progress - back, camY = groundAt(camZ) + CH * (1 + .9 * squish);
        // The camera slides along once the kart leaves the road, so it never
        // drives out of its own view. Steering doesn't use this shift.
        const camX = Math.sign(p.lane) * Math.max(0, Math.abs(p.lane) - .9) * RW;
        const tilt = tiltFor(p.progress) - .06 * squish;
        const v = projectTrack(camZ, camY, vw, vh, camX, tilt);
        backdrop(c, vw, vh, p.sky, i, tilt, groundAt(p.progress));
        drawRoad(c, v, vw, vh);
        if (segAt(p.progress).terrain === "tunnel") tunnelInterior(c, vw, vh, p.progress);
        // Everything standing on the track, drawn from far to near.
        const sprites: { z: number; clip: number; draw: () => void }[] = [];
        // Anything already behind your kart is skipped: so close to the camera
        // it would loom over the whole view.
        const add = (z: number, lane: number, lift: number, fn: (q: NonNullable<ReturnType<typeof projectTrackPoint>>) => void, near = back - 3) => {
          const dz = mod(z - mod(camZ, LAP_LENGTH), LAP_LENGTH);
          if (dz < near || dz > (DRAW - 1) * SEG) return;
          const q = projectTrackPoint(v, dz, lane, lift, vw, vh);
          if (q && q.unit > .22 && q.x > -vw * .5 && q.x < vw * 1.5) sprites.push({ z: dz, clip: q.clip, draw: () => fn(q) });
        };
        v.segs.forEach(({ index, seg }) => {
          const mid = index * SEG + SEG / 2;
          // The start arch stops drawing before it passes over the camera.
          seg.scenery.forEach(s => add(index * SEG + 2, s.offset, 0, q => scenery(c, s.kind, q.x, q.ground, q.unit, q.half, reducedMotion ? 0 : engine.time), s.kind === "arch" ? 24 : 3));
          track[index].obstacles.forEach(o => { if (o.down <= engine.time) add(mid, o.lane, 0, q => obstacleSprite(c, o.kind, q.x, q.y, q.unit)); });
          track[index].boxes.forEach(b => { if (b.ready <= engine.time) add(mid, b.lane, 3 + (reducedMotion ? 0 : Math.sin(engine.time * 3 + b.lane * 4) * .45), q => box(c, q.x, q.y, q.unit, reducedMotion ? 0 : engine.time + b.lane)); });
          seg.coins.forEach((lane, k) => { if (!p.taken.has(`${p.lap}:${index}:${k}`)) add(mid, lane, 3 + (seg.coinHeight ?? 0), q => coin(c, q.x, q.y, q.unit, reducedMotion ? 0 : engine.time)); });
          if (seg.sweeper !== undefined || seg.boulder !== undefined) add(mid, movingLane((seg.sweeper ?? seg.boulder)!), 0, q => movingObstacle(c, q.x, q.y, q.unit, seg.boulder !== undefined, engine.time));
          if (seg.sheep !== undefined) add(mid, Math.sin(engine.time * .7 + seg.sheep) * 1.15, 0, q => sheep(c, q.x, q.y, q.unit, engine.time));
        });
        traps.forEach(t => add(t.z, t.lane, 0, q => t.oil ? obstacleSprite(c, "oil", q.x, q.y, q.unit) : goo(c, q.x, q.y, q.unit)));
        bubbles.forEach(b => add(b.z, b.lane, 3, q => bubble(c, q.x, q.y, q.unit)));
        drivers.forEach((o, j) => {
          const lift = o.y - groundAt(o.progress);
          add(o.progress, o.lane, lift, q => {
            if (o.rescue > 0) { c.save(); c.globalAlpha = Math.max(.15, o.rescue / .85); }
            kart(c, q.x, q.y, q.ground, q.unit, o, engine.time, j === i, reducedMotion);
            if (o.rescue > 0) c.restore();
          });
        });
        // Each sprite is cut off where a hill in front of it hides the road.
        sprites.sort((a, b) => b.z - a.z).forEach(s => {
          c.save(); c.beginPath(); c.rect(-20, -20, vw + 40, s.clip + 20); c.clip(); s.draw(); c.restore();
        });
        if (!p.bot && !p.finish) {
          const target = projectTrackPoint(v, back, pointedLane(p, p.cursor), 0, vw, vh)!;
          const x = target.x, y = target.y;
          // A quiet road marker stays visible without covering the kart.
          c.strokeStyle = "#ffffffb3"; c.lineWidth = 2;
          c.beginPath(); c.ellipse(x, y + 8, 10, 3, 0, 0, TAU); c.stroke();
        }
        c.restore();
        hud(c, vw, vh, p, drivers, engine.time, reducedMotion);
      });
    },
  };
  function coaching(p: Kart) {
    if (p.rescue > 0) return "Rescue is bringing you back. Aim for solid road.";
    if (p.spin > 0) return "Hang on.";
    if (p.flying) return p.trick ? "Land for a turbo." : "Tap for a trick.";
    const upcoming = ahead(p, 140);
    if (upcoming.some(({ s }) => s.launch || s.gap)) return "Canyon jump ahead. Stay on the ramp; it launches you.";
    const hole = upcoming.find(({ s }) => s.hole)?.s.hole;
    if (hole) return `Hole ahead! Keep ${hole.lane < 0 ? "right" : "left"}`;
    if (segAt(p.progress).terrain === "cliff" && Math.abs(p.lane) > .65) return "Cliff edge! Steer toward the road center.";
    if (p.warningUntil > engine.time) return p.warning;
    if (p.offRoad > .25) return "Back onto the road.";
    if (p.driftCharge >= .65) return "Straighten out for a turbo.";
    if (p.item) return `${ITEM_NAMES[p.item]}: ${ITEM_HELP[p.item].toLowerCase()}`;
    if (p.pending) return "Choosing a power-up…";
    if (engine.time < 7) return "Point to steer. Drive through ? boxes.";
    if (upcoming.some(({ s }) => s.ramp)) return "Ramp ahead. Tap in the air for a trick.";
    const shortcut = upcoming.find(({ s }) => s.shortcut !== undefined);
    if (shortcut) return `Shortcut on the ${shortcut.s.shortcut! < 0 ? "left" : "right"}.`;
    if (upcoming.some(({ s }) => s.sweeper !== undefined || s.boulder !== undefined || s.sheep !== undefined)) return "Watch for the gap.";
    const bend = segAt(p.progress + 70).curve;
    if (Math.abs(bend) > 1.2) return `Steer ${bend > 0 ? "right" : "left"} into the bend to drift.`;
    if (p.draft > .1) return "Stay behind for a slipstream.";
    return "Coins add speed.";
  }
  // The lane under the player's pointer, read off their own view of the road.
  function pointedLane(p: Kart, cursor: { x: number; y: number }) {
    // Aim across the road at a fixed lookahead depth, so vertical sensor noise
    // and the horizon cannot suddenly fling the steering target off-road.
    const camZ = p.progress - KART_Z;
    const v = projectTrack(camZ, groundAt(camZ) + CH, 1, 1, 0, tiltFor(p.progress), 3);
    const q = projectTrackPoint(v, KART_Z, 0, 0, 1, 1)!;
    return clamp((cursor.x - q.x) / q.half, -EDGE, EDGE);
  }
  return engine;
}

/* Bright, sculpted toys in a quiet alpine world. Detail stays on the driving line. */

function outline(c: CanvasRenderingContext2D, width: number) {
  c.strokeStyle = "#36586960"; c.lineWidth = Math.max(.5, width * .4); c.lineJoin = "round"; c.lineCap = "round"; c.stroke();
}
function blob(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, line = r * .12) {
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = fill; c.fill(); outline(c, line);
}
function backdrop(c: CanvasRenderingContext2D, w: number, h: number, sky: number, i: number, tilt: number, altitude: number) {
  const horizon = h * (.4 + tilt);
  const high = clamp(altitude / 140, 0, 1);
  const gradient = c.createLinearGradient(0, 0, 0, horizon);
  gradient.addColorStop(0, mix("#c6e9f3", "#a5c3e4", high)); gradient.addColorStop(1, "#f5fafc");
  c.fillStyle = gradient; c.fillRect(0, 0, w, h);
  c.fillStyle = "#fff0bf"; c.beginPath(); c.arc(w * .81, h * .15, h * .045, 0, TAU); c.fill();
  // Clouds drift as the road bends.
  c.fillStyle = "#ffffffd9";
  for (let k = 0; k < 4; k++) {
    const x = mod(k * w * .33 + i * 40 - sky * w * .15, w + 160) - 80, y = h * (.08 + (k % 2) * .09), s = h / 530 * (k % 2 ? .8 : 1);
    c.beginPath(); c.roundRect(x - 42 * s, y, 90 * s, 25 * s, 13 * s);
    c.moveTo(x + 11 * s, y); c.arc(x - 12 * s, y, 23 * s, 0, TAU);
    c.moveTo(x + 46 * s, y - 8 * s); c.arc(x + 17 * s, y - 8 * s, 29 * s, 0, TAU); c.fill();
  }
  const hills = (offset: number, base: number, amp: number, fill: string, freq: number) => {
    c.beginPath(); c.moveTo(-10, h);
    for (let x = -10; x <= w + 10; x += 8) c.lineTo(x, base - amp * (.55 + .45 * Math.sin((x + offset) / w * freq * TAU)));
    c.lineTo(w + 10, h); c.closePath(); c.fillStyle = fill; c.fill();
  };
  // Jagged, snow-capped ranges and a distant lake establish the mountain's
  // scale. The road is a ledge above this valley, not a stripe on flat grass.
  for (let layer = 0; layer < 3; layer++) {
    const base = horizon + h * (.1 + layer * .08), span = w * .38;
    for (let k = -2; k < 6; k++) {
      const x = k * span + mod(-sky * w * (.012 + layer * .006), span);
      const peak = base - h * (.28 + (k % 2 ? .08 : 0) - layer * .03);
      c.beginPath(); c.moveTo(x - span * .6, base); c.lineTo(x - span * .14, peak + h * .07); c.lineTo(x, peak); c.lineTo(x + span * .7, base); c.closePath();
      c.fillStyle = ["#d9e7ed", "#bdd4df", "#98bdcf"][layer]; c.fill();
      // The shaded face makes each peak read as a solid, folded form.
      c.beginPath(); c.moveTo(x, peak); c.lineTo(x + span * .7, base); c.lineTo(x + span * .08, base); c.closePath();
      c.fillStyle = ["#cbdde6", "#abc8d8", "#83aabd"][layer]; c.fill();
      c.beginPath(); c.moveTo(x, peak); c.lineTo(x + span * .18, peak + h * .075); c.lineTo(x + span * .035, peak + h * .055); c.lineTo(x - span * .06, peak + h * .085); c.lineTo(x - span * .14, peak + h * .07); c.closePath();
      c.fillStyle = layer === 0 ? "#ffffff" : "#e5f0f5"; c.fill();
    }
  }
  hills(-sky * w * .05, horizon + h * .5, h * .16, "#82b7a7", 1.3);
  c.beginPath(); c.moveTo(w * .48, horizon + h * .18); c.bezierCurveTo(w * .85, h * .7, w * .12, h * .75, w * .4, h); c.lineTo(w * .62, h); c.bezierCurveTo(w * .35, h * .75, w * .98, h * .7, w * .51, horizon + h * .18); c.closePath(); c.fillStyle = "#8dcad8"; c.fill();
  if (high > .4) {
    c.fillStyle = "#f3f7ff45";
    for (let k = 0; k < 3; k++) { c.beginPath(); c.ellipse(w * (k * .45 + .05), horizon + h * (.27 + k * .08), w * .32, h * .035, 0, 0, TAU); c.fill(); }
  }
}
function drawRoad(c: CanvasRenderingContext2D, v: ReturnType<typeof projectTrack>, w: number, h: number) {
  const quad = (a: Projected, b: Projected, from: number, to: number, color: string) => {
    const wa = RW * a.scale * w / 2, wb = RW * b.scale * w / 2;
    c.fillStyle = color; c.beginPath();
    // Overlap adjoining bands by a subpixel: WebKit otherwise exposes the
    // background through independently antialiased shared edges.
    c.moveTo(a.x + wa * from, a.y + .5); c.lineTo(a.x + wa * to, a.y + .5);
    c.lineTo(b.x + wb * to, b.y - .5); c.lineTo(b.x + wb * from, b.y - .5); c.closePath(); c.fill();
  };
  const edge = (p: Projected, lane: number, lift = 0) => ({ x: p.x + lane * RW * p.scale * w / 2, y: p.y - lift * p.scale * h / 2 });
  // Draw terrain behind the asphalt. Elevated sections reveal the valley.
  for (const { index, seg, p1, p2, visible } of v.segs) {
    if (!visible) continue;
    const palette = PALETTES[index];
    if (seg.terrain === "ground" || seg.terrain === "tunnel") {
      // Terrain has a world-space width too. Full-screen strips leave bands
      // floating across the sky when viewed from an exposed bridge or cliff.
      const shoulder = seg.width + (seg.terrain === "tunnel" ? 3 : 7);
      quad(p1, p2, -shoulder, shoulder, seg.terrain === "tunnel" ? "#43566a" : Math.floor(index / 3) % 2 === 0 ? palette.grass : palette.verge);
    } else if (seg.terrain === "cliff") {
      const side = seg.cliffSide, a = edge(p1, side * seg.width * 1.13), b = edge(p2, side * seg.width * 1.13);
      // The uphill side is solid rock; the outer side drops away completely.
      const rockA = edge(p1, side * (seg.width + 2.4), 40), rockB = edge(p2, side * (seg.width + 2.4), 40);
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(rockB.x, rockB.y); c.lineTo(rockA.x, rockA.y); c.closePath();
      c.fillStyle = index % 3 ? "#a4b5bb" : "#9cadb4"; c.fill();
      const outerA = edge(p1, -side * seg.width * 1.08), outerB = edge(p2, -side * seg.width * 1.08);
      c.beginPath(); c.moveTo(outerA.x, outerA.y); c.lineTo(outerB.x, outerB.y); c.lineTo(outerB.x + side * p2.scale * w * 8, outerB.y + p2.scale * h * 32); c.lineTo(outerA.x + side * p1.scale * w * 8, outerA.y + p1.scale * h * 32); c.closePath(); c.fillStyle = "#7c99a8"; c.fill();
    } else if (!seg.gap) {
      // Suspended bridge deck and pillars, with open air underneath.
      const a = edge(p1, -seg.width), b = edge(p1, seg.width);
      c.fillStyle = "#526d7b"; c.fillRect(a.x, a.y, b.x - a.x, Math.max(1, 5 * p1.scale * h / 2));
      if (index % 4 === 0) for (const side of [-1, 1]) {
        const q = edge(p2, side * seg.width * .8); c.fillStyle = "#789199"; c.fillRect(q.x - p2.scale * w, q.y, p2.scale * w * 2, p2.scale * h * 90);
      }
    }
  }
  for (const { index, seg, p1, p2, visible } of v.segs) {
    if (!visible) continue;
    const band = Math.floor(index / 3) % 2 === 0, palette = PALETTES[index], width = seg.width;
    if (seg.gap) {
      // No asphalt or lane markings across a broken span. A rocky rim and
      // dark chasm read clearly even when the far valley is a similar color.
      quad(p1, p2, -width, width, "#314b68");
      quad(p1, p2, -width * 1.07, -width, "#bd925f"); quad(p1, p2, width, width * 1.07, "#bd925f");
      continue;
    }
    // Draw curbs only beside the asphalt. A full white underlay bleeds through
    // the antialiased joins between road segments, especially in Safari.
    for (const side of [-1, 1]) {
      const edge = side * width;
      quad(p1, p2, edge * 1.025, edge * 1.075, band ? palette.stripe : "#fff6e8");
      quad(p1, p2, edge, edge * 1.025, "#f5faf8");
    }
    quad(p1, p2, -width, width, seg.terrain === "bridge" ? "#b8a38a" : palette.road);
    if (seg.terrain !== "bridge") {
      // Recessed shoulders define the road without adding busy asphalt texture.
      quad(p1, p2, -width, -width * .94, palette.shoulder);
      quad(p1, p2, width * .94, width, palette.shoulder);
    }
    if (seg.terrain === "bridge" && band) {
      c.strokeStyle = "#756958"; c.lineWidth = Math.max(1, p2.scale * w * .15);
      const a = edge(p2, -width), b = edge(p2, width); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
    if (seg.shortcut !== undefined) {
      const side = seg.shortcut;
      quad(p1, p2, side > 0 ? 1.04 : -1.4, side > 0 ? 1.4 : -1.04, "#e5bc72");
      if (band) quad(p1, p2, side * 1.2 - .025, side * 1.2 + .025, "#fff3c3");
    }
    if (seg.ramp) {
      quad(p1, p2, -width, width, "#ec9c51");
      for (let k = 0; k < 6; k++) quad(p1, p2, (-1 + k / 3) * width, (-1 + k / 3 + .13) * width, "#fff3aa");
    } else if (band) for (const line of [-.33, .33]) quad(p1, p2, (line - .007) * width, (line + .007) * width, "#d5e2df");
    if (index === 0) for (let k = 0; k < 10; k++) quad(p1, p2, -1 + k / 5, -1 + (k + 1) / 5, k % 2 ? "#fffdf5" : INK);
    if (seg.pad !== undefined) {
      quad(p1, p2, seg.pad - .17, seg.pad + .17, "#ffd668"); quad(p1, p2, seg.pad - .1, seg.pad + .1, "#f3a73f");
      const x = (p1.x + p2.x) / 2 + seg.pad * RW * (p1.scale + p2.scale) * w / 4;
      const y = (p1.y + p2.y) / 2, size = RW * p2.scale * w * .09;
      c.beginPath(); c.moveTo(x - size, y + size / 2); c.lineTo(x, y - size / 2); c.lineTo(x + size, y + size / 2); c.strokeStyle = "#fff8cf"; c.lineWidth = Math.max(1, size * .25); c.stroke();
    }
    if (seg.hole) {
      const { lane, width: holeWidth } = seg.hole;
      quad(p1, p2, lane - holeWidth - .025, lane + holeWidth + .025, "#efbb72");
      quad(p1, p2, lane - holeWidth, lane + holeWidth, "#263e56");
      quad(p1, p2, lane - holeWidth, lane - holeWidth + .07, "#637487");
    }
    // Bridge rails are physical barriers. Cliff-edge bollards are just markers.
    if (seg.terrain === "bridge" || seg.terrain === "cliff") for (const side of [-1, 1]) {
      const a = edge(p1, side * width * 1.06, 3), b = edge(p2, side * width * 1.06, 3), foot = edge(p2, side * width * 1.06);
      c.strokeStyle = seg.terrain === "bridge" ? "#c66055" : "#f6ce7d"; c.lineWidth = Math.max(1.5, p2.scale * w * .7);
      c.beginPath(); if (seg.terrain === "bridge") { c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }
      if (index % 2 === 0) { c.moveTo(b.x, b.y); c.lineTo(foot.x, foot.y); } c.stroke();
    }
  }
}
function tunnelInterior(c: CanvasRenderingContext2D, w: number, h: number, progress: number) {
  // The exit remains visible inside an opaque rock arch. A translucent tint
  // alone would leave the sky overhead and feel like an outdoor road.
  const shade = c.createLinearGradient(0, 0, 0, h); shade.addColorStop(0, "#172a3e"); shade.addColorStop(1, "#465c70");
  c.beginPath(); c.moveTo(0, h); c.lineTo(0, 0); c.lineTo(w, 0); c.lineTo(w, h); c.lineTo(w * .97, h);
  c.bezierCurveTo(w * .94, h * .28, w * .76, h * .18, w * .5, h * .18);
  c.bezierCurveTo(w * .24, h * .18, w * .06, h * .28, w * .03, h); c.closePath(); c.fillStyle = shade; c.fill();
  c.strokeStyle = "#7895ab"; c.lineWidth = Math.max(2, w * .004);
  c.beginPath(); c.moveTo(w * .03, h); c.bezierCurveTo(w * .06, h * .28, w * .24, h * .18, w * .5, h * .18);
  c.bezierCurveTo(w * .76, h * .18, w * .94, h * .28, w * .97, h); c.stroke();
  // Steady guide lamps, never a strobe; their movement follows the road.
  for (let k = 0; k < 4; k++) {
    const t = ((progress / 180 + k / 4) % 1), y = h * (.15 + t * .55);
    c.fillStyle = "#a6eee5"; c.fillRect(w * .04, y, 5 + t * 7, 3 + t * 3); c.fillRect(w * .96 - 5 - t * 7, y, 5 + t * 7, 3 + t * 3);
  }
}

function scenery(c: CanvasRenderingContext2D, kind: Scenery, x: number, y: number, s: number, half: number, time: number) {
  if (s < .05) return;
  if (kind === "danger") {
    c.fillStyle = "#6c7181"; c.fillRect(x - .5 * s, y - 10 * s, s, 10 * s);
    c.beginPath(); c.moveTo(x, y - 18 * s); c.lineTo(x + 5 * s, y - 9 * s); c.lineTo(x - 5 * s, y - 9 * s); c.closePath(); c.fillStyle = "#ffd87c"; c.fill(); outline(c, s * .5);
    // The exclamation mark is drawn, not typed: a bar and a dot.
    c.fillStyle = INK; c.beginPath(); c.roundRect(x - .45 * s, y - 15.6 * s, .9 * s, 3.6 * s, .45 * s); c.fill();
    c.beginPath(); c.arc(x, y - 10.9 * s, .5 * s, 0, TAU); c.fill();
  } else if (kind === "portal") {
    const left = x - half * .9, right = x + half * .9, top = y - 30 * s;
    c.strokeStyle = "#516073"; c.lineWidth = 5 * s; c.beginPath(); c.moveTo(left, y); c.lineTo(left, top + 9 * s); c.quadraticCurveTo(x, top - 11 * s, right, top + 9 * s); c.lineTo(right, y); c.stroke();
    c.strokeStyle = "#98cdd2"; c.lineWidth = s; c.stroke();
  } else if (kind === "pylon") {
    for (const side of [-1, 1]) {
      const px = x + side * half * .77;
      c.fillStyle = "#b85c58"; c.fillRect(px - s, y - 25 * s, 2 * s, 25 * s);
      c.beginPath(); c.moveTo(px, y - 23 * s); c.lineTo(px + side * 6 * s, y - 3 * s); c.strokeStyle = "#edbd9e"; c.lineWidth = Math.max(1, s * .6); c.stroke();
    }
    c.fillStyle = "#b85c58"; c.fillRect(x - half * .77, y - 25 * s, half * 1.54, 2 * s);
  } else if (kind === "palm") {
    c.beginPath(); c.moveTo(x - s, y); c.quadraticCurveTo(x + 3 * s, y - 8 * s, x, y - 17 * s);
    c.strokeStyle = "#b98758"; c.lineWidth = 3 * s; c.stroke();
    for (let k = 0; k < 5; k++) {
      const a = Math.PI + k * Math.PI / 4;
      c.beginPath(); c.moveTo(x, y - 17 * s); c.quadraticCurveTo(x + Math.cos(a) * 8 * s, y - 22 * s, x + Math.cos(a) * 12 * s, y - 13 * s + Math.sin(a) * 4 * s);
      c.strokeStyle = k % 2 ? "#3e9f82" : "#63b991"; c.lineWidth = 2.5 * s; c.stroke();
    }
    blob(c, x + s, y - 16 * s, 1.4 * s, "#c58b53");
  } else if (kind === "crystal") {
    for (const dx of [-3, 3]) {
      c.beginPath(); c.moveTo(x + dx * s, y); c.lineTo(x + (dx - 3) * s, y - 10 * s); c.lineTo(x + dx * s, y - (dx < 0 ? 19 : 14) * s); c.lineTo(x + (dx + 3) * s, y - 10 * s); c.closePath();
      const crystal = c.createLinearGradient(x + (dx - 3) * s, y - 16 * s, x + (dx + 3) * s, y);
      crystal.addColorStop(0, "#e1f7ff"); crystal.addColorStop(1, "#86aeca"); c.fillStyle = crystal; c.fill();
      c.beginPath(); c.moveTo(x + dx * s, y); c.lineTo(x + dx * s, y - (dx < 0 ? 19 : 14) * s); c.lineTo(x + (dx + 3) * s, y - 10 * s); c.closePath(); c.fillStyle = "#adcfe2"; c.fill();
    }
  } else if (kind === "tower") {
    c.fillStyle = "#46586c"; c.fillRect(x - 5 * s, y - 22 * s, 10 * s, 22 * s);
    c.fillStyle = "#a4b9c5"; c.fillRect(x - 6 * s, y - 23 * s, 12 * s, 3 * s);
    for (let k = 0; k < 3; k++) { c.fillStyle = k % 2 ? "#80dfcf" : "#ffd668"; c.fillRect(x - 3 * s, y - (7 + k * 5) * s, 6 * s, 2 * s); }
    blob(c, x, y - 25 * s, 2 * s, "#fb9c79");
  } else if (kind === "tree") {
    c.fillStyle = "#386c5630"; c.beginPath(); c.ellipse(x + 2 * s, y, 7 * s, 1.4 * s, 0, 0, TAU); c.fill();
    c.fillStyle = "#b89473"; c.beginPath(); c.roundRect(x - 1.1 * s, y - 13 * s, 2.2 * s, 13 * s, .8 * s); c.fill();
    c.beginPath(); c.moveTo(x, y - 25 * s);
    c.bezierCurveTo(x + 6 * s, y - 25 * s, x + 10 * s, y - 15 * s, x + 8 * s, y - 10 * s);
    c.bezierCurveTo(x + 6 * s, y - 5 * s, x - 6 * s, y - 5 * s, x - 8 * s, y - 10 * s);
    c.bezierCurveTo(x - 10 * s, y - 15 * s, x - 6 * s, y - 25 * s, x, y - 25 * s);
    const leaf = c.createLinearGradient(x - 8 * s, y - 20 * s, x + 9 * s, y - 9 * s);
    leaf.addColorStop(0, "#b2e4ac"); leaf.addColorStop(.5, "#84c99b"); leaf.addColorStop(1, "#5aa58b");
    c.fillStyle = leaf; c.fill();
    c.beginPath(); c.ellipse(x - 3 * s, y - 19 * s, 2.2 * s, 3.5 * s, .5, 0, TAU); c.fillStyle = "#d4f0c45c"; c.fill();
  } else if (kind === "pine") {
    c.fillStyle = "#386c5626"; c.beginPath(); c.ellipse(x + s, y, 7 * s, 1.2 * s, 0, 0, TAU); c.fill();
    c.fillStyle = "#b89473"; c.fillRect(x - s, y - 5 * s, 2 * s, 5 * s);
    for (let k = 0; k < 3; k++) {
      const top = y - (14 + k * 5) * s, base = y - (3 + k * 5) * s, wide = (8 - k * 2) * s;
      c.beginPath(); c.moveTo(x, top); c.quadraticCurveTo(x + wide * .4, base - 3 * s, x + wide, base);
      c.quadraticCurveTo(x, base + 2 * s, x - wide, base); c.quadraticCurveTo(x - wide * .4, base - 3 * s, x, top);
      c.fillStyle = ["#559d87", "#6db599", "#8dcdaa"][k]; c.fill();
      c.beginPath(); c.moveTo(x, top); c.lineTo(x, base + s); c.quadraticCurveTo(x - wide * .6, base + s, x - wide, base); c.closePath(); c.fillStyle = "#ffffff13"; c.fill();
    }
  } else if (kind === "bush") {
    blob(c, x - 3 * s, y - 2.5 * s, 3.2 * s, "#86c48f", s * .35); blob(c, x + 3 * s, y - 2.5 * s, 3.2 * s, "#86c48f", s * .35); blob(c, x, y - 4 * s, 3.8 * s, "#94cf9b", s * .35);
  } else if (kind === "flowers") {
    ["#fa8878", "#ffd668", "#8e92dc"].forEach((color, k) => {
      const fx = x + (k - 1) * 2.2 * s, fy = y - (2.2 + (k % 2) * .8) * s;
      c.beginPath(); c.moveTo(fx, y); c.lineTo(fx, fy); c.strokeStyle = "#5fa47a"; c.lineWidth = Math.max(1, s * .35); c.stroke();
      c.fillStyle = color; c.beginPath(); c.arc(fx, fy, .8 * s, 0, TAU); c.fill();
    });
  } else if (kind === "sign-left" || kind === "sign-right") {
    c.fillStyle = "#a87553"; c.fillRect(x - .6 * s, y - 7 * s, 1.2 * s, 7 * s);
    c.beginPath(); c.roundRect(x - 4.5 * s, y - 12 * s, 9 * s, 6 * s, s); c.fillStyle = "#ffd668"; c.fill(); outline(c, s * .35);
    const d = kind === "sign-right" ? 1 : -1;
    c.beginPath();
    for (const off of [-1.8, 1.2]) { c.moveTo(x + (off - d * .8) * s, y - 11 * s); c.lineTo(x + (off + d * .8) * s, y - 9 * s); c.lineTo(x + (off - d * .8) * s, y - 7 * s); }
    outline(c, s * .7);
  } else if (kind === "balloons") {
    ["#fa8878", "#8e92dc", "#ffd668"].forEach((color, k) => {
      const bx = x + (k - 1) * 3 * s, by = y - (14 + Math.sin(time * 2 + k) + (k % 2) * 3) * s;
      c.beginPath(); c.moveTo(bx, by + 3 * s); c.lineTo(x, y); c.strokeStyle = INK; c.lineWidth = Math.max(1, s * .2); c.stroke();
      c.beginPath(); c.ellipse(bx, by, 2.4 * s, 3 * s, 0, 0, TAU); c.fillStyle = color; c.fill(); outline(c, s * .3);
    });
  } else if (kind === "arch") {
    const left = x - half * 1.25, right = x + half * 1.25, top = y - 36 * s;
    for (const px of [left, right]) { c.beginPath(); c.roundRect(px - 1.5 * s, top, 3 * s, 36 * s, s); c.fillStyle = "#8e92dc"; c.fill(); outline(c, s * .4); }
    c.beginPath(); c.roundRect(left - 2 * s, top - 3 * s, right - left + 4 * s, 7 * s, 2 * s); c.fillStyle = "#fffdf5"; c.fill(); outline(c, s * .4);
    const cells = 16, cw = (right - left) / cells;
    for (let k = 0; k < cells; k++) for (let r = 0; r < 2; r++) if ((k + r) % 2) { c.fillStyle = INK; c.fillRect(left + k * cw, top - 2 * s + r * 2.5 * s, cw, 2.5 * s); }
  }
}
function cone(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.beginPath(); c.moveTo(x, y - 7 * s); c.lineTo(x + 2.8 * s, y - .8 * s); c.lineTo(x - 2.8 * s, y - .8 * s); c.closePath(); c.fillStyle = "#f6965a"; c.fill(); outline(c, s * .35);
  c.fillStyle = "#fffaf0"; c.fillRect(x - 1.5 * s, y - 4.2 * s, 3 * s, 1.1 * s);
  c.beginPath(); c.roundRect(x - 4 * s, y - 1.2 * s, 8 * s, 1.4 * s, .6 * s); c.fillStyle = "#e57f48"; c.fill(); outline(c, s * .3);
}
function hay(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.beginPath(); c.roundRect(x - 5 * s, y - 6 * s, 10 * s, 6 * s, 1.5 * s); c.fillStyle = "#f2cf72"; c.fill(); outline(c, s * .35);
  c.beginPath(); for (const off of [-2.5, 2.5]) { c.moveTo(x + off * s, y - 6 * s); c.lineTo(x + off * s, y); } c.strokeStyle = "#c99a3c"; c.lineWidth = Math.max(1, s * .5); c.stroke();
}
function obstacleSprite(c: CanvasRenderingContext2D, kind: Obstacle["kind"], x: number, y: number, s: number) {
  if (kind === "cone") { cone(c, x, y, s); return; }
  if (kind === "hay") { hay(c, x, y, s); return; }
  if (kind === "oil") {
    c.beginPath(); c.ellipse(x, y - .3 * s, 7 * s, 2.2 * s, 0, 0, TAU); c.fillStyle = "#38445c"; c.fill();
    c.beginPath(); c.ellipse(x - s, y - .7 * s, 4 * s, .8 * s, -.1, 0, TAU); c.strokeStyle = "#a29bcf"; c.lineWidth = Math.max(1, .5 * s); c.stroke();
    return;
  }
  c.beginPath(); c.roundRect(x - 3.5 * s, y - 8 * s, 7 * s, 8 * s, s); c.fillStyle = "#d58c64"; c.fill(); outline(c, .4 * s);
  for (const dy of [-6, -2]) { c.fillStyle = "#4e6578"; c.fillRect(x - 3.5 * s, y + dy * s, 7 * s, s); }
}
function movingObstacle(c: CanvasRenderingContext2D, x: number, y: number, s: number, snow: boolean, time: number) {
  if (snow) {
    blob(c, x, y - 5 * s, 5 * s, "#edf7ff", .4 * s);
    c.beginPath(); c.arc(x, y - 5 * s, 3 * s, time * 3, time * 3 + Math.PI); c.strokeStyle = "#afcde4"; c.lineWidth = Math.max(1, s * .5); c.stroke();
  } else {
    blob(c, x, y - 2 * s, 2 * s, "#40576b");
    c.save(); c.translate(x, y - 4 * s); c.rotate(Math.sin(time * 2) * .3);
    c.beginPath(); c.roundRect(-7 * s, -2 * s, 14 * s, 4 * s, s); c.fillStyle = "#ffc657"; c.fill(); outline(c, s * .4);
    for (let k = -5; k <= 5; k += 4) { c.fillStyle = "#40576b"; c.fillRect(k * s, -1.8 * s, 1.5 * s, 3.6 * s); }
    c.restore();
  }
}
function box(c: CanvasRenderingContext2D, x: number, y: number, s: number, time: number) {
  c.save(); c.translate(x, y - 3.5 * s); c.rotate(Math.sin(time * 2) * .07);
  c.fillStyle = "#19597026"; c.beginPath(); c.ellipse(0, 7 * s, 3.4 * s, .7 * s, 0, 0, TAU); c.fill();
  const g = c.createLinearGradient(-3 * s, -4 * s, 3 * s, 4 * s);
  g.addColorStop(0, "#a3f0e1"); g.addColorStop(.45, "#51cdbb"); g.addColorStop(1, "#269da9");
  c.beginPath(); c.roundRect(-3.7 * s, -3.7 * s, 7.4 * s, 7.4 * s, 1.4 * s); c.fillStyle = g; c.fill();
  c.beginPath(); c.roundRect(-3.1 * s, -3.1 * s, 6.2 * s, 6.2 * s, s); c.strokeStyle = "#ffffff85"; c.lineWidth = .2 * s; c.stroke();
  c.beginPath(); c.moveTo(-1.4 * s, -1.2 * s); c.quadraticCurveTo(-1.4 * s, -2.5 * s, 0, -2.5 * s); c.quadraticCurveTo(1.5 * s, -2.5 * s, 1.5 * s, -1.2 * s);
  c.quadraticCurveTo(1.5 * s, -.2 * s, 0, .3 * s); c.lineTo(0, .7 * s);
  c.strokeStyle = "#ffffff"; c.lineWidth = .75 * s; c.lineCap = "round"; c.lineJoin = "round"; c.stroke();
  c.beginPath(); c.arc(0, 1.9 * s, .43 * s, 0, TAU); c.fillStyle = "#fff"; c.fill(); c.restore();
}
function coin(c: CanvasRenderingContext2D, x: number, y: number, s: number, time: number) {
  const width = .65 + Math.abs(Math.cos(time * 2.6)) * .75;
  c.save(); c.translate(x, y - 1.6 * s); c.scale(width, 1);
  c.beginPath(); c.ellipse(.2 * s, .15 * s, 1.65 * s, 1.85 * s, 0, 0, TAU); c.fillStyle = "#c98b28"; c.fill();
  const gold = c.createLinearGradient(-s, -2 * s, s, 2 * s);
  gold.addColorStop(0, "#fff3ad"); gold.addColorStop(.5, "#ffda69"); gold.addColorStop(1, "#ecad36");
  c.beginPath(); c.ellipse(0, 0, 1.5 * s, 1.75 * s, 0, 0, TAU); c.fillStyle = gold; c.fill();
  c.beginPath(); c.ellipse(0, 0, 1.05 * s, 1.3 * s, 0, 0, TAU); c.strokeStyle = "#fff5be"; c.lineWidth = .16 * s; c.stroke();
  c.fillStyle = "#c58d31"; c.beginPath(); c.roundRect(-.16 * s, -.7 * s, .32 * s, 1.4 * s, .15 * s); c.fill(); c.restore();
}
function sheep(c: CanvasRenderingContext2D, x: number, y: number, s: number, time: number) {
  const hop = Math.abs(Math.sin(time * 5)) * .6 * s;
  c.fillStyle = INK; for (const off of [-2, 2]) c.fillRect(x + off * s - .5 * s, y - 2.5 * s, s, 2.5 * s);
  for (const [dx, dy, r] of [[-2.5, -4.5, 2.6], [2.5, -4.5, 2.6], [0, -6, 3], [0, -3.8, 2.8]]) blob(c, x + dx * s, y + dy * s - hop, r * s, "#fffdf7", s * .3);
  c.beginPath(); c.ellipse(x, y - 6.5 * s - hop, 1.8 * s, 2.2 * s, 0, 0, TAU); c.fillStyle = "#4b3f3a"; c.fill();
  for (const off of [-.7, .7]) { c.fillStyle = "#fff"; c.beginPath(); c.arc(x + off * s, y - 7 * s - hop, .45 * s, 0, TAU); c.fill(); }
}
function goo(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.beginPath(); c.ellipse(x, y - 1.5 * s, 4.5 * s, 2.2 * s, 0, 0, TAU); c.fillStyle = "#b48ad8"; c.fill(); outline(c, s * .35);
  for (const off of [-1.3, 1.3]) { c.fillStyle = "#fff"; c.beginPath(); c.arc(x + off * s, y - 2.3 * s, .8 * s, 0, TAU); c.fill(); c.fillStyle = INK; c.beginPath(); c.arc(x + off * s, y - 2.2 * s, .4 * s, 0, TAU); c.fill(); }
}
function bubble(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.beginPath(); c.arc(x, y - 2 * s, 3.5 * s, 0, TAU); c.fillStyle = "#aee3ff99"; c.fill(); c.strokeStyle = "#4f9fd0"; c.lineWidth = Math.max(1, s * .4); c.stroke();
  c.fillStyle = "#ffffffcc"; c.beginPath(); c.ellipse(x - 1.2 * s, y - 3.4 * s, 1 * s, .6 * s, -.6, 0, TAU); c.fill();
}
function kart(c: CanvasRenderingContext2D, x: number, y: number, ground: number, s: number, p: Kart, time: number, own: boolean, reducedMotion = false) {
  if (reducedMotion) time = 0;
  const lift = ground - y;
  c.fillStyle = "#29465a33"; c.beginPath(); c.ellipse(x, ground, 5.5 * s * (1 - Math.min(.5, lift / (40 * s))), 1.3 * s, 0, 0, TAU); c.fill();
  c.save(); c.translate(x, y);
  if (!reducedMotion && p.trick && p.flying) c.rotate(Math.sin(Math.min(1, p.airTime * 2) * TAU) * .3);
  else if (p.driftCharge > 0) c.rotate(-p.driftDirection * .12);
  if (p.star > 0) {
    c.beginPath(); c.ellipse(0, -5 * s, 8 * s, 9 * s, 0, 0, TAU); c.fillStyle = "#ffe5a05c"; c.fill();
  }
  if (p.magnet > 0) {
    c.beginPath(); c.ellipse(0, -3 * s, (10 + Math.sin(time * 5)) * s, 4 * s, 0, 0, TAU); c.strokeStyle = "#f597b6"; c.lineWidth = Math.max(1, s * .4); c.stroke();
  }
  if (p.driftCharge > .2) {
    for (const off of [-5, 5]) {
      for (let k = 0; k < 3; k++) {
        const tail = (k * 1.8 + time * 22 % 2) * s;
        c.beginPath(); c.moveTo(off * s, -s + tail); c.lineTo((off + Math.sign(off)) * s, tail + s);
        c.strokeStyle = p.driftCharge >= 1.6 ? "#ffbc55" : "#77e7ff"; c.lineWidth = Math.max(1.5, s * .6); c.stroke();
      }
    }
  }
  if (!reducedMotion && p.spin > 0) c.rotate(Math.sin(p.spin * 18) * .5);
  if (p.boost > 0) {
    for (const off of [-1.6, 1.6]) {
      const len = (3 + Math.sin(time * 40 + off) * .8) * s;
      c.beginPath(); c.moveTo(off * s - 1.1 * s, -1.6 * s); c.quadraticCurveTo(off * s, len, off * s + 1.1 * s, -1.6 * s); c.fillStyle = "#ffb347"; c.fill();
      c.beginPath(); c.moveTo(off * s - .5 * s, -1.6 * s); c.quadraticCurveTo(off * s, len * .6, off * s + .5 * s, -1.6 * s); c.fillStyle = "#fff0a8"; c.fill();
    }
  }
  // Four rubber tires, recessed hubs and a low, rounded body make a toy kart.
  const lean = clamp(p.drift * .025, -.07, .07);
  c.rotate(lean);
  for (const off of [-3.6, 3.6]) {
    c.save(); c.translate(off * s, -5 * s); c.rotate(clamp(p.drift * .08, -.28, .28));
    roundRect(c, -.9 * s, -1.4 * s, 1.8 * s, 2.8 * s, "#30434d", .65 * s);
    roundRect(c, -.5 * s, -1.1 * s, .35 * s, 1.9 * s, "#8b9da2", .16 * s);
    c.restore();
  }
  roundRect(c, -4.4 * s, -3 * s, 8.8 * s, s, "#394f59", .4 * s);
  for (const off of [-4.1, 4.1]) {
    const tire = c.createLinearGradient((off - 1.3) * s, 0, (off + 1.3) * s, 0);
    tire.addColorStop(0, "#233943"); tire.addColorStop(.45, "#4b6069"); tire.addColorStop(1, "#233943");
    c.beginPath(); c.roundRect((off - 1.25) * s, -3.8 * s, 2.5 * s, 3.9 * s, .8 * s); c.fillStyle = tire; c.fill();
    c.save(); c.clip();
    const tread = reducedMotion ? 0 : mod(p.progress * .025, .95);
    c.strokeStyle = "#1e36434d"; c.lineWidth = .15 * s; c.beginPath();
    for (let k = 0; k < 5; k++) {
      const ty = (-4.2 + k * .95 + tread) * s;
      c.moveTo((off - 1.2) * s, ty); c.lineTo((off + 1.2) * s, ty + .25 * s);
    }
    c.stroke(); c.restore();
    roundRect(c, (off - .85) * s, -3.4 * s, .2 * s, 2.9 * s, "#84959a70", .1 * s);
    roundRect(c, (off + .65) * s, -3.4 * s, .2 * s, 2.9 * s, "#0e263940", .1 * s);
  }
  const body = c.createLinearGradient(-3 * s, -7 * s, 3 * s, 0);
  body.addColorStop(0, mix(p.color, "#ffffff", .48)); body.addColorStop(.4, p.color); body.addColorStop(1, mix(p.color, "#172b38", .18));
  c.beginPath(); c.moveTo(-3.7 * s, -1.4 * s); c.quadraticCurveTo(-4.6 * s, -5.5 * s, -2.6 * s, -6.8 * s);
  c.quadraticCurveTo(0, -7.7 * s, 2.6 * s, -6.8 * s); c.quadraticCurveTo(4.6 * s, -5.5 * s, 3.7 * s, -1.4 * s); c.closePath(); c.fillStyle = body; c.fill();
  c.beginPath(); c.moveTo(-3.45 * s, -2.2 * s); c.quadraticCurveTo(-4 * s, -5.4 * s, -2.45 * s, -6.35 * s);
  c.strokeStyle = "#ffffff90"; c.lineWidth = .2 * s; c.stroke();
  roundRect(c, -1.8 * s, -6.8 * s, 3.6 * s, 3 * s, "#30434d", s);
  roundRect(c, -.5 * s, -3.8 * s, s, 2.2 * s, "#ffffffcc", .25 * s);
  // Rear wing, lights and bumper. The wing repeats the player's seat color.
  for (const off of [-2.4, 2.4]) roundRect(c, (off - .2) * s, -4 * s, .4 * s, 2.5 * s, "#3a4d57", .1 * s);
  roundRect(c, -4.2 * s, -4.2 * s, 8.4 * s, 1.2 * s, mix(p.color, "#ffffff", .18), .4 * s);
  roundRect(c, -3.8 * s, -4.1 * s, 7.6 * s, .22 * s, "#ffffff78", .1 * s);
  roundRect(c, -3.5 * s, -1.8 * s, 7 * s, .8 * s, "#e8eff0", .4 * s);
  for (const off of [-2.6, 2.6]) roundRect(c, (off - .55) * s, -2.8 * s, 1.1 * s, .5 * s, "#ffb5a0", .2 * s);
  // A pearl helmet with a colored stripe and shaded neck guard.
  const helmet = c.createLinearGradient(-2 * s, -10 * s, 2 * s, -5 * s);
  helmet.addColorStop(0, "#ffffff"); helmet.addColorStop(.5, "#f5f8f5"); helmet.addColorStop(1, "#c2d3da");
  c.beginPath(); c.ellipse(0, -7.8 * s, 2.1 * s, 2.35 * s, 0, 0, TAU); c.fillStyle = helmet; c.fill();
  c.beginPath(); c.ellipse(0, -8.25 * s, .45 * s, 1.9 * s, 0, Math.PI, TAU); c.fillStyle = p.color; c.fill();
  c.beginPath(); c.ellipse(0, -6.3 * s, 1.45 * s, .38 * s, 0, 0, Math.PI); c.strokeStyle = "#8da8b4"; c.lineWidth = .26 * s; c.stroke();
  if (own) {
    // A small rear badge identifies the controlled kart without a tall flag.
    c.beginPath(); c.arc(0, -3.6 * s, .48 * s, 0, TAU); c.fillStyle = "#fff6cb"; c.fill();
  }
  if (p.draft > .2) {
    // Wind streaks while tucked into a slipstream.
    c.strokeStyle = "#ffffffcc"; c.lineWidth = Math.max(1, s * .4); c.beginPath();
    for (const off of [-1, 1]) for (let k = 0; k < 2; k++) {
      const x0 = off * (6.5 + k * 1.5) * s, y0 = (-8 + k * 3 + ((time * 30) % 3)) * s;
      c.moveTo(x0, y0); c.lineTo(x0, y0 + 3 * s);
    }
    c.stroke();
  }
  if (p.spark > 0) {
    // A bright star where karts bumped.
    const r = (1 + (.3 - p.spark) * 8) * s;
    c.beginPath();
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, len = k % 2 ? r * .45 : r; c.lineTo(Math.cos(a) * len, -4 * s + Math.sin(a) * len); }
    c.closePath(); c.fillStyle = "#ffe27a"; c.fill(); outline(c, s * .25);
  }
  if (p.honk > 0) {
    for (let k = 0; k < 2; k++) {
      const r = ((.5 - p.honk) * 40 + k * 4) * s;
      c.beginPath(); c.ellipse(0, -3 * s, r, r * .45, 0, 0, TAU); c.strokeStyle = `rgba(255, 214, 104, ${p.honk * 2})`; c.lineWidth = Math.max(1.5, s * .8); c.stroke();
    }
  }
  if (p.cloud > 0) {
    // A little rain cloud follows the kart around.
    c.fillStyle = "#8fc6ea"; c.strokeStyle = "#8fc6ea"; c.lineWidth = Math.max(1, s * .3); c.beginPath();
    for (let k = 0; k < 5; k++) { const dx = (k - 2) * 1.6 * s, dy = (-12 + ((time * 40 + k * 7) % 6)) * s; c.moveTo(dx, dy); c.lineTo(dx - .4 * s, dy + 1.2 * s); }
    c.stroke();
    c.beginPath(); c.roundRect(-5 * s, -16 * s, 10 * s, 3.5 * s, 1.7 * s);
    c.moveTo(-.5 * s, -16 * s); c.arc(-2 * s, -16 * s, 2.5 * s, 0, TAU); c.moveTo(4.5 * s, -16.5 * s); c.arc(1.5 * s, -16.5 * s, 3 * s, 0, TAU);
    outline(c, s * .6); c.fillStyle = "#c7d3e6"; c.fill();
  }
  if (p.shield > 0) {
    c.beginPath(); c.ellipse(0, -5 * s, 7.5 * s, 7 * s, 0, 0, TAU); c.fillStyle = "#aee3ff40"; c.fill();
    c.strokeStyle = p.shield < 1.5 ? "#6cc3f099" : "#6cc3f0"; c.lineWidth = Math.max(1.5, s * .5); c.stroke();
  }
  c.restore();
}
function itemIcon(c: CanvasRenderingContext2D, item: Item, x: number, y: number, s: number) {
  if (item === "Star") {
    c.beginPath();
    for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, r = (k % 2 ? 4 : 9) * s; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    c.closePath(); c.fillStyle = "#ffd668"; c.fill(); outline(c, 1.5);
  } else if (item === "Magnet") {
    c.beginPath(); c.arc(x, y - 2 * s, 5 * s, 0, Math.PI); c.lineTo(x - 5 * s, y - 6 * s);
    c.moveTo(x + 5 * s, y - 2 * s); c.lineTo(x + 5 * s, y - 6 * s); c.strokeStyle = "#e57895"; c.lineWidth = 4 * s; c.stroke();
    c.fillStyle = "#d8efff"; c.fillRect(x - 7 * s, y - 7 * s, 4 * s, 3 * s); c.fillRect(x + 3 * s, y - 7 * s, 4 * s, 3 * s);
  } else if (item === "Spring") {
    c.beginPath(); c.moveTo(x - 6 * s, y + 7 * s);
    for (let k = 0; k < 6; k++) c.lineTo(x + (k % 2 ? -5 : 5) * s, y + (5 - k * 2) * s);
    c.strokeStyle = "#8f9ddd"; c.lineWidth = 2.5 * s; c.stroke();
    roundRect(c, x - 7 * s, y - 8 * s, 14 * s, 3 * s, "#f39d7a", s);
  } else if (item === "Triple") {
    for (const [dx, dy] of [[-4, 3], [4, 3], [0, -4]]) bubble(c, x + dx * s, y + dy * s, 1.1 * s);
  } else if (item === "Oil") {
    obstacleSprite(c, "oil", x, y + 3 * s, 1.4 * s);
  } else if (item === "Rocket") {
    c.beginPath(); c.moveTo(x, y - 9 * s); c.quadraticCurveTo(x + 5 * s, y - 4 * s, x + 3.5 * s, y + 5 * s); c.lineTo(x - 3.5 * s, y + 5 * s); c.quadraticCurveTo(x - 5 * s, y - 4 * s, x, y - 9 * s);
    c.fillStyle = "#fa8878"; c.fill(); outline(c, 1.5);
    blob(c, x, y - 2 * s, 1.6 * s, "#d7eced", 1.2);
    c.beginPath(); c.moveTo(x - 2.5 * s, y + 5 * s); c.lineTo(x, y + 9 * s); c.lineTo(x + 2.5 * s, y + 5 * s); c.fillStyle = "#ffd668"; c.fill();
  } else if (item === "Shield") {
    c.beginPath(); c.arc(x, y, 8 * s, 0, TAU); c.fillStyle = "#aee3ff"; c.fill(); c.strokeStyle = "#4f9fd0"; c.lineWidth = 2; c.stroke();
    c.fillStyle = "#ffffffcc"; c.beginPath(); c.ellipse(x - 3 * s, y - 3.5 * s, 2.4 * s, 1.3 * s, -.6, 0, TAU); c.fill();
  } else if (item === "Goo") {
    goo(c, x, y + 4 * s, 1.7 * s);
  } else if (item === "Cloud") {
    c.strokeStyle = "#5aa9d6"; c.lineWidth = 2; c.beginPath();
    for (const dx of [-4, 0, 4]) { c.moveTo(x + dx * s, y + 3 * s); c.lineTo(x + (dx - 1) * s, y + 7 * s); }
    c.stroke();
    c.beginPath(); c.roundRect(x - 8 * s, y - 2 * s, 16 * s, 5 * s, 2.5 * s);
    c.moveTo(x - 1 * s, y - 2 * s); c.arc(x - 3.5 * s, y - 2 * s, 3.5 * s, 0, TAU); c.moveTo(x + 7 * s, y - 3 * s); c.arc(x + 2.5 * s, y - 3 * s, 4.5 * s, 0, TAU);
    outline(c, 3); c.fillStyle = "#c7d3e6"; c.fill();
  } else if (item === "Honk") {
    c.beginPath(); c.moveTo(x - 7 * s, y - 2.5 * s); c.lineTo(x - 2 * s, y - 2.5 * s); c.lineTo(x + 5 * s, y - 7 * s); c.lineTo(x + 5 * s, y + 7 * s); c.lineTo(x - 2 * s, y + 2.5 * s); c.lineTo(x - 7 * s, y + 2.5 * s); c.closePath();
    c.fillStyle = "#ffd668"; c.fill(); outline(c, 1.5);
    c.beginPath(); c.arc(x + 5 * s, y, 4 * s, -.7, .7); c.moveTo(x + 5 * s + Math.cos(-.7) * 7 * s, y + Math.sin(-.7) * 7 * s); c.arc(x + 5 * s, y, 7 * s, -.7, .7); outline(c, 1.5);
  } else {
    bubble(c, x, y + 4 * s, 2.2 * s);
    c.fillStyle = "#ffd668"; c.beginPath(); c.arc(x + 4 * s, y - 5 * s, 1.5 * s, 0, TAU); c.fill();
  }
}
/** A small pennant on a pole at x, standing on the progress line at y. */
function lapFlag(c: CanvasRenderingContext2D, x: number, y: number, u: number, finish: boolean, passed: boolean) {
  const top = y - 15 * u, fw = 10 * u, fh = 7 * u;
  c.beginPath(); c.moveTo(x, y + 5 * u); c.lineTo(x, top); c.lineCap = "round"; c.lineWidth = 1.6 * u; c.strokeStyle = "#6f8a91"; c.stroke();
  if (finish) {
    // Checkered: a 3 × 2 grid of squares.
    const cw = fw / 3, ch = fh / 2;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? "#243f49" : "#fff"; c.fillRect(x + i * cw, top + j * ch, cw, ch); }
    c.strokeStyle = "#243f49"; c.lineWidth = 1 * u; c.strokeRect(x, top, fw, fh);
  } else {
    c.beginPath(); c.moveTo(x, top); c.lineTo(x + fw, top + fh / 2); c.lineTo(x, top + fh); c.closePath();
    c.fillStyle = passed ? "#74b9ae" : "#f0a24b"; c.fill();
  }
}
function hud(c: CanvasRenderingContext2D, w: number, h: number, p: Kart, karts: Kart[], time: number, reducedMotion = false) {
  const u = kartScale(w, h), pad = 14 * u;
  const ink = "#243f49", muted = "#536d77";
  const bottom = h - pad - 40 * u;
  // Rank is the largest instrument. The driving line stays open.
  const rankW = 112 * u, rankH = 72 * u, rx = w - pad - rankW;
  kartPanel(c, rx, pad, rankW, rankH, 14 * u, p.rank === 1 ? "#fff4d3" : "#f8fcfb");
  label(c, ordinal(p.rank), rx + rankW / 2, pad + 51 * u, 44 * u, ink, 750, "center");
  // One stable item slot: readiness, selection, and the action share one place.
  const shown = p.item ?? (p.roll > 0 ? reducedMotion ? p.pending : ITEMS[Math.floor(time * 8) % ITEMS.length] : null);
  const iy = pad + rankH + 10 * u, iw = rankW, ix = w - pad - iw;
  kartPanel(c, ix, iy, iw, 76 * u, 12 * u, p.item ? "#e4f6ef" : "#f8fcfb");
  if (shown) {
    c.save(); c.globalAlpha = p.item ? 1 : .6;
    itemIcon(c, shown, ix + iw / 2, iy + 28 * u, 2.1 * u); c.restore();
    label(c, p.item ? ITEM_NAMES[p.item] : "…", ix + iw / 2, iy + 65 * u, 16 * u, ink, 700, "center", iw - 8 * u);
  } else {
    // A quiet outline of the pickup teaches its shape before the first one.
    c.save(); c.globalAlpha = .6; box(c, ix + iw / 2, iy + 31 * u, 2.2 * u, 0); c.restore();
    label(c, "Find a ? box", ix + iw / 2, iy + 64 * u, 11 * u, muted, 600, "center");
  }
  // A single instrument strip replaces scattered floating pills.
  kartPanel(c, pad, bottom, w - 2 * pad, 40 * u, 12 * u);
  label(c, `Lap ${Math.min(LAPS, p.lap)}/${LAPS}`, pad + 13 * u, bottom + 26 * u, 16 * u, ink, 700);
  const start = pad + 100 * u;
  const end = w - pad - 82 * u;
  if (end - start > 30) {
    c.lineCap = "round"; c.lineWidth = 4 * u; c.strokeStyle = "#dce7e7";
    c.beginPath(); c.moveTo(start, bottom + 20 * u); c.lineTo(end, bottom + 20 * u); c.stroke();
    c.strokeStyle = "#74b9ae";
    c.beginPath(); c.moveTo(start, bottom + 20 * u); c.lineTo(start + (end - start) * clamp(p.progress / (LAP_LENGTH * LAPS), 0, 1), bottom + 20 * u); c.stroke();
    // A flag marks the end of each lap; the last one is the checkered finish.
    for (let lap = 1; lap <= LAPS; lap++) lapFlag(c, start + (end - start) * lap / LAPS, bottom + 20 * u, u, lap === LAPS, p.lap > lap || !!p.finish);
    [...karts].sort((a, b) => Number(a === p) - Number(b === p)).forEach(k => {
      const t = clamp(k.progress / (LAP_LENGTH * LAPS), 0, 1);
      c.beginPath(); c.arc(start + (end - start) * t, bottom + 20 * u, (k === p ? 8.5 : 6) * u, 0, TAU);
      c.fillStyle = k.color; c.fill(); c.strokeStyle = "#fff"; c.lineWidth = 2.5 * u; c.stroke();
    });
  }
  const pulse = !reducedMotion ? 1 + Math.sin(p.coinFlash / .35 * Math.PI) * .15 : 1;
  // The coin sits a fixed gap left of the count, so "10" fits as well as "3".
  font(c, 17 * u, 700);
  const coinsW = c.measureText(String(p.coins)).width;
  coin(c, w - pad - 14 * u - coinsW - 15 * u, bottom + 23 * u, 3.9 * u * pulse, 0);
  label(c, String(p.coins), w - pad - 14 * u, bottom + 26 * u, 17 * u, ink, 700, "right");
  // Charge has visible thresholds, so a child can discover when to release.
  const charge = p.driftCharge > .1 ? p.driftCharge / 2.4 : p.draft > .2 ? p.draft / 1.2 : 0;
  const boosting = p.boost > 0 || p.star > 0;
  if (charge || boosting) {
    const mx = pad, my = pad + 43 * u, mw = Math.min(152 * u, w - 2 * pad - iw - 12 * u);
    const drift = p.driftCharge > .1;
    const title = boosting ? "Turbo!" : drift ? p.driftCharge >= 1.6 ? "Super turbo!" : p.driftCharge >= .65 ? "Turbo ready" : "Drifting" : "Slipstream";
    kartPanel(c, mx, my, mw, 41 * u, 10 * u, boosting ? "#fff0c1" : "#f8fcfb");
    label(c, title, mx + 10 * u, my + 18 * u, 11 * u, ink, 650, "left", mw - 20 * u);
    const width = mw - 20 * u;
    roundRect(c, mx + 10 * u, my + 27 * u, width, 4 * u, "#dce7e7", 2 * u);
    roundRect(c, mx + 10 * u, my + 27 * u, Math.max(2 * u, width * clamp(boosting ? Math.max(p.boost / 2.2, p.star / 5) : charge, 0, 1)), 4 * u, boosting || p.driftCharge >= 1.6 ? "#df9b28" : "#279c96", 2 * u);
    if (drift && !boosting) for (const threshold of [.65, 1.6]) {
      c.fillStyle = "#536d77"; c.fillRect(mx + 10 * u + width * threshold / 2.4, my + 25 * u, u, 8 * u);
    }
  }
  // Brief feedback sits above the instruments, never over the road ahead:
  // a hazard warning first, otherwise the latest short callout.
  const bigBanner = p.banner.big && p.banner.until > time;
  const hazard = p.finish ? ""
    : p.coach.startsWith("Hole ahead") ? p.coach
    : p.coach.startsWith("Cliff edge") ? "Careful! Steer to the center"
    : p.coach.startsWith("Canyon jump") ? "Jump ahead! Stay on the ramp"
    : p.warningUntil > time ? "Bubble behind! Move over" : "";
  const notice = hazard || (!p.banner.big && p.banner.until > time ? p.banner.text : "");
  if (notice && !bigBanner) toast(c, notice, w / 2, bottom - 24 * u, 14 * u);
  if (bigBanner) {
    const age = time - p.banner.since, fade = Math.min(1, age * 6, (p.banner.until - time) * 4);
    const pop = reducedMotion ? 1 : .94 + .06 * Math.min(1, age * 5);
    headline(c, p.banner.text, w / 2, h * .33, clamp(h * .085, 24, 60) * pop, fade);
  }
  c.textAlign = "left";
}
