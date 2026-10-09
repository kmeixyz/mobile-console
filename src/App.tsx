import { useWakeLock } from "./lib/useWakeLock";
import type { Difficulty } from "./lib/difficulty";
import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  MoreHorizontal,
  RotateCcw,
  Pause,
  ChevronLeft,
  Check,
  ChevronRight,
  Gamepad2,
  Play,
  Smartphone,
  Trophy,
} from "lucide-react";
import {
  games,
  gameHelp,
  isArcadeGame,
  useStored,
  prepareAudio,
  type GameID,
  type Result,
  type Settings as Preferences,
} from "./lib/store";
import { useRoom } from "./lib/room";
import Settings from "./components/Settings";
import Pairing from "./components/Pairing";
import Dialog from "./components/Dialog";
import GameSetup from "./components/GameSetup";
import Scores from "./components/Scores";
import Library from "./components/Library";
import PhoneWelcome from "./components/PhoneWelcome";
import WaitingForPhones from "./components/WaitingForPhones";
import { HudContext } from "./components/GameHud";
const WhackAMole = lazy(() => import("./games/WhackAMole"));
// Rounded eight-tooth gear (Tabler "settings", MIT); Lucide's gear is boxier.
function GearIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" />
      <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
    </svg>
  );
}
const Rally = lazy(() => import("./games/Rally"));
const Fruit = lazy(() => import("./games/Fruit"));
const MazeRunner = lazy(() => import("./games/MazeRunner"));
const AirHockey = lazy(() => import("./games/AirHockey"));
const ArcadeGame = lazy(() => import("./games/ArcadeGame"));
const Archery = lazy(() => import("./games/Archery"));
const Controller = lazy(() => import("./components/Controller"));
class GameBoundary extends Component<
  { children: ReactNode; onExit: () => void },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="game-error">
        <Gamepad2 size={42} />
        <h2>This game couldn’t load.</h2>
        <p>Go back and try again.</p>
        <button className="primary-button" onClick={this.props.onExit}>
          Back to Play
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
/** Reads, or with a value sets, a flag that lasts as long as this tab. */
function sessionFlag(key: string, value?: boolean) {
  try {
    if (value === undefined) return sessionStorage.getItem(key) === "1";
    sessionStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Storage may be blocked; the flag just doesn't outlive a reload.
  }
  return !!value;
}
function Loading() {
  return (
    <div className="loading-screen" role="status">
      <span className="spinner" />
      <p>Loading…</p>
    </div>
  );
}
export default function App() {
  const [settings, setSettings] = useStored<Preferences>(
    "mobile-console-settings",
    {
      sound: true,
      motion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      contrast: false,
      name: "Player 1",
    },
  );
  const [results, setResults] = useStored<Result[]>(
    "mobile-console-results",
    [],
  );
  const [game, setGame] = useState<GameID | null>(null);
  useWakeLock(!!game);
  const [pendingGame, setPendingGame] = useState<GameID | null>(null);
  const [roster, setRoster] = useState<string[]>([settings.name || "Player 1"]);
  const [resumeRequested, setResumeRequested] = useState(false);
  const [gameRun, setGameRun] = useState(0);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [relaxed, setRelaxed] = useState(true);
  const [hard, setHard] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("Easy");
  const [sheet, setSheet] = useState<
    "settings" | "pair" | "menu" | "scores" | null
  >(null);
  const [confirmExit, setConfirmExit] = useState(false);
  // Demo mode starts past the connect screen.
  const [entered, setEntered] = useState(!!import.meta.env.VITE_DEMO);
  // Once past the connect screen in this tab (even before a reload), phones
  // that drop and come back return to the library without another click.
  const enteredBefore = useRef(sessionFlag("mobile-console-entered"));
  if (entered && !enteredBefore.current) {
    enteredBefore.current = true;
    sessionFlag("mobile-console-entered", true);
  }
  // The big screen is in another tab or minimized: the game holds still.
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const room = useRoom(
    confirmExit ||
      confirmRestart ||
      sheet !== null ||
      hidden ||
      !entered,
    true,
    game ? roster : null,
  );
  // A phone is required to play.
  // Mid-game, a phone that's put away or quiet pauses the game in place
  // (WaitingForPhones); only losing every phone goes back to connecting.
  const needsPhone = !entered || !room.paired || (!room.motionReady && !game);
  const [hudStart, setHudStart] = useState<HTMLElement | null>(null);
  const [hudEnd, setHudEnd] = useState<HTMLElement | null>(null);
  const [hudCorner, setHudCorner] = useState<HTMLElement | null>(null);
  const setupPlayers = room.players.map((player, index) => ({
    ...player,
    name: player.name || (import.meta.env.VITE_DEMO ? settings.name : `Player ${index + 1}`),
    motionReady: player.motionReady && (!!player.name || !!import.meta.env.VITE_DEMO),
  }));
  // A player's phone is away, sideways or recentering mid-game.
  const waitingOnPhone = !needsPhone && room.waiting.length > 0;
  const suspended =
    confirmExit || confirmRestart || sheet !== null || hidden || needsPhone || waitingOnPhone;
  const choosePhone = () => {
    setEntered(true);
    setSheet(null);
    setResumeRequested(true);
  };
  const activeGame = game || pendingGame;
  const gameComplete = !!game && room.gameState.label === "Game complete";
  const [scorePlayer, setScorePlayer] = useState("");
  const returnToLibrary = () => {
    setGame(null);
    setPendingGame(null);
    setSheet(null);
    window.scrollTo(0, 0);
  };
  const closeSheet = () => {
    setSheet(null);
    if (game) setResumeRequested(true);
  };
  const changeSetup = () => {
    if (!game) return;
    setPendingGame(game);
    setGame(null);
    setSheet(null);
    window.scrollTo(0, 0);
  };
  const exitGame = () => {
    if (pendingGame || room.gameState.label === "Game complete") {
      returnToLibrary();
    } else setConfirmExit(true);
  };
  const isController = new URLSearchParams(location.search).has("join");
  useEffect(() => {
    document.documentElement.dataset.motion = settings.motion
      ? "reduce"
      : "full";
    document.documentElement.dataset.transparency = settings.transparency
      ? "reduce"
      : "full";
    document.documentElement.dataset.contrast = settings.contrast
      ? "high"
      : "normal";
  }, [settings]);
  useEffect(() => {
    const page = isController
      ? "Controller"
      : activeGame
        ? games[activeGame].title
        : needsPhone
          ? "Connect"
          : "Play";
    document.title = `Mobile Console | ${page}`;
    if (!game) room.publish(null, false);
  }, [game, activeGame, isController, needsPhone, room.publish]);
  // The library has no heading, so coming back from a game focuses that
  // game's Play button instead.
  const lastGame = useRef<GameID | null>(null);
  useEffect(() => {
    const left = !activeGame && lastGame.current;
    lastGame.current = activeGame;
    document
      .querySelector<HTMLElement>(
        left ? `[aria-label="Play ${games[left].title}"]` : "main h1",
      )
      ?.focus({ preventScroll: true });
  }, [activeGame, pendingGame, gameRun]);
  useEffect(() => {
    if (gameComplete) {
      document
        .querySelector<HTMLElement>(".round-finished h2")
        ?.focus();
      window.scrollTo(0, 0);
    }
  }, [gameComplete]);
  useEffect(() => {
    if (resumeRequested && sheet === null && !hidden && !needsPhone && !waitingOnPhone) {
      setResumeRequested(false);
      if (room.gameState.label === "Paused")
        room.handler.current?.({ action: "throw", value: 0 });
    }
  }, [resumeRequested, sheet, hidden, needsPhone, waitingOnPhone, room.gameState.label, room.handler]);
  // Pick up where the game left off once every phone it needs is back, and
  // the big screen is in view again.
  useEffect(() => {
    if (game && !waitingOnPhone && !hidden) setResumeRequested(true);
  }, [game, waitingOnPhone, hidden]);
  useEffect(() => {
    const pause = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !needsPhone &&
        game &&
        !sheet &&
        !confirmExit &&
        !confirmRestart &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault();
        setSheet("menu");
      }
    };
    window.addEventListener("keydown", pause);
    return () => window.removeEventListener("keydown", pause);
  }, [game, sheet, confirmExit, confirmRestart, needsPhone]);
  useEffect(() => {
    if (!room.paired || (!room.motionReady && !game)) setEntered(false);
  }, [room.paired, room.motionReady, game]);
  // The phones a game needs came back after the room lost them all: carry on.
  const phonesBack = room.paired && room.waiting.every((w) => w.reason !== "away");
  useEffect(() => {
    if (game && !entered && phonesBack) setEntered(true);
  }, [game, entered, phonesBack]);
  useEffect(() => {
    if (!game && !entered && enteredBefore.current && room.paired && room.motionReady)
      setEntered(true);
  }, [game, entered, room.paired, room.motionReady]);
  // The name typed on the phone becomes Player 1 for setup and saved scores.
  useEffect(() => {
    if (room.playerName && room.playerName !== settings.name) {
      setSettings({ ...settings, name: room.playerName });
    }
  }, [room.playerName]);
  useEffect(() => {
    if (needsPhone) {
      setSheet(null);
      setConfirmExit(false);
      setConfirmRestart(false);
    }
    if (!needsPhone && game) setResumeRequested(true);
    document
      .querySelector<HTMLElement>(
        needsPhone ? ".phone-welcome h1" : ".app main h1",
      )
      ?.focus({ preventScroll: true });
  }, [needsPhone, game]);
  useEffect(() => {
    if (!game) return;
    const blockLocalKeys = (event: KeyboardEvent) => {
      if (
        [
          "Space",
          "KeyP",
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
        ].includes(event.code) &&
        !(event.target as HTMLElement)?.closest(
          "button,input,select,textarea,summary,dialog",
        )
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", blockLocalKeys, true);
    return () => window.removeEventListener("keydown", blockLocalKeys, true);
  }, [game]);
  const saveResult = (
    id: GameID,
    score: number,
    name = settings.name || "Player 1",
  ) => {
    setResults((old) =>
      [
        {
          id:
            globalThis.crypto?.randomUUID?.() ??
            `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          game: id,
          score,
          name,
          date: Date.now(),
        },
        ...old,
      ].slice(0, 100),
    );
  };
  const launch = (id: GameID) => {
    setRoster([settings.name || "Player 1"]);
    setRelaxed(true);
    setHard(false);
    setPendingGame(id);
    window.scrollTo(0, 0);
  };
  if (isController)
    return (
      <Suspense fallback={<Loading />}>
        <Controller />
      </Suspense>
    );
  return (
    <>
      {needsPhone && (
        <PhoneWelcome
          room={room}
          playing={!!game}
          onContinue={choosePhone}
        />
      )}
      <div
        hidden={needsPhone}
        inert={needsPhone}
        className={`app ${activeGame ? "in-game" : ""} phone-play`}
      >
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="topbar">
          <div className="topbar-inner">
            <button
              className="brand"
              aria-label="Mobile Console home"
              onClick={returnToLibrary}
            >
              <img className="brand-symbol" src="/icon-192.png" alt="" />
              <span>Mobile Console</span>
            </button>
            <nav className="header-actions" aria-label="Main navigation">
              {!activeGame && (
                <button
                  className="profile-button scores-button"
                  aria-disabled="true"
                  aria-label="Scores, coming soon"
                >
                  <Trophy size={19} /> <span>Scores</span>
                </button>
              )}
              <button
                className="profile-button"
                aria-haspopup="dialog"
                aria-expanded={sheet === "settings"}
                onClick={() => setSheet("settings")}
              >
                <GearIcon size={19} /> <span>Settings</span>
              </button>
              <button
                aria-label={
                  room.paired
                    ? "Phone connected — manage connection"
                    : "Connect a phone"
                }
                className={`connection-button ${room.paired ? "connected" : ""}`}
                aria-haspopup="dialog"
                aria-expanded={sheet === "pair"}
                onClick={() => setSheet("pair")}
              >
                <Smartphone size={19} />
                <span>
                  {room.players.length > 1
                    ? `${room.players.length} connected`
                    : room.paired
                      ? "Connected"
                      : "Connect"}
                </span>
                {room.paired && <Check size={14} />}
              </button>
            </nav>
          </div>
        </header>
        {activeGame ? (
          <main
            id="main"
            className="game-main"
          >
            <div className="game-topline">
              <div className="game-topline-side">
                <button className="text-button back-button" onClick={exitGame}>
                  <ChevronLeft size={18} />{" "}
                  <span className="back-label">
                    {pendingGame
                      ? "Back"
                      : room.gameState.label === "Game complete"
                        ? "Done"
                        : "End game"}
                  </span>
                </button>
                <div className="game-hud" ref={setHudStart} />
              </div>
              <h1 tabIndex={-1}>{games[activeGame].title}</h1>
              <div className="game-topline-side">
                <div className="game-hud" ref={setHudEnd} />
                <div className="game-topline-end">
                <div className="game-hud" ref={setHudCorner} />
              {game && !gameComplete ? (
                <button
                  className="game-menu-button"
                  aria-label={
                    gameComplete ? "Game menu" : "Pause game — Game menu"
                  }
                  onClick={() => setSheet("menu")}
                >
                  {gameComplete ? (
                    <MoreHorizontal size={19} />
                  ) : (
                    <Pause size={17} />
                  )}
                  <span>{gameComplete ? "Menu" : "Pause"}</span>
                </button>
              ) : (
                <span className="game-topline-spacer" />
              )}
                </div>
              </div>
            </div>
            {pendingGame ? (
              <GameSetup
                key={pendingGame}
                game={pendingGame}
                players={setupPlayers}
                initialRelaxed={relaxed}
                initialHard={hard}
                onStart={(names, calm, hardMode, opponentDifficulty) => {
                  prepareAudio(settings.sound);
                  if (names.length === 1) {
                    setSettings({ ...settings, name: names[0] });
                  }
                  setRoster(names);
                  setRelaxed(calm);
                  setHard(hardMode);
                  setDifficulty(opponentDifficulty);
                  room.publish(pendingGame, false, "Getting your game ready");
                  setGame(pendingGame);
                  setPendingGame(null);
                  window.scrollTo(0, 0);
                }}
              />
            ) : (
              game && (
                <div className="game-stage">
                  <div
                    className={
                      !gameComplete ? "phone-game" : "local-game"
                    }
                    inert={!gameComplete}
                  >
                    <HudContext.Provider
                      value={{ start: hudStart, end: hudEnd, corner: hudCorner }}
                    >
                    <GameBoundary
                      key={`${game}-${gameRun}`}
                      onExit={returnToLibrary}
                    >
                      <Suspense fallback={<Loading />}>
                        {isArcadeGame(game) ? (
                          <ArcadeGame game={game} roster={roster} difficulty={difficulty} suspended={suspended}
                            settings={settings} room={room} onComplete={(score, name) => saveResult(game, score, name)} onExit={returnToLibrary} />
                        ) : game === "moles" ? (
                          <WhackAMole
                            roster={roster}
                            suspended={suspended}
                            settings={settings}
                            room={room}
                            onComplete={(score, name) =>
                              saveResult("moles", score, name)
                            }
                            onExit={returnToLibrary}
                          />
                        ) : game === "fruit" ? (
                          <Fruit
                            relaxed={relaxed}
                            hard={hard}
                            suspended={suspended}
                            roster={roster}
                            settings={settings}
                            room={room}
                            onComplete={(score, name) =>
                              saveResult("fruit", score, name)
                            }
                            onExit={returnToLibrary}
                          />
                        ) : game === "rally" ? (
                          <Rally
                            difficulty={difficulty}
                            roster={roster}
                            suspended={suspended}
                            settings={settings}
                            room={room}
                            onComplete={(score, name) =>
                              saveResult("rally", score, name)
                            }
                            onExit={returnToLibrary}
                          />
                        ) : game === "hockey" ? (
                          <AirHockey
                            difficulty={difficulty}
                            roster={roster}
                            suspended={suspended}
                            settings={settings}
                            room={room}
                            onComplete={(score, name) =>
                              saveResult("hockey", score, name)
                            }
                            onExit={returnToLibrary}
                          />
                        ) : game === "maze" ? (
                          <MazeRunner
                            roster={roster}
                            settings={settings}
                            room={room}
                            suspended={suspended}
                            onComplete={(score, name) =>
                              saveResult("maze", score, name)
                            }
                            onExit={returnToLibrary}
                          />
                        ) : (
                          <Archery
                            roster={roster}
                            suspended={suspended}
                            settings={settings}
                            room={room}
                            onComplete={(score, name) =>
                              saveResult("target", score, name)
                            }
                            onExit={returnToLibrary}
                          />
                        )}
                      </Suspense>
                    </GameBoundary>
                    </HudContext.Provider>
                  </div>
                  {waitingOnPhone && !gameComplete && (
                    <WaitingForPhones waiting={room.waiting} />
                  )}
                  {gameComplete && roster.length > 1 && (
                    <div
                      className="result-next-actions"
                      aria-label="More ways to play"
                    >
                      <button className="text-button" onClick={changeSetup}>
                        Change players
                      </button>
                    </div>
                  )}
                </div>
              )
            )}
          </main>
        ) : (
          <main id="main" className="library">
            <Library onLaunch={launch} />
          </main>
        )}
        {sheet === "menu" && game && (
          <Dialog title="Game menu" onClose={closeSheet}>
            <p className="sheet-intro">
              {games[game].title} ·{" "}
              {roster.length > 1 ? `${roster.length} players` : "Single player"}
            </p>
            <button
              className="primary-button full-width"
              onClick={() => {
                setResumeRequested(true);
                setSheet(null);
              }}
            >
              {gameComplete ? "Back to results" : "Continue playing"}{" "}
              <Play size={18} />
            </button>
            {!gameComplete && (
              <div className="menu-how">
                <h3>How to play</h3>
                <div className="play-steps">
                  {gameHelp[game].steps.map((step, i) => (
                    <p key={step}><span>{i + 1}.</span>{step}</p>
                  ))}
                </div>
              </div>
            )}
            <div className="menu-actions">
              {!gameComplete && (
                <button
                  onClick={() => {
                    setSheet(null);
                    setConfirmRestart(true);
                  }}
                >
                  Start over <ChevronRight size={18} />
                </button>
              )}
              <button
                onClick={() =>
                  setSettings({ ...settings, sound: !settings.sound })
                }
              >
                Sound {settings.sound ? "on" : "off"}
                <span>{settings.sound ? "Mute" : "Unmute"}</span>
              </button>
              <button onClick={() => setSheet("settings")}>
                Settings
                <ChevronRight size={18} />
              </button>
              <button onClick={() => setSheet("pair")}>
                {room.paired ? "Your phone" : "Connect a phone"}
                <ChevronRight size={18} />
              </button>
              <button onClick={returnToLibrary}>
                More games
                <ChevronRight size={18} />
              </button>
            </div>
          </Dialog>
        )}
        {sheet === "scores" && (
          <Dialog title="Scores" className="scores-sheet" onClose={closeSheet}>
            <p className="sheet-intro">
              Your personal bests. A little friendly competition.
            </p>
            <Scores
              results={results}
              player={scorePlayer}
              onPlayer={setScorePlayer}
              onPlay={(id) => {
                setSheet(null);
                launch(id);
                if (scorePlayer) setRoster([scorePlayer]);
              }}
              onBrowse={() => setSheet(null)}
            />
          </Dialog>
        )}
        {sheet === "settings" && (
          <Settings
            settings={settings}
            onBack={game ? () => setSheet("menu") : undefined}
            setSettings={setSettings}
            onClose={closeSheet}
          />
        )}
        {sheet === "pair" && (
          <Pairing
            room={room}
            playing={!!activeGame}
            onBack={game ? () => setSheet("menu") : undefined}
            onClose={room.paired && room.motionReady ? choosePhone : closeSheet}
          />
        )}
        {confirmRestart && game && (
          <Dialog
            title="Start this game over?"
            onClose={() => {
              setConfirmRestart(false);
              setSheet("menu");
            }}
          >
            <p className="sheet-intro">
              Same players and options. Saved scores stay.
            </p>
            <button
              data-initial-focus
              className="primary-button full-width"
              onClick={() => {
                setConfirmRestart(false);
                setResumeRequested(true);
              }}
            >
              Keep playing
            </button>
            <button
              className="secondary-button full-width end-game-button"
              onClick={() => {
                setConfirmRestart(false);
                setResumeRequested(false);
                room.publish(game, false, "Getting your game ready");
                setGameRun((run) => run + 1);
                window.scrollTo(0, 0);
              }}
            >
              <RotateCcw size={18} /> Start over
            </button>
          </Dialog>
        )}
        {confirmExit && (
          <Dialog
            title="End this game?"
            className="end-game-sheet"
            onClose={() => {
              setConfirmExit(false);
              setResumeRequested(true);
            }}
          >
            <button
              data-initial-focus
              className="primary-button full-width"
              onClick={() => {
                setConfirmExit(false);
                setResumeRequested(true);
              }}
            >
              Keep playing
            </button>
            <button
              className="secondary-button full-width end-game-button"
              onClick={() => {
                returnToLibrary();
                setConfirmExit(false);
              }}
            >
              End game
            </button>
          </Dialog>
        )}
      </div>
    </>
  );
}
