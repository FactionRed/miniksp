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

  private updateCamera(): void {
    const p = new THREE.Vector3().setFromSpherical(this.spherical).add(this.target);
    this.camera.position.copy(p);
    this.camera.lookAt(this.target);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
