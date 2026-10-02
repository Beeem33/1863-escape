import type { Settings } from '../core/Settings';
import { Captions } from './Captions';
import { DebugOverlay } from './DebugOverlay';
import { el } from './dom';
import { GameOverScreen } from './GameOverScreen';
import { HowToPlay } from './HowToPlay';
import { HUD } from './HUD';
import { LevelCard } from './LevelCard';
import { MainMenu, type LevelOption } from './MainMenu';
import { PauseMenu } from './PauseMenu';
import { SettingsPanel } from './SettingsPanel';

export interface UIActions {
  pickLevel: (level: number) => void;
  resume: () => void;
  quitToMenu: () => void;
  retry: () => void;
}

/** Creates every screen and routes between them. Holds no game logic. */
export class UIManager {
  readonly hud: HUD;
  readonly captions: Captions;
  readonly menu: MainMenu;
  readonly howTo: HowToPlay;
  readonly settingsPanel: SettingsPanel;
  readonly pause: PauseMenu;
  readonly gameOver: GameOverScreen;
  readonly debug: DebugOverlay;
  readonly levelCard: LevelCard;
  /** Where "Back" from Settings / How to Play returns to. */
  private returnTo: 'menu' | 'pause' = 'menu';

  constructor(root: HTMLElement, settings: Settings, actions: UIActions, levels: LevelOption[]) {
    this.hud = new HUD(root);
    this.captions = new Captions(root);
    this.levelCard = new LevelCard(root);
    el('div', 'flash', '', root);
    this.menu = new MainMenu(root, levels, {
      pickLevel: actions.pickLevel,
      howTo: () => this.openPanel('howTo', 'menu'),
      settings: () => this.openPanel('settings', 'menu'),
    });
    this.pause = new PauseMenu(root, {
      resume: actions.resume,
      settings: () => this.openPanel('settings', 'pause'),
      quit: actions.quitToMenu,
    });
    this.gameOver = new GameOverScreen(root, { retry: actions.retry, menu: actions.quitToMenu });
    this.howTo = new HowToPlay(root, () => this.closePanel());
    this.settingsPanel = new SettingsPanel(root, settings, () => this.closePanel());
    this.debug = new DebugOverlay(root);
  }

  private openPanel(which: 'howTo' | 'settings', from: 'menu' | 'pause'): void {
    this.returnTo = from;
    (from === 'menu' ? this.menu : this.pause).hide(true);
    (which === 'howTo' ? this.howTo : this.settingsPanel).show();
  }

  /** Close Settings / How to Play. Returns true if a panel was open. */
  closePanel(): boolean {
    if (!this.howTo.visible && !this.settingsPanel.visible) return false;
    this.howTo.hide(true);
    this.settingsPanel.hide(true);
    (this.returnTo === 'menu' ? this.menu : this.pause).show();
    return true;
  }

  hideAllScreens(): void {
    for (const s of [this.menu, this.pause, this.gameOver, this.howTo, this.settingsPanel]) s.hide(true);
    this.levelCard.hide();
  }
}
