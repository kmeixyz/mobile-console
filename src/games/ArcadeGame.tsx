import { useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { chime, formatScore, fourSeatGames, games, isSimultaneous, scoreUnit, type Settings } from "../lib/store";
import type { Difficulty } from "../lib/difficulty";
import type { useRoom } from "../lib/room";
import { Hud } from "../components/GameHud";
import { ReadyInstruction, ReadyTitle, startLabels as phoneStartLabels } from "../components/GameInstruction";
import { FinishActions, FinishScores } from "../components/ResultPanel";
import PointsStar from "../components/PointsStar";
import TurnHandoff from "../components/TurnHandoff";
import { blankInput, colors, type ArcadeID, type Engine, type Options, type Player, type Standing } from "./arcade/types";
import { createBasket } from "./arcade/basket";
import { createFlashlight } from "./arcade/flashlight";
import { createKart } from "./arcade/kart";
import { kartViews } from "./arcade/kart-views";
import { createSumo } from "./arcade/sumo";
import { createTanks } from "./arcade/tanks";
import { createPaint } from "./arcade/paint";
import { beginScreenText, flushScreenText } from "./arcade/draw";
import "./arcade.css";
import "./screen-text.css";

export const factories: Record<ArcadeID, (options: Options) => Engine> = {
  basket: createBasket, flashlight: createFlashlight, kart: createKart, sumo: createSumo, tanks: createTanks, paint: createPaint,
};
const startLabels = phoneStartLabels as Record<ArcadeID, string>;
const clock = (s: number) => { const n = Math.ceil(s); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`; };
type Phase = "ready" | "playing" | "handoff" | "finished";
export default function ArcadeGame({ game, roster, difficulty, settings, room, suspended, onComplete, onExit }: {
  game: ArcadeID; roster: string[]; difficulty: Difficulty; settings: Settings;
  room: ReturnType<typeof useRoom>; suspended: boolean;
  onComplete: (score: number, name: string) => void; onExit: () => void;
}) {
  const multiplayer = isSimultaneous(game);
  // Scores as bare numbers; the bar above already says what they count.
  const shortScore = (n: number) => game === "paint" ? `${n}%` : String(n);
  const split = game === "kart";
  const [players] = useState<Player[]>(() => {
    const humans = roster.map((name, i) => ({ name, bot: false, color: colors[i] }));
    const seats = fourSeatGames.includes(game) ? 4 : multiplayer ? Math.max(2, humans.length) : humans.length;
    const used = new Set(roster);
    while (humans.length < seats) {
      let name = `Bot ${humans.length - roster.length + 1}`;
      while (used.has(name)) name += " (bot)";
      used.add(name); humans.push({ name, bot: true, color: colors[humans.length] });
    }
    return humans;
  });
  const kartPanels = kartViews(players);
  const viewCount = game === "kart" ? kartPanels.length : split ? 4 : 1;
  const turn = useRef(0);
  const makeEngine = () => factories[game]({ players: multiplayer ? players : [players[turn.current]], difficulty });
  const [initial] = useState(makeEngine);
  const engine = useRef(initial);
  const phase = useRef<Phase>("ready");
  const [view, setView] = useState({ phase: "ready" as Phase, hud: initial.hud, remaining: initial.remaining, label: startLabels[game], message: initial.message, scores: initial.standings() });
  const results = useRef<Standing[]>([]);
  const inputs = useRef(players.map(blankInput));
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  // Menus, and phones the game is waiting on, pause it (see App).
  const paused = suspended;
  const latest = useRef({ paused, settings, onComplete, room });
  latest.current = { paused, settings, onComplete, room };
  const refresh = () => setView({ phase: phase.current, hud: engine.current.hud, remaining: engine.current.remaining,
    label: phase.current === "ready" ? startLabels[game] : engine.current.label,
    message: engine.current.message, scores: phase.current === "finished" ? [...results.current] : engine.current.standings() });
  const clearInputs = () => { inputs.current.forEach(input => { input.held = false; input.tap = false; input.released = false; }); };
  const complete = () => {
    if (phase.current !== "playing") return;
    const scored = engine.current.standings();
    for (const p of scored) if (!p.bot) latest.current.onComplete(p.score, p.name);
    results.current = multiplayer ? scored : [...results.current, ...scored];
    phase.current = !multiplayer && turn.current < roster.length - 1 ? "handoff" : "finished";
    clearInputs(); chime(latest.current.settings.sound, true); latest.current.room.buzz(100); refresh();
  };
  const advance = () => {
    turn.current++; engine.current = makeEngine(); phase.current = "ready"; clearInputs(); refresh();
  };
  const restart = () => {
    turn.current = 0; results.current = []; engine.current = makeEngine(); phase.current = "ready"; clearInputs(); refresh();
  };
  const handlers = useRef({ complete, advance, refresh }); handlers.current = { complete, advance, refresh };
  useEffect(() => {
    if (paused) clearInputs();
  }, [paused]);
  useEffect(() => {
    const release = () => clearInputs();
    document.addEventListener("visibilitychange", release); window.addEventListener("blur", release);
    return () => { document.removeEventListener("visibilitychange", release); window.removeEventListener("blur", release); };
  }, []);
  useEffect(() => {
    const active = multiplayer ? null : roster[turn.current];
    const next = view.phase === "handoff" ? roster[turn.current + 1] : null;
    room.publish(game, !paused && view.phase !== "finished", view.phase === "finished" ? "Game complete" : view.phase === "handoff" ? `Your turn, ${next}.` : view.label, next, next || active);
  }, [game, paused, view.phase, view.label, roster, multiplayer, room.publish]);
  useEffect(() => {
    room.handler.current = e => {
      if (latest.current.paused || !Number.isFinite(e.value)) return;
      let index = e.player ? players.findIndex(p => !p.bot && p.name === e.player) : multiplayer ? 0 : phase.current === "handoff" ? turn.current + 1 : turn.current;
      if (index < 0 || (!multiplayer && index !== (phase.current === "handoff" ? turn.current + 1 : turn.current))) return;
      if (phase.current === "handoff") { if (e.action === "next") handlers.current.advance(); return; }
      if (phase.current === "finished") return;
      if (phase.current === "ready") {
        if (e.action === "throw") { clearInputs(); phase.current = "playing"; handlers.current.refresh(); }
        return;
      }
      const input = inputs.current[index];
      if (e.action === "aim") input.x = Math.max(-1, Math.min(1, e.value));
      if (e.action === "move") input.y = Math.max(-1, Math.min(1, e.value));
      if (phase.current !== "playing") return;
      if (e.action === "draw") input.held = e.value > 0;
      if (e.action === "shoot") { input.released = true; input.held = false; }
      if (e.action === "throw") input.tap = true;
    };
    return () => { room.handler.current = null; };
  }, [room.handler, players, multiplayer]);
  const onBoard = view.phase !== "handoff" && view.phase !== "finished";
  useEffect(() => {
    if (!onBoard || !canvas.current) return;
    const element = canvas.current, c = element.getContext("2d"); if (!c) return;
    let width = 900, height = 600, frame = 0, previous = performance.now(), shown = 0, accumulated = 0;
    let dirty = true, drawnEngine: Engine | null = null, drawnTime = -1, drawnMotion = false;
    const resize = () => {
      width = element.clientWidth; height = element.clientHeight;
      // Four road views are fill-rate heavy on Retina displays. Cap the racing
      // surface at 1.5x; text and the surrounding UI keep their native resolution.
      const ratio = Math.min(window.devicePixelRatio || 1, game === "kart" ? 1.5 : 2);
      element.width = Math.round(width * ratio); element.height = Math.round(height * ratio); c.setTransform(ratio, 0, 0, ratio, 0, 0);
      dirty = true;
    };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const tick = (now: number) => {
      const dt = Math.min(.05, Math.max(0, (now - previous) / 1000)); previous = now;
      if (!latest.current.paused && !document.hidden) {
        if (phase.current === "playing") {
          // Fixed steps keep movement, pickups and collisions stable on every
          // display. A tap stays queued until a physics step actually runs.
          accumulated = Math.min(accumulated + dt, .05);
          while (accumulated + 1e-9 >= 1 / 120 && !engine.current.done) {
            engine.current.step(1 / 120, multiplayer ? inputs.current : [inputs.current[turn.current]]);
            accumulated = Math.max(0, accumulated - 1 / 120);
            inputs.current.forEach(input => { input.tap = false; input.released = false; });
          }
          if (engine.current.done) handlers.current.complete();
        }
      }
      if (latest.current.paused || document.hidden || phase.current !== "playing") accumulated = 0;
      // Ready screens and paused games retain their last frame. Repaint on
      // resize, replay, or a motion preference change; live frames interpolate between steps.
      if (!document.hidden && (!latest.current.paused && phase.current === "playing" || dirty || drawnEngine !== engine.current || drawnTime !== engine.current.time || drawnMotion !== latest.current.settings.motion)) {
        engine.current.setReducedMotion?.(latest.current.settings.motion);
        beginScreenText(element);
        engine.current.draw(c, width, height, phase.current === "playing" && !latest.current.paused ? accumulated * 120 : 1);
        if (textLayer.current) flushScreenText(textLayer.current);
        dirty = false; drawnEngine = engine.current; drawnTime = engine.current.time; drawnMotion = latest.current.settings.motion;
      }
      if (now - shown > 100 && onBoard) { shown = now; handlers.current.refresh(); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [onBoard, multiplayer, game]);
  if (view.phase === "handoff") return <TurnHandoff name={roster[turn.current + 1]} detail={`${roster[turn.current]} scored ${formatScore(game, results.current.at(-1)?.score || 0)}`} />;
  if (view.phase === "finished") {
    const sorted = [...results.current].sort((a, b) => b.score - a.score);
    const tied = sorted.filter(p => p.score === sorted[0].score).length > 1;
    const title = sorted.length === 1 ? sorted[0].score > 0 ? "Great job!" : "Nice try!" : tied ? "It’s a tie!" : `${sorted[0].name} wins!`;
    return <div className="round-finished">
      <h2 tabIndex={-1}>{title}</h2>
      <FinishScores players={sorted.map(p => game === "kart" ? p : { ...p, label: formatScore(game, p.score),
        shown: <>{shortScore(p.score)}{game === "paint" ? null : scoreUnit(game, 2) === "points" ? <PointsStar /> : <small>{scoreUnit(game, p.score)}</small>}</> })} />
      <FinishActions onRestart={restart} onExit={onExit} />
    </div>;
  }
  // Sumo seats its players on both sides of the title, by where they start.
  const sides = multiplayer && view.scores.some(p => p.side);
  const standings = (scores: typeof view.scores) => <div className={`arcade-standings${sides ? " is-sided" : ""}`} aria-label="Current scores">{[...scores].sort((a, b) => (a.seatX ?? 0) - (b.seatX ?? 0)).map(p => <span key={p.name} aria-label={`${p.name}${p.bot ? ", bot" : ""}, ${formatScore(game, p.score)}`}>
        <i className="arcade-player-dot" style={{ backgroundColor: players.find(player => player.name === p.name)?.color }} aria-hidden="true" />
        <strong title={p.name}>{p.name}</strong><span>{shortScore(p.score)}</span>
      </span>)}</div>;
  return <div className={`sports-game arcade-game arcade-${game}`}>
    {/* The same top bar as the original games: a solo turn's score with its
        star, or every player's score in a match, then the clock. Kart
        shows each racer's place on their own screen instead. */}
    <Hud slot="start">{game === "kart" ? null : multiplayer
      ? standings(sides ? view.scores.filter(p => p.side === "start") : view.scores)
      : <strong className="hud-score arcade-hud-score" aria-label={formatScore(game, view.scores[0]?.score ?? 0)}><span>{view.scores[0]?.score ?? 0}</span><PointsStar /></strong>}</Hud>
    <Hud slot="end">{sides ? standings(view.scores.filter(p => p.side === "end")) : <div className={`fruit-timer arcade-timer${view.phase === "playing" && view.remaining <= 10 ? " is-urgent" : ""}`} aria-label={`${Math.ceil(view.remaining)} seconds remaining`}><Timer aria-hidden="true" /><strong>{clock(view.remaining)}</strong></div>}</Hud>
    <div className={`court-wrap arcade-arena${split ? " arcade-split" : ""}`} data-game={game} data-phase={view.phase} data-views={viewCount} data-first-view-width={game === "kart" ? kartPanels[0].w : split ? .5 : 1} data-first-view-height={game === "kart" ? kartPanels[0].h : split ? .5 : 1}>
      <canvas ref={canvas} role="img" aria-label={`${games[game].title} playfield${split ? `, ${viewCount === 1 ? "full-screen driver view" : `${viewCount} player views`}` : ""}. ${view.hud}`} />
      <div ref={textLayer} className="screen-text-layer" aria-hidden="true" />
      {view.phase === "ready" && <div className="arcade-overlay"><ReadyTitle player={!multiplayer && roster.length > 1 ? roster[turn.current] : undefined} /><ReadyInstruction game={game} /></div>}
    </div>
  </div>;
}
