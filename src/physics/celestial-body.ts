// src/physics/celestial-body.ts
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G } from './constants';

export interface CelestialBodyData {
  name: string;
  radius: number;
  mass: number;
  color: number;
}

export class CelestialBody {
  readonly data: CelestialBodyData;
  readonly mesh: THREE.Mesh;
  readonly cannonBody: CANNON.Body;
  /** Current world-space center position. */
  position = new THREE.Vector3(0, 0, 0);
  private orbitRadius = 0;
  private orbitPeriod = 0;

  constructor(
    data: CelestialBodyData,
    opts: { orbitsCenter?: boolean; orbitRadius?: number; orbitPeriod?: number } = {},
  ) {
    this.data = data;

    // Three mesh
    const geom = new THREE.SphereGeometry(data.radius, 48, 32);
    const mat = new THREE.MeshStandardMaterial({ color: data.color, roughness: 0.9 });
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.position.copy(this.position);

    // Cannon static body (so ships collide with the surface)
    const shape = new CANNON.Sphere(data.radius);
    this.cannonBody = new CANNON.Body({ mass: 0, shape }); // mass 0 = static
    this.cannonBody.position.set(0, 0, 0);

    if (opts.orbitsCenter) {
      this.orbitRadius = opts.orbitRadius ?? 0;
      this.orbitPeriod = opts.orbitPeriod ?? 0;
    }
  }

  /** Gravitational parameter mu = G * M. */
  get mu(): number {
    return G * this.data.mass;
  }

  /** Orbit semi-major axis, exposed for map drawing (0 for a non-orbiting body). */
  get orbitRadiusApproxForMap(): number {
    return this.orbitRadius;
  }

  /** Update position if this body orbits the world origin (planet center). */
  update(timeSeconds: number): void {
    if (this.orbitPeriod > 0) {
      const angle = (2 * Math.PI * timeSeconds) / this.orbitPeriod;
      this.position.set(
        Math.cos(angle) * this.orbitRadius,
        0,
        Math.sin(angle) * this.orbitRadius,
      );
      this.mesh.position.copy(this.position);
      this.cannonBody.position.set(this.position.x, this.position.y, this.position.z);
    }
  }
}
