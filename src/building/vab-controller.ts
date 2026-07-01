// src/building/vab-controller.ts
import * as THREE from 'three';
import type { ShipDesign } from '../entities/ship';
import type { PlacedPart, PartDef } from '../entities/part';
import { getPartDef } from '../entities/parts-catalog';
import { canLaunch } from '../entities/ship';
import type { VabCamera } from './vab-camera';

export class VabController {
  readonly group = new THREE.Group();
  design: ShipDesign = { parts: [], rootPartUid: '' };

  private meshes = new Map<string, THREE.Mesh>(); // uid -> mesh
  private selectedPartId: string | null = null; // catalog partId being placed
  private selectedUid: string | null = null; // placed uid currently selected
  private snapTargetUid: string | null = null; // uid of part the ghost is currently snapped to
  private ghost: THREE.Mesh | null = null;
  private uidCounter = 0;

  constructor(scene: THREE.Scene, private camera: VabCamera) {
    scene.add(this.group);
  }

  /** True when a part is currently being dragged from the palette (ghost shown). */
  isPlacing(): boolean {
    return this.ghost !== null;
  }

  /** Begin placing a part from the palette. */
  beginPlace(partId: string): void {
    this.cancelPlace();
    this.selectedPartId = partId;
    const def = getPartDef(partId);
    this.ghost = this.makeMesh(def, true);
    this.group.add(this.ghost);
  }

  cancelPlace(): void {
    if (this.ghost) {
      this.group.remove(this.ghost);
      this.ghost = null;
    }
    this.selectedPartId = null;
  }

  /**
   * Drag the ghost to follow the pointer. If the pointer is over an existing
   * part, snap against that surface (offset outward by the ghost's half-extent
   * along the hit normal so the new part sits flush on the surface). Otherwise
   * fall back to the ground plane (Y=0). This lets parts stack vertically.
   */
  onPointerMove(ndc: THREE.Vector2): void {
    if (!this.ghost) return;
    const def = getPartDef(this.selectedPartId!);
    const meshes = [...this.meshes.values()];
    const snap = this.camera.pickSurface(meshes, ndc);
    if (snap) {
      // Project the ghost's half-extent onto the snap normal so the new part's
      // face sits flush on the target surface (center = surface + normal*half).
      const half = Math.abs(snap.normal.x * def.size[0]) + Math.abs(snap.normal.y * def.size[1]) + Math.abs(snap.normal.z * def.size[2]);
      this.ghost.position.copy(snap.point).addScaledVector(snap.normal, half);
      this.snapTargetUid = (snap.object.userData.uid as string) ?? null;
      return;
    }
    this.snapTargetUid = null;
    const pt = this.camera.pointerOnGround(ndc);
    if (pt) {
      this.ghost.position.set(pt.x, def.size[1], pt.z);
    }
  }

  /** Drop the ghost, attaching it to the snapped parent (or free-floating). */
  onPointerUp(ndc: THREE.Vector2): void {
    if (!this.ghost || !this.selectedPartId) return;
    // Re-run snap so we have a fresh target even if pointermove missed the last tick.
    const meshes = [...this.meshes.values()];
    const snap = this.camera.pickSurface(meshes, ndc);
    if (snap) this.snapTargetUid = (snap.object.userData.uid as string) ?? null;
    const uid = `u${this.uidCounter++}`;
    const placed: PlacedPart = {
      uid,
      partId: this.selectedPartId,
      position: this.ghost.position.clone(),
      rotation: this.ghost.rotation.clone(),
      attachParentUid: this.snapTargetUid ?? undefined,
    };
    this.design.parts.push(placed);
    if (!this.design.rootPartUid && getPartDef(placed.partId).kind === 'pod') {
      this.design.rootPartUid = uid;
    }
    const mesh = this.makeMesh(getPartDef(placed.partId), false);
    mesh.position.copy(placed.position);
    mesh.rotation.copy(placed.rotation);
    mesh.userData.uid = uid;
    this.meshes.set(uid, mesh);
    this.group.add(mesh);

    this.cancelPlace();
  }

  /** Select an existing placed part for rotate/delete. */
  selectAt(ndc: THREE.Vector2): void {
    const hit = this.pickPartUnder(ndc);
    this.selectedUid = hit;
    for (const [uid, m] of this.meshes) {
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat.emissive) mat.emissive.setHex(uid === hit ? 0x333300 : 0x000000);
    }
  }

  rotateSelected(deg: number): void {
    if (!this.selectedUid) return;
    const mesh = this.meshes.get(this.selectedUid)!;
    mesh.rotation.y += (deg * Math.PI) / 180;
    const placed = this.design.parts.find((p) => p.uid === this.selectedUid)!;
    placed.rotation.copy(mesh.rotation);
  }

  deleteSelected(): void {
    if (!this.selectedUid) return;
    const uid = this.selectedUid;
    // Re-parent orphaned children before removing the part, so the staging
    // tree walk in stage-manager.ts doesn't break on a dangling attachParentUid.
    const parentOfDeleted = this.design.parts.find((p) => p.uid === uid)?.attachParentUid;
    for (const p of this.design.parts) {
      if (p.attachParentUid === uid) {
        p.attachParentUid = parentOfDeleted;
      }
    }
    const mesh = this.meshes.get(uid);
    if (mesh) {
      this.group.remove(mesh);
      this.meshes.delete(uid);
    }
    this.design.parts = this.design.parts.filter((p) => p.uid !== uid);
    if (this.design.rootPartUid === uid) {
      const pod = this.design.parts.find((p) => getPartDef(p.partId).kind === 'pod');
      this.design.rootPartUid = pod?.uid ?? '';
    }
    this.selectedUid = null;
  }

  isReady(): boolean {
    return canLaunch(this.design);
  }

  clear(): void {
    for (const m of this.meshes.values()) this.group.remove(m);
    this.meshes.clear();
    this.design = { parts: [], rootPartUid: '' };
    this.cancelPlace();
  }

  private pickPartUnder(ndc: THREE.Vector2): string | null {
    const meshes = [...this.meshes.values()];
    const hit = this.camera.pick(meshes, ndc);
    return hit?.object.userData.uid ?? null;
  }

  private makeMesh(def: PartDef, ghost: boolean): THREE.Mesh {
    const geom = new THREE.BoxGeometry(def.size[0] * 2, def.size[1] * 2, def.size[2] * 2);
    const mat = new THREE.MeshStandardMaterial({
      color: def.color,
      transparent: ghost,
      opacity: ghost ? 0.5 : 1,
      emissive: 0x000000,
    });
    return new THREE.Mesh(geom, mat);
  }
}
