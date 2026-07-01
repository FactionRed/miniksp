// Tuned game-physics constants. NOT real SI — abstract "KSP units," calibrated
// so surface gravity is ~10 m/s^2 (Earth-like, intuitive) and orbital velocity
// at the surface is ~55 m/s (achievable in a few seconds of burn).
// See design spec §7 risk #4 (tuning) — these are the result of the M10 playtest.

export const G = 1; // gravitational constant in game units

// Planet: surface g = G*M/R^2 = 1 * 900000 / 300^2 = 10 m/s^2
export const PLANET = {
  name: 'Terra',
  radius: 300, // m
  mass: 9.0e5, // t  (gives mu = G*M = 900,000; surface g = 10 m/s^2)
  color: 0x3366cc,
  kind: 'planet' as const,
  seed: 1337, // procedural terrain seed
  position: new Float64Array([0, 0, 0]),
  // SOI computed in orbit-math; for the planet (parent of nothing) it's infinite.
};

// Moon: surface g = G*M/R^2 = 1 * 12800 / 80^2 = 2 m/s^2
export const MOON = {
  name: 'Luna',
  radius: 80, // m
  mass: 1.28e4, // t  (gives mu = 12,800; surface g = 2 m/s^2)
  color: 0xaaaaaa,
  kind: 'moon' as const,
  seed: 7, // procedural terrain seed
  orbitRadius: 4000, // m from planet center
  orbitPeriod: 1800, // s (full orbit); used for moon position over time
};

// Direction FROM any body TO the sun, in world space. The procedural shader uses
// this for the day/night terminator + atmosphere sunlit limb. Kept here as a
// single source of truth; flight-controller updates each body with it per frame.
export const SUN_DIRECTION = new Float64Array([1, 0.35, 0.6]);

// Moon's sphere of influence: a * (m_body / m_parent)^(2/5).
// Precomputed so all consumers (HUD, win-states, gravity) use the exact same
// boundary instead of hardcoding an approximation that drifts.
import { sphereOfInfluence } from './orbit-math';
export const MOON_SOI = sphereOfInfluence(MOON.orbitRadius, MOON.mass, PLANET.mass);
