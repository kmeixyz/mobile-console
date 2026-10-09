export const ROUND_SECONDS = 30;
export const MOLE_POINTS = 10;
export const ANIMAL_PENALTY = 15;
export const AIM = { x: 450, y: 320, reachX: 380, reachY: 250 };
export const HOLES = Array.from({ length: 9 }, (_, i) => ({
  x: 200 + (i % 3) * 250,
  y: 225 + Math.floor(i / 3) * 135,
}));

export function createRound() {
  return {
    elapsed: 0, score: 0, hits: 0, mistakes: 0, missed: 0,
    nextSpawn: 0.25, serial: 0,
    holes: HOLES.map(() => ({ kind: '', expires: 0, appeared: 0, id: 0, feedback: '', feedbackUntil: 0 })),
  };
}

/** Time only advances while playing; every appearance can be scored once. */
export function advanceRound(state, seconds, random = Math.random) {
  state.elapsed = Math.min(ROUND_SECONDS, state.elapsed + Math.max(0, seconds));
  for (const hole of state.holes) {
    if (hole.kind && hole.expires <= state.elapsed) {
      if (hole.kind === 'mole') state.missed++;
      hole.kind = '';
    }
  }
  if (state.elapsed >= ROUND_SECONDS) {
    state.holes.forEach(hole => { hole.kind = ''; });
    return true;
  }
  if (state.elapsed >= state.nextSpawn) {
    const progress = state.elapsed / ROUND_SECONDS;
    const available = state.holes.filter(h => !h.kind && h.feedbackUntil <= state.elapsed);
    if (available.length) {
      const hole = available[Math.min(available.length - 1, Math.floor(random() * available.length))];
      const kind = random();
      hole.kind = kind < 0.72 ? 'mole' : kind < 0.88 ? 'rabbit' : 'fox';
      hole.appeared = state.elapsed;
      hole.expires = state.elapsed + 1.9 - progress * 0.75;
      hole.id = ++state.serial;
      hole.feedback = '';
    }
    state.nextSpawn = state.elapsed + 0.68 - progress * 0.3;
  }
  return false;
}

export function whack(state, x, y) {
  if (state.elapsed >= ROUND_SECONDS || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const index = HOLES.findIndex(h => ((x - h.x) / 76) ** 2 + ((y - (h.y - 40)) / 72) ** 2 <= 1);
  const hole = state.holes[index];
  if (!hole?.kind || hole.expires <= state.elapsed) return null;
  const mole = hole.kind === 'mole';
  const before = state.score;
  state.score = Math.max(0, before + (mole ? MOLE_POINTS : -ANIMAL_PENALTY));
  if (mole) state.hits++; else state.mistakes++;
  hole.feedback = mole ? '+10' : `Oops! −${before - state.score}`;
  hole.feedbackUntil = state.elapsed + 0.6;
  hole.kind = '';
  return { mole, delta: state.score - before, index };
}
