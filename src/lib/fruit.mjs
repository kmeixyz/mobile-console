// Fruit Slice rules for the 60-second round: pacing, the wave director that
// decides what gets thrown, and scoring. World units are 900 wide and 600
// tall with y pointing down; everything launches from just below the screen.

export const ROUND = 60;
// How busy the fruit is through a turn, as a multiple of the base rate: it
// builds to a peak at 50 seconds, eases off until 57, then nearly stops for
// the last few seconds.
export const PEAK_AT = 50;
export const WIND_DOWN_AT = 57;
export const intensity = (t) => {
  if (t < PEAK_AT) return 0.6 + 1.0 * Math.pow(t / PEAK_AT, 1.3);
  if (t < WIND_DOWN_AT)
    return 1.6 - 0.35 * ((t - PEAK_AT) / (WIND_DOWN_AT - PEAK_AT));
  return 0.3;
};
// 0 at the start of a turn, 1 at the peak. Arcs get quicker, waves bigger and
// bombs more common as it rises.
export const difficulty = (t) => Math.max(0, Math.min(1, t / PEAK_AT));
export const GRAVITY = 420;

// Kinds 0–3 are fruit.
export const BOMB = 4;
export const DOUBLE = 5;
export const FRENZY = 6;
export const FREEZE = 7;
export const POWER_UPS = [DOUBLE, FRENZY, FREEZE];
export const EFFECT_SECONDS = { [DOUBLE]: 5, [FRENZY]: 4, [FREEZE]: 3.5 };
// Freeze slows the fruit and stops the round clock while it runs.
export const FREEZE_SPEED = 0.45;

export const FRUIT_POINTS = 10;
export const CRITICAL_CHANCE = 0.04;
export const CRITICAL_BONUS = 40;
// Fruit cut within this long of each other belong to one swing.
export const COMBO_GAP = 0.25;
export const COMBO_MIN = 3;
// Three or more fruit in one swing score double.
export const comboBonus = (count) =>
  count >= COMBO_MIN ? count * FRUIT_POINTS : 0;
// Fruit are forgiving to hit; bombs only count when the blade is really on
// them.
export const hitRadius = (kind, r) => (kind === BOMB ? r * 0.8 : r + 9);

// No bombs while players find their aim, during a frenzy, or in the last
// few seconds.
export const SAFE_START = 4;
export const bombChance = (t, { calm = false, frenzy = false } = {}) =>
  calm || frenzy || t < SAFE_START || t >= WIND_DOWN_AT
    ? 0
    : 0.12 + 0.28 * difficulty(t);
// Every turn throws the same power-ups (two Frenzies, one Double, one
// Freeze), so each player in a match gets the same chances; only when they
// come, in what order and where is left to luck.
export const POWER_UP_SET = [DOUBLE, FRENZY, FRENZY, FREEZE];
export const POWER_UP_FROM = 5;
export const POWER_UP_UNTIL = 53;
// At least this long between scheduled power-ups, so one has run out before
// the next is due.
export const POWER_UP_GAP = 8;

const lerp = (a, b, t) => a + (b - a) * t;
function pick(weights, rand) {
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) < 0) return i;
  return weights.length - 1;
}
// Chance of a wave holding 1–5 fruit: mostly small early, bigger later.
const SIZE_EARLY = [30, 35, 22, 10, 3];
const SIZE_LATE = [8, 20, 30, 25, 17];
export const waveSize = (d, rand) =>
  1 + pick(SIZE_EARLY.map((w, i) => lerp(w, SIZE_LATE[i], d)), rand);
const TEMPLATES = ["single", "cluster", "spread", "cross"];
const TEMPLATE_EARLY = [35, 25, 30, 10];
const TEMPLATE_LATE = [10, 30, 30, 30];

/**
 * One launch: where it starts, how it flies and what it is. `apexX` is where
 * it reaches the top of its arc, which is where players mostly slice it.
 */
function launcher(g, rand) {
  const between = (a, b) => a + rand() * (b - a);
  return (x, kind, peak = between(60, 260), apexX) => {
    const y = between(650, 770);
    const vy = -Math.sqrt(2 * g * (y - peak));
    const top = apexX ?? x + (450 - x) * between(0.35, 0.65);
    return {
      x,
      y,
      vx: (top - x) / (-vy / g),
      vy,
      g,
      kind,
      apexX: top,
      spin: between(-1.5, 1.5),
    };
  };
}

/**
 * Throws something where it tops out as far from the rest of the wave as it
 * can, so there is always a clean swing at the fruit around it.
 */
function placeAway(items, rand, make) {
  let best = null,
    gap = -1;
  for (let i = 0; i < 12; i++) {
    const top = 170 + ((i + rand()) * 560) / 12;
    const x = Math.max(150, Math.min(750, top + (rand() - 0.5) * 200));
    const option = make(x, top);
    const nearest = Math.min(
      Infinity,
      ...items.map((it) => Math.abs(it.apexX - option.apexX)),
    );
    if (nearest > gap) {
      best = option;
      gap = nearest;
    }
  }
  return best;
}

