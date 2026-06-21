// src/flight/controls.ts
import * as CANNON from 'cannon-es';
import type { Input } from '../core/input';
import type { FlightController } from './flight-controller';

const THROTTLE_RATE = 0.6; // per second
const TORQUE = 8; // rotation response

export class FlightControls {
  constructor(private input: Input, private flight: FlightController) {
    input.onPressed('Space', () => this.stage());
    input.onPressed('KeyZ', () => {
      flight.throttle = 1;
    });
    input.onPressed('KeyX', () => {
      flight.throttle = 0;
    });
  }

  /** Apply per-frame input: throttle ramp, rotation torque on root body. */
  update(dt: number): void {
    const inp = this.input;
    if (inp.isDown('ShiftLeft'))
      this.flight.throttle = Math.min(1, this.flight.throttle + THROTTLE_RATE * dt);
    if (inp.isDown('ControlLeft'))
      this.flight.throttle = Math.max(0, this.flight.throttle - THROTTLE_RATE * dt);

    const root = this.flight.ship.rootBody;
    let tx = 0;
    let ty = 0;
    let tz = 0;
    if (inp.isDown('KeyW')) tx -= TORQUE;
    if (inp.isDown('KeyS')) tx += TORQUE;
    if (inp.isDown('KeyA')) ty += TORQUE;
    if (inp.isDown('KeyD')) ty -= TORQUE;
    if (inp.isDown('KeyQ')) tz += TORQUE;
    if (inp.isDown('KeyE')) tz -= TORQUE;
    if (tx || ty || tz) {
      const local = root.quaternion.vmult(new CANNON.Vec3(tx, ty, tz));
      root.torque.x += local.x;
      root.torque.y += local.y;
      root.torque.z += local.z;
    }
  }

  private stage(): void {
    this.flight.stage();
  }
}
