// src/ui/orbit-map.ts
import * as THREE from 'three';
import type { FlightController } from '../flight/flight-controller';

const TRAJECTORY_STEPS = 1000;
const TRAJECTORY_DT = 0.5;

/**
 * 3D orbital map view.
 *
 * When open, the camera pulls back to show the whole system and you orbit it
 * with the mouse (left-drag rotates, wheel zooms). The predicted trajectory is
 * drawn as a 3D line in the scene. A small DOM overlay shows help text and the
 * Ap/Pe readout. Closes with M.
 *
 * This replaces the earlier 2D top-down canvas — the game is 3D, so maneuvers
 * out of the XZ plane were unreadable.
 */
export class OrbitMap {
  visible = false;
  private overlay: HTMLElement;
  private apPeText: HTMLElement;
  private trajectoryLine: THREE.Line | null = null;

  // Map camera state (separate from flight camera).
  private mapAzimuth = Math.PI / 4;
  private mapPitch = Math.PI / 6;
  private mapDistance = 8000;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    this.overlay = document.createElement('div');
    this.overlay.id = 'map-overlay';
    Object.assign(this.overlay.style, {
      position: 'absolute',
      left: '12px',
      top: '12px',
      background: 'rgba(0,0,10,0.78)',
      color: '#cdd',
      fontFamily: 'monospace',
      fontSize: '12px',
      padding: '8px 12px',
      borderRadius: '6px',
      border: '1px solid #2a3550',
      display: 'none',
      zIndex: '20',
      pointerEvents: 'none',
      lineHeight: '1.6',
    } as Partial<CSSStyleDeclaration>);
    this.overlay.innerHTML = `
      <div id="map-appe" style="color:#9cf;margin-bottom:4px">Ap - / Pe -</div>
      <div id="map-help" style="color:#7a8aa5">MAP · drag rotate · wheel zoom · M close</div>
    `;
    document.body.appendChild(this.overlay);
    this.apPeText = this.overlay.querySelector('#map-appe')!;
  }

  /** Mouse handlers — attached only while the map is open to avoid stealing flight input. */
  private onDown: ((e: PointerEvent) => void) | null = null;
  private onMove: ((e: PointerEvent) => void) | null = null;
  private onUp: (() => void) | null = null;
  private onWheel: ((e: WheelEvent) => void) | null = null;
  private dom: HTMLElement | null = null;

  private attachControls(dom: HTMLElement): void {
    this.detachControls();
    this.dom = dom;
    this.onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    this.onMove = (e: PointerEvent) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.mapAzimuth -= dx * 0.005;
      this.mapPitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.mapPitch + dy * 0.005));
    };
    this.onUp = () => {
      this.dragging = false;
    };
    this.onWheel = (e: WheelEvent) => {
      const factor = e.deltaY < 0 ? 1 / 1.15 : 1.15;
      this.mapDistance = Math.max(500, Math.min(20000, this.mapDistance * factor));
      e.preventDefault();
    };
    dom.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private detachControls(): void {
    if (this.dom && this.onDown) this.dom.removeEventListener('pointerdown', this.onDown);
    if (this.onMove) window.removeEventListener('pointermove', this.onMove);
    if (this.onUp) window.removeEventListener('pointerup', this.onUp);
    if (this.dom && this.onWheel) this.dom.removeEventListener('wheel', this.onWheel);
    this.dom = null;
  }

  toggle(dom: HTMLElement, flight?: FlightController): void {
    this.visible = !this.visible;
    if (this.visible) {
      this.overlay.style.display = 'block';
      this.attachControls(dom);
      if (flight) this.recomputeTrajectory(flight);
    } else {
      this.overlay.style.display = 'none';
      this.detachControls();
      this.clearTrajectory();
    }
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.overlay.style.display = 'none';
    this.detachControls();
    this.clearTrajectory();
  }

  /** Recompute trajectory + position the camera. Called each frame while open. */
  draw(flight: FlightController): void {
    if (!this.visible) return;
    this.recomputeTrajectory(flight);
    this.updateOverlay(flight);

    // Orbit the camera around the planet (system origin) using spherical coords.
    // Use world-up so the map view doesn't inherit the flight camera's radial up.
    const x = Math.cos(this.mapPitch) * Math.cos(this.mapAzimuth) * this.mapDistance;
    const y = Math.sin(this.mapPitch) * this.mapDistance;
    const z = Math.cos(this.mapPitch) * Math.sin(this.mapAzimuth) * this.mapDistance;
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);
  }

  private recomputeTrajectory(flight: FlightController): void {
    const root = flight.ship.rootBody;
    const dom = flight.dominantBodyFor(root.position);
    const mu = dom.mu;
    const bx = dom.position.x;
    const by = dom.position.y;
    const bz = dom.position.z;
    let px = root.position.x;
    let py = root.position.y;
    let pz = root.position.z;
    let vx = root.velocity.x;
    let vy = root.velocity.y;
    let vz = root.velocity.z;

    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < TRAJECTORY_STEPS; i++) {
      const rx = px - bx;
      const ry = py - by;
      const rz = pz - bz;
      const r2 = rx * rx + ry * ry + rz * rz;
      const r = Math.sqrt(r2);
      if (r < flight.planet.data.radius) break;
      pts.push(new THREE.Vector3(px, py, pz));
      const a = -mu / (r2 * r);
      vx += a * rx * TRAJECTORY_DT;
      vy += a * ry * TRAJECTORY_DT;
      vz += a * rz * TRAJECTORY_DT;
      px += vx * TRAJECTORY_DT;
      py += vy * TRAJECTORY_DT;
      pz += vz * TRAJECTORY_DT;
    }

    this.clearTrajectory();
    if (pts.length < 2) return;
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0x33ff66, transparent: true, opacity: 0.7 });
    this.trajectoryLine = new THREE.Line(geom, mat);
    this.scene.add(this.trajectoryLine);
  }

  private clearTrajectory(): void {
    if (this.trajectoryLine) {
      this.scene.remove(this.trajectoryLine);
      this.trajectoryLine.geometry.dispose();
      (this.trajectoryLine.material as THREE.Material).dispose();
      this.trajectoryLine = null;
    }
  }

  private updateOverlay(flight: FlightController): void {
    const root = flight.ship.rootBody;
    const planet = flight.planet;
    const dx = root.position.x - planet.position.x;
    const dy = root.position.y - planet.position.y;
    const dz = root.position.z - planet.position.z;
    const r = Math.hypot(dx, dy, dz);
    const v = Math.hypot(root.velocity.x, root.velocity.y, root.velocity.z);
    // Quick energy-based Ap/Pe (2-body approximation around the planet).
    const mu = planet.mu;
    const energy = (v * v) / 2 - mu / r;
    let apPe = 'escape';
    if (energy < 0) {
      // eccentricity from state vectors
      const rvDot = dx * root.velocity.x + dy * root.velocity.y + dz * root.velocity.z;
      const v2 = v * v;
      const kx = (v2 - mu / r) * dx - rvDot * root.velocity.x;
      const ky = (v2 - mu / r) * dy - rvDot * root.velocity.y;
      const kz = (v2 - mu / r) * dz - rvDot * root.velocity.z;
      const ecc = Math.hypot(kx, ky, kz) / mu;
      const a = -mu / (2 * energy);
      const ap = a * (1 + ecc) - planet.data.radius;
      const pe = a * (1 - ecc) - planet.data.radius;
      apPe = `Ap ${ap.toFixed(0)} m / Pe ${pe.toFixed(0)} m`;
    }
    this.apPeText.textContent = apPe;
  }
}
