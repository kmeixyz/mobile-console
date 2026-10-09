import { useState } from "react";
import Dialog from "./Dialog";
export default function PartyEditor({
  party,
  onSave,
  onClose,
}: {
  party: string[];
  onSave: (names: string[]) => void;
  onClose: () => void;
}) {
  const [count, setCount] = useState(party.length);
  const [names, setNames] = useState(
    Array.from({ length: 4 }, (_, i) => party[i] || `Player ${i + 1}`),
  );
  return (
    <Dialog title="Who’s playing?" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(
            names.slice(0, count).map((n, i) => n.trim() || `Player ${i + 1}`),
          );
        }}
      >
        <div className="mode-switch" role="group" aria-label="How many players?">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={count === n}
                className={count === n ? "selected" : ""}
                onClick={() => setCount(n)}
              >
                {n} players
              </button>
            ))}
        </div>
        <div className="player-inputs">
          {names.slice(0, count).map((name, i) => (
            <label key={i}>
              <span>Player {i + 1}</span>
              <input
                value={name}
                maxLength={20}
                autoComplete="off"
                onChange={(e) =>
                  setNames((old) =>
                    old.map((n, k) => (i === k ? e.target.value : n)),
                  )
                }
              />
            </label>
          ))}
        </div>
        <button className="primary-button full-width" type="submit">
          Save players
        </button>
      </form>
    </Dialog>
  );
}
