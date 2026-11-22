import type { InputManager } from '../core/InputManager';
import { el } from './dom';

/** Key codes the on-screen controls can hold down. */
type Code = 'KeyW' | 'KeyS' | 'KeyA' | 'KeyD' | 'ShiftLeft' | 'KeyQ' | 'Space';
const CODES: Code[] = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft', 'KeyQ', 'Space'];

/** Joystick radius in CSS px. */
const STICK_R = 56;
/** Touch-drag look speed, relative to mouse movement. */
const LOOK_GAIN = 1.6;

/**
 * On-screen controls for phones and tablets, plus full screen.
 *
 * - Left half: a floating joystick. Sideways moves, up pushes harder,
 *   all the way up sprints, down eases off.
 * - Right half: drag to look around.
 * - Buttons: Jump, Sprint (hold), Look back (hold), Pause.
 *
 * The controls press the same key codes as the keyboard, so the rest of the
 * game does not know or care where input came from. Only created on touch
 * devices (see core/Device.ts).
 */
export class TouchControls {
  private readonly layer: HTMLDivElement;
  private readonly stick: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly rotateHint: HTMLDivElement;
  /** Which codes each control is holding. */
  private holds: Record<string, Partial<Record<Code, boolean>>> = {};
  private active = false;

  private stickId: number | null = null;
  private stickX = 0;
  private stickY = 0;
  private lookId: number | null = null;
  private lookX = 0;
  private lookY = 0;

