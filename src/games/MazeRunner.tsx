import { pauseGate } from "./render-motion";
import { surfaceRatio } from "./surface";
import { boardPoint } from "../lib/phone-point.mjs";
import { aimMark, softShadow, staticArt, toyFinish } from "./art";
import { useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { chime, type Settings } from "../lib/store";
import type { useRoom } from "../lib/room";
import {
  BOT,
  GRAB,
  firstMaze,
  KNOCKBACK,
  LEVELS,
  MAX_STARS,
  RUNNER,
  RUN_SPEED,
  SAFE_SECONDS,
  WALL,
  botAt,
  cellAt,
  makeMaze,
  mazeStars,
  randomMaze,
  moveRunner,
  wallSegments,
} from "../lib/maze.mjs";
import TurnHandoff from "../components/TurnHandoff";
import PointsStar from "../components/PointsStar";
import { Hud } from "../components/GameHud";
import { FinishActions, FinishScores, resultTitle } from "../components/ResultPanel";
import { followAmount } from "../lib/game-physics.mjs";
import "./maze.css";
type Point = { x: number; y: number };
type Cell = { c: number; r: number };
type Phase = "play" | "cleared" | "handoff" | "finished";
type Maze = ReturnType<typeof makeMaze>;
const INK = "#29465a";
const RUNNER_COLOR = "#fa8878";
const BOT_COLOR = "#8e92dc";
const center = ({ c, r }: Cell) => ({ x: c + 0.5, y: r + 0.5 });
const gap = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const freshRun = () => ({
  runner: { x: 0.5, y: 0.5 },
  cursor: { x: 0.5, y: 0.5 },
  grabbed: false,
  started: false,
  elapsed: 0,
  botTime: 0,
  hits: 0,
  // The cells the runner came through, oldest first; bots knock it back
  // along this.
  trail: [{ c: 0, r: 0 }] as Cell[],
  safeUntil: 0,
  bumpAt: 0,
});
export default function MazeRunner({
  roster,
  settings,
  room,
  suspended,
  onComplete,
  onExit,
}: {
  roster: string[];
  settings: Settings;
  room: ReturnType<typeof useRoom>;
  suspended: boolean;
  onComplete: (score: number, name: string) => void;
  onExit: () => void;
}) {
  // Carve the next maze when Next maze is pressed. Later players reuse the
  // same five so every turn is fair.
  const [mazes, setMazes] = useState<Maze[]>(() => [firstMaze()]);
  const [phase, setPhase] = useState<Phase>("play");
  const phaseRef = useRef<Phase>("play");
  const changePhase = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const [turn, setTurn] = useState(0);
  const [level, setLevel] = useState(0);
  // Stars for each maze this turn, and each player's total.
  const [stars, setStars] = useState<number[]>([]);
  const [scores, setScores] = useState<number[]>([]);
  const [clock, setClock] = useState(0);
  const [hits, setHits] = useState(0);
  const [grabbed, setGrabbed] = useState(false);
  const [message, setMessage] = useState("Grab the runner");
  const maze = mazes[level];
  const last = level === LEVELS.length - 1;
  const total = stars.reduce((a, b) => a + b, 0);
  const container = useRef<HTMLDivElement>(null);
  const run = useRef(freshRun());
  // Where the phone points (-1..1 each way) and whether its button is held.
  const pointing = useRef<Point>({ x: 0, y: 0 });
  const held = useRef(false);
  const latest = useRef({ settings, suspended, maze, stars, turn });
  latest.current = { settings, suspended, maze, stars, turn };
  useEffect(() => {
    const release = () => { held.current = false; run.current.grabbed = false; setGrabbed(false); };
    window.addEventListener("blur", release);
    return () => window.removeEventListener("blur", release);
  }, []);
  // A pause lets go of the runner; the phone's button starts fresh after.
  useEffect(() => {
    if (suspended) held.current = false;
  }, [suspended]);
  const startMaze = (next: number) => {
    const selected = mazes[next] ?? randomMaze(LEVELS[next]);
    if (!mazes[next]) setMazes(old => [...old, selected]);
    run.current = freshRun();
    setLevel(next);
    setClock(0);
    setHits(0);
    setGrabbed(false);
    changePhase("play");
    setMessage(
      next === 0
        ? "Grab the runner"
        : `Maze ${next + 1} · Watch for ${selected.bots.length} ${selected.bots.length === 1 ? "bot" : "bots"}!`,
    );
  };
  const finishMaze = (earned: number) => {
    setStars((old) => [...old, earned]);
    chime(latest.current.settings.sound, true);
    room.buzz(80);
    changePhase("cleared");
  };
  const act = () => {
    if (latest.current.suspended || phaseRef.current !== "cleared") return;
    if (!last) return startMaze(level + 1);
    onComplete(total, roster[turn]);
    setScores((old) => [...old, total]);
    changePhase(turn === roster.length - 1 ? "finished" : "handoff");
  };
  const acceptTurn = () => {
    if (latest.current.suspended || phaseRef.current !== "handoff") return;
    setTurn((t) => t + 1);
    setStars([]);
    startMaze(0);
  };
  const handlers = useRef({ act, acceptTurn, finishMaze });
  handlers.current = { act, acceptTurn, finishMaze };
  const actionLabel =
    phase === "cleared" ? (last ? "Finish turn" : "Next maze") : "Drag";
  useEffect(() => {
    room.publish(
      "maze",
      !suspended && phase !== "finished",
      phase === "finished"
        ? "Game complete"
        : phase === "handoff"
          ? `Your turn, ${roster[turn + 1]}.`
          : actionLabel,
      phase === "handoff" ? roster[turn + 1] : null,
      phase === "handoff" ? roster[turn + 1] : roster[turn],
    );
    room.handler.current = (e) => {
      if (latest.current.suspended || !Number.isFinite(e.value)) return;
      if (e.action === "next") handlers.current.acceptTurn();
      if (e.action === "aim") pointing.current.x = e.value;
      if (e.action === "move") pointing.current.y = e.value;
      // The phone's button: held (1) to drag, let go (0) to drop.
      if (e.action === "draw") held.current = e.value > 0;
      if (e.action === "throw") handlers.current.act();
    };
    return () => {
      room.handler.current = null;
    };
  }, [phase, suspended, actionLabel, turn, roster, room.publish, room.handler]);
  // The maze stays on screen, frozen, while its stars are shown.
  const onBoard = phase === "play" || phase === "cleared";
  useEffect(() => {
    if (!onBoard) return;
    const parent = container.current!;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    parent.prepend(canvas);
    const draw = canvas.getContext("2d")!;
    const segments = wallSegments(maze);
    const scenery = staticArt();
    const gate = pauseGate();
    const wallRows = new Map<string, number[][]>();
    for (const segment of segments) {
      const [ax, ay, bx, by] = segment;
      const key = ay === by ? `h:${ay}` : `v:${ax}`;
      const row = wallRows.get(key) ?? [];
      row.push(ay === by ? [ax, bx, ay, 0] : [ay, by, ax, 1]); wallRows.set(key, row);
    }
    const wallRuns: number[][] = [];
    for (const row of wallRows.values()) {
      row.sort((a, b) => a[0] - b[0]);
      for (const run of row) {
        const last = wallRuns.at(-1);
        if (last && last[1] === run[0] && last[2] === run[2] && last[3] === run[3]) last[1] = run[1];
        else wallRuns.push([...run]);
      }
    }
    let width = 0,
      height = 0;
    const resize = () => {
      width = parent.clientWidth;
      height = parent.clientHeight;
      const ratio = surfaceRatio(width, height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      draw.setTransform(ratio, 0, 0, ratio, 0, 0);
      gate.invalidate();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    resize();
    const say = (text: string) => setMessage(text);
    const step = (dt: number, now: number) => {
      const m = run.current;
      const { cols, rows } = maze;
      const size = Math.min(width / (cols + 1.4), height / (rows + 0.8));
      const point = boardPoint(pointing.current.x, pointing.current.y, width, height,
        size, cols / 2, rows / 2);
      m.cursor = { x: Math.max(0, Math.min(cols, point.x)), y: Math.max(0, Math.min(rows, point.y)) };
      m.botTime += dt;
      if (m.started) m.elapsed += dt;
      if (!held.current && m.grabbed) {
        m.grabbed = false;
        setGrabbed(false);
      }
      if (held.current && !m.grabbed && gap(m.cursor, m.runner) <= GRAB) {
        m.grabbed = true;
        m.started = true;
        setGrabbed(true);
        say("Drag to the flag!");
        room.buzz(20);
      }
      if (m.grabbed) {
        const travel = Math.min(RUN_SPEED * dt, gap(m.runner, m.cursor) * followAmount(dt));
        const moved = moveRunner(segments, m.runner, m.cursor, travel);
        m.runner = { x: moved.x, y: moved.y };
        if (moved.blocked && now - m.bumpAt > 350) {
          m.bumpAt = now;
          room.buzz(25);
        }
        // Walls stop the runner, not the grip. Moving quickly or going around a
        // corner should never require finding and picking it up all over again.
      }
      const here = cellAt(maze, m.runner);
      const end = m.trail[m.trail.length - 1];
      if (here.c !== end.c || here.r !== end.r) {
        const before = m.trail[m.trail.length - 2];
        // Stepping back the way it came shortens the trail.
        if (before && before.c === here.c && before.r === here.r) m.trail.pop();
        else m.trail.push(here);
      }
      if (m.started && m.botTime >= m.safeUntil)
        for (const bot of maze.bots) {
          if (gap(botAt(bot, m.botTime), m.runner) >= RUNNER + BOT) continue;
          m.hits++;
          setHits(m.hits);
          m.grabbed = false;
          setGrabbed(false);
          const back = Math.max(0, m.trail.length - 1 - KNOCKBACK);
          m.trail.length = back + 1;
          m.runner = center(m.trail[back]);
          m.safeUntil = m.botTime + SAFE_SECONDS;
          say("Bumped! Wait a sec…");
          chime(latest.current.settings.sound);
          room.buzz(140);
          break;
        }
      if (
        here.c === maze.exit.c &&
        here.r === maze.exit.r &&
        gap(m.runner, center(maze.exit)) < 0.45
      ) {
        m.grabbed = false;
        setGrabbed(false);
        setClock(m.elapsed);
        handlers.current.finishMaze(mazeStars(m.elapsed, maze.par, m.hits));
      }
    };
    const shownRunner = { ...run.current.runner }, shownCursor = { ...run.current.cursor };
    let stretch = 0, heading = 0;
    const render = (dt: number) => {
      const m = run.current;
      const { cols, rows } = maze;

      const size = Math.min(width / (cols + 1.4), height / (rows + 0.8));
      const ox = (width - cols * size) / 2,
        oy = (height - rows * size) / 2;
      const at = (p: Point) => ({ x: ox + p.x * size, y: oy + p.y * size });
      scenery(draw, width, height, canvas.width / Math.max(1, width), draw => {
        draw.fillStyle = "#edf3f4"; draw.fillRect(0, 0, width, height);
        // A soft pool of light under the tray; the edges keep the arena color.
        const pool = draw.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.hypot(cols, rows) * size * .75);
        pool.addColorStop(0, "#ffffffd0"); pool.addColorStop(.6, "#ffffff50"); pool.addColorStop(1, "#ffffff00");
        draw.fillStyle = pool; draw.fillRect(0, 0, width, height);
        draw.lineCap = "round"; draw.lineJoin = "round";
        // Soft tray edge and raised walls, like a little wooden maze toy.
        draw.save();
        draw.shadowColor = "#5a4c8a25";
        draw.shadowBlur = size * 0.25;
        draw.shadowOffsetY = size * 0.12;
        draw.fillStyle = "#c4d8dd";
        draw.beginPath();
        draw.roundRect(ox - size * .12, oy - size * .12, (cols + .24) * size, (rows + .24) * size, size * .27);
        draw.fill();
        draw.restore();
        // Floor, with the start pad and the exit flag.
        draw.fillStyle = toyFinish(draw, width * .4, height * .35, Math.max(width, height), "#ffffff", "#fcfdf9", "#e9f1ed");
        draw.beginPath();
        draw.roundRect(ox, oy, cols * size, rows * size, size * 0.18);
        draw.fill();
        const pad = (cell: Cell, color: string) => {
          draw.fillStyle = color;
          draw.beginPath();
          draw.roundRect(ox + (cell.c + 0.1) * size, oy + (cell.r + 0.1) * size, size * 0.8, size * 0.8, size * 0.2);
          draw.fill();
        };
        // A faint dot in every cell gives the floor scale without adding lines.
        draw.fillStyle = "#648c981c";
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          draw.beginPath(); draw.arc(ox + (c + .5) * size, oy + (r + .5) * size, size * .028, 0, Math.PI * 2); draw.fill();
        }
        pad(maze.start, "#ffe7e1");
        pad(maze.exit, "#dcefd9");
        draw.strokeStyle = "#ffffffb0"; draw.lineWidth = size * .03;
        for (const cell of [maze.start, maze.exit]) {
          draw.beginPath();
          draw.roundRect(ox + (cell.c + 0.17) * size, oy + (cell.r + 0.17) * size, size * 0.66, size * 0.66, size * 0.15);
          draw.stroke();
        }
        const flag = at({ x: maze.exit.c + 0.62, y: maze.exit.r + 0.78 });
        draw.fillStyle = "#74aa8633";
        draw.beginPath(); draw.ellipse(flag.x - size * .08, flag.y + size * .015, size * .27, size * .07, 0, 0, Math.PI * 2); draw.fill();
        // Each bot's beat, so players can see where it paces.
        draw.strokeStyle = "#8e92dc66";
        draw.lineWidth = size * 0.06;
        draw.setLineDash([size * 0.06, size * 0.16]);
        for (const bot of maze.bots) {
          const a = at(bot.from),
            b = at(bot.to);
          draw.beginPath();
          draw.moveTo(a.x, a.y);
          draw.lineTo(b.x, b.y);
          draw.stroke();
        }
        draw.setLineDash([]);
        const wallFinish = draw.createLinearGradient(ox, oy, ox + cols * size, oy + rows * size);
        wallFinish.addColorStop(0, "#82aab1"); wallFinish.addColorStop(.5, "#648c98"); wallFinish.addColorStop(1, "#547d8b");
        draw.strokeStyle = wallFinish;
        draw.lineWidth = WALL * size;
        const walls = new Path2D();
        for (const [start, end, fixed, vertical] of wallRuns) {
          walls.moveTo(ox + (vertical ? fixed : start) * size, oy + (vertical ? start : fixed) * size);
          walls.lineTo(ox + (vertical ? fixed : end) * size, oy + (vertical ? end : fixed) * size);
        }
        draw.save();
        draw.shadowColor = "#29465a26";
        draw.shadowOffsetY = size * .065;
        draw.shadowBlur = size * .035;
        draw.stroke(walls);
        draw.restore();
        draw.strokeStyle = "#c2e1e3";
        draw.lineWidth = WALL * size * .56;
        draw.save();
        draw.translate(-size * .015, -size * .018);
        draw.stroke(walls);
        draw.strokeStyle = "#ffffffa0"; draw.lineWidth = WALL * size * .13;
        draw.translate(-size * .006, -size * .006); draw.stroke(walls);
        draw.restore();
        // Tiny inset feet finish the molded tray; they are baked with the maze.
        for (const x of [ox + size * .16, ox + (cols - .16) * size]) {
          for (const y of [oy + size * .16, oy + (rows - .16) * size]) {
            draw.beginPath(); draw.arc(x, y, size * .025, 0, Math.PI * 2);
            draw.fillStyle = "#648c9826"; draw.fill();
          }
        }
      });
      const still = latest.current.settings.motion, time = m.botTime;
      {
        // The flag ripples from its pole; a slow halo marks the way out.
        const flag = at({ x: maze.exit.c + 0.62, y: maze.exit.r + 0.78 });
        if (!still) {
          const e = at(center(maze.exit)), beat = (time * .6) % 1;
          draw.strokeStyle = "#65a77d"; draw.globalAlpha = (1 - beat) ** 2 * .5; draw.lineWidth = size * .035;
          draw.beginPath(); draw.roundRect(e.x - size * (.4 + beat * .12), e.y - size * (.4 + beat * .12), size * (.8 + beat * .24), size * (.8 + beat * .24), size * (.2 + beat * .06)); draw.stroke();
          draw.globalAlpha = 1;
        }
        const wave = (along: number) => still ? 0 : Math.sin(time * 5 - along * 5) * size * .035 * along;
        draw.strokeStyle = INK; draw.lineWidth = size * 0.05; draw.lineCap = "round";
        draw.beginPath(); draw.moveTo(flag.x, flag.y); draw.lineTo(flag.x, flag.y - size * 0.55); draw.stroke();
        draw.fillStyle = "#ffe29b";
        draw.beginPath(); draw.arc(flag.x, flag.y - size * .57, size * .04, 0, Math.PI * 2); draw.fill();
        draw.fillStyle = "#65a77d";
        draw.beginPath();
        draw.moveTo(flag.x, flag.y - size * 0.55);
        draw.bezierCurveTo(flag.x - size * .14, flag.y - size * .66 + wave(.4), flag.x - size * .22, flag.y - size * .45 + wave(.7), flag.x - size * .38, flag.y - size * .54 + wave(1));
        draw.lineTo(flag.x - size * .38, flag.y - size * .3 + wave(1));
        draw.bezierCurveTo(flag.x - size * .22, flag.y - size * .22 + wave(.7), flag.x - size * .14, flag.y - size * .43 + wave(.4), flag.x, flag.y - size * .32);
        draw.closePath();
        draw.fill();
        draw.strokeStyle = "#c2e8b5"; draw.lineWidth = size * .018;
        draw.beginPath(); draw.moveTo(flag.x - size * .04, flag.y - size * .51);
        draw.quadraticCurveTo(flag.x - size * .16, flag.y - size * .56 + wave(.5), flag.x - size * .29, flag.y - size * .49 + wave(.85)); draw.stroke();
      }
      // Breadcrumbs back to the start.
      if (m.trail.length > 1) {
        draw.strokeStyle = "#fa88782b";
        draw.lineWidth = size * .16;
        draw.lineCap = "round";
        draw.lineJoin = "round";
        draw.beginPath();
        m.trail.forEach((cell, i) => {
          const p = at(center(cell));
          if (i === 0) draw.moveTo(p.x, p.y); else draw.lineTo(p.x, p.y);
        });
        const p = at(m.runner);
        draw.lineTo(p.x, p.y);
        draw.stroke();
      }
      draw.fillStyle = "#fa887855";
      for (const cell of m.trail.slice(0, -1)) {
        const p = at(center(cell));
        draw.beginPath();
        draw.arc(p.x, p.y, size * 0.07, 0, Math.PI * 2);
        draw.fill();
      }
      const eyes = (p: Point, r: number, look: Point) => {
        const d = gap(look, { x: 0, y: 0 }) || 1;
        const lx = (look.x / d) * r * 0.12,
          ly = (look.y / d) * r * 0.12;
        for (const side of [-1, 1]) {
          draw.fillStyle = "#fff";
          draw.beginPath();
          draw.arc(p.x + side * r * 0.36, p.y - r * 0.12, r * 0.26, 0, Math.PI * 2);
          draw.fill();
          draw.fillStyle = INK;
          draw.beginPath();
          draw.arc(p.x + side * r * 0.36 + lx, p.y - r * 0.12 + ly, r * 0.13, 0, Math.PI * 2);
          draw.fill();

        }
      };
      for (const [index, bot] of maze.bots.entries()) {
        const pos = botAt(bot, m.botTime);
        const p = at(pos), r = BOT * size;
        // A wind-up waddle: the body bobs while its shadow stays on the floor.
        const hop = still ? 0 : Math.abs(Math.sin(time * 7 + index * 2)) * r * .1;
        softShadow(draw, p.x, p.y + r * .88, r * (1.15 - hop / r * .8), r * .38);
        p.y -= hop;
        // Rounded wind-up buddies: readable obstacles without spikes or scowls.
        const coat = draw.createLinearGradient(p.x - r, p.y - r, p.x + r, p.y + r);
        coat.addColorStop(0, "#b7b6f1"); coat.addColorStop(1, BOT_COLOR);
        draw.fillStyle = coat; draw.strokeStyle = INK; draw.lineWidth = r * .06;
        draw.beginPath(); draw.roundRect(p.x - r, p.y - r, r * 2, r * 1.9, r * .6); draw.fill(); draw.stroke();
        draw.strokeStyle = "#ffffff80"; draw.lineWidth = r * .09;
        draw.beginPath(); draw.moveTo(p.x - r * .65, p.y - r * .62); draw.quadraticCurveTo(p.x - r * .5, p.y - r * .8, p.x + r * .3, p.y - r * .77); draw.stroke();
        draw.strokeStyle = INK; draw.lineWidth = r * .06;
        draw.beginPath(); draw.moveTo(p.x, p.y - r); draw.lineTo(p.x, p.y - r * 1.3); draw.stroke();
        if (!still) {
          draw.fillStyle = "#ffe29b"; draw.globalAlpha = .25 + .2 * Math.sin(time * 6 + index);
          draw.beginPath(); draw.arc(p.x, p.y - r * 1.38, r * .34, 0, Math.PI * 2); draw.fill();
          draw.globalAlpha = 1;
        }
        draw.fillStyle = "#ffe29b";
        draw.beginPath(); draw.arc(p.x, p.y - r * 1.38, r * .18, 0, Math.PI * 2); draw.fill();
        eyes(p, r, { x: m.runner.x - pos.x, y: m.runner.y - pos.y });
        draw.strokeStyle = INK; draw.lineWidth = r * .09;
        draw.beginPath(); draw.arc(p.x, p.y + r * .25, r * .24, .15 * Math.PI, .85 * Math.PI); draw.stroke();
      }
      // Keep the runner visible after a bump; a protective ring marks safe time.
      const safe = m.botTime < m.safeUntil;
      {
        const p = at(m.runner);
        const r = RUNNER * size;
        if (safe) {
          // The shield turns slowly and fades as its time runs out.
          const left = Math.min(1, (m.safeUntil - m.botTime) / .5);
          draw.save(); draw.translate(p.x, p.y); if (!still) draw.rotate(time * 1.6);
          draw.globalAlpha = .45 + .55 * left;
          draw.strokeStyle = "#fffdf5"; draw.lineWidth = size * .06; draw.lineCap = "round";
          draw.setLineDash([r * .55, r * .4]);
          draw.beginPath(); draw.arc(0, 0, r * 1.4, 0, Math.PI * 2); draw.stroke();
          draw.setLineDash([]); draw.restore();
        }
        softShadow(draw, p.x, p.y + r * .9, r * 1.12, r * .4);
        // The runner leans into its travel and rounds out again at rest.
        const moved = { x: m.runner.x - shownRunner.x, y: m.runner.y - shownRunner.y }, pace = Math.hypot(moved.x, moved.y);
        shownRunner.x = m.runner.x; shownRunner.y = m.runner.y;
        const lean = still || pace > 1 ? 0 : Math.min(.13, pace * 1.4);
        stretch += (lean - stretch) * Math.min(1, dt * 14);
        if (pace > 1e-4 && pace <= 1) heading = Math.atan2(moved.y, moved.x);
        draw.save();
        draw.translate(p.x, p.y); draw.rotate(heading); draw.scale(1 + stretch, 1 - stretch); draw.rotate(-heading); draw.translate(-p.x, -p.y);
        if (m.grabbed) {
          draw.fillStyle = "#fa887833";
          draw.beginPath();
          draw.arc(p.x, p.y, r * 1.7, 0, Math.PI * 2);
          draw.fill();
        }
        draw.fillStyle = toyFinish(draw, p.x, p.y, r, "#ffd2b8", RUNNER_COLOR, "#e86e62");
        draw.strokeStyle = INK;
        draw.lineWidth = r * 0.025;
        draw.beginPath();
        draw.arc(p.x, p.y, r, 0, Math.PI * 2);
        draw.fill();
        draw.stroke();
        draw.strokeStyle = "#fff4dbaa"; draw.lineWidth = r * .11;
        draw.beginPath(); draw.arc(p.x, p.y, r * .72, Math.PI * 1.13, Math.PI * 1.62); draw.stroke();
        eyes(p, r, { x: m.cursor.x - m.runner.x, y: m.cursor.y - m.runner.y });
        draw.strokeStyle = INK;
        draw.lineWidth = r * 0.1;
        draw.beginPath();
        draw.arc(p.x, p.y + r * 0.2, r * 0.28, 0.15 * Math.PI, 0.85 * Math.PI);
        draw.stroke();
        draw.restore();
      }
      // The cursor: where the phone points. It fills while the button is held,
      // and a ring around the runner shows when it's close enough to grab.
      // The mark eases toward the phone's point, like the other games' pointers.
      const ease = Math.hypot(m.cursor.x - shownCursor.x, m.cursor.y - shownCursor.y) > 3 ? 1 : followAmount(dt);
      shownCursor.x += (m.cursor.x - shownCursor.x) * ease; shownCursor.y += (m.cursor.y - shownCursor.y) * ease;
      const c = at(shownCursor);
      if (m.grabbed) {
        const p = at(m.runner);
        draw.strokeStyle = "#29465a50";
        draw.lineWidth = size * .035;
        draw.setLineDash([size * .07, size * .09]);
        draw.beginPath(); draw.moveTo(p.x, p.y); draw.lineTo(c.x, c.y); draw.stroke();
        draw.setLineDash([]);
      }
      if (!m.grabbed && gap(m.cursor, m.runner) <= GRAB) {
        const p = at(m.runner);
        draw.strokeStyle = RUNNER_COLOR;
        draw.lineWidth = size * 0.05;
        draw.setLineDash([size * 0.1, size * 0.08]);
        draw.beginPath();
        draw.arc(p.x, p.y, RUNNER * size * 1.7, 0, Math.PI * 2);
        draw.stroke();
        draw.setLineDash([]);
      }
      aimMark(draw, c.x, c.y, size * .13, held.current ? RUNNER_COLOR : "#527e8c", held.current);
    };
    let raf = 0,
      previous = performance.now(),
      shown = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      if (
        phaseRef.current === "play" &&
        !latest.current.suspended &&
        !document.hidden
      ) {
        // Keep fast drags safe around walls and bots, even on slower displays.
        const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
        for (let i = 0; i < steps && phaseRef.current === "play"; i++) {
          step(dt / steps, now - dt * 1000 * (1 - (i + 1) / steps));
        }
        if (Math.abs(run.current.elapsed - shown) >= 0.1) {
          shown = run.current.elapsed;
          setClock(shown);
        }
      }
      if (!document.hidden && gate.frame(phaseRef.current !== "play" || latest.current.suspended, latest.current.settings.motion) !== "skip") render(dt);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.remove();
    };
  }, [onBoard, maze, room.buzz]);
  const restart = () => {
    setMazes([firstMaze()]);
    setTurn(0);
    setScores([]);
    setStars([]);
    startMaze(0);
  };
  if (phase === "handoff")
    return (
      <TurnHandoff
        name={roster[turn + 1]}
        detail={`${roster[turn]} got ${scores[turn]} ${scores[turn] === 1 ? "star" : "stars"}`}
      />
    );
  if (phase === "finished")
    return (
      <div className="round-finished">
        <h2 tabIndex={-1}>
          {resultTitle(scores.map((n, i) => ({ name: roster[i], score: n })))}
        </h2>
        <FinishScores players={scores.map((n, i) => ({ name: roster[i], score: n, shown: <>{n}<PointsStar /></> }))} />
        <FinishActions onRestart={restart} onExit={onExit} />
      </div>
    );
  const earned = stars[level] ?? 0;
  const seconds = clock.toFixed(1);
  const whole = Math.floor(clock);
  return (
    <div className="sports-game maze-game">
      <Hud slot="start">
        <strong className="hud-score maze-hud-score" aria-label={`${total} of ${MAX_STARS} stars`}>
          <span>{total}</span>
          <PointsStar />
        </strong>
      </Hud>
      <Hud slot="end">
        <div className="maze-hud">
          <span className="hud-info" data-total={LEVELS.length}>
            Maze {level + 1}
            <span className="maze-level-long"> of {LEVELS.length}</span>
          </span>
          <div className="fruit-timer" aria-label={`${whole} seconds`}>
            <Timer aria-hidden="true" />
            <strong>{Math.floor(whole / 60)}:{String(whole % 60).padStart(2, "0")}</strong>
          </div>
        </div>
      </Hud>
      <div
        className="court-wrap maze-arena"
        ref={container}
        role="img"
        aria-label={`Maze ${level + 1} of ${LEVELS.length}, ${maze.cols} by ${maze.rows} cells with ${maze.bots.length} ${maze.bots.length === 1 ? "bot" : "bots"}. Start top left, exit bottom right. ${grabbed ? "Dragging the runner." : "Runner waiting."} ${seconds} seconds, ${hits} bot ${hits === 1 ? "hit" : "hits"}.`}
      >
        {phase === "cleared" && (
          <div className="court-overlay maze-cleared">
            <h2>Maze cleared!</h2>
            <p className="maze-stars" aria-label={`${earned} of 3 stars`}>
              {[0, 1, 2].map((i) => (
                <span key={i} className={i < earned ? "earned" : ""} aria-hidden="true">
                  <PointsStar />
                </span>
              ))}
            </p>
            {earned < 3 && (
              <ul className="maze-breakdown">
                {clock > maze.par && <li><PointsStar />Under {maze.par}s</li>}
                {hits > 0 && <li><PointsStar />No bumps</li>}
              </ul>
            )}
          </div>
        )}
      </div>
      <p className="sr-only" role="status">
        {phase === "cleared" ? `Maze ${level + 1} cleared.` : message}
      </p>
    </div>
  );
}
