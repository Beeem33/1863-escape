import { DifficultyConfig, HazardConfig, PlayerConfig, PursuitConfig } from '../config/GameConfig';
import { lerp } from '../utils/MathUtils';

/**
 * Difficulty as a smooth function of distance: climbs quickly early, then
 * keeps tightening slowly ("overdrive") the further you get — never a wall.
 * Everything that scales with difficulty asks here.
 */
export const Difficulty = {
  /** 0 .. 1 + lateMax. Values above 1 mean "past the main ramp". */
  at(distance: number): number {
    const D = DifficultyConfig;
    const d = Math.max(0, distance);
    const main = 1 - Math.exp(-d / D.rampDistance);
    const late = Math.min(1, Math.max(0, d - D.lateRampStart) / D.lateRampDistance) * D.lateMax;
    return main + late;
  },

  /** The running speed the game expects at this distance (before W/S/sprint). */
  runSpeed(distance: number): number {
    return Math.min(PlayerConfig.absoluteMaxRunSpeed, lerp(PlayerConfig.baseRunSpeed, PlayerConfig.maxRunSpeed, this.at(distance)));
  },

  rowSpacing(distance: number): number {
    return Math.max(DifficultyConfig.rowSpacingMin, lerp(DifficultyConfig.rowSpacingEasy, DifficultyConfig.rowSpacingHard, this.at(distance)));
  },

  obstaclesPerRow(distance: number): number {
    return lerp(DifficultyConfig.obstaclesPerRowEasy, DifficultyConfig.obstaclesPerRowHard, this.at(distance));
  },

  safePathWidth(distance: number): number {
    return Math.max(DifficultyConfig.safePathWidthMin, lerp(DifficultyConfig.safePathWidthEasy, DifficultyConfig.safePathWidthHard, this.at(distance)));
  },

  /** Pursuer speed as a fraction of the expected run speed. */
  pursuitFactor(distance: number): number {
    return Math.min(PursuitConfig.speedFactorCap, lerp(PursuitConfig.speedFactorStart, PursuitConfig.speedFactorMax, this.at(distance)));
  },

  artilleryInterval(distance: number): number {
    return Math.max(HazardConfig.artilleryIntervalMin, lerp(HazardConfig.artilleryIntervalEasy, HazardConfig.artilleryIntervalHard, this.at(distance)));
  },
};
