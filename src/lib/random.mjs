/** Independent streams keep decorative randomness out of game rules. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
export const matchSeed = () => Math.floor(Math.random() * 0x100000000);
export const fruitRandom = seed => ({
  waves: seededRandom(seed),
  powers: seededRandom(seed ^ 0x518c),
  sizes: seededRandom(seed ^ 0x7a2f),
  bonuses: seededRandom(seed ^ 0x93bd),
  frenzy: seededRandom(seed ^ 0x2e61),
});
