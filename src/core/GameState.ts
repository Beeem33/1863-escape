import { Storage } from '../utils/Storage';

export enum GameState {
  Menu = 'menu',
  Playing = 'playing',
  Paused = 'paused',
  /** Short cinematic beat between being caught and the game-over screen. */
  Dying = 'dying',
  GameOver = 'gameover',
}

/** Live statistics for the current run. */
export class RunStats {
  /** Meters run this run (score). */
  distance = 0;
  /** Journey distance where this run began (the start of the chosen level). */
  startDistance = 0;
  /** Level the run started on, and the level currently reached. */
  startLevel = 1;
  level = 1;
  collectibles = 0;
  mapPieces = 0;
  hits = 0;
  time = 0;
  seed = 0;
  currentMap = '';

  reset(seed: number, startLevel = 1, startDistance = 0): void {
    this.distance = 0;
    this.startDistance = startDistance;
    this.startLevel = this.level = startLevel;
    this.collectibles = 0;
    this.mapPieces = 0;
    this.hits = 0;
    this.time = 0;
    this.seed = seed;
    this.currentMap = '';
  }
}

/** Persistent records saved in localStorage. */
export const Records = {
  get best(): number {
    return Storage.get<number>('best-distance', 0);
  },
  submit(distance: number): boolean {
    if (distance > this.best) {
      Storage.set('best-distance', Math.floor(distance));
      return true;
    }
    return false;
  },
  /** Highest level unlocked (1 = only the first). */
  get unlockedLevel(): number {
    return Storage.get<number>('unlocked-level', 1);
  },
  /** Returns true if this newly unlocked a level. */
  unlockLevel(level: number): boolean {
    if (level <= this.unlockedLevel) return false;
    Storage.set('unlocked-level', level);
    return true;
  },
  get totalPieces(): number {
    return Storage.get<number>('total-pieces', 0);
  },
  addPieces(n: number): void {
    Storage.set('total-pieces', this.totalPieces + n);
  },
};
