import * as THREE from 'three';
import type { Random } from '../../utils/Random';
import type { FeatureKind } from '../DecorKinds';
import { Birds, SignalLantern } from './AmbientFeatures';
import { CannonBattery, Fire, Flag, SmokeColumn } from './BattleFeatures';
import { Charge, Corpses, FiringLine, Formation } from './BattleArmy';
import { HangingTree } from './StoryFeatures';
import type { Feature, FeatureContext } from './Feature';
import type { Characters } from '../../characters/Characters';

/**
 * Registry + pool for animated set pieces. To add one: subclass Feature,
 * add its id to FeatureKind and register its constructor here.
 */
const FACTORIES: Record<FeatureKind, () => Feature> = {
  firingLine: () => new FiringLine(),
  charge: () => new Charge(),
  formation: () => new Formation(),
  corpses: () => new Corpses(),
  hangingTree: () => new HangingTree(),
  cannonBattery: () => new CannonBattery(),
  fire: () => new Fire(),
  flag: () => new Flag(),
  smokeColumn: () => new SmokeColumn(),
  signalLantern: () => new SignalLantern(),
  birds: () => new Birds(),
};

export class FeatureManager {
  readonly group = new THREE.Group();
  private pools = new Map<FeatureKind, Feature[]>();
  private active = new Set<Feature>();
  private kinds = new Map<Feature, FeatureKind>();

  constructor(
    scene: THREE.Scene,
    private readonly characters: Characters,
  ) {
    this.group.name = 'features';
    scene.add(this.group);
  }

  spawn(kind: FeatureKind, x: number, y: number, d: number, params: Record<string, number>, rng: Random): Feature {
    const pool = this.pools.get(kind) ?? [];
    this.pools.set(kind, pool);
    const f = pool.pop() ?? FACTORIES[kind]();
    this.kinds.set(f, kind);
    f.setup(x, y, d, params, rng);
    this.group.add(f.object);
    this.active.add(f);
    return f;
  }

  release(f: Feature): void {
    if (!this.active.delete(f)) return;
    f.dispose({ characters: this.characters });
    this.group.remove(f.object);
    this.pools.get(this.kinds.get(f)!)!.push(f);
  }

  update(ctx: FeatureContext): void {
    for (const f of this.active) f.update(ctx);
  }

  get activeCount(): number {
    return this.active.size;
  }
}
