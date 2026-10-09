import { motionFrames } from "./render-motion";
import { opponents, type Difficulty } from "../lib/difficulty";
import { PLAYER_COLORS } from "../lib/player-colors";
import { planePointer } from "./phone-projection";
import { ReadyInstruction, ReadyTitle } from "../components/GameInstruction";
import { FinishActions, FinishScores } from "../components/ResultPanel";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { contactRipples, motionTrail, studioLighting, tableContactShadow } from "./table-effects";
import { PHONE_RESPONSE, followAmount, strikePuck } from "../lib/game-physics.mjs";
import { chime, formatScore, type Settings } from "../lib/store";
import type { useRoom } from "../lib/room";
import { Hud } from "../components/GameHud";
import "./hockey.css";
// Table units: x across, z along. Player 1 defends the +z end, Player 2 (or
// the computer) the -z end.
const HW = 3;
const HL = 5;
const GOAL = 1.15;
const PUCK = 0.28;
const MALLET = 0.44;
const RAIL = 0.42;
const WIN = 5;
const MAX_PUCK = 19;
const MALLET_SPEED = 80;
const STEP = 1 / 240;
// Deeper than the table art, so mallets and paddles stand out under the lights.
const COLORS = PLAYER_COLORS.slice(0, 2);
type Phase = "ready" | "playing" | "paused" | "finished";
type Body = { x: number; z: number; vx: number; vz: number };
// Phone pointing (x -1..1 left/right, y -1 up..1 down) as a spot in that
// player's half. Each player sees the table from their own end, so pointing
// up always moves the mallet toward the other player.
const fromPhone = (player: number, x: number, y: number) => {
  const side = player === 0 ? 1 : -1;
  const depth = (Math.max(-1, Math.min(1, y)) + 1) / 2;
  return {
    x: side * Math.max(-1, Math.min(1, x)) * (HW - MALLET),
    z: side * (MALLET + depth * (HL - 2 * MALLET)),
  };
};
// Two players face off at center; alone, the player serves first.
const fresh = (two: boolean) => ({
  phase: "ready" as Phase,
  time: 0,
  puck: { x: 0, z: two ? 0 : 1.8, vx: 0, vz: 0 },
  mallets: [
    { x: 0, z: HL - 1.2, vx: 0, vz: 0 },
    { x: 0, z: -(HL - 1.2), vx: 0, vz: 0 },
  ] as Body[],
  // Where each phone points; the computer's mallet sets its own target.
  pointing: [
    { x: 0, y: 0.5 },
    { x: 0, y: 0.5 },
  ],
  targets: [fromPhone(0, 0, 0.5), fromPhone(1, 0, 0.5)],
  scores: [0, 0],
  serveUntil: 0,
  hitAt: [0, 0],
  cpuNextAt: 0,
});
export default function AirHockey({
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
  const names = [roster[0], two ? roster[1] : "Bot 1"];
  const container = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState([0, 0]);
  const [goal, setGoal] = useState<number | null>(null);
  const [fallback, setFallback] = useState(false);
  const model = useRef(fresh(two));
  const refs = useRef({ settings, onComplete, names, two, suspended, difficulty });
  refs.current = { settings, onComplete, names, two, suspended, difficulty };
  const changePhase = useCallback((next: Phase) => {
    model.current.phase = next;
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
    model.current = fresh(two);
    setScore([0, 0]);
    setGoal(null);
    setPhase("ready");
  };
  useEffect(() => {
    room.publish(
      "hockey",
      phase !== "finished",
      phase === "finished"
        ? "Game complete"
        : phase === "playing"
          ? "Game on"
          : phase === "paused"
            ? "Paused"
            : "Ready to face off",
      null,
      // Both phones play at once; alone, only the chosen player's phone.
      two ? null : roster[0] || null,
    );
    room.handler.current = (e) => {
      // The big screen's own resume (after a menu or a phone's return) has no player.
      const player = two && e.player !== undefined ? roster.indexOf(e.player) : 0;
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
    renderer.toneMappingExposure = 1;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    // Both views share one world-space shadow map. Render it once per frame.
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setScissorTest(true);
    renderer.setClearColor(0xe7eff3);
    renderer.domElement.setAttribute("aria-hidden", "true");
    parent.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const disposeStudio = studioLighting(renderer, scene);
    scene.background = new THREE.Color(0xe7eff3);
    const ripples = contactRipples(scene, 0.3);
    const trail = motionTrail(scene, PUCK * 0.72, 0x82b4cb);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb7c6d5, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-4, 12, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 8, bottom: -8 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = .015;
    sun.shadow.radius = 5;
    scene.add(sun);
    const material = (color: THREE.ColorRepresentation, roughness = 0.45) =>
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
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    };
    // Playing surface, drawn once: center line and circle, goal creases, and
    // the faint grid of air holes. The canvas top is the -z end.
    const surface = document.createElement("canvas");
    const px = 512 / (2 * HW);
    surface.width = 512;
    surface.height = Math.round(2 * HL * px);
    const draw = surface.getContext("2d")!;
    const ice = draw.createLinearGradient(0, 0, surface.width, surface.height);
    ice.addColorStop(0, "#ffffff"); ice.addColorStop(1, "#e4f3f6");
    draw.fillStyle = ice;
    draw.fillRect(0, 0, surface.width, surface.height);
    draw.fillStyle = "#a4c8d24a";
    for (let y = 14; y < surface.height; y += 22)
      for (let x = 14; x < surface.width; x += 22) {
        draw.beginPath();
        draw.arc(x, y, 1.1, 0, Math.PI * 2);
        draw.fill();
      }
    const mid = surface.height / 2;
    draw.strokeStyle = "#ee8276";
    draw.lineWidth = 4;
    draw.beginPath();
    draw.moveTo(0, mid);
    draw.lineTo(surface.width, mid);
    draw.stroke();
    draw.lineWidth = 4;
    draw.beginPath();
    draw.arc(256, mid, 1.0 * px, 0, Math.PI * 2);
    draw.stroke();
    draw.strokeStyle = "#6baec2";
    draw.lineWidth = 5;
    for (const end of [0, surface.height]) {
      draw.beginPath();
      draw.arc(256, end, (GOAL + 0.35) * px, 0, Math.PI * 2);
      draw.fillStyle = end === 0 ? "#58b6d218" : "#fa887818"; draw.fill(); draw.stroke();
    }
    draw.lineWidth = 4;
    for (const y of [mid - HL * 0.5 * px, mid + HL * 0.5 * px]) {
      draw.beginPath();
      draw.moveTo(0, y);
      draw.lineTo(surface.width, y);
      draw.stroke();
    }
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * HW, 2 * HL),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.25 }),
    );
    table.rotation.x = -Math.PI / 2;
    table.receiveShadow = true;
    scene.add(table);
    // A grounded toy table, with soft feet and colored rail inlays.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), material(0xe7eff3, 0.95));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.65;
    floor.receiveShadow = true;
    scene.add(floor);
    const disposeContactShadow = tableContactShadow(scene, 11, 17, -1.645);
    for (const x of [-1, 1]) for (const z of [-1, 1])
      box(0.65, 0.6, 0.65, 0x678ea5, x * 2.4, -1.35, z * 4);
    box(2 * HW + 2 * RAIL, 1.1, 2 * HL + 2 * RAIL, 0xc9dce2, 0, -0.56, 0);
    for (const side of [-1, 1]) {
      box(RAIL, 0.3, 2 * HL + 2 * RAIL, 0x426171, side * (HW + RAIL / 2), 0.15, 0);
      box(0.1, 0.025, 2 * HL - 0.5, COLORS[side === 1 ? 0 : 1], side * (HW + RAIL / 2), 0.31, 0);
      const length = HW - GOAL + RAIL;
      for (const across of [-1, 1])
        box(length, 0.3, RAIL, 0x426171, across * (GOAL + length / 2), 0.15, side * (HL + RAIL / 2));
      // The goal slot, with the defending player's color on its lip.
      box(2 * GOAL, 0.04, RAIL, 0x14232e, 0, 0.01, side * (HL + RAIL / 2));
      box(2 * GOAL, 0.06, 0.08, COLORS[side === 1 ? 0 : 1], 0, 0.03, side * (HL + 0.04));
    }
    const shaded = (mesh: THREE.Mesh) => {
      mesh.castShadow = true;
      return mesh;
    };
    const puck = new THREE.Group();
    puck.add(
      shaded(new THREE.Mesh(new THREE.CylinderGeometry(PUCK, PUCK, 0.1, 40), material(0x243b4d, 0.28))),
    );
    const ring = new THREE.Mesh(new THREE.TorusGeometry(PUCK * 0.62, 0.025, 8, 40), material(0xd9f4f7));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    puck.add(ring);
    puck.position.y = 0.05;
    scene.add(puck);
    const mallets = COLORS.map((color) => {
      const group = new THREE.Group();
      const body = new THREE.MeshPhysicalMaterial({ color, roughness: .3, clearcoat: .45, clearcoatRoughness: .35 });
      const base = shaded(new THREE.Mesh(new THREE.CylinderGeometry(MALLET * 0.94, MALLET, 0.16, 48), body));
      base.position.y = 0.08;
      const lip = new THREE.Mesh(new THREE.TorusGeometry(MALLET * 0.8, 0.035, 8, 48), material(0xffffff, 0.3));
      lip.rotation.x = Math.PI / 2;
      lip.position.y = 0.165;
      const handle = shaded(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.34, 32), body));
      handle.position.y = 0.33;
      const knob = shaded(new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 16), body));
      knob.position.y = 0.55;
      group.add(base, lip, handle, knob);
      // An inset rubber bumper and grip collar separate the molded pieces.
      const bumper = new THREE.Mesh(new THREE.TorusGeometry(MALLET * .97, .024, 8, 48), material(0x294958, .8));
      bumper.rotation.x = Math.PI / 2; bumper.position.y = .04;
      const collar = new THREE.Mesh(new THREE.TorusGeometry(.16, .015, 8, 32), material(0xffffff, .55));
      collar.rotation.x = Math.PI / 2; collar.position.y = .36;
      group.add(bumper, collar);
      scene.add(group);
      return group;
    });
    // One camera behind each end, looking down the table at the far goal.
    const cameras = [1, -1].map((side) => {
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
      camera.userData.side = side;
      return camera;
    });
    const aimCamera = (camera: THREE.PerspectiveCamera, aspect: number) => {
      const side = camera.userData.side as number;
      // Narrow views pull back so the whole table width stays in frame.
      const pull = Math.max(1, 0.95 / aspect);
      camera.aspect = aspect;
      camera.position.set(0, 10.2 * pull, side * (HL + 5.4 * pull));
      camera.lookAt(0, 0, side * 0.6);
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
      // The demo cursor follows the disk touching the puck, below the handle.
      const origin = new THREE.Vector3(0, .08, HL / 2).project(cameras[0]);
      parent.dataset.phoneOriginX = String((origin.x + 1) / 2);
      parent.dataset.phoneOriginY = String((1 - origin.y) / 2);
      parent.dataset.phoneViews = String(views);
    };
    const pointers = cameras.map((camera, i) => planePointer(camera,
      new THREE.Vector3(0, .08, (i === 0 ? 1 : -1) * HL / 2),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -.08)));
    const pointPhone = (i: number) => {
      const p = pointers[i](model.current.pointing[i].x, model.current.pointing[i].y);
      const side = i === 0 ? 1 : -1;
      return { x: THREE.MathUtils.clamp(p.x, -HW + MALLET, HW - MALLET),
        z: side * THREE.MathUtils.clamp(side * p.z, MALLET, HL - MALLET) };
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    resize();
    const hit = (player: number, now: number) => {
      const m = model.current;
      if (now - m.hitAt[player] < 150) return;
      m.hitAt[player] = now;
      ripples.hit(m.puck.x, 0.012, m.puck.z, now, COLORS[player]);
      const r = refs.current;
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
      setGoal(player);
      // The player who was scored on serves from their own half.
      const side = player === 0 ? -1 : 1;
      m.puck = { x: 0, z: side * 1.8, vx: 0, vz: 0 };
      m.serveUntil = now + 1100;
    };
    // The computer guards its goal until the puck comes into its half, then
    // gets behind it and pushes it toward Player 1's goal.
    const computer = () => {
      const m = model.current;
      const { puck: p, mallets: [, cpu] } = m;
      const skill = opponents[refs.current.difficulty];
      if (p.z > 0 || p.vz > 7) {
        const ahead = Math.max(0.2, Math.min(1, (p.z + HL) / HL));
        const travel = p.vz < -.01 ? Math.max(0, (-(HL - 1.1) - p.z) / p.vz) : 0;
        const span = HW - PUCK;
        // Fold the projected shot through rail bounces before guarding the goal.
        const raw = p.x + p.vx * travel;
        const folded = ((raw + span) % (4 * span) + 4 * span) % (4 * span);
        const intercept = folded < 2 * span ? folded - span : 3 * span - folded;
        return { x: THREE.MathUtils.lerp(p.x * .55 * ahead, intercept, skill.prediction), z: -(HL - 1.1) };
      }
      if (cpu.z < p.z - 0.25) return { x: p.x, z: p.z + 0.4 };
      // In front of the puck: swing around behind it first.
      return {
        x: p.x + (cpu.x > p.x ? 1 : -1) * (PUCK + MALLET + 0.25),
        z: p.z - 1.1,
      };
    };
    const physics = () => {
      const m = model.current;
      if (refs.current.suspended || document.hidden || m.phase === "paused" || m.phase === "finished") return;
      const playing = m.phase === "playing";
      if (playing) m.time += STEP * 1000;
      const now = m.time;
      m.targets[0] = pointPhone(0);
      if (refs.current.two)
        m.targets[1] = pointPhone(1);
      else if (playing && now >= m.cpuNextAt) {
        const skill = opponents[refs.current.difficulty];
        m.cpuNextAt = now + skill.reaction;
        const spot = computer();
        spot.x += (Math.random() * 2 - 1) * skill.hockeyError;
        m.targets[1] = {
          x: Math.max(-(HW - MALLET), Math.min(HW - MALLET, spot.x)),
          z: Math.max(-(HL - MALLET), Math.min(-MALLET, spot.z)),
        };
      }
      m.mallets.forEach((mallet, i) => {
        const target = m.targets[i];
        const limit = (!refs.current.two && i === 1 ? opponents[refs.current.difficulty].hockeySpeed : MALLET_SPEED) * STEP;
        let dx = target.x - mallet.x,
          dz = target.z - mallet.z;
        const follow = followAmount(STEP, i === 1 && !refs.current.two ? opponents[refs.current.difficulty].response : PHONE_RESPONSE);
        dx *= follow;
        dz *= follow;
        const d = Math.hypot(dx, dz);
        if (d > limit) {
          dx *= limit / d;
          dz *= limit / d;
        }
        mallet.x += dx;
        mallet.z += dz;
        mallet.vx = dx / STEP;
        mallet.vz = dz / STEP;
      });
      if (!playing || now < m.serveUntil) return;
      const p = m.puck;
      p.x += p.vx * STEP;
      p.z += p.vz * STEP;
      const drag = Math.exp(-0.32 * STEP);
      p.vx *= drag;
      p.vz *= drag;
      m.mallets.forEach((mallet, i) => {
        if (strikePuck(p, mallet, PUCK + MALLET, i === 0 ? 1 : -1)) hit(i, now);
      });
      const speed = Math.hypot(p.vx, p.vz);
      if (speed > MAX_PUCK) {
        p.vx *= MAX_PUCK / speed;
        p.vz *= MAX_PUCK / speed;
      }
      if (Math.abs(p.x) > HW - PUCK) {
        p.x = Math.sign(p.x) * (HW - PUCK);
        if (Math.sign(p.vx) === Math.sign(p.x)) p.vx = -p.vx * 0.9;
        ripples.hit(p.x, 0.012, p.z, now, 0x73b6d4);
      }
      if (Math.abs(p.z) > HL - PUCK) {
        if (Math.abs(p.x) < GOAL - PUCK * 0.5) {
          // Into the goal mouth: a goal once it's all the way in.
          if (Math.abs(p.z) > HL + PUCK) scored(p.z > 0 ? 1 : 0, now);
        } else {
          p.z = Math.sign(p.z) * (HL - PUCK);
          if (Math.sign(p.vz) === Math.sign(p.z)) p.vz = -p.vz * 0.9;
        }
      }
    };
    const motion = motionFrames<Body>(["x", "z"]);
    let raf = 0,
      last = performance.now(),
      carry = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) { last = now; carry = 0; return; }
      carry += Math.min((now - last) / 1000, 0.05);
      last = now;
      while (carry >= STEP) {
        carry -= STEP;
        motion.capture([model.current.puck, ...model.current.mallets]);
        physics();
      }
      const m = model.current;
      ripples.update(m.time, refs.current.settings.motion);
      const alpha = m.phase === "playing" && !refs.current.suspended ? carry / STEP : 1;
      const bodies = motion.sample([m.puck, ...m.mallets], alpha, (p, before) => Math.hypot(p.x - before.x, p.z - before.z) > 1);
      puck.position.x = bodies[0].x;
      puck.position.z = bodies[0].z;
      // A conceded puck waits off the table until the serve.
      puck.visible = m.time >= m.serveUntil || m.phase !== "playing";
      trail.update(puck.position, m.time, !refs.current.settings.motion && m.phase === "playing" && puck.visible && Math.hypot(m.puck.vx, m.puck.vz) > 3);
      mallets.forEach((mallet, i) => mallet.position.set(bodies[i + 1].x, 0, bodies[i + 1].z));
      renderer.shadowMap.needsUpdate = true;
      const views = refs.current.two ? 2 : 1;
      const w = width / views;
      cameras.slice(0, views).forEach((camera, i) => {
        const left = Math.round(i * w);
        const right = Math.round((i + 1) * w);
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
      disposeContactShadow();
      disposeStudio();
      texture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [finished, room.buzz, changePhase]);
  useEffect(() => {
    if (goal === null) return;
    const clear = setTimeout(() => setGoal(null), 1100);
    return () => clearTimeout(clear);
  }, [goal]);
  if (finished) {
    const winner = score[0] >= WIN ? 0 : 1;
    return (
      <div className="round-finished">
        <h2 tabIndex={-1}>{!two && winner === 0 ? "You win!" : `${names[winner]} wins!`}</h2>
        <FinishScores players={names.map((name, i) => ({ name, score: score[i], shown: score[i], label: formatScore("hockey", score[i]) }))} />
        <FinishActions onRestart={restart} onExit={onExit} />
      </div>
    );
  }
  const views = two ? [0, 1] : [0];
  return (
    <div className={`hockey-game ${two ? "hockey-split" : ""}`}>
      <Hud slot="start">
        <strong className="hud-score rally-hud-score">
          <small>{names[0]}</small>
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
        className="court-wrap hockey-arena"
        ref={container}
        role="img"
        aria-label={`Air hockey${two ? `, split screen: ${names[0]} on the left, ${names[1]} on the right` : ""}. ${names[0]} ${score[0]}, ${names[1]} ${score[1]}.`}
      >
        {fallback && (
          <p className="hockey-fallback">
            Air Hockey needs 3D graphics, which this browser has turned off.
          </p>
        )}
        {views.map((i) => (
          <div className="hockey-view" key={i}>
            <span className="hockey-tag">
              <span style={{ background: COLORS[i] }} />
              {names[i]}
            </span>
            {goal !== null && (
              <strong className="hockey-goal">
                {goal === i ? "Goal!" : `${names[goal]} scores!`}
              </strong>
            )}
          </div>
        ))}
        {phase !== "playing" && (
          <div className="court-overlay">
            <ReadyTitle paused={phase === "paused"} />
            <ReadyInstruction game="hockey" paused={phase === "paused"} />
          </div>
        )}
      </div>
    </div>
  );
}
