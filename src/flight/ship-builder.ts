// src/flight/ship-builder.ts
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import type { ShipDesign } from '../entities/ship';
import { getPartDef } from '../entities/parts-catalog';
import { COLLISION_GROUP, SHIP_COLLISION_MASK } from '../physics/collision-groups';
import type { PartDef } from '../entities/part';

export interface BodyMeta {
  uid: string;
  partId: string;
  mesh: THREE.Mesh;
  /** This part's offset from its rigid body's center, in body-local space. */
  localOffset: CANNON.Vec3;
}

/** One rigid body holding one or more welded parts (compound shape). */
export interface ShipBody {
  body: CANNON.Body;
  /** uids of all parts welded into this body. */
  partUids: string[];
  /** Per-part metadata for mesh sync. */
  parts: Map<string, BodyMeta>;
}

export interface EngineRef {
  body: CANNON.Body;
  def: PartDef;
}

export interface BuiltShip {
  group: THREE.Group;
  shipBodies: ShipBody[];
  fuel: number;
  rootBody: CANNON.Body;
  engines: EngineRef[];
  /** Flat lookup: part uid -> the ShipBody that contains it. */
  bodyByPartUid: Map<string, ShipBody>;
}

/**
 * Build ship physics as a SINGLE compound rigid body (one Body with one Box shape
 * per part, at the part's offset). This is far more stable than N bodies held
 * together by constraints — there are no internal solver forces to fight, so the
 * stack can't jitter itself apart on the launchpad. Staging splits this body.
 */
export function buildShipPhysics(design: ShipDesign): BuiltShip {
  const group = new THREE.Group();
  const fuel = design.parts.reduce((s, p) => s + (getPartDef(p.partId).fuel ?? 0), 0);

  // Pick a reference origin for the compound body = center of mass-ish.
  // Simplest: average of all part positions. Shapes are placed relative to it.
  const cx =
    design.parts.reduce((s, p) => s + p.position.x, 0) / Math.max(1, design.parts.length);
  const cy =
    design.parts.reduce((s, p) => s + p.position.y, 0) / Math.max(1, design.parts.length);
  const cz =
    design.parts.reduce((s, p) => s + p.position.z, 0) / Math.max(1, design.parts.length);

  const body = new CANNON.Body({
    mass: design.parts.reduce((s, p) => s + getPartDef(p.partId).dryMass, 0),
    collisionFilterGroup: COLLISION_GROUP.SHIP,
    collisionFilterMask: SHIP_COLLISION_MASK,
    // NO linear damping — there's no atmosphere in this prototype, so velocity
    // must persist exactly (damping would decay every orbit into the ground).
    // A little angular damping tames rotation-rate noise for nicer flight feel.
    linearDamping: 0,
    angularDamping: 0.1,
  });
  body.position.set(cx, cy, cz);

  const parts = new Map<string, BodyMeta>();
  const tmpQuat = new THREE.Quaternion();

  for (const placed of design.parts) {
    const def = getPartDef(placed.partId);
    const shape = new CANNON.Box(new CANNON.Vec3(def.size[0], def.size[1], def.size[2]));
    // Each part may have its own rotation; the compound body is currently upright
    // (identity quat), so per-part rotation is baked into a per-shape orientation.
    tmpQuat.setFromEuler(placed.rotation);
    const offset = new CANNON.Vec3(
      placed.position.x - cx,
      placed.position.y - cy,
      placed.position.z - cz,
    );
    const quat = new CANNON.Quaternion(tmpQuat.x, tmpQuat.y, tmpQuat.z, tmpQuat.w);
    body.addShape(shape, offset, quat);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(def.size[0] * 2, def.size[1] * 2, def.size[2] * 2),
      new THREE.MeshStandardMaterial({ color: def.color }),
    );
    mesh.position.copy(placed.position);
    mesh.rotation.copy(placed.rotation);
    group.add(mesh);
    parts.set(placed.uid, { uid: placed.uid, partId: placed.partId, mesh, localOffset: offset });
  }

  const shipBody: ShipBody = {
    body,
    partUids: design.parts.map((p) => p.uid),
    parts,
  };
  const bodyByPartUid = new Map<string, ShipBody>();
  for (const p of design.parts) bodyByPartUid.set(p.uid, shipBody);

  let rootBody: CANNON.Body | null = null;
  const podPart = design.parts.find((p) => getPartDef(p.partId).kind === 'pod');
  if (podPart) rootBody = body;
  if (!rootBody) rootBody = body; // degenerate fallback

  const engines: EngineRef[] = [];
  for (const placed of design.parts) {
    const def = getPartDef(placed.partId);
    if (def.kind === 'engine') engines.push({ body, def });
  }

  return { group, shipBodies: [shipBody], fuel, rootBody, engines, bodyByPartUid };
}
