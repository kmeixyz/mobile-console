import { boardPoint } from "../lib/phone-point.mjs";
import GameInstruction, { ReadyInstruction } from "../components/GameInstruction";
import { memo, useEffect, useReducer, useRef, useState } from "react";
import { Check, RotateCcw, Timer } from "lucide-react";
import { Hud } from "../components/GameHud";
import PointsStar from "../components/PointsStar";
import TurnHandoff from "../components/TurnHandoff";
import { resultTitle } from "../components/ResultPanel";
import { chime, type Settings } from "../lib/store";
import type { useRoom } from "../lib/room";
import { AIM, HOLES, ROUND_SECONDS, advanceRound, createRound, whack } from "../lib/moles.mjs";
import { followAmount } from "../lib/game-physics.mjs";
import "./moles.css";

type Phase = "ready" | "playing" | "paused" | "handoff" | "finished";
const Animal = memo(function Animal({ kind }: { kind: string }) {
  const mole = kind === "mole", rabbit = kind === "rabbit";
  const fur = mole ? "url(#mole-fur)" : rabbit ? "url(#rabbit-fur)" : "url(#fox-fur)";
  return <g stroke="#493b34" strokeWidth="3" strokeLinejoin="round">
    {rabbit ? <>
      <ellipse cx="-25" cy="-64" rx="13" ry="35" fill={fur} transform="rotate(-12 -25 -64)" />
      <ellipse cx="25" cy="-64" rx="13" ry="35" fill={fur} transform="rotate(12 25 -64)" />
      <path d="M-26-83v30M26-83v30" stroke="#d7a7aa" strokeWidth="7" strokeLinecap="round" />
    </> : mole ? <>
      <circle cx="-41" cy="-32" r="14" fill={fur} /><circle cx="41" cy="-32" r="14" fill={fur} />
    </> : <>
      <path d="M-46-18-51-75-13-46M46-18 51-75 13-46" fill={fur} />
      <path d="M-39-39-42-61-26-45M39-39 42-61 26-45" fill="#68473b" stroke="none" />
    </>}
    <path d="M-55 39V-10C-55-75 55-75 55-10V39Z" fill={fur} />
    <ellipse cx="0" cy="8" rx={mole ? 35 : 40} ry="27" fill={mole ? "#c9a98a" : "#fff7e8"} stroke="none" />
    <ellipse cx="-30" cy="3" rx="9" ry="5" fill="#efaaa0" opacity=".65" stroke="none" />
    <ellipse cx="30" cy="3" rx="9" ry="5" fill="#efaaa0" opacity=".65" stroke="none" />
    <path d="M-23-18v7M23-18v7" strokeWidth="7" strokeLinecap="round" />
    <path d="M-24-18v1M22-18v1" stroke="#fffdf4" strokeWidth="2" strokeLinecap="round" />
    <path d="M-15-48q10-8 20-4" fill="none" stroke="#ffffff55" strokeWidth="5" strokeLinecap="round" />
    <ellipse cy="-1" rx={mole ? 14 : 8} ry="9" fill={mole || rabbit ? "#e5a0a3" : "#493b34"} />
    <path d="M-11 16q11 12 22 0" fill="none" strokeLinecap="round" />
    {mole && <path d="M-6 20v10H6V20" fill="#fff7e8" strokeWidth="2" />}
    <ellipse cx="-47" cy="31" rx="16" ry="10" fill={mole ? "#c9a98a" : fur} />
    <ellipse cx="47" cy="31" rx="16" ry="10" fill={mole ? "#c9a98a" : fur} />
  </g>;
});

