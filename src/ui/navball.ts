// src/ui/navball.ts
import * as THREE from 'three';
import type { FlightController } from '../flight/flight-controller';

/**
 * KSP-style navball HUD instrument.
 *
 * Reference frame: "up" is the radial vector from planet center to the ship
 * (so the horizon line is level relative to the planet — exactly like KSP).
 * - Outer ring: heading (yaw) 0–360°, N/E/S/W.
 * - Horizontal crosshair: pitch ladder (above/below horizon).
 * - The horizon itself rotates with roll.
 * - Center dot (chevron) = where the ship's nose points.
 * - Yellow circle (prograde) = where velocity points.
 * - Green circle (retrograde) = opposite of velocity (for braking burns).
 *
 * Rendered on a fixed 160px canvas anchored bottom-center of the screen.
 */
export class NavBall {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private readonly size = 160;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'navball';
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    Object.assign(this.canvas.style, {
      position: 'absolute',
      left: '50%',
      bottom: '12px',
      transform: 'translateX(-50%)',
      background: 'rgba(0,0,10,0.6)',
      border: '2px solid #445',
      borderRadius: '50%',
      zIndex: '15',
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  show(): void {
    this.canvas.style.display = 'block';
  }
  hide(): void {
    this.canvas.style.display = 'none';
  }

  update(flight: FlightController): void {
    const ctx = this.ctx;
    const s = this.size;
    const cx = s / 2;
    const cy = s / 2;
    const R = s / 2 - 2; // outer radius

    ctx.clearRect(0, 0, s, s);

    const root = flight.ship.rootBody;
    const planetCenter = flight.planet.position;

    // Reference frame at the ship:
    //   up    = unit(ship - planetCenter)
    //   north = project world -Z onto the plane perpendicular to up (KSP-ish "north pole")
    //   east  = up × north
    const up3 = new THREE.Vector3(
      root.position.x - planetCenter.x,
      root.position.y - planetCenter.y,
      root.position.z - planetCenter.z,
    ).normalize();
    const worldNorth = new THREE.Vector3(0, 1, 0); // planet's north pole axis
    // east = up × worldNorth (only valid when up isn't parallel to worldNorth)
    let east = new THREE.Vector3().crossVectors(up3, worldNorth);
    if (east.lengthSq() < 1e-6) east.set(1, 0, 0);
    east.normalize();
    const north = new THREE.Vector3().crossVectors(east, up3).normalize();

    // Ship's forward = its local -Y? In our build, parts extend +Y up and engines
    // push +Y, so the "nose" is local +Y. Convert to world.
    const q = new THREE.Quaternion(
      root.quaternion.x,
      root.quaternion.y,
      root.quaternion.z,
      root.quaternion.w,
    );
    const noseLocal = new THREE.Vector3(0, 1, 0);
    const nose = noseLocal.clone().applyQuaternion(q).normalize();

    // Velocity direction (world).
    const velLen = Math.hypot(root.velocity.x, root.velocity.y, root.velocity.z);
    const vel = velLen > 1e-3 ? new THREE.Vector3(root.velocity.x, root.velocity.y, root.velocity.z).normalize() : null;

    // --- Decompose nose into heading / pitch / roll relative to the local frame ---
    // pitch = angle of nose above the local horizon (0 = level, +90 = straight up)
    const pitchRad = Math.asin(THREE.MathUtils.clamp(nose.dot(up3), -1, 1));
    // Project nose onto the local horizon plane.
    const horiz = nose.clone().sub(up3.clone().multiplyScalar(nose.dot(up3)));
    horiz.normalize();
    const headingRad = Math.atan2(horiz.dot(east), horiz.dot(north)); // 0 = north, +90 = east

    // Roll: rotation of the ship around its nose axis, relative to "wings level".
    // Wings level = ship's right vector projects onto the local horizon pointing
    // in some consistent direction. Compute via: take the ship's "right" (+X),
    // remove its component along the nose, then measure the angle of the
    // resulting in-plane vector relative to "up-in-that-plane".
    const rightLocal = new THREE.Vector3(1, 0, 0);
    const right = rightLocal.clone().applyQuaternion(q);
    const rightInPlane = right.clone().sub(nose.clone().multiplyScalar(right.dot(nose)));
    // Reference up-in-plane: the local up with its nose-component removed.
    const upInPlane = up3.clone().sub(nose.clone().multiplyScalar(up3.dot(nose)));
    const upInPlaneLen = upInPlane.length();
    let rollRad: number;
    if (upInPlaneLen < 1e-6 || rightInPlane.length() < 1e-6) {
      // Nose is straight up/down — roll is undefined; preserve zero.
      rollRad = 0;
    } else {
      upInPlane.normalize();
      rightInPlane.normalize();
      // A vector 90° clockwise from upInPlane (around the nose):
      const sideRef = new THREE.Vector3().crossVectors(nose, upInPlane).normalize();
      rollRad = Math.atan2(rightInPlane.dot(sideRef), rightInPlane.dot(upInPlane));
    }

    // --- Draw navball disk ---
    // Clip to circle.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    // Sky/ground split that rotates/translates with pitch + roll.
    ctx.translate(cx, cy);
    ctx.rotate(-rollRad);
    // The horizon line sits at pitch offset: 1px per degree, capped by disk size.
    const pitchPx = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(pitchRad) * 1.5, -R, R);
    // Sky (above horizon)
    ctx.fillStyle = '#1a3a6a';
    ctx.fillRect(-R, -R - pitchPx, R * 2, R + pitchPx);
    // Ground (below horizon)
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(-R, -pitchPx, R * 2, R + pitchPx);
    // Horizon line
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-R, -pitchPx);
    ctx.lineTo(R, -pitchPx);
    ctx.stroke();
    // Pitch ladder (every 15°)
    ctx.strokeStyle = 'rgba(220,220,220,0.5)';
    ctx.fillStyle = 'rgba(220,220,220,0.7)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    for (let deg = -90; deg <= 90; deg += 15) {
      if (deg === 0) continue;
      const y = -pitchPx - deg * 1.5;
      if (y < -R || y > R) continue;
      const len = deg % 30 === 0 ? R * 0.35 : R * 0.18;
      ctx.beginPath();
      ctx.moveTo(-len, y);
      ctx.lineTo(len, y);
      ctx.stroke();
      ctx.fillText(`${Math.abs(deg)}`, 0, y - 2);
    }
    ctx.restore();

