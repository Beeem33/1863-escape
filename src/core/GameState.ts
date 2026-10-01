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
  distance = 0;
  collectibles = 0;
  mapPieces = 0;
  hits = 0;
  time = 0;
  seed = 0;
  currentMap = '';

  reset(seed: number): void {
    this.distance = 0;
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
  get totalPieces(): number {
    return Storage.get<number>('total-pieces', 0);
  },
  addPieces(n: number): void {
    Storage.set('total-pieces', this.totalPieces + n);
  },
};
