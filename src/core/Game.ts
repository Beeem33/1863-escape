import * as THREE from 'three';
import { AudioManager } from '../audio/AudioManager';
import { CollectibleConfig, FallConfig, GraphicsConfig, HealthConfig, PlayerConfig } from '../config/GameConfig';
import { ENDINGS, ROUTE_FRAGMENTS, SHOT_ENDINGS } from '../config/Story';
import { PostProcessing } from '../effects/PostProcessing';
import { BattleHazards } from '../enemies/BattleHazards';
import { PursuitManager } from '../enemies/PursuitManager';
import { Autopilot } from '../player/Autopilot';
import { FirstPersonArms } from '../player/FirstPersonArms';
import { PlayerSystem } from '../player/PlayerSystem';
import { UIManager } from '../ui/UIManager';
import { formatDistance } from '../utils/MathUtils';
import { Random, hash32, makeSeed } from '../utils/Random';
import { WorldManager } from '../world/WorldManager';
import { WeatherSystem } from '../world/Weather';
import { StoryEvents } from '../world/StoryEvents';
import { nextCrossLane } from '../maps/CottonFieldMap';
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
  readonly audio: AudioManager;
  readonly autopilot = new Autopilot();
  readonly arms = new FirstPersonArms();
  readonly weather = new WeatherSystem();
  readonly story: StoryEvents;

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
    this.scene.add(this.players.view.body);
    this.players.view.body.add(this.arms.root);
    this.world = new WorldManager(this.scene, this.renderer, this.bus);
    this.pursuit = new PursuitManager(this.bus, this.world.characters, this.world.particles);
    this.hazards = new BattleHazards(this.scene, this.bus, this.world.particles);
    this.story = new StoryEvents(this.world.characters, this.world.particles, this.bus);
    this.post = new PostProcessing(this.renderer, this.scene, this.camera);
    this.audio = new AudioManager(this.bus, this.settings);
    this.ui = new UIManager(uiRoot, this.settings, {
      play: () => this.openPlay(),
      pickLevel: (level) => this.startRun(level),
      resume: () => this.resume(),
      quitToMenu: () => this.toMenu(),
      retry: () => this.startRun(this.stats.startLevel),
    }, this.levelOptions());
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
    this.audio.active = false;
    this.audio.setPaused(false);
    this.input.exitPointerLock();
    this.resetWorld(this.newSeed());
    this.ui.hideAllScreens();
    this.ui.hud.hide();
    this.ui.captions.clear();
    this.ui.menu.show();
    this.post.fade = 0;
  }

  /** The level list for the level-select screen. */
  private levelOptions(): { level: number; title: string; name: string; unlockAt: number }[] {
    const maps = this.world.maps;
    return Array.from({ length: maps.levelCount }, (_, i) => {
      const info = maps.levelInfo(i + 1);
      return { level: i + 1, title: info.title, name: info.map.name, unlockAt: maps.levelStart(i + 1) };
    });
  }

  /** Play: straight into Level 1, or choose a level once more are unlocked. */
  openPlay(): void {
    if (Records.unlockedLevel > 1) this.ui.openLevelSelect();
    else this.startRun(1);
  }

  startRun(level = 1): void {
    this.resetWorld(this.newSeed(), level);
    this.state = GameState.Playing;
    this.stateTime = 0;
    this.audio.active = true;
    this.audio.setPaused(false);
    this.ui.hideAllScreens();
    this.ui.hud.show();
    this.ui.captions.clear();
    if (this.settings.data.mouseLook) this.input.requestPointerLock();
    this.bus.emit('run:start', { seed: this.stats.seed });
    window.setTimeout(() => {
      if (this.state === GameState.Playing) this.showLevelCard(level, false);
    }, 700);
  }

  private showLevelCard(level: number, unlocked: boolean): void {
    const info = this.world.maps.levelInfo(level);
    this.ui.levelCard.show(info.title, info.map.name, info.map.caption, unlocked);
  }

  /** Reset everything for a new run starting at the beginning of `level`. */
  resetWorld(seed: number, level = 1): void {
    const startD = this.world.maps.levelStart(level);
    this.stats.reset(seed, level, startD);
    this.eventRng = new Random(hash32(seed, 77));
    this.world.reset(seed, startD);
    this.weather.reset(new Random(hash32(seed, 0x77e)));
    this.players.reset();
    this.players.player.d = startD;
    this.pursuit.reset();
    this.hazards.reset();
    this.story.reset(this.eventRng);
    this.post.danger = this.post.desaturate = this.post.flash = 0;
  }

  pause(): void {
    if (this.state !== GameState.Playing) return;
    this.state = GameState.Paused;
    this.audio.setPaused(true);
    this.input.exitPointerLock();
    this.ui.pause.show();
  }

  resume(): void {
    if (this.state !== GameState.Paused) return;
    this.ui.closePanel();
    this.ui.pause.hide(true);
    this.state = GameState.Playing;
    this.audio.setPaused(false);
    if (this.settings.data.mouseLook) this.input.requestPointerLock();
  }

  /** How the run is ending: run down by the riders, or shot. */
  private endCause: 'caught' | 'shot' = 'caught';

  private beginCapture(cause: 'caught' | 'shot'): void {
    this.endCause = cause;
    this.state = GameState.Dying;
    this.stateTime = 0;
    if (cause === 'shot') this.players.movement.startFall(this.players.player);
    this.input.exitPointerLock();
  }

  private toGameOver(): void {
    this.state = GameState.GameOver;
    this.audio.active = false;
    const distance = Math.floor(this.stats.distance);
    const isNewBest = Records.submit(distance);
    Records.addPieces(this.stats.mapPieces);
    const mapId = this.world.map?.id ?? 'cotton';
    const cause = this.eventRng.pick(this.endCause === 'shot' ? SHOT_ENDINGS[mapId] : ENDINGS[mapId]);
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
    this.bus.on('player:wounded', () => {
      view.shake(0.6);
      view.kick(2);
      this.post.flash = 1;
    });
    this.bus.on('player:land', (e) => view.kick(0.5 + e.impact * 1.2));
    this.bus.on('player:fall', (e) => {
      const p = this.players.player;
      if (e.stage === 'impact') {
        view.shake(0.55);
        this.post.flash = Math.max(this.post.flash, 0.5);
        this.world.particles.dustKick(p.x, p.y, p.z - 0.8, 3, 0x8a7458);
      } else if (e.stage === 'getup') {
        this.world.particles.dustKick(p.x, p.y, p.z - 0.5, 1, 0x8a7458);
      }
    });
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
    this.bus.on('level:up', (e) => this.showLevelCard(e.level, e.unlocked));

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
    if (i.wasPressed('F6')) this.weather.cycle(this.bus);
  }

  /** Debug: jump to just before the next map transition. */
  private skipToNextMap(): void {
    if (this.state !== GameState.Playing) return;
    const p = this.players.player;
    const target = this.world.maps.nextMapStart(p.d) - 360;
    if (!Number.isFinite(target) || target <= p.d) return;
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

    if (this.state !== GameState.Paused) this.weather.update(dt, this.bus);

    switch (this.state) {
      case GameState.Menu: {
        // Attract mode: the autopilot jogs the trail; nothing can hurt it.
        const intent = this.autopilot.update(p, this.world.chunks, this.world.obstacles);
        this.players.update(dt, PlayerConfig.baseRunSpeed * 0.55, this.world.ground, intent);
        p.stamina = 100;
        this.world.update(dt, p, this.camera, this.weather);
        break;
      }
      case GameState.Playing:
        this.updatePlaying(dt, baseSpeed);
        break;
      case GameState.Dying: {
        // Caught: legs give out, the head turns to see them. Shot: he goes down and stays down.
        this.players.update(dt, 0, this.world.ground, 'none', this.endCause === 'caught' && this.stateTime > 0.4);
        if (this.endCause === 'shot') p.fallTime = Math.min(p.fallTime, FallConfig.pushUpAt - 0.3);
        p.speed *= Math.max(0, 1 - dt * 2.5);
        this.pursuit.update(dt, p, this.eventRng, this.world.ground.height);
        this.world.update(dt, p, this.camera, this.weather);
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

    if (this.state !== GameState.Paused) {
      this.arms.update(dt, this.players.player);
      this.arms.root.visible = this.players.view.headTurn < 1.1;
      const p2 = this.players.player;
      this.audio.update(dt, this.world.terrain.blendAt(p2.d), p2, this.state === GameState.Playing, this.weather.state);
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
    const hit = this.world.obstacles.collide(p);
    if (hit?.trip) this.players.movement.startFall(p);
    this.world.collectibles.collect(p);
    const battle = this.world.maps.weightOf('battlefield', p.d);
    this.hazards.update(dt, p, battle, this.eventRng, this.world.ground.height);
    if (this.godMode) this.pursuit.gap = Math.max(this.pursuit.gap, 40);
    this.pursuit.update(dt, p, this.eventRng, this.world.ground.height);
    const nearBoundary = this.world.maps.boundaries.some((b) => p.d > b - 160 && p.d < b + 60);
    this.story.update(dt, p, this.eventRng, this.world.ground.height, !nearBoundary, this.stats.time, (d) =>
      this.world.maps.mapAt(d).id === 'cotton' ? nextCrossLane(d) : d,
    );

    this.world.environment.lantern = Math.min(1, p.lanternTimer / 2);
    this.world.update(dt, p, this.camera, this.weather);

    this.stats.distance = p.d - this.stats.startDistance;
    this.stats.time += dt;
    this.stats.currentMap = this.world.mapName;

    // ---- Levels: crossing a boundary unlocks the next level ---------------
    const maps = this.world.maps;
    const level = maps.levelAt(p.d);
    if (level > this.stats.level) {
      this.stats.level = level;
      const unlocked = Records.unlockLevel(level);
      this.bus.emit('level:up', { level, unlocked });
    }
    const end = maps.levelEnd(p.d);
    const next = maps.levelInfo(level + 1);
    const levelText = Number.isFinite(end)
      ? `${maps.levelInfo(level).title} · ${next.map.name.replace(/^The /, 'the ')} in ${Math.max(0, Math.ceil(end - p.d)).toLocaleString('en-US')} m`
      : `${maps.levelInfo(level).title} · ${this.world.mapName}`;
    this.ui.hud.update(p, this.stats.distance, this.stats.mapPieces, this.pursuit.gap, levelText);
    this.ui.hud.setHint(this.settings.data.mouseLook && !this.input.pointerLocked && this.stateTime > 1.5);

    const wound = 1 - Math.max(0, p.health) / HealthConfig.max;
    this.post.danger = Math.max(this.pursuit.danger, wound * 0.75);
    this.post.desaturate = p.exhausted ? 1 : Math.max(0, 0.3 - p.staminaFraction) * 2;

    if (this.pursuit.shotDown) this.beginCapture('shot');
    else if (this.pursuit.caught) this.beginCapture('caught');
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
        `Level          ${this.world.maps.levelAt(p.d)}  (journey ${p.d.toFixed(0)} m)`,
        `Weather        ${this.weather.label}`,
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
        `F2 god mode ${this.godMode ? 'ON' : 'off'}   F3 collision boxes   F4 skip to next map   F5 autopilot ${this.autopilotOn ? 'ON' : 'off'}   F6 next weather`,
      ];
    });
  }
}
