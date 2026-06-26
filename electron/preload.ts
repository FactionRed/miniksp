// electron/preload.ts
// No-op preload. miniKSP uses only standard browser APIs (DOM, Canvas, WebGL via
// Three.js) and needs no Node/IPC bridge to the main process. Kept for the
// secure contextIsolation default that the main process references.
export {};
