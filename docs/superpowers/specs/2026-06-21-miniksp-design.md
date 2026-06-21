# miniKSP — Design Spec

**Date:** 2026-06-21
**Status:** Approved (architecture), moving to implementation plan
**Goal:** A super-basic 3D Kerbal Space Program prototype with a full gameplay loop, ship building, two celestial bodies (planet + moon).

---

## 1. Scope & Gameplay Loop

**Win condition (full loop):** Build → Launch → Orbit planet → Transfer to Moon → Land on Moon → Lift off → Return to planet → Survive landing.

**Scope cuts (kept intentionally minimal):**
- Two celestial bodies only: **Kerbin-like planet** ("Terra") and **Mun-like moon** ("Luna").
- Flat launchpad at planet's north pole (avoids needing surface-relative rotation tracking for the first build — pole is a known reference point). *See §7 open question.*
- No atmosphere / no drag / no reentry heat (simplifies physics; landing survivability = touchdown vertical speed check).
- No Kerbals / no EVA / no life support.
- No persistent save; one ship per session.
- Recovery: returning to planet surface and touching down below a vertical-speed threshold = "safe return."

## 2. Tech Stack

- **Three.js** — rendering, scene graph, cameras.
- **cannon-es** — rigid-body physics for the ship and its parts.
- **Vite + TypeScript** — dev server, HMR, type safety.
- **Vanilla DOM/CSS** — all UI (sidebar, HUD, map). No React — keeps surface area small.

## 3. Architecture

**Physics gravity model:** cannon-es's default gravity is disabled (`world.gravity.set(0,0,0)`). A custom `GravitySystem` applies central-force gravity per physics step:

```
F = -G · M_body · m_rigidbody / r² · r̂   (toward dominant body)
```

Dominant body = whichever celestial body's sphere of influence (SOI) the rigidbody is currently inside. SOI radius computed by standard formula:

```
r_SOI = a · (m_satelliteBody / m_parent)^(2/5)
```

This is 2-body patched conic at prototype fidelity — the standard approach for KSP-scale mechanics.

### Module layout

```
src/
  main.ts                 # bootstrap: scene, renderer, world, state machine
  core/
    state-machine.ts      # BUILD ↔ FLIGHT ↔ MAP transitions
    input.ts              # global keyboard/pointer dispatch
  physics/
    gravity.ts            # GravitySystem: per-step central force, SOI switching
    celestial-body.ts     # data: mass, radius, position, SOI, three mesh
  entities/
    ship.ts               # assembled ship: cannon body group + three meshes
    part.ts               # Part interface + BasePart behavior
    parts-catalog.ts      # catalog of available parts (pod, tank, engine, wing, strut)
  building/
    vab-controller.ts     # add/remove/move/rotate parts, build constraint graph
    vab-camera.ts         # orbit camera + raycasting for placement
    vab-ui.ts             # sidebar palette, part info, launch button
  flight/
    flight-controller.ts  # flight scene: ship rigidbody, throttle, staging
    controls.ts           # input → throttle, rotation (RCS/torque), camera
    stage-manager.ts      # decouple stages on spacebar
    hud.ts                # throttle, altitude, velocity, apoapsis/periapsis
  ui/
    orbit-map.ts          # 2D overlay: trajectory vs planet/moon
    win-states.ts         # orbit-achieved, moon-landed, safe-return detection/events
```

Each module has one responsibility and is independently testable (pure logic units — gravity math, SOI, part mass/fuel — get unit tests; rendering/controls are exercised via manual playtests).

### Game states

```
BUILD (VAB) ──launch──► FLIGHT ──M key──► MAP (overlay on FLIGHT)
   ▲                        │
   │   revert / crash        │ return + safe touchdown
   └────────────────────────┘
```

## 4. Ship Building (VAB)

**Mode:** free drag-and-drop, surface attach (KSP-style), in a 3D VAB view with an orbit camera.

**Parts catalog (MVP set):**
| Part | Mass (dry, t) | Fuel (units) | Thrust (kN) | Role |
|------|---------------|--------------|-------------|------|
| Command Pod | 0.8 | — | — | control; required |
| Fuel Tank | 0.25 | 400 | — | reaction mass |
| Engine | 1.0 | — | 150 | thrust; consumes fuel |
| Winglet | 0.1 | — | — | decorative/aero (no effect w/o atmosphere) |
| Strut | 0.05 | — | — | decorative mass connector |

Units are abstract "KSP units" tuned for fun, not SI. Constants live in `parts-catalog.ts`.

