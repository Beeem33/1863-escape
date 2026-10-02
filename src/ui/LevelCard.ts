import { el } from './dom';

/**
 * The cinematic level title: black letterbox bars slide in, the level and its
 * name fade up over the running scene, then everything slides away. The run
 * never stops — it plays over a short obstacle-free stretch.
 */
export class LevelCard {
  private root: HTMLDivElement;
  private level: HTMLDivElement;
  private name: HTMLDivElement;
  private text: HTMLDivElement;
  private badge: HTMLDivElement;
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'level-card', '', parent);
    el('div', 'bar top', '', this.root);
    el('div', 'bar bottom', '', this.root);
    const center = el('div', 'level-text', '', this.root);
    this.level = el('div', 'level-number', '', center);
    this.name = el('div', 'level-name', '', center);
    el('div', 'rule', '', center);
    this.text = el('div', 'level-caption', '', center);
    this.badge = el('div', 'level-badge', '', center);
  }

  show(level: string, name: string, caption: string, unlocked: boolean, seconds = 6): void {
    this.level.textContent = level;
    this.name.textContent = name;
    this.text.textContent = caption;
    this.badge.textContent = unlocked ? 'Level unlocked' : '';
    this.root.classList.remove('show');
    void this.root.offsetWidth; // restart transitions
    this.root.classList.add('show');
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.root.classList.remove('show'), seconds * 1000);
  }

  hide(): void {
    clearTimeout(this.timer);
    this.root.classList.remove('show');
  }
}
