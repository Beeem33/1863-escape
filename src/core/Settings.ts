import { CameraConfig, GraphicsConfig } from '../config/GameConfig';
import { Storage } from '../utils/Storage';

export type Quality = 'high' | 'medium' | 'low';

export interface SettingsData {
  masterVolume: number;
  ambienceVolume: number;
  mouseLook: boolean;
  mouseSensitivity: number;
  invertY: boolean;
  headBob: number;
  fov: number;
  quality: Quality;
}

const DEFAULTS: SettingsData = {
  masterVolume: 0.8,
  ambienceVolume: 0.8,
  mouseLook: true,
  mouseSensitivity: 1,
  invertY: false,
  headBob: 1,
  fov: CameraConfig.fov,
  quality: GraphicsConfig.defaultQuality,
};

type Listener = (s: SettingsData) => void;

/** Player-facing options, persisted in localStorage. */
export class Settings {
  data: SettingsData;
  private listeners: Listener[] = [];

  constructor() {
    this.data = { ...DEFAULTS, ...Storage.get<Partial<SettingsData>>('settings', {}) };
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    this.data[key] = value;
    Storage.set('settings', this.data);
    for (const l of this.listeners) l(this.data);
  }

  onChange(l: Listener): void {
    this.listeners.push(l);
  }
}
