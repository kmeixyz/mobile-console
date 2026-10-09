import * as THREE from "three";
import { phoneOffset } from "../lib/phone-point.mjs";

/** Undo the camera's perspective so equal phone turns travel equal screen distances. */
export function planePointer(camera: THREE.PerspectiveCamera, center: THREE.Vector3, plane: THREE.Plane) {
  const ray = new THREE.Raycaster();
  const anchor = new THREE.Vector3();
  const point = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  return (x: number, y: number) => {
    camera.updateMatrixWorld();
    anchor.copy(center).project(camera);
    const offset = phoneOffset(x, y);
    ndc.set(anchor.x + offset.x * 2, anchor.y - offset.y * 2);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, point) ?? center;
  };
}
