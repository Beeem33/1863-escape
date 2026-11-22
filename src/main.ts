import './styles/main.css';
import './styles/touch.css';
import { Game } from './core/Game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLDivElement;

const game = new Game(canvas, uiRoot);
game.start();

// Handy for poking at the game from the browser console while developing.
(window as unknown as { game: Game }).game = game;
if (import.meta.env.DEV) void import('./dev/DevTools').then((m) => m.installDevTools(game));
