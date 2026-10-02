import * as THREE from 'three';
import { CollectibleConfig, GraphicsConfig, PlayerConfig } from '../config/GameConfig';
import { ENDINGS, ROUTE_FRAGMENTS } from '../config/Story';
import { PostProcessing } from '../effects/PostProcessing';
import { BattleHazards } from '../enemies/BattleHazards';
import { PursuitManager } from '../enemies/PursuitManager';
import { Autopilot } from '../player/Autopilot';
import { PlayerSystem } from '../player/PlayerSystem';
import { UIManager } from '../ui/UIManager';
import { formatDistance } from '../utils/MathUtils';
import { Random, hash32, makeSeed } from '../utils/Random';
import { WorldManager } from '../world/WorldManager';
import { Difficulty } from './Difficulty';
import { EventBus } from './EventBus';
import { GameLoop } from './GameLoop';
import { GameState, Records, RunStats } from './GameState';
import { InputManager } from './InputManager';
import { Settings, type Quality } from './Settings';

/** Seconds between being caught and the game-over screen. */
const CAPTURE_SEQUENCE = 2.8;

/**
 * Top-level owner of every system. Wires them together, runs the state
 * machine and the frame. Systems communicate through the EventBus; this
 * class only orchestrates.
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
  readonly pursuit: PursuitManager;
  readonly hazards: BattleHazards;
  readonly post: PostProcessing;
  readonly ui: UIManager;
  readonly autopilot = new Autopilot();

  state = GameState.Menu;
  private eventRng = new Random(1);
  private stateTime = 0;
  private fixedSeed: number | null = null;
  private pixelRatio = 1;

  // Debug toggles.
  godMode = false;
  autopilotOn = false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly uiRoot: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(this.settings.data.fov, 1, 0.1, 1500);
    this.input = new InputManager(canvas);
    this.players = new PlayerSystem(this.input, this.bus, this.camera, this.settings);
    this.world = new WorldManager(this.scene, this.renderer, this.bus);
    this.pursuit = new PursuitManager(this.scene, this.bus);
    this.hazards = new BattleHazards(this.scene, this.bus, this.world.particles);
    this.post = new PostProcessing(this.renderer, this.scene, this.camera);
    this.ui = new UIManager(uiRoot, this.settings, {
      play: () => this.startRun(),
      resume: () => this.resume(),
      quitToMenu: () => this.toMenu(),
      retry: () => this.startRun(),
    });
    this.loop = new GameLoop((dt) => this.frame(dt));

    const params = new URLSearchParams(location.search);
    if (params.has('seed')) this.fixedSeed = Number(params.get('seed')) || 1;
    if (params.has('debug')) this.ui.debug.toggle();

    this.wireEvents();
    this.applyQuality(this.settings.data.quality);
    this.settings.onChange((s) => this.applyQuality(s.quality));
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.toMenu();
  }

  start(): void {
    this.loop.start();
  }

  // ------------------------------------------------------------ States ---

  private newSeed(): number {
    return this.fixedSeed ?? makeSeed();
  }

  /** Main menu with the attract-mode camera drifting through the fields. */
  toMenu(): void {
    this.state = GameState.Menu;
    this.stateTime = 0;
    this.input.exitPointerLock();
    this.resetWorld(this.newSeed());
    this.ui.hideAllScreens();
    this.ui.hud.hide();
    this.ui.captions.clear();
    this.ui.menu.show();
    this.post.fade = 0;
  }

  startRun(): void {
    this.resetWorld(this.newSeed());
    this.state = GameState.Playing;
    this.stateTime = 0;
    this.ui.hideAllScreens();
    this.ui.hud.show();
    this.ui.captions.clear();
    if (this.settings.data.mouseLook) this.input.requestPointerLock();
    this.bus.emit('run:start', { seed: this.stats.seed });
    window.setTimeout(() => {
      if (this.state === GameState.Playing) this.ui.captions.showCaption(this.world.map?.name ?? '', this.world.map?.caption ?? '');
    }, 900);
  }

  private resetWorld(seed: number): void {
    this.stats.reset(seed);
    this.eventRng = new Random(hash32(seed, 77));
    this.world.reset(seed);
    this.players.reset();
    this.pursuit.reset();
    this.hazards.reset();
    this.post.danger = this.post.desaturate = this.post.flash = 0;
  }

  pause(): void {
    if (this.state !== GameState.Playing) return;
    this.state = GameState.Paused;
    this.input.exitPointerLock();
    this.ui.pause.show();
  }

  resume(): void {
    if (this.state !== GameState.Paused) return;
    this.ui.closePanel();
    this.ui.pause.hide(true);
    this.state = GameState.Playing;
    if (this.settings.data.mouseLook) this.input.requestPointerLock();
  }

  private beginCapture(): void {
    this.state = GameState.Dying;
    this.stateTime = 0;
    this.input.exitPointerLock();
  }

  private toGameOver(): void {
    this.state = GameState.GameOver;
    const distance = Math.floor(this.players.player.d);
    const isNewBest = Records.submit(distance);
    Records.addPieces(this.stats.mapPieces);
    const mapId = this.world.map?.id ?? 'cotton';
    const cause = this.eventRng.pick(ENDINGS[mapId]);
    this.ui.hud.hide();
    this.ui.captions.clear();
    this.ui.gameOver.open({ distance, best: Records.best, pieces: this.stats.mapPieces, isNewBest, cause });
    this.bus.emit('run:end', { distance, collectibles: this.stats.collectibles, best: Records.best, isNewBest, cause });
  }

  // ------------------------------------------------------------ Wiring ---

  private wireEvents(): void {
    const view = this.players.view;
    this.bus.on('player:hit', (e) => {
      view.shake(0.3 + e.severity * 0.3);
      view.kick(1.5 * e.severity);
      this.post.flash = Math.min(1, 0.45 + e.severity * 0.3);
      this.stats.hits++;
    });
    this.bus.on('player:land', (e) => view.kick(0.5 + e.impact * 1.2));
    this.bus.on('battle:explosion', (e) => view.shake(Math.max(0, 0.7 - e.distance / 60)));
    this.bus.on('battle:cannon', (e) => view.shake(Math.max(0, 0.12 - e.distance / 1500)));
    this.bus.on('player:footstep', (e) => {
      const p = this.players.player;
      if (e.surface === 'dirt' && this.state === GameState.Playing && Math.random() < 0.5) {
        this.world.particles.dustKick(p.x + (Math.random() - 0.5) * 0.4, p.y, p.z + 0.6, 0.4, 0x9a7a58);
      }
    });
    this.bus.on('player:splash', () => {
      const p = this.players.player;
      this.world.particles.splash(p.x, p.y, p.z - 0.4, 1);
    });
    this.bus.on('collectible:pickup', (e) => {
      this.stats.collectibles++;
      if (e.type === 'mapPiece') {
        this.stats.mapPieces++;
        const n = CollectibleConfig.piecesPerRouteFragment;
        if (this.stats.mapPieces % n === 0) {
          const i = (this.stats.mapPieces / n - 1) % ROUTE_FRAGMENTS.length;
          this.ui.captions.showStory(`Route fragment ${this.stats.mapPieces / n}`, ROUTE_FRAGMENTS[i]);
        }
      }
    });
    this.bus.on('map:enter', (e) => {
      if (this.state === GameState.Playing && this.stateTime > 3) this.ui.captions.showCaption(e.name, e.caption);
    });

    this.input.onPointerLockChange = (locked) => {
      // Losing the mouse mid-run (Esc) pauses the game.
      if (!locked && this.state === GameState.Playing && this.settings.data.mouseLook) this.pause();
    };
    this.canvas.addEventListener('click', () => {
      if (this.state === GameState.Playing && this.settings.data.mouseLook) this.input.requestPointerLock();
    });
  }

  private applyQuality(q: Quality): void {
    this.pixelRatio = Math.min(window.devicePixelRatio, GraphicsConfig.maxPixelRatio[q]);
    this.renderer.setPixelRatio(this.pixelRatio);
    const shadow = GraphicsConfig.shadowMapSize[q];
    this.renderer.shadowMap.enabled = shadow > 0;
    this.world.environment.setShadowQuality(shadow);
    this.post.setBloom(GraphicsConfig.bloom[q]);
    this.world.chunks.density = q === 'high' ? 1 : q === 'medium' ? 0.7 : 0.45;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.resize();
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, this.pixelRatio);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------- Frame ---

  private handleGlobalKeys(): void {
    const i = this.input;
    if (i.wasPressed('F1', 'Backquote')) this.ui.debug.toggle();
    if (i.wasPressed('Escape', 'KeyP')) {
      if (this.ui.closePanel()) {
        /* closed a sub-panel */
      } else if (this.state === GameState.Playing) this.pause();
      else if (this.state === GameState.Paused) this.resume();
    }
    if (!this.ui.debug.visible) return;
    if (i.wasPressed('F2')) this.godMode = !this.godMode;
    if (i.wasPressed('F3')) this.world.obstacles.setDebug(!this.world.obstacles.debugEnabled);
    if (i.wasPressed('F4')) this.skipToNextMap();
    if (i.wasPressed('F5')) this.autopilotOn = !this.autopilotOn;
  }

  /** Debug: jump to just before the next map transition. */
  private skipToNextMap(): void {
    if (this.state !== GameState.Playing) return;
    const p = this.players.player;
    const target = this.world.maps.nextMapStart(p.d) - 360;
    if (target <= p.d) return;
    // Advance chunk by chunk so generation stays sequential.
    while (p.d < target) {
      p.d = Math.min(target, p.d + 30);
      this.world.chunks.update(p.d, 3);
    }
    this.world.chunks.fill(p.d);
  }

  private frame(dt: number): void {
    this.handleGlobalKeys();
    this.stateTime += dt;
    const p = this.players.player;
    const baseSpeed = Difficulty.runSpeed(p.d);

    switch (this.state) {
      case GameState.Menu: {
        // Attract mode: the autopilot jogs the trail; nothing can hurt it.
        const intent = this.autopilot.update(p, this.world.chunks, this.world.obstacles);
        this.players.update(dt, PlayerConfig.baseRunSpeed * 0.55, this.world.ground, intent);
        p.stamina = 100;
        this.world.update(dt, p, this.camera);
        break;
      }
      case GameState.Playing:
        this.updatePlaying(dt, baseSpeed);
        break;
      case GameState.Dying: {
        // Caught: legs give out, the head turns to see them.
        this.players.update(dt, 0, this.world.ground, 'none', this.stateTime > 0.4);
        p.speed *= Math.max(0, 1 - dt * 2.5);
        this.pursuit.update(dt, p, this.darkness(), this.eventRng, this.world.ground.height);
        this.world.update(dt, p, this.camera);
        this.post.fade = Math.min(1, Math.max(0, (this.stateTime - 1.2) / (CAPTURE_SEQUENCE - 1.2)));
        this.post.danger = 1;
        if (this.stateTime >= CAPTURE_SEQUENCE) this.toGameOver();
        break;
      }
      case GameState.GameOver:
        this.post.fade = Math.max(0.55, this.post.fade - dt * 0.5);
        break;
      case GameState.Paused:
        break;
    }

    this.post.update(dt, this.world.environment.current);
    this.post.render();
    this.updateDebug(dt);
    this.input.endFrame();
  }

  private updatePlaying(dt: number, baseSpeed: number): void {
    const p = this.players.player;
    const intent = this.autopilotOn ? this.autopilot.update(p, this.world.chunks, this.world.obstacles) : 'input';
    this.players.update(dt, baseSpeed, this.world.ground, intent);

    if (this.godMode) p.invulnerableTimer = Math.max(p.invulnerableTimer, 0.1);
    this.world.obstacles.collide(p);
    this.world.collectibles.collect(p);
    const battle = this.world.maps.weightOf('battlefield', p.d);
    this.hazards.update(dt, p, battle, this.eventRng, this.world.ground.height);
    if (this.godMode) this.pursuit.gap = Math.max(this.pursuit.gap, 40);
    this.pursuit.update(dt, p, this.darkness(), this.eventRng, this.world.ground.height);

    this.world.environment.lantern = Math.min(1, p.lanternTimer / 2);
    this.world.update(dt, p, this.camera);

    this.stats.distance = p.d;
    this.stats.time += dt;
    this.stats.currentMap = this.world.mapName;
    this.ui.hud.update(p, this.stats.mapPieces, this.pursuit.gap);
    this.ui.hud.setHint(this.settings.data.mouseLook && !this.input.pointerLocked && this.stateTime > 1.5);

    this.post.danger = this.pursuit.danger;
    this.post.desaturate = p.exhausted ? 1 : Math.max(0, 0.3 - p.staminaFraction) * 2;

    if (this.pursuit.caught) this.beginCapture();
  }

  /** 0..1 — how dark the scene is (pursuers light lanterns). */
  private darkness(): number {
    const a = this.world.environment.current;
    return Math.max(0, Math.min(1, (2.2 - a.sunIntensity) / 1.2));
  }

  private updateDebug(dt: number): void {
    this.ui.debug.update(dt, () => {
      const p = this.players.player;
      const info = this.renderer.info;
      const blend = this.world.terrain.blendAt(p.d);
      const cotton = this.world.decor.stats().find((s) => s.kind === 'cottonPlant');
      return [
        `FPS            ${this.loop.fps.toFixed(0)}`,
        `State          ${this.state}`,
        `Player pos     x ${p.x.toFixed(2)}  y ${p.y.toFixed(2)}  d ${p.d.toFixed(1)}`,
        `Player speed   ${p.speed.toFixed(2)} m/s  (base ${Difficulty.runSpeed(p.d).toFixed(2)})`,
        `Current map    ${this.world.mapName}${blend.t > 0 ? `  → ${blend.b.name} ${(blend.t * 100).toFixed(0)}%` : ''}`,
        `Lap            ${this.world.maps.lapAt(p.d)}`,
        `Chunk          ${Math.floor(p.d / 40)}  (live ${this.world.chunks.chunks.size})`,
        `Difficulty     ${(Difficulty.at(p.d) * 100).toFixed(0)}%`,
        `Pursuit gap    ${this.pursuit.gap.toFixed(1)} m  danger ${(this.pursuit.danger * 100).toFixed(0)}%`,
        `Stamina        ${p.stamina.toFixed(1)}${p.exhausted ? ' EXHAUSTED' : ''}${p.sprinting ? ' SPRINT' : ''}`,
        `Seed           ${this.stats.seed}`,
        `Draw calls     ${info.render.calls}   tris ${(info.render.triangles / 1000).toFixed(0)}k`,
        `Obstacles      ${this.world.obstacles.active.size}   pickups ${this.world.collectibles.active.size}`,
        `Particles      ${this.world.particles.smoke.alive + this.world.particles.glow.alive}   features ${this.world.features.activeCount}`,
        `Cotton inst.   ${cotton?.used ?? 0}/${cotton?.capacity ?? 0}`,
        `Best           ${formatDistance(Records.best)}`,
        '',
        `F2 god mode ${this.godMode ? 'ON' : 'off'}   F3 collision boxes   F4 skip to next map   F5 autopilot ${this.autopilotOn ? 'ON' : 'off'}`,
      ];
    });
  }
}
