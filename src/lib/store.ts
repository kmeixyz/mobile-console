import { useState } from "react";
export type Settings = {
  sound: boolean;
  motion: boolean;
  contrast: boolean;
  transparency?: boolean;
  name: string;
};
export type GameID =
  "moles" | "rally" | "target" | "fruit" | "hockey" | "maze" | "basket" | "flashlight" | "kart" | "sumo" | "tanks" | "paint";
export type Result = {
  id: string;
  game: GameID;
  name: string;
  score: number;
  date: number;
};
export type PlayMode = "solo" | "together";
export const games = {
  basket: { title: "Basket Catch", players: "1–4 players", time: "60 sec / turn", image: "/art/basket.svg" },
  flashlight: { title: "Flashlight Hunt", players: "1–4 players", time: "60 sec / turn", image: "/art/flashlight.svg" },
  kart: { title: "Kart Clash", players: "1–4 players", time: "3 laps", image: "/art/kart.svg" },
  sumo: { title: "Bumper Sumo", players: "1–4 players", time: "First to 3 wins", image: "/art/sumo.svg" },
  tanks: { title: "Tank Tag", players: "1–4 players", time: "First to 5 tags", image: "/art/tanks.svg" },
  paint: { title: "Paint Party", players: "1–4 players", time: "30 seconds", image: "/art/paint.svg" },

  target: {
    title: "Archery",
    players: "1–4 players",
    time: "5 arrows / turn",
    image: "/art/target.svg",
  },
  fruit: {
    title: "Fruit Slice",
    players: "1–4 players",
    time: "60 sec / turn",
    image: "/art/fruit.svg",
  },
  hockey: {
    title: "Air Hockey",
    players: "1–2 players",
    time: "First to 5",
    image: "/art/hockey.svg",
  },
  moles: {
    title: "Whack-a-Mole",
    players: "1–4 players",
    time: "30 sec / turn",
    image: "/art/moles.svg",
  },
  maze: {
    title: "Maze Runner",
    players: "1–4 players",
    time: "5 mazes / turn",
    image: "/art/maze.svg",
  },
  rally: {
    title: "Table Tennis",
    players: "1–2 players",
    time: "First to 5",
    image: "/art/rally.svg",
  },
};
export const arcadeGames = ["basket", "flashlight", "kart", "sumo", "tanks", "paint"] as const;
export const isArcadeGame = (id: GameID): id is typeof arcadeGames[number] => (arcadeGames as readonly GameID[]).includes(id);
export const isSimultaneous = (id: GameID) => ["hockey", "rally", "kart", "sumo", "tanks", "paint"].includes(id);
/** Multiplayer games that always field four players, with bots in empty seats. */
export const fourSeatGames: GameID[] = ["kart", "sumo", "paint"];
const units: Partial<Record<GameID, [string, string]>> = {
  tanks: ["tag", "tags"], maze: ["star", "stars"], hockey: ["goal", "goals"], sumo: ["win", "wins"],
};
export const scoreUnit = (id: GameID, n: number) => (units[id] ?? ["point", "points"])[n === 1 ? 0 : 1];
/** A score with its unit, as short as it can be: "42%", "3 KOs", "120 points". */
export const formatScore = (id: GameID, n: number) => id === "paint" ? `${n}%` : `${n} ${scoreUnit(id, n)}`;
export const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
// Three short steps per game, shown as a numbered list.
export const gameHelp: Record<GameID, { steps: string[] }> = {
  basket: { steps: ["Point to move the basket.", "Catch fruit. Avoid mud.", "Tap to hop for stars."] },
  flashlight: { steps: ["Point to shine the light.", "Tap to snap a critter.", "The battery lasts 60 seconds."] },
  kart: { steps: ["Point to steer.", "Drive through ? boxes, then tap to use them.", "Finish 3 laps first."] },
  sumo: { steps: ["Point to drive. Tap to dash.", "Fall off and you’re out until the next round.", "Last car standing wins the round. First to 3 wins takes the match."] },
  tanks: { steps: ["Point to drive.", "Tap to fire. Shots bounce.", "First to 5 tags wins."] },
  paint: { steps: ["Point to roll.", "Tap to throw a paint bomb.", "Paint the most floor."] },
  moles: { steps: ["Point at a mole.", "Tap to whack it.", "Leave rabbits and foxes alone."] },
  fruit: { steps: ["Tap Start slicing.", "Point to slice fruit.", "Slice 3 at once for a combo."] },
  rally: { steps: ["Point to move your paddle.", "It hits the ball for you.", "First to 5 wins."] },
  target: { steps: ["Hold to draw and aim.", "Release to shoot.", "Aim into the wind."] },
  hockey: { steps: ["Point to move your mallet.", "Hit the puck into the far goal.", "First to 5 wins."] },
  maze: { steps: ["Point at the runner.", "Hold to drag it to the flag.", "Avoid the bots."] },
};
export const supportsTogether = (id: GameID) =>
  games[id].players !== "1 player";
function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (key === "mobile-console-settings") {
      if (!value || typeof value !== "object" || Array.isArray(value))
        return fallback;
      const defaults = fallback as Settings;
      return {
        sound: typeof value.sound === "boolean" ? value.sound : defaults.sound,
        motion:
          typeof value.motion === "boolean" ? value.motion : defaults.motion,
        contrast:
          typeof value.contrast === "boolean"
            ? value.contrast
            : defaults.contrast,
        transparency:
          typeof value.transparency === "boolean" ? value.transparency : false,
        name:
          typeof value.name === "string"
            ? value.name.slice(0, 20)
            : defaults.name,
      } as T;
    }
    if (key === "mobile-console-party")
      return (
        Array.isArray(value) &&
        value.length >= 2 &&
        value.length <= 4 &&
        value.every((n) => typeof n === "string")
          ? value.map((n, i) => n.trim().slice(0, 20) || `Player ${i + 1}`)
          : fallback
      ) as T;
    if (key === "mobile-console-results")
      return (
        Array.isArray(value)
          ? value
              .filter(
                (r) =>
                  r &&
                  typeof r.id === "string" &&
                  Object.hasOwn(games, r.game) &&
                  typeof r.name === "string" &&
                  Number.isFinite(r.score) &&
                  r.score >= 0 &&
                  Number.isFinite(r.date) &&
                  Math.abs(r.date) < 8.64e15,
              )
              .slice(0, 100)
          : []
      ) as T;
    return value ?? fallback;
  } catch {
    return fallback;
  }
}
export function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readLocal(key, initial));
  const update = (next: T | ((old: T) => T)) =>
    setValue((old) => {
      const result =
        typeof next === "function" ? (next as (old: T) => T)(old) : next;
      try {
        localStorage.setItem(key, JSON.stringify(result));
      } catch {
        /* Storage is optional. */
      }
      return result;
    });
  return [value, update] as const;
}
let audio: AudioContext | null = null;
/** Prepare sound during launch so the first hit never opens the audio device mid-frame. */
export function prepareAudio(enabled: boolean) {
  if (!enabled) return null;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume().catch(() => {});
    return audio;
  } catch {
    return null;
  }
}
export function chime(enabled: boolean, high = false) {
  const audio = prepareAudio(enabled);
  if (!audio) return;
  try {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.frequency.setValueAtTime(high ? 740 : 440, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      high ? 1108 : 660,
      audio.currentTime + 0.14,
    );
    gain.gain.setValueAtTime(0.06, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.25);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.25);
  } catch {
    /* Audio may be unavailable. */
  }
}
