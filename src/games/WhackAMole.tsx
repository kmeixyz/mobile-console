import { boardPoint } from "../lib/phone-point.mjs";
import { ReadyInstruction, ReadyTitle } from "../components/GameInstruction";
import { memo, useEffect, useReducer, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { Hud } from "../components/GameHud";
import PointsStar from "../components/PointsStar";
import TurnHandoff from "../components/TurnHandoff";
import { FinishActions, FinishScores, resultTitle } from "../components/ResultPanel";
import { chime, type Settings } from "../lib/store";
import type { useRoom } from "../lib/room";
import { AIM, HOLES, ROUND_SECONDS, advanceRound, createRound, whack } from "../lib/moles.mjs";
import { followAmount } from "../lib/game-physics.mjs";
import "./moles.css";

type Phase = "ready" | "playing" | "paused" | "handoff" | "finished";
const Animal = memo(function Animal({ kind }: { kind: string }) {
  const mole = kind === "mole", rabbit = kind === "rabbit";
  const fur = mole ? "url(#mole-fur)" : rabbit ? "url(#rabbit-fur)" : "url(#fox-fur)";
  return <g stroke="#735746" strokeWidth=".75" strokeLinejoin="round">
    {rabbit ? <>
      <ellipse cx="-25" cy="-64" rx="13" ry="35" fill={fur} transform="rotate(-12 -25 -64)" />
      <ellipse cx="25" cy="-64" rx="13" ry="35" fill={fur} transform="rotate(12 25 -64)" />
      <path d="M-26-83v30M26-83v30" stroke="#d7a7aa" strokeWidth="7" strokeLinecap="round" />
    </> : mole ? <>
      <circle cx="-41" cy="-32" r="14" fill={fur} /><circle cx="41" cy="-32" r="14" fill={fur} />
      <circle cx="-41" cy="-32" r="7" fill="#e6b6aa" stroke="none" /><circle cx="41" cy="-32" r="7" fill="#e6b6aa" stroke="none" />
    </> : <>
      <path d="M-46-18-51-75-13-46M46-18 51-75 13-46" fill={fur} />
      <path d="M-39-39-42-61-26-45M39-39 42-61 26-45" fill="#68473b" stroke="none" />
    </>}
    <path d="M-55 39V-10C-55-75 55-75 55-10V39Z" fill={fur} />
    {!mole && !rabbit && <path d="M-51-21Q-29-16 0 6Q29-16 51-21Q48 35 0 38Q-48 35-51-21Z" fill="#fff4df" stroke="none" />}
    <ellipse cx="0" cy="8" rx={mole ? 35 : 40} ry="27" fill={mole ? "#c9a98a" : "#fff7e8"} stroke="none" />
    <ellipse cx="-30" cy="3" rx="9" ry="5" fill="#efaaa0" opacity=".65" stroke="none" />
    <ellipse cx="30" cy="3" rx="9" ry="5" fill="#efaaa0" opacity=".65" stroke="none" />
    <path d="M-23-18v7M23-18v7" strokeWidth="7" strokeLinecap="round" />
    <path d="M-24-18v1M22-18v1" stroke="#fffdf4" strokeWidth="2" strokeLinecap="round" />
    <path d="M-15-48q10-8 20-4" fill="none" stroke="#ffffff55" strokeWidth="5" strokeLinecap="round" />
    <ellipse cy="-1" rx={mole ? 14 : 8} ry="9" fill={mole || rabbit ? "#e5a0a3" : "#493b34"} />
    <ellipse cx="-3" cy="-5" rx={mole ? 5 : 3} ry="2" fill="#fff8ef" opacity=".65" stroke="none" />
    <path d="M-11 16q11 12 22 0" fill="none" strokeLinecap="round" />
    {mole && <path d="M-6 20v10H6V20" fill="#fff7e8" strokeWidth="2" />}
    <ellipse cx="-47" cy="31" rx="16" ry="10" fill={mole ? "#c9a98a" : fur} />
    <ellipse cx="47" cy="31" rx="16" ry="10" fill={mole ? "#c9a98a" : fur} />
    <path d="M-53 28v5m7-6v6m7-5v5M40 28v5m7-6v6m7-5v5" fill="none" stroke="#73574650" strokeWidth="1.5" strokeLinecap="round" />
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
  const impact = useRef<SVGGElement>(null);
  const animals = useRef<(SVGGElement | null)[]>([]);
  const lifetimes = useRef<(SVGCircleElement | null)[]>([]);
  const strike = useRef({ x: 0, y: 0, at: -Infinity, hit: false });
  const signature = useRef("");
  const [message, setMessage] = useState("");
  const [, render] = useReducer(n => n + 1, 0);
  const latest = useRef({ suspended, onComplete, turn, roster, motion: settings.motion });
  latest.current = { suspended, onComplete, turn, roster, motion: settings.motion };
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
    let bounds = { width: 0, height: 0 };
    const measure = () => {
      const rect = board.current?.getBoundingClientRect();
      if (rect) bounds = { width: rect.width, height: rect.height };
    };
    const observer = new ResizeObserver(measure);
    if (board.current) observer.observe(board.current);
    measure();
    let frame = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (document.hidden) { frame = requestAnimationFrame(tick); return; }
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
        const age = round.current.elapsed - hole.appeared;
        const left = hole.expires - round.current.elapsed;
        const rise = Math.min(1, Math.max(0, age / .18), Math.max(0, left / .2));
        const eased = 1 - (1 - rise) ** 3;
        // A little settling compression gives the pop-up a soft toy weight.
        const settle = latest.current.motion ? 0 : Math.sin(Math.min(1, age / .32) * Math.PI) * .07;
        animals.current[i]?.setAttribute("transform", `translate(0 ${latest.current.motion ? 0 : (1 - eased) * 110}) translate(0 39) scale(${1 + settle} ${1 - settle}) translate(0 -39)`);
        const remaining = hole.kind ? Math.max(0, (hole.expires - round.current.elapsed) / (hole.expires - hole.appeared)) : 0;
        lifetimes.current[i]?.setAttribute("stroke-dashoffset", String(100 * (1 - remaining)));
        lifetimes.current[i]?.setAttribute("opacity", remaining ? "0.8" : "0");
      }
      const impactAge = (now - strike.current.at) / 380;
      if (impact.current) {
        const visible = !latest.current.motion && impactAge >= 0 && impactAge < 1 && strike.current.hit;
        impact.current.setAttribute("opacity", visible ? String((1 - impactAge) ** 2) : "0");
        impact.current.setAttribute("transform", `translate(${strike.current.x} ${strike.current.y}) scale(${.5 + Math.max(0, Math.min(1, impactAge)) * 1.4})`);
      }
      const hitAge = (now - strike.current.at) / 240;
      hammer.current?.setAttribute("opacity", hitAge >= 0 && hitAge < 1 ? String(1 - hitAge ** 3) : "0");
      hammer.current?.setAttribute("transform", `translate(${strike.current.x} ${strike.current.y}) rotate(${Math.max(-35, 15 - hitAge * 50)})`);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
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
          const hit = whack(round.current, shownCursor.current.x, shownCursor.current.y);
          strike.current = { ...shownCursor.current, at: performance.now(), hit: !!hit?.mole };
          if (hit) {
            room.buzz(hit.mole ? 25 : 100);
            chime(settings.sound, hit.mole);
            setMessage(hit.mole ? "+10 points" : "Not a mole. −15");
          } else setMessage("Missed.");
          render();
        }
      }
    };
    return () => { room.handler.current = null; };
  }, [phase, turn, roster, suspended, settings.sound, room.publish, room.handler, room.buzz]);

  if (phase === "handoff") return <TurnHandoff name={roster[turn + 1]} detail={`${roster[turn]} scored ${round.current.score}`} />;
  if (phase === "finished") return <div className="round-finished">
    <h2 tabIndex={-1}>{resultTitle(scores.map((score, i) => ({ score, name: roster[i] })))}</h2>
    <FinishScores players={scores.map((score, i) => ({ name: roster[i], score, shown: <>{score}<PointsStar /></> }))} />
    <FinishActions onRestart={() => { setTurn(0); setScores([]); reset(); }} onExit={onExit} />
  </div>;
  return <div className={`moles-game${phase !== "playing" ? " moles-paused" : ""}${settings.motion ? " moles-reduced" : ""}`}>
    <Hud slot="start"><strong className="hud-score moles-score" aria-label={`${round.current.score} points`}><span>{round.current.score}</span><PointsStar /></strong></Hud>
    <Hud slot="end"><div className={`fruit-timer moles-timer${seconds <= 10 ? " is-urgent" : ""}`} aria-label={`${seconds} seconds remaining`}><Timer aria-hidden="true" /><strong>0:{String(seconds).padStart(2, "0")}</strong></div></Hud>
    <div className="moles-garden">
      <svg ref={board} className="moles-board" viewBox="0 0 900 600" role="img" aria-label="Nine garden holes. Point at a mole and tap. Avoid rabbits and foxes.">
        <defs>
          <linearGradient id="mallet-head" x2="0" y2="1"><stop stopColor="#fff0b4" /><stop offset=".55" stopColor="#ffda78" /><stop offset="1" stopColor="#e9b84e" /></linearGradient>
          <linearGradient id="mole-fur" x1="0" y1="0" x2=".7" y2="1"><stop stopColor="#dfb999" /><stop offset=".6" stopColor="#b8896b" /><stop offset="1" stopColor="#91654e" /></linearGradient>
          <linearGradient id="rabbit-fur" x1="0" y1="0" x2=".7" y2="1"><stop stopColor="#ffffff" /><stop offset=".7" stopColor="#fff4e5" /><stop offset="1" stopColor="#dccab8" /></linearGradient>
          <linearGradient id="fox-fur" x1="0" y1="0" x2=".7" y2="1"><stop stopColor="#ffdc9b" /><stop offset=".65" stopColor="#f5a45c" /><stop offset="1" stopColor="#d77c43" /></linearGradient>
          <linearGradient id="garden-grass" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="600"><stop stopColor="#f0f7e9" /><stop offset="1" stopColor="#d5e9d8" /></linearGradient>
          <radialGradient id="hole-depth" cx="50%" cy="25%" r="75%"><stop stopColor="#3c554c" /><stop offset=".5" stopColor="#627768" /><stop offset="1" stopColor="#a5ac8e" /></radialGradient>
          <linearGradient id="hole-rim" x2="0" y2="1"><stop stopColor="#fff7dc" /><stop offset=".5" stopColor="#ecdfc3" /><stop offset="1" stopColor="#c7bba3" /></linearGradient>
          <radialGradient id="garden-shadow"><stop stopColor="#53775e" stopOpacity=".2" /><stop offset="1" stopColor="#53775e" stopOpacity="0" /></radialGradient>
          {HOLES.map((h, i) => <clipPath id={`mole-hole-${i}`} key={i}><path d={`M${h.x-85} ${h.y-155}h170v155q-85 45-170 0Z`} /></clipPath>)}</defs>
        <rect x="-2000" y="-2000" width="4900" height="4600" fill="url(#garden-grass)" />
        <path d="M-2000-2000H2900V80H900Q680 135 450 85T0 100H-2000Z" fill="#c8e2cc" />
        <path d="M-2000 550H0Q280 505 470 550T900 535H2900V2600H-2000Z" fill="#bfdcc6" />
        {[80, 330, 575, 825].map((x, i) => <g key={x} transform={`translate(${x} ${i % 2 ? 560 : 105})`}>
          <path d="M-10 8-15-5M0 10V-12M10 8 15-4" stroke="#81a561" strokeWidth="4" strokeLinecap="round" />
          <circle cy="-18" r="9" fill="#fff8e6" /><circle cy="-18" r="4" fill="#edbd53" />
        </g>)}
        {HOLES.map((h, i) => {
          const hole = round.current.holes[i];
          return <g key={i} data-hole={i} data-animal={hole.kind}>
            <ellipse cx={h.x} cy={h.y+12} rx="96" ry="38" fill="url(#garden-shadow)" />
            <ellipse cx={h.x} cy={h.y} rx="79" ry="28" fill="url(#hole-rim)" />
            <ellipse cx={h.x} cy={h.y-2} rx="66" ry="21" fill="url(#hole-depth)" />
            <circle ref={el => { lifetimes.current[i] = el; }} cx={h.x} cy={h.y} r="82" fill="none" stroke="#3a8f78" strokeWidth="3" pathLength="100" strokeDasharray="100" opacity="0" transform={`translate(0 ${h.y * .7}) scale(1 .3)`} />
            <g clipPath={`url(#mole-hole-${i})`}>
              {hole.kind && <g transform={`translate(${h.x} ${h.y-40})`}><g key={hole.id} ref={el => { animals.current[i] = el; }} className="moles-animal" transform={`translate(0 ${settings.motion ? 0 : 110})`}><Animal kind={hole.kind} /></g></g>}
            </g>
            <path d={`M${h.x-76} ${h.y+9}q76 43 152 0`} fill="none" stroke="#f3e4c7" strokeWidth="5" strokeLinecap="round" />
            {hole.feedbackUntil > round.current.elapsed && <text key={`feedback-${hole.id}`} className={`moles-feedback${hole.feedback.startsWith('Oops') ? ' is-wrong' : ''}`} x={h.x} y={h.y-80} textAnchor="middle">{hole.feedback}</text>}
          </g>;
        })}
        {phase === "playing" && <g ref={reticle} className="moles-reticle" transform={`translate(${shownCursor.current.x} ${shownCursor.current.y})`}>
          <circle r="20" fill="#ffffff55" stroke="#fff" strokeWidth="5" />
          <circle r="20" fill="none" stroke="#456d56" strokeWidth="2" />

          <circle r="3" fill="#493b34" />
        </g>}
        {phase === "playing" && <g ref={impact} opacity="0" fill="none" stroke="#fffdf5" strokeWidth="4" strokeLinecap="round" pointerEvents="none">
          <circle r="25" />
          <path d="M0-40v-10M0 40v10M40 0h10M-40 0h-10M28-28l7-7M-28 28l-7 7M28 28l7 7M-28-28l-7-7" />
        </g>}
        {phase === "playing" && <g ref={hammer} className="moles-hammer" opacity="0" pointerEvents="none">
          <g transform="translate(-4 7)">
          <path d="M6-18 35 26" stroke="#493b34" strokeWidth="14" strokeLinecap="round" />
          <path d="M6-18 35 26" stroke="#d9b08a" strokeWidth="9" strokeLinecap="round" />
          <rect x="-28" y="-42" width="64" height="35" rx="12" fill="url(#mallet-head)" stroke="#b48c43" strokeWidth="1.5" />
          <path d="M-17-34h38" stroke="#fff8e7" strokeWidth="4" strokeLinecap="round" />
          </g>
          <path d="M-9 8-17 17M0 12v12M9 8l8 9" stroke="#fff8e7" strokeWidth="5" strokeLinecap="round" />
        </g>}
      </svg>
      {(phase === "ready" || phase === "paused") && <div className="court-overlay">
        <ReadyTitle player={roster.length > 1 ? roster[turn] : undefined} paused={phase === "paused"} />
        <ReadyInstruction game="moles" paused={phase === "paused"} />
      </div>}
    </div>
    <p className="sr-only" role="status">{message}</p>
  </div>;
}
