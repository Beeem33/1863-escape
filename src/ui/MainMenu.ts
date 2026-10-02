import { Records } from '../core/GameState';
import { formatDistance } from '../utils/MathUtils';
import { button, el, Screen } from './dom';

export interface LevelOption {
  level: number;
  title: string;
  name: string;
  /** Journey distance (m) at which this level begins. */
  startsAt: number;
}

/**
 * Title screen with the level choice. The live 3D scene (a slow drift through
 * the cotton fields at golden hour) plays behind it.
 */
export class MainMenu extends Screen {
  private record: HTMLDivElement;
  private levelButtons: { level: number; state: HTMLSpanElement }[] = [];

  constructor(
    parent: HTMLElement,
    levels: LevelOption[],
    actions: { pickLevel: (level: number) => void; howTo: () => void; settings: () => void },
  ) {
    super(parent, 'menu-bg');
    el('h1', 'title-1863', '1863', this.root);
    el('div', 'subtitle', 'The Escape', this.root);
    el(
      'p',
      'epigraph',
      'Mississippi, autumn 1863. A proclamation signed in Washington says you are free — but only the Union lines can make it true, and they are somewhere to the north.',
      this.root,
    );
    el('div', 'menu-levels-label', 'Choose where to begin', this.root);
    const row = el('div', 'menu-levels', '', this.root);
    levels.forEach((l, i) => {
      const b = el('button', 'menu-level', '', row);
      b.type = 'button';
      el('span', 'num', l.title, b);
      el('span', 'name', l.name, b);
      const state = el('span', 'state', '', b);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        actions.pickLevel(l.level);
      });
      if (i === 0) b.classList.add('first');
      this.levelButtons.push({ level: l.level, state });
      state.textContent = l.startsAt > 0 ? `From ${l.startsAt.toLocaleString('en-US')} m` : 'From the start';
    });
    const buttons = el('div', 'menu-buttons', '', this.root);
    button('How to Play', actions.howTo, buttons);
    button('Settings', actions.settings, buttons);
    this.record = el('div', 'record', '', this.root);
    el('div', 'small-note', 'Headphones recommended', this.root);
  }

  override show(): void {
    const best = Records.best;
    this.record.textContent = best > 0 ? `Furthest journey · ${formatDistance(best)}` : '';
    const reached = Records.unlockedLevel;
    for (const b of this.levelButtons) b.state.parentElement!.classList.toggle('reached', b.level <= reached);
    super.show();
  }
}
