import * as THREE from 'three';
import './styles.css';
import { StateMachine } from './core/state-machine';
import { Input } from './core/input';
import { VabCamera } from './building/vab-camera';
import { VabController } from './building/vab-controller';
import { VabUi } from './building/vab-ui';
import { FlightController } from './flight/flight-controller';
import { FlightCamera } from './flight/flight-camera';
import { FlightControls } from './flight/controls';
import { Hud } from './flight/hud';
import { OrbitMap } from './ui/orbit-map';
import { NavBall } from './ui/navball';
import { WinStates } from './ui/win-states';
import type { ShipDesign } from './entities/ship';

const app = document.getElementById('app')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0x606080, 1));
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(20, 40, 30);
scene.add(key);

const grid = new THREE.GridHelper(100, 40, 0x335, 0x223);
scene.add(grid);

const fsm = new StateMachine();
const input = new Input();
input.attach();

const vabCam = new VabCamera(window.innerWidth / window.innerHeight);
const vab = new VabController(scene, vabCam);
vabCam.attach(renderer.domElement);

// --- FLIGHT (added in M5) ---
let flight: FlightController | null = null;
let controls: FlightControls | null = null;
let flightCam: FlightCamera | null = null;

function launchFlight(design: ShipDesign) {
  if (flight) {
    scene.remove(flight.group);
    scene.remove(flight.planet.mesh);
    scene.remove(flight.moon.mesh);
  }
  vab.group.visible = false;
  ui.hide();
  flight = new FlightController(design, scene);
  controls = new FlightControls(input, flight);
  flightCam = new FlightCamera(vabCam.camera);
  flightCam.attach(renderer.domElement);
  hud.show();
  navball.show();
  win.reset();
  fsm.transition('FLIGHT');
}

function revertToVab() {
  if (flight) {
    scene.remove(flight.group);
    scene.remove(flight.planet.mesh);
    scene.remove(flight.moon.mesh);
    flight = null;
    controls = null;
  }
  if (flightCam) {
    flightCam.detach();
    flightCam = null;
  }
  // Restore the VAB camera: the flight camera repointed its up-vector, so we
  // must reset orientation or the builder view comes back sideways/upside-down.
  vabCam.reset();
  vab.group.visible = true;
  ui.show();
  hud.hide();
  navball.hide();
  orbitMap.hide();
  win.hide();
  fsm.transition('BUILD');
}

const ui = new VabUi({
  onSelectPart: (id) => (id ? vab.beginPlace(id) : vab.cancelPlace()),
  onDeleteSelected: () => vab.deleteSelected(),
  onRotateSelected: (d) => vab.rotateSelected(d),
  onLaunch: () => {
    if (vab.isReady()) launchFlight(vab.design);
  },
  onRevert: () => {},
});

const hud = new Hud();
const orbitMap = new OrbitMap(scene, vabCam.camera);
const navball = new NavBall();
const win = new WinStates();
win.onBuildAgain = () => revertToVab();
input.onPressed('KeyM', () => orbitMap.toggle(renderer.domElement, flight ?? undefined));
input.onPressed('F1', () => {
  if (fsm.current !== 'BUILD') revertToVab();
});

input.onPressed('Delete', () => vab.deleteSelected());
input.onPressed('KeyQ', () => vab.rotateSelected(-90));
input.onPressed('KeyE', () => vab.rotateSelected(90));

const ndc = new THREE.Vector2();
renderer.domElement.addEventListener('pointermove', (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  if (fsm.current === 'BUILD') vab.onPointerMove(ndc);
});
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || fsm.current !== 'BUILD') return;
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  if (vab.isPlacing()) vab.onPointerUp(ndc);
  else vab.selectAt(ndc);
  ui.onReadyChange(vab.isReady());
});

fsm.onTransition((from, to) => {
  console.log(`state: ${from} → ${to}`);
});

const hints = document.createElement('div');
hints.id = 'hints';
hints.innerHTML = `
  <h3>VAB</h3>
  <div>Click part → click to place · Right-drag rotate view · Wheel zoom</div>
  <div>Q/E rotate · Del delete · Launch to fly</div>
  <h3>FLIGHT</h3>
  <div>Shift/Ctrl throttle · Z full · X cut · Space stage</div>
  <div>W/S pitch · A/D yaw · Q/E roll · T stability assist</div>
  <div>M map (drag rotate · wheel zoom) · F1 revert</div>
  <div style="margin-top:6px;color:#667">Press H to hide/show this help</div>
`;
document.body.appendChild(hints);
hints.style.display = 'block';
input.onPressed('KeyH', () => {
  hints.style.display = hints.style.display === 'none' ? 'block' : 'none';
});

function animate() {
  requestAnimationFrame(animate);
  if (fsm.current === 'BUILD') ui.onReadyChange(vab.isReady());
  if (fsm.current === 'FLIGHT' && flight && controls && flightCam) {
    controls.update(1 / 60);
    flight.step(1 / 60);
    // Flight camera and map camera share one camera object — only one may drive it.
    if (orbitMap.visible) {
      orbitMap.draw(flight);
    } else {
      flightCam.update(flight.ship.rootBody.position, flight.planet.position);
    }
    hud.update(flight);
    navball.update(flight);
    win.update(flight);
  }
  renderer.render(scene, vabCam.camera);
  input.endFrame();
}
animate();

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  vabCam.resize(window.innerWidth / window.innerHeight);
});
