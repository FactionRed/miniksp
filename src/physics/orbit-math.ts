// src/physics/orbit-math.ts
// 2-body orbit element helpers. All vectors are [x,y,z] arrays of numbers.

export type Vec3 = [number, number, number];

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function mag(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

/** Specific orbital energy: e = v^2/2 - mu/r. Negative = bound (elliptical). */
export function orbitalEnergy(r: Vec3, v: Vec3, mu: number): number {
  return dot(v, v) / 2 - mu / mag(r);
}

/** Apoapsis & periapsis distance from body center, from r,v. */
export function apoapsisPeriapsis(r: Vec3, v: Vec3, mu: number): { apoapsis: number; periapsis: number } {
  const rMag = mag(r);
  // eccentricity vector e_vec = ((v^2 - mu/r) r - (r·v) v) / mu
  const v2 = dot(v, v);
  const rv = dot(r, v);
  const k: Vec3 = [
    (v2 - mu / rMag) * r[0] - rv * v[0],
    (v2 - mu / rMag) * r[1] - rv * v[1],
    (v2 - mu / rMag) * r[2] - rv * v[2],
  ];
  const eVec: Vec3 = [k[0] / mu, k[1] / mu, k[2] / mu];
  const ecc = mag(eVec);
  // semi-major axis from energy: a = -mu / (2e)
  const energy = orbitalEnergy(r, v, mu);
  const a = -mu / (2 * energy);
  const apoapsis = a * (1 + ecc);
  const periapsis = a * (1 - ecc);
  return { apoapsis, periapsis };
}

/** Sphere of influence radius: a * (m_body / m_parent)^(2/5). */
export function sphereOfInfluence(orbitRadius: number, bodyMass: number, parentMass: number): number {
  return orbitRadius * Math.pow(bodyMass / parentMass, 0.4);
}

/** Whether current r,v yields a closed orbit (energy < 0 and periapsis > body radius). */
export function isClosedOrbit(r: Vec3, v: Vec3, mu: number, bodyRadius: number): boolean {
  const energy = orbitalEnergy(r, v, mu);
  if (energy >= 0) return false;
  const { periapsis } = apoapsisPeriapsis(r, v, mu);
  return periapsis > bodyRadius;
}
