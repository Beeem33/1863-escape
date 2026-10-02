import { formatDistance } from '../utils/MathUtils';
import { button, el, Screen } from './dom';

export interface GameOverInfo {
  distance: number;
  best: number;
  pieces: number;
  isNewBest: boolean;
  cause: string;
}

export class GameOverScreen extends Screen {
  private cause: HTMLDivElement;
  private distance: HTMLDivElement;
  private best: HTMLDivElement;
  private pieces: HTMLDivElement;
  private newBest: HTMLDivElement;

  constructor(parent: HTMLElement, actions: { retry: () => void; menu: () => void }) {
    super(parent, 'dim-bg');
    el('h1', 'gameover-title', 'The Journey Ends', this.root);
    this.cause = el('div', 'cause', '', this.root);
    const stats = el('div', 'stats', '', this.root);
    this.distance = this.stat(stats, 'Distance');
    this.best = this.stat(stats, 'Best');
    this.pieces = this.stat(stats, 'Map pieces');
    this.newBest = el('div', 'new-best', 'Your furthest journey yet', this.root);
    const buttons = el('div', 'menu-buttons', '', this.root);
    button('Try Again', actions.retry, buttons, true);
    button('Main Menu', actions.menu, buttons);
  }

  private stat(parent: HTMLElement, label: string): HTMLDivElement {
    const s = el('div', 'stat', '', parent);
    el('div', 'label', label, s);
    return el('div', 'value', '', s);
  }

  open(info: GameOverInfo): void {
    this.cause.textContent = info.cause;
    this.distance.textContent = formatDistance(info.distance);
    this.best.textContent = formatDistance(info.best);
    this.pieces.textContent = `◆ ${info.pieces}`;
    this.newBest.classList.toggle('hidden', !info.isNewBest);
    this.show();
  }
}
