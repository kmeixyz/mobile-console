import { difficulties, difficultyHelp, type Difficulty } from "../lib/difficulty";
import { useState } from "react";
import { ArrowRight, Clock3 } from "lucide-react";
import GameTutorial from "./GameTutorial";
import "./game-setup.css";
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
  initialHard = false,
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
  initialHard?: boolean;
  onMode: (mode: PlayMode) => void;
  onStart: (names: string[], relaxed: boolean, hard: boolean, difficulty: Difficulty) => void;
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
  // In air hockey and table tennis both players move at once, so each needs
  // their own phone.
  const headToHead = game === "hockey" || game === "rally";
  const groupNames = headToHead
    ? phoneNames.slice(0, 2)
    : usePhones
      ? phoneNames
      : names.slice(0, count);
  const needsPhone = together && headToHead && !usePhones;
  const [relaxed, setRelaxed] = useState(initialRelaxed);
  const [hard, setHard] = useState(initialHard);
  const [difficulty, setDifficulty] = useState<Difficulty>("Easy");
  return (
    <div className="launch-setup">
      <div className={`launch-art ${game}`}>
        <GameTutorial game={game} />
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
            !relaxed && hard,
            difficulty,
          );
        }}
      >
        <div className="setup-howto">
          <h2>How to play</h2>
          <ol className="play-steps">
            {gameHelp[game].steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
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
            Single player.
          </p>
        )}
        {together && headToHead ? (
          <p className="setup-note">
            {usePhones
              ? `${phoneNames[0]} plays on the left, ${phoneNames[1]} on the right, each on their own phone.`
              : "Two players, two phones. Connect a second phone to play together."}
          </p>
        ) : together && usePhones ? (
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
        {headToHead && !together && (
          <fieldset className="setup-difficulty">
            <legend>Difficulty</legend>
            <div className="difficulty-options">
              {difficulties.map(option => (
                <label key={option}>
                  <input type="radio" name="difficulty" value={option} checked={difficulty === option}
                    onChange={() => setDifficulty(option)} aria-describedby="difficulty-help" />
                  <span>{option}</span>
                </label>
              ))}
            </div>
            <p id="difficulty-help">{difficultyHelp[difficulty]}</p>
          </fieldset>
        )}
        {game === "fruit" && (
          <div className="setup-checks">
            <label className="setup-check">
              <input
                type="checkbox"
                checked={!relaxed}
                onChange={(e) => setRelaxed(!e.target.checked)}
              />
              <span>Add bombs</span>
            </label>
            {!relaxed && (
              <label className="setup-check setup-check-sub">
                <input
                  type="checkbox"
                  checked={hard}
                  onChange={(e) => setHard(e.target.checked)}
                />
                <span>Hard mode</span>
              </label>
            )}
          </div>
        )}
        <button
          className="primary-button full-width"
          type="submit"
          disabled={needsPhone}
        >
          Start {games[game].title}
          <ArrowRight size={18} />
        </button>
      </form>
    </div>
  );
}
