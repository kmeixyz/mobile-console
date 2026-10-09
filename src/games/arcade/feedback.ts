import type { SoundCue } from "../../lib/audio";
import type { Player } from "./types";

export type GameFeedback = { cue: SoundCue; player: string };
// Most frames have no events; they share one empty list.
const none: readonly GameFeedback[] = [];
/** Simulation events are drained once per display frame, never by draw(). */
export function createFeedback() {
  let pending: GameFeedback[] = [];
  const last = new Map<string, number>();
  return {
    emit(cue: SoundCue, player: Player, time: number) {
      if (player.bot || !Number.isFinite(time)) return;
      const key = `${player.name}:${cue}`;
      if (time - (last.get(key) ?? -Infinity) < .12) return;
      last.set(key, time);
      if (pending.length < 16) pending.push({ cue, player: player.name });
    },
    drain(): readonly GameFeedback[] {
      if (!pending.length) return none;
      const events = pending;
      pending = [];
      return events;
    },
  };
}
