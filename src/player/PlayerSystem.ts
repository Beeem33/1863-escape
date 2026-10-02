import type * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import type { InputManager } from '../core/InputManager';
import type { Settings } from '../core/Settings';
import { Player } from './Player';
import { PlayerCamera } from './PlayerCamera';
import { PlayerController, type MovementIntent } from './PlayerController';
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
  private readonly idle: MovementIntent = { strafe: 0, push: false, ease: false, sprint: false, jump: false, lookBack: false };

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

  /**
   * @param source 'input' = keyboard/mouse, 'none' = no control (cutscenes),
   *               or an explicit intent (autopilot).
   * @param forceLookBack turn the head to look behind (capture sequence).
   */
  update(dt: number, baseSpeed: number, ground: GroundQuery, source: 'input' | 'none' | MovementIntent, forceLookBack = false): void {
    let intent: MovementIntent;
    if (source === 'input') intent = this.controller.update();
    else if (source === 'none') intent = this.idle;
    else intent = source;
    const mouse = this.input.consumeMouse();
    if (source === 'input') this.view.applyMouse(mouse.dx, mouse.dy);
    this.movement.update(this.player, intent, baseSpeed, ground, dt);
    this.view.update(this.player, intent.lookBack || forceLookBack, dt);
  }
}
