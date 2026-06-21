// Tuned game-physics constants. NOT real SI — abstract "KSP units."
// See design spec §7 risk #4 (tuning).

export const G = 9.82; // gravitational constant in game units (tuned)

export const PLANET = {
  name: 'Terra',
  radius: 300, // m
  mass: 5.0e7, // t   (with G above gives surface g = G*M/r^2 ~ 5.45 m/s^2)
  color: 0x3366cc,
  position: new Float64Array([0, 0, 0]),
  // SOI computed in orbit-math; for the planet (parent of nothing) it's infinite.
};

export const MOON = {
  name: 'Luna',
  radius: 80, // m
  mass: 3.0e6, // t
  color: 0xaaaaaa,
  orbitRadius: 4000, // m from planet center
  orbitPeriod: 1800, // s (full orbit); used for moon position over time
};
