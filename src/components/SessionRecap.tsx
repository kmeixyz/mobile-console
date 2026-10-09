import { Trophy } from "lucide-react";
import { games, type GameID } from "../lib/store";

export default function SessionRecap({
  lineup,
  players,
  scores,
}: {
  lineup: GameID[];
  players: string[];
  scores: Partial<Record<GameID, number[]>>;
}) {
  return (
    <section className="session-recap" aria-labelledby="recap-title">
      <h2 id="recap-title" tabIndex={-1}>
        Game night results
      </h2>
      <div className="recap-games">
        {lineup.map((id) => {
          const points = scores[id] || [];
          const best = Math.max(...points);
          return (
            <section
              key={id}
              className="recap-game"
              aria-label={`${games[id].title} scores`}
            >
              <header>
                <img src={games[id].image} alt="" />
                <h3>{games[id].title}</h3>
              </header>
              <ol>
                {players.map((name, index) => (
                  <li key={index}>
                    <span className="recap-name">{name}</span>
                    {points[index] !== undefined && points[index] === best && (
                      <span className="recap-best">
                        <Trophy size={13} />
                        {points.filter((score) => score === best).length > 1
                          ? "Tied"
                          : "Best"}
                      </span>
                    )}
                    <strong>
                      {points[index] ?? "—"}
                      <small> pts</small>
                    </strong>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
    </section>
  );
}
