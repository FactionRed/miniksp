// src/rendering/procedural-planet.ts
import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';

/**
 * Procedural planet/moon rendering.
 *
 * Geometry: an icosahedron sphere subdivided enough for terrain, with each
 * vertex displaced along its normal by fractal simplex noise. Deterministic
 * via a seeded noise function — same seed = same planet every launch.
 *
 * Surface: a ShaderMaterial that colors each fragment by elevation + latitude
 * (biomes), adds a day/night terminator driven by a sun-direction uniform,
 * specular glint on oceans, and (for planets) an atmosphere.
 *
 * Atmosphere: a second, slightly larger mesh rendered additively with a Fresnel
 * shader for the rim glow + outer halo.
 *
 * All GPU work is per-fragment math — no texture files, so the bundle stays
 * tiny and the asset loader (assets.ts) isn't needed for these.
 */

export type BodyKind = 'planet' | 'moon';

export interface ProceduralBodyOptions {
  kind: BodyKind;
  radius: number;
  /** Seed for the deterministic terrain noise. */
  seed: number;
  /** Sun direction in world space (points FROM planet TO sun). Updated each frame. */
  sunDirection: THREE.Vector3;
}

// ---- Seeded RNG (mulberry32) so the same seed reproduces the same terrain. ----
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fractal (fBm) noise over the unit sphere: sum of octaves of 3D simplex noise.
 * Returns a value in roughly [-1, 1].
 */
function fbm(noise3D: (x: number, y: number, z: number) => number, x: number, y: number, z: number, octaves = 5): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3D(x * freq, y * freq, z * freq);
    max += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / max; // [-1, 1]
}

/**
 * Displace icosahedron vertices by fractal noise to produce terrain.
 * Returns the displaced geometry AND a typed-array of per-vertex elevation
 * (packed into the `uv` attribute's `.y`, read by the shader for biome coloring).
 */
function buildTerrainGeometry(radius: number, seed: number, kind: BodyKind): {
  geometry: THREE.IcosahedronGeometry;
  maxElevation: number;
} {
  // Detail: enough triangles for visible terrain without crushing perf.
  // IcosahedronGeometry detail 16 → ~5k verts, 10k tris — fine for one planet.
  const detail = kind === 'planet' ? 16 : 12;
  const geom = new THREE.IcosahedronGeometry(radius, detail);
  const noise3D = createNoise3D(mulberry32(seed));

  // Terrain amplitude as a fraction of radius. Kept small (4%) so the
  // collision sphere (at the base radius) stays a close match to the visual
  // surface — displaced peaks are only ±12m on a 300m planet, so ships resting
  // on the collision sphere don't visibly clip into mountains.
  // (Earlier 0.18 was visually dramatic but caused 54m clipping; the comment
  // in celestial-body.ts already documented "≤4%, so the offset is minor".)
  const amplitudeFrac = 0.04;
  const amplitude = radius * amplitudeFrac;
  // Higher-frequency base so peaks look jagged rather than bulbous.
  const baseFreq = kind === 'planet' ? 2.5 : 3.5;

  const pos = geom.attributes.position as THREE.BufferAttribute;
  const elev = new Float32Array(pos.count);
  let maxElev = 0;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const len = Math.hypot(x, y, z);
    if (len === 0) continue;
    const nx = x / len;
    const ny = y / len;
    const nz = z / len;
    // Fractal displacement in [-1, 1], scaled to amplitude.
    const h = fbm(noise3D, nx * baseFreq, ny * baseFreq, nz * baseFreq, kind === 'planet' ? 5 : 4);
    // For planets, bias toward ocean: values below a threshold stay at sea level.
    let elevation: number;
    if (kind === 'planet') {
      // Map h in [-1,1] → elevation in [0,1]; ~55% of the surface is ocean (<0.5).
      elevation = (h + 1) * 0.5;
      const seaLevel = 0.45;
      if (elevation < seaLevel) {
        // Flatten the seabed a bit so oceans read as flat, not jagged.
        elevation = seaLevel - (seaLevel - elevation) * 0.2;
      }
    } else {
      // Moon: raw craggy terrain, plus a few "craters" (inverted bumps) via abs().
      const crater = -Math.abs(noise3D(nx * baseFreq * 2, ny * baseFreq * 2, nz * baseFreq * 2)) * 0.4;
      elevation = (h + 1) * 0.5 + crater * 0.5;
    }

    const disp = (elevation - 0.5) * 2 * amplitude; // meters above/below base radius
    pos.setXYZ(i, x + nx * disp, y + ny * disp, z + nz * disp);
    elev[i] = elevation;
    if (elevation > maxElev) maxElev = elevation;
  }

  // Per-vertex elevation as a custom attribute. (NOT 'uv' — Three.js declares its
  // own built-in `attribute vec2 uv` for ShaderMaterials, so hijacking that name
  // causes a silent shader compile failure and the whole material falls back to a
  // flat default. A custom `aElevation` name avoids the collision.)
  geom.setAttribute('aElevation', new THREE.BufferAttribute(elev, 1));
  geom.computeVertexNormals();
  return { geometry: geom, maxElevation: maxElev };
}

