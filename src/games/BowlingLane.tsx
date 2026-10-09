import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
export type Line = { position: number; angle: number };
export type LaneAPI = {
  roll: (
    line: Line,
    power: number,
    spin: number,
    onDone: (pins: number[]) => void,
  ) => void;
};
// Throw physics from Wii Playground, scaled to this lane by pin spacing
// (theirs 0.305 m, ours 0.76 units) so lines land on the same pins.
const SCALE = 0.76 / 0.305;
const START_Z = 8;
const HEAD_PIN_Z = -7.6;
const PIN_RUN = START_Z - HEAD_PIN_Z;
const END_Z = -12;
const LANE_EDGE = 1.85;
const ballPath = ({ position, angle }: Line, power: number, spin: number) => {
  const clampUnit = (n: number) => Math.max(-1, Math.min(1, n));
  // Theirs: start ±0.4 m (max 0.45), angle ±3°, 4–9 m/s, hook 0.13 m/s² × spin.
  const startX = Math.max(
    -0.45 * SCALE,
    Math.min(0.45 * SCALE, clampUnit(position) * 0.4 * SCALE),
  );
  const slope =
    (Math.tan((clampUnit(angle) * 3 * Math.PI) / 180) * 15 * SCALE) / PIN_RUN;
  const toPins = 15 / (4 + Math.max(0, Math.min(1, power)) * 5);
  const hook = 0.13 * SCALE * clampUnit(spin);
  const speed = PIN_RUN / toPins;
  const xAt = (s: number) =>
    startX + slope * speed * s + 0.5 * hook * s * s;
  return { startX, slope, speed, xAt, toPins, impact: xAt(toPins) };
};
const pinLayout: [number, number][] = [];
for (let row = 0; row < 4; row++)
  for (let col = 0; col <= row; col++)
    pinLayout.push([(col - row / 2) * 0.76, -7.6 - row * 0.7]);
export const BowlingLane = forwardRef<
  LaneAPI,
  { line: Line; standing: number[]; reduced: boolean; suspended?: boolean }
