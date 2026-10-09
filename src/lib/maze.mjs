// Maze Runner: a grid maze measured in cells, with the runner and the bots as
// circles. Cell (c, r) spans c..c+1 across and r..r+1 down.
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
export const RUNNER = 0.26;
export const BOT = 0.24;
export const WALL = 0.12;
// Cells a second the runner can be dragged.
// Catch up with quick pointing without skipping the collision substeps.
export const RUN_SPEED = 36;
// A generous pickup radius makes the runner easy to grab. Holding keeps the
// grip at walls; only releasing the button or a bot collision drops it.
export const GRAB = 0.95;
// A bot knocks the runner back this many cells along the way it came.
export const KNOCKBACK = 3;
export const SAFE_SECONDS = 1.2;
// Three mazes per turn; players in a match share the same selection.
export const LEVELS = [
  { cols: 7, rows: 5, bots: 1 },
  { cols: 9, rows: 6, bots: 2 },
  { cols: 11, rows: 7, bots: 3 },
];
// The tutorial and first round share a welcoming, reproducible 7×5 maze.
// Later mazes are still randomized for each match.
export const FIRST_MAZE_SEED = 5;
// Forty-eight layouts across eight board shapes, shuffled without replacement.
// The opening maze stays separate so the tutorial always matches the first run.
export const MAZE_MAPS = [
  { cols: 7, rows: 6, bots: 1 }, { cols: 8, rows: 5, bots: 1 },
  { cols: 8, rows: 6, bots: 2 }, { cols: 9, rows: 5, bots: 2 },
  { cols: 9, rows: 6, bots: 2 }, { cols: 10, rows: 6, bots: 2 },
  { cols: 10, rows: 7, bots: 3 }, { cols: 11, rows: 7, bots: 3 },
].flatMap((shape, i) => Array.from({ length: 6 }, (_, j) => ({
  ...shape, seed: 1009 + i * 101 + j * 7919,
})));

export function firstMaze() { return makeMaze(LEVELS[0], seeded(FIRST_MAZE_SEED)); }

export function createMazeDeck(random = Math.random) {
  let remaining = [];
  let previous = -1;
  return {
    next() {
      if (!remaining.length) {
        remaining = MAZE_MAPS.map((_, i) => i);
        for (let i = remaining.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
        }
        if (remaining[remaining.length - 1] === previous)
          [remaining[0], remaining[remaining.length - 1]] = [remaining[remaining.length - 1], remaining[0]];
      }
      previous = remaining.pop();
      const map = MAZE_MAPS[previous];
      return makeMaze(map, seeded(map.seed));
    },
  };
}
export const MAX_STARS = 3 * LEVELS.length;
const STEPS = [
  [N, 0, -1, S],
  [E, 1, 0, W],
  [S, 0, 1, N],
  [W, -1, 0, E],
];
/** A small seeded generator, so every player in a game gets the same mazes. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * A perfect maze (exactly one way between any two cells) carved by a random
 * depth-first walk. The runner starts top left and leaves bottom right. A
 * maze whose route has too few side passages for its bots is carved again.
 */
