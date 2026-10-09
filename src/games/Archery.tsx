import { meadow, staticArt, toyFinish } from "./art";
import { useCallback, useEffect, useRef, useState } from "react";
import { chime, type Settings } from "../lib/store";
import type { useRoom } from "../lib/room";
import ResultPanel, { FinishActions, FinishScores, resultTitle } from "../components/ResultPanel";
import TurnHandoff from "../components/TurnHandoff";
import PointsStar from "../components/PointsStar";
import { Hud } from "../components/GameHud";
import { followAmount } from "../lib/game-physics.mjs";
import { Wind as WindIcon } from "lucide-react";
import { drawTargetFace, AIM_ZOOM_MS, aimCamera, drawAimTimer, drawArrow, drawBow, drawShotSparkles, drawRange, shotCamera, SHOT_FLIGHT_MS, SHOT_HOLD_MS, SHOT_END_MS } from "./archery-animation";
import "./archery.css";
type Shot = { x: number; y: number; score: number };
type ShotAnimation = { shot: Shot; elapsed: number; reduced: boolean; landed: boolean; index: number; startZoom: number };
type Wind = { speed: number; angle: number };
// Positions are in target radii from the center. Each of the ten scoring
// rings is a tenth of the radius wide: 10 points inside the first, 1 in the
// last, nothing outside.
const RING = 0.1;
// Each arrow gets its own wind, in a random direction, stronger as the round
// goes on: barely a breath for the first, medium for the next two, hard for the
// last two (mph).
const WIND = [[0.1, 0.1], [2, 4], [2, 4], [5, 8], [5, 8]];
// Later arrows fly farther, so the same wind carries them farther: on release
// the arrow lands mph × distance × one ring width downwind of the sight.
const DISTANCE = [0.75, 0.875, 1, 1.125, 1.25];
// Once fully zoomed in, the player has four seconds to release the arrow.
const FORCE_RELEASE_MS = 4000;
const rollWind = (arrow = 0): Wind => {
  const [low, high] = WIND[arrow];
  return {
    speed: Math.round((low + Math.random() * (high - low)) * 10) / 10,
    angle: Math.random() * Math.PI * 2,
  };
};
// How far gusts push the sight around while aiming, in target radii.
const gust = (wind: Wind, t: number) => {
  const amount = 0.035 + wind.speed * 0.012;
  // Mostly along the wind, a little across it, never quite repeating.
  const along =
    (Math.sin(t * 1.3) * 0.6 + Math.sin(t * 2.9 + 1) * 0.4 + 0.3) * amount;
  const across = (Math.sin(t * 1.7 + 2) * 0.5 + Math.sin(t * 3.7) * 0.3) * amount;
  const c = Math.cos(wind.angle),
    s = Math.sin(wind.angle);
  return { x: along * c - across * s, y: along * s + across * c };
};
export default function Archery({
  roster,
  settings,
  suspended = false,
  room,
  onComplete,
  onExit,
}: {
  roster: string[];
  settings: Settings;
  suspended?: boolean;
  room: ReturnType<typeof useRoom>;
  onComplete: (score: number, name: string) => void;
  onExit: () => void;
}) {
  const paused = useRef(suspended);
  paused.current = suspended;
  const canvas = useRef<HTMLCanvasElement>(null);
  const windBadge = useRef<HTMLDivElement>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [finished, setFinished] = useState(false);
  const [turn, setTurn] = useState(0);
  const [handoff, setHandoff] = useState(false);
  const [scores, setScores] = useState<number[]>([]);
  const [shooting, setShooting] = useState(false);
  const [feedback, setFeedback] = useState<Shot | null>(null);
  const [wind, setWind] = useState(() => rollWind(0));
  const live = useRef({
    aim: { x: 0, y: 0 },
    smoothAim: { x: 0, y: 0 },
    shots,
    wind,
    motion: settings.motion,
    shooting: false,
    point: { x: 0, y: 0 },
    pressedAt: null as number | null,
    aimTimerAt: null as number | null,
    focusMs: 0,
    animation: null as ShotAnimation | null,
    impact: (_shot: Shot) => {},
    completeShot: () => {},
    shoot: () => {},
  });
  live.current.shots = shots;
  live.current.motion = settings.motion;
  live.current.impact = (shot) => {
    const next = [...live.current.shots, shot];
    live.current.shots = next;
    setShots(next);
    setFeedback(shot);
    chime(settings.sound, shot.score === 10);
    if (shot.score >= 9) room.buzz(shot.score === 10 ? 150 : 60);
  };
  live.current.completeShot = () => {
    live.current.animation = null;
    live.current.shooting = false;
    live.current.pressedAt = null;
    live.current.focusMs = 0;
    setShooting(false);
    setFeedback(null);
    if (live.current.shots.length === 5) {
      const total = live.current.shots.reduce((sum, s) => sum + s.score, 0);
      setScores(old => [...old, total]);
      onComplete(total, roster[turn]);
      if (turn + 1 < roster.length) setHandoff(true);
      else setFinished(true);
    } else {
      live.current.wind = rollWind(live.current.shots.length);
      setWind(live.current.wind);
    }
  };
  const shoot = useCallback(() => {
    const pressedAt = live.current.pressedAt;
    live.current.pressedAt = null;
    if (
      paused.current ||
      document.hidden ||
      pressedAt === null ||
      live.current.shooting ||
      live.current.shots.length >= 5
    )
      return;
    live.current.shooting = true;
    setShooting(true);
    // The wind carries the arrow downwind of where the sight was.
    const { speed, angle } = live.current.wind;
    const carry = speed * DISTANCE[live.current.shots.length] * RING;
    const point = {
      x: live.current.point.x + Math.cos(angle) * carry,
      y: live.current.point.y + Math.sin(angle) * carry,
    };
    const distance = Math.hypot(point.x, point.y);
    const score = Math.max(0, 10 - Math.floor(distance / RING));
    live.current.animation = {
      shot: { ...point, score }, elapsed: 0, reduced: live.current.motion,
      landed: false, index: live.current.shots.length,
      startZoom: aimCamera(live.current.focusMs),
    };
  }, []);
  live.current.shoot = shoot;
  useEffect(() => {
    room.publish(
      "target",
      !finished && !shooting,
      finished
        ? "Game complete"
        : handoff
          ? "Next player"
        : shooting
          ? feedback ? `Arrow ${shots.length}: ${feedback.score} points` : `Arrow ${shots.length + 1} in flight`
          : `Arrow ${Math.min(shots.length + 1, 5)} of 5`,
      handoff ? roster[turn + 1] : null,
      handoff ? roster[turn + 1] : roster[turn],
    );
    room.handler.current = (e) => {
      if (paused.current || !Number.isFinite(e.value)) return;
      if (handoff) {
        if (e.action === "next") {
          resetRound();
          setTurn(turn + 1);
          setHandoff(false);
        }
        return;
      }
      if (finished) return;
      if (e.action === "aim" || e.action === "move") {
        const axis = e.action === "aim" ? "x" : "y";
        const value = Math.max(-1, Math.min(1, e.value));
        live.current.aim[axis] = value;
      }
      // Pressing the phone's button raises the bow; letting go fires.
      if (e.action === "draw") {
        if (e.value <= 0) live.current.pressedAt = null;
        else if (!paused.current && !document.hidden && !live.current.shooting && live.current.shots.length < 5) {
          // Duplicate presses must not restart the countdown.
          if (live.current.pressedAt === null) {
            live.current.pressedAt = performance.now();
            live.current.aimTimerAt = null;
          }
        }
      }
      if (e.action === "shoot") shoot();
    };
    return () => {
      room.handler.current = null;
    };
  }, [room.publish, room.handler, finished, handoff, turn, roster, shooting, shots.length, shoot, feedback]);
  useEffect(() => {
    if (!canvas.current) return;
    const node: HTMLCanvasElement = canvas.current;
    const ctx = node.getContext("2d")!;
    let raf = 0;
    let lastFrame = performance.now();
    const scenery = staticArt();
    const targetArt = staticArt();
    const cancelHiddenDraw = () => {
      if (document.hidden) live.current.pressedAt = null;
    };
    document.addEventListener("visibilitychange", cancelHiddenDraw);
    const observer = new ResizeObserver(() => {
      const dpr = Math.min(devicePixelRatio, 2);
      node.width = node.clientWidth * dpr;
      node.height = node.clientHeight * dpr;
    });
    observer.observe(node);
    function render(now: number) {
      raf = requestAnimationFrame(render);
      const delta = Math.min(now - lastFrame, 64);
      lastFrame = now;
      const m = live.current;
      if (paused.current || document.hidden) {
        m.pressedAt = null;
        m.aimTimerAt = null;
        return;
      }
      // Aim remains live throughout the zoom and hold. Auto-release uses this
      // frame's sight position, just like a manual release from the controller.
      const push = gust(m.wind, now / 1000);
      const calm = m.motion ? 0.5 : 1;
      // The same response as the other games' pointers.
      const follow = followAmount(delta / 1000);
      m.smoothAim.x += (m.aim.x - m.smoothAim.x) * follow;
      m.smoothAim.y += (m.aim.y - m.smoothAim.y) * follow;
      const point = {
        x: m.smoothAim.x + push.x * calm,
        y: m.smoothAim.y + push.y * calm,
      };
      m.point = point;
      if (!m.animation) {
        m.focusMs = Math.max(0, Math.min(AIM_ZOOM_MS, m.focusMs + (m.pressedAt !== null ? delta : -delta)));
      }
      if (m.pressedAt === null) m.aimTimerAt = null;
      else if (m.aimTimerAt === null && (m.motion || m.focusMs >= AIM_ZOOM_MS)) {
        // Start from the completed zoom frame, not from the initial press.
        // Reduced motion already shows the close view, so it can start now.
        m.aimTimerAt = now;
      }
      const aimingMs = m.aimTimerAt === null ? 0 : now - m.aimTimerAt;
      if (m.pressedAt !== null && aimingMs >= FORCE_RELEASE_MS) m.shoot();
      const animation = m.animation;
      if (animation) {
        animation.elapsed += delta;
        if (!animation.landed && (animation.reduced || animation.elapsed >= SHOT_FLIGHT_MS)) {
          animation.landed = true;
          m.impact(animation.shot);
        }
        const end = animation.reduced ? 1200 : animation.index === 4 ? SHOT_HOLD_MS : SHOT_END_MS;
        if (animation.elapsed >= end) m.completeShot();
      }
      const w = node.width,
        h = node.height;
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      scenery(ctx, w, h, 1, art => meadow(art, w, h));
      const active = m.animation;
      const zoom = m.motion ? 0 : active ? shotCamera(active.elapsed, active.startZoom) : aimCamera(m.focusMs);
      const arrowIndex = active?.index ?? Math.min(m.shots.length, 4);
      const rangeScale = (index: number) => 1 - index * 0.045;
      const returning = active && !active.reduced && active.elapsed > SHOT_HOLD_MS;
      const range = returning
        ? rangeScale(arrowIndex) + (rangeScale(Math.min(arrowIndex + 1, 4)) - rangeScale(arrowIndex)) * (1 - zoom)
        : rangeScale(arrowIndex);
      // Start with a small target downrange, then frame the face tightly while
      // aiming. Leave only a sliver below its rim for the tops of the legs,
      // and room above it for the wind.
      const farRadius = Math.min(w * 0.144, h * 0.168) * range;
      const closeRadius = Math.min(w * 0.46, h * 0.4);
      const closeY = h - closeRadius * 1.1;
      const radius = m.motion ? closeRadius : farRadius + (closeRadius - farRadius) * zoom,
        cx = w / 2,
        cy = m.motion ? closeY : h * 0.46 + (closeY - h * 0.46) * zoom;
      drawRange(ctx, w, h, cx, cy, radius, zoom);
      // A soft ground shadow and rounded wooden rim anchor the toy target.
      ctx.save();
      ctx.fillStyle = "#5b704b20";
      ctx.beginPath(); ctx.ellipse(cx, cy + radius * 1.42, radius * .85, radius * .12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // The wind rides the zoom: it grows and settles just above the target's
      // rim, big enough to read while aiming.
      const badge = windBadge.current;
      if (badge) {
        const scale = w / node.clientWidth;
        const rim = (cy - radius - radius / 5 * 0.16) / scale + node.offsetTop;
        // Runs a little ahead of the zoom, landing as it finishes.
        const settle = m.motion ? 1 : 1 - (1 - zoom) ** 1.5;
        const gap = 12;
        const grow = Math.max(1, Math.min(1.8, (rim - gap * 2) / badge.offsetHeight));
        const size = 1 + (grow - 1) * settle;
        const top = rim - gap - badge.offsetHeight * size;
        badge.style.scale = String(size);
        badge.style.translate = `-50% ${Math.max(0, top - badge.offsetTop) * settle}px`;
      }
      ctx.strokeStyle = "#a87553";
      ctx.lineWidth = radius * .09;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - radius * .3, cy + radius * .6);
      ctx.lineTo(cx - radius * .55, cy + radius * 1.4);
      ctx.moveTo(cx + radius * .3, cy + radius * .6);
      ctx.lineTo(cx + radius * .55, cy + radius * 1.4);
      ctx.stroke();
      ctx.save();
      const targetScale = radius / 256;
      ctx.translate(cx - 330 * targetScale, cy - 330 * targetScale);
      ctx.scale(targetScale, targetScale);
      targetArt(ctx, 660, 660, Math.min(4, Math.max(1, Math.ceil(closeRadius / 256))), art => drawTargetFace(art, 330, 330, 256));
      ctx.restore();
      live.current.shots.forEach((s) => {
        const x = cx + s.x * radius,
          y = cy + s.y * radius;
        // A soft suction tip and two little fletchings make landed shots legible.
        ctx.save(); ctx.translate(x, y);
        ctx.fillStyle = "#29465a25";
        ctx.beginPath(); ctx.ellipse(radius * .025, radius * .017, radius * .052, radius * .022, -.6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#fff7df"; ctx.lineWidth = radius * .012; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(radius * .075, -radius * .15); ctx.stroke();
        ctx.strokeStyle = "#527e8c"; ctx.lineWidth = radius * .004; ctx.stroke();
        ctx.fillStyle = "#ef8a7c";
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(radius * .05, -radius * .1);
          ctx.lineTo(radius * (.065 + side * .027), -radius * (.125 - side * .012));
          ctx.lineTo(radius * .077, -radius * .158); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = "#e4f3e2"; ctx.strokeStyle = "#4e857a"; ctx.lineWidth = radius * .005;
        ctx.beginPath(); ctx.ellipse(0, 0, radius * .021, radius * .014, -.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
      });
      if (active && !active.reduced) {
        const x = cx + active.shot.x * radius;
        const y = cy + active.shot.y * radius;
        if (!active.landed) {
          const t = Math.min(active.elapsed / SHOT_FLIGHT_MS, 1);
          const startY = h * 1.06;
          const arrowX = cx + (x - cx) * t;
          const arrowY = startY + (y - startY) * t - Math.sin(t * Math.PI) * h * 0.08;
          drawArrow(ctx, arrowX, arrowY, radius * (0.48 - t * 0.32), Math.atan2(y - startY, x - cx));
        } else if (active.shot.score > 0) {
          drawShotSparkles(ctx, x, y, radius, active.elapsed - SHOT_FLIGHT_MS);
        }
      }
      if (m.shots.length < 5 && !m.shooting) {
        const x = cx + point.x * radius,
          y = cy + point.y * radius;
        const pixelScale = node.width / node.clientWidth;
        if (m.pressedAt !== null) drawAimTimer(ctx, x, y, aimingMs / FORCE_RELEASE_MS, pixelScale);
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(pixelScale, pixelScale);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "#203950";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.moveTo(-20, 0);
        ctx.lineTo(-7, 0);
        ctx.moveTo(7, 0);
        ctx.lineTo(20, 0);
        ctx.moveTo(0, -20);
        ctx.lineTo(0, -7);
        ctx.moveTo(0, 7);
        ctx.lineTo(0, 20);
        ctx.stroke();
        ctx.restore();
      }
      if (!m.shooting && m.shots.length < 5) {
        drawBow(ctx, w, h, m.motion ? 1 : m.focusMs / AIM_ZOOM_MS, m.pressedAt !== null);
      }
    }
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", cancelHiddenDraw);
    };
  }, [finished, handoff, turn]);
  function resetRound() {
    setShots([]);
    live.current.shots = [];
    live.current.shooting = false;
    live.current.animation = null;
    live.current.pressedAt = null;
    live.current.aimTimerAt = null;
    live.current.focusMs = 0;
    live.current.wind = rollWind(0);
    setWind(live.current.wind);
    setShooting(false);
    setFeedback(null);
    setFinished(false);
    live.current.aim = { x: 0, y: 0 };
    live.current.smoothAim = { x: 0, y: 0 };
    live.current.point = { x: 0, y: 0 };
  }
  const restart = () => {
    setTurn(0);
    setScores([]);
    setHandoff(false);
    resetRound();
  };
  if (handoff) return <TurnHandoff name={roster[turn + 1]} detail={`${roster[turn]} scored ${scores[turn]}`} />;
  if (finished && roster.length > 1) return (
    <div className="round-finished">
      <h2 tabIndex={-1}>{resultTitle(scores.map((score, i) => ({ name: roster[i], score })))}</h2>
      <FinishScores players={scores.map((score, i) => ({ name: roster[i], score, shown: <>{score}<PointsStar /></> }))} />
      <FinishActions onRestart={restart} onExit={onExit} />
    </div>
  );
  if (finished)
    return (
      <ResultPanel
        title={resultTitle([
          { name: roster[0], score: shots.reduce((n, s) => n + s.score, 0) },
        ])}
        score={shots.reduce((n, s) => n + s.score, 0)}
        max={50}
        onRestart={restart}
        onExit={onExit}
      />
    );
  const total = shots.reduce((n, s) => n + s.score, 0);
  return (
    <div className="archery-game">
      <Hud slot="start">
        <strong className="hud-score archery-hud-score" aria-label={`${total} of 50 points`}>
          <span>{total}</span>
          <PointsStar />
        </strong>
      </Hud>
      <Hud slot="end">
        <div
          className="hud-arrows"
          role="img"
          aria-label={
            (shots.length < 5
              ? `Arrow ${shots.length + 1} of 5`
              : "All arrows shot") +
            (shots.length ? `. Scores: ${shots.map((s) => s.score).join(", ")}` : "")
          }
        >
          {Array.from({ length: 5 }, (_, i) => (
            <ArrowIcon key={i} spent={i < shots.length} />
          ))}
        </div>
      </Hud>
      <div className="target-wrap">
        <canvas
          ref={canvas}
          role="img"
          aria-label="Archery target. Hold to zoom and aim, release to fire. Once fully zoomed in, the ring fills in four seconds, then the arrow fires automatically. Gold center scores 10."
        />
        {!shooting && shots.length < 5 && (
          <div
            ref={windBadge}
            className="wind-badge"
            role="status"
            aria-label={`Wind ${wind.speed} miles per hour`}
          >
            <WindIcon aria-hidden="true" />
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              style={{ rotate: `${wind.angle}rad` }}
            >
              <path d="M3 12h15m-5-5 5 5-5 5" />
            </svg>
            <strong>{wind.speed.toFixed(1)}</strong>
            <span>mph</span>
          </div>
        )}
        <div className="archery-shot-status" role="status" aria-live="polite" aria-atomic="true">
          {feedback && (
            <div className="archery-shot-result">
              <strong>{feedback.score > 0 ? <>+{feedback.score}<PointsStar /></> : "So close!"}</strong>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** One arrow in the quiver; arrows already shot fade out. */
function ArrowIcon({ spent }: { spent: boolean }) {
  return (
    <svg className={`arrow-icon ${spent ? "spent" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <polygon points="8.54,15.46 9.1,19.71 6.27,22.54 5,19" fill="#f27e73" stroke="#f27e73" strokeWidth="0.8" strokeLinejoin="round" />
      <polygon points="8.54,15.46 4.29,14.9 1.46,17.73 5,19" fill="#f27e73" stroke="#f27e73" strokeWidth="0.8" strokeLinejoin="round" />
      <line x1="5" y1="19" x2="17.5" y2="6.5" stroke="#b07a45" strokeWidth="2" strokeLinecap="round" />
      <polygon points="21,3 14.2,5.4 18.6,9.8" fill="#6f8293" stroke="#6f8293" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
