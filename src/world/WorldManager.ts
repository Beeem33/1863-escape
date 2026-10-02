import type * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import { AmbientEffects } from '../effects/AmbientEffects';
import { Particles } from '../effects/Particles';
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
  private currentMap: MapDefinition | null = null;
  private time = 0;

  /** What the player's movement code needs to know about the ground. */
  readonly ground: GroundQuery = {
    height: (x, d) => this.chunks.groundHeight(x, d),
    surface: (x, d) => this.terrain.surface(x, d),
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

  update(dt: number, player: Player, camera: THREE.Camera): void {
    this.time += dt;
    this.chunks.update(player.d, 1);
    this.decor.flush();

    const blend = this.terrain.blendAt(player.d);
    this.environment.update(dt, blend, camera, player.x, player.z);

    // Announce map changes when the new map dominates.
    const dominant = blend.t > 0.5 ? blend.b : blend.a;
    if (dominant !== this.currentMap) {
      const first = this.currentMap === null;
      this.currentMap = dominant;
      if (!first || dominant.id === 'cotton') this.bus.emit('map:enter', { id: dominant.id, name: dominant.name, caption: dominant.caption });
    }

    this.features.update({ dt, time: this.time, playerX: player.x, playerD: player.d, particles: this.particles, bus: this.bus });
    const cam = camera.position;
    this.ambient.update(dt, this.environment.current, cam.x, cam.y, cam.z, player.speed);

    // Light the smoke to match the scene.
    const a = this.environment.current;
    this.particles.smoke.tint.copy(this.environment.hemi.color).multiplyScalar(0.55 + a.hemiIntensity * 0.25 + a.sunIntensity * 0.08);
    this.particles.update(dt);
  }
}
