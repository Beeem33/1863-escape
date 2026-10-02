import { Records } from '../core/GameState';
import { button, el, Screen } from './dom';

export interface LevelOption {
  level: number;
  title: string;
  name: string;
  /** Distance needed to unlock (shown while locked). */
  unlockAt: number;
}

/** "Where does the journey begin?" — pick any unlocked level. */
export class LevelSelect extends Screen {
  private list: HTMLDivElement;

  constructor(
    parent: HTMLElement,
    private readonly levels: LevelOption[],
    private readonly onPick: (level: number) => void,
    onBack: () => void,
  ) {
    super(parent, 'dim-bg');
    const panel = el('div', 'panel', '', this.root);
    el('h2', '', 'Where the journey begins', panel);
    this.list = el('div', 'level-list', '', panel);
    button('Back', onBack, panel);
  }

  override show(): void {
    this.list.textContent = '';
    const unlocked = Records.unlockedLevel;
    for (const l of this.levels) {
      const open = l.level <= unlocked;
      const row = el('button', `level-row${open ? '' : ' locked'}`, '', this.list);
      row.type = 'button';
      row.disabled = !open;
      el('span', 'title', l.title, row);
      el('span', 'name', l.name, row);
      el('span', 'state', open ? 'Begin ▸' : `Reach ${l.unlockAt.toLocaleString('en-US')} m to unlock`, row);
      if (open) row.addEventListener('click', () => this.onPick(l.level));
    }
    super.show();
  }
}