**Building interactions:**
- Sidebar palette: click a part type → it appears at world origin, selected.
- Pointer-drag selected part on the X/Y plane of the build space; mouse wheel = depth.
- **Surface attach:** when a part is dropped near another part's surface, a snap sphere highlights; release attaches to that surface point. Parts weld via cannon-es `LockConstraint` (or welded into a compound body — see §7).
- **Rotation:** `Q`/`E` rotate the selected part 90° about its attach axis.
- **Delete:** select part → `Delete` key removes it (and any constraints).
- **Launch:** "Launch" button (disabled until a Command Pod exists and the design has an engine) → transitions to FLIGHT, ship spawned on launchpad.

**Ship data model:**
```ts
interface ShipDesign {
  parts: PlacedPart[];        // { partId, position, rotation, attachParent? }
  rootPartId: string;         // command pod
}
```

## 5. Flight & Controls

**Spawn:** ship placed on launchpad at planet north pole, upright (local +Y = away from planet center).

**Controls:**
| Input | Action |
|-------|--------|
| `W`/`S` | Pitch down/up |
| `A`/`D` | Yaw left/right |
| `Q`/`E` | Roll left/right |
| `Shift`/`Ctrl` | Throttle up/down (0–100%) |
| `Z` | Full throttle |
| `X` | Cut throttle |
| `Space` | Stage (decouple + ignite next stage's engines) |
| `M` | Toggle map view |
| `R` | Toggle RCS (linear translation via reaction wheels — simplified) |
| `F1` | Revert to VAB |

**Staging:** engine + fuel tank decouple as a unit on `Space`. Stage list built from the build graph bottom-up. `stage-manager.ts` removes the bottom stage's cannon body + constraints from the world.

**Thrust:** each ignited engine applies force along its local -Z axis, proportional to throttle, consuming fuel from the ship's tanks (shared fuel pool, KSP-simple). Fuel out → engine produces no thrust.

**Camera:** chase camera following the ship; `V` cycles chase/orbit/free.

## 6. UI / HUD / Map

**HUD (during flight):**
- Throttle % (vertical bar, left edge)
- Altitude (above planet surface), Velocity (surface-relative), 
- Apoapsis / Periapsis (computed from current orbit elements)
- Fuel remaining %
- Current SOI (Terra / Luna)

**Map view (`M`):** 2D canvas overlay (top-down). Shows planet circle, moon circle with its orbit, ship position, and **predicted trajectory** (integrate the 2-body forward N steps to draw the path; color-coded for suborbital/orbital/escape).

**Win-state banners:** "Orbit Achieved", "Lunar Landing!", "Safe Return — Mission Complete". Surfaced via `win-states.ts` which inspects ship state each frame.

## 7. Open Questions / Risks

1. **Compound body vs. constraints for the built ship.** Welding all parts into a single cannon `Body` (compound shape) is most stable but makes staging hard (you can't easily split a compound body). Alternative: one body per part + `LockConstraint` welding — staging is trivial (remove body + constraints) but stacked constraints can be jittery. **Decision: one-body-per-part + LockConstraint; if jitter is bad, fall back to compound body and rebuild on stage.** This is the main physics risk; first flight test will validate.
2. **Launchpad at pole vs. equator.** Pole simplifies "up = +Y globally" but a rotating planet is more immersive. MVP = pole (no planet rotation); rotation is a post-MVP stretch.
3. **Trajectory prediction accuracy.** Forward-integrating 2-body is fine for short predictions; long-horizon predictions during SOI transitions will glitch. Acceptable for prototype; map trajectory is advisory, not exact.
4. **Tuning.** Mass/thrust/fuel/planet-size numbers need empirical tuning so reaching orbit is *possible but requires a reasonable design*. We'll pick KSP-like ratios (TWR ~1.3–1.8 at liftoff) and document the target in the plan.

## 8. Testing Strategy

- **Unit tests (Vitest):** gravity force math, SOI computation, orbit elements (apoapsis/periapsis from r/v vectors), fuel consumption, part mass aggregation.
- **Manual playtests** after each milestone (defined in implementation plan): does building work? does launch work? can you reach orbit? etc.
- **No automated browser/E2E tests** in MVP — manual playtest checkpoints instead.

## 9. Out of Scope (explicit non-goals)

- Atmosphere, drag, reentry heat.
- More than 2 celestial bodies.
- Planet rotation / timewarp.
- Persistent saves / revert beyond current mission.
- Kerbals, EVA, science, contracts, funds.
- Symmetry mirror, subassemblies, action groups.
- Sound.
- Multi-ship.
