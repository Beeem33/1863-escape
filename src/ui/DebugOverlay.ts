import { el } from './dom';

/** F1 developer overlay. The Game fills in the lines each frame. */
export class DebugOverlay {
  private root: HTMLDivElement;
  visible = false;
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'debug hidden', '', parent);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.classList.toggle('hidden', !this.visible);
  }

  /** Throttled to ~8 updates/s so the overlay itself costs nothing. */
  update(dt: number, lines: () => string[]): void {
    if (!this.visible) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.12;
    this.root.textContent = lines().join('\n');
  }
}
