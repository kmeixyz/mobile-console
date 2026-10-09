import { useCallback, useEffect, useRef, useState } from "react";
import { chime, type Settings } from "../lib/store";
import type { useRoom } from "../lib/room";
import ResultPanel, { resultTitle } from "../components/ResultPanel";
type Shot = { x: number; y: number; score: number };
export default function Archery({
  settings,
  suspended = false,
  room,
  onComplete,
  onExit,
}: {
  settings: Settings;
  suspended?: boolean;
  room: ReturnType<typeof useRoom>;
  onComplete: (score: number) => void;
  onExit: () => void;
}) {
  const paused = useRef(suspended);
  paused.current = suspended;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [aim, setAim] = useState({ x: 0, y: 0 });
  const [shots, setShots] = useState<Shot[]>([]);
  const [finished, setFinished] = useState(false);
  const [shooting, setShooting] = useState(false);
  const live = useRef({
    aim,
    shots,
    motion: settings.motion,
    shooting: false,
    point: { x: 0, y: 0 },
  });
  live.current.aim = aim;
  live.current.shots = shots;
  live.current.motion = settings.motion;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shoot = useCallback(() => {
    if (
      paused.current ||
      live.current.shooting ||
      live.current.shots.length >= 5
    )
      return;
    live.current.shooting = true;
    setShooting(true);
    const point = live.current.point;
    const distance = Math.hypot(point.x, point.y);
    const score = Math.max(0, 10 - Math.floor(distance * 10));
    const next = [...live.current.shots, { ...point, score }];
    live.current.shots = next;
    setShots(next);
    chime(settings.sound, score === 10);
    let remaining = settings.motion ? 250 : 750;
    timer.current = setInterval(() => {
      if (paused.current || document.hidden) return;
      remaining -= 50;
      if (remaining > 0) return;
      if (timer.current) clearInterval(timer.current);
      live.current.shooting = false;
      setShooting(false);
      if (next.length === 5) {
        onComplete(next.reduce((sum, s) => sum + s.score, 0));
        setFinished(true);
      }
    }, 50);
  }, [settings.sound, settings.motion, onComplete]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    room.publish(
      "target",
      !finished && !shooting,
      finished
        ? "Game complete"
        : `Arrow ${Math.min(shots.length + 1, 5)} of 5`,
      null,
      settings.name || null,
    );
    room.handler.current = (e) => {
      if (e.action === "aim") setAim((old) => ({ ...old, x: e.value }));
      if (e.action === "move") setAim((old) => ({ ...old, y: e.value }));
      if (e.action === "shoot" || e.action === "throw") shoot();
    };
    return () => {
      room.handler.current = null;
    };
  }, [room.publish, room.handler, finished, shooting, shots.length, shoot]);
  useEffect(() => {
    if (!canvas.current) return;
    const node: HTMLCanvasElement = canvas.current;
    const ctx = node.getContext("2d")!;
    let raf = 0;
    const observer = new ResizeObserver(() => {
      const dpr = Math.min(devicePixelRatio, 2);
      node.width = node.clientWidth * dpr;
      node.height = node.clientHeight * dpr;
    });
    observer.observe(node);
    function render(now: number) {
      raf = requestAnimationFrame(render);
      const w = node.width,
        h = node.height;
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#e8f0f6";
      ctx.fillRect(0, 0, w, h);
      const radius = Math.min(w * 0.34, h * 0.39),
        cx = w / 2,
        cy = h * 0.47;
      const unit = radius / 5;
      ctx.save();
      ctx.shadowColor = "#32547226";
      ctx.shadowBlur = radius * 0.18;
      ctx.shadowOffsetY = radius * 0.07;
      ctx.fillStyle = "#faf9f3";
      ctx.beginPath();
      ctx.arc(cx, cy, radius + unit * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      const colors = ["#477aa4", "#f6f6f0", "#e37960", "#f5c55b", "#f3b947"];
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius - unit * i, 0, Math.PI * 2);
        ctx.fillStyle = colors[i];
        ctx.fill();
        ctx.strokeStyle = i === 1 ? "#deded5" : "#ffffff2e";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.strokeStyle = "#b17a30";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, unit * 0.45, 0, Math.PI * 2);
      ctx.stroke();
      live.current.shots.forEach((s) => {
        const x = cx + s.x * radius,
          y = cy + s.y * radius;
        ctx.strokeStyle = "#27394b";
        ctx.lineWidth = radius * 0.011;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + radius * 0.07, y - radius * 0.13);
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#27394b";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.017, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      const m = live.current;
      const sway = m.motion ? 0 : 0.08;
      const point = {
        x: m.aim.x + Math.sin(now / 640) * sway,
        y: m.aim.y + Math.cos(now / 850) * sway,
      };
      m.point = point;
      if (m.shots.length < 5) {
        const x = cx + point.x * radius,
          y = cy + point.y * radius;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "#203950";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.moveTo(x - 20, y);
        ctx.lineTo(x - 7, y);
        ctx.moveTo(x + 7, y);
        ctx.lineTo(x + 20, y);
        ctx.moveTo(x, y - 20);
        ctx.lineTo(x, y - 7);
        ctx.moveTo(x, y + 7);
        ctx.lineTo(x, y + 20);
        ctx.stroke();
      }
      ctx.fillStyle = "#41617b";
      ctx.font = `500 ${Math.max(14, w * 0.022)}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("Breathe. Aim. Release.", cx, h * 0.94);
    }
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [finished]);
  const restart = () => {
    setShots([]);
    live.current.shots = [];
    live.current.shooting = false;
    setShooting(false);
    setFinished(false);
    setAim({ x: 0, y: 0 });
  };
  if (finished)
    return (
      <ResultPanel
        title={resultTitle([
          { name: settings.name, score: shots.reduce((n, s) => n + s.score, 0) },
        ])}
        score={shots.reduce((n, s) => n + s.score, 0)}
        max={50}
        onRestart={restart}
        onExit={onExit}
      />
    );
  return (
    <div className="archery-game">
      <div className="archery-score">
        <div>
          <span>{settings.name || "You"}</span>
          <strong>
            {shots.reduce((n, s) => n + s.score, 0)}
            <small> / 50</small>
          </strong>
        </div>
        <p className="arrow-progress">
          {shots.length < 5 ? `Arrow ${shots.length + 1} of 5` : "All arrows shot"}
          {shots.length > 0 && (
            <span> · {shots.map((s) => s.score).join(", ")}</span>
          )}
        </p>
      </div>
      <div className="target-wrap">
        <canvas
          ref={canvas}
          role="img"
          aria-label="Archery target. Gold center scores 10."
        />
      </div>
    </div>
  );
}
