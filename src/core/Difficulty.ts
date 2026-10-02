import { DifficultyConfig, PlayerConfig } from '../config/GameConfig';
import { lerp } from '../utils/MathUtils';

/**
 * Difficulty as a smooth function of distance: climbs quickly early, then
 * levels off (never a wall). Everything that scales with difficulty asks here.
 */
export const Difficulty = {
  /** 0..1 */
  at(distance: number): number {
    return 1 - Math.exp(-Math.max(0, distance) / DifficultyConfig.rampDistance);
  },

  /** The running speed the game expects at this distance (before W/S/sprint). */
  runSpeed(distance: number): number {
    return lerp(PlayerConfig.baseRunSpeed, PlayerConfig.maxRunSpeed, this.at(distance));
  },

  rowSpacing(distance: number): number {
    return lerp(DifficultyConfig.rowSpacingEasy, DifficultyConfig.rowSpacingHard, this.at(distance));
  },

  obstaclesPerRow(distance: number): number {
    return lerp(DifficultyConfig.obstaclesPerRowEasy, DifficultyConfig.obstaclesPerRowHard, this.at(distance));
  },

  safePathWidth(distance: number): number {
    return lerp(DifficultyConfig.safePathWidthEasy, DifficultyConfig.safePathWidthHard, this.at(distance));
  },
};
