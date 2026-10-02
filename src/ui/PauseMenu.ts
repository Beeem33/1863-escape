import { button, el, Screen } from './dom';

export class PauseMenu extends Screen {
  constructor(parent: HTMLElement, actions: { resume: () => void; settings: () => void; quit: () => void }) {
    super(parent, 'dim-bg');
    el('div', 'subtitle', 'Paused', this.root).style.marginBottom = '26px';
    const buttons = el('div', 'menu-buttons', '', this.root);
    button('Resume', actions.resume, buttons, true);
    button('Settings', actions.settings, buttons);
    button('Main Menu', actions.quit, buttons);
    el('div', 'small-note', 'Esc or P to resume', this.root);
  }
}
