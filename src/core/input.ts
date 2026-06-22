// src/core/input.ts
/** Tracks currently-held keys and exposes a one-shot keypress event stream. */
export class Input {
  private down = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private onPressedHandlers = new Map<string, (() => void)[]>();

  attach(target: Window | HTMLElement = window): void {
    target.addEventListener('keydown', ((e: KeyboardEvent) => {
      const k = e.code;
      if (!this.down.has(k)) this.pressedThisFrame.add(k);
      this.down.add(k);
      const handlers = this.onPressedHandlers.get(k);
      if (handlers) for (const h of handlers) h();
      // Suppress the browser's default for keys we use as game controls so they
      // don't scroll the page (Space/Arrows) or open help (F1) / dev tools (F12).
      if (
        ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1', 'F12'].includes(k)
      ) {
        e.preventDefault();
      }
    }) as EventListener);
    target.addEventListener('keyup', ((e: KeyboardEvent) => {
      this.down.delete(e.code);
    }) as EventListener);
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }
  wasPressed(code: string): boolean {
    return this.pressedThisFrame.has(code);
  }

  onPressed(code: string, fn: () => void): void {
    const arr = this.onPressedHandlers.get(code) ?? [];
    arr.push(fn);
    this.onPressedHandlers.set(code, arr);
  }

  /** Called at end of each frame to clear one-shot presses. */
  endFrame(): void {
    this.pressedThisFrame.clear();
  }
}
