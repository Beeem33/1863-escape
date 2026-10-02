import type * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import { CollectibleManager } from '../collectibles/CollectibleManager';
import { ObstacleManager } from '../obstacles/ObstacleManager';
import { AmbientEffects } from '../effects/AmbientEffects';
import { Particles } from '../effects/Particles';
import { Rain } from '../effects/Rain';
import type { WeatherSystem } from './Weather';
import type { MapDefinition } from '../maps/MapDefinition';
import type { GroundQuery } from '../player/PlayerMovement';
import type { Player } from '../player/Player';
import { Random, hash32 } from '../utils/Random';
import { ChunkManager } from './ChunkManager';
import { DecorationLibrary } from './DecorationLibrary';
import { Environment } from './Environment';
import { FeatureManager } from './features/FeatureManager';
import { MapManager } from './MapManager';
import { ProceduralGenerator } from './ProceduralGenerator';
import { Terrain } from './Terrain';

/**
 * Facade over everything in the world: maps, terrain, chunks, decorations,
 * set pieces, environment and particles. The Game talks to this one object.
 */
export class WorldManager {
  readonly maps = new MapManager();
  readonly terrain: Terrain;
  readonly generator: ProceduralGenerator;
  readonly decor: DecorationLibrary;
  readonly features: FeatureManager;
  readonly chunks: ChunkManager;
  readonly environment: Environment;
  readonly particles: Particles;
  readonly ambient: AmbientEffects;
  readonly obstacles: ObstacleManager;
  readonly collectibles: CollectibleManager;
  readonly rain: Rain;
  /** 0..1 — how wet the ground is (set from the weather each frame). */
  private wetness = 0;
  private splashAcc = 0;
  private currentMap: MapDefinition | null = null;
  private time = 0;

  /** What the player's movement code needs to know about the ground. */
  readonly ground: GroundQuery = {
    height: (x, d) => this.chunks.groundHeight(x, d),
    surface: (x, d) => {
      const s = this.terrain.surface(x, d);
      // Rain turns the dirt to mud underfoot.
      return this.wetness > 0.6 && s === 'dirt' ? 'mud' : s;
    },
    waterLevel: (d) => this.terrain.waterLevel(d),
  };

  constructor(
    readonly scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    private readonly bus: EventBus,
  ) {
    this.terrain = new Terrain(this.maps);
    this.generator = new ProceduralGenerator(this.maps);
    this.decor = new DecorationLibrary(scene);
    this.features = new FeatureManager(scene);
    this.chunks = new ChunkManager(scene, this.generator, this.terrain, this.maps, this.decor, this.features);
    this.environment = new Environment(scene, renderer);
    this.particles = new Particles(scene);
    this.ambient = new AmbientEffects(this.particles);
    this.obstacles = new ObstacleManager(scene, bus, this.particles);
    this.collectibles = new CollectibleManager(scene, bus);
    this.rain = new Rain(scene);
    const height = (x: number, d: number) => this.chunks.groundHeight(x, d);
    this.chunks.onPopulate = (chunk) => {
      this.obstacles.populate(chunk, height);
      this.collectibles.populate(chunk, height);
    };
    this.decor.warmUp();
  }

  /** Start a fresh, seeded journey. */
  reset(seed: number): void {
    const rng = new Random(hash32(seed, 0x3a9));
    this.maps.reset(rng);
    this.terrain.reset(seed);
    this.generator.reset(seed);
    this.environment.randomizeWeather(rng);
    this.chunks.reset();
    this.particles.clear();
    this.currentMap = null;
    this.chunks.fill(0);
    this.decor.flush();
  }

  get mapName(): string {
    return this.currentMap?.name ?? '';
  }

  get map(): MapDefinition | null {
    return this.currentMap;
  }

  update(dt: number, player: Player, camera: THREE.Camera, weather: WeatherSystem | null = null): void {
    this.time += dt;
    this.chunks.update(player.d, 1);
    this.decor.flush();

    const blend = this.terrain.blendAt(player.d);
    this.environment.update(dt, blend, camera, player.x, player.z, weather);
    this.wetness = weather?.state.wet ?? 0;
    const rain = weather?.state.rain ?? 0;
    const a0 = this.environment.current;
    this.rain.update(dt, camera, rain, weather?.state.wind ?? 1, Math.min(1, (a0.hemiIntensity + a0.sunIntensity) / 4));
    // Raindrops splashing on the ground around you.
    this.splashAcc += dt * rain * 40;
    while (this.splashAcc > 1) {
      this.splashAcc -= 1;
      const x = player.x + (Math.random() - 0.5) * 14;
      const d = player.d + Math.random() * 16 - 2;
      this.particles.spawnSmoke({
        x,
        y: this.chunks.groundHeight(x, d) + 0.03,
        z: -d,
        vy: 0.6,
        life: 0.25,
        size: 0.05,
        endSize: 0.22,
        alpha: 0.5,
        color: 0xc8ccd0,
        lift: -4,
        fadeIn: 0.05,
      });
    }

    // Announce map changes when the new map dominates.
    const dominant = blend.t > 0.5 ? blend.b : blend.a;
    if (dominant !== this.currentMap) {
      const first = this.currentMap === null;
      this.currentMap = dominant;
      if (!first || dominant.id === 'cotton') this.bus.emit('map:enter', { id: dominant.id, name: dominant.name, caption: dominant.caption });
    }

    this.obstacles.update(dt, this.time, player.d);
    this.collectibles.update(dt, this.time);
    this.features.update({ dt, time: this.time, playerX: player.x, playerD: player.d, particles: this.particles, bus: this.bus });
    const cam = camera.position;
    this.ambient.update(dt, this.environment.current, cam.x, cam.y, cam.z, player.speed);

    // Light the smoke to match the scene.
    const a = this.environment.current;
    this.particles.smoke.tint.copy(this.environment.hemi.color).multiplyScalar(0.55 + a.hemiIntensity * 0.25 + a.sunIntensity * 0.08);
    this.particles.update(dt);
  }
}
