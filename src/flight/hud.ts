// src/flight/hud.ts
import type { FlightController } from './flight-controller';
import { orbitalEnergy, apoapsisPeriapsis } from '../physics/orbit-math';

export class Hud {
  private root: HTMLElement;
  private altitude: HTMLElement;
  private velocity: HTMLElement;
  private apPe: HTMLElement;
  private fuel: HTMLElement;
  private throttleBar: HTMLElement;
  private soi: HTMLElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div id="throttle-bar"><div id="throttle-fill"></div></div>
      <div class="readouts">
        <div>ALT: <span id="alt">0</span> m</div>
        <div>VEL: <span id="vel">0</span> m/s</div>
        <div>Ap/Pe: <span id="appe">-</span></div>
        <div>FUEL: <span id="fuel">0</span></div>
        <div>SOI: <span id="soi">-</span></div>
      </div>
    `;
    document.body.appendChild(this.root);
    this.altitude = this.root.querySelector('#alt')!;
    this.velocity = this.root.querySelector('#vel')!;
    this.apPe = this.root.querySelector('#appe')!;
    this.fuel = this.root.querySelector('#fuel')!;
    this.throttleBar = this.root.querySelector('#throttle-fill')!;
    this.soi = this.root.querySelector('#soi')!;
  }

  update(flight: FlightController): void {
    const root = flight.ship.rootBody;
    const planetPos = flight.planet.position;
    const dx = root.position.x - planetPos.x;
    const dy = root.position.y - planetPos.y;
    const dz = root.position.z - planetPos.z;
    const alt = Math.hypot(dx, dy, dz) - flight.planet.data.radius;
    const vel = Math.hypot(root.velocity.x, root.velocity.y, root.velocity.z);

    const r: [number, number, number] = [dx, dy, dz];
    const v: [number, number, number] = [root.velocity.x, root.velocity.y, root.velocity.z];
    const mu = flight.planet.mu;
    const energy = orbitalEnergy(r, v, mu);
    let apPeText = 'escape';
    if (energy < 0) {
      const { apoapsis, periapsis } = apoapsisPeriapsis(r, v, mu);
      apPeText = `Ap ${(apoapsis - flight.planet.data.radius).toFixed(0)} / Pe ${(
        periapsis - flight.planet.data.radius
      ).toFixed(0)}`;
    }
    this.altitude.textContent = alt.toFixed(0);
    this.velocity.textContent = vel.toFixed(0);
    this.apPe.textContent = apPeText;
    this.fuel.textContent = flight.ship.fuel.toFixed(0);
    this.throttleBar.style.height = `${flight.throttle * 100}%`;
    // SOI label: dominant body via SOI distance to moon center.
    const moonPos = flight.moon.position;
    const md = Math.hypot(
      root.position.x - moonPos.x,
      root.position.y - moonPos.y,
      root.position.z - moonPos.z,
    );
    this.soi.textContent = md < 700 ? 'Luna' : 'Terra';
  }

  show(): void {
    this.root.style.display = 'block';
  }
  hide(): void {
    this.root.style.display = 'none';
  }
}
