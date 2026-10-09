import { games, type GameID } from "../lib/store";
import "./library.css";

const libraryOrder: GameID[] = [
  "target",
  "fruit",
  "hockey",
  "moles",
  "maze",
  "rally",
];
const comingSoon = new Set<GameID>([]);
const descriptions: Record<GameID, string> = {
  moles: "Whack moles before they hide.",
  fruit: "Slice fruit before time runs out.",
  hockey: "Knock the puck into the far goal.",
  maze: "Drag the runner to the flag.",
  rally: "Send the ball back over the net.",
  target: "Shoot arrows at the center.",
};
export default function Library({
  onLaunch,
}: {
  onLaunch: (game: GameID) => void;
}) {
  return (
    <div className="play-library">
      <div className="game-shelf">
        {libraryOrder.map((id, i) => {
          const soon = comingSoon.has(id);
          return (
            <article
              className={`shelf-game ${id}${soon ? " coming-soon" : ""}`}
              key={id}
            >
              <button
                className="shelf-launch"
                onClick={() => onLaunch(id)}
                disabled={soon}
                aria-label={
                  soon
                    ? `${games[id].title}, coming soon`
                    : `Play ${games[id].title}`
                }
              >
                <div className="shelf-art">
                  <img
                    src={games[id].image}
                    alt=""
                    loading={i < 3 ? "eager" : "lazy"}
                  />
                  {soon && (
                    <span className="shelf-soon" aria-hidden="true">
                      <span>Coming Soon</span>
                    </span>
                  )}
                </div>
                <div className="shelf-copy">
                  <div>
                    <h3>{games[id].title}</h3>
                    <p>{descriptions[id]}</p>
                  </div>
                  <span className="shelf-play" aria-hidden="true">
                    Play
                  </span>
                </div>
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
