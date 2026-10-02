import type { MapId } from '../maps/MapDefinition';

/**
 * ============================================================================
 *  STORY TEXT
 * ============================================================================
 *  Short lines revealed as map pieces are gathered — fragments of a route
 *  north passed from person to person. Written for the game; they echo the
 *  kinds of advice freedom seekers relied on (the North Star, moving water,
 *  safe-house signals, the Union army's "contraband" policy of 1861–63).
 * ============================================================================
 */
export const ROUTE_FRAGMENTS: string[] = [
  'The North Star does not move. Keep it before you.',
  'Cross running water when you can. The hounds lose the scent.',
  'Travel by night. Rest where the reeds grow tall.',
  'A lantern in a window means a safe house. Knock twice, then once.',
  'Follow the river north until it bends to the east.',
  'Moss grows heaviest on the north side of the trees.',
  'The Union camp lies past the burned church.',
  'Tell the soldiers you are contraband of war. They will let you through the lines.',
  'Others made it. Their names are written down in the North.',
  'Freedom is a road, not a door. Keep walking.',
];

/** The line under "THE JOURNEY ENDS", by where it happened. */
export const ENDINGS: Record<MapId, string[]> = {
  cotton: ['Run down at the edge of the fields.', 'They caught up before the tree line.'],
  swamp: ['The hounds found the trail in the swamp.', 'The water could not hide you this time.'],
  battlefield: ['Taken within sight of the Union lines.', 'So close. The smoke was not enough.'],
};

/** Endings when the riders' guns found their mark. */
export const SHOT_ENDINGS: Record<MapId, string[]> = {
  cotton: ['Shot down in the furrows, the tree line in sight.', 'The riders fired before you reached the trees.'],
  swamp: ['A rider fired into the reeds. The swamp went quiet.', 'Shot at the water’s edge.'],
  battlefield: ['Cut down in the crossfire, short of the lines.', 'Shot running for the Union lines.'],
};
