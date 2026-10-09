import { ArrowRight, Play, Trophy } from "lucide-react";
import { games, scoreUnit, type GameID, type Result } from "../lib/store";
import { librarySections } from "./Library";
const unit = scoreUnit;

export default function Scores({
  results,
  player,
  onPlayer,
  onPlay,
  onBrowse,
}: {
  results: Result[];
  player: string;
  onPlayer: (name: string) => void;
  onPlay: (game: GameID) => void;
  onBrowse: () => void;
}) {
  const players = [...new Set(results.map((result) => result.name))];
  const selected = players.includes(player) ? player : "";
  const visible = selected
    ? results.filter((result) => result.name === selected)
    : results;
  if (!results.length)
    return (
      <div className="empty-scores">
        <span className="empty-state-icon" aria-hidden="true"><Trophy size={28} strokeWidth={1.5} /></span>
        <h2>No scores yet</h2>
        <p>Finish a game to save your score.</p>
        <button className="primary-button" onClick={onBrowse}>
          Find a game <ArrowRight size={18} />
        </button>
      </div>
    );
  return (
    <>
      <div className="score-filter">
        <label htmlFor="score-player">Player</label>
        <select
          id="score-player"
          value={selected}
          onChange={(event) => onPlayer(event.target.value)}
        >
          <option value="">Everyone</option>
          {players.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="best-scores">
        {librarySections.flatMap((section) => section.games).map((id) => {
          const entries = visible.filter((result) => result.game === id);
          const best = entries.reduce<Result | undefined>(
            (current, result) =>
              !current || result.score > current.score ? result : current,
            undefined,
          );
          return (
            <section key={id} aria-label={`${games[id].title} best score`}>
              <img src={games[id].image} alt="" />
              <div className="best-score-detail">
                <h2>{games[id].title}</h2>
                <p>
                  {best
                    ? selected
                      ? "Personal best"
                      : best.name
                    : "Not played yet"}
                </p>
                {best && (
                  <strong>
                    {best.score}
                    <span>{id === "target" ? " / 50" : ` ${unit(id, best.score)}`}</span>
                  </strong>
                )}
                <button
                  className="text-button"
                  aria-label={`Play ${games[id].title} from scores`}
                  onClick={() => onPlay(id)}
                >
                  <Play size={15} /> {best ? "Play again" : "Play"}
                </button>
              </div>
            </section>
          );
        })}
      </div>
      <h2 className="recent-title">
        {selected ? `${selected}’s recent games` : "Recent games"}
      </h2>
      <div className="results-list">
        {visible.map((result) => (
          <div className="result-row" key={result.id}>
            <div>
              <strong>{games[result.game].title}</strong>
              <p>
                {result.name} ·{" "}
                {new Intl.DateTimeFormat(undefined, {
                  month: "short",
                  day: "numeric",
                }).format(result.date)}
              </p>
            </div>
            <strong className="result-score">
              {result.score}
              <small>{unit(result.game, result.score)}</small>
            </strong>
          </div>
        ))}
      </div>
    </>
  );
}
