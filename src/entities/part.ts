// src/entities/part.ts
import * as THREE from 'three';

export type PartKind = 'pod' | 'tank' | 'engine' | 'winglet' | 'strut';

export interface PartDef {
  id: string;
  name: string;
  kind: PartKind;
  dryMass: number; // tonnes
  fuel?: number; // units (tanks only)
  thrust?: number; // kN (engines only)
  /** Half-extents of the part's bounding box, used for mesh + collision. */
  size: [number, number, number];
  color: number;
}

/** A placed part within a ship design (local-space transform within the VAB). */
export interface PlacedPart {
  uid: string; // unique within a design
  partId: string; // references PartDef.id
  position: THREE.Vector3; // local position relative to design origin
  rotation: THREE.Euler; // local rotation
  attachParentUid?: string; // uid of the part this is welded to
}
