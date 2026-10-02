/** Minimal DOM helpers — the UI is plain HTML/CSS, no framework. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

export function button(label: string, onClick: () => void, parent: HTMLElement, primary = false): HTMLButtonElement {
  const b = el('button', primary ? 'btn primary' : 'btn', label, parent);
  b.type = 'button';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

/** Base for full-screen overlays that fade in and out. */
export class Screen {
  readonly root: HTMLDivElement;
  private hideTimer = 0;

  constructor(parent: HTMLElement, className: string) {
    this.root = el('div', `screen ${className} hidden`, '', parent);
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  show(): void {
    clearTimeout(this.hideTimer);
    this.root.classList.remove('hidden');
    requestAnimationFrame(() => this.root.classList.add('show'));
  }

  hide(immediate = false): void {
    this.root.classList.remove('show');
    clearTimeout(this.hideTimer);
    if (immediate) this.root.classList.add('hidden');
    else this.hideTimer = window.setTimeout(() => this.root.classList.add('hidden'), 900);
  }
}
