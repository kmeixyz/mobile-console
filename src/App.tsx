import {
  Component,
  Suspense,
  lazy,
  useEffect,
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
  Settings2,
  Smartphone,
  Trophy,
} from "lucide-react";
import {
  games,
  gameHelp,
  useStored,
  type GameID,
  type Result,
  type PlayMode,
  type Settings as Preferences,
} from "./lib/store";
import { useRoom } from "./lib/room";
import Settings from "./components/Settings";
import Pairing from "./components/Pairing";
import Dialog from "./components/Dialog";
import PartyEditor from "./components/PartyEditor";
import GameSetup from "./components/GameSetup";
import Scores from "./components/Scores";
import Library, { gameNight } from "./components/Library";
import PhoneWelcome from "./components/PhoneWelcome";
import SessionRecap from "./components/SessionRecap";
const Bowling = lazy(() => import("./games/Bowling"));
const Rally = lazy(() => import("./games/Rally"));
const Fruit = lazy(() => import("./games/Fruit"));
const ActionSports = lazy(() => import("./games/ActionSports"));
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
  const [mode, setMode] = useState<PlayMode>("solo");
  const [tab, setTab] = useState<"play" | "scores">("play");
  const [game, setGame] = useState<GameID | null>(null);
  const [pendingGame, setPendingGame] = useState<GameID | null>(null);
  const [roster, setRoster] = useState<string[]>([settings.name || "Player 1"]);
  const [party, setParty] = useStored<string[]>("mobile-console-party", [
    settings.name || "Player 1",
    "Player 2",
  ]);
  const [resumeRequested, setResumeRequested] = useState(false);
  const [nightGames, setNightGames] = useState<GameID[]>(gameNight);
  const [nightScores, setNightScores] = useState<
    Partial<Record<GameID, number[]>>
  >({});
  const [gameRun, setGameRun] = useState(0);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [nightIndex, setNightIndex] = useState<number | null>(null);
  const [relaxed, setRelaxed] = useState(true);
  const [sheet, setSheet] = useState<
    "settings" | "pair" | "menu" | "players" | null
  >(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [entered, setEntered] = useState(false);
  const room = useRoom(
    confirmExit ||
      confirmRestart ||
      sheet !== null ||
      !entered,
    true,
  );
  const needsPhone = !entered || !room.paired || !room.motionReady;
  // With two or more named phones, the people holding them are the group.
  const phoneNames = room.players.filter((p) => p.name).map((p) => p.name);
  const usePhones = phoneNames.length >= 2;
  const suspended =
    confirmExit || confirmRestart || sheet !== null || needsPhone;
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
    setNightIndex(null);
    setSheet(null);
    setTab("play");
    window.scrollTo(0, 0);
  };
  const closeSheet = () => {
    setSheet(null);
    if (game) setResumeRequested(true);
  };
  const nextNightGame = () => {
    if (nightIndex === null || !gameComplete) return;
    const next = nightIndex + 1;
    if (next >= nightGames.length) {
      returnToLibrary();
      return;
    }
    setNightIndex(next);
    room.publish(nightGames[next], false, "Getting your game ready");
    setGame(nightGames[next]);
    window.scrollTo(0, 0);
  };
  const changeSetup = () => {
    if (!game) return;
    setNightIndex(null);
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
    document.title = activeGame
      ? `${games[activeGame].title} — Mobile Console`
      : "Mobile Console";
    if (!game) room.publish(null, false);
  }, [game, activeGame, room.publish]);
  useEffect(() => {
    document
      .querySelector<HTMLElement>("main h1")
      ?.focus({ preventScroll: true });
  }, [activeGame, pendingGame, tab, gameRun]);
  useEffect(() => {
    if (gameComplete) {
      document
        .querySelector<HTMLElement>(
          nightIndex === nightGames.length - 1
            ? ".session-recap h2"
            : ".round-finished h2",
        )
        ?.focus();
      window.scrollTo(0, 0);
    }
  }, [gameComplete, nightIndex, nightGames.length]);
  useEffect(() => {
    if (resumeRequested && sheet === null && !needsPhone) {
      setResumeRequested(false);
      if (room.gameState.label === "Paused")
        room.handler.current?.({ action: "throw", value: 0 });
    }
  }, [resumeRequested, sheet, needsPhone, room.gameState.label, room.handler]);
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
    if (!room.paired || !room.motionReady) setEntered(false);
  }, [room.paired, room.motionReady]);
  // The name typed on the phone becomes Player 1 for setup and saved scores.
  useEffect(() => {
    if (room.playerName && room.playerName !== settings.name) {
      setSettings({ ...settings, name: room.playerName });
      setRoster((old) => [room.playerName, ...old.slice(1)]);
      // The group's first player is the phone's owner unless they renamed it.
      if (party[0] === settings.name || party[0] === "Player 1")
        setParty([room.playerName, ...party.slice(1)]);
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
    if (nightIndex !== null)
      setNightScores((old) => ({ ...old, [id]: [...(old[id] || []), score] }));
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
    setNightIndex(null);
    setRoster([settings.name || "Player 1"]);
    setRelaxed(true);
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
              onClick={() => (activeGame ? exitGame() : setTab("play"))}
            >
              Mobile Console
            </button>
            {!activeGame && (
              <nav className="desktop-tabs" aria-label="Main navigation">
                <button
                  className={tab === "play" ? "selected" : ""}
                  aria-current={tab === "play" ? "page" : undefined}
                  onClick={() => setTab("play")}
                >
                  Play
                </button>
                <button
                  className={tab === "scores" ? "selected" : ""}
                  aria-current={tab === "scores" ? "page" : undefined}
                  onClick={() => setTab("scores")}
                >
                  Scores
                </button>
              </nav>
            )}
            <div className="header-actions">
              <button
                aria-label={
                  room.paired
                    ? "Phone connected — manage connection"
                    : "Connect a phone"
                }
                className={`connection-button ${room.paired ? "connected" : ""}`}
                onClick={() => setSheet("pair")}
              >
                <Smartphone size={17} />
                <span>
                  {room.players.length > 1
                    ? `${room.players.length} phones connected`
                    : room.paired
                      ? "Phone connected"
                      : "Connect a phone"}
                </span>
                {room.paired && <Check size={14} />}
              </button>
              <button
                className="profile-button"
                onClick={() => setSheet("settings")}
              >
                Settings
              </button>
            </div>
          </div>
        </header>
        {activeGame ? (
          <main
            id="main"
            className={`game-main ${gameComplete && nightIndex === nightGames.length - 1 ? "session-complete" : ""}`}
          >
            <div className="game-topline">
              <button className="text-button back-button" onClick={exitGame}>
                <ChevronLeft size={18} />{" "}
                {pendingGame
                  ? "Back"
                  : room.gameState.label === "Game complete"
                    ? "Done"
                    : "End game"}
              </button>
              <h1 tabIndex={-1}>{games[activeGame].title}</h1>
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
            {nightIndex !== null && (
              <section
                className="session-progress"
                aria-label="Game night progress"
              >
                <strong>
                  Game night · {nightIndex + 1} of {nightGames.length}
                </strong>
                <span>
                  {nightIndex + 1 < nightGames.length
                    ? `Up next: ${games[nightGames[nightIndex + 1]].title}`
                    : "Last game"}
                </span>
                <div className="session-dots" aria-hidden="true">
                  {nightGames.map((id, i) => (
                    <i
                      key={id}
                      className={
                        i === nightIndex
                          ? "current"
                          : i < nightIndex
                            ? "complete"
                            : ""
                      }
                    />
                  ))}
                </div>
              </section>
            )}
            {pendingGame ? (
              <GameSetup
                key={pendingGame}
                game={pendingGame}
                mode={mode}
                name={roster[0] || settings.name}
                party={party}
                phoneNames={phoneNames}
                initialRelaxed={relaxed}
                gameNight={nightIndex !== null}
                sessionLength={nightGames.length}
                onMode={setMode}
                onStart={(names, calm) => {
                  if (names.length === 1) {
                    setSettings({ ...settings, name: names[0] });
                    setNightIndex(null);
                  }
                  setRoster(names);
                  if (names.length > 1) setParty(names);
                  setRelaxed(calm);
                  room.publish(pendingGame, false, "Getting your game ready");
                  setGame(pendingGame);
                  setPendingGame(null);
                  window.scrollTo(0, 0);
                }}
              />
            ) : (
              game && (
                <>
                  <div
                    className={
                      !gameComplete ? "phone-game" : "local-game"
                    }
                    inert={!gameComplete}
                  >
                    <GameBoundary
                      key={`${game}-${gameRun}`}
                      onExit={returnToLibrary}
                    >
                      <Suspense fallback={<Loading />}>
                        {game === "bowling" ? (
                          <Bowling
                            roster={roster}
                            suspended={suspended}
                            settings={settings}
                            room={room}
                            onComplete={(score, name) =>
                              saveResult("bowling", score, name)
                            }
                            onExit={returnToLibrary}
                          />
                        ) : game === "fruit" ? (
                          <Fruit
                            relaxed={relaxed}
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
                            suspended={suspended}
                            settings={{ ...settings, name: roster[0] }}
                            room={room}
                            onComplete={(score) =>
                              saveResult("rally", score, roster[0])
                            }
                            onExit={returnToLibrary}
                          />
                        ) : game === "golf" || game === "hoops" ? (
                          <ActionSports
                            game={game}
                            roster={roster}
                            settings={settings}
                            room={room}
                            suspended={suspended}
                            onComplete={(score, name) =>
                              saveResult(game, score, name)
                            }
                            onExit={returnToLibrary}
                          />
                        ) : (
                          <Archery
                            suspended={suspended}
                            settings={{ ...settings, name: roster[0] }}
                            room={room}
                            onComplete={(score) =>
                              saveResult("target", score, roster[0])
                            }
                            onExit={returnToLibrary}
                          />
                        )}
                      </Suspense>
                    </GameBoundary>
                  </div>
                  {gameComplete && nightIndex === nightGames.length - 1 && (
                    <SessionRecap
                      lineup={nightGames}
                      players={roster}
                      scores={nightScores}
                    />
                  )}
                  {gameComplete && nightIndex !== null && (
                    <section
                      className="session-next"
                      aria-label="Continue game night"
                    >
                      <h2>
                        {nightIndex + 1 < nightGames.length
                          ? "Up next"
                          : "Game night complete"}
                      </h2>
                      <button
                        className="primary-button"
                        onClick={nextNightGame}
                      >
                        {nightIndex + 1 < nightGames.length
                          ? `Next game: ${games[nightGames[nightIndex + 1]].title}`
                          : "Finish game night"}
                        <ArrowRight size={18} />
                      </button>
                    </section>
                  )}
                  {gameComplete && (
                    <div
                      className="result-next-actions"
                      aria-label="More ways to play"
                    >
                      {roster.length > 1 && (
                        <button className="text-button" onClick={changeSetup}>
                          Change players
                        </button>
                      )}
                      <button
                        className="text-button"
                        onClick={() => {
                          setScorePlayer(roster.length === 1 ? roster[0] : "");
                          setGame(null);
                          setNightIndex(null);
                          setTab("scores");
                          window.scrollTo(0, 0);
                        }}
                      >
                        View scores
                      </button>
                    </div>
                  )}
                  {!gameComplete && !room.gameState.handoff && (
                    <details className="game-help">
                      <summary>How to play {games[game].title}</summary>
                      <ol>
                        {howToPlay(game).map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    </details>
                  )}
                </>
              )
            )}
          </main>
        ) : (
          <main id="main" className="library">
            {tab === "play" ? (
              <>
                <Library
                  mode={mode}
                  party={usePhones ? phoneNames : party}
                  phonesSetGroup={usePhones}
                  onMode={setMode}
                  onLaunch={launch}
                  onPlayers={() => setSheet("players")}
                  onGameNight={(lineup) => {
                    setNightGames(lineup);
                    setNightScores({});
                    launch(lineup[0]);
                    setNightIndex(0);
                  }}
                />
              </>
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <h1 tabIndex={-1}>Scores</h1>
                  </div>
                </div>
                <Scores
                  results={results}
                  player={scorePlayer}
                  onPlayer={setScorePlayer}
                  onPlay={(id) => {
                    setMode("solo");
                    launch(id);
                    if (scorePlayer) setRoster([scorePlayer]);
                  }}
                  onBrowse={() => setTab("play")}
                />
              </>
            )}
          </main>
        )}
        {!activeGame && (
          <nav className="mobile-tabs" aria-label="Mobile navigation">
            <button
              className={tab === "play" ? "active" : ""}
              aria-current={tab === "play" ? "page" : undefined}
              onClick={() => setTab("play")}
            >
              <Gamepad2 size={23} />
              <span>Play</span>
            </button>
            <button
              className={tab === "scores" ? "active" : ""}
              aria-current={tab === "scores" ? "page" : undefined}
              onClick={() => setTab("scores")}
            >
              <Trophy size={22} />
              <span>Scores</span>
            </button>
            <button onClick={() => setSheet("pair")}>
              <Smartphone size={22} />
              <span>Connect</span>
            </button>
            <button onClick={() => setSheet("settings")}>
              <Settings2 size={22} />
              <span>Settings</span>
            </button>
          </nav>
        )}
        {sheet === "players" && (
          <PartyEditor
            party={party}
            onSave={(names) => {
              setParty(names);
              setSheet(null);
            }}
            onClose={closeSheet}
          />
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
                <ol>
                  {howToPlay(game).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
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
              <button
                onClick={() => {
                  setSheet(null);
                  exitGame();
                }}
              >
                Choose another game
                <ChevronRight size={18} />
              </button>
            </div>
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
                setNightScores((old) => ({ ...old, [game]: [] }));
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
            onClose={() => {
              setConfirmExit(false);
              setResumeRequested(true);
            }}
          >
            <p className="sheet-intro">
              {nightIndex !== null ? "You’ll leave game night. " : ""}This round
              won’t be saved.
            </p>
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
function howToPlay(game: GameID) {
  return [gameHelp[game].motion, "Passing the phone? Tap Recenter on it first."];
}
