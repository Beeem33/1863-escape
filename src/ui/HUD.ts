import { PursuitConfig } from '../config/GameConfig';
import type { Player } from '../player/Player';
import { formatDistance } from '../utils/MathUtils';
import { el } from './dom';

/**
 * Minimal, cinematic HUD: distance, map pieces, a notched stamina bar, the
 * pursuit distance (only loud when it matters) and active effects.
 */
export class HUD {
  readonly root: HTMLDivElement;
  private distance: HTMLDivElement;
  private pieces: HTMLDivElement;
  private piecesValue: HTMLSpanElement;
  private stamina: HTMLDivElement;
  private staminaFill: HTMLDivElement;
  private effects: HTMLDivElement;
  private pursuit: HTMLDivElement;
  private pursuitValue: HTMLSpanElement;
  private hint: HTMLDivElement;
  private lastPieces = -1;
  private lastDistance = -1;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'layer hud hidden', '', parent);

    const dist = el('div', 'hud-distance', '', this.root);
    el('div', 'hud-label', 'Distance', dist);
    this.distance = el('div', 'value', '0 m', dist);

    this.pieces = el('div', 'hud-pieces', '', this.root);
    el('span', 'diamond', '◆', this.pieces);
    this.piecesValue = el('span', '', '0', this.pieces);

    const bottom = el('div', 'hud-bottom', '', this.root);
    this.effects = el('div', 'effects', '', bottom);
    this.stamina = el('div', 'stamina', '', bottom);
    this.staminaFill = el('div', 'fill', '', this.stamina);

    this.pursuit = el('div', 'pursuit', '', this.root);
    el('span', '', 'Pursuers · ', this.pursuit);
    this.pursuitValue = el('span', 'value', '', this.pursuit);

    this.hint = el('div', 'hint', 'Click to capture the mouse · Esc to release', this.root);
  }

  show(): void {
    this.root.classList.remove('hidden');
    this.root.style.opacity = '1';
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  setHint(visible: boolean): void {
    this.hint.style.opacity = visible ? '1' : '0';
  }

  update(p: Player, pieces: number, gap: number): void {
    const d = Math.floor(p.d);
    if (d !== this.lastDistance) {
      this.distance.textContent = formatDistance(d);
      this.lastDistance = d;
    }
    if (pieces !== this.lastPieces) {
      this.piecesValue.textContent = String(pieces);
      if (this.lastPieces >= 0 && pieces > this.lastPieces) {
        this.pieces.classList.remove('pulse');
        void this.pieces.offsetWidth; // restart the animation
        this.pieces.classList.add('pulse');
      }
      this.lastPieces = pieces;
    }

    this.staminaFill.style.transform = `scaleX(${p.staminaFraction.toFixed(3)})`;
    this.stamina.classList.toggle('exhausted', p.exhausted);
    this.stamina.classList.toggle('sprinting', p.sprinting);

    const fx: string[] = [];
    if (p.boostTimer > 0) fx.push(`Horseshoe ${Math.ceil(p.boostTimer)}`);
    if (p.lanternTimer > 0) fx.push(`Lantern ${Math.ceil(p.lanternTimer)}`);
    if (p.exhausted) fx.push('Exhausted');
    const text = fx.join('   ·   ');
    if (this.effects.textContent !== text) this.effects.textContent = text;

    this.pursuitValue.textContent = gap >= PursuitConfig.maxGap - 0.5 ? 'far behind' : `${Math.max(0, Math.round(gap))} m`;
    this.pursuit.classList.toggle('danger', gap < PursuitConfig.dangerGap);
  }
}
