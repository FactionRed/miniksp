// src/building/vab-camera.ts
import * as THREE from 'three';

export class VabCamera {
  readonly camera: THREE.PerspectiveCamera;
  private target = new THREE.Vector3(0, 5, 0);
  private spherical = new THREE.Spherical(60, Math.PI / 3, 0);
  private raycaster = new THREE.Raycaster();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 5000);
    this.updateCamera();
  }

  /** Ground plane (Y=0) used for dragging parts in the build space. */
  readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  attach(dom: HTMLElement): void {
    let rotating = false;
    let lastX = 0;
    let lastY = 0;
    dom.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        rotating = true;
        lastX = e.clientX;
        lastY = e.clientY;
      }
    });
    window.addEventListener('pointermove', (e) => {
      if (!rotating) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      this.spherical.theta -= dx * 0.01;
      this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi - dy * 0.01));
      this.updateCamera();
    });
    window.addEventListener('pointerup', () => {
      rotating = false;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener(
      'wheel',
      (e) => {
        this.spherical.radius = Math.max(15, Math.min(300, this.spherical.radius + e.deltaY * 0.05));
        this.updateCamera();
        e.preventDefault();
      },
      { passive: false },
    );
  }

  /** Raycast from pointer; returns intersection with given meshes, or null. */
  pick(meshes: THREE.Object3D[], pointerNdc: THREE.Vector2): THREE.Intersection | null {
    this.raycaster.setFromCamera(pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(meshes, false);
    return hits[0] ?? null;
  }

  /** Project pointer onto the build ground plane; returns world point or null. */
  pointerOnGround(pointerNdc: THREE.Vector2): THREE.Vector3 | null {
    this.raycaster.setFromCamera(pointerNdc, this.camera);
    const pt = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, pt);
    return hit ? pt : null;
  }

  /**
   * Find the surface under the pointer among `meshes`. Returns the world-space
   * surface point, the world-space outward normal, and the hit object — or null
   * if no part is under the pointer. The normal is the hit face normal rotated
   * into world space; null face → falls back to direction from object center to hit.
   */
  pickSurface(
    meshes: THREE.Object3D[],
    pointerNdc: THREE.Vector2,
  ): { point: THREE.Vector3; normal: THREE.Vector3; object: THREE.Object3D } | null {
    this.raycaster.setFromCamera(pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(meshes, false);
    const hit = hits[0];
    if (!hit || !hit.face) return null;
    // Transform the face normal from local to world space.
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
    return { point: hit.point.clone(), normal, object: hit.object };
  }

  /**
   * Reset to default VAB orientation. Required on returning from flight: the
   * flight camera sets camera.up to a radial vector, which would leave the VAB
   * view upside-down/sideways unless we restore the canonical world-up here.
   */
  reset(): void {
    this.spherical.set(60, Math.PI / 3, 0);
    this.target.set(0, 5, 0);
    this.camera.up.set(0, 1, 0);
    this.updateCamera();
  }

  private updateCamera(): void {
    const p = new THREE.Vector3().setFromSpherical(this.spherical).add(this.target);
    this.camera.position.copy(p);
    // Always re-assert canonical up before lookAt — flight camera may have left
    // it pointing somewhere weird.
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
