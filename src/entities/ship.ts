// src/entities/ship.ts
import type { PlacedPart } from './part';
import { getPartDef } from './parts-catalog';

export interface ShipDesign {
  parts: PlacedPart[];
  rootPartUid: string;
}

export function aggregateMass(d: ShipDesign): number {
  return d.parts.reduce((sum, p) => sum + getPartDef(p.partId).dryMass, 0);
}

export function aggregateFuel(d: ShipDesign): number {
  return d.parts.reduce((sum, p) => sum + (getPartDef(p.partId).fuel ?? 0), 0);
}

export function hasPod(d: ShipDesign): boolean {
  return d.parts.some((p) => getPartDef(p.partId).kind === 'pod');
}

export function hasEngine(d: ShipDesign): boolean {
  return d.parts.some((p) => getPartDef(p.partId).kind === 'engine');
}

export function canLaunch(d: ShipDesign): boolean {
  return hasPod(d) && hasEngine(d);
}
