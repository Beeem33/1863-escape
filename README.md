# 1863 — The Escape

A first-person 3D infinite runner set in the American South in 1863. You are an
enslaved man running for freedom: through the cotton fields, into the swamp,
and across an active Civil War battlefield toward the Union lines. Riders and
hounds are behind you. Every stumble lets them close the distance.

The game is built to feel like a historical drama rather than an arcade game:
golden-hour light, fog, powder smoke, distant armies, and a soundscape that
tells you how close the pursuit is. It treats its subject seriously. It is
about survival, escape, uncertainty and freedom, and there is no gore.

> **Prototype status:** a complete, playable vertical slice with all three
> environments, the full gameplay loop, procedural audio and a debug mode.
> All art and sound are generated in code; the repository has no asset files.

---

## Controls

| Key | Action |
| --- | --- |
| **W** / ↑ | Push harder (a little faster) |
| **S** / ↓ | Ease off (regain stamina, lose ground) |
| **A** / **D** / ← → | Move left / right, freely, with no lanes |
| **Shift** | Sprint (burns stamina) |
| **Space** | Vault low obstacles, leap ditches, craters and trenches |
| **Q** | Glance back over your shoulder |
| **Mouse** | Look around (click to capture, **Esc** to release) |
| **Esc** / **P** | Pause |
| **F1** or **`** | Debug overlay (see [Debug mode](#debug-mode)) |

You always run forward. The playable corridor is 20 m wide with no lanes, so
you can be anywhere inside it. Low obstacles (fences, logs, barrels) can be
vaulted. Tall ones (wagons, rocks, barricades, fires) must be avoided. There
is always a way through.

**Collectibles:** ◆ map pieces (score; every 10 reveals a fragment of the
route north), water gourds and cornbread (stamina), horseshoes (a burst of
speed with no stamina drain), lanterns (push back fog and darkness).

**Death:** the pursuers catch you when the pursuit gap reaches zero.
Distance is the score, and your best distance is saved locally.

---

## Technology

- **Three.js** (r186) for WebGL rendering
- **TypeScript** with strict mode
- **Vite** for the dev server and build
- Plain **HTML/CSS** for menus and HUD
- **Web Audio API** for fully procedural sound

There are no other runtime dependencies. Post-processing passes come from
`three/examples/jsm`, which ships with Three.js.

## Getting started

```bash
npm install
npm run dev        # http://localhost:8187 (also served on your LAN)
```

```bash
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build locally
npm run typecheck  # type-check only
```

The build uses a relative base path, so `dist/` can be hosted from any static
host or sub-path (for example GitHub Pages).

**URL options:**

- `?seed=1234` replays a specific world layout, useful for reproducing bugs.
- `?debug` opens with the debug overlay.
- `?mute` starts muted.

---

## Project architecture

```
src/
├── main.ts                      Entry point
├── config/                      ★ All tuning lives here
│   ├── GameConfig.ts            Player, stamina, camera, pursuit, difficulty, collectibles, world, hazards, graphics
│   ├── MapConfig.ts             Map order, map lengths, obstacle spawn weights per map
│   └── Story.ts                 Route fragments and ending lines
├── core/
│   ├── Game.ts                  Owns every system; state machine; frame loop
│   ├── GameLoop.ts              requestAnimationFrame with clamped delta
│   ├── GameState.ts             States, run stats, saved records
│   ├── InputManager.ts          Keyboard, mouse, pointer lock
│   ├── EventBus.ts              Typed events between systems
│   ├── Difficulty.ts            Difficulty curve (distance → 0..1)
│   └── Settings.ts              Player options (persisted)
├── player/
│   ├── Player.ts                Pure state
│   ├── PlayerController.ts      Key bindings → MovementIntent
│   ├── PlayerMovement.ts        Physics: run, strafe, jump, stamina, stride timing
│   ├── PlayerCamera.ts          Head bob, sway, roll, FOV, shake, mouse look, glance back
│   ├── PlayerSystem.ts          Bundles the above
│   └── Autopilot.ts             Bot that follows the safe route (attract mode, F5)
├── world/
│   ├── WorldManager.ts          Facade over everything below
│   ├── MapManager.ts            Journey layout, map blending, transitions
│   ├── ProceduralGenerator.ts   Obstacle rows, guaranteed route, collectibles
│   ├── ChunkManager.ts          Builds/recycles chunks around the player
│   ├── GroundMesh.ts            Pooled ground strip per chunk
│   ├── Terrain.ts               Blended height / colour / surface / water level
│   ├── Deformation.ts           Craters, ponds, ditches, trenches, streams
│   ├── Environment.ts           Sky, sun, shadows, fog, water, horizon, weather
│   ├── Sky.ts                   Procedural sky shader with clouds
│   ├── DecorationLibrary.ts     Instanced decoration pools (registry)
│   ├── DecorationContext.ts     API maps use to dress chunks
│   ├── DecorKinds.ts            Decoration + feature ids
│   ├── Materials.ts             Shared materials (+ wind sway shader patch)
│   ├── props/                   Procedural models: vegetation, structures, figures
│   └── features/                Animated set pieces: soldiers, cannon, fire, flags, smoke, birds, lanterns
├── maps/
│   ├── MapDefinition.ts         The map interface
│   ├── CottonFieldMap.ts
│   ├── SwampMap.ts
│   └── BattlefieldMap.ts
├── obstacles/
│   ├── Obstacle.ts              Base class
│   ├── ObstacleCatalog.ts       ★ Size / collision / damage per obstacle
│   ├── ObstacleKinds.ts         Obstacle ids + collision kinds
│   ├── ObstacleManager.ts       Registry, pooling, collision
│   ├── Fence.ts, Barrel.ts, Wagon.ts, FallenTree.ts, Crater.ts, Water.ts,
│   ├── FarmObstacles.ts, BattlefieldDebris.ts
│   ├── ObstacleGeometry.ts      Shared unit geometries
│   └── ObstacleMaterials.ts     Tinted shared materials
├── collectibles/
│   ├── Collectible.ts           Base class
│   ├── CollectibleTypes.ts      Collectible ids
│   ├── MapPiece.ts, Supplies.ts Water gourd, cornbread, horseshoe, lantern
│   └── CollectibleManager.ts    Registry, pooling, pickup + effects
├── enemies/
│   ├── Pursuer.ts               Rider-on-horse / hound figure with gait
│   ├── PursuitManager.ts        The pursuit gap, cues, chasers, flank glimpses
│   └── BattleHazards.ts         Telegraphed artillery, musket fire
├── audio/
│   ├── AudioManager.ts          Buses, reverb, spatialisation, event wiring
│   ├── Ambience.ts              Per-map ambient layers + random events
│   ├── AmbienceProfile.ts       Ambience mix definition
│   ├── Sounds.ts                One-shot sound recipes
│   └── Synth.ts                 Noise, oscillators, envelopes
├── effects/
│   ├── PostProcessing.ts        Bloom, colour grade, vignette, grain, danger, fade
│   ├── ParticleSystem.ts        Instanced billboard particles (1 draw call)
│   ├── Particles.ts             Effect helpers (dust, splash, explosion, fire…)
│   └── AmbientEffects.ts        Dust/fireflies/ash, ground mist, smoke banks
├── ui/                          HUD, menus, captions, settings, debug overlay
├── utils/                       Seeded RNG, noise, math, storage, procedural textures
└── styles/main.css
```

### How the systems fit together

- **`Game`** owns every system and runs one frame:
  `input → player → collisions → pickups → hazards → pursuit → world → audio → post-processing`.
- Systems talk through the **`EventBus`** (`player:hit`, `collectible:pickup`,
  `pursuit:cue`, `battle:explosion`, …) instead of referencing each other.
  The audio system only listens; obstacles never know it exists.
- **Maps are data plus a `decorate()` function.** Changing the cotton field
  never touches player movement, obstacles or the generator.
- **Coordinates:** `x` is lateral (+ right), `d` is the distance run. World
  position is `(x, y, −d)`, because the run heads down −Z.

---

## How procedural generation works

1. **Chunks.** The world is cut into 40 m chunks along the run.
   `ChunkManager` keeps `chunksBehind` (2) to `chunksAhead` (8) chunks alive
   around the player. New chunks are built nearest-first, one per frame (about
   1 ms each), and chunks behind are recycled. Ground meshes, decoration
   instance slots, features, obstacles and collectibles are all pooled, so
   memory stays flat however far you run.

2. **The journey.** `MapManager` lays maps out in the order of
   `MAP_SEQUENCE` (cotton → swamp → battlefield, then it loops, harder each
   lap). Each map's length is jittered per run. Over the last
   `transitionLength` meters (320 m) of a map, the next one blends in:
   terrain height and colour, atmosphere (sky, fog, light, grade), ambience
   audio, obstacle choice and decoration density all cross-fade. That is why
   the cotton field goes to seed and thickens into scrub before the swamp,
   and why smoke columns appear on the horizon before the battle.

3. **Obstacle rows and the guaranteed route.** `ProceduralGenerator` places
   obstacles in rows. Every row keeps a **safe gap** (`safePathWidth`, 4.6 m
   down to 3 m). Between rows the gap moves by at most the distance the
   player can strafe while running from one row to the next, using the
   worst case (sprinting) with a safety margin, so the gap is always
   reachable. `solid` obstacles are never placed in the gap. `vault` and
   `ground` obstacles may cross it (you jump them), but never on two rows in
   a row. Rows are always at least ~11 m apart.
   *Verified:* the autopilot ran 4.2 km on three seeds and 11 km on two
   more, through every map and transition, and never hit a solid obstacle.

4. **Weighted spawning.** Each row picks its map (mixed during transitions),
   then picks obstacles from that map's weight table in `MapConfig.ts`. The
   `open` weight leaves a slot empty. Obstacles-per-row and row spacing come
   from the difficulty curve.

5. **Holes are real.** Craters, ponds, ditches, trenches and streams create
   a `Deformation` that is baked into the ground mesh *and* into the
   player's ground query, so you physically dip into a crater or wade into a
   pond.

6. **Seeded randomness.** Each run has a seed (shown in the debug overlay).
   Rows are generated sequentially from the run RNG, and decorations use
   `hash(seed, chunkIndex)`, so `?seed=N` reproduces a layout exactly.

7. **Per-run variation.** Sun angle, light warmth, fog density and wind
   strength are randomised per run, as are map lengths, obstacle layouts,
   decorations, pursuit cues, flank glimpses and battle events.

---

## How to add a new map

1. Add its id to `MapId` in `src/maps/MapDefinition.ts`.
2. Add a tuning entry in `src/config/MapConfig.ts` (`MAP_TUNING`), with
   length, obstacle weights, density, collectible multipliers and battle
   hazards, and put the id in `MAP_SEQUENCE` where it should appear.
3. Create `src/maps/YourMap.ts` exporting a `MapDefinition`:
   - `atmosphere`: sky, sun, fog, colour grade, dust/mist/smoke, water level
   - `terrain`: `height(x, d, noise)`, `color(...)`, `surface(...)`, which
     must be continuous in world space
   - `ambience`: levels for each audio layer
   - `decorate(ctx)`: place decorations with `ctx.place('oak', x, d, {...})`
     and set pieces with `ctx.feature('fire', x, d, {...})`. Multiply by
     `ctx.weight(d)` so your map thins out during transitions, and keep tall
     decorations outside the corridor (`|x| > ctx.corridor`).
4. Register it in `MapManager.maps` (`src/world/MapManager.ts`).

Transitions, blending, audio cross-fades and captions then work
automatically.

## How to add a new obstacle

1. Add an id to `ObstacleKind` in `src/obstacles/ObstacleKinds.ts`.
2. Add a spec in `src/obstacles/ObstacleCatalog.ts`: `collision`
   (`solid` | `vault` | `ground` | `slow`), `width`/`depth` ranges, `height`,
   `damage` (pursuit meters lost), `knockback`, and an optional
   `deformation`.
3. Create a class extending `Obstacle`. Implement `build(rng)` with
   `this.part(geometry, material, x, y, z, rx, ry, rz, sx, sy, sz)`, which
   reuses meshes when pooled. Optionally override `buildCollision()`,
   `animateHit(age)` or `animate(ctx)`.
4. Register it in `REGISTRY` in `src/obstacles/ObstacleManager.ts`.
5. Give it a spawn weight in one or more maps in `src/config/MapConfig.ts`.

The generator automatically keeps `solid` obstacles off the safe route.

## How to add a new collectible

1. Add an id to `CollectibleType` (`src/collectibles/CollectibleTypes.ts`).
2. Create a class extending `Collectible`, build its model into
   `this.model` in `build()`, and pass a glint colour to `super()`.
3. Register it in `REGISTRY` in `src/collectibles/CollectibleManager.ts` and
   implement its effect in `applyEffect()`.
4. Add a weight in `CollectibleConfig.weights` (`src/config/GameConfig.ts`),
   and optionally a per-map multiplier in `MapConfig.ts`.
5. Optional: give it a pickup sound in `Sounds.pickup()`.

## How to modify player movement

- **Feel and numbers:** `PlayerConfig` in `src/config/GameConfig.ts` covers
  speeds, multipliers, acceleration, strafe speed, jump velocity, gravity,
  coyote time, jump buffer and corridor width.
- **Camera feel:** `CameraConfig` covers FOV, sprint FOV, bob/sway
  amplitude, strafe roll, mouse-look limits and the glance-back angle.
- **Key bindings:** `KEYS` in `src/player/PlayerController.ts`.
- **Rules:** `src/player/PlayerMovement.ts` contains the forward speed
  target, lateral acceleration, jumping and stamina. `PlayerCamera.ts`
  composes the view and is purely visual; it never affects movement.

## How to modify game balance

Everything is in `src/config/`. No system code needs to change.

| Want to change… | Edit |
| --- | --- |
| Player speed | `PlayerConfig.baseRunSpeed`, `maxRunSpeed`, `sprintMultiplier` |
| Stamina | `StaminaConfig` (drains, regen, sprint threshold) |
| Difficulty ramp | `DifficultyConfig.rampDistance` |
| Obstacle density | `DifficultyConfig.obstaclesPerRowEasy/Hard`, per-map `density` |
| Row spacing / route width | `DifficultyConfig.rowSpacing*`, `safePathWidth*` |
| Spawn rates per obstacle | `MAP_TUNING[map].obstacles` in `MapConfig.ts` |
| Map length / order | `MAP_TUNING[map].length`, `MAP_SEQUENCE` |
| Pursuit speed / pressure | `PursuitConfig.speedFactorStart/Max`, `startGap`, `maxGap` |
| Damage per obstacle | `damage` in `ObstacleCatalog.ts` |
| Collectible frequency | `CollectibleConfig.chancePerRow`, `weights` |
| Pickup effects | `CollectibleConfig` (stamina amounts, boost/lantern durations) |
| Artillery | `HazardConfig` (intervals, warning time, blast radius, penalty) |
| Graphics defaults | `GraphicsConfig` |

**The pursuit model in one line:**
`gap += (playerSpeed − pursuerSpeed) × dt`, where `pursuerSpeed` is a
fraction (0.92 → 0.985 with difficulty) of the speed the game expects you
to run. Clean running pulls away slowly. Collisions subtract
`damage` meters, and mud, water, exhaustion and stumbles slow you so they
gain.

---

## Debug mode

Press **F1** (or **`**) for the overlay. It shows FPS, state, player
position and speed, current map and transition %, lap, chunk, difficulty,
pursuit gap, stamina, seed, draw calls and triangles, active
obstacles/pickups/particles/features, and instance usage.