// In hard mode most bombs top out right beside the wave, just clear of the
// nearest fruit, so slicing a group takes care; the rest go wherever there is
// most room.
const BOMB_NEAR_CHANCE = 0.6;
const BOMB_CLEARANCE = 110;
function placeBomb(items, rand, make) {
  if (!items.length || rand() >= BOMB_NEAR_CHANCE)
    return placeAway(items, rand, make);
  let best = null,
    gap = Infinity;
  for (let i = 0; i < 24; i++) {
    const top = 170 + ((i + rand()) * 560) / 24;
    const x = Math.max(150, Math.min(750, top + (rand() - 0.5) * 200));
    const option = make(x, top);
    const nearest = Math.min(
      ...items.map((it) => Math.abs(it.apexX - option.apexX)),
    );
    if (nearest >= BOMB_CLEARANCE && nearest < gap) {
      best = option;
      gap = nearest;
    }
  }
  return best ?? placeAway(items, rand, make);
}

/**
 * A turn's power-ups: everything in `POWER_UP_SET`, shuffled, at random times
 * between `POWER_UP_FROM` and `POWER_UP_UNTIL`, at least `POWER_UP_GAP` apart.
 * @returns {{ at: number, kind: number }[]} in the order they are due
 */
export function planPowerUps(rand = Math.random) {
  const kinds = [...POWER_UP_SET];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  const slack =
    POWER_UP_UNTIL - POWER_UP_FROM - POWER_UP_GAP * (kinds.length - 1);
  return kinds
    .map(() => rand() * slack)
    .sort((a, b) => a - b)
    .map((offset, i) => ({
      at: POWER_UP_FROM + offset + i * POWER_UP_GAP,
      kind: kinds[i],
    }));
}

/**
 * The power-up due `t` seconds into a turn, if any. One that comes due during
 * a frenzy, or while the same one is running, waits until it is over.
 * @param {{ at: number, kind: number }[]} schedule from `planPowerUps`, minus those thrown
 * @param {number} t
 * @param {number[]} [active] power-ups in effect
 */
export function duePowerUp(schedule, t, active = []) {
  const next = schedule[0];
  if (!next || t < next.at) return undefined;
  if (active.includes(FRENZY) || active.includes(next.kind)) return undefined;
  return next.kind;
}

/**
 * The next wave of a turn `t` seconds in. `powerUp` is a power-up to throw
 * with it, from `duePowerUp`; `active` lists power-ups in effect.
 * @param {number} t
 * @param {{ calm?: boolean, hard?: boolean, rand?: () => number, active?: number[], powerUp?: number }} [options]
 */
export function planWave(
  t,
  { calm = false, hard = false, rand = Math.random, active = [], powerUp } = {},
) {
  const d = difficulty(t);
  const frenzy = active.includes(FRENZY);
  const between = (a, b) => a + rand() * (b - a);
  const launch = launcher(GRAVITY * (1 + 0.45 * d), rand);
  const fruit = () => Math.floor(rand() * 4);
  const template =
    t >= WIND_DOWN_AT
      ? "single"
      : TEMPLATES[
          pick(TEMPLATE_EARLY.map((w, i) => lerp(w, TEMPLATE_LATE[i], d)), rand)
        ];
  const size = template === "single" ? 1 : Math.max(2, waveSize(d, rand));
  const items = [];
  if (template === "single") items.push(launch(between(150, 750), fruit()));
  else if (template === "cluster") {
    // Thrown together so one swing can take the lot.
    const x = between(220, 680),
      peak = between(90, 220),
      top = x + (450 - x) * between(0.35, 0.65);
    for (let i = 0; i < size; i++)
      items.push(
        launch(
          x + between(-45, 45),
          fruit(),
          peak + between(-30, 30),
          top + between(-40, 40),
        ),
      );
  } else if (template === "spread") {
    for (let i = 0; i < size; i++)
      items.push(
        launch(150 + (600 * (i + 0.5)) / size + between(-40, 40), fruit()),
      );
  } else {
    // Alternating sides, each arcing over the middle toward the other.
    for (let i = 0; i < size; i++) {
      const side = i % 2 ? -1 : 1;
      const x = side > 0 ? between(170, 260) : between(640, 730);
      items.push(
        launch(x, fruit(), between(80, 240), 450 + side * between(20, 60)),
      );
    }
  }
  if (POWER_UPS.includes(powerUp))
    items.push(placeAway(items, rand, (x, top) => launch(x, powerUp, between(80, 200), top)));
  if (rand() < bombChance(t, { calm, frenzy })) {
    const bombs = d > 0.6 && rand() < 0.3 ? 2 : 1;
    for (let i = 0; i < bombs; i++)
      items.push(
        (hard ? placeBomb : placeAway)(items, rand, (x, top) =>
          launch(x, BOMB, between(100, 260), top),
        ),
      );
  }
  return items;
}

/** Frenzy fruit fly in from the sides, low and fast, between the waves. */
export function frenzyLaunch(rand = Math.random) {
  const side = rand() < 0.5 ? -1 : 1;
  return {
    x: side < 0 ? -30 : 930,
    y: 260 + rand() * 260,
    vx: -side * (380 + rand() * 180),
    vy: -(150 + rand() * 200),
    g: GRAVITY,
    kind: Math.floor(rand() * 4),
    apexX: 450,
    spin: (rand() - 0.5) * 3,
  };
}
export const FRENZY_EVERY = 0.11;
