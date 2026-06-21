// src/flight/flight-controller.ts
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { buildShipPhysics, type BuiltShip } from './ship-builder';
import { GravitySystem } from '../physics/gravity';
import { dominantBody } from '../physics/gravity';
import { CelestialBody } from '../physics/celestial-body';
import { sphereOfInfluence } from '../physics/orbit-math';
import type { ShipDesign } from '../entities/ship';
import { getPartDef } from '../entities/parts-catalog';
import { PLANET, MOON } from '../physics/constants';

export class FlightController {
  readonly world = new CANNON.World();
  readonly group = new THREE.Group();
  readonly planet: CelestialBody;
  readonly moon: CelestialBody;
  readonly ship: BuiltShip;
  throttle = 0; // 0..1
  private gravity: GravitySystem;
  private stageActive = true;

  constructor(
    design: ShipDesign,
    scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
  ) {
    this.world.gravity.set(0, 0, 0);
    this.world.broadphase = new CANNON.NaiveBroadphase();

    this.planet = new CelestialBody({
      name: PLANET.name,
      radius: PLANET.radius,
      mass: PLANET.mass,
      color: PLANET.color,
    });
    this.moon = new CelestialBody(
      { name: MOON.name, radius: MOON.radius, mass: MOON.mass, color: MOON.color },
      { orbitsCenter: true, orbitRadius: MOON.orbitRadius, orbitPeriod: MOON.orbitPeriod },
    );
    this.world.addBody(this.planet.cannonBody);
    this.world.addBody(this.moon.cannonBody);
    scene.add(this.planet.mesh);
    scene.add(this.moon.mesh);

    this.ship = buildShipPhysics(design);
    for (const b of this.ship.bodies) this.world.addBody(b);
    for (const c of this.ship.constraints) this.world.addConstraint(c);
    scene.add(this.ship.group);
    scene.add(this.group);

    // Spawn on launchpad at planet north pole (planet at origin, +Y = up).
    const spawnY = PLANET.radius + 3;
    for (const b of this.ship.bodies) b.position.y += spawnY;

    this.gravity = new GravitySystem(this.world, () => this.candidates());
  }

  private candidates() {
    return [
      { body: this.planet, soi: Infinity },
      { body: this.moon, soi: sphereOfInfluence(MOON.orbitRadius, MOON.mass, PLANET.mass) },
    ];
  }

  /** SOI dominant body at a given position (used by map + win-states). */
  dominantBodyFor(pos: { x: number; y: number; z: number }): CelestialBody {
    const shipPos: [number, number, number] = [pos.x, pos.y, pos.z];
    return dominantBody(shipPos, this.candidates());
  }

  ignite(): void {
    this.stageActive = true;
  }

  cutStage(): void {
    this.stageActive = false;
  }

  /** Apply thrust if any fuel remains. thrust (kN) per engine, throttle-scaled. */
  step(dt: number): void {
    if (this.stageActive && this.ship.fuel > 0 && this.throttle > 0) {
      // Consume fuel proportional to throttle (sum of engine thrust * tuning).
      const totalThrust = this.ship.engineBodies.reduce((s, b) => {
        const def = this.partDefForBody(b);
        return s + (def?.thrust ?? 0);
      }, 0);
      const fuelBurn = totalThrust * this.throttle * dt * 0.01; // tuning constant
      this.ship.fuel = Math.max(0, this.ship.fuel - fuelBurn);

      // Apply force along each engine's local +Y (engines push the body "up").
      for (const b of this.ship.engineBodies) {
        const def = this.partDefForBody(b);
        if (!def?.thrust) continue;
        const f = def.thrust * this.throttle;
        const localForce = new CANNON.Vec3(0, f, 0);
        const worldForce = b.quaternion.vmult(localForce);
        b.applyForce(worldForce, new CANNON.Vec3(0, 0, 0));
      }
    }

    this.gravity.applyGravity();
    this.world.step(1 / 60, dt, 3);

    // Sync meshes from physics bodies.
    for (const b of this.ship.bodies) {
      const m = this.ship.meta.get(b);
      if (!m) continue;
      m.mesh.position.set(b.position.x, b.position.y, b.position.z);
      m.mesh.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    }

    const now = performance.now() / 1000;
    this.planet.update(now);
    this.moon.update(now);

    // Chase camera follows root body.
    const root = this.ship.rootBody;
    const back = root.quaternion.vmult(new CANNON.Vec3(0, 3, -12));
    this.camera.position.set(
      root.position.x + back.x,
      root.position.y + back.y,
      root.position.z + back.z,
    );
    this.camera.lookAt(root.position.x, root.position.y, root.position.z);
  }

  private partDefForBody(b: CANNON.Body) {
    const partId = this.ship.meta.get(b)?.partId;
    return partId ? getPartDef(partId) : undefined;
  }
}
