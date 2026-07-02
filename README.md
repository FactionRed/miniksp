# Project Orbital Frogs

A super-basic 3D Kerbal Space Program prototype. Build a rocket in the VAB,
launch it, reach orbit, transfer to the moon, land, and return safely.

Runs in the browser or as a standalone Windows desktop app (Electron).

---

## Install

There are three ways to get Project Orbital Frogs running. Pick whichever fits.

### Option A — Download the standalone .exe (easiest, no install)

1. Go to the [Releases page](../../releases/latest).
2. Download **`ProjectOrbitalFrogs-0.1.6-portable.exe`** (~71 MB).
3. Double-click it. That's it — no Node, no browser, no install step.

> The portable exe extracts to a temp folder on first run, so the first launch
> takes a few seconds. Windows SmartScreen may warn about an unsigned download —
> click **More info → Run anyway** (the exe is unsigned because code-signing
> certificates cost money; this is normal for hobbyist projects).

### Option B — Run from source (cross-platform, browser)

Requires [Node.js 18+](https://nodejs.org/) and npm.

```bash
npm install
npm run dev
```

Open http://localhost:5173

### Option C — Download the source zip + run locally

1. Go to the [Releases page](../../releases/latest).
2. Download **`orbitalfrogs-0.1.6-source.zip`** and unzip it.
3. In the unzipped folder:

```bash
npm install
npm run dev          # browser at http://localhost:5173
```

---

## Desktop build (build your own .exe)

If you want to package the app into a standalone Windows executable yourself
(instead of downloading the prebuilt one):

```bash
npm install
npm run build:exe    # → release/ProjectOrbitalFrogs-<version>-portable.exe
```

### ⚠️ One-time setup: enable Developer Mode (Windows)

On a default Windows install, `npm run build:exe` fails unpacking
`electron-builder`'s code-signing toolchain with:

```
ERROR: Cannot create symbolic link : A required privilege is not held by the client
```

This is because the toolchain archive contains macOS symlinks that Windows
won't let a non-admin process recreate. Fix it once:

**Settings → System → For developers → Developer Mode → On**

Then re-run `npm run build:exe`. (Alternatively, run the build from an
Administrator terminal — that also grants the symlink privilege.)

### Development with hot reload (Electron window)

```bash
npm run dev:electron  # launches the app in an Electron window with HMR
```

---

## Controls

**VAB (builder):** Click a part in the left palette, then click in the scene to
place it. Right-drag to orbit the camera, mouse wheel to zoom. `Q`/`E` rotate the
selected part, `Delete` removes it. A launchable design needs at least a Command
Pod and an Engine; add Fuel Tanks for reaction mass and use Struts as decoupler
joints between stages.

**Flight:** `Shift`/`Ctrl` throttle up/down, `Z` full throttle, `X` cut, `Space`
to stage (drops the bottom engine+tank stage). `W`/`S` pitch, `A`/`D` yaw,
`Q`/`E` roll. `T` toggles Stability Assist (SAS). `M` toggles the orbit map,
`F1` reverts to the VAB, `H` toggles the on-screen control hints.

**Attitude autopilot:** the button panel beside the navball points the ship at
prograde / retrograde / normal / anti-normal — click one and the ship rotates to
that heading and holds it.

**Map view (`M`):** left-drag rotates the 3D system view, wheel zooms, `M` closes.

## Goal

Reach a closed orbit around Terra, transfer to Luna, land softly, lift off and
return to Terra's surface, touching down safely. Banners mark each milestone;
**🏆 Mission Complete** ends the run with a "Build Again" button.

## Tech

Three.js (rendering) · cannon-es (physics) · simplex-noise (procedural terrain) ·
Vite + TypeScript · Electron (desktop packaging) · Vitest (unit tests).

## Design & implementation

- Design spec: `docs/superpowers/specs/2026-06-21-miniksp-design.md`
- Implementation plan: `docs/superpowers/plans/2026-06-21-miniksp.md`
- Electron port plan: `docs/superpowers/plans/2026-06-26-electron-port.md`

## Tuning note

The physics constants in `src/physics/constants.ts` and the part stats in
`src/entities/parts-catalog.ts` are tuned so a two-stage rocket can plausibly
reach orbit and the moon. Adjust to taste — see spec §7 risk #4.
