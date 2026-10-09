import { useState } from "react";
export type Settings = {
  sound: boolean;
  motion: boolean;
  contrast: boolean;
  transparency?: boolean;
  name: string;
};
export type GameID =
  "bowling" | "rally" | "target" | "fruit" | "golf" | "hoops";
export type Result = {
  id: string;
  game: GameID;
  name: string;
  score: number;
  date: number;
};
export type PlayMode = "solo" | "together";
export const games = {
  golf: {
    title: "Mini Golf",
    players: "1–4 players",
    time: "3 holes / turn",
    image: "/art/golf.png",
  },
  hoops: {
    title: "Basketball",
    players: "1–4 players",
    time: "5 shots / turn",
    image: "/art/hoops.png",
  },
  fruit: {
    title: "Fruit Slice",
    players: "1–4 players",
    time: "45 sec / turn",
    image: "/art/fruit.png",
  },
  bowling: {
    title: "Bowling",
    players: "1–4 players",
    time: "5–10 min",
    image: "/art/bowling.png",
  },
  rally: {
    title: "Table Tennis",
    players: "1 player",
    time: "2–3 min",
    image: "/art/rally.png",
  },
  target: {
    title: "Archery",
    players: "1 player",
    time: "2 min",
    image: "/art/target.png",
  },
};
export const gameHelp: Record<
  GameID,
  { motion: string; goal: string }
> = {
  bowling: {
    motion: "Line up with Move and Aim on your phone. Hold, swing, and let go; twist your wrist to curve it.",
    goal: "Knock down the pins. Highest score wins.",
  },
  fruit: {
    motion: "Tilt your phone to move. Hold the slice button and tilt quickly to slice.",
    goal: "Slice fruit to score. Highest score wins.",
  },
  rally: {
    motion: "Tilt your phone left and right like a steering wheel to move your paddle.",
    goal: "Play against the computer. First to 7 wins.",
  },
  target: {
    motion: "Tilt your phone to aim, then tap Release arrow.",
    goal: "Get as close to 50 points as you can.",
  },
  golf: {
    motion:
      "Putts start aimed at the cup. Tilt left or right to adjust; tilt the top away for more power. Tap Putt.",
    goal: "3 holes. Score 100, 70, 40, or 10 points for sinking in 1–4 strokes.",
  },
  hoops: {
    motion:
      "Tilt left or right to aim; tilt the top away for more power. Tap Shoot.",
    goal: "5 shots. Make every basket for 10 points.",
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
