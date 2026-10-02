import { LEVELS, type LevelDef } from '../config/MapConfig';
import { WorldConfig } from '../config/GameConfig';
import type { MapDefinition, MapId } from '../maps/MapDefinition';
import { smoothstep } from '../utils/MathUtils';
import { CottonFieldMap } from '../maps/CottonFieldMap';
import { SwampMap } from '../maps/SwampMap';
import { BattlefieldMap } from '../maps/BattlefieldMap';

interface Segment {
  level: number;
  def: LevelDef;
  map: MapDefinition;
  start: number;
  end: number;
}

export interface MapBlend {
  /** The map you are in. */
  a: MapDefinition;
  /** The map you are heading into (same as `a` outside a transition). */
  b: MapDefinition;
  /** 0 = fully `a`, 1 = fully `b`. */
  t: number;
}

/**
 * Lays the levels out along the run (see LEVELS in MapConfig) and answers
 * "which map is at distance d?". During the last `transitionLength` meters
 * of a level, the next one blends in — the cotton fields thin into swamp
 * instead of teleporting — and is fully there at the level boundary.
 */
export class MapManager {
  readonly maps: Record<MapId, MapDefinition> = {
    cotton: CottonFieldMap,
    swamp: SwampMap,
    battlefield: BattlefieldMap,
  };
  private readonly segments: Segment[] = [];
  private readonly blend: MapBlend = { a: CottonFieldMap, b: CottonFieldMap, t: 0 };

  constructor() {
    let start = 0;
    LEVELS.forEach((def, i) => {
      const end = start + def.length;
      // The first level extends backwards so the world behind the start is dressed too.
      this.segments.push({ level: i + 1, def, map: this.maps[def.map], start: i === 0 ? -1000 : start, end });
      start = end;
    });
  }

  get levelCount(): number {
    return this.segments.length;
  }

  private segmentIndex(d: number): number {
    for (let i = this.segments.length - 1; i >= 0; i--) if (d >= this.segments[i].start) return i;
    return 0;
  }

  blendAt(d: number, out: MapBlend = this.blend): MapBlend {
    const i = this.segmentIndex(d);
    const seg = this.segments[i];
    const next = this.segments[i + 1];
    const T = WorldConfig.transitionLength;
    out.a = seg.map;
    if (next && d > seg.end - T) {
      out.b = next.map;
      out.t = smoothstep(seg.end - T, seg.end, d);
    } else {
      out.b = seg.map;
      out.t = 0;
    }
    return out;
  }

  /** The map that dominates at distance d. */
  mapAt(d: number): MapDefinition {
    const b = this.blendAt(d, { a: CottonFieldMap, b: CottonFieldMap, t: 0 });
    return b.t > 0.5 ? b.b : b.a;
  }

  /** 0..1 weight of a particular map at d. */
  weightOf(id: MapId, d: number): number {
    const b = this.blendAt(d, { a: CottonFieldMap, b: CottonFieldMap, t: 0 });
    let w = 0;
    if (b.a.id === id) w += 1 - b.t;
    if (b.b.id === id) w += b.t;
    return Math.min(1, w);
  }

  /** Where the stretch of map `id` present at distance d begins (for one-off landmarks). */
  startOf(id: MapId, d: number): number {
    const i = this.segmentIndex(d);
    const seg = this.segments[i];
    if (seg.map.id === id) return Math.max(0, seg.start);
    const next = this.segments[i + 1];
    return next && next.map.id === id ? next.start : seg.end;
  }

  /** Level number (1-based) at distance d. */
  levelAt(d: number): number {
    return this.segments[this.segmentIndex(d)].level;
  }

  /** Distance at which a level begins. */
  levelStart(level: number): number {
    return level <= 1 ? 0 : this.segments[level - 1].start;
  }

  /** Distance at which the level containing d ends (Infinity for the last). */
  levelEnd(d: number): number {
    return this.segments[this.segmentIndex(d)].end;
  }

  levelInfo(level: number): { title: string; map: MapDefinition } {
    const seg = this.segments[Math.max(0, Math.min(this.segments.length - 1, level - 1))];
    return { title: seg.def.title, map: seg.map };
  }

  /** Every boundary between levels (distances). */
  get boundaries(): number[] {
    return this.segments.slice(0, -1).map((s) => s.end);
  }

  /** Distance at which the next map begins (for the debug skip). */
  nextMapStart(d: number): number {
    return this.levelEnd(d);
  }
}
