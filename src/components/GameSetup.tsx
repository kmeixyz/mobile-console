import { difficulties, type Difficulty } from "../lib/difficulty";
import { useState } from "react";
import { ArrowRight, Clock3 } from "lucide-react";
import GameTutorial from "./GameTutorial";
import "./game-setup.css";
import {
  games,
  fourSeatGames,
  isSimultaneous,
  gameHelp,
  type GameID,
} from "../lib/store";
export default function GameSetup({
  game,
  players,
  initialRelaxed = true,
  initialHard = false,
  onStart,
}: {
  game: GameID;
  players: { id: string; name: string; motionReady: boolean }[];
  initialRelaxed?: boolean;
  initialHard?: boolean;
  onStart: (names: string[], relaxed: boolean, hard: boolean, difficulty: Difficulty) => void;
}) {
  const headToHead = game === "hockey" || game === "rally";
  const fourSeats = fourSeatGames.includes(game);
  const limit = headToHead ? 2 : 4;
  // Room names are unique and survive a phone reconnecting with a new link ID.
  const orderedPlayers = [...players].sort((a, b) => Number(b.motionReady) - Number(a.motionReady));
  const phoneNames = orderedPlayers.filter(player => player.motionReady).map(player => player.name);
  const phoneKey = JSON.stringify(phoneNames);
  const [selection, setSelection] = useState(() => ({
    phoneKey,
    known: phoneNames,
    selected: phoneNames.slice(0, limit),
  }));
  let selected = selection.selected;
  if (selection.phoneKey !== phoneKey) {
    const remaining = selected.filter(name => phoneNames.includes(name));
    const arrivals = phoneNames.filter(name => !selection.known.includes(name));
    selected = phoneNames.length === 1
      ? phoneNames
      : [...remaining, ...arrivals].slice(0, limit);
    // Reconcile before rendering so Start never uses a disconnected player.
    setSelection({ phoneKey, known: phoneNames, selected });
  }
  const groupNames = phoneNames.filter(name => selected.includes(name));
  const together = groupNames.length > 1;
  const canStart = groupNames.length > 0;
  const togglePlayer = (name: string, checked: boolean) => {
    setSelection(current => ({
      ...current,
      selected: checked
        ? [...current.selected, name].slice(0, limit)
        : current.selected.filter(player => player !== name),
    }));
  };
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
          if (!canStart) return;
          onStart(
            groupNames,
            relaxed,
            !relaxed && hard,
            difficulty,
          );
        }}
      >
        <div className="setup-howto">
          <h2>How to play</h2>
          <div className="play-steps">
            {gameHelp[game].steps.map((step, i) => (
              <p key={step}><span>{i + 1}.</span>{step}</p>
            ))}
          </div>
        </div>
        <fieldset className="setup-players" aria-describedby={canStart ? undefined : "players-help"}>
          <legend>Players</legend>
          <ul className="connected-players setup-player-list" aria-label="Players">
            {orderedPlayers.map(player => {
              const checked = player.motionReady && selected.includes(player.name);
              const atLimit = !checked && groupNames.length >= limit;
              return (
                <li className={`setup-player ${player.motionReady ? "" : "pending"}`} key={player.id}>
                  {player.motionReady && phoneNames.length > 1 ? (
                    <label>
                      <span className="connected-player-name">{player.name}</span>
                      <input type="checkbox" aria-label={player.name} checked={checked}
                        disabled={atLimit} onChange={event => togglePlayer(player.name, event.target.checked)} />
                    </label>
                  ) : (
                    <span className="setup-player-details">
                      <span className="connected-player-name">{player.name}</span>
                      {!player.motionReady && <span className="setup-player-pending">Tap Enable motion on this phone</span>}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {!canStart && <p id="players-help" aria-live="polite">
            {players.length === 0 ? "Connect a phone to play."
              : phoneNames.length === 0 ? "Tap Enable motion on a phone to start."
              : "Choose a player."}
          </p>}
          {headToHead && phoneNames.length > 2 && (
            <p className="setup-player-limit">Up to 2 players.</p>
          )}
        </fieldset>
        {isSimultaneous(game) && (fourSeats ? groupNames.length < 4 : !together) && (
          <fieldset className="setup-difficulty">
            <legend>Difficulty</legend>
            <div className="difficulty-options">
              {difficulties.map(option => (
                <label key={option}>
                  <input type="radio" name="difficulty" value={option} checked={difficulty === option}
                    onChange={() => setDifficulty(option)} />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {fourSeats && groupNames.length === 4 && game === "kart" && (
          <p className="setup-player-limit">Each racer gets their own view.</p>
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
          disabled={!canStart}
        >
          <span className="setup-start-label">
            Start {games[game].title}
            <ArrowRight size={18} />
          </span>
        </button>
      </form>
    </div>
  );
}
