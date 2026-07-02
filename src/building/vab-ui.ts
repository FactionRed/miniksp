// src/building/vab-ui.ts
import { PARTS_CATALOG } from '../entities/parts-catalog';

export interface VabUiCallbacks {
  onSelectPart: (partId: string | null) => void;
  onDeleteSelected: () => void;
  onRotateSelected: (degrees: number) => void;
  onLaunch: () => void;
}

export class VabUi {
  private root: HTMLElement;
  private launchBtn: HTMLButtonElement;
  onReadyChange: (canLaunch: boolean) => void = () => {};

  constructor(cbs: VabUiCallbacks) {
    this.root = document.createElement('div');
    this.root.id = 'vab-ui';
    this.root.innerHTML = `
      <div class="panel">
        <h2>Parts</h2>
        <div id="palette"></div>
      </div>
      <div class="panel actions">
        <button id="rotate-q">Rotate -90°</button>
        <button id="rotate-e">Rotate +90°</button>
        <button id="delete">Delete (Del)</button>
        <button id="launch" disabled>Launch ▶</button>
      </div>
    `;
    document.body.appendChild(this.root);

    const palette = this.root.querySelector('#palette')!;
    for (const p of PARTS_CATALOG) {
      const btn = document.createElement('button');
      btn.className = 'part-btn';
      btn.dataset.partId = p.id;
      btn.innerHTML = `<span class="swatch" style="background:#${p.color
        .toString(16)
        .padStart(6, '0')}"></span>${p.name}<br><small>${p.dryMass}t${
        p.fuel ? ` · ${p.fuel} fuel` : ''
      }${p.thrust ? ` · ${p.thrust}kN` : ''}</small>`;
      btn.addEventListener('click', () => cbs.onSelectPart(p.id));
      palette.appendChild(btn);
    }

    this.root.querySelector('#rotate-q')!.addEventListener('click', () => cbs.onRotateSelected(-90));
    this.root.querySelector('#rotate-e')!.addEventListener('click', () => cbs.onRotateSelected(90));
    this.root.querySelector('#delete')!.addEventListener('click', () => cbs.onDeleteSelected());
    this.launchBtn = this.root.querySelector('#launch') as HTMLButtonElement;
    this.launchBtn.addEventListener('click', () => cbs.onLaunch());

    this.onReadyChange = (ready) => {
      this.launchBtn.disabled = !ready;
    };
  }

  show(): void {
    this.root.style.display = 'flex';
  }
  hide(): void {
    this.root.style.display = 'none';
  }
}
