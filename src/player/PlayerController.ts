import type { InputManager } from '../core/InputManager';

/** What the player wants to do this frame, independent of which keys mean what. */
export interface MovementIntent {
  /** -1 (left) .. 1 (right). */
  strafe: number;
  /** Holding W — push harder. */
  push: boolean;
  /** Holding S — ease off. */
  ease: boolean;
  sprint: boolean;
  /** Jump pressed this frame. */
  jump: boolean;
  /** Holding Q — glance back over the shoulder. */
  lookBack: boolean;
}

/** Key bindings. Change them here. */
export const KEYS = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  lookBack: ['KeyQ'],
};

/** Translates raw input into a MovementIntent. */
export class PlayerController {
  readonly intent: MovementIntent = { strafe: 0, push: false, ease: false, sprint: false, jump: false, lookBack: false };

  constructor(private readonly input: InputManager) {}

  update(): MovementIntent {
    const i = this.input;
    const left = i.isDown(...KEYS.left);
    const right = i.isDown(...KEYS.right);
    this.intent.strafe = (right ? 1 : 0) - (left ? 1 : 0);
    this.intent.push = i.isDown(...KEYS.forward);
    this.intent.ease = i.isDown(...KEYS.back);
    this.intent.sprint = i.isDown(...KEYS.sprint);
    this.intent.jump = i.wasPressed(...KEYS.jump);
    this.intent.lookBack = i.isDown(...KEYS.lookBack);
    return this.intent;
  }

  clear(): void {
    Object.assign(this.intent, { strafe: 0, push: false, ease: false, sprint: false, jump: false, lookBack: false });
  }
}
