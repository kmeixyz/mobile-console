import { Smartphone } from "lucide-react";
import { type GameID } from "../lib/store";
import "./game-instruction.css";

export const controlHints: Record<GameID, string> = {
  target: "Hold to aim · Release to shoot · Aim against the wind",
  fruit: "Point to slice · Sweep through fruit · Tap to pause",
  hockey: "Point to move · Push the puck into the far goal · First to 7",
  rally: "Point to move · Meet the ball with your paddle · First to 7",
  moles: "Point + tap · Moles +10 · Avoid rabbits and foxes",
  maze: "Hold to drag · Follow the paths to the flag · Dodge the bots",
};

export function ReadyInstruction({ game, paused = false }: { game: GameID; paused?: boolean }) {
  const action = game === "moles" ? "Start round" : game === "fruit" ? "Start slicing" : "Play match";
  return <p className="ready-instruction">Tap <strong>{paused ? game === "moles" ? "Resume round" : game === "fruit" ? "Keep slicing" : "Play match" : action}</strong> on your phone.</p>;
}

export default function GameInstruction({ game, children }: { game: GameID; children?: React.ReactNode }) {
  return <p className="game-play-hint"><Smartphone size={16} aria-hidden="true" /><span>{children || controlHints[game]}</span></p>;
}
