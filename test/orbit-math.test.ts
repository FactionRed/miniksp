import { describe, it, expect } from 'vitest';
import { orbitalEnergy, apoapsisPeriapsis, sphereOfInfluence } from '../src/physics/orbit-math';

describe('orbitalEnergy', () => {
  it('is negative for a bound circular-ish orbit', () => {
    const mu = 9.82 * 5e7; // G*M for Terra
    const r = [400, 0, 0];
    const v = [0, 0, 350]; // sub-orbital-ish speed
    const e = orbitalEnergy(r, v, mu);
    expect(e).toBeLessThan(0);
  });
});

describe('apoapsisPeriapsis', () => {
  it('returns Ap > Pe and both > 0 for an elliptical orbit', () => {
    const mu = 9.82 * 5e7;
    const r = [400, 0, 0];
    const v = [0, 0, 400];
    const { apoapsis, periapsis } = apoapsisPeriapsis(r, v, mu);
    expect(apoapsis).toBeGreaterThan(periapsis);
    expect(periapsis).toBeGreaterThan(0);
  });

  it('returns equal Ap and Pe for a circular orbit', () => {
    const mu = 9.82 * 5e7;
    const r = [400, 0, 0];
    // circular speed v = sqrt(mu / r)
    const vc = Math.sqrt(mu / 400);
    const v = [0, 0, vc];
    const { apoapsis, periapsis } = apoapsisPeriapsis(r, v, mu);
    expect(apoapsis).toBeCloseTo(400, 1);
    expect(periapsis).toBeCloseTo(400, 1);
  });
});

describe('sphereOfInfluence', () => {
  it('Luna SOI is a sensible fraction of its orbit radius', () => {
    const planetMass = 5e7;
    const moonMass = 3e6;
    const moonOrbitRadius = 4000;
    const soi = sphereOfInfluence(moonOrbitRadius, moonMass, planetMass);
    // formula: a * (m/m_parent)^(2/5)
    const expected = 4000 * Math.pow(3e6 / 5e7, 0.4);
    expect(soi).toBeCloseTo(expected, 1);
    expect(soi).toBeGreaterThan(100);
    expect(soi).toBeLessThan(moonOrbitRadius);
  });
});
