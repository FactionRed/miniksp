// src/ui/win-states.ts
import type { FlightController } from '../flight/flight-controller';
import { isClosedOrbit } from '../physics/orbit-math';
import { MOON_SOI } from '../physics/constants';

export type WinEvent = 'orbit' | 'moon-landed' | 'safe-return' | 'crash';

export class WinStates {
  private banner: HTMLElement;
  private bannerText: HTMLElement;
  private bannerBtn: HTMLButtonElement;
  private achieved = new Set<WinEvent>();
  private wasInMoonSoi = false;
  private hideTimer = 0;
  onEvent: (e: WinEvent) => void = () => {};
  onBuildAgain: () => void = () => {};

  constructor() {
    this.banner = document.createElement('div');
    this.banner.id = 'win-banner';
    Object.assign(this.banner.style, {
      position: 'absolute',
      top: '30%',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '20px 40px',
      background: 'rgba(0,40,0,0.95)',
      color: '#9f9',
      fontFamily: 'sans-serif',
      fontSize: '22px',
      borderRadius: '8px',
      display: 'none',
      zIndex: '30',
      textAlign: 'center',
      pointerEvents: 'auto',
    } as Partial<CSSStyleDeclaration>);
    this.banner.innerHTML = `
      <div id="banner-text"></div>
      <button id="banner-btn" style="margin-top:12px;padding:8px 16px;background:#163;color:#cdd;border:1px solid #445;border-radius:4px;cursor:pointer;display:none">Build Again</button>
    `;
    document.body.appendChild(this.banner);
    this.bannerText = this.banner.querySelector('#banner-text')!;
    this.bannerBtn = this.banner.querySelector('#banner-btn')!;
    this.bannerBtn.addEventListener('click', () => this.onBuildAgain());
  }

  private show(text: string, terminal = false): void {
    this.bannerText.textContent = text;
    this.banner.style.display = 'block';
    this.bannerBtn.style.display = terminal ? 'inline-block' : 'none';
    window.clearTimeout(this.hideTimer);
    if (!terminal) {
      this.hideTimer = window.setTimeout(() => {
        this.banner.style.display = 'none';
      }, 4000);
    }
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
    const inMoonSoi = moonDist < MOON_SOI;

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

    // Moon landed: in moon SOI, very low radial speed, close to surface.
    // "Vertical speed" is the component of velocity along the radial direction
    // from moon center to ship — NOT world-Y, because the moon orbits in the
    // XZ plane and its surface normal can point in any direction.
    if (inMoonSoi && !this.achieved.has('moon-landed')) {
      this.wasInMoonSoi = true;
      const moonAlt = moonDist - flight.moon.data.radius;
      const moonDx = root.position.x - moonPos.x;
      const moonDy = root.position.y - moonPos.y;
      const moonDz = root.position.z - moonPos.z;
      const radialVel = moonDist > 1e-3
        ? (root.velocity.x * moonDx + root.velocity.y * moonDy + root.velocity.z * moonDz) / moonDist
        : 0;
      const vertSpeed = Math.abs(radialVel);
      if (moonAlt < 5 && vertSpeed < 3) {
        this.achieved.add('moon-landed');
        this.show('🌕 Lunar Landing!');
        this.onEvent('moon-landed');
      }
    }

    // Crashed into either body.
    const planetAlt = Math.hypot(r[0], r[1], r[2]) - planet.data.radius;
    // Moon crash: inside the moon OR at the surface with high radial speed.
    const moonAltitude = moonDist - flight.moon.data.radius;
    const moonDx2 = root.position.x - moonPos.x;
    const moonDy2 = root.position.y - moonPos.y;
    const moonDz2 = root.position.z - moonPos.z;
    const moonRadialVel = moonDist > 1e-3
      ? (root.velocity.x * moonDx2 + root.velocity.y * moonDy2 + root.velocity.z * moonDz2) / moonDist
      : 0;
    const moonCrashed = inMoonSoi && (
      moonDist < flight.moon.data.radius - 1 ||
      (moonAltitude < 5 && Math.abs(moonRadialVel) >= 3)
    );
    if (planetAlt < -1 || moonCrashed) {
      if (!this.achieved.has('crash')) {
        this.achieved.add('crash');
        this.show('💥 Crashed — Revert with F1');
        this.onEvent('crash');
      }
    }

    // Safe return: terminal — was on moon, now back near planet surface, slow touchdown.
    if (this.wasInMoonSoi && !inMoonSoi && !this.achieved.has('safe-return')) {
      if (planetAlt < 10 && Math.hypot(v[0], v[1], v[2]) < 15) {
        this.achieved.add('safe-return');
        this.show('🏆 Mission Complete! Safe Return.', true);
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