While the overlay is open:

| Key | Toggle |
| --- | --- |
| **F2** | God mode (no collisions, pursuers held back) |
| **F3** | Collision boxes (red solid, yellow vault, blue ground, green slow) |
| **F4** | Skip to just before the next map transition |
| **F5** | Autopilot (the bot runs the route) |

The `game` object is also on `window` for console poking (for example
`game.pursuit.gap = 5`).

## Performance notes

- Decorations are GPU-instanced: about 25 kinds, each one draw call per
  prop part, covering more than 20,000 instances. Particles are a single
  instanced draw call per blend mode.
- Every chunk, mesh, instance slot, feature, obstacle and collectible is
  pooled, so a long run allocates almost nothing.
- Chunk builds are spread one per frame (about 1 ms each). Bloom runs at half
  resolution.
- **Settings → Graphics quality** lowers pixel ratio, shadow resolution,
  bloom and foliage density.

## Historical note

The setting is grounded in the period. The Emancipation Proclamation took
effect on 1 January 1863, but freedom in practice usually came from reaching
Union lines, where escaping people were received as "contraband of war". The
route fragments reflect advice freedom seekers relied on: follow the North
Star, cross running water to lose the hounds, watch for safe-house signals.
The fragments are written for the game, and no historical texts are quoted.
The pursuers are deliberately kept as silhouettes and sounds rather than
characters.

## Ideas for next steps

- Real texture and model assets (photogrammetry vegetation, PBR ground sets)
  in place of the procedural stand-ins
- A night segment with lantern gameplay and the North Star as a navigation cue
- Gamepad and touch controls
- An ending sequence on reaching the Union camp after a set distance
- More set-piece events (river crossings, a burning bridge, a patrol checkpoint)
