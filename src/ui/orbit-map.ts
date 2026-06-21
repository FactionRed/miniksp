// src/ui/orbit-map.ts
import type { FlightController } from '../flight/flight-controller';

const STEPS = 600;
const DT = 0.5;

export class OrbitMap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  visible = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'orbit-map';
    this.canvas.width = 400;
    this.canvas.height = 400;
    const ctx = this.canvas.getContext('2d')!;
    this.ctx = ctx;
    Object.assign(this.canvas.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(0,0,0,0.7)',
      border: '1px solid #445',
      display: 'none',
      zIndex: '20',
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.canvas);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.canvas.style.display = this.visible ? 'block' : 'none';
  }

  hide(): void {
    this.visible = false;
    this.canvas.style.display = 'none';
  }

  draw(flight: FlightController): void {
    if (!this.visible) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 400, 400);

    // Scale: fit planet radius into ~80px.
    const scale = 80 / flight.planet.data.radius;
    const cx = 200;
    const cy = 200;

    // Planet
    ctx.fillStyle = '#3366cc';
    ctx.beginPath();
    ctx.arc(cx, cy, flight.planet.data.radius * scale, 0, Math.PI * 2);
    ctx.fill();

    // Moon orbit ring + moon (project world XZ onto canvas XY).
    ctx.strokeStyle = '#555';
    ctx.beginPath();
    ctx.arc(cx, cy, flight.moon.orbitRadiusApproxForMap * scale, 0, Math.PI * 2);
    ctx.stroke();
    const mx = cx + flight.moon.position.x * scale;
    const my = cy + flight.moon.position.z * scale;
    ctx.fillStyle = '#aaa';
    ctx.beginPath();
    ctx.arc(mx, my, 6, 0, Math.PI * 2);
    ctx.fill();

    // Ship + predicted trajectory (forward integrate 2-body around dominant body).
    const root = flight.ship.rootBody;
    let px = root.position.x;
    let py = root.position.y;
    let pz = root.position.z;
    let vx = root.velocity.x;
    let vy = root.velocity.y;
    let vz = root.velocity.z;
    const dom = flight.dominantBodyFor(root.position);
    const mu = dom.mu;
    const bx = dom.position.x;
    const by = dom.position.y;
    const bz = dom.position.z;

    ctx.strokeStyle = '#2a6';
    ctx.beginPath();
    for (let i = 0; i < STEPS; i++) {
      const rx = px - bx;
      const ry = py - by;
      const rz = pz - bz;
      const r2 = rx * rx + ry * ry + rz * rz;
      const r = Math.sqrt(r2);
      const a = -mu / (r2 * r);
      vx += a * rx * DT;
      vy += a * ry * DT;
      vz += a * rz * DT;
      px += vx * DT;
      py += vy * DT;
      pz += vz * DT;
      if (i === 0) ctx.moveTo(cx + rx * scale, cy + rz * scale);
      else ctx.lineTo(cx + rx * scale, cy + rz * scale);
      if (r < flight.planet.data.radius) break; // crashed
    }
    ctx.stroke();

    // Ship marker
    ctx.fillStyle = '#ff0';
    ctx.beginPath();
    ctx.arc(
      cx + (root.position.x - bx) * scale,
      cy + (root.position.z - bz) * scale,
      4,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}
