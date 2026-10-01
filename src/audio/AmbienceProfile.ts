/**
 * Per-map ambience mix. Each value is a 0..1 level for a procedural ambience
 * layer in the AudioManager; the manager cross-fades between maps.
 */
export interface AmbienceProfile {
  wind: number;
  birds: number;
  insects: number;
  frogs: number;
  water: number;
  /** Rustling leaves / creaking trees. */
  trees: number;
  /** Distant rolling gunfire & cannon. */
  battle: number;
  /** Crackling fire. */
  fire: number;
  /** Low tension drone (the "score"). */
  drone: number;
  /** Base pitch of the drone, in Hz. */
  dronePitch: number;
}
