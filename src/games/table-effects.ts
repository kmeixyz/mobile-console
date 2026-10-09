import * as THREE from "three";

/** Time-spaced beads read as a tapered streak at any display refresh rate. */
export function motionTrail(scene: THREE.Scene, radius: number, color: THREE.ColorRepresentation) {
  const geometry = new THREE.SphereGeometry(radius, 12, 8);
  const beads = Array.from({ length: 10 }, () => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, born: -Infinity };
  });
  let next = 0, sampled = -Infinity;
  return {
    update(position: THREE.Vector3, now: number, active: boolean) {
      if (!active) {
        beads.forEach(bead => { bead.born = -Infinity; bead.mesh.visible = false; });
        sampled = -Infinity;
        return;
      }
      if (now - sampled >= 12) {
        const bead = beads[next++ % beads.length];
        bead.mesh.position.copy(position);
        bead.born = now;
        sampled = now;
      }
      for (const bead of beads) {
        const age = (now - bead.born) / 130;
        bead.mesh.visible = age >= 0 && age < 1;
        if (!bead.mesh.visible) continue;
        bead.mesh.scale.setScalar(1 - age * 0.8);
        bead.mesh.material.opacity = 0.24 * (1 - age) ** 2;
      }
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
