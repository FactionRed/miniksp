# miniKSP → Standalone .exe (Electron) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the existing miniKSP web app into a standalone Windows `.exe` via Electron, so it runs by double-clicking with no browser, no Node, no install steps for the end user (portable build), while keeping the existing dev workflow (`npm run dev`) intact.

**Architecture:** Electron runs two processes: a tiny **main process** (`electron/main.ts`) that creates the window, and the existing web app as the **renderer** (unchanged `src/main.ts`). Vite builds both in one config via `vite-plugin-electron/simple`. In dev, Vite serves the renderer with HMR while the main process hot-reloads. For distribution, `electron-builder` bundles the built renderer + main + the Electron runtime into a portable `.exe` (NSIS installer optional, off by default).

**Tech Stack:** Electron (latest stable), `vite-plugin-electron` (the `simple` preset), `electron-builder`. TypeScript throughout. **No code changes to the existing game** (`src/**`) — it's already a vanilla-DOM web app with no backend, so it ports unchanged.

**Key decisions (locked here):**
- **Portable build, not installer.** Produces a folder with `miniKSP.exe` + resources the user can zip and run anywhere. An NSIS `.exe` installer is noted as an optional switch.
- **Single window, fixed-size-capped, no native menu** (we set `Menu.setApplicationMenu(null)` — the in-game HUD is the UI).
- **No preload script needed.** The app uses only `window`/`document` APIs (no Node integration, no IPC). `vite-plugin-electron/simple` still generates an empty preload for the default secure config; we keep it minimal.
- **Existing tests stay green and untouched.** Electron tooling is devDependencies only.

---

## File Structure (additions only)

```
miniksp/
  electron/
    main.ts            # Electron main process: create window, load renderer, no menu
    preload.ts         # Empty/minimal (no IPC needed; kept for secure defaults)
    tsconfig.json      # Separate tsconfig for main process (CommonJS module, node types)
  vite.config.ts       # MODIFIED: add vite-plugin-electron/simple
  electron-builder.yml # NEW: packaging config (portable target, Win 64-bit)
  package.json         # MODIFIED: add electron deps + scripts (dev:electron, build:exe)
  .gitignore           # MODIFIED: ignore release/ output
  src/                 # UNCHANGED — the game
  test/                # UNCHANGED — tests
```

**Nothing in `src/` or `test/` changes.** That's the whole point — the port is packaging, not a rewrite.

---

## Task 1: Add Electron dependencies + main-process tsconfig

**Files:**
- Modify: `package.json`
- Create: `electron/tsconfig.json`

- [ ] **Step 1: Add devDependencies for Electron tooling**

These are all devDependencies — they never ship to the end user's runtime bundle (electron-builder includes the Electron runtime binary itself).

```json
"devDependencies": {
  "@types/three": "^0.165.0",
  "electron": "^31.0.0",
  "electron-builder": "^24.13.3",
  "typescript": "^5.4.0",
  "vite": "^5.2.0",
  "vite-plugin-electron": "^0.28.0",
  "vitest": "^1.6.0"
}
```

- [ ] **Step 2: Add npm scripts for Electron dev + packaging**

Add to `package.json` `scripts` (keep existing `dev`, `build`, `test`, etc.):

```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "dev:electron": "vite",
  "build:renderer": "vite build",
  "build:exe": "vite build && electron-builder --win portable",
  "build:exe:nsis": "vite build && electron-builder --win nsis"
}
```

Rationale: `dev:electron` reuses `vite` (the plugin auto-spawns Electron in dev). `build:exe` produces the portable exe; `build:exe:nsis` is the optional installer variant.

- [ ] **Step 3: Create `electron/tsconfig.json`**

The main process is Node/CommonJS, separate from the browser ESM config. Keep it minimal and isolated so it doesn't conflict with the renderer's `tsconfig.json`.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "../dist-electron",
    "types": ["node"]
  },
  "include": ["./**/*.ts"]
}
```

- [ ] **Step 4: Install**

Run: `npm install`
Expected: installs `electron`, `electron-builder`, `vite-plugin-electron` with no errors. (Electron downloads a ~180 MB binary on first install — this is expected and may take a minute.)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json electron/tsconfig.json
git commit -m "port: add electron + electron-builder + vite-plugin-electron deps; main tsconfig"
```

---

## Task 2: Write the Electron main process + preload

