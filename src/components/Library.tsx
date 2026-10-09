import { useState } from "react";
import { ArrowRight, Clock3, Play } from "lucide-react";
import {
  games,
  supportsTogether,
  type GameID,
  type PlayMode,
} from "../lib/store";
import "./library.css";

export const gameNight: GameID[] = ["hoops", "fruit", "golf", "bowling"];
const libraryOrder: GameID[] = [
  "bowling",
  "fruit",
  "golf",
  "hoops",
  "rally",
  "target",
];
const descriptions: Record<GameID, string> = {
  bowling: "Aim and roll. Ten frames.",
  fruit: "Slice fruit before time runs out.",
  golf: "Putt into the cup. Three holes.",
  hoops: "Five shots. Sink as many as you can.",
  rally: "Beat the computer. First to seven.",
  target: "Five arrows. Aim for the center.",
};
export default function Library({
  mode,
  party,
  phonesSetGroup = false,
  onMode,
  onLaunch,
  onPlayers,
  onGameNight,
}: {
  mode: PlayMode;
  party: string[];
  /** The connected phones are the group, so there's nothing to edit. */
  phonesSetGroup?: boolean;
  onMode: (mode: PlayMode) => void;
  onLaunch: (game: GameID) => void;
  onPlayers: () => void;
  onGameNight: (lineup: GameID[]) => void;
}) {
  const [shortNight, setShortNight] = useState(false);
  const lineup: GameID[] = shortNight ? ["hoops", "fruit"] : gameNight;
  const eligible = libraryOrder.filter(
    (id) => mode === "solo" || supportsTogether(id),
  );
  return (
    <div className="play-library">
      <div className="page-heading">
        <h1 tabIndex={-1}>Let’s play.</h1>
        <div className="mode-switch" role="group" aria-label="Choose how to play">
          <button
            className={mode === "solo" ? "selected" : ""}
            aria-pressed={mode === "solo"}
            onClick={() => onMode("solo")}
          >
            Single player
          </button>
          <button
            className={mode === "together" ? "selected" : ""}
            aria-pressed={mode === "together"}
            onClick={() => onMode("together")}
          >
            Play together
          </button>
        </div>
      </div>
      {mode === "together" && (
        <>
          <p className="group-line">
            <span>
              {party.length} players: {party.join(", ")}
            </span>
            {!phonesSetGroup && (
              <button className="text-button" onClick={onPlayers}>
                Change players
              </button>
            )}
          </p>
          <section className="night-row" aria-labelledby="night-title">
            <div>
              <h2 id="night-title">Game night</h2>
              <p>{lineup.map((id) => games[id].title).join(" → ")}</p>
            </div>
            <div className="night-length" role="group" aria-label="Game night length">
              <button
                className={!shortNight ? "selected" : ""}
                aria-pressed={!shortNight}
                onClick={() => setShortNight(false)}
              >
                4 games
              </button>
              <button
                className={shortNight ? "selected" : ""}
                aria-pressed={shortNight}
                onClick={() => setShortNight(true)}
              >
                2 games
              </button>
            </div>
            <button
              className="primary-button"
              onClick={() => onGameNight(lineup)}
            >
              Start game night <ArrowRight size={18} />
            </button>
          </section>
        </>
      )}
      <div className="game-shelf">
        {eligible.map((id, i) => (
          <article className={`shelf-game ${id}`} key={id}>
            <button
              className="shelf-launch"
              onClick={() => onLaunch(id)}
              aria-label={`Play ${games[id].title}`}
            >
              <div className="shelf-art">
                <img
                  src={games[id].image}
                  alt=""
                  loading={i < 3 ? "eager" : "lazy"}
                />
                <span className="shelf-duration">
                  <Clock3 size={13} />
                  {games[id].time}
                </span>
              </div>
              <div className="shelf-copy">
                <div>
                  <h3>{games[id].title}</h3>
                  <p>{descriptions[id]}</p>
                </div>
                <span className="shelf-play" aria-hidden="true">
                  <Play size={14} fill="currentColor" /> Play
                </span>
              </div>
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