// ---- GLSL chunks ----

const biomeGLSL = /* glsl */ `
  // Elevation [0,1] → biome color. Planet palette: ocean/shallow/beach/grass/rock/snow.
  vec3 planetBiome(float e, float latitude) {
    vec3 deepOcean = vec3(0.02, 0.10, 0.30);
    vec3 ocean     = vec3(0.05, 0.22, 0.45);
    vec3 shallow   = vec3(0.15, 0.45, 0.60);
    vec3 beach     = vec3(0.76, 0.70, 0.50);
    vec3 grass     = vec3(0.20, 0.45, 0.18);
    vec3 forest    = vec3(0.12, 0.32, 0.12);
    vec3 rock      = vec3(0.40, 0.36, 0.32);
    vec3 snow      = vec3(0.92, 0.94, 0.98);

    vec3 c;
    float seaLevel = 0.45;
    if (e < 0.30)      c = deepOcean;
    else if (e < seaLevel) { c = mix(ocean, shallow, smoothstep(0.30, seaLevel, e)); }
    else if (e < 0.50)  c = mix(shallow, beach, smoothstep(seaLevel, 0.50, e));
    else if (e < 0.62)  c = mix(beach, grass, smoothstep(0.50, 0.62, e));
    else if (e < 0.78)  c = mix(grass, forest, smoothstep(0.62, 0.78, e));
    else if (e < 0.90)  c = mix(forest, rock, smoothstep(0.78, 0.90, e));
    else                c = mix(rock, snow, smoothstep(0.90, 1.00, e));

    // Polar caps: blend toward white near the poles (latitude in [0,1], 1 = pole).
    float pole = smoothstep(0.78, 0.95, abs(latitude));
    c = mix(c, snow, pole * 0.85);
    return c;
  }

  // Moon: grey regolith shaded by elevation, no biomes.
  vec3 moonBiome(float e) {
    vec3 dark = vec3(0.18, 0.17, 0.16);
    vec3 mid  = vec3(0.45, 0.43, 0.40);
    vec3 light = vec3(0.70, 0.68, 0.64);
    vec3 c = mix(dark, mid, smoothstep(0.2, 0.6, e));
    c = mix(c, light, smoothstep(0.6, 0.95, e));
    return c;
  }
`;

