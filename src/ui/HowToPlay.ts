import { isTouchDevice } from '../core/Device';
import { button, el, Screen } from './dom';

export class HowToPlay extends Screen {
  constructor(parent: HTMLElement, onBack: () => void) {
    super(parent, 'dim-bg');
    const panel = el('div', 'panel', '', this.root);
    el('h2', '', 'How to Play', panel);
    el(
      'p',
      '',
      'You are always running. Move freely across the trail to find a way through — fences, wagons, fallen trees, craters. Every stumble lets the riders behind you close the distance. Run clean and you pull away.',
      panel,
    );
    const keys = el('div', 'keys', '', panel);
    const rows: [string, string][] = isTouchDevice ? [
      ['Left stick', 'Drag left / right to move across the trail'],
      ['Stick up', 'Push harder — all the way up to sprint'],
      ['Stick down', 'Ease off — catch your breath, lose ground'],
      ['Jump', 'Vault low obstacles, leap ditches and craters'],
      ['Sprint', 'Hold to sprint (burns stamina)'],
      ['Look back', 'Hold to glance over your shoulder'],
      ['Right side', 'Drag to look around'],
      ['❚❚', 'Pause'],
    ] : [
      ['W / ↑', 'Push harder'],
      ['S / ↓', 'Ease off — catch your breath, lose ground'],
      ['A D / ← →', 'Move left and right'],
      ['Shift', 'Sprint (burns stamina)'],
      ['Space', 'Vault low obstacles, leap ditches and craters'],
      ['Q', 'Glance back over your shoulder'],
      ['Mouse', 'Look around (click to capture, Esc to release)'],
      ['Esc / P', 'Pause'],
    ];
    for (const [k, v] of rows) {
      el('div', 'key', k, keys);
      el('div', '', v, keys);
    }
    el(
      'p',
      '',
      '◆ Map pieces mark the route north — gather them to reveal it. Water gourds and cornbread restore stamina. A horseshoe brings a burst of speed. A lantern pushes back the dark and the fog.',
      panel,
    );
    el('p', '', 'Low obstacles can be vaulted; tall ones must be avoided. There is always a way through.', panel);
    button('Back', onBack, panel);
  }
}
