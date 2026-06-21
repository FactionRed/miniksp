import * as THREE from 'three';
import './styles.css';
import { StateMachine } from './core/state-machine';
import { Input } from './core/input';
import { VabCamera } from './building/vab-camera';
import { VabController } from './building/vab-controller';
import { VabUi } from './building/vab-ui';
import { FlightController } from './flight/flight-controller';
import { FlightControls } from './flight/controls';
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

function launchFlight(design: ShipDesign) {
  if (flight) {
    scene.remove(flight.group);
  }
  vab.group.visible = false;
  ui.hide();
  flight = new FlightController(design, scene, vabCam.camera);
  controls = new FlightControls(input, flight);
  fsm.transition('FLIGHT');
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
  if (vab['ghost']) vab.onPointerUp(ndc);
  else vab.selectAt(ndc);
  ui.onReadyChange(vab.isReady());
});

fsm.onTransition((from, to) => {
  console.log(`state: ${from} → ${to}`);
});

function animate() {
  requestAnimationFrame(animate);
  if (fsm.current === 'BUILD') ui.onReadyChange(vab.isReady());
  if (fsm.current === 'FLIGHT' && flight && controls) {
    controls.update(1 / 60);
    flight.step(1 / 60);
  }
  renderer.render(scene, vabCam.camera);
  input.endFrame();
}
animate();

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  vabCam.resize(window.innerWidth / window.innerHeight);
});