  /**
   * @param onPause called by the pause button, and when the player leaves
   *   full screen mid-run.
   */
  constructor(
    private readonly input: InputManager,
    private readonly onPause: () => void,
  ) {
    input.touchMode = true;
    document.documentElement.classList.add('touch');
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    this.layer = el('div', 'touch-controls hidden', '', document.body);

    const moveZone = el('div', 'tc-zone tc-move', '', this.layer);
    this.stick = el('div', 'tc-stick', '', moveZone);
    this.knob = el('div', 'tc-knob', '', this.stick);
    this.wireStick(moveZone);

    const lookZone = el('div', 'tc-zone tc-look', '', this.layer);
    this.wireLook(lookZone);

    this.holdButton(el('div', 'tc-btn tc-jump', 'Jump', this.layer), 'jump', 'Space', () => {
      input.tap('Space');
      navigator.vibrate?.(12);
    });
    this.holdButton(el('div', 'tc-btn tc-sprint', 'Sprint', this.layer), 'sprint', 'ShiftLeft');
    this.holdButton(el('div', 'tc-btn tc-back', 'Look back', this.layer), 'lookBack', 'KeyQ');
    const pause = el('div', 'tc-btn tc-pause', '', this.layer);
    pause.setAttribute('aria-label', 'Pause');
    this.holdButton(pause, 'pause', null, () => this.onPause());

    this.rotateHint = el('div', 'tc-rotate hidden', 'Turn your phone sideways for the best view', document.body);

    const onFsChange = (): void => {
      if (!isFullscreen() && this.active) this.onPause();
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
    window.addEventListener('blur', () => this.releaseAll());
  }

  /** Show the controls only while a run is in progress. Call every frame. */
  setActive(on: boolean): void {
    this.rotateHint.classList.toggle('hidden', !(on && window.innerHeight > window.innerWidth));
    if (on === this.active) return;
    this.active = on;
    this.layer.classList.toggle('hidden', !on);
    if (!on) this.releaseAll();
  }

  /**
   * Go full screen and turn to landscape. Must be called from a tap (a user
   * gesture). iPhone Safari has no full screen for web pages; there the game
   * goes full screen when launched from a Home Screen icon instead.
   */
  enterFullscreen(): void {
    const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (isFullscreen()) return;
    const lock = (): void => {
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      o?.lock?.('landscape').catch(() => {});
    };
    try {
      if (root.requestFullscreen) {
        root.requestFullscreen({ navigationUI: 'hide' }).then(lock).catch(() => {});
      } else if (root.webkitRequestFullscreen) {
        root.webkitRequestFullscreen();
        lock();
      }
    } catch {
      /* not supported */
    }
  }

  // ------------------------------------------------------------ internals

  private sync(): void {
    for (const code of CODES) {
      let held = false;
      for (const k in this.holds) if (this.holds[k][code]) held = true;
      this.input.setHeld(code, held);
    }
  }

  private releaseAll(): void {
    this.holds = {};
    this.sync();
    this.resetStick();
    this.lookId = null;
  }

  private resetStick(): void {
    this.stickId = null;
    this.knob.style.transform = '';
    this.stick.style.left = '';
    this.stick.style.top = '';
    this.stick.classList.remove('active');
  }

  private wireStick(zone: HTMLDivElement): void {
    const move = (e: PointerEvent): void => {
      if (e.pointerId !== this.stickId) return;
      e.preventDefault();
      let dx = e.clientX - this.stickX;
      let dy = e.clientY - this.stickY;
      const len = Math.hypot(dx, dy);
      if (len > STICK_R) {
        dx = (dx / len) * STICK_R;
        dy = (dy / len) * STICK_R;
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const nx = dx / STICK_R;
      const ny = dy / STICK_R;
      this.holds.stick = {
        KeyA: nx < -0.35,
        KeyD: nx > 0.35,
        KeyW: ny < -0.45,
        KeyS: ny > 0.55,
        ShiftLeft: ny < -0.92, // pushed all the way up also sprints
      };
      this.sync();
    };
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== this.stickId) return;
      delete this.holds.stick;
      this.resetStick();
      this.sync();
    };
    zone.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return;
      e.preventDefault();
      this.stickId = e.pointerId;
      zone.setPointerCapture?.(e.pointerId);
      const r = zone.getBoundingClientRect();
      this.stickX = e.clientX;
      this.stickY = e.clientY;
      this.stick.style.left = `${e.clientX - r.left}px`;
      this.stick.style.top = `${e.clientY - r.top}px`;
      this.stick.classList.add('active');
      move(e);
    });
    zone.addEventListener('pointermove', move);
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  private wireLook(zone: HTMLDivElement): void {
    zone.addEventListener('pointerdown', (e) => {
      if (this.lookId !== null) return;
      e.preventDefault();
      this.lookId = e.pointerId;
      this.lookX = e.clientX;
      this.lookY = e.clientY;
      zone.setPointerCapture?.(e.pointerId);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      e.preventDefault();
      this.input.addLook((e.clientX - this.lookX) * LOOK_GAIN, (e.clientY - this.lookY) * LOOK_GAIN);
      this.lookX = e.clientX;
      this.lookY = e.clientY;
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  private holdButton(btn: HTMLDivElement, name: string, code: Code | null, onPress?: () => void): void {
    const ids = new Set<number>();
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ids.add(e.pointerId);
      btn.setPointerCapture?.(e.pointerId);
      btn.classList.add('down');
      if (code) {
        this.holds[name] = { [code]: true };
        this.sync();
      }
      onPress?.();
    });
    const up = (e: PointerEvent): void => {
      if (!ids.delete(e.pointerId) || ids.size > 0) return;
      btn.classList.remove('down');
      if (code) {
        delete this.holds[name];
        this.sync();
      }
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  }
}

function isFullscreen(): boolean {
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  return !!(document.fullscreenElement || d.webkitFullscreenElement);
}

/**
 * iPhone Safari can't make a web page full screen. If that's where we are,
 * show a dismissible tip on the main menu explaining the Home Screen route.
 */
export function iosFullscreenTip(menuRoot: HTMLElement): void {
  const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: unknown };
  const canFullscreen = !!(root.requestFullscreen || root.webkitRequestFullscreen);
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
  if (canFullscreen || standalone) return;
  const tip = el(
    'div',
    'tc-ios-tip',
    'For full screen on iPhone: tap Share, then “Add to Home Screen”, and play from the new icon.',
    menuRoot,
  );
  const close = el('span', 'tc-ios-close', '✕', tip);
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    tip.remove();
  });
}
