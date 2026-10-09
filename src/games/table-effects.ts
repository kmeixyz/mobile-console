import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** Broad studio reflections give curved toys readable edges without glare. */
export function studioLighting(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const room = new RoomEnvironment();
  const generator = new THREE.PMREMGenerator(renderer);
  const scissor = renderer.getScissorTest();
  renderer.setScissorTest(false);
  const environment = generator.fromScene(room, .04, .1, 100);
  renderer.setScissorTest(scissor);
  scene.environment = environment.texture;
  scene.environmentIntensity = .38;
  room.dispose();
  generator.dispose();
  return () => { scene.environment = null; environment.dispose(); };
}

/** A baked soft contact shadow grounds the table without another shadow pass. */
export function tableContactShadow(scene: THREE.Scene, width: number, depth: number, y: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const c = canvas.getContext("2d")!;
  const shade = c.createRadialGradient(64, 64, 12, 64, 64, 64);
  shade.addColorStop(0, "#29475440"); shade.addColorStop(.5, "#29475428"); shade.addColorStop(1, "#29475400");
  c.fillStyle = shade; c.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = y; scene.add(mesh);
  // Geometry and material are disposed by the owning scene's normal teardown.
  return () => texture.dispose();
}

/** A continuous tapered tube, updated in place and rendered in one draw.
 * Shared ring vertices avoid the seams and dark overlaps of separate beads. */
export function motionTrail(scene: THREE.Scene, radius: number, color: THREE.ColorRepresentation) {
  const count = 12, sides = 8, lifetime = 130;
  const vertices = new Float32Array((count + 1) * sides * 3);
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positions);
  const indices: number[] = [];
  for (let i = 0; i < count; i++) for (let j = 0; j < sides; j++) {
    const a = i * sides + j, b = i * sides + (j + 1) % sides;
    indices.push(a, a + sides, b, b, a + sides, b + sides);
  }
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .2, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
  mesh.frustumCulled = false; mesh.visible = false;
  scene.add(mesh);
  const samples = Array.from({ length: count }, () => ({ position: new THREE.Vector3(), born: -Infinity }));
  const tangent = new THREE.Vector3(), normal = new THREE.Vector3(), binormal = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), forward = new THREE.Vector3(0, 0, 1);
  let head = 0, sampled = -Infinity;
  return {
    update(position: THREE.Vector3, now: number, active: boolean) {
      if (!active) { mesh.visible = false; sampled = -Infinity; return; }
      if (!Number.isFinite(sampled) || now < sampled) {
        samples.forEach(sample => { sample.position.copy(position); sample.born = now; });
        head = 0; sampled = now;
      }
      if (now - sampled >= 10) {
        head = (head + 1) % count;
        samples[head].position.copy(position); samples[head].born = now;
        sampled = now;
      }
      const sampleAt = (i: number) => samples[(head - i + count) % count];
      for (let i = 0; i <= count; i++) {
        const sample = sampleAt(Math.max(0, i - 1));
        const center = i === 0 ? position : sample.position;
        const before = i <= 1 ? position : sampleAt(i - 2).position;
        const after = i === count ? center : sampleAt(i).position;
        tangent.subVectors(before, after);
        if (tangent.lengthSq() < 1e-10) tangent.set(0, 0, 1);
        tangent.normalize();
        normal.crossVectors(tangent, Math.abs(tangent.y) > .95 ? forward : up).normalize();
        binormal.crossVectors(tangent, normal);
        const life = Math.max(0, 1 - (now - sample.born) / lifetime);
        const width = i === count ? 0 : radius * .8 * life * (1 - i / count);
        for (let j = 0; j < sides; j++) {
          const angle = j * Math.PI * 2 / sides, u = Math.cos(angle) * width, v = Math.sin(angle) * width;
          const index = (i * sides + j) * 3;
          vertices[index] = center.x + normal.x * u + binormal.x * v;
          vertices[index + 1] = center.y + normal.y * u + binormal.y * v;
          vertices[index + 2] = center.z + normal.z * u + binormal.z * v;
        }
      }
      mesh.visible = true; positions.needsUpdate = true;
    },
  };
}

/** A small reusable pool: a contact ripple reads clearly without camera shake. */
export function contactRipples(scene: THREE.Scene, radius: number) {
  const rings = Array.from({ length: 6 }, () => {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.8, radius, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, born: -Infinity };
  });
  let next = 0;
  return {
    hit(x: number, y: number, z: number, now: number, color: THREE.ColorRepresentation) {
      const ring = rings[next++ % rings.length];
      ring.born = now;
      ring.mesh.position.set(x, y, z);
      ring.mesh.material.color.set(color);
    },
    update(now: number, reduced: boolean) {
      for (const ring of rings) {
        const t = (now - ring.born) / 340;
        ring.mesh.visible = !reduced && t >= 0 && t < 1;
        if (!ring.mesh.visible) continue;
        ring.mesh.scale.setScalar(0.6 + 1.9 * (1 - (1 - t) ** 3));
        ring.mesh.material.opacity = 0.55 * (1 - t) ** 2;
      }
    },
  };
}
