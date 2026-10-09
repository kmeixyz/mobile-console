import { ArrowRight, Check, RotateCcw } from "lucide-react";
/** A plain, accurate headline for the end of a game. */
export function resultTitle(players: { name: string; score: number }[]) {
  if (players.length === 1)
    return players[0].score > 0 ? "Nicely played." : "No points this time.";
  const best = Math.max(...players.map((p) => p.score));
  const leaders = players.filter((p) => p.score === best);
  return leaders.length > 1 ? "It’s a tie." : `${leaders[0].name} wins.`;
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
        <strong>{score}</strong>
        <span>{max ? `out of ${max}` : "points"}</span>
      </div>
      <div className="finish-actions">
        <button className="primary-button" onClick={onRestart}>
          <RotateCcw size={17} /> Play again
        </button>
        <button className="secondary-button" onClick={onExit}>
          Choose another game <ArrowRight size={17} />
        </button>
      </div>
      <p className="saved-note">
        <Check size={15} /> Saved to Scores
      </p>
    </div>
  );
}
