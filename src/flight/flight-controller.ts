// src/flight/flight-controller.ts
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { buildShipPhysics, type BuiltShip, type ShipBody, type BodyMeta } from './ship-builder';
import { buildStages, type Stage } from './stage-manager';
import { GravitySystem, dominantBody } from '../physics/gravity';
import { CelestialBody } from '../physics/celestial-body';
import { sphereOfInfluence } from '../physics/orbit-math';
import type { ShipDesign } from '../entities/ship';
import { getPartDef } from '../entities/parts-catalog';
import { PLANET, MOON } from '../physics/constants';

// Tuned so one tank (400 fuel) at full throttle (one 40kN engine) burns for
// ~30s: burn = 40 * 1 * dt * 0.33 ≈ 13.3 fuel/s → 400 / 13.3 ≈ 30s of thrust.
const FUEL_BURN_RATE = 0.33;

export type HoldMode = 'off' | 'prograde' | 'retrograde' | 'normal' | 'antinormal';

export class FlightController {
  readonly world = new CANNON.World();
  readonly group = new THREE.Group();
  readonly planet: CelestialBody;
  readonly moon: CelestialBody;
  readonly ship: BuiltShip;
  throttle = 0; // 0..1
  /** Stability Assist (SAS) — when true, applies counter-torque to kill rotation. */
  sasEnabled = false;
  /** Attitude hold mode — actively points the nose at a computed direction. */
  holdMode: HoldMode = 'off';
  private gravity: GravitySystem;
  private stageActive = true;
  private stages: Stage[] = [];
  private currentStageIndex = 0;

  constructor(
    design: ShipDesign,
    scene: THREE.Scene,
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
    for (const sb of this.ship.shipBodies) this.world.addBody(sb.body);
    scene.add(this.ship.group);
    scene.add(this.group);

    // Spawn on launchpad at planet north pole (planet at origin, +Y = up).
    // Rest the lowest point of the ship exactly on the surface (no clearance —
    // a floating spawn would drop and bounce/tip on landing).
    const lowestY = this.lowestPointOfShip();
    const lift = PLANET.radius - lowestY;
    for (const sb of this.ship.shipBodies) {
      sb.body.position.y += lift;
      sb.body.velocity.set(0, 0, 0);
      sb.body.angularVelocity.set(0, 0, 0);
      // Static until first throttle-up: prevents any spawn jitter from accumulating
      // while the player reads the HUD. Re-enabled on first thrust.
      sb.body.type = CANNON.Body.STATIC;
    }
    const rb = this.ship.rootBody;
    console.log(
      `[spawn] bodies=${this.ship.shipBodies.length} lowestY=${lowestY.toFixed(2)} lift=${lift.toFixed(2)} ` +
        `root at y=${rb.position.y.toFixed(2)} (alt ${(rb.position.y - PLANET.radius).toFixed(2)})`,
    );

    this.stages = buildStages(design);
    this.gravity = new GravitySystem(this.world, () => this.candidates());
  }