    // --- Markers (drawn in fixed screen space, no roll) ---
    // Helper: project a world-direction into screen offset relative to disk center.
    const project = (dir: THREE.Vector3): { x: number; y: number } | null => {
      const dPitch = Math.asin(THREE.MathUtils.clamp(dir.dot(up3), -1, 1));
      const dHoriz = dir.clone().sub(up3.clone().multiplyScalar(dir.dot(up3))).normalize();
      const dHeading = Math.atan2(dHoriz.dot(east), dHoriz.dot(north));
      // Relative to nose direction:
      let rel = dHeading - headingRad;
      while (rel > Math.PI) rel -= 2 * Math.PI;
      while (rel < -Math.PI) rel += 2 * Math.PI;
      const px = Math.sin(rel) * R * 0.85;
      // Vertical: difference in pitch.
      const py = -(THREE.MathUtils.radToDeg(dPitch) - THREE.MathUtils.radToDeg(pitchRad)) * 1.5;
      // Hide if it's on the back side (behind the disk plane).
      const cosAngle = dir.dot(nose);
      if (cosAngle < 0) return null; // behind the ship
      return { x: px, y: THREE.MathUtils.clamp(py, -R, R) };
    };

    // Prograde marker (yellow)
    if (vel) {
      const p = project(vel);
      if (p) this.drawMarker(ctx, cx + p.x, cy + p.y, '#ffee00', false);
      // Retrograde = -vel
      const r = project(vel.clone().multiplyScalar(-1));
      if (r) this.drawMarker(ctx, cx + r.x, cy + r.y, '#33dd33', true);
    }

    // --- Fixed overlay: heading readout + center crosshair ---
    // Center crosshair (where the nose points).
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy);
    ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx, cy + 10);
    ctx.stroke();

    // Heading tick marks around the outer ring (rotated by -heading so N stays at top).
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = '#9ab';
    ctx.fillStyle = '#cdd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let deg = 0; deg < 360; deg += 45) {
      const ang = THREE.MathUtils.degToRad(deg - 90 - THREE.MathUtils.radToDeg(headingRad));
      const tx = Math.cos(ang) * (R - 10);
      const ty = Math.sin(ang) * (R - 10);
      const labels = ['N', 'E', 'S', 'W'];
      ctx.fillText(labels[Math.floor(deg / 90) % 4], tx, ty);
    }
    ctx.restore();

    // Top pointer = current heading in degrees.
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${Math.round(((THREE.MathUtils.radToDeg(headingRad) + 360) % 360)).toString().padStart(3, '0')}°`,
      cx,
      12,
    );
    // Pitch readout.
    ctx.fillText(`${Math.round(THREE.MathUtils.radToDeg(pitchRad))}°`, cx, s - 8);
  }

  private drawMarker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    retro: boolean,
  ): void {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    if (retro) {
      ctx.stroke();
      // X inside
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 3);
      ctx.lineTo(x + 3, y + 3);
      ctx.moveTo(x + 3, y - 3);
      ctx.lineTo(x - 3, y + 3);
      ctx.stroke();
    } else {
      ctx.fill();
    }
  }
}
