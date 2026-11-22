/**
 * Keyboard + mouse input.
 *
 * - `isDown(code)` for held keys (uses KeyboardEvent.code, so it works on any layout).
 * - `wasPressed(code)` for one-shot presses; cleared at the end of every frame.
 * - Mouse look deltas are only collected while the pointer is locked.
 * - On touch devices the on-screen controls (TouchControls) feed the same
 *   key codes and look deltas through `setHeld`, `tap` and `addLook`.
 */
export class InputManager {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  pointerLocked = false;
  /** Called when pointer lock is gained or lost. */
  onPointerLockChange: ((locked: boolean) => void) | null = null;
  /** Touch devices have no mouse to capture, so pointer lock is skipped. */
  touchMode = false;

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.element;
      this.onPointerLockChange?.(this.pointerLocked);
    });
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    // Keep the browser from scrolling / opening help on game keys.
    if (['Space', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (!e.repeat) this.pressed.add(e.code);
    this.down.add(e.code);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  isDown(...codes: string[]): boolean {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  wasPressed(...codes: string[]): boolean {
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  }

  /** Returns and resets the accumulated mouse movement. */
  consumeMouse(): { dx: number; dy: number } {
    const d = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = this.mouseDY = 0;
    return d;
  }

  /** Hold or release a key code from an on-screen control. */
  setHeld(code: string, held: boolean): void {
    if (held) this.down.add(code);
    else this.down.delete(code);
  }

  /** A one-shot press from an on-screen control (like a key going down). */
  tap(code: string): void {
    this.pressed.add(code);
  }

  /** Look movement from a touch drag, in the same units as mouse movement. */
  addLook(dx: number, dy: number): void {
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  requestPointerLock(): void {
    if (this.pointerLocked || this.touchMode) return;
    try {
      const p = this.element.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {
        /* lock refused (e.g. too soon after ESC) — mouse look simply stays off */
      });
    } catch {
      /* not supported */
    }
  }

  exitPointerLock(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }

  /** Call once at the end of each frame. */
  endFrame(): void {
    this.pressed.clear();
  }
}
