/** Small original synthesized cues. No downloads or looping background audio. */
export type SoundCue = "hit" | "pickup" | "boost" | "slice" | "combo" | "finish";
type Note = { from: number; to: number; duration: number; delay?: number; wave?: OscillatorType };
const cues: Record<SoundCue, Note[]> = {
  hit: [{ from: 210, to: 105, duration: .1, wave: "triangle" }],
  pickup: [{ from: 660, to: 990, duration: .12 }],
  boost: [{ from: 180, to: 540, duration: .24, wave: "triangle" }],
  slice: [{ from: 430, to: 180, duration: .09, wave: "triangle" }],
  combo: [{ from: 660, to: 660, duration: .14 }, { from: 880, to: 990, duration: .18, delay: .09 }],
  finish: [{ from: 523, to: 523, duration: .18 }, { from: 784, to: 1047, duration: .25, delay: .13 }],
};
let context: AudioContext | null = null;
let enabled = true;
const voices = new Set<OscillatorNode>();
const lastCue = new Map<SoundCue, number>();

function silence() {
  for (const voice of voices) {
    try { voice.stop(); } catch { /* It may already have ended. */ }
  }
  voices.clear();
  lastCue.clear();
}

/** Settings changes stop even the tail of an already-playing cue. */
export function setAudioEnabled(value: boolean) {
  enabled = value;
  if (!value) silence();
}

/** Call on game launch, within the user's click, to unlock the audio device. */
export function prepareAudio(allowed: boolean) {
  if (!allowed || !enabled || typeof document === "undefined" || document.hidden) return null;
  try {
    if (!context) {
      context = new AudioContext();
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          silence();
          void context?.suspend().catch(() => {});
        }
      });
    }
    if (context.state === "suspended") void context.resume().catch(() => {});
    return context;
  } catch { return null; }
}

export function playCue(allowed: boolean, cue: SoundCue) {
  const audio = prepareAudio(allowed);
  // Do not replay stale events after a permission prompt or background pause.
  if (!audio || audio.state !== "running") return;
  const now = audio.currentTime, notes = cues[cue];
  if (now - (lastCue.get(cue) ?? -Infinity) < .075 || voices.size + notes.length > 8) return;
  lastCue.set(cue, now);
  for (const note of notes) {
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    const start = now + (note.delay ?? 0), end = start + note.duration;
    oscillator.type = note.wave ?? "sine";
    oscillator.frequency.setValueAtTime(note.from, start);
    oscillator.frequency.exponentialRampToValueAtTime(note.to, end);
    gain.gain.setValueAtTime(0, now);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(.035, start + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, end);
    oscillator.connect(gain); gain.connect(audio.destination);
    voices.add(oscillator);
    oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(start); oscillator.stop(end + .01);
  }
}

/** Existing score cues retain their two levels of emphasis. */
export const chime = (allowed: boolean, high = false) => playCue(allowed, high ? "combo" : "pickup");
