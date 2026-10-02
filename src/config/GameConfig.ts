/**
 * ============================================================================
 *  GAME BALANCE & TUNING
 * ============================================================================
 *  Every gameplay number lives here (map-specific spawn tables live in
 *  `MapConfig.ts`). Change values, save, and Vite hot-reloads the game.
 *
 *  Units: meters, seconds, meters/second. 1 world unit = 1 meter.
 * ============================================================================
 */

export const PlayerConfig = {
  /** Camera height above the ground (eye level). */
  eyeHeight: 1.66,
  /** Collision radius of the runner's body. */
  radius: 0.34,

  /** Forward running speed at the start of a run (m/s). */
  baseRunSpeed: 9.0,
  /** Forward running speed at the end of the main difficulty ramp (m/s). */
  maxRunSpeed: 15.5,
  /** Hard ceiling — the late "overdrive" ramp never pushes speed past this. */
  absoluteMaxRunSpeed: 17.5,
  /** Multiplier while holding W (pushing harder). */
  pushMultiplier: 1.1,
  /** Multiplier while holding S (easing off — regains stamina, loses ground). */
  easeMultiplier: 0.6,
  /** Multiplier while sprinting (Shift). */
  sprintMultiplier: 1.38,
  /** Multiplier while out of stamina. */
  exhaustedMultiplier: 0.86,
  /** How quickly forward speed rises toward its target (m/s²). */
  forwardAcceleration: 7,
  /** How quickly forward speed falls toward its target (m/s²). */
  forwardDeceleration: 11,

  /** Top sideways speed (A / D). */
  strafeSpeed: 7.5,
  /** Sideways acceleration (m/s²) — higher = snappier. */
  strafeAcceleration: 36,
  /** Sideways braking when no key is held (m/s²). */
  strafeDeceleration: 30,

  /** Initial upward velocity of a jump/vault (Space). */
  jumpVelocity: 7.4,
  /** Gravity (m/s²). Slightly heavier than real for a snappier arc. */
  gravity: 21,
  /** Grace period after leaving the ground where a jump still counts. */
  coyoteTime: 0.12,
  /** A jump pressed this long before landing still fires on landing. */
  jumpBuffer: 0.14,

  /** Half-width of the playable corridor. 10 → a 20 m wide running area. */
  corridorHalfWidth: 10,

  /** After a collision, the runner is briefly invulnerable. */
  hitInvulnerability: 1.0,
  /** Speed multiplier immediately after a hit (recovers over `stumbleDuration`). */
  stumbleSpeedMultiplier: 0.35,
  stumbleDuration: 1.1,
};

/**
 * Tripping over a LOW (vaultable) obstacle may send the runner flat on his
 * face. Times are seconds from the moment of the trip; the whole sequence is
 * `duration` long. Lying in the dirt costs ground — the pursuers keep coming.
 */
export const FallConfig = {
  /** Chance a collision with a vaultable obstacle becomes a full fall. */
  chance: 0.5,
  /** Roughly when the body hits the ground (the fall itself is simulated — see FallBody). */
  impactAt: 0.55,
  /** How hard the caught feet slow while he topples (m/s²). */
  feetDecel: 10,
  /** Friction once he is sliding on his chest (m/s²). */
  slideDecel: 15,
  /** Starts pushing up off the ground. */
  pushUpAt: 2.2,
  /** On hands and knees, rising to his feet. */
  kneelAt: 3.4,
  /** Standing — starts running again. */
  standAt: 4.1,
  /** Sequence over (back to full control). */
  duration: 5.0,
  /** Extra pursuit gap lost on top of the time spent on the ground. */
  extraDamage: 0,
};

/** Gunshot wounds. Three hits from full health ends the run. */
export const HealthConfig = {
  max: 100,
  /** Health lost per musket ball. */
  shotDamage: 34,
  /** Seconds without being hit before wounds start to (slowly) stop hurting. */
  regenDelay: 9,
  regenPerSecond: 5,
};

export const StaminaConfig = {
  max: 100,
  /** Drain per second while running normally. */
  runDrain: 0.55,
  /** Drain per second while sprinting. */
  sprintDrain: 15,
  /** Regain per second while easing off (holding S). */
  easeRegen: 5,
  /** Stamina required before a sprint may begin. */
  sprintMinimum: 10,
  /** Once exhausted, stamina must climb back to this before the penalty lifts. */
  exhaustedRecover: 18,
  /** Passive regen per second while exhausted (so a run is never hopeless). */
  exhaustedRegen: 1.2,
};

export const CameraConfig = {
  fov: 72,
  /** Extra field of view at full sprint. */
  sprintFovBoost: 7,
  /** Vertical head-bob amplitude while running (meters). */
  bobAmplitude: 0.055,
  /** Sideways head sway amplitude (meters). */
  swayAmplitude: 0.035,
  /** Camera roll when strafing (radians at full strafe speed). */
  strafeRoll: 0.035,
  /** Max yaw (left/right look) allowed by the mouse, radians. */
  maxYaw: 1.15,
  /** Max pitch (up/down look) allowed by the mouse, radians. */
  maxPitch: 0.7,
  /** Mouse look slowly re-centres toward forward when the mouse is idle. */
  recenterSpeed: 0.6,
  /** How far the camera turns when holding Q to glance back (radians). */
  lookBackYaw: 2.6,
};

