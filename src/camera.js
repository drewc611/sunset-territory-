import * as THREE from 'three';
import { height } from './world.js';

// Third person follow camera, ported from the prototype and pulled in for the smaller GLTF horse.
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.3, 1400);
  const target = new THREE.Vector3();
  let yaw = 0;

  // view: { dist, height, look } overrides for riding vs on foot.
  const RIDE = { dist: 5.2, height: 2.3, look: 1.45, speedPull: 0.08 };
  const FOOT = { dist: 3.4, height: 1.75, look: 1.45, speedPull: 0.12 };
  let cur = { ...RIDE };

  function update(dt, rider, input, onFoot = false, collision = null) {
    const want = onFoot ? FOOT : RIDE;
    const kk = Math.min(1, dt * 3);
    for (const k in cur) cur[k] += (want[k] - cur[k]) * kk;
    yaw += input.camYawDelta;
    // Swing back behind the horse once it's moving and nobody is holding the camera.
    if (!input.dragging && Math.abs(rider.speed) > 1) yaw *= 1 - Math.min(1, dt * 1.2);
    const cy = rider.heading + yaw;
    const dist = cur.dist + Math.abs(rider.speed) * cur.speedPull;
    let cx = rider.x - Math.sin(cy) * dist, cz = rider.z - Math.cos(cy) * dist;
    // Keep the camera out of buildings and trunks.
    if (collision) {
      // If a building stands between camera and rider, come in front of it.
      for (let t = 0.85; t >= 0; t -= 0.085) {
        if (collision.insideBox(cx + (rider.x - cx) * t, cz + (rider.z - cz) * t)) {
          const k = Math.max(0, Math.min(t + 0.1, 1 - 2.2 / dist)); // never closer than 2.2 m
          cx += (rider.x - cx) * k; cz += (rider.z - cz) * k;
          break;
        }
      }
      const r = collision.resolve(cx, cz, 0.35); cx = r.x; cz = r.z;
    }
    let camY = Math.max(rider.y + cur.height, height(cx, cz) + 1.1);
    // Keep the sight line to the rider above any rise in between.
    const lookY = rider.y + cur.look;
    for (const t of [0.3, 0.55, 0.8]) {
      const hp = height(cx + (rider.x - cx) * t, cz + (rider.z - cz) * t) + 0.7;
      camY = Math.max(camY, (hp - lookY * t) / (1 - t));
    }
    target.set(cx, camY, cz);
    camera.position.lerp(target, Math.min(1, dt * 6));
    camera.lookAt(rider.x, rider.y + cur.look, rider.z);
    // Speed widens the view, unless the system asks for reduced motion.
    const fov = 58 + (reduceMotion.matches ? 0 : Math.max(0, rider.speed - 10) * 0.5);
    if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
  }

  function snap(rider) {
    camera.position.set(rider.x - Math.sin(rider.heading) * 6, rider.y + 2.5, rider.z - Math.cos(rider.heading) * 6);
    camera.lookAt(rider.x, rider.y + 1.5, rider.z);
  }

  return { camera, update, snap };
}
