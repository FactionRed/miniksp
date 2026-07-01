// src/flight/hud.ts
import type { FlightController } from './flight-controller';
import { orbitalEnergy, apoapsisPeriapsis } from '../physics/orbit-math';
import { MOON_SOI } from '../physics/constants';

export class Hud {
  private root: HTMLElement;
  private altitude: HTMLElement;
  private velocity: HTMLElement;
  private apPe: HTMLElement;
  private fuel: HTMLElement;
  private throttleBar: HTMLElement;
  private soi: HTMLElement;
  private sasIndicator: HTMLElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div id="throttle-bar"><div id="throttle-fill"></div></div>
      <div class="readouts">
        <div class="row"><span class="label">ALT</span><span id="alt" class="val">0</span><span class="unit">m</span></div>
        <div class="row"><span class="label">VEL</span><span id="vel" class="val">0</span><span class="unit">m/s</span></div>
        <div class="row"><span class="label">Ap/Pe</span><span id="appe" class="val wide">-</span></div>
        <div class="row"><span class="label">FUEL</span><span id="fuel" class="val">0</span></div>
        <div class="row"><span class="label">SOI</span><span id="soi" class="val wide">-</span></div>
        <div class="row"><span class="label">SAS</span><span id="sas" class="val wide" style="color:#777">OFF</span></div>
      </div>
    `;
    document.body.appendChild(this.root);
    this.altitude = this.root.querySelector('#alt')!;
    this.velocity = this.root.querySelector('#vel')!;
    this.apPe = this.root.querySelector('#appe')!;
    this.fuel = this.root.querySelector('#fuel')!;
    this.throttleBar = this.root.querySelector('#throttle-fill')!;
    this.soi = this.root.querySelector('#soi')!;
    this.sasIndicator = this.root.querySelector('#sas')!;
  }

  update(flight: FlightController): void {
    const root = flight.ship.rootBody;
    // Use the dominant celestial body (planet or moon) so Ap/Pe and altitude
    // are correct when inside Luna's sphere of influence.
    const dom = flight.dominantBodyFor(root.position);
    const domPos = dom.position;
    const dx = root.position.x - domPos.x;
    const dy = root.position.y - domPos.y;
    const dz = root.position.z - domPos.z;
    const alt = Math.hypot(dx, dy, dz) - dom.data.radius;
    const vel = Math.hypot(root.velocity.x, root.velocity.y, root.velocity.z);

    const r: [number, number, number] = [dx, dy, dz];
    const v: [number, number, number] = [root.velocity.x, root.velocity.y, root.velocity.z];
    const mu = dom.mu;
    const energy = orbitalEnergy(r, v, mu);
    let apPeText = 'escape';
    if (energy < 0) {
      const { apoapsis, periapsis } = apoapsisPeriapsis(r, v, mu);
      apPeText = `Ap ${(apoapsis - dom.data.radius).toFixed(0)} / Pe ${(
        periapsis - dom.data.radius
      ).toFixed(0)}`;
    }
    this.altitude.textContent = alt.toFixed(0);
    this.velocity.textContent = vel.toFixed(0);
    this.apPe.textContent = apPeText;
    this.fuel.textContent = flight.ship.fuel.toFixed(0);
    this.throttleBar.style.width = `${flight.throttle * 100}%`;
    // SOI label: dominant body via SOI distance to moon center.
    const moonPos = flight.moon.position;
    const md = Math.hypot(
      root.position.x - moonPos.x,
      root.position.y - moonPos.y,
      root.position.z - moonPos.z,
    );
    this.soi.textContent = md < MOON_SOI ? 'Luna' : 'Terra';

    // SAS indicator: green when engaged, dim when off.
    if (flight.sasEnabled) {
      this.sasIndicator.textContent = 'ON';
      this.sasIndicator.style.color = '#2a6';
    } else {
      this.sasIndicator.textContent = 'OFF';
      this.sasIndicator.style.color = '#777';
    }
  }

  show(): void {
    this.root.style.display = 'block';
  }
  hide(): void {
    this.root.style.display = 'none';
  }
}
