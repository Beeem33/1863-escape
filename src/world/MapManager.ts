import { MAP_SEQUENCE, MAP_TUNING } from '../config/MapConfig';
import { WorldConfig } from '../config/GameConfig';
import type { MapDefinition, MapId } from '../maps/MapDefinition';
import { smoothstep } from '../utils/MathUtils';
import type { Random } from '../utils/Random';
import { CottonFieldMap } from '../maps/CottonFieldMap';
import { SwampMap } from '../maps/SwampMap';
import { BattlefieldMap } from '../maps/BattlefieldMap';

interface Segment {
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
 * Lays the maps out along the run and answers "which map is at distance d?"
 * During the last `transitionLength` meters of a map, the next one blends in —
 * so the cotton fields thin into swamp instead of teleporting.
 */
export class MapManager {
  readonly maps: Record<MapId, MapDefinition> = {
    cotton: CottonFieldMap,
    swamp: SwampMap,
    battlefield: BattlefieldMap,
  };
  private segments: Segment[] = [];
  private rng: Random | null = null;
  private readonly blend: MapBlend = { a: CottonFieldMap, b: CottonFieldMap, t: 0 };

  reset(rng: Random): void {
    this.rng = rng;
    this.segments = [];
    this.ensure(0);
  }

  /** Extend the journey (looping the sequence) until it covers distance d. */
  private ensure(d: number): void {
    while (this.segments.length === 0 || this.segments[this.segments.length - 1].end <= d + WorldConfig.transitionLength * 2) {
      const i = this.segments.length;
      const id = MAP_SEQUENCE[i % MAP_SEQUENCE.length];
      const tuning = MAP_TUNING[id];
      const jitter = this.rng ? 1 + (this.rng.next() * 2 - 1) * tuning.lengthJitter : 1;
      const start = i === 0 ? -1000 : this.segments[i - 1].end;
      const length = tuning.length * jitter + (i === 0 ? 1000 : 0);
      this.segments.push({ map: this.maps[id], start, end: start + length });
    }
  }

  private segmentIndex(d: number): number {
    this.ensure(d);
    // Segments are few and ordered; a linear scan from the end is plenty fast.
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

  /**
   * Where the stretch of map `id` that is present at distance d begins
   * (0 for the opening map). Used to place one-off landmarks.
   */
  startOf(id: MapId, d: number): number {
    const i = this.segmentIndex(d);
    const seg = this.segments[i];
    if (seg.map.id === id) return Math.max(0, seg.start);
    const next = this.segments[i + 1];
    return next && next.map.id === id ? next.start : seg.end;
  }

  /** Distance at which the map after the current one fully begins. */
  nextMapStart(d: number): number {
    return this.segments[this.segmentIndex(d)].end;
  }

  /** Lap number (0 for the first pass through the sequence). */
  lapAt(d: number): number {
    return Math.floor(this.segmentIndex(d) / MAP_SEQUENCE.length);
  }
}