**Files:**
- Create: `electron/main.ts`
- Create: `electron/preload.ts`

- [ ] **Step 1: Write `electron/main.ts`**

Creates a 1280×800 window (resizable, capped at fullscreen), removes the default menu (the game's HUD is the UI), and loads the renderer. In dev it loads the Vite dev server; in the packaged exe it loads the built `dist/index.html` via the `file://` protocol.

```ts
// electron/main.ts
import { app, BrowserWindow, Menu } from 'electron';
import * as path from 'path';

// Disable the default application menu — the game provides its own HUD UI.
Menu.setApplicationMenu(null);

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'miniKSP',
    backgroundColor: '#05060a',
    webPreferences: {
      // Secure defaults: no Node in renderer, isolated context, minimal preload.
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Dev: Vite dev server. Packaged: built renderer file:// URL.
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    // macOS: re-create a window when the dock icon is clicked.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // On non-macOS, quit when all windows are closed.
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 2: Write `electron/preload.ts` (minimal)**

The game uses only standard browser APIs — no IPC, no Node. We keep an empty preload because Electron's secure config (`contextIsolation: true`) expects one to be referenced; an empty preload just means "no bridge needed."

```ts
// electron/preload.ts
// No-op preload. miniKSP uses only standard browser APIs (DOM, Canvas, WebGL via
// Three.js) and needs no Node/IPC bridge to the main process. Kept for the
// secure contextIsolation default.
export {};
```

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts electron/preload.ts
git commit -m "port: electron main process (window + no-menu) and empty preload"
```

---

## Task 3: Wire `vite-plugin-electron` into `vite.config.ts`

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Read current `vite.config.ts`** to preserve the existing Vitest config.

Current content (do not lose the `test` block):

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  server: { open: true },
  test: {
    globals: true,
    environment: 'node',
  },
});
```

- [ ] **Step 2: Add the Electron plugin**

The `simple` preset auto-spawns Electron during `vite` (dev) and compiles `electron/main.ts` + `electron/preload.ts` during `vite build`. It injects `VITE_DEV_SERVER_URL` so `main.ts` knows whether it's in dev or packaged.

Replace `vite.config.ts` with:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron/simple';

export default defineConfig({
  plugins: [
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: { outDir: 'dist-electron' },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: { outDir: 'dist-electron' },
        },
      },
      // Don't spawn Electron when running tests or building the renderer alone.
      renderer: {},
    }),
  ],
  server: { open: false }, // Electron opens its own window; avoid the browser tab too
  test: {
    globals: true,
    environment: 'node',
  },
});
```

Note: `server.open` changes from `true` to `false` because in the Electron workflow the Electron window is the app — opening a browser tab too is redundant noise.

- [ ] **Step 3: Verify dev server still boots (headless check)**

The existing `npm run dev` still works, but now also launches Electron. We can't see the Electron GUI from here, but we can confirm the config is valid by checking the Vite config parses.

Run: `npx vite build`
Expected: completes without error; produces `dist/` (renderer) AND `dist-electron/main.js` + `dist-electron/preload.js`. This proves both main and renderer compile.

- [ ] **Step 4: Verify the existing tests still pass (the plugin must not break vitest)**

Run: `npm test`
Expected: all 14 tests still pass.

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts
git commit -m "port: wire vite-plugin-electron/simple (compiles main+preload; spawns electron in dev)"
```

---

## Task 4: Add `electron-builder.yml` + package config

**Files:**
- Create: `electron-builder.yml`
- Modify: `package.json` (add `build` pointer field)

- [ ] **Step 1: Write `electron-builder.yml`**

Portable target by default: produces `release/miniKSP <version>.exe` (a single self-extracting exe that runs the app with no install). Configures the app to bundle the built renderer (`dist/`) and compiled main (`dist-electron/`).

```yaml
appId: com.miniksp.game
productName: miniKSP
directories:
  output: release
files:
  - dist/**/*
  - dist-electron/**/*
win:
  target:
    - target: portable
      arch:
        - x64
  artifactName: miniKSP-${version}-portable.exe
