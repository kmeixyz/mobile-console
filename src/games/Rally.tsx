import { useCallback, useEffect, useRef, useState } from "react";
import { chime, type Settings } from "../lib/store";
import type { useRoom } from "../lib/room";
import ResultPanel from "../components/ResultPanel";
export default function Rally({
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
  const canvas = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<
    "ready" | "playing" | "paused" | "finished"
  >("ready");
  const [score, setScore] = useState([0, 0]);
  const model = useRef({
    x: 500,
    y: 350,
    vx: 110,
    vy: 230,
    player: 500,
    opponent: 500,
    scores: [0, 0],
    phase: "ready",
    serveUntil: 0,
  });
  const refs = useRef({ settings, onComplete });
  refs.current = { settings, onComplete };
  useEffect(() => {
    if (suspended && model.current.phase === "playing") {
      model.current.phase = "paused";
      setPhase("paused");
    }
  }, [suspended]);
  const move = useCallback((n: number) => {
    const val = Math.max(-1, Math.min(1, n));
    model.current.player = 500 + val * 340;
  }, []);
  const toggle = useCallback(() => {
    setPhase((old) => {
      const next = old === "playing" ? "paused" : "playing";
      model.current.phase = next;
      return next;
    });
  }, []);
  const restart = () => {
    model.current = {
      x: 500,
      y: 350,
      vx: 110,
      vy: 230,
      player: 500,
      opponent: 500,
      scores: [0, 0],
      phase: "ready",
      serveUntil: 0,
    };
    setScore([0, 0]);
    setPhase("ready");
  };
  useEffect(() => {
    room.publish(
      "rally",
      phase !== "finished",
      phase === "finished"
        ? "Game complete"
        : phase === "playing"
          ? "Keep the ball in play"
          : phase === "paused"
            ? "Paused"
            : "Ready to rally",
      null,
      settings.name || null,
    );
    room.handler.current = (e) => {
      if (e.action === "move" || e.action === "aim") move(e.value);
      if (e.action === "throw" && model.current.phase !== "finished") toggle();
    };
    return () => {
      room.handler.current = null;
    };
  }, [room.publish, room.handler, phase, move, toggle]);
  useEffect(() => {
    const blur = () => {
      if (model.current.phase === "playing") {
        model.current.phase = "paused";
        setPhase("paused");
      }
    };
    window.addEventListener("blur", blur);
    const visibility = () => {
      if (document.hidden) blur();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!canvas.current) return;
    const node: HTMLCanvasElement = canvas.current;
    const ctx = node.getContext("2d")!;
    let raf = 0,
      last = performance.now();
    const resize = () => {
      const ratio = Math.min(devicePixelRatio, 2);
      node.width = node.clientWidth * ratio;
      node.height = node.clientHeight * ratio;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();
    const point = (who: number, now: number) => {
      const m = model.current;
      m.scores[who]++;
      setScore([...m.scores]);
      chime(refs.current.settings.sound, who === 0);
      if (m.scores[who] >= 7) {
        m.phase = "finished";
        setPhase("finished");
        refs.current.onComplete(m.scores[0]);
      } else {
        m.x = 500;
        m.y = 350;
        m.vx = who === 0 ? -95 : 95;
        m.vy = who === 0 ? 230 : -230;
        m.serveUntil = now + 1000;
      }
    };
    const rounded = (
      x: number,
      y: number,
      w: number,
      h: number,
      r: number,
      color: string,
    ) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
    };
    function draw(now: number) {
      raf = requestAnimationFrame(draw);
      const dt = Math.min((now - last) / 1000, 0.032);
      last = now;
      const m = model.current;
      if (m.phase === "playing") {
        if (now > m.serveUntil) {
          m.x += m.vx * dt;
          m.y += m.vy * dt;
          const aiSpeed = 135;
          m.opponent += Math.max(
            -aiSpeed * dt,
            Math.min(aiSpeed * dt, m.x - m.opponent),
          );
          m.opponent = Math.max(150, Math.min(850, m.opponent));
          if ((m.x < 105 && m.vx < 0) || (m.x > 895 && m.vx > 0)) m.vx *= -1;
          if (
            m.vy > 0 &&
            m.y >= 573 &&
            m.y < 610 &&
            Math.abs(m.x - m.player) < 106
          ) {
            m.y = 572;
            m.vy = -Math.min(550, Math.abs(m.vy) + 20);
            m.vx = (m.x - m.player) * 3.2;
            chime(refs.current.settings.sound);
          }
          if (
            m.vy < 0 &&
            m.y <= 127 &&
            m.y > 90 &&
            Math.abs(m.x - m.opponent) < 85
          ) {
            m.y = 128;
            m.vy = Math.min(550, Math.abs(m.vy) + 16);
            m.vx = (m.x - m.opponent) * 3.1;
          }
          if (m.y > 675) point(1, now);
          else if (m.y < 25) point(0, now);
        }
      }
      ctx.setTransform(node.width / 1000, 0, 0, node.height / 700, 0, 0);
      ctx.clearRect(0, 0, 1000, 700);
      ctx.fillStyle = "#e9f1ed";
      ctx.fillRect(0, 0, 1000, 700);
      ctx.shadowColor = "#20433525";
      ctx.shadowBlur = 35;
      ctx.shadowOffsetY = 15;
      rounded(86, 43, 828, 615, 14, "#27695d");
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      rounded(99, 56, 802, 589, 4, "#367c6d");
      ctx.strokeStyle = "#e4f0e8";
      ctx.lineWidth = 3;
      ctx.strokeRect(109, 66, 782, 569);
      ctx.beginPath();
      ctx.moveTo(500, 66);
      ctx.lineTo(500, 635);
      ctx.stroke();
      ctx.fillStyle = "#143f3770";
      ctx.fillRect(88, 351, 824, 9);
      ctx.strokeStyle = "#d7e9de";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(78, 347);
      ctx.lineTo(922, 347);
      ctx.stroke();
      ctx.strokeStyle = "#edf6f08a";
      ctx.lineWidth = 1;
      for (let x = 88; x < 922; x += 13) {
        ctx.beginPath();
        ctx.moveTo(x, 347);
        ctx.lineTo(x, 367);
        ctx.stroke();
      }
      const paddle = (x: number, y: number, flip: boolean) => {
        ctx.save();
        ctx.translate(x, y);
        if (flip) ctx.rotate(Math.PI);
        ctx.shadowColor = "#16352b40";
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 8;
        rounded(-11, 8, 22, 55, 8, "#d9b995");
        ctx.fillStyle = flip ? "#34476f" : "#ee8164";
        ctx.beginPath();
        ctx.ellipse(0, 0, !flip ? 91 : 72, 23, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = flip ? "#5974a4" : "#ffad91";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      };
      paddle(m.opponent, 102, true);
      paddle(m.player, 598, false);
      ctx.fillStyle = "#173f3940";
      ctx.beginPath();
      ctx.ellipse(m.x + 5, m.y + 14, 11, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fffdf5";
      ctx.shadowColor = "#fff8d680";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [phase === "finished"]);
  if (phase === "finished")
    return (
      <ResultPanel
        title={score[0] === 7 ? "You won." : "The computer won."}
        description={
          score[0] === 7
            ? `You won ${score[0]}–${score[1]}.`
            : `Final score ${score[0]}–${score[1]}.`
        }
        score={score[0]}
        max={7}
        onRestart={restart}
        onExit={onExit}
      />
    );
  return (
    <div className="rally-game">
      <div className="match-score">
        <div>
          <span>{settings.name || "You"}</span>
          <strong>{score[0]}</strong>
        </div>
        <span className="match-divider">First to 7</span>
        <div>
          <span>Computer</span>
          <strong>{score[1]}</strong>
        </div>
      </div>
      <div className="court-wrap">
        <canvas
          ref={canvas}
          aria-label={`Table tennis court. Your score ${score[0]}, opponent score ${score[1]}.`}
          role="img"
        />
        {phase !== "playing" && (
          <div className="court-overlay">
            <h2>{phase === "paused" ? "Paused" : "Ready?"}</h2>
            <p>Hit the ball back. First to 7 wins.</p>
          </div>
        )}
      </div>
    </div>
  );
}
