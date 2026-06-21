// src/ui/win-states.ts
import type { FlightController } from '../flight/flight-controller';
import { isClosedOrbit } from '../physics/orbit-math';

export type WinEvent = 'orbit' | 'moon-landed' | 'safe-return' | 'crash';

export class WinStates {
  private banner: HTMLElement;
  private achieved = new Set<WinEvent>();
  private wasInMoonSoi = false;
  private hideTimer = 0;
  onEvent: (e: WinEvent) => void = () => {};

  constructor() {
    this.banner = document.createElement('div');
    this.banner.id = 'win-banner';
    Object.assign(this.banner.style, {
      position: 'absolute',
      top: '20%',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '16px 32px',
      background: 'rgba(0,40,0,0.9)',
      color: '#9f9',
      fontFamily: 'sans-serif',
      fontSize: '24px',
      borderRadius: '8px',
      display: 'none',
      zIndex: '30',
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.banner);
  }

  private show(text: string): void {
    this.banner.textContent = text;
    this.banner.style.display = 'block';
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.banner.style.display = 'none';
    }, 4000);
  }

  update(flight: FlightController): void {
    const root = flight.ship.rootBody;
    const planet = flight.planet;

    const r: [number, number, number] = [
      root.position.x - planet.position.x,
      root.position.y - planet.position.y,
      root.position.z - planet.position.z,
    ];
    const v: [number, number, number] = [root.velocity.x, root.velocity.y, root.velocity.z];
    const moonPos = flight.moon.position;
    const moonDist = Math.hypot(
      root.position.x - moonPos.x,
      root.position.y - moonPos.y,
      root.position.z - moonPos.z,
    );
    const inMoonSoi = moonDist < 700; // matches HUD heuristic

    // Orbit achieved (around planet, not yet entered moon SOI).
    if (
      !this.achieved.has('orbit') &&
      !inMoonSoi &&
      isClosedOrbit(r, v, planet.mu, planet.data.radius)
    ) {
      this.achieved.add('orbit');
      this.show('🌱 Orbit Achieved!');
      this.onEvent('orbit');
    }

    // Moon landed: in moon SOI, very low vertical speed, close to surface.
    if (inMoonSoi && !this.achieved.has('moon-landed')) {
      this.wasInMoonSoi = true;
      const moonAlt = moonDist - flight.moon.data.radius;
      const vertSpeed = Math.abs(root.velocity.y);
      if (moonAlt < 5 && vertSpeed < 3) {
        this.achieved.add('moon-landed');
        this.show('🌕 Lunar Landing!');
        this.onEvent('moon-landed');
      }
    }

    // Crashed into either body.
    const planetAlt = Math.hypot(r[0], r[1], r[2]) - planet.data.radius;
    if (planetAlt < -1 || (inMoonSoi && moonDist < flight.moon.data.radius - 1)) {
      if (!this.achieved.has('crash')) {
        this.achieved.add('crash');
        this.show('💥 Crashed — Revert with F1');
        this.onEvent('crash');
      }
    }

    // Safe return: was on moon, now back near planet surface, slow touchdown.
    if (this.wasInMoonSoi && !inMoonSoi && !this.achieved.has('safe-return')) {
      if (planetAlt < 10 && Math.hypot(v[0], v[1], v[2]) < 15) {
        this.achieved.add('safe-return');
        this.show('🏆 Mission Complete! Safe Return.');
        this.onEvent('safe-return');
      }
    }
  }

  reset(): void {
    this.achieved.clear();
    this.wasInMoonSoi = false;
    window.clearTimeout(this.hideTimer);
    this.banner.style.display = 'none';
  }

  hide(): void {
    this.banner.style.display = 'none';
  }
}
