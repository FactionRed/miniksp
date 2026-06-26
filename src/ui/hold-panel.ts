// src/ui/hold-panel.ts
import type { HoldMode } from '../flight/flight-controller';

/**
 * Bottom-center attitude-hold button panel. Each button sets a hold mode on the
 * active FlightController; clicking the active mode again turns it off.
 *
 * Buttons use the KSP marker conventions:
 *   prograde    ●       (filled yellow circle)
 *   retrograde  ⊗       (yellow circle with X)
 *   normal      ▲       (purple triangle up)
 *   antinormal  ▼       (purple triangle down)
 */
export class HoldPanel {
  private root: HTMLElement;
  private buttons = new Map<HoldMode, HTMLButtonElement>();
  /** Called when the user picks a mode (or toggles it off). */
  onSelect: (mode: HoldMode) => void = () => {};
  private active: HoldMode = 'off';

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'hold-panel';
    Object.assign(this.root.style, {
      position: 'absolute',
      left: '50%',
      bottom: '12px',
      transform: 'translateX(-50%)',
      display: 'none',
      gap: '6px',
      padding: '6px 8px',
      background: 'rgba(0,0,10,0.6)',
      border: '1px solid #2a3550',
      borderRadius: '6px',
      zIndex: '15',
      // Sit the panel to the LEFT of the navball (which is also bottom-center).
      marginRight: '180px',
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.root);

    const defs: { mode: HoldMode; glyph: string; color: string; title: string }[] = [
      { mode: 'prograde', glyph: '●', color: '#ffd700', title: 'Prograde' },
      { mode: 'retrograde', glyph: '⊘', color: '#ffd700', title: 'Retrograde' },
      { mode: 'normal', glyph: '▲', color: '#cc77ff', title: 'Normal' },
      { mode: 'antinormal', glyph: '▼', color: '#cc77ff', title: 'Anti-normal' },
    ];
    for (const d of defs) {
      const btn = document.createElement('button');
      btn.title = d.title;
      btn.textContent = d.glyph;
      Object.assign(btn.style, {
        width: '34px',
        height: '34px',
        fontSize: '18px',
        lineHeight: '1',
        color: d.color,
        background: 'rgba(20,30,50,0.9)',
        border: '1px solid #345',
        borderRadius: '4px',
        cursor: 'pointer',
        padding: '0',
      } as Partial<CSSStyleDeclaration>);
      btn.addEventListener('click', () => {
        // Toggle: clicking the active mode turns it off.
        const next: HoldMode = this.active === d.mode ? 'off' : d.mode;
        this.onSelect(next);
      });
      this.buttons.set(d.mode, btn);
      this.root.appendChild(btn);
    }
  }

  show(): void {
    this.root.style.display = 'flex';
  }
  hide(): void {
    this.root.style.display = 'none';
  }

  /** Reflect the current mode (highlight active button). */
  setActive(mode: HoldMode): void {
    this.active = mode;
    for (const [m, btn] of this.buttons) {
      if (m === mode) {
        btn.style.background = 'rgba(60,90,30,0.95)';
        btn.style.borderColor = '#7f7';
        btn.style.boxShadow = '0 0 6px #5f5';
      } else {
        btn.style.background = 'rgba(20,30,50,0.9)';
        btn.style.borderColor = '#345';
        btn.style.boxShadow = 'none';
      }
    }
  }
}
