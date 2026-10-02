import { PlayerConfig } from '../config/GameConfig';
import type { ObstacleManager } from '../obstacles/ObstacleManager';
import type { ChunkManager } from '../world/ChunkManager';
import { clamp } from '../utils/MathUtils';
import type { Player } from './Player';
import type { MovementIntent } from './PlayerController';

/**
 * A simple runner AI: follows the generator's guaranteed safe route and
 * jumps anything low in its lane. Used for the menu's attract-mode camera and
 * as a debug tool (F5) to prove every generated stretch is passable.
 */
export class Autopilot {
  readonly intent: MovementIntent = { strafe: 0, push: false, ease: false, sprint: false, jump: false, lookBack: false };

  update(p: Player, chunks: ChunkManager, obstacles: ObstacleManager): MovementIntent {
    const i = this.intent;
    i.jump = false;
    i.push = false;
    i.sprint = false;
    i.ease = false;

    // Next route point ahead (the centre of the next safe gap).
    let targetX = p.x;
    let best = Infinity;
    for (const c of chunks.chunks.values()) {
      for (const r of c.layout.route) {
        const ahead = r.d - p.d;
        if (ahead > 0.5 && ahead < best) {
          best = ahead;
          targetX = r.x;
        }
      }
    }
    const err = targetX - p.x;
    i.strafe = Math.abs(err) < 0.15 ? 0 : clamp(err * 0.9, -1, 1);

    // Jump low obstacles and holes that are in our lane.
    const r = PlayerConfig.radius + 0.1;
    for (const o of obstacles.active) {
      if (o.d < p.d - 2 || o.d > p.d + 12) continue;
      for (const b of o.boxes) {
        if (b.kind === 'slow' || b.kind === 'solid') continue;
        if (p.x + r < b.minX || p.x - r > b.maxX) continue;
        const front = b.minD - p.d;
        const window = b.kind === 'ground' ? [0.1, 0.9] : [p.speed * 0.2, p.speed * 0.32];
        if (front > window[0] && front < window[1]) i.jump = true;
      }
    }
    return i;
  }
}
