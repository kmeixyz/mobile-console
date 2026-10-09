import { games, type GameID } from "../lib/store";
import "./library.css";

// Basket Catch, Flashlight Hunt and Tank Tag stay out of the library (and
// scores) for now.
export const librarySections: { id: string; title: string; games: GameID[] }[] = [
  {
    id: "single-player",
    title: "Single-player",
    games: ["fruit", "target", "moles", "maze"],
  },
  {
    id: "multiplayer",
    title: "Multiplayer",
    games: ["hockey", "rally", "kart", "sumo", "paint"],
  },
];
const descriptions: Record<GameID, string> = {
  basket: "Catch fruit before it drops.",
  flashlight: "Find critters hidden in darkness.",
  kart: "Race your friends three laps.",
  sumo: "Bump rivals off the island.",
  tanks: "Fire shots to tag rivals.",
  paint: "Paint more floor than rivals.",
  moles: "Whack moles before they hide.",
  fruit: "Slice fruit and dodge bombs.",
  hockey: "Score on the far goal.",
  maze: "Drag the runner through mazes.",
  rally: "Keep the ball rally going.",
  target: "Shoot arrows at the center.",
};
export default function Library({
  onLaunch,
}: {
  onLaunch: (game: GameID) => void;
}) {
  return (
    <div className="play-library">
      {librarySections.map((section) => (
        <section className="library-section" aria-labelledby={`${section.id}-heading`} key={section.id}>
          <div className="catalog-heading">
            <h2 id={`${section.id}-heading`}>{section.title}</h2>
          </div>
          <div className="game-shelf">
            {section.games.map((id, i) => (
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
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
