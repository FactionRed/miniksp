import * as THREE from 'three';
import './styles.css';
import { PLANET, MOON } from './physics/constants';
import { CelestialBody } from './physics/celestial-body';

const app = document.getElementById('app')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000010);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200000);
camera.position.set(0, 1500, 6000);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0x404060, 1));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(5000, 3000, 2000);
scene.add(sun);

const planet = new CelestialBody({
  name: PLANET.name,
  radius: PLANET.radius,
  mass: PLANET.mass,
  color: PLANET.color,
});
scene.add(planet.mesh);

const moon = new CelestialBody(
  { name: MOON.name, radius: MOON.radius, mass: MOON.mass, color: MOON.color },
  { orbitsCenter: true, orbitRadius: MOON.orbitRadius, orbitPeriod: MOON.orbitPeriod },
);
scene.add(moon.mesh);

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  planet.update(t);
  moon.update(t);
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
