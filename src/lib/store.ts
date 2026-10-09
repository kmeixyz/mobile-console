import { useState } from "react";
export type Settings = {
  sound: boolean;
  motion: boolean;
  contrast: boolean;
  transparency?: boolean;
  name: string;
};
export type GameID =
  "moles" | "rally" | "target" | "fruit" | "hockey" | "maze";
export type Result = {
  id: string;
  game: GameID;
  name: string;
  score: number;
  date: number;
};
export type PlayMode = "solo" | "together";
export const games = {
  target: {
    title: "Archery",
    players: "1–4 players",
    time: "5 arrows / turn",
    image: "/art/target.svg",
  },
  fruit: {
    title: "Fruit Slice",
    players: "1–4 players",
    time: "90 sec / turn",
    image: "/art/fruit.svg",
  },
  hockey: {
    title: "Air Hockey",
    players: "1–2 players",
    time: "First to 7",
    image: "/art/hockey.svg",
  },
  moles: {
    title: "Whack-a-Mole",
    players: "1–4 players",
    time: "45 sec / turn",
    image: "/art/moles.svg",
  },
  maze: {
    title: "Maze Runner",
    players: "1–4 players",
    time: "3 mazes / turn",
    image: "/art/maze.svg",
  },
  rally: {
    title: "Table Tennis",
    players: "1–2 players",
    time: "First to 7",
    image: "/art/rally.svg",
  },
};
// Three short steps per game, shown as a numbered list.
export const gameHelp: Record<GameID, { steps: string[] }> = {
  moles: {
    steps: ["Tap Start round on your phone. Point at a brown mole and tap to whack.", "Moles score +10. Leave rabbits and foxes alone: they cost 15 points.", "Hit as many moles as you can in 45 seconds."],
  },
  fruit: {
    steps: ["Tap Start slicing on your phone.", "Point left, right, up, or down to sweep the blade through fruit. No need to hold the button.", "Slice 3 in one sweep for a combo. You have 90 seconds."],
  },
  rally: {
    steps: ["Tap Play match. The ball serves automatically.", "Point your phone to move your paddle into the ball’s path. It hits automatically.", "Get the ball past the other paddle. First to 7 wins."],
  },
  target: {
    steps: ["Hold the phone’s button to zoom in. Point your phone to aim.", "Release to shoot. After zooming in, the ring gives you 4 seconds before auto-fire.", "Aim against the wind. The gold center scores 10; you get 5 arrows."],
  },
  hockey: {
    steps: ["Tap Play match. Point your phone to move your mallet.", "Move behind the puck, then push it toward the far goal. Protect your own goal.", "First to 7 wins. Tap the phone’s button to pause."],
  },
  maze: {
    steps: ["Point at the coral runner, then hold the phone’s button to pick it up.", "Keep holding and point along the paths to the flag. Go around walls and purple bots.", "Release to stop. Clear all 3 mazes; earn extra stars for speed and no bot hits."],
  },
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
export function chime(enabled: boolean, high = false) {
  if (!enabled) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
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
