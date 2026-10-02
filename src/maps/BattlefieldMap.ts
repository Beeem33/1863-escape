import { MAP_TUNING } from '../config/MapConfig';
import { CottonFieldMap } from './CottonFieldMap';
import type { MapDefinition } from './MapDefinition';

/** MAP 3 — placeholder until the battlefield milestone. */
export const BattlefieldMap: MapDefinition = {
  ...CottonFieldMap,
  id: 'battlefield',
  name: 'The Battlefield',
  caption: 'The guns.',
  tuning: MAP_TUNING.battlefield,
  atmosphere: { ...CottonFieldMap.atmosphere, fogColor: 0x8a8070, fogDensity: 0.009 },
};
