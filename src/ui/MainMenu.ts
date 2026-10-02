import { Records } from '../core/GameState';
import { formatDistance } from '../utils/MathUtils';
import { button, el, Screen } from './dom';

/**
 * Title screen. The live 3D scene (a slow drift through the cotton fields at
 * golden hour) plays behind it.
 */
export class MainMenu extends Screen {
  private record: HTMLDivElement;

  constructor(parent: HTMLElement, actions: { play: () => void; howTo: () => void; settings: () => void }) {
    super(parent, 'menu-bg');
    el('h1', 'title-1863', '1863', this.root);
    el('div', 'subtitle', 'The Escape', this.root);
    el(
      'p',
      'epigraph',
      'Mississippi, autumn 1863. A proclamation signed in Washington says you are free — but only the Union lines can make it true, and they are somewhere to the north.',
      this.root,
    );
    const buttons = el('div', 'menu-buttons', '', this.root);
    button('Play', actions.play, buttons, true);
    button('How to Play', actions.howTo, buttons);
    button('Settings', actions.settings, buttons);
    this.record = el('div', 'record', '', this.root);
    el('div', 'small-note', 'Headphones recommended', this.root);
  }

  override show(): void {
    const best = Records.best;
    this.record.textContent = best > 0 ? `Furthest journey · ${formatDistance(best)}` : '';
    super.show();
  }
}