# Optional: uncomment to also build an NSIS installer instead of/in addition to portable.
# nsis:
#   oneClick: false
#   allowToChangeInstallationDirectory: true
```

- [ ] **Step 2: Add `build` config pointer to `package.json`**

`electron-builder` reads its config from `electron-builder.yml` automatically, but adding an explicit `build` field in `package.json` makes the source of authority unambiguous and survives if someone moves the config.

Add this top-level field to `package.json`:

```json
"build": {
  "extends": "./electron-builder.yml"
}
```

Also add app metadata fields electron-builder uses (top-level in `package.json`, alongside `name`/`version`):

```json
"author": "miniKSP",
"description": "A super-basic 3D KSP prototype. Build a rocket, reach orbit, transfer to the moon, land, and return."
```

- [ ] **Step 3: Add `release/` to `.gitignore`**

The build output is large and should never be committed.

Append to `.gitignore`:

```
release/
dist-electron/
```

(`dist/` is already ignored.)

- [ ] **Step 4: Commit**

```bash
git add electron-builder.yml package.json .gitignore
git commit -m "port: electron-builder config (portable win-x64) + package metadata"
```

---

## Task 5: Build the .exe and verify

**Files:** none (verification only)

- [ ] **Step 1: Run the full build pipeline**

Run: `npm run build:exe`
Expected: 
1. `vite build` compiles the renderer → `dist/` and the main process → `dist-electron/`.
2. `electron-builder --win portable` downloads the Electron runtime for win-x64 (first time only, ~100 MB) and packages everything.
3. Output: `release/miniKSP-0.1.0-portable.exe` (or similar).

This step can take several minutes the first time. If it fails, capture the exact error — most likely causes are a missing `win-x64` Electron cache (re-run) or a path issue in `electron-builder.yml`.

- [ ] **Step 2: Confirm the exe exists**

Run: `ls -la release/*.exe`
Expected: one `.exe` file, ~80-150 MB.

- [ ] **Step 3: Manual smoke test (user)**

The user double-clicks `release/miniKSP-0.1.0-portable.exe`. Expected: the miniKSP window opens, the VAB appears, building/launching works as in the browser. This is a manual checkpoint — we cannot run the GUI exe from the agent environment.

- [ ] **Step 4: Re-run unit tests to confirm nothing regressed**

Run: `npm test`
Expected: 14/14 pass.

- [ ] **Step 5: Commit any final tweaks + update README**

Add a "Desktop build" section to `README.md`:

```markdown
## Desktop build (standalone .exe)

```bash
npm install
npm run build:exe        # → release/miniKSP-<version>-portable.exe
```

The portable exe runs by double-clicking — no install required. Requires Windows x64.

For development with hot reload:
```bash
npm run dev:electron     # launches the app in an Electron window with HMR
```
```

Commit:

```bash
git add README.md
git commit -m "port: document desktop .exe build in README"
```

---

## Self-Review

**1. Spec/coverage check:**
- "Standalone .exe" → Task 4 + Task 5 (electron-builder portable target). ✓
- "Port current progress" → Task 3 wires the existing renderer untouched (`src/` unchanged). ✓
- Works without browser/Node for the user → portable exe bundles the Electron runtime. ✓
- Dev workflow preserved → Task 3 keeps `npm run dev`/`npm test` working. ✓
- Cross-cutting risks (main tsconfig isolation, vitest-not-broken-by-plugin) → each has an explicit verification step. ✓

**2. Placeholder scan:** No "TBD"/"TODO". The only conditional is the optional NSIS installer block, which is real commented config (a toggle), not a missing piece. ✓

**3. Type/config consistency:**
- `electron/main.ts` references `__dirname` and `process.env.VITE_DEV_SERVER_URL` — both valid under the main-process tsconfig (`types: ["node"]`) and the `simple` plugin's contract. ✓
- `preload` path in `main.ts` (`dist-electron/preload.js`) matches the plugin's `outDir: 'dist-electron'` in `vite.config.ts`. ✓
- `electron-builder.yml` `files` glob matches the actual build output dirs (`dist/`, `dist-electron/`). ✓
- Existing `tsconfig.json` (renderer) is untouched and still excludes `electron/`. ✓

**4. Risk register (called out honestly):**
- **Electron runtime size (~80-150 MB exe):** inherent to the chosen approach (user picked Electron over Tauri). Not a bug.
- **First build downloads the win-x64 Electron binary (~100 MB):** expected, one-time.
- **Cannot smoke-test the GUI exe from the agent environment:** Task 5 Step 3 is an explicit user checkpoint — flagged, not hidden.
- **`server.open: true` → `false` behavior change:** minor UX change documented in the task rationale.

Plan is internally consistent and covers the request end-to-end.