  /** Lowest world-Y across all parts of the assembled ship. */
  private lowestPointOfShip(): number {
    let lowest = Infinity;
    for (const sb of this.ship.shipBodies) {
      for (const meta of sb.parts.values()) {
        const halfY = getPartDef(meta.partId).size[1];
        // World position of this part's center.
        const worldY = sb.body.position.y + meta.localOffset.y;
        lowest = Math.min(lowest, worldY - halfY);
      }
    }
    return lowest;
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

  /**
   * Compute the target direction for the active hold mode and apply PD torque to
   * rotate the nose toward it. Directions are derived from the ship's position r
   * and velocity v relative to the dominant celestial body.
   *
   *   prograde   = v̂
   *   retrograde = -v̂
   *   normal     = (r × v)̂        (orbital angular momentum — "north" of the orbital plane)
   *   antinormal = -(r × v)̂
   *
   * Guarded: needs a nonzero velocity (prograde/retrograde) and a non-radial
   * trajectory (normal/antinormal — undefined if r ∥ v). If undefined, the mode
   * effectively holds current attitude.
   */
  private applyAttitudeHold(): void {
    const root = this.ship.rootBody;
    if (root.type !== CANNON.Body.DYNAMIC) return;

    const dom = this.dominantBodyFor(root.position);
    const rx = root.position.x - dom.position.x;
    const ry = root.position.y - dom.position.y;
    const rz = root.position.z - dom.position.z;
    const vx = root.velocity.x;
    const vy = root.velocity.y;
    const vz = root.velocity.z;
    const rLen = Math.hypot(rx, ry, rz);
    const vLen = Math.hypot(vx, vy, vz);
    if (rLen < 1e-3) return;

    // Compute the desired world-space direction.
    let tx = 0;
    let ty = 0;
    let tz = 0;
    if (this.holdMode === 'prograde' || this.holdMode === 'retrograde') {
      if (vLen < 0.5) return; // velocity too low for a meaningful direction
      const s = this.holdMode === 'prograde' ? 1 : -1;
      tx = (s * vx) / vLen;
      ty = (s * vy) / vLen;
      tz = (s * vz) / vLen;
    } else {
      // normal / antinormal — from orbital angular momentum h = r × v
      const hx = ry * vz - rz * vy;
      const hy = rz * vx - rx * vz;
      const hz = rx * vy - ry * vx;
      const hLen = Math.hypot(hx, hy, hz);
      if (hLen < 1e-3) return; // r ∥ v — orbital plane undefined
      const s = this.holdMode === 'normal' ? 1 : -1;
      tx = (s * hx) / hLen;
      ty = (s * hy) / hLen;
      tz = (s * hz) / hLen;
    }

    // Ship's nose = local +Y rotated to world.
    const nose = root.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    let nx = nose.x;
    let ny = nose.y;
    let nz = nose.z;

    // Rotation axis = nose × target; angle ∝ |axis| (small angle ≈ sinθ).
    let ax = ny * tz - nz * ty;
    let ay = nz * tx - nx * tz;
    let az = nx * ty - ny * tx;
    const aLen = Math.hypot(ax, ay, az);
    // If nose is near-antiparallel to target, the cross product is ~0 but we
    // still need to rotate 180° — pick an arbitrary perpendicular axis.
    if (aLen < 1e-4) {
      // Already aligned (or anti-aligned). If dot < 0, pick any perpendicular to nose.
      const dot = nx * tx + ny * ty + nz * tz;
      if (dot < -0.9999) {
        // Find a non-parallel axis.
        ax = Math.abs(nx) < 0.9 ? 1 : 0;
        ay = Math.abs(ny) < 0.9 && ax === 0 ? 1 : 0;
        az = Math.abs(nz) < 0.9 && ax === 0 && ay === 0 ? 1 : 0;
        // Make it perpendicular to nose.
        const d = ax * nx + ay * ny + az * nz;
        ax -= d * nx;
        ay -= d * ny;
        az -= d * nz;
        const l = Math.hypot(ax, ay, az) || 1;
        ax /= l;
        ay /= l;
        az /= l;
      } else {
        return; // already aligned
      }
    }

    // PD torque: proportional to rotation error axis (× mass × gain) +
    // derivative damping on angular velocity (× mass × damping gain).
    const HOLD_GAIN = 25; // proportional — higher = snappier
    const HOLD_DAMP = 12; // derivative — higher = less overshoot
    const authority = root.mass;
    root.torque.x += ax * authority * HOLD_GAIN - root.angularVelocity.x * authority * HOLD_DAMP;
    root.torque.y += ay * authority * HOLD_GAIN - root.angularVelocity.y * authority * HOLD_DAMP;
    root.torque.z += az * authority * HOLD_GAIN - root.angularVelocity.z * authority * HOLD_DAMP;
  }

  /**
   * Decouple the current (lowest) stage: split the compound body at the decoupler.
   * Pulls the staged parts' shapes off the flying body, creates a new body for
   * them with proportionate mass, and gives the new body a small separation
   * impulse so it visibly drops away.
   */
  stage(): void {
    const st = this.stages[this.currentStageIndex];
    if (!st) return;
    const toRemove = new Set<string>([...st.engineUids, ...st.tankUids]);
    if (st.decouplerUid) toRemove.add(st.decouplerUid);
    if (toRemove.size === 0) {
      this.currentStageIndex++;
      return;
    }

    // The parts being staged currently live on rootBody's compound (assuming a
    // single body pre-stage). Split them into a new ShipBody.
    const flyingSb = this.ship.bodyByPartUid.get([...toRemove][0]);
    if (!flyingSb) {
      this.currentStageIndex++;
      return;
    }
    const flyingBody = flyingSb.body;

    // Build the jettisoned body: gather shapes+meshes for the removed parts.
    const jettisonedPartUids: string[] = [];
    const jettisonedMass =
      [...toRemove].reduce((s, uid) => s + getPartDef(this.ship.bodyByPartUid.get(uid)!.parts.get(uid)!.partId).dryMass, 0);

    const newBody = new CANNON.Body({
      mass: jettisonedMass,
      collisionFilterGroup: flyingBody.collisionFilterGroup,
      collisionFilterMask: flyingBody.collisionFilterMask,
      linearDamping: 0, // no drag in vacuum
      angularDamping: 0.1,
    });
    newBody.position.copy(flyingBody.position);
    newBody.quaternion.copy(flyingBody.quaternion);
    newBody.velocity.copy(flyingBody.velocity);
    newBody.angularVelocity.copy(flyingBody.angularVelocity);

    // Move shapes from flyingBody to newBody for the staged parts.
    // cannon stores shapes in body.shapes[], offsets in shapeOffsets[], orient in shapeOrientations[].
    const keepShapes: { shape: CANNON.Shape; offset: CANNON.Vec3; quat: CANNON.Quaternion; uid: string }[] = [];
    const moveShapes: { shape: CANNON.Shape; offset: CANNON.Vec3; quat: CANNON.Quaternion; uid: string }[] = [];
    for (let i = flyingBody.shapes.length - 1; i >= 0; i--) {
      const metaUid = this.uidForShapeIndex(flyingSb, i);
      if (!metaUid) continue;
      const shape = flyingBody.shapes[i];
      const offset = flyingBody.shapeOffsets[i];
      const quat = flyingBody.shapeOrientations[i];
      if (toRemove.has(metaUid)) {
        moveShapes.push({ shape, offset, quat, uid: metaUid });
        flyingBody.removeShape(shape);
      } else {
        keepShapes.push({ shape, offset, quat, uid: metaUid });
      }
    }
    for (const m of moveShapes) {
      newBody.addShape(m.shape, m.offset, m.quat);
      jettisonedPartUids.push(m.uid);
    }
    // Recompute mass / inertia for the now-lighter flying body.
    flyingBody.mass = flyingBody.mass - jettisonedMass;
    flyingBody.updateMassProperties();

    // Separation nudge: push the jettisoned body downward (local -Y) a little.
    const sep = flyingBody.quaternion.vmult(new CANNON.Vec3(0, -2, 0));
    newBody.velocity.x += sep.x;
    newBody.velocity.y += sep.y;
    newBody.velocity.z += sep.z;

    this.world.addBody(newBody);

    // Register the new ShipBody and reassign part→body mapping.
    const newParts = new Map<string, BodyMeta>();
    for (const uid of jettisonedPartUids) {
      const meta = flyingSb.parts.get(uid);
      if (meta) {
        newParts.set(uid, meta);
        flyingSb.parts.delete(uid);
        this.ship.bodyByPartUid.set(uid, { body: newBody, partUids: jettisonedPartUids, parts: newParts });
      }
    }
    const newSb: ShipBody = { body: newBody, partUids: jettisonedPartUids, parts: newParts };
    this.ship.shipBodies.push(newSb);
    flyingSb.partUids = flyingSb.partUids.filter((uid) => !toRemove.has(uid));

    // Drop staged engines from the active engine list.
    this.ship.engines = this.ship.engines.filter((e) => {
      const uid = this.engineUid(e);
      return !uid || !toRemove.has(uid);
    });

    this.currentStageIndex++;
  }

  private uidForShapeIndex(sb: ShipBody, shapeIndex: number): string | undefined {
    // shapeOffsets and parts are added in the same iteration order during build,
    // so the Nth shape corresponds to the Nth part added. We rely on insertion order.
    return [...sb.parts.keys()][shapeIndex];
  }

  private engineUid(e: { body: CANNON.Body; def: ReturnType<typeof getPartDef> }): string | undefined {
    for (const sb of this.ship.shipBodies) {
      if (sb.body === e.body) {
        for (const [uid, meta] of sb.parts) {
          if (meta.partId === e.def.id) return uid;
        }
      }
    }
    return undefined;
  }

  /** Apply thrust if any fuel remains. thrust (kN) per engine, throttle-scaled. */
  step(dt: number): void {
    // On first throttle-up, un-freeze the ship so it can fly. Until then it sits
    // perfectly still on the pad (no fall, no tip, no spurious crash).
    if (this.throttle > 0) {
      for (const sb of this.ship.shipBodies) {
        if (sb.body.type !== CANNON.Body.DYNAMIC) {
          sb.body.type = CANNON.Body.DYNAMIC;
          sb.body.wakeUp();
        }
      }
    }

    // Attitude control.
    // - If a hold mode is active (prograde/retrograde/etc), actively point the
    //   nose at that direction with a PD controller. Otherwise, if SAS is on,
    //   just damp rotation to hold current attitude.
    if (this.holdMode !== 'off') {
      this.applyAttitudeHold();
    } else if (this.sasEnabled) {
      const root = this.ship.rootBody;
      if (root.type === CANNON.Body.DYNAMIC) {
        const SAS_GAIN = 8; // higher = snappier attitude hold
        const authority = root.mass * SAS_GAIN;
        root.torque.x -= root.angularVelocity.x * authority;
        root.torque.y -= root.angularVelocity.y * authority;
        root.torque.z -= root.angularVelocity.z * authority;
      }
    }

    if (this.stageActive && this.ship.fuel > 0 && this.throttle > 0) {
      const totalThrust = this.ship.engines.reduce((s, e) => s + (e.def.thrust ?? 0), 0);
      if (totalThrust > 0) {
        const fuelBurn = totalThrust * this.throttle * dt * FUEL_BURN_RATE;
        this.ship.fuel = Math.max(0, this.ship.fuel - fuelBurn);

        // Apply force along the root body's local +Y (engines push "up").
        // Sum onto the root body so a single rigid body accelerates as one.
        const f = totalThrust * this.throttle;
        const localForce = new CANNON.Vec3(0, f, 0);
        const worldForce = this.ship.rootBody.quaternion.vmult(localForce);
        this.ship.rootBody.applyForce(worldForce, new CANNON.Vec3(0, 0, 0));
      }
    }

    this.gravity.applyGravity();
    this.world.step(1 / 60, dt, 3);

    // Sync meshes: each part's world transform = body transform * (localOffset, localQuat).
    for (const sb of this.ship.shipBodies) {
      for (const meta of sb.parts.values()) {
        const worldOffset = sb.body.quaternion.vmult(meta.localOffset);
        meta.mesh.position.set(
          sb.body.position.x + worldOffset.x,
          sb.body.position.y + worldOffset.y,
          sb.body.position.z + worldOffset.z,
        );
        // Parts share the body's rotation in this build (per-part rotation was baked
        // into shape orientation, not the mesh). Keep the mesh upright with the body.
        meta.mesh.quaternion.set(
          sb.body.quaternion.x,
          sb.body.quaternion.y,
          sb.body.quaternion.z,
          sb.body.quaternion.w,
        );
      }
    }

    const now = performance.now() / 1000;
    this.planet.update(now);
    this.moon.update(now);
  }
}
