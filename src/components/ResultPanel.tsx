import { RotateCcw } from "lucide-react";
import { type ReactNode } from "react";
import { ordinal } from "../lib/store";
import PointsStar from "./PointsStar";
/** A short, cheerful headline for the end of a game. */
export function resultTitle(players: { name: string; score: number }[]) {
  if (players.length === 1)
    return players[0].score > 0 ? "Great job!" : "Nice try!";
  const best = Math.max(...players.map((p) => p.score));
  const leaders = players.filter((p) => p.score === best);
  return leaders.length > 1 ? "It’s a tie!" : `${leaders[0].name} wins!`;
}
// Gold, silver and bronze, and a sky-blue medal so last place still gets one.
const medals = [["#ffd34d", "#d99a12", "#6b4500"], ["#e8edf3", "#9aa6b5", "#3d4652"], ["#f4ae74", "#c2702f", "#5c2c08"], ["#a9dbff", "#4f97d6", "#163d63"]];
function Medal({ place }: { place: number }) {
  const [face, rim, ink] = medals[Math.min(place, medals.length) - 1];
  return <svg className="finish-medal" viewBox="0 0 56 68" role="img" aria-label={`${ordinal(place)} place`}>
    <path d="M12 0h13l8 26H20z" fill="#ef6a5b" />
    <path d="M44 0H31l-8 26h13z" fill="#5b8def" />
    <circle cx="28" cy="43" r="23" fill={face} stroke={rim} strokeWidth="4" />
    <circle cx="28" cy="43" r="16.5" fill="none" stroke="#ffffff" strokeOpacity=".55" strokeWidth="2" />
    <text x="28" y="49" textAnchor="middle" fill={ink}>{ordinal(place)}</text>
  </svg>;
}
/** Every multiplayer result: best first, each with a medal for its place
    (tied scores share one), the name, then the score when there is one.
    A lone player with no bots to beat gets no medal. */
export function FinishScores({ players }: { players: { name: string; score: number; shown?: ReactNode; label?: string }[] }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return <div className="finish-scores finish-places">{sorted.map((p, i) => <div key={i}>
    {sorted.length > 1 && <Medal place={sorted.findIndex(q => q.score === p.score) + 1} />}
    <span>{p.name}</span>
    {p.shown !== undefined && <strong aria-label={p.label}>{p.shown}</strong>}
  </div>)}</div>;
}
/** The two buttons under every result. */
export function FinishActions({ onRestart, onExit }: { onRestart: () => void; onExit: () => void }) {
  return (
    <div className="finish-actions">
      <button className="primary-button" onClick={onRestart}>
        <RotateCcw size={17} /> Play again
      </button>
      <button className="secondary-button" onClick={onExit}>
        More games
      </button>
    </div>
  );
}
export default function ResultPanel({
  title,
  description,
  score,
  max,
  onRestart,
  onExit,
}: {
  title: string;
  description?: string;
  score: number;
  max?: number;
  onRestart: () => void;
  onExit: () => void;
}) {
  return (
    <div className="round-finished">
      <h2 tabIndex={-1}>{title}</h2>
      {description && <p>{description}</p>}
      <div className="solo-result">
        <strong>
          {score}
          {!max && <PointsStar />}
        </strong>
        {!!max && <span>out of {max}</span>}
      </div>
      <FinishActions onRestart={onRestart} onExit={onExit} />
    </div>
  );
}
