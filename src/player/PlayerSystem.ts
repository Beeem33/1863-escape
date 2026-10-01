import type * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import type { InputManager } from '../core/InputManager';
import type { Settings } from '../core/Settings';
import { Player } from './Player';
import { PlayerCamera } from './PlayerCamera';
import { PlayerController } from './PlayerController';
import { PlayerMovement, type GroundQuery } from './PlayerMovement';

/**
 * Bundles the player's state, controller, physics and camera into one unit the
 * Game can update with a single call.
 */
export class PlayerSystem {
  readonly player = new Player();
  readonly controller: PlayerController;
  readonly movement: PlayerMovement;
  readonly view: PlayerCamera;

  constructor(
    private readonly input: InputManager,
    bus: EventBus,
    camera: THREE.PerspectiveCamera,
    settings: Settings,
  ) {
    this.controller = new PlayerController(input);
    this.movement = new PlayerMovement(bus);
    this.view = new PlayerCamera(camera, settings);
  }

  reset(): void {
    this.player.reset();
    this.view.reset();
    this.controller.clear();
  }

  update(dt: number, baseSpeed: number, ground: GroundQuery, acceptInput: boolean): void {
    const intent = acceptInput ? this.controller.update() : (this.controller.clear(), this.controller.intent);
    const mouse = this.input.consumeMouse();
    if (acceptInput) this.view.applyMouse(mouse.dx, mouse.dy);
    this.movement.update(this.player, intent, baseSpeed, ground, dt);
    this.view.update(this.player, intent.lookBack, dt);
  }
}
