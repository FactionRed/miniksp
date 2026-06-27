// src/assets.ts
import * as THREE from 'three';

/**
 * Asset loading coordinator.
 *
 * Returns a Three.LoadingManager plus a promise that resolves when all queued
 * assets have loaded (or immediately if none are queued). Currently the game has
 * no external assets — everything is procedurally generated — so this resolves
 * right away. The hook is here so that adding textures, models, or audio later
 * automatically reports progress to the loading screen.
 *
 * Usage when adding real assets:
 *   const texLoader = new THREE.TextureLoader(manager);
 *   const tex = texLoader.load('/textures/planet.png');
 */
export interface AssetInit {
  manager: THREE.LoadingManager;
  /** Resolves once the manager reports onLoad (immediately if nothing is queued). */
  ready: Promise<void>;
}

export function initAssets(): AssetInit {
  const manager = new THREE.LoadingManager();
  // Track whether any load was ever started. LoadingManager only fires onLoad
  // after at least one item begins; if nothing is queued, we resolve ourselves.
  let anythingQueued = false;
  const originalItemStart = manager.itemStart.bind(manager);
  manager.itemStart = (url: string) => {
    anythingQueued = true;
    originalItemStart(url);
  };

  const ready = new Promise<void>((resolve) => {
    manager.onLoad = () => resolve();
    manager.onError = (_url) => {
      // Don't hang forever on a broken asset; log and continue.
      console.warn('[assets] failed to load:', _url);
      resolve();
    };
    // If nothing was ever queued, onLoad never fires — resolve on next tick.
    setTimeout(() => {
      if (!anythingQueued) resolve();
    }, 0);
  });

  return { manager, ready };
}
