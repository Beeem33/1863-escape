import type { CollectibleType } from '../collectibles/CollectibleTypes';
import type { MapId } from '../maps/MapDefinition';

/**
 * Every cross-system event in the game. Systems talk through this bus instead
 * of holding references to each other, so e.g. the audio system can react to a
 * collision without the obstacle code knowing audio exists.
 */
export interface GameEvents {
  'run:start': { seed: number };
  'run:end': { distance: number; collectibles: number; best: number; isNewBest: boolean; cause: string };
  'player:footstep': { intensity: number; surface: Surface };
  'player:jump': undefined;
  'player:land': { impact: number; surface: Surface };
  'player:hit': { obstacle: string; severity: number; x: number; z: number };
  'player:sprint': { active: boolean };
  'player:exhausted': { exhausted: boolean };
  'player:splash': { intensity: number };
  'collectible:pickup': { type: CollectibleType; x: number; z: number };
  'map:enter': { id: MapId; name: string; caption: string };
  'pursuit:cue': { kind: PursuitCue; distance: number; pan: number };
  'pursuit:danger': { level: number };
  'battle:artillery': { x: number; z: number; distance: number; incoming: boolean };
  'battle:explosion': { x: number; z: number; distance: number; strength: number };
  'battle:volley': { distance: number; pan: number; count: number };
  'battle:cannon': { distance: number; pan: number };
  'story:message': { title: string; text: string };
  'ui:flash': { color: string; strength: number };
}

export type Surface = 'dirt' | 'grass' | 'mud' | 'water' | 'wood';
export type PursuitCue = 'shout' | 'dog' | 'horse' | 'gunshot' | 'whistle';

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<unknown>>>();

  on<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler as Handler<unknown>);
    return () => set!.delete(handler as Handler<unknown>);
  }

  emit<K extends keyof GameEvents>(event: K, ...payload: GameEvents[K] extends undefined ? [] : [GameEvents[K]]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of set) h(payload[0]);
  }
}
