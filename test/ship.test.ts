import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ShipDesign, aggregateMass, aggregateFuel, canLaunch } from '../src/entities/ship';

function design(partIds: string[]): ShipDesign {
  return {
    parts: partIds.map((partId, i) => ({
      uid: `p${i}`,
      partId,
      position: new THREE.Vector3(0, i * 3, 0),
      rotation: new THREE.Euler(),
    })),
    rootPartUid: 'p0',
  };
}

describe('aggregateMass', () => {
  it('sums dry masses', () => {
    expect(aggregateMass(design(['pod', 'tank', 'engine']))).toBeCloseTo(0.8 + 0.25 + 1.0, 6);
  });
});

describe('aggregateFuel', () => {
  it('sums fuel across tanks', () => {
    expect(aggregateFuel(design(['pod', 'tank', 'tank', 'engine']))).toBe(800);
  });
  it('is 0 with no tanks', () => {
    expect(aggregateFuel(design(['pod', 'engine']))).toBe(0);
  });
});

describe('canLaunch', () => {
  it('requires a pod and an engine', () => {
    expect(canLaunch(design(['pod']))).toBe(false);
    expect(canLaunch(design(['tank', 'engine']))).toBe(false);
    expect(canLaunch(design(['pod', 'tank', 'engine']))).toBe(true);
  });
});