export default function WhackAMole({ roster, settings, suspended = false, room, onComplete, onExit }: {
  roster: string[];
  settings: Settings;
  suspended?: boolean;
  room: ReturnType<typeof useRoom>;
  onComplete: (score: number, name: string) => void;
  onExit: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("ready");
  const phaseRef = useRef<Phase>("ready");
  const [turn, setTurn] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const round = useRef(createRound());
  const board = useRef<SVGSVGElement>(null);
  const pointing = useRef({ x: 0, y: 0 });
  const cursor = useRef({ x: AIM.x, y: AIM.y });
  const shownCursor = useRef({ x: AIM.x, y: AIM.y });
  const reticle = useRef<SVGGElement>(null);
  const hammer = useRef<SVGGElement>(null);
  const lifetimes = useRef<(SVGCircleElement | null)[]>([]);
  const strike = useRef({ x: 0, y: 0, at: -Infinity });
  const signature = useRef("");
  const [message, setMessage] = useState("");
  const [, render] = useReducer(n => n + 1, 0);
  const latest = useRef({ suspended, onComplete, turn, roster });
  latest.current = { suspended, onComplete, turn, roster };
  const changePhase = (next: Phase) => { phaseRef.current = next; setPhase(next); };
  const reset = () => {
    round.current = createRound();
    pointing.current = { x: 0, y: 0 };
    cursor.current = { x: AIM.x, y: AIM.y };
    shownCursor.current = { ...cursor.current };
    signature.current = "";
    setMessage("");
    changePhase("ready");
  };

  useEffect(() => {
    const pause = () => {
      if (phaseRef.current === "playing") changePhase("paused");
    };
    const hide = () => { if (document.hidden) pause(); };
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", hide);
    let frame = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (phaseRef.current === "playing" && !latest.current.suspended && !document.hidden) {
        if (advanceRound(round.current, dt)) {
          const { turn, roster, onComplete } = latest.current;
          changePhase(turn + 1 < roster.length ? "handoff" : "finished");
          setScores(old => [...old, round.current.score]);
          onComplete(round.current.score, roster[turn]);
        }
        // React only reconciles appearances, scores and whole-second clock ticks.
        // The aiming marker stays on the display's animation clock.
        const r = round.current;
        const next = [Math.ceil(r.elapsed), r.score, ...r.holes.map(h => `${h.id}:${h.kind}:${h.feedbackUntil > r.elapsed}`)].join("|");
        if (next !== signature.current) { signature.current = next; render(); }
      }
      const bounds = board.current?.getBoundingClientRect();
      if (bounds && bounds.width && bounds.height) {
        const point = boardPoint(pointing.current.x, pointing.current.y, bounds.width, bounds.height,
          Math.min(bounds.width / 900, bounds.height / 600), AIM.x, AIM.y);
        cursor.current = { x: Math.max(0, Math.min(900, point.x)), y: Math.max(0, Math.min(600, point.y)) };
      }
      const follow = followAmount(dt);
      shownCursor.current.x += (cursor.current.x - shownCursor.current.x) * follow;
      shownCursor.current.y += (cursor.current.y - shownCursor.current.y) * follow;
      reticle.current?.setAttribute("transform", `translate(${shownCursor.current.x} ${shownCursor.current.y})`);
      for (let i = 0; i < round.current.holes.length; i++) {
        const hole = round.current.holes[i];
        const remaining = hole.kind ? Math.max(0, (hole.expires - round.current.elapsed) / (hole.expires - hole.appeared)) : 0;
        lifetimes.current[i]?.setAttribute("stroke-dashoffset", String(100 * (1 - remaining)));
        lifetimes.current[i]?.setAttribute("opacity", remaining ? "0.8" : "0");
      }
      const hitAge = (now - strike.current.at) / 240;
      hammer.current?.setAttribute("opacity", hitAge >= 0 && hitAge < 1 ? String(1 - hitAge ** 3) : "0");
      hammer.current?.setAttribute("transform", `translate(${strike.current.x} ${strike.current.y}) rotate(${Math.max(-35, 15 - hitAge * 50)})`);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  useEffect(() => {
    if (suspended && phaseRef.current === "playing") changePhase("paused");
  }, [suspended]);

  const seconds = Math.ceil(ROUND_SECONDS - round.current.elapsed);
  useEffect(() => {
    room.publish("moles", phase !== "finished",
      phase === "finished" ? "Game complete" : phase === "ready" ? "Ready to whack"
        : phase === "paused" ? "Paused" : phase === "handoff" ? "Next player" : "Whack",
      phase === "handoff" ? roster[turn + 1] : null,
      phase === "handoff" ? roster[turn + 1] : roster[turn]);
    room.handler.current = event => {
      if (suspended) return;
      if (event.action === "next" && phaseRef.current === "handoff") {
        setTurn(old => old + 1);
        reset();
      }
      if (event.action === "aim" || event.action === "move") {
        if (!Number.isFinite(event.value)) return;
        const value = Math.max(-1, Math.min(1, event.value));
        if (event.action === "aim") pointing.current.x = value;
        else pointing.current.y = value;
      }
      if (event.action === "throw") {
        if (phaseRef.current === "ready" || phaseRef.current === "paused") {
          changePhase("playing");
        } else if (phaseRef.current === "playing") {
          strike.current = { ...shownCursor.current, at: performance.now() };
          const hit = whack(round.current, shownCursor.current.x, shownCursor.current.y);
          if (hit) {
            room.buzz(hit.mole ? 25 : 100);
            chime(settings.sound, hit.mole);
            setMessage(hit.mole ? "+10 points" : "Let that friend rest. Up to 15 points off.");
          } else setMessage("Nearly! Point at a mole and tap.");
          render();
        }
      }
    };
    return () => { room.handler.current = null; };
  }, [phase, turn, roster, suspended, settings.sound, room.publish, room.handler, room.buzz]);

  if (phase === "handoff") return <TurnHandoff name={roster[turn + 1]} detail={`${roster[turn]} scored ${round.current.score} points.`} />;
  if (phase === "finished") return <div className="round-finished">
    <h2 tabIndex={-1}>{resultTitle(scores.map((score, i) => ({ score, name: roster[i] })))}</h2>
    <div className="finish-scores">{scores.map((score, i) => <div key={i}>
      <span>{roster[i]}</span><strong>{score}<PointsStar /></strong>
    </div>)}</div>
    <p>{round.current.hits} moles hit · {round.current.mistakes} wrong {round.current.mistakes === 1 ? "animal" : "animals"}{roster.length > 1 ? " in the last turn" : ""}</p>
    <div className="finish-actions">
      <button className="primary-button" onClick={() => { setTurn(0); setScores([]); reset(); }}><RotateCcw size={18} /> Play again</button>
      <button className="secondary-button" onClick={onExit}>Choose another game</button>
    </div>
    <p className="saved-note"><Check size={15} /> Saved to Scores</p>
  </div>;
  return <div className={`moles-game${phase !== "playing" ? " moles-paused" : ""}${settings.motion ? " moles-reduced" : ""}`}>
    <Hud slot="start"><strong className="hud-score moles-score" aria-label={`${round.current.score} points`}><span>{round.current.score}</span><PointsStar /></strong></Hud>
    <Hud slot="end"><div className={`moles-timer${seconds <= 10 ? " is-urgent" : ""}`} aria-label={`${seconds} seconds remaining`}><Timer aria-hidden="true" /><strong>0:{String(seconds).padStart(2, "0")}</strong></div></Hud>
    <div className="moles-garden">
      <svg ref={board} className="moles-board" viewBox="0 0 900 600" role="img" aria-label="Nine garden holes. Point at a mole and tap. Avoid rabbits and foxes.">
        <defs>
          <linearGradient id="mole-fur" x2=".8" y2="1"><stop stopColor="#bd9678" /><stop offset="1" stopColor="#89634f" /></linearGradient>
          <linearGradient id="rabbit-fur" x2=".8" y2="1"><stop stopColor="#fff9ee" /><stop offset="1" stopColor="#d9cbb9" /></linearGradient>
          <linearGradient id="fox-fur" x2=".8" y2="1"><stop stopColor="#ffc779" /><stop offset="1" stopColor="#dc8a43" /></linearGradient>
          <linearGradient id="garden-grass" x2="0" y2="1"><stop stopColor="#e9f2d6" /><stop offset="1" stopColor="#c5dda9" /></linearGradient>
          {HOLES.map((h, i) => <clipPath id={`mole-hole-${i}`} key={i}><path d={`M${h.x-85} ${h.y-155}h170v155q-85 45-170 0Z`} /></clipPath>)}</defs>
        <rect width="900" height="600" fill="url(#garden-grass)" />
        <path d="M0 0H900V80Q680 135 450 85T0 100Z" fill="#c2dba6" />
        <path d="M0 550Q280 505 470 550T900 535V600H0Z" fill="#c9dfae" />
        {[80, 330, 575, 825].map((x, i) => <g key={x} transform={`translate(${x} ${i % 2 ? 560 : 105})`}>
          <path d="M-10 8-15-5M0 10V-12M10 8 15-4" stroke="#81a561" strokeWidth="4" strokeLinecap="round" />
          <circle cy="-18" r="9" fill="#fff8e6" /><circle cy="-18" r="4" fill="#edbd53" />
        </g>)}
        {HOLES.map((h, i) => {
          const hole = round.current.holes[i];
          return <g key={i} data-hole={i} data-animal={hole.kind}>
            <ellipse cx={h.x} cy={h.y+12} rx="86" ry="33" fill="#b4cd95" />
            <ellipse cx={h.x} cy={h.y} rx="79" ry="28" fill="#9b7955" />
            <ellipse cx={h.x} cy={h.y-2} rx="66" ry="21" fill="#493b34" />
            <circle ref={el => { lifetimes.current[i] = el; }} cx={h.x} cy={h.y} r="82" fill="none" stroke="#537a40" strokeWidth="3" pathLength="100" strokeDasharray="100" opacity="0" transform={`translate(0 ${h.y * .7}) scale(1 .3)`} />
            <g clipPath={`url(#mole-hole-${i})`}>
              {hole.kind && <g transform={`translate(${h.x} ${h.y-40})`}><g key={hole.id} className="moles-animal" style={{ animationDuration: `${hole.expires - hole.appeared}s` }}><Animal kind={hole.kind} /></g></g>}
            </g>
            <path d={`M${h.x-76} ${h.y+9}q76 43 152 0`} fill="none" stroke="#ab875d" strokeWidth="8" strokeLinecap="round" />
            {hole.feedbackUntil > round.current.elapsed && <text key={`feedback-${hole.id}`} className={`moles-feedback${hole.feedback.startsWith('Oops') ? ' is-wrong' : ''}`} x={h.x} y={h.y-80} textAnchor="middle">{hole.feedback}</text>}
          </g>;
        })}
        {phase === "playing" && <g ref={reticle} className="moles-reticle" transform={`translate(${shownCursor.current.x} ${shownCursor.current.y})`}>
          <circle r="23" fill="#ffffff35" stroke="#fff" strokeWidth="7" />
          <circle r="23" fill="none" stroke="#493b34" strokeWidth="3" />
          <path d="M-31 0h16M15 0h16M0-31v16M0 15v16" stroke="#493b34" strokeWidth="3" strokeLinecap="round" />
          <circle r="3" fill="#493b34" />
        </g>}
        {phase === "playing" && <g ref={hammer} className="moles-hammer" opacity="0" pointerEvents="none">
          <g transform="translate(-4 7)">
          <path d="M6-18 35 26" stroke="#493b34" strokeWidth="14" strokeLinecap="round" />
          <path d="M6-18 35 26" stroke="#d9b08a" strokeWidth="9" strokeLinecap="round" />
          <rect x="-28" y="-42" width="64" height="35" rx="12" fill="#ffda78" stroke="#493b34" strokeWidth="3" />
          <path d="M-17-34h38" stroke="#fff8e7" strokeWidth="4" strokeLinecap="round" />
          </g>
          <path d="M-9 8-17 17M0 12v12M9 8l8 9" stroke="#fff8e7" strokeWidth="5" strokeLinecap="round" />
        </g>}
      </svg>
      {(phase === "ready" || phase === "paused") && <div className="court-overlay">
        <h2 tabIndex={-1}>{phase === "paused" ? "Paused" : `${roster[turn]}, ready?`}</h2>
        <ReadyInstruction game="moles" paused={phase === "paused"} />
      </div>}
    </div>
    <GameInstruction game="moles" />
    <p className="sr-only" role="status">{message}</p>
  </div>;
}
