import { useEffect, useRef } from "react";
import { games, isArcadeGame, type GameID } from "../lib/store";
import "./game-tutorial.css";

// Refresh cached clips when the bundled tutorial artwork changes.
const tutorialVersion = "game-art-4";

/** Local, silent clips keep the tutorial independent of game and sensor clocks. */
export default function GameTutorial({ game }: { game: GameID }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const play = () => {
      if (!document.hidden) void element.play().catch(() => {
        // Power-saving/autoplay restrictions retain the instructional poster.
      });
    };
    const visibility = () => document.hidden ? element.pause() : play();
    element.muted = true;
    element.addEventListener("canplay", play);
    document.addEventListener("visibilitychange", visibility);
    // A first interaction also recovers playback on restrictive mobile browsers.
    window.addEventListener("pointerdown", play, { passive: true });
    play();
    return () => {
      element.pause();
      element.removeEventListener("canplay", play);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pointerdown", play);
    };
  }, [game]);
  if (isArcadeGame(game) && !["kart", "sumo", "paint"].includes(game)) return (
    <figure className={`game-tutorial tutorial-${game}`}>
      <img src={games[game].image} alt={`${games[game].title}. Phone controls and instructions follow.`} />
    </figure>
  );
  return (
    <figure className={`game-tutorial tutorial-${game}`}>
      <video
        ref={video}
        key={game}
        src={`/tutorials/${game}.mp4?v=${tutorialVersion}`}
        poster={`/tutorials/${game}.jpg?v=${tutorialVersion}`}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        aria-label={`${games[game].title}: five-second demonstration of phone controls and gameplay. Instructions follow.`}
      />
    </figure>
  );
}
