// src/physics/celestial-body.ts
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G } from './constants';
import { COLLISION_GROUP, CELESTIAL_COLLISION_MASK } from './collision-groups';
import { buildProceduralBody, type BodyKind } from '../rendering/procedural-planet';

export interface CelestialBodyData {
  name: string;
  radius: number;
  mass: number;
  color: number; // legacy fallback; procedural shader ignores it unless kind is undefined
  /** 'planet' = biomes + atmosphere; 'moon' = cratered regolith. Defaults to 'planet'. */
  kind?: BodyKind;
  /** Deterministic terrain seed. Defaults to 1. */
  seed?: number;
}

export class CelestialBody {
  readonly data: CelestialBodyData;
  readonly mesh: THREE.Mesh;
  readonly cannonBody: CANNON.Body;
  /** Optional atmosphere mesh (planets only) — add to the scene alongside `mesh`. */
  readonly atmosphere: THREE.Mesh | null;
  /** Current world-space center position. */
  position = new THREE.Vector3(0, 0, 0);
  private orbitRadius = 0;
  private orbitPeriod = 0;
  private setSunDirection: (dir: THREE.Vector3) => void;

  constructor(
    data: CelestialBodyData,
    opts: {
      orbitsCenter?: boolean;
      orbitRadius?: number;
      orbitPeriod?: number;
      /** Sun direction in world space (planet → sun). Updated via updateSun(). */
      sunDirection?: THREE.Vector3;
    } = {},
  ) {
    this.data = data;

    // Procedural terrain surface + optional atmosphere.
    const sunDir = opts.sunDirection ?? new THREE.Vector3(1, 0.3, 0.5);
    const built = buildProceduralBody({
      kind: data.kind ?? 'planet',
      radius: data.radius,
      seed: data.seed ?? 1,
      sunDirection: sunDir,
    });
    this.mesh = built.surface;
    this.atmosphere = built.atmosphere;
    this.setSunDirection = built.setSunDirection;
    this.mesh.position.copy(this.position);
    if (this.atmosphere) this.atmosphere.position.copy(this.position);

    // Cannon static body (so ships collide with the surface). Lives in the
    // CELESTIAL collision group so ship parts (group SHIP) can hit it.
    // NOTE: collision uses a plain sphere at the base radius — displaced terrain
    // peaks are visual only (amplitude is ≤4% of radius, so the offset is minor).
    const shape = new CANNON.Sphere(data.radius);
    this.cannonBody = new CANNON.Body({
      mass: 0, // static
      shape,
      collisionFilterGroup: COLLISION_GROUP.CELESTIAL,
      collisionFilterMask: CELESTIAL_COLLISION_MASK,
    });
    this.cannonBody.position.set(0, 0, 0);

    if (opts.orbitsCenter) {
      this.orbitRadius = opts.orbitRadius ?? 0;
      this.orbitPeriod = opts.orbitPeriod ?? 0;
    }
  }

  /** Update the sun direction so the day/night terminator + atmosphere track it. */
  updateSun(dir: THREE.Vector3): void {
    this.setSunDirection(dir);
  }

  /** Gravitational parameter mu = G * M. */
  get mu(): number {
    return G * this.data.mass;
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
      if (this.atmosphere) this.atmosphere.position.copy(this.position);
      this.cannonBody.position.set(this.position.x, this.position.y, this.position.z);
    }
  }
}
