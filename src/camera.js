import * as THREE from 'three';
import { height } from './world.js';

// Third person follow camera, ported from the prototype and pulled in for the smaller GLTF horse.
export function createCamera() {
  const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.3, 1400);
  const target = new THREE.Vector3();
  let yaw = 0;

  function update(dt, rider, input) {
    yaw += input.camYawDelta;
    // Swing back behind the horse once it's moving and nobody is holding the camera.
    if (!input.dragging && Math.abs(rider.speed) > 1) yaw *= 1 - Math.min(1, dt * 1.2);
    const cy = rider.heading + yaw;
    const dist = 5.2 + Math.abs(rider.speed) * 0.08;
    const cx = rider.x - Math.sin(cy) * dist, cz = rider.z - Math.cos(cy) * dist;
    const camY = Math.max(rider.y + 2.3, height(cx, cz) + 1.3);
    target.set(cx, camY, cz);
    camera.position.lerp(target, Math.min(1, dt * 6));
    camera.lookAt(rider.x, rider.y + 1.45, rider.z);
    const fov = 58 + Math.max(0, rider.speed - 10) * 0.5;
    if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
  }

  function snap(rider) {
    camera.position.set(rider.x - Math.sin(rider.heading) * 6, rider.y + 2.5, rider.z - Math.cos(rider.heading) * 6);
    camera.lookAt(rider.x, rider.y + 1.5, rider.z);
  }

  return { camera, update, snap };
}