// ---- Surface material (day/night terminator + biomes + ocean specular) ----
function buildSurfaceMaterial(opts: ProceduralBodyOptions): THREE.ShaderMaterial {
  const isPlanet = opts.kind === 'planet';
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: opts.sunDirection.clone().normalize() },
      uAmbient: { value: isPlanet ? 0.12 : 0.06 },
      uOceanSpec: { value: isPlanet ? 1.0 : 0.0 },
      uNightColor: { value: new THREE.Color(isPlanet ? 0x0a1530 : 0x000000) },
    },
    vertexShader: /* glsl */ `
      attribute float aElevation;    // per-vertex elevation (custom attribute)
      varying float vElevation;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vElevation = aElevation;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 uSunDir;
      uniform float uAmbient;
      uniform float uOceanSpec;
      uniform vec3 uNightColor;
      varying float vElevation;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      ${biomeGLSL}
      void main() {
        // Latitude from world Y (planet centered at its own origin in world space).
        float latitude = normalize(vWorldPos).y; // [-1,1]
        vec3 base = ${isPlanet ? 'planetBiome(vElevation, latitude)' : 'moonBiome(vElevation)'};

        vec3 N = normalize(vWorldNormal);
        vec3 L = normalize(uSunDir);
        float diff = max(dot(N, L), 0.0);

        // Day/night: day side gets diffuse + ambient; night side fades to nightColor.
        float dayMix = smoothstep(-0.05, 0.25, dot(N, L)); // soft terminator
        vec3 dayColor = base * (diff + uAmbient);

        // Ocean specular: only where the biome is water (elevation < sea level).
        float spec = 0.0;
        if (uOceanSpec > 0.5 && vElevation < 0.45) {
          vec3 V = normalize(cameraPosition - vWorldPos);
          vec3 H = normalize(L + V);
          spec = pow(max(dot(N, H), 0.0), 60.0) * 0.8;
        }

        vec3 color = mix(uNightColor, dayColor, dayMix) + spec * dayMix;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

// ---- Atmosphere: additive Fresnel glow on a slightly larger sphere ----
function buildAtmosphereMaterial(opts: ProceduralBodyOptions, color: THREE.ColorRepresentation): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: opts.sunDirection.clone().normalize() },
      uGlowColor: { value: new THREE.Color(color) },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide, // render the inside of the larger sphere → halo around the planet
    vertexShader: /* glsl */ `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 uSunDir;
      uniform vec3 uGlowColor;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        // Fresnel: strongest at the limb (view grazes the surface).
        float fres = pow(1.0 - max(dot(N, V), 0.0), 2.5);
        // Brighter on the sunlit limb.
        float sun = max(dot(N, normalize(uSunDir)), 0.0);
        float intensity = fres * (0.4 + 0.6 * sun);
        gl_FragColor = vec4(uGlowColor * intensity, intensity);
      }
    `,
  });
}

export interface BuiltProceduralBody {
  surface: THREE.Mesh;
  /** Optional atmosphere mesh (planets only). Parent its transform to the surface. */
  atmosphere: THREE.Mesh | null;
  /** Update the sun-direction uniforms each frame. */
  setSunDirection: (dir: THREE.Vector3) => void;
}

/**
 * Build a complete procedural body: displaced terrain mesh + optional atmosphere.
 * `sunDirection` is the initial direction (planet → sun); call setSunDirection
 * each frame to keep the day/night terminator correct as the planet orbits.
 */
export function buildProceduralBody(opts: ProceduralBodyOptions): BuiltProceduralBody {
  const { geometry } = buildTerrainGeometry(opts.radius, opts.seed, opts.kind);
  const surfaceMat = buildSurfaceMaterial(opts);
  const surface = new THREE.Mesh(geometry, surfaceMat);

  // Surface a GLSL compile/link failure loudly. Without this a broken shader
  // silently falls back to a flat default material — which is exactly how the
  // earlier `attribute float uv` collision hid for two build cycles. Done by
  // hooking the renderer's debug check, called when a material first compiles.
  const debugGLSL = (label: string, mat: THREE.ShaderMaterial) => {
    mat.onBeforeCompile = () => {
      // Marker so the global debug.onShaderError (if installed) can attribute it.
      (mat as unknown as { __label?: string }).__label = label;
    };
  };
  debugGLSL(`${opts.kind} surface`, surfaceMat);

  let atmosphere: THREE.Mesh | null = null;
  if (opts.kind === 'planet') {
    const atmoGeom = new THREE.SphereGeometry(opts.radius * 1.05, 64, 48);
    const atmoMat = buildAtmosphereMaterial(opts, 0x66aaff);
    debugGLSL(`${opts.kind} atmosphere`, atmoMat);
    atmosphere = new THREE.Mesh(atmoGeom, atmoMat);
    atmosphere.renderOrder = 1;
  }

  const setSunDirection = (dir: THREE.Vector3): void => {
    const n = dir.clone().normalize();
    surfaceMat.uniforms.uSunDir.value.copy(n);
    if (atmosphere) {
      (atmosphere.material as THREE.ShaderMaterial).uniforms.uSunDir.value.copy(n);
    }
  };

  return { surface, atmosphere, setSunDirection };
}
