import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Scaffold only. Port behavior from prototype/index.html per CLAUDE.md.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9b98c);
scene.fog = new THREE.Fog(0xd9b98c, 40, 200);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 3, -8);
camera.lookAt(0, 1.2, 0);

scene.add(new THREE.HemisphereLight(0xffe9c4, 0x3a2e22, 0.6));
const sun = new THREE.DirectionalLight(0xffd9a0, 1.6);
sun.position.set(40, 60, 20);
sun.castShadow = true;
scene.add(sun);

const grass = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/grass.jpg`);
grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
grass.repeat.set(40, 40);
grass.colorSpace = THREE.SRGBColorSpace;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

let mixer;
new GLTFLoader().load(`${import.meta.env.BASE_URL}assets/Horse.glb`, (gltf) => {
  const horse = gltf.scene;
  horse.scale.setScalar(0.0095);
  horse.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(horse);
  mixer = new THREE.AnimationMixer(horse);
  mixer.clipAction(gltf.animations[0]).play();
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);
  renderer.render(scene, camera);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