>(function BowlingLane({ line, standing, reduced, suspended = false }, ref) {
  const paused = useRef(suspended);
  paused.current = suspended;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const container = useRef<HTMLDivElement>(null);
  const runtime = useRef<{
    roll: LaneAPI["roll"];
    aim: (line: Line) => void;
    reset: (ids: number[]) => void;
  } | null>(null);
  const [fallback, setFallback] = useState(false);
  const standingRef = useRef(standing);
  standingRef.current = standing;
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timeout.current) clearInterval(timeout.current);
    },
    [],
  );
  useImperativeHandle(
    ref,
    () => ({
      roll: (l, p, sp, cb) => {
        if (runtime.current) runtime.current.roll(l, p, sp, cb);
        else {
          const { impact } = ballPath(l, p, sp);
          const hits =
            Math.abs(impact) > LANE_EDGE
              ? []
              : standingRef.current.filter(
                  (id) => Math.abs(pinLayout[id][0] - impact) < 0.48 + p * 0.82,
                );
          let remaining = reducedRef.current ? 150 : 900;
          timeout.current = setInterval(() => {
            if (paused.current || document.hidden) return;
            remaining -= 50;
            if (remaining <= 0) {
              if (timeout.current) clearInterval(timeout.current);
              cb(hits);
            }
          }, 50);
        }
      },
    }),
    [reduced],
  );
  useEffect(() => {
    runtime.current?.aim(line);
  }, [line]);
  useEffect(() => {
    runtime.current?.reset(standing);
  }, [standing]);
  useEffect(() => {
    const parent = container.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setFallback(true);
      return;
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0xe9eef3);
    parent.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xe9eef3, 20, 46);
    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 70);
    camera.position.set(0, 9.2, 16.2);
    // Aim between the ball (z 8) and the pins (z ~-12) so both stay in frame.
    camera.lookAt(0, 0, 1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb7c6d5, 2.7));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(-5, 12, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 15;
    key.shadow.camera.bottom = -15;
    key.shadow.bias = -0.0006;
    scene.add(key);
    const material = (color: number, roughness = 0.5) =>
      new THREE.MeshStandardMaterial({ color, roughness });
    const cube = (
      w: number,
      h: number,
      d: number,
      mat: THREE.Material,
      x = 0,
      y = 0,
      z = 0,
    ) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      scene.add(m);
      return m;
    };
    cube(200, 0.2, 200, material(0xe9eef3), 0, -0.44, 0);
    cube(3.9, 0.25, 25, material(0xe7cfa8, 0.26), 0, -0.12, -0.5);
    const lineMat = material(0xb89a73, 0.4);
    for (let i = -9; i <= 9; i++)
      cube(0.009, 0.003, 25, lineMat, i * 0.2, 0.008, -0.5);
    const side = material(0x9cabb8, 0.35);
    cube(0.5, 0.2, 25, side, -2.2, -0.1, -0.5);
    cube(0.5, 0.2, 25, side, 2.2, -0.1, -0.5);
    cube(0.13, 0.5, 25, material(0xd8e1e7), -2.54, 0.08, -0.5);
    cube(0.13, 0.5, 25, material(0xd8e1e7), 2.54, 0.08, -0.5);
    cube(3.9, 0.005, 0.09, material(0x6d8799), 0, 0.014, 7);
    for (let i = -3; i <= 3; i++) {
      const marker = new THREE.Mesh(
        new THREE.CircleGeometry(0.035, 12),
        material(0x8a735b),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(i * 0.4, 0.017, 2 + Math.abs(i) * 0.2);
      scene.add(marker);
    }
    const points = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.2, 0),
      new THREE.Vector2(0.25, 0.1),
      new THREE.Vector2(0.27, 0.28),
      new THREE.Vector2(0.23, 0.5),
      new THREE.Vector2(0.13, 0.74),
      new THREE.Vector2(0.1, 0.94),
      new THREE.Vector2(0.17, 1.07),
      new THREE.Vector2(0.175, 1.17),
      new THREE.Vector2(0.11, 1.28),
      new THREE.Vector2(0, 1.31),
    ];
    const pinGeometry = new THREE.LatheGeometry(points, 24);
    const pinMat = material(0xfffff7, 0.21);
    const stripeMat = material(0xe96551, 0.3);
    const pins = pinLayout.map(([x, z]) => {
      const group = new THREE.Group();
      const body = new THREE.Mesh(pinGeometry, pinMat);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);
      [0.81, 0.91].forEach((y) => {
        const stripe = new THREE.Mesh(
          new THREE.CylinderGeometry(
            y === 0.81 ? 0.116 : 0.105,
            y === 0.81 ? 0.135 : 0.106,
            0.052,
            20,
          ),
          stripeMat,
        );
        stripe.position.y = y;
        group.add(stripe);
      });
      group.position.set(x, 0, z);
      scene.add(group);
      return group;
    });
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 40, 32),
      new THREE.MeshPhysicalMaterial({
        color: 0x315ed3,
        roughness: 0.17,
        metalness: 0.12,
        clearcoat: 1,
      }),
    );
    ball.castShadow = true;
    ball.position.set(0, 0.35, 8);
    scene.add(ball);
    const holeMat = material(0x142952);
    [
      [-0.09, 0.12],
      [0.1, 0.1],
      [0.01, -0.07],
    ].forEach(([x, z]) => {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.046, 16), holeMat);
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(x, 0.342, z);
      ball.add(hole);
    });
    const guide = new THREE.Group();
    for (let i = 0; i < 10; i++) {
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.028, 12),
        material(0x5279c8),
      );
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(0, 0.03, 6 - i * 0.75);
      guide.add(dot);
    }
    scene.add(guide);
    const velocities = new Map<number, { x: number; z: number; r: number }>();
    let active: number[] = [...standingRef.current];
    let rolling = false;
    let rollTime = 0;
    let currentLine: Line = line;
    let path = ballPath(line, 0.5, 0);
    let gutter = 0;
    let power = 0.7;
    // How reliably a falling pin topples its neighbours on this roll.
    let carry = 1;
    let done: ((pins: number[]) => void) | null = null;
    const knocked = new Set<number>();
    // Each pin pair gets one chance to topple per roll, decided on first contact.
    const contacts = new Set<string>();
    const reset = (ids: number[]) => {
      active = [...ids];
      knocked.clear();
      velocities.clear();
      pins.forEach((pin, id) => {
        pin.visible = ids.includes(id);
        pin.position.set(pinLayout[id][0], 0, pinLayout[id][1]);
        pin.rotation.set(0, 0, 0);
      });
      gutter = 0;
      ball.position.set(ballPath(currentLine, 0.5, 0).startX, 0.35, START_Z);
      ball.rotation.set(0, 0, 0);
      ball.visible = true;
      guide.visible = true;
    };
    runtime.current = {
      // Preview the line: ball at its starting spot, dots along its angle.
      aim: (l) => {
        currentLine = l;
        if (!rolling) {
          const preview = ballPath(l, 0.5, 0);
          ball.position.x = preview.startX;
          guide.children.forEach(
            (dot) =>
              (dot.position.x =
                preview.startX + preview.slope * (START_Z - dot.position.z)),
          );
        }
      },
      reset,
      roll: (l, p, sp, cb) => {
        if (rolling) return;
        rolling = true;
        contacts.clear();
        rollTime = 0;
        power = p;
        currentLine = l;
        path = ballPath(l, p, sp);
        gutter = 0;
        // Like real bowling, the pocket (just off the head pin) carries best;
        // a dead-center hit can leave pins standing, and soft rolls carry less.
        const impact = Math.abs(path.impact);
        const pocket = Math.max(0, 1 - Math.abs(impact - 0.3) / 0.35);
        carry = 0.68 + pocket * 0.22 + p * 0.07;
        done = cb;
        guide.visible = false;
        knocked.clear();
        velocities.clear();
      },
    };
    reset(active);
    const observer = new ResizeObserver(() => {
      const w = parent.clientWidth,
        h = parent.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.position.y = w / h < 0.85 ? 13 : 9.2;
      camera.position.z = w / h < 0.85 ? 19 : 16.2;
      camera.lookAt(0, 0, 1);
      camera.updateProjectionMatrix();
    });
    observer.observe(parent);
    let frame = 0;
    let last = performance.now();
    function tick(now: number) {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.04);
      last = now;
      if (rolling && !paused.current && !document.hidden) {
        // Reduced motion plays the same throw four times faster.
        rollTime += dt * (reducedRef.current ? 4 : 1);
        const previousZ = ball.position.z;
        const total = (START_Z - END_Z) / path.speed;
        const s = Math.min(rollTime, total);
        const t = s / total;
        ball.position.z = START_Z - path.speed * s;
        let x = path.xAt(s);
        // Off the edge before the pins: the ball drops into the gutter.
        if (!gutter && ball.position.z > HEAD_PIN_Z && Math.abs(x) > LANE_EDGE)
          gutter = Math.sign(x);
        if (gutter) x = gutter * 2.2;
        ball.position.x = x;
        ball.position.y = gutter ? 0.2 : 0.35;
        ball.rotation.x = -s * 14;
        active.forEach((id) => {
          if (knocked.has(id) || gutter) return;
          const pin = pins[id];
          if (
            pin.position.z >= ball.position.z - 0.66 &&
            pin.position.z <= previousZ + 0.66 &&
            Math.abs(pin.position.x - ball.position.x) < 0.56
          ) {
            knocked.add(id);
            velocities.set(id, {
              x:
                (pin.position.x - ball.position.x) * 5 +
                (pin.position.x >= 0 ? 0.15 : -0.15),
              z: -3.2 - power * 3,
              r: pin.position.x >= ball.position.x ? -1 : 1,
            });
          }
        });
        velocities.forEach((v, id) => {
          const pin = pins[id];
          pin.position.x += v.x * dt;
          pin.position.z += v.z * dt;
          pin.rotation.z += v.r * dt * 5;
          pin.rotation.x -= dt * 3;
          pin.position.y = Math.min(0.18, pin.position.y + dt * 0.6);
          active.forEach((other) => {
            if (knocked.has(other)) return;
            const next = pins[other];
            if (
              Math.hypot(
                next.position.x - pin.position.x,
                next.position.z - pin.position.z,
              ) < 0.64 &&
              !contacts.has(`${id}-${other}`) &&
              (contacts.add(`${id}-${other}`), Math.random() < carry)
            ) {
              knocked.add(other);
              velocities.set(other, {
                x: (next.position.x - pin.position.x) * 5 + v.x * 0.45,
                z: v.z * 0.78,
                r: next.position.x > pin.position.x ? -1 : 1,
              });
            }
          });
        });
        if (t === 1) {
          rolling = false;
          const cb = done;
          done = null;
          ball.visible = false;
          cb?.([...knocked]);
        }
      }
      renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(tick);
    return () => {
      runtime.current = null;
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (timeout.current) clearTimeout(timeout.current);
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          mats.forEach((m) => m.dispose());
        }
      });
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div
      ref={container}
      className="bowling-lane"
      role="img"
      aria-label={`Bowling lane. ${standing.length} pins standing.`}
    >
      {fallback && (
        <div className="lane-fallback">
          <strong>{standing.length}</strong>
          <p>pins standing</p>
          <small>
            3D preview is unavailable on this device.
            <br />
            Aim and roll below to keep playing.
          </small>
        </div>
      )}
    </div>
  );
});
