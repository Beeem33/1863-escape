import { MAP_TUNING } from '../config/MapConfig';
import { CottonFieldMap } from './CottonFieldMap';
import type { MapDefinition } from './MapDefinition';

/** MAP 2 — placeholder until the swamp milestone. */
export const SwampMap: MapDefinition = {
  ...CottonFieldMap,
  id: 'swamp',
  name: 'The Swamp',
  caption: 'Into the swamp.',
  tuning: MAP_TUNING.swamp,
  atmosphere: { ...CottonFieldMap.atmosphere, fogColor: 0x6d7a6a, fogDensity: 0.012, sunIntensity: 1.2 },
};
