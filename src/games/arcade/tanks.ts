import { blankInput, board, botLevel, clamp, cursor, distance, pointer, reflect, separate, TAU, towards, turnTowards, type Engine, type Options, type Point, type Rect } from "./types";
import { blob, face, outline, shadow, tint } from "./draw";

export const tankWalls: Rect[] = [{ x: 265, y: 135, w: 45, h: 135 }, { x: 590, y: 330, w: 45, h: 135 }, { x: 390, y: 270, w: 120, h: 55 }];
const starts = [{ x: 120, y: 125 }, { x: 780, y: 475 }, { x: 780, y: 125 }, { x: 120, y: 475 }];
export function createTanks({ players, difficulty }: Options): Engine {
  const level = botLevel(difficulty);
  const tanks = players.map((p, i) => ({ ...p, ...starts[i], aim: { ...starts[(i + 1) % players.length] }, angle: 0, cooldown: 0, queued: 0, recoil: 0, safe: 2, shield: false, score: 0 }));
  let reducedMotion = false;
  let bullets: (Point & { vx: number; vy: number; owner: number; life: number; bounces: number })[] = [];
  const pickups = [{ x: 450, y: 115, ready: 0 }, { x: 450, y: 485, ready: 0 }];
  // Between events, the hint under the arena shows the controls.
  const DEFAULT = "";
  let noteUntil = 0;
  const engine: Engine = {
    id: "tanks", time: 0, done: false, label: "Fire", message: DEFAULT, hud: "90s · First to 5 tags", remaining: 90,
    setReducedMotion: value => { reducedMotion = value; },
    standings: () => tanks.map(p => ({ ...p, score: p.score })),
    step(dt, inputs) {
      if (engine.done || !Number.isFinite(dt) || dt <= 0) return;
      engine.time += dt;
      if (noteUntil && engine.time > noteUntil) { engine.message = DEFAULT; noteUntil = 0; }
      tanks.forEach((p, i) => {
        p.queued = Math.max(0, p.queued - dt); p.recoil = Math.max(0, p.recoil - dt);
        p.cooldown = Math.max(0, p.cooldown - dt); p.safe = Math.max(0, p.safe - dt);
        let fire = false;
        if (p.bot) {
          const target = tanks.filter(t => t !== p).sort((a, b) => distance(p, a) - distance(p, b))[0];
          if (!target) return;
          p.aim = { x: target.x + Math.sin(engine.time * 2 + i) * (50 - level * 15), y: target.y };
          const travel = { x: target.x + Math.cos(engine.time * .8 + i) * 100, y: target.y + Math.sin(engine.time * .9 + i) * 140 };
          towards(p, travel, 90 + level * 30, dt); fire = p.cooldown === 0;
        } else { p.aim = pointer(inputs[i] ?? blankInput()); towards(p, p.aim, 180, dt); fire = !!inputs[i]?.tap; }
        p.x = clamp(p.x, 58, 842); p.y = clamp(p.y, 58, 542);
        for (const wall of tankWalls) separate(p, 20, wall);
        const d = distance(p, p.aim); if (d > 3) p.angle = turnTowards(p.angle, Math.atan2(p.aim.y - p.y, p.aim.x - p.x), dt, 24);
        if (fire) p.queued = .14;
        if (p.queued > 0 && p.cooldown === 0) {
          p.queued = 0; p.recoil = .12;
          const direction = { x: Math.cos(p.angle), y: Math.sin(p.angle) };
          bullets.push({ x: p.x + direction.x * 30, y: p.y + direction.y * 30, vx: direction.x * 400, vy: direction.y * 400, owner: i, life: 3, bounces: 0 });
          p.cooldown = p.bot ? 1.7 - level * .35 : .42;
        }
        pickups.forEach(item => {
          if (item.ready > engine.time || distance(p, item) >= 35) return;
          p.shield = true; item.ready = engine.time + 12;
          engine.message = `${p.name} got a shield!`; noteUntil = engine.time + 2.5;
        });
      });
      // Tanks cannot occupy the same spot; separate both without pushing through walls.
      for (let i = 0; i < tanks.length; i++) for (let j = i + 1; j < tanks.length; j++) {
        const a = tanks[i], b = tanks[j], d = distance(a, b);
        if (d < 42) { const nx = d > .01 ? (b.x - a.x) / d : 1, ny = d > .01 ? (b.y - a.y) / d : 0;
          a.x -= nx * (42 - d) / 2; a.y -= ny * (42 - d) / 2; b.x += nx * (42 - d) / 2; b.y += ny * (42 - d) / 2;
        }
      }
      for (const p of tanks) { p.x = clamp(p.x, 58, 842); p.y = clamp(p.y, 58, 542); tankWalls.forEach(w => separate(p, 20, w)); }
      for (const b of bullets) {
        b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < 42 || b.x > 858) { b.x = clamp(b.x, 42, 858); b.vx *= -1; b.bounces++; }
        if (b.y < 42 || b.y > 558) { b.y = clamp(b.y, 42, 558); b.vy *= -1; b.bounces++; }
        for (const wall of tankWalls) {
          const n = separate(b, 6, wall);
          if (n) { const v = { x: b.vx, y: b.vy }; reflect(v, n, 1); b.vx = v.x; b.vy = v.y; b.bounces++; }
        }
        for (let i = 0; i < tanks.length; i++) {
          const p = tanks[i]; if (i === b.owner || p.safe > 0 || b.life <= 0 || distance(p, b) > 25) continue;
          b.life = 0;
          if (p.shield) { p.shield = false; p.safe = .5; }
          else {
            tanks[b.owner].score++; p.x = starts[i].x; p.y = starts[i].y; p.safe = 2;
            engine.message = `${tanks[b.owner].name} tagged ${p.name}!`; noteUntil = engine.time + 2.5;
          }
        }
      }
      bullets = bullets.filter(b => b.life > 0 && b.bounces <= 3);
      engine.remaining = Math.max(0, 90 - engine.time);
      engine.hud = `${Math.ceil(Math.max(0, 90 - engine.time))}s · First to 5 tags`;
      engine.done = tanks.some(t => t.score >= 5) || engine.time >= 90;
    },
    draw(c, w, h) {
      board(c, w, h, "#e8eff1", () => {
        c.beginPath(); c.roundRect(30, 30, 840, 540, 30); c.fillStyle = "#c7d8dc"; c.fill(); outline(c, 4);
        c.beginPath(); c.roundRect(42, 42, 816, 516, 22); c.fillStyle = "#fafcf9"; c.fill(); outline(c, 3);
        c.strokeStyle = "#edf1ed"; c.lineWidth = 2;
        for (let x = 102; x < 858; x += 120) { c.beginPath(); c.moveTo(x, 46); c.lineTo(x, 554); c.stroke(); }
        for (let y = 102; y < 558; y += 120) { c.beginPath(); c.moveTo(46, y); c.lineTo(854, y); c.stroke(); }
        for (const wall of tankWalls) {
          shadow(c, wall.x + wall.w / 2, wall.y + wall.h + 4, wall.w * .6, 6);
          c.beginPath(); c.roundRect(wall.x, wall.y, wall.w, wall.h, 12); c.fillStyle = "#c7cbe9"; c.fill(); outline(c, 3.5);
          c.beginPath(); c.roundRect(wall.x + 6, wall.y + 6, wall.w - 12, 8, 4); c.fillStyle = "#e3e5f6"; c.fill();
        }
        pickups.forEach(p => {
          if (p.ready > engine.time) return;
          const bob = reducedMotion ? 0 : Math.sin(engine.time * 3) * 3;
          shadow(c, p.x, p.y + 22, 16, 5);
          blob(c, p.x, p.y + bob, 19, "#bfe6fb", 3);
          c.beginPath(); c.ellipse(p.x - 6, p.y - 7 + bob, 6, 3.5, -.6, 0, TAU); c.fillStyle = "#ffffffcc"; c.fill();
        });
        bullets.forEach(b => { shadow(c, b.x, b.y + 11, 9, 3); blob(c, b.x, b.y, 13, "#fffdf5", 2); blob(c, b.x, b.y, 9, tanks[b.owner].color, 2.5); });
        tanks.forEach(p => {
          shadow(c, p.x, p.y + 24, 30, 8);
          if (p.shield || p.safe > 0) {
            c.beginPath(); c.arc(p.x, p.y, 34, 0, TAU); c.fillStyle = p.shield ? "#bfe6fb55" : "#ffffff40"; c.fill();
            c.strokeStyle = p.shield ? "#5aa9d6" : "#ffffffcc"; c.lineWidth = 3; c.stroke();
          }
          c.save(); c.translate(p.x, p.y); c.rotate(p.angle);
          for (const side of [-1, 1]) { c.beginPath(); c.roundRect(-25, side > 0 ? 9 : -23, 50, 14, 7); c.fillStyle = "#3d5566"; c.fill(); outline(c, 2.5); }
          c.beginPath(); c.roundRect(-21, -15, 42, 30, 10); c.fillStyle = p.color; c.fill(); outline(c, 3);
          c.beginPath(); c.roundRect(8 - (reducedMotion ? 0 : p.recoil * 30), -5, 30, 10, 5); c.fillStyle = tint(p.color, .45); c.fill(); outline(c, 2.5);
          c.restore();
          // The turret stays upright, with a face, so every tank reads at a glance.
          blob(c, p.x, p.y, 13, tint(p.color, .25), 2.5);
          face(c, p.x, p.y + 1, 11);
          if (!p.bot) cursor(c, p.aim, p.color);
        });
      });
    },
  };
  return engine;
}
