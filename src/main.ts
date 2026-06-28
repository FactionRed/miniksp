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
import { HoldPanel } from './ui/hold-panel';
import { WinStates } from './ui/win-states';
import type { ShipDesign } from './entities/ship';
import { initAssets } from './assets';

// --- Asset loading + loading screen ---
// The #loader overlay is in index.html (pure HTML/CSS) so it paints before the
// JS bundle parses. Drive its progress bar from the Three LoadingManager and
// fade it out once init completes.
const loaderEl = document.getElementById('loader')!;
const barFill = loaderEl.querySelector('.bar-fill') as HTMLElement;
const pctEl = loaderEl.querySelector('.pct') as HTMLElement;

const assets = initAssets();
assets.manager.onProgress = (_url, loaded, total) => {
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 100;
  barFill.style.width = `${pct}%`;
  pctEl.textContent = `${pct}%`;
};

const app = document.getElementById('app')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

// Make GLSL compile/link errors surface loudly. Without this, a broken shader
// silently falls back to a flat default material (which is how the procedural
// planet's `attribute float uv` collision hid for two build cycles). When set,
// Three invokes this on any shader failure instead of silent fallback.
renderer.debug.onShaderError = (_gl, program, _vs, fs) => {
  const log = _gl.getProgramInfoLog(program) || _gl.getShaderInfoLog(fs);
  console.error('[shader] compile/link error:', log);
};

scene.add(new THREE.AmbientLight(0x606080, 1));
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(20, 40, 30);
scene.add(key);

const fsm = new StateMachine();
const input = new Input();
input.attach();

const vabCam = new VabCamera(window.innerWidth / window.innerHeight);
const vab = new VabController(scene, vabCam);
vabCam.attach(renderer.domElement);

// Build-space grid. Added to vab.group (NOT scene directly) so it hides along
// with the rest of the VAB on launch — otherwise it sits at the world origin,
// inside the planet, and shows through the surface.
const grid = new THREE.GridHelper(100, 40, 0x335, 0x223);
vab.group.add(grid);

// --- FLIGHT (added in M5) ---
let flight: FlightController | null = null;
let controls: FlightControls | null = null;
let flightCam: FlightCamera | null = null;

function launchFlight(design: ShipDesign) {
  if (flight) {
    scene.remove(flight.group);
    scene.remove(flight.planet.mesh);
    if (flight.planet.atmosphere) scene.remove(flight.planet.atmosphere);
    scene.remove(flight.moon.mesh);
    if (flight.moon.atmosphere) scene.remove(flight.moon.atmosphere);
  }
  vab.group.visible = false;
  ui.hide();
  flight = new FlightController(design, scene);
  controls = new FlightControls(input, flight);
  flightCam = new FlightCamera(vabCam.camera);
  flightCam.attach(renderer.domElement);
  hud.show();
  navball.show();
  holdPanel.show();
  holdPanel.setActive('off');
  win.reset();
  fsm.transition('FLIGHT');
}

function revertToVab() {
  if (flight) {
    scene.remove(flight.group);
    scene.remove(flight.planet.mesh);
    if (flight.planet.atmosphere) scene.remove(flight.planet.atmosphere);
    scene.remove(flight.moon.mesh);
    if (flight.moon.atmosphere) scene.remove(flight.moon.atmosphere);
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
  holdPanel.hide();
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
const holdPanel = new HoldPanel();
holdPanel.onSelect = (mode) => {
  if (flight) {
    flight.holdMode = mode;
    // Engaging a hold mode supersedes SAS (it has its own damping).
    if (mode !== 'off') flight.sasEnabled = false;
  }
};
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
    holdPanel.setActive(flight.holdMode);
    win.update(flight);
  }
  renderer.render(scene, vabCam.camera);
  input.endFrame();
}

// Start the game only after assets finish loading, then fade out the loader.
// Currently assets is a no-op (resolves immediately), but this gates the start
// behind real loads once textures/models are added — improving first-launch UX.
assets.ready.then(() => {
  // Force the bar to 100% in case onLoad fired before the overlay connected.
  barFill.style.width = '100%';
  pctEl.textContent = '100%';
  animate();
  // Fade the overlay out after a tick so the 100% state is visible briefly.
  requestAnimationFrame(() => {
    loaderEl.classList.add('fading');
    setTimeout(() => loaderEl.remove(), 700); // match CSS transition
  });
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  vabCam.resize(window.innerWidth / window.innerHeight);
});
