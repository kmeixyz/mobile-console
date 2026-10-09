/** Standard ten-pin scoring. The tenth frame includes strike/spare bonus rolls. */
export function frameComplete(rolls, tenth = false) {
  if (!tenth) return rolls.length >= 2 || rolls[0] === 10;
  if (rolls.length < 2) return false;
  return rolls[0] === 10 || rolls[0] + rolls[1] === 10
    ? rolls.length >= 3
    : true;
}
export function scoreFrames(frames) {
  const flat = frames.flat();
  let cursor = 0;
  let total = 0;
  return frames.map((frame, index) => {
    if (!frame.length) return null;
    let value;
    if (index === 9) {
      if (!frameComplete(frame, true)) return null;
      value = frame.reduce((a, b) => a + b, 0);
    } else if (frame[0] === 10) {
      if (flat[cursor + 2] === undefined) {
        cursor++;
        return null;
      }
      value = 10 + flat[cursor + 1] + flat[cursor + 2];
    } else if (frame.length >= 2 && frame[0] + frame[1] === 10) {
      if (flat[cursor + 2] === undefined) {
        cursor += 2;
        return null;
      }
      value = 10 + flat[cursor + 2];
    } else {
      if (frame.length < 2) {
        cursor += frame.length;
        return null;
      }
      value = frame[0] + frame[1];
    }
    cursor += frame.length;
    total += value;
    return total;
  });
}
export function newPlayer(name) {
  return { name, frames: Array.from({ length: 10 }, () => []) };
}
export function rackResets(frame, frameIndex) {
  return (
    frameComplete(frame, frameIndex === 9) ||
    frame.at(-1) === 10 ||
    (frameIndex === 9 && frame.length === 2 && frame[0] + frame[1] === 10)
  );
}