export const PursuitConfig = {
  /** Distance between the runner and the pursuers at the start (m). */
  startGap: 70,
  /** The gap never grows beyond this — they never truly lose the trail. */
  maxGap: 130,
  /** Pursuer speed as a fraction of the runner's expected speed at start / at max difficulty. */
  speedFactorStart: 0.92,
  speedFactorMax: 0.985,
  /** Overdrive can push the factor further, but never past this. */
  speedFactorCap: 0.998,
  /** Below this gap the HUD and audio signal danger. */
  dangerGap: 22,
  /** Visual glimpses of the pursuers appear at most this often (s). */
  glimpseCooldown: 24,
  /** Pursuers open fire when this close (m). 50 ft ≈ 15.24 m. */
  fireRange: 15.24,
  /** Seconds between shots from each rider [min, max]. */
  fireInterval: [1.5, 2.8] as [number, number],
  /** Base chance a shot hits at the edge of range / point blank. */
  hitChanceFar: 0.22,
  hitChanceNear: 0.55,
  /** Moving sideways at full strafe speed subtracts this much hit chance. */
  dodgeBonus: 0.22,
  /** Seconds between distant audio cues (shouts, dogs, horses) at a large gap. */
  cueIntervalFar: 9,
  /** Seconds between audio cues when they are close. */
  cueIntervalNear: 2.2,
};

export const DifficultyConfig = {
  /**
   * Difficulty is computed from distance in two parts:
   *   main ramp:  1 - exp(-distance / rampDistance)            → 0..1
   *   overdrive:  climbs linearly after lateRampStart           → 0..lateMax
   * So it climbs quickly at first, then keeps getting harder slowly forever
   * (up to 1 + lateMax). Values past 1 extrapolate the easy→hard ranges below
   * and are clamped by the *Min / absolute limits so the game stays fair.
   */
  rampDistance: 2400,
  lateRampStart: 4500,
  lateRampDistance: 9000,
  lateMax: 0.45,

  /** Distance between obstacle rows at difficulty 0 and 1 (m), and the floor. */
  rowSpacingEasy: 24,
  rowSpacingHard: 12,
  rowSpacingMin: 9.5,
  /** Obstacles placed per row at difficulty 0 and 1. */
  obstaclesPerRowEasy: 1.5,
  obstaclesPerRowHard: 3.6,
  /** Width of the guaranteed open route through every row (m), and the floor. */
  safePathWidthEasy: 4.6,
  safePathWidthHard: 3.0,
  safePathWidthMin: 2.5,
  /** Fraction of the player's possible sideways travel the route may demand (safety margin). */
  routeShiftSafety: 0.55,

  /** No obstacles in the first stretch of a run, so the player can find their feet. */
  graceDistance: 70,
};

export const CollectibleConfig = {
  /** Chance an obstacle row also carries a collectible group. */
  chancePerRow: 0.5,
  /** Base weights — maps may scale these in MapConfig. */
  weights: {
    mapPiece: 58,
    water: 16,
    food: 14,
    horseshoe: 6,
    lantern: 6,
  },
  /** Map pieces often come in short trails along the safe route. */
  mapPieceTrailLength: [3, 6] as [number, number],
  pickupRadius: 1.2,

  waterStamina: 38,
  foodStamina: 16,
  /** Horseshoe: temporary speed boost with no stamina drain. */
  horseshoeDuration: 6,
  horseshoeMultiplier: 1.22,
  /** Lantern: pushes back fog / darkness for a while. */
  lanternDuration: 22,
  /** Every N map pieces reveals a fragment of the route north. */
  piecesPerRouteFragment: 10,
};

export const WorldConfig = {
  /** Length of one terrain chunk along the running direction (m). */
  chunkLength: 40,
  /** Chunks generated ahead of the player. chunkLength × chunksAhead ≈ view distance. */
  chunksAhead: 8,
  /** Chunks kept behind the player (for glancing back) before recycling. */
  chunksBehind: 2,
  /** Total width of the ground strip rendered per chunk (m). */
  groundWidth: 420,
  /** Transition zone length between two maps (m). */
  transitionLength: 320,
};

export const HazardConfig = {
  /** Battlefield artillery: seconds between strikes at difficulty 0 and 1, and the floor. */
  artilleryIntervalEasy: 9,
  artilleryIntervalHard: 3.6,
  artilleryIntervalMin: 2.6,
  /** Warning time between the incoming whistle and the impact. */
  artilleryWarning: 1.6,
  /** Radius within which a shell knocks the runner down. */
  artilleryBlastRadius: 4.2,
  /** Pursuit gap lost when caught in a blast. */
  artilleryGapPenalty: 16,

  /** Speed multiplier while wading through water / mud. */
  waterSlow: 0.7,
  mudSlow: 0.58,
};

export const GraphicsConfig = {
  /** Default quality preset ('high' | 'medium' | 'low'); players can change it in Settings. */
  defaultQuality: 'high' as 'high' | 'medium' | 'low',
  shadowMapSize: { high: 2048, medium: 1024, low: 0 },
  maxPixelRatio: { high: 2, medium: 1.25, low: 1 },
  bloom: { high: true, medium: true, low: false },
};
