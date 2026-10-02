import type { Quality, Settings, SettingsData } from '../core/Settings';
import { button, el, Screen } from './dom';

/** Options screen; every change is saved immediately. */
export class SettingsPanel extends Screen {
  constructor(
    parent: HTMLElement,
    private readonly settings: Settings,
    onBack: () => void,
  ) {
    super(parent, 'dim-bg');
    const panel = el('div', 'panel', '', this.root);
    el('h2', '', 'Settings', panel);

    this.slider(panel, 'Master volume', 'masterVolume', 0, 1, 0.05);
    this.slider(panel, 'Ambience volume', 'ambienceVolume', 0, 1, 0.05);
    this.checkbox(panel, 'Mouse look', 'mouseLook');
    this.slider(panel, 'Mouse sensitivity', 'mouseSensitivity', 0.2, 2.5, 0.05);
    this.checkbox(panel, 'Invert mouse Y', 'invertY');
    this.slider(panel, 'Head bob', 'headBob', 0, 1.5, 0.05);
    this.slider(panel, 'Field of view', 'fov', 60, 90, 1);
    this.select(panel, 'Graphics quality', 'quality', [
      ['high', 'High'],
      ['medium', 'Medium'],
      ['low', 'Low'],
    ]);
    button('Back', onBack, panel);
  }

  private row(panel: HTMLElement, label: string): HTMLDivElement {
    const row = el('div', 'settings-row', '', panel);
    el('label', '', label, row);
    return row;
  }

  private slider(panel: HTMLElement, label: string, key: keyof SettingsData, min: number, max: number, step: number): void {
    const input = el('input', '', '', this.row(panel, label));
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(this.settings.data[key]);
    input.addEventListener('input', () => this.settings.set(key, Number(input.value) as never));
  }

  private checkbox(panel: HTMLElement, label: string, key: keyof SettingsData): void {
    const input = el('input', '', '', this.row(panel, label));
    input.type = 'checkbox';
    input.checked = Boolean(this.settings.data[key]);
    input.addEventListener('change', () => this.settings.set(key, input.checked as never));
  }

  private select(panel: HTMLElement, label: string, key: 'quality', options: [Quality, string][]): void {
    const sel = el('select', '', '', this.row(panel, label));
    for (const [v, t] of options) {
      const o = el('option', '', t, sel);
      o.value = v;
    }
    sel.value = this.settings.data[key];
    sel.addEventListener('change', () => this.settings.set(key, sel.value as Quality));
  }
}
