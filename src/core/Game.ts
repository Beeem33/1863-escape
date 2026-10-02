import * as THREE from 'three';
import { GameLoop } from './GameLoop';
import { InputManager } from './InputManager';
import { EventBus } from './EventBus';
import { Settings } from './Settings';
import { GameState, RunStats } from './GameState';
import { Difficulty } from './Difficulty';
import { PlayerSystem } from '../player/PlayerSystem';
import { WorldManager } from '../world/WorldManager';
import { makeSeed } from '../utils/Random';

/**
 * Top-level owner of every system. Wires them together and runs the frame.
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly bus = new EventBus();
  readonly input: InputManager;
  readonly settings = new Settings();
  readonly stats = new RunStats();
  readonly loop: GameLoop;
  readonly players: PlayerSystem;
  readonly world: WorldManager;
  state = GameState.Playing;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly uiRoot: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 1500);
    this.input = new InputManager(canvas);
    this.players = new PlayerSystem(this.input, this.bus, this.camera, this.settings);
    this.world = new WorldManager(this.scene, this.renderer, this.bus);
    this.world.environment.setShadowQuality(2048);
    this.loop = new GameLoop((dt, t) => this.frame(dt, t));

    const seedParam = new URLSearchParams(location.search).get('seed');
    const seed = seedParam ? Number(seedParam) : makeSeed();
    this.stats.reset(seed);
    this.world.reset(seed);
    this.players.reset();

    this.bus.on('player:hit', (e) => {
      this.players.view.shake(0.35 + e.severity * 0.35);
      this.players.view.kick(1.6 * e.severity);
    });
    this.bus.on('player:land', (e) => this.players.view.kick(0.6 + e.impact * 1.2));

    canvas.addEventListener('click', () => this.input.requestPointerLock());
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  start(): void {
    this.loop.start();
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private frame(dt: number, _time: number): void {
    const p = this.players.player;
    this.players.update(dt, Difficulty.runSpeed(p.d), this.world.ground, true);
    this.world.obstacles.collide(p);
    this.world.collectibles.collect(p);
    this.world.environment.lantern = Math.min(1, p.lanternTimer / 2);
    this.world.update(dt, p, this.camera);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }
}