export function makeMaze(level, random) {
  let best = carve(level, random);
  for (let attempt = 1; attempt < 40 && best.bots.length < level.bots; attempt++) {
    const maze = carve(level, random);
    if (maze.bots.length > best.bots.length) best = maze;
  }
  return best;
}
function carve({ cols, rows, bots }, random) {
  const cells = new Array(cols * rows).fill(N | E | S | W);
  const seen = new Array(cols * rows).fill(false);
  const stack = [0];
  seen[0] = true;
  while (stack.length) {
    const at = stack[stack.length - 1];
    const c = at % cols,
      r = Math.floor(at / cols);
    const open = STEPS.filter(([, dc, dr]) => {
      const nc = c + dc,
        nr = r + dr;
      return nc >= 0 && nc < cols && nr >= 0 && nr < rows && !seen[nr * cols + nc];
    });
    if (!open.length) {
      stack.pop();
      continue;
    }
    const [wall, dc, dr, back] = open[Math.floor(random() * open.length)];
    const next = (r + dr) * cols + c + dc;
    cells[at] &= ~wall;
    cells[next] &= ~back;
    seen[next] = true;
    stack.push(next);
  }
  // Doorways in the outer wall: in at the start, out at the exit.
  cells[0] &= ~W;
  cells[cols * rows - 1] &= ~E;
  const maze = { cols, rows, cells, start: { c: 0, r: 0 }, exit: { c: cols - 1, r: rows - 1 } };
  const path = solve(maze);
  return { ...maze, path, bots: placeBots(maze, path, bots, random), par: parTime(path.length) };
}
/** Seconds a quick, careful run takes, for the speed star. */
export const parTime = (cells) => Math.round(cells * 0.65 + 4);
/** The one route from start to exit, as a list of cells. */
export function solve({ cols, rows, cells, start, exit }) {
  const from = new Map([[start.r * cols + start.c, -1]]);
  const queue = [start.r * cols + start.c];
  const goal = exit.r * cols + exit.c;
  while (queue.length) {
    const at = queue.shift();
    if (at === goal) break;
    const c = at % cols,
      r = Math.floor(at / cols);
    for (const [wall, dc, dr] of STEPS) {
      const nc = c + dc,
        nr = r + dr;
      if (cells[at] & wall || nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const next = nr * cols + nc;
      if (from.has(next)) continue;
      from.set(next, at);
      queue.push(next);
    }
  }
  const path = [];
  for (let at = goal; at !== -1; at = from.get(at))
    path.unshift({ c: at % cols, r: Math.floor(at / cols) });
  return path;
}
/**
 * Bots lurk in side passages and keep stepping out onto the route, so a run
 * has to wait for each to duck back before slipping past. They keep clear of
 * the first and last cells of the route.
 */
export function placeBots(maze, path, count, random) {
  const { cols, rows, cells } = maze;
  const onRoute = new Set(path.map(({ c, r }) => r * cols + c));
  const spots = [];
  path.forEach(({ c, r }, i) => {
    if (i < 2 || i > path.length - 2) return;
    for (const [wall, dc, dr] of STEPS) {
      // Up to three cells straight into a passage off the route.
      let length = 0;
      for (let at = r * cols + c, nc = c, nr = r; length < 3; length++) {
        if (cells[at] & wall) break;
        nc += dc;
        nr += dr;
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) break;
        at = nr * cols + nc;
        if (onRoute.has(at)) break;
      }
      if (length) spots.push({ c, r, dc, dr, length, i });
    }
  });
  const bots = [];
  while (bots.length < count && spots.length) {
    const spot = spots.splice(Math.floor(random() * spots.length), 1)[0];
    // One bot per stretch of the route, so they never gang up.
    if (bots.some((b) => Math.abs(b.step - spot.i) < 3)) continue;
    bots.push({
      from: { x: spot.c + 0.5, y: spot.r + 0.5 },
      to: { x: spot.c + spot.dc * spot.length + 0.5, y: spot.r + spot.dr * spot.length + 0.5 },
      // Cells a second, and where along its beat it starts.
      speed: 1.1 + random() * 0.6,
      offset: random(),
      step: spot.i,
    });
  }
  return bots;
}
/** Where a bot is after `t` seconds, pacing back and forth along its beat. */
export function botAt(bot, t) {
  const length = Math.hypot(bot.to.x - bot.from.x, bot.to.y - bot.from.y) || 1;
  const cycle = (bot.offset + (t * bot.speed) / length) % 2;
  const k = cycle < 1 ? cycle : 2 - cycle;
  return {
    x: bot.from.x + (bot.to.x - bot.from.x) * k,
    y: bot.from.y + (bot.to.y - bot.from.y) * k,
  };
}
/** Every wall as a line segment, each shared wall once. */
export function wallSegments({ cols, rows, cells }) {
  const segments = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const cell = cells[r * cols + c];
      if (cell & N) segments.push([c, r, c + 1, r]);
      if (cell & W) segments.push([c, r, c, r + 1]);
      if (r === rows - 1 && cell & S) segments.push([c, r + 1, c + 1, r + 1]);
      if (c === cols - 1 && cell & E) segments.push([c + 1, r, c + 1, r + 1]);
    }
  return segments;
}
const closest = ([ax, ay, bx, by], x, y) => {
  const dx = bx - ax,
    dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return { x: ax + dx * t, y: ay + dy * t };
};
/**
 * Moves the runner up to `limit` cells toward `target`, sliding along any
 * wall in the way. `blocked` says a wall stopped it head-on.
 */
export function moveRunner(segments, pos, target, limit) {
  let { x, y } = pos;
  let dx = target.x - x,
    dy = target.y - y;
  const distance = Math.hypot(dx, dy);
  if (distance > limit) {
    dx *= limit / distance;
    dy *= limit / distance;
  }
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.05));
  const reach = RUNNER + WALL / 2;
  let blocked = false;
  for (let i = 0; i < steps; i++) {
    x += dx / steps;
    y += dy / steps;
    for (const segment of segments) {
      const p = closest(segment, x, y);
      const gap = Math.hypot(x - p.x, y - p.y);
      if (gap >= reach || gap === 0) continue;
      const nx = (x - p.x) / gap,
        ny = (y - p.y) / gap;
      x = p.x + nx * reach;
      y = p.y + ny * reach;
      // Pushing straight into the wall, rather than brushing along it.
      if (-(dx * nx + dy * ny) > 0.7 * Math.hypot(dx, dy)) blocked = true;
    }
  }
  return { x, y, blocked };
}
/** Which cell a point is in. */
export const cellAt = ({ cols, rows }, { x, y }) => ({
  c: Math.max(0, Math.min(cols - 1, Math.floor(x))),
  r: Math.max(0, Math.min(rows - 1, Math.floor(y))),
});
/** Stars for one maze: one for getting out, one for beating par, one for no bot hits. */
export const mazeStars = (seconds, par, hits) =>
  1 + (seconds <= par ? 1 : 0) + (hits === 0 ? 1 : 0);
