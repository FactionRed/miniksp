// src/flight/flight-camera.ts
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * KSP-style orbital camera.
 *
 * - Tracks the ship's POSITION but not its orientation — the ship can roll and
 *   the world stays level.
 * - "Up" is the radial vector from the planet center to the ship, so the horizon
 *   stays under you as you fly around the planet (just like KSP).
 * - Mouse left-drag orbits azimuth/pitch around the ship; wheel zooms distance.
 * - The ship's orientation (W/S/A/D/Q/E torque) is completely independent.
 */
export class FlightCamera {
  /** Azimuth around the local-up axis, in radians. */
  private azimuth = Math.PI;
  /** Pitch above the local horizon, in radians (clamped). */
  private pitch = 0.5;
  /** Distance from the ship, in meters. */
  private distance = 25;
  private readonly minDistance = 6;
  private readonly maxDistance = 1500; // must exceed planet radius (300m)

  /** Smoothed camera target (ship position) so the view doesn't snap on teleport. */
  private targetPos = new THREE.Vector3();

  constructor(private camera: THREE.PerspectiveCamera) {}

  private dom: HTMLElement | null = null;
  private onDown: ((e: PointerEvent) => void) | null = null;
  private onMove: ((e: PointerEvent) => void) | null = null;
  private onUp: (() => void) | null = null;
  private onWheel: ((e: WheelEvent) => void) | null = null;

  attach(dom: HTMLElement): void {
    // Detach any prior attachment first so re-launching doesn't stack listeners.
    this.detach();
    this.dom = dom;

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    this.onDown = (e: PointerEvent) => {
      // Left button only — right button stays free for future RCS/etc.
      if (e.button !== 0) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    this.onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      this.azimuth -= dx * 0.005;
      this.pitch = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, this.pitch - dy * 0.005));
    };
    this.onUp = () => {
      dragging = false;
    };
    this.onWheel = (e: WheelEvent) => {
      this.distance = Math.max(
        this.minDistance,
        Math.min(this.maxDistance, this.distance + e.deltaY * 0.03),
      );
      e.preventDefault();
    };

    dom.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
  }

  detach(): void {
    if (this.dom && this.onDown) this.dom.removeEventListener('pointerdown', this.onDown);
    if (this.onMove) window.removeEventListener('pointermove', this.onMove);
    if (this.onUp) window.removeEventListener('pointerup', this.onUp);
    if (this.dom && this.onWheel) this.dom.removeEventListener('wheel', this.onWheel);
    this.dom = null;
  }

  /** Sync the camera to follow the ship. Call once per frame. */
  update(shipPos: CANNON.Vec3, planetCenter: THREE.Vector3): void {
    // Smooth-follow the ship position (lerp so big jumps don't jolt the view).
    const desired = new THREE.Vector3(shipPos.x, shipPos.y, shipPos.z);
    if (this.targetPos.lengthSq() === 0) this.targetPos.copy(desired);
    this.targetPos.lerp(desired, 0.3);

    // Local "up" = direction from planet center to the ship. This keeps the
    // horizon level as the ship flies around the planet (KSP behavior).
    const up = desired.clone().sub(planetCenter).normalize();
    // Build a local frame: right = up × worldForwardZ, forward = right × up.
    const worldForward = new THREE.Vector3(0, 0, 1);
    let right = new THREE.Vector3().crossVectors(up, worldForward);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const forward = new THREE.Vector3().crossVectors(right, up).normalize();

    // Offset = azimuth rotation around up, then pitch up from the horizon.
    const cosA = Math.cos(this.azimuth);
    const sinA = Math.sin(this.azimuth);
    const horiz = new THREE.Vector3()
      .addScaledVector(forward, cosA)
      .addScaledVector(right, sinA)
      .normalize();
    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);
    const offsetDir = new THREE.Vector3()
      .addScaledVector(horiz, -cosP) // back away along the horizon direction
      .addScaledVector(up, sinP) // and up
      .normalize();

    this.camera.position.copy(this.targetPos).addScaledVector(offsetDir, this.distance);
    this.camera.up.copy(up);
    this.camera.lookAt(this.targetPos);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
