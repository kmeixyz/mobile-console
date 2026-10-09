import { opponents, type Difficulty } from "../lib/difficulty";
import { planePointer } from "./phone-projection";
import GameInstruction, { ReadyInstruction } from "../components/GameInstruction";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, RotateCcw } from "lucide-react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { contactRipples, motionTrail } from "./table-effects";
import { PHONE_RESPONSE, followAmount } from "../lib/game-physics.mjs";
import { chime, type Settings } from "../lib/store";
import type { useRoom } from "../lib/room";
import ResultPanel from "../components/ResultPanel";
import { Hud } from "../components/GameHud";
import "./rally.css";
// Table units are meters: x across, y up from the tabletop, z along. Player 1
// defends the +z end, Player 2 (or the computer) the -z end. Each paddle
// slides in an upright plane just behind its end, wherever the phone points.
const HW = 0.7625;
const HL = 1.37;
const NET = 0.1525;
const FLOOR = -0.76;
// Bigger than a real ball, so it reads from the couch.
const BALL = 0.035;
const PADDLE = 0.15;
// A ball passing this close to the paddle's center is blocked.
const REACH = PADDLE + BALL + 0.03;
const PLANE = HL + 0.3;
const REACH_X = HW + 0.25;
const LOW = 0.04;
const HIGH = 0.85;
const G = 9.8;
const WIN = 7;
const PADDLE_SPEED = 32;
const STEP = 1 / 240;
const COLORS = ["#fa8878", "#8e92dc"];
type Phase = "ready" | "playing" | "paused" | "finished";
type Ball = { x: number; y: number; z: number; vx: number; vy: number; vz: number };
type Paddle = { x: number; y: number; vx: number; vy: number };
const clamp = (n: number, min = -1, max = 1) => Math.max(min, Math.min(max, n));
const sideOf = (player: number) => (player === 0 ? 1 : -1);
// Phone pointing (x -1..1 left/right, y -1 up..1 down) as a paddle spot. Each
// player sees the table from their own end, so pointing right is their right.
const fromPhone = (player: number, x: number, y: number) => ({
  x: sideOf(player) * clamp(x) * REACH_X,
  y: LOW + ((1 - clamp(y)) / 2) * (HIGH - LOW),
});
// Two points each, then the serve changes hands.
const serverFor = (scores: number[]) => Math.floor((scores[0] + scores[1]) / 2) % 2;
const fresh = () => ({
  phase: "ready" as Phase,
  time: 0,
  ball: { x: 0, y: 0.3, z: PLANE, vx: 0, vy: 0, vz: 0 } as Ball,
  paddles: [
    { x: 0, y: 0.3, vx: 0, vy: 0 },
    { x: 0, y: 0.3, vx: 0, vy: 0 },
  ] as Paddle[],
  // Where each phone points; the computer's paddle sets its own target.
  pointing: [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ],
  targets: [fromPhone(0, 0, 0), fromPhone(1, 0, 0)],
  scores: [0, 0],
  // The ball waits in front of the server's paddle until serveAt (0: the
  // countdown hasn't started).
  waiting: true,
  serveAt: 0,
  // The player the ball is heading for; theirs to block.
  toward: 1,
  rally: 0,
  missedAt: 0,
  cpuAim: { x: 0, y: 0.3 },
  cpuReactAt: 0,
  intercept: { x: 0, y: 0.3 },
});
export default function Rally({
  roster,
  difficulty = "Easy",
  settings,
  suspended = false,
  room,
  onComplete,
  onExit,
}: {
  roster: string[];
  difficulty?: Difficulty;
  settings: Settings;
  suspended?: boolean;
  room: ReturnType<typeof useRoom>;
  onComplete: (score: number, name: string) => void;
  onExit: () => void;
}) {
  // Two players each get their own view of the table: Player 1 on the left,
  // Player 2 on the right. One player gets the whole screen.
  const two = roster.length >= 2;
  const names = [roster[0], two ? roster[1] : "Computer"];
  const container = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState([0, 0]);
  const [point, setPoint] = useState<number | null>(null);
  const [fallback, setFallback] = useState(false);
  const model = useRef(fresh());
  const refs = useRef({ settings, onComplete, names, two, suspended, difficulty });
  refs.current = { settings, onComplete, names, two, suspended, difficulty };
  const changePhase = useCallback((next: Phase) => {
    const m = model.current;
    m.phase = next;
    // A paused serve counts down again from the start.
    if (m.waiting) m.serveAt = 0;
    setPhase(next);
  }, []);
  useEffect(() => {
    if (suspended && model.current.phase === "playing") changePhase("paused");
  }, [suspended, changePhase]);
  const toggle = useCallback(() => {
    const m = model.current;
    if (m.phase === "finished" || refs.current.suspended) return;
    changePhase(m.phase === "playing" ? "paused" : "playing");
  }, [changePhase]);
  const restart = () => {
    model.current = fresh();
    setScore([0, 0]);
    setPoint(null);
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
      // Both phones play at once; alone, only the chosen player's phone.
      two ? null : roster[0] || null,
    );
    room.handler.current = (e) => {
      const player = two ? roster.indexOf(e.player ?? "") : 0;
      if (player < 0 || player > 1 || refs.current.suspended || !Number.isFinite(e.value)) return;
      const pointing = model.current.pointing[player];
      if (e.action === "aim") pointing.x = e.value;
      if (e.action === "move") pointing.y = e.value;
      if (e.action === "throw") toggle();
    };
    return () => {
      room.handler.current = null;
    };
  }, [room.publish, room.handler, phase, two, roster, toggle]);
  useEffect(() => {
    const blur = () => {
      if (model.current.phase === "playing") changePhase("paused");
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [changePhase]);
  const finished = phase === "finished";
  useEffect(() => {
    if (finished) return;
    const parent = container.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setFallback(true);
      return;
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setScissorTest(true);
    renderer.setClearColor(0xd9eee9);
    renderer.domElement.setAttribute("aria-hidden", "true");
    parent.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const ripples = contactRipples(scene, 0.07);
    const trail = motionTrail(scene, BALL * 0.7, 0xffe4a0);
    // A quiet ring at the receiving paddle plane makes depth legible. It is
    // a real flight prediction, so matching it reliably returns the ball.
    const catchRing = new THREE.Mesh(
      new THREE.RingGeometry(PADDLE * 0.85, PADDLE * 0.94, 48),
      new THREE.MeshBasicMaterial({ color: 0xffe4a0, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }),
    );
    scene.add(catchRing);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb7c9c4, 2.3));
    // Light from almost straight above, so the ball's shadow on the table
    // shows where it is.
    const sun = new THREE.DirectionalLight(0xffffff, 2.3);
    sun.position.set(-0.6, 6, 0.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -2.4, right: 2.4, top: 3.2, bottom: -3.2 });
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    const material = (color: THREE.ColorRepresentation, roughness = 0.5) =>
      new THREE.MeshStandardMaterial({ color, roughness });
    const box = (
      w: number,
      h: number,
      d: number,
      color: THREE.ColorRepresentation,
      x: number,
      y: number,
      z: number,
    ) => {
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.18), material(color));
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    };
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), material(0x9dbcb5, 0.9));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR;
    floor.receiveShadow = true;
    scene.add(floor);
    // Tabletop markings, drawn once: the white edge lines and the center
    // line. The canvas top is the -z end.
    const surface = document.createElement("canvas");
    const px = 512 / (2 * HW);
    surface.width = 512;
    surface.height = Math.round(2 * HL * px);
    const draw = surface.getContext("2d")!;
    draw.fillStyle = "#3f8f88";
    draw.fillRect(0, 0, surface.width, surface.height);
    draw.strokeStyle = "#f4fbf8";
    draw.lineWidth = 0.02 * px * 2;
    draw.strokeRect(0, 0, surface.width, surface.height);
    draw.lineWidth = 0.003 * px * 2;
    draw.beginPath();
    draw.moveTo(256, 0);
    draw.lineTo(256, surface.height);
    draw.stroke();
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * HW, 2 * HL),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.4 }),
    );
    top.rotation.x = -Math.PI / 2;
    top.receiveShadow = true;
    scene.add(top);
    box(2 * HW, 0.03, 2 * HL, 0x29465a, 0, -0.016, 0);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        box(0.05, -FLOOR - 0.03, 0.05, 0x29465a, sx * (HW - 0.15), (FLOOR - 0.03) / 2, sz * (HL - 0.25));
    // The net: a see-through mesh with a white band along the top.
    const weave = document.createElement("canvas");
    weave.width = weave.height = 64;
    const thread = weave.getContext("2d")!;
    thread.strokeStyle = "#f4fbf8";
    thread.lineWidth = 3;
    thread.strokeRect(0, 0, 64, 64);
    const netTexture = new THREE.CanvasTexture(weave);
    netTexture.colorSpace = THREE.SRGBColorSpace;
    netTexture.wrapS = netTexture.wrapT = THREE.RepeatWrapping;
    netTexture.repeat.set(48, 5);
    netTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const net = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * HW + 0.3, NET),
      new THREE.MeshStandardMaterial({
        map: netTexture,
        transparent: true,
        alphaTest: 0.1,
        opacity: 0.85,
        side: THREE.DoubleSide,
      }),
    );
    net.position.y = NET / 2;
    scene.add(net);
    box(2 * HW + 0.3, 0.02, 0.012, 0xf4fbf8, 0, NET - 0.01, 0);
    for (const sx of [-1, 1]) box(0.025, NET + 0.02, 0.04, 0x29465a, sx * (HW + 0.15), NET / 2, 0);
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xfffdf5, emissive: 0xfff3d6, emissiveIntensity: 0.25, roughness: 0.3 }),
    );
    ball.castShadow = true;
    scene.add(ball);
    // Paddles stand facing down the table. Each player's own paddle is
    // see-through in their view, so it never hides the incoming ball.
    const paddles = COLORS.map((color) => {
      const group = new THREE.Group();
      const rubber = new THREE.MeshStandardMaterial({ color, roughness: 0.55, transparent: true });
      const wood = new THREE.MeshStandardMaterial({ color: 0xd9b995, roughness: 0.6, transparent: true });
      const blade = new THREE.Mesh(new THREE.CylinderGeometry(PADDLE, PADDLE, 0.014, 48), rubber);
      blade.rotation.x = Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(PADDLE, 0.008, 8, 48), wood);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.11, 0.024), wood);
      handle.position.y = -PADDLE - 0.05;
      for (const mesh of [blade, rim, handle]) mesh.castShadow = true;
      group.add(blade, rim, handle);
      scene.add(group);
      return { group, materials: [rubber, wood] };
    });
    // One camera behind each end, looking down the table at the opponent.
    const cameras = [1, -1].map((side) => {
      const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 40);
      camera.userData.side = side;
      return camera;
    });
    const aimCamera = (camera: THREE.PerspectiveCamera, aspect: number) => {
      const side = camera.userData.side as number;
      // Narrow views pull back so the paddle's full reach stays in frame.
      const back = Math.max(1.75, (REACH_X + 0.1) / (Math.tan((23 * Math.PI) / 180) * aspect));
      camera.aspect = aspect;
      camera.position.set(0, 0.75 + back * 0.6, side * (PLANE + back));
      camera.lookAt(0, 0.08, side * 0.2);
      camera.updateProjectionMatrix();
    };
    let width = 0,
      height = 0;
    const resize = () => {
      width = parent.clientWidth;
      height = parent.clientHeight;
      renderer.setSize(width, height, false);
      const views = refs.current.two ? 2 : 1;
      cameras.forEach(camera => aimCamera(camera, width / views / Math.max(1, height)));
      cameras[0].updateMatrixWorld();
      // Aim at the rubber face, not the handle below it.
      const origin = new THREE.Vector3(0, (LOW + HIGH) / 2, PLANE + .01).project(cameras[0]);
      parent.dataset.phoneOriginX = String((origin.x + 1) / 2);
      parent.dataset.phoneOriginY = String((1 - origin.y) / 2);
      parent.dataset.phoneViews = String(views);
    };
    const pointers = cameras.map((camera, i) => planePointer(camera,
      new THREE.Vector3(0, (LOW + HIGH) / 2, sideOf(i) * (PLANE + .01)),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -sideOf(i) * (PLANE + .01))));
    const pointPhone = (i: number) => {
      const p = pointers[i](model.current.pointing[i].x, model.current.pointing[i].y);
      return { x: clamp(p.x, -REACH_X, REACH_X), y: clamp(p.y, LOW, HIGH) };
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    resize();
    // Sends the ball from the player's paddle to bounce once on the far half.
    // Off-center hits angle it away; hits high on the paddle land deep. The
    // longer the rally, the faster it goes.
    const launch = (player: number, dx: number, dy: number, serve: boolean) => {
      const m = model.current;
      const b = m.ball;
      const side = sideOf(player);
      const paddle = m.paddles[player];
      const bx = clamp(b.x * 0.35 + (dx / REACH) * HW * 0.8 + paddle.vx * 0.06, -HW * 0.85, HW * 0.85);
      const depth = clamp(0.5 + 0.3 * (dy / REACH) + (Math.random() - 0.5) * 0.16, 0.25, 0.9);
      const bz = -side * HL * depth;
      const speed = Math.min(9.5, (serve ? 3.6 : 4.4) + m.rally * 0.32) * (refs.current.two ? 1 : opponents[refs.current.difficulty].ballSpeed);
      let t = Math.hypot(bx - b.x, bz - b.z) / speed;
      let vy = 0;
      // Lob it higher until it clears the net and the near edge of the table.
      for (let i = 0; i < 60; i++) {
        vy = (BALL - b.y + 0.5 * G * t * t) / t;
        const vz = (bz - b.z) / t;
        const at = (z: number) => {
          const s = (z - b.z) / vz;
          return b.y + vy * s - 0.5 * G * s * s;
        };
        if (at(0) > NET + BALL + 0.04 && at(side * HL) > BALL + 0.02) break;
        t *= 1.06;
      }
      b.vx = (bx - b.x) / t;
      b.vy = vy;
      b.vz = (bz - b.z) / t;
      m.toward = 1 - player;
      m.rally++;
      const prediction = { ...b };
      const receivingSide = sideOf(m.toward);
      for (let i = 0; i < 2400 && receivingSide * prediction.z < PLANE; i++) fly(prediction);
      m.intercept = { x: prediction.x, y: prediction.y };
      if (!refs.current.two && m.toward === 1) planComputer();
    };
    // The computer works out where the ball will reach its paddle, then
    // misjudges by a little more the longer the rally goes.
    const planComputer = () => {
      const m = model.current;
      const skill = opponents[refs.current.difficulty];
      m.cpuReactAt = m.time + skill.reaction;
      const miss = Math.random() ** 1.6 * (skill.rallyError + skill.rallyFatigue * m.rally);
      const angle = Math.random() * Math.PI * 2;
      m.cpuAim = {
        x: clamp(m.intercept.x + Math.cos(angle) * miss, -REACH_X, REACH_X),
        y: clamp(m.intercept.y + Math.sin(angle) * miss, LOW, HIGH),
      };
    };
    const fly = (b: Ball) => {
      b.vy -= G * STEP;
      b.x += b.vx * STEP;
      b.y += b.vy * STEP;
      b.z += b.vz * STEP;
      if (b.vy < 0 && b.y < BALL && b.y > -BALL && Math.abs(b.x) < HW && Math.abs(b.z) < HL) {
        b.y = BALL;
        b.vy = -b.vy * 0.88;
        return true;
      }
      if (b.y < FLOOR + BALL) {
        b.y = FLOOR + BALL;
        b.vy = -b.vy * 0.5;
        b.vx *= 0.7;
        b.vz *= 0.7;
      }
      return false;
    };
    const blocked = (player: number) => {
      const m = model.current;
      ripples.hit(m.ball.x, 0.008, m.ball.z, m.time, COLORS[player]);
      const r = refs.current;
      chime(r.settings.sound);
      if (r.two) room.buzz(35, r.names[player]);
      else if (player === 0) room.buzz(35);
    };
    const scored = (player: number, now: number) => {
      const m = model.current;
      m.scores[player]++;
      setScore([...m.scores]);
      const r = refs.current;
      chime(r.settings.sound, r.two || player === 0);
      if (m.scores[player] >= WIN) {
        changePhase("finished");
        r.names.forEach((name, i) => {
          if (r.two || i === 0) r.onComplete(m.scores[i], name);
        });
        return;
      }
      setPoint(player);
      m.waiting = true;
      m.serveAt = now + 1200;
      m.missedAt = 0;
      m.rally = 0;
    };
    const physics = () => {
      const m = model.current;
      const playing = m.phase === "playing" && !refs.current.suspended && !document.hidden;
      if (playing) m.time += STEP * 1000;
      const now = m.time;
      const two = refs.current.two;
      m.targets[0] = pointPhone(0);
      if (two) m.targets[1] = pointPhone(1);
      else if (playing)
        // Back to the middle while the ball heads away.
        m.targets[1] = m.toward === 1 && !m.waiting
          ? now >= m.cpuReactAt ? m.cpuAim : m.targets[1]
          : { x: 0, y: 0.3 };
      m.paddles.forEach((paddle, i) => {
        const target = m.targets[i];
        const limit = (!two && i === 1 ? opponents[refs.current.difficulty].rallySpeed : PADDLE_SPEED) * STEP;
        let dx = target.x - paddle.x,
          dy = target.y - paddle.y;
        const follow = followAmount(STEP, !two && i === 1 ? opponents[refs.current.difficulty].response : PHONE_RESPONSE);
        dx *= follow;
        dy *= follow;
        const d = Math.hypot(dx, dy);
        if (d > limit) {
          dx *= limit / d;
          dy *= limit / d;
        }
        paddle.x += dx;
        paddle.y += dy;
        // Smoothed, since the aim only updates once a frame.
        paddle.vx = paddle.vx * 0.9 + (dx / STEP) * 0.1;
        paddle.vy = paddle.vy * 0.9 + (dy / STEP) * 0.1;
      });
      if (!playing) return;
      const b = m.ball;
      if (m.waiting) {
        const server = serverFor(m.scores);
        const paddle = m.paddles[server];
        // Held up in front of the server's paddle until it's served.
        b.x = paddle.x;
        b.y = Math.max(0.2, paddle.y);
        b.z = sideOf(server) * (PLANE - 0.06);
        if (!m.serveAt) m.serveAt = now + 900;
        if (now < m.serveAt) return;
        m.waiting = false;
        launch(server, (Math.random() - 0.5) * REACH, 0, true);
        return;
      }
      if (fly(b)) ripples.hit(b.x, 0.008, b.z, now, 0xffe5a2);
      const side = sideOf(m.toward);
      if (!m.missedAt && side * b.z >= PLANE) {
        const paddle = m.paddles[m.toward];
        const dx = b.x - paddle.x,
          dy = b.y - paddle.y;
        if (Math.hypot(dx, dy) < REACH) {
          b.z = side * PLANE;
          blocked(m.toward);
          launch(m.toward, dx, dy, false);
        } else m.missedAt = now;
      }
      // A missed ball flies on past for a moment before the point is given.
      if (m.missedAt && now - m.missedAt > 650) scored(1 - m.toward, now);
    };
    let raf = 0,
      last = performance.now(),
      carry = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      carry += Math.min((now - last) / 1000, 0.05);
      last = now;
      while (carry >= STEP) {
        carry -= STEP;
        physics();
      }
      const m = model.current;
      ripples.update(m.time, refs.current.settings.motion);
      ball.position.set(m.ball.x, m.ball.y, m.ball.z);
      ball.visible = m.phase !== "ready" || !m.waiting;
      trail.update(ball.position, m.time, !refs.current.settings.motion && m.phase === "playing" && !m.waiting && !m.missedAt);
      catchRing.position.set(m.intercept.x, m.intercept.y, sideOf(m.toward) * (PLANE - 0.015));
      m.paddles.forEach((paddle, i) => {
        const p = paddles[i].group;
        p.position.set(paddle.x, paddle.y, sideOf(i) * (PLANE + 0.01));
        // Tipped a little toward the table, as it would be held.
        p.rotation.set(sideOf(i) * -0.12, 0, clamp(-paddle.vx * 0.04, -0.3, 0.3));
      });
      const views = refs.current.two ? 2 : 1;
      const w = width / views;
      cameras.slice(0, views).forEach((camera, i) => {
        catchRing.visible = m.phase === "playing" && !m.waiting && !m.missedAt && m.toward === i;
        const left = Math.round(i * w);
        const right = Math.round((i + 1) * w);
        paddles.forEach(({ materials }, j) =>
          materials.forEach((mat, materialIndex) => (mat.opacity = j === i ? materialIndex === 0 ? 0.5 : 0.85 : 1)),
        );
        renderer.setViewport(left, 0, right - left, height);
        renderer.setScissor(left, 0, right - left, height);
        renderer.render(scene, camera);
      });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          (object.material as THREE.Material).dispose();
        }
      });
      texture.dispose();
      netTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [finished, room.buzz, changePhase]);
  useEffect(() => {
    if (point === null) return;
    const clear = setTimeout(() => setPoint(null), 1100);
    return () => clearTimeout(clear);
  }, [point]);
  if (finished) {
    const winner = score[0] >= WIN ? 0 : 1;
    if (!two)
      return (
        <ResultPanel
          title={winner === 0 ? "You won." : "The computer won."}
          description={`Final score ${score[0]}–${score[1]}.`}
          score={score[0]}
          max={WIN}
          onRestart={restart}
          onExit={onExit}
        />
      );
    return (
      <div className="round-finished">
        <h2 tabIndex={-1}>{names[winner]} wins.</h2>
        <p>
          Final score {score[0]}–{score[1]}.
        </p>
        <div className="finish-scores">
          {[winner, 1 - winner].map((i) => (
            <div key={i}>
              <span>{names[i]}</span>
              <strong>{score[i]}</strong>
            </div>
          ))}
        </div>
        <div className="finish-actions">
          <button className="primary-button" onClick={restart}>
            <RotateCcw size={17} /> Play again
          </button>
          <button className="secondary-button" onClick={onExit}>
            Choose another game <ArrowRight size={17} />
          </button>
        </div>
        <p className="saved-note">
          <Check size={15} /> Saved to Scores
        </p>
      </div>
    );
  }
  const views = two ? [0, 1] : [0];
  const server = serverFor(score);
  return (
    <div className={`rally-game ${two ? "rally-split" : ""}`}>
      <Hud slot="start">
        <strong className="hud-score rally-hud-score">
          <small>{two ? names[0] : "You"}</small>
          <span>{score[0]}</span>
        </strong>
      </Hud>
      <Hud slot="end">
        <strong className="hud-score rally-hud-score">
          <span>{score[1]}</span>
          <small>{names[1]}</small>
        </strong>
      </Hud>
      <div
        className="court-wrap rally-arena"
        ref={container}
        role="img"
        aria-label={`Table tennis${two ? `, split screen: ${names[0]} on the left, ${names[1]} on the right` : ""}. ${names[0]} ${score[0]}, ${names[1]} ${score[1]}.`}
      >
        {fallback && (
          <p className="rally-fallback">
            Table Tennis needs 3D graphics, which this browser has turned off.
          </p>
        )}
        {views.map((i) => (
          <div className="rally-view" key={i}>
            <span className="rally-tag">
              <span style={{ background: COLORS[i] }} />
              {two ? `Player ${i + 1} · ${names[i]}` : names[i]}
              {server === i && <small>Serve</small>}
            </span>
            {point !== null && (
              <strong className="rally-point">
                {two
                  ? point === i ? "Point!" : `${names[point]} scores`
                  : point === 0 ? "Point!" : "Computer scores"}
              </strong>
            )}
          </div>
        ))}
        {phase !== "playing" && (
          <div className="court-overlay">
            <h2 tabIndex={-1}>
              {phase === "paused" ? "Paused" : two ? "Ready?" : `${names[0]}, ready?`}
            </h2>
            <ReadyInstruction game="rally" paused={phase === "paused"} />
          </div>
        )}
      </div>
      <GameInstruction game="rally">{!two && `${difficulty} · `}Point to move · Meet the ball at the gold ring · First to 7</GameInstruction>
    </div>
  );
}
