import { useState } from "react";
import { ArrowRight, Clock3 } from "lucide-react";
import {
  games,
  gameHelp,
  supportsTogether,
  type GameID,
  type PlayMode,
} from "../lib/store";
export default function GameSetup({
  game,
  mode,
  name,
  party,
  phoneNames = [],
  initialRelaxed = true,
  gameNight = false,
  sessionLength = 4,
  onMode,
  onStart,
}: {
  game: GameID;
  mode: PlayMode;
  name: string;
  party: string[];
  /** Named phones in the room; with two or more, they are the players. */
  phoneNames?: string[];
  initialRelaxed?: boolean;
  gameNight?: boolean;
  sessionLength?: number;
  onMode: (mode: PlayMode) => void;
  onStart: (names: string[], relaxed: boolean) => void;
}) {
  const multiplayer = supportsTogether(game);
  const together = multiplayer && mode === "together";
  const [count, setCount] = useState(party.length);
  const usePhones = phoneNames.length >= 2;
  const [soloName, setSoloName] = useState(
    usePhones && !phoneNames.includes(name) ? phoneNames[0] : name || "Player 1",
  );
  const [names, setNames] = useState([
    ...Array.from({ length: 4 }, (_, i) => party[i] || `Player ${i + 1}`),
  ]);
  const groupNames = usePhones ? phoneNames : names.slice(0, count);
  const [relaxed, setRelaxed] = useState(initialRelaxed);
  return (
    <div className="launch-setup">
      <div className={`launch-art ${game}`}>
        <img src={games[game].image} alt="" />
        <div>
          <span>
            <Clock3 size={16} />
            {games[game].time}
          </span>
        </div>
      </div>
      <form
        className="launch-form"
        onSubmit={(e) => {
          e.preventDefault();
          onStart(
            (together ? groupNames : [soloName]).map(
              (n, i) => n.trim() || `Player ${i + 1}`,
            ),
            relaxed,
          );
        }}
      >
        <div className="setup-howto">
          <h2>How to play</h2>
          <p>{gameHelp[game].motion}</p>
          <p>{gameHelp[game].goal}</p>
        </div>
        {gameNight && (
          <p className="setup-note">
            Same players for all {sessionLength} games.
          </p>
        )}
        {multiplayer ? (
          <div className="mode-switch" role="group" aria-label="Who’s playing?">
            <button
              type="button"
              aria-pressed={!together}
              className={!together ? "selected" : ""}
              onClick={() => onMode("solo")}
            >
              Single player
            </button>
            <button
              type="button"
              aria-pressed={together}
              className={together ? "selected" : ""}
              onClick={() => onMode("together")}
            >
              Play together
            </button>
          </div>
        ) : (
          <p className="setup-note">
            Single player{game === "rally" ? " vs. the computer" : ""}.
          </p>
        )}
        {together && usePhones ? (
          <p className="setup-note">
            Playing: {phoneNames.join(", ")}. {phoneNames[0]} goes first, each on
            their own phone.
          </p>
        ) : together ? (
          <>
            <div className="mode-switch" role="group" aria-label="How many players?">
              {[2, 3, 4].map((n) => (
                <button
                  type="button"
                  key={n}
                  aria-pressed={count === n}
                  className={count === n ? "selected" : ""}
                  onClick={() => setCount(n)}
                >
                  {n} players
                </button>
              ))}
            </div>
            <div className="player-inputs">
              {names.slice(0, count).map((n, i) => (
                <label key={i}>
                  <span>Player {i + 1}</span>
                  <input
                    autoComplete="off"
                    maxLength={20}
                    value={n}
                    onChange={(e) =>
                      setNames((old) =>
                        old.map((v, k) => (k === i ? e.target.value : v)),
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <p className="setup-note">
              {names[0].trim() || "Player 1"} goes first. Pass the phone between turns.
            </p>
          </>
        ) : usePhones ? (
          <div className="mode-switch" role="group" aria-label="Who’s playing?">
            {phoneNames.map((n) => (
              <button
                type="button"
                key={n}
                aria-pressed={soloName === n}
                className={soloName === n ? "selected" : ""}
                onClick={() => setSoloName(n)}
              >
                {n}
              </button>
            ))}
          </div>
        ) : (
          <p className="setup-note">Playing as {soloName}.</p>
        )}
        {game === "fruit" && (
          <label className="setup-check">
            <input
              type="checkbox"
              checked={relaxed}
              onChange={(e) => setRelaxed(e.target.checked)}
            />
            <span>
              Relaxed: no bombs
              {!relaxed && " (three bomb hits ends a turn)"}
            </span>
          </label>
        )}
        <button className="primary-button full-width" type="submit">
          Start {games[game].title}
          <ArrowRight size={18} />
        </button>
      </form>
    </div>
  );
}
