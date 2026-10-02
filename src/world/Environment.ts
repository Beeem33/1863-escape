import * as THREE from 'three';
import type { AtmosphereSettings } from '../maps/MapDefinition';
import { lerp } from '../utils/MathUtils';
import type { Random } from '../utils/Random';
import { Textures } from '../utils/TextureFactory';
import { Materials, windUniforms } from './Materials';
import type { MapBlend } from './MapManager';
import { Sky } from './Sky';

/** Per-run randomisation of light and weather so no two runs look identical. */
export interface RunWeather {
  sunAzimuthOffset: number;
  sunElevationOffset: number;
  fogMultiplier: number;
  /** -1 cooler .. +1 warmer light. */
  warmth: number;
  windStrength: number;
}

const COLOR_KEYS = [
  'skyZenith',
  'skyHorizon',
  'cloudColor',
  'sunGlow',
  'sunColor',
  'hemiSky',
  'hemiGround',
  'fogColor',
  'dustColor',
  'mistColor',
  'waterColor',
  'horizonColor',
] as const;
const NUMBER_KEYS = [
  'clouds',
  'sunIntensity',
  'sunElevation',
  'sunAzimuth',
  'hemiIntensity',
  'fogDensity',
  'exposure',
  'bloom',
  'dust',
  'mist',
  'smoke',
  'waterLevel',
  'horizonTrees',
] as const;

/**
 * Owns the sky, sun, ambient light, fog, water and horizon, and blends all of
 * them between maps based on the player's distance.
 */
export class Environment {
  readonly sky = new Sky();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fog: THREE.FogExp2;
  readonly water: THREE.Mesh;
  readonly horizon: THREE.Mesh;

  /** The blended atmosphere this frame (read by post-processing and audio). */
  readonly current: AtmosphereSettings;
  weather: RunWeather = { sunAzimuthOffset: 0, sunElevationOffset: 0, fogMultiplier: 1, warmth: 0, windStrength: 1 };
  /** 0..1 lantern effect (pushes fog back). */
  lantern = 0;

  private readonly colors = new Map<string, THREE.Color>();
  private readonly ca = new THREE.Color();
  private readonly cb = new THREE.Color();
  private readonly sunDir = new THREE.Vector3();
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly envScene = new THREE.Scene();
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private envTimer = 0;
  private lastEnvKey = '';
  private time = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
  ) {
    this.current = {
      grade: { gain: [1, 1, 1], lift: [0, 0, 0], saturation: 1, contrast: 1, vignette: 0.3 },
    } as AtmosphereSettings;
    for (const k of COLOR_KEYS) this.colors.set(k, new THREE.Color());

    scene.add(this.sky.mesh);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.camera.left = -38;
    this.sun.shadow.camera.right = 38;
    this.sun.shadow.camera.top = 38;
    this.sun.shadow.camera.bottom = -38;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 320;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);

    this.fog = new THREE.FogExp2(0xcccccc, 0.005);
    scene.fog = this.fog;

    this.water = new THREE.Mesh(new THREE.PlaneGeometry(440, 520).rotateX(-Math.PI / 2), Materials().water);
    this.water.name = 'water';
    this.water.receiveShadow = true;
    this.water.renderOrder = 1;
    scene.add(this.water);

    const ringTex = Textures.treeline().clone();
    ringTex.wrapS = THREE.RepeatWrapping;
    ringTex.repeat.set(7, 1);
    ringTex.needsUpdate = true;
    this.horizon = new THREE.Mesh(
      new THREE.CylinderGeometry(720, 720, 90, 48, 1, true).translate(0, 30, 0),
      new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, alphaTest: 0.35, side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    this.horizon.renderOrder = -9;
    this.horizon.frustumCulled = false;
    scene.add(this.horizon);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    const envSky = new Sky();
    envSky.mesh.material = this.sky.mesh.material; // share uniforms
    this.envScene.add(envSky.mesh);
  }

  randomizeWeather(rng: Random): void {
    this.weather = {
      sunAzimuthOffset: rng.range(-35, 35),
      sunElevationOffset: rng.range(-3, 5),
      fogMultiplier: rng.range(0.8, 1.3),
      warmth: rng.range(-0.6, 1),
      windStrength: rng.range(0.6, 1.5),
    };
  }

  setShadowQuality(size: number): void {
    this.sun.castShadow = size > 0;
    if (size > 0) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  /** Blend the two maps' atmospheres. */
  private blend(b: MapBlend): void {
    const A = b.a.atmosphere;
    const B = b.b.atmosphere;
    const t = b.t;
    const cur = this.current as unknown as Record<string, number>;
    for (const k of NUMBER_KEYS) cur[k] = lerp(A[k], B[k], t);
    for (const k of COLOR_KEYS) {
      const c = this.colors.get(k)!;
      c.setHex(A[k]).lerp(this.cb.setHex(B[k]), t);
      cur[k] = c.getHex();
    }
    const g = this.current.grade;
    for (let i = 0; i < 3; i++) {
      g.gain[i] = lerp(A.grade.gain[i], B.grade.gain[i], t);
      g.lift[i] = lerp(A.grade.lift[i], B.grade.lift[i], t);
    }
    g.saturation = lerp(A.grade.saturation, B.grade.saturation, t);
    g.contrast = lerp(A.grade.contrast, B.grade.contrast, t);
    g.vignette = lerp(A.grade.vignette, B.grade.vignette, t);
  }

  private color(key: (typeof COLOR_KEYS)[number]): THREE.Color {
    return this.colors.get(key)!;
  }

  update(dt: number, blend: MapBlend, camera: THREE.Camera, playerX: number, playerZ: number): void {
    this.time += dt;
    this.blend(blend);
    const a = this.current;
    const w = this.weather;

    // ---- Sun ------------------------------------------------------------
    const elev = THREE.MathUtils.degToRad(Math.max(2, a.sunElevation + w.sunElevationOffset));
    const azim = THREE.MathUtils.degToRad(a.sunAzimuth + w.sunAzimuthOffset);
    // Azimuth 0 = straight ahead (−Z), positive = to the right (+X).
    this.sunDir.set(Math.sin(azim) * Math.cos(elev), Math.sin(elev), -Math.cos(azim) * Math.cos(elev)).normalize();
    const warm = this.ca.setRGB(1 + 0.08 * w.warmth, 1, 1 - 0.12 * w.warmth);
    this.sun.color.copy(this.color('sunColor')).multiply(warm);
    this.sun.intensity = a.sunIntensity;
    // Keep the shadow box centred a little ahead of the player.
    const cx = playerX;
    const cz = playerZ - 18;
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx + this.sunDir.x * 150, this.sunDir.y * 150, cz + this.sunDir.z * 150);
    this.sun.target.updateMatrixWorld();

    // ---- Ambient --------------------------------------------------------
    this.hemi.color.copy(this.color('hemiSky'));
    this.hemi.groundColor.copy(this.color('hemiGround'));
    this.hemi.intensity = a.hemiIntensity;

    // ---- Fog (the lantern pushes it back) -------------------------------
    this.fog.color.copy(this.color('fogColor'));
    this.fog.density = a.fogDensity * w.fogMultiplier * (1 - this.lantern * 0.45);

    // ---- Sky ------------------------------------------------------------
    const u = this.sky.uniforms;
    u.zenith.value.copy(this.color('skyZenith'));
    u.horizon.value.copy(this.color('skyHorizon'));
    u.sunColor.value.copy(this.color('sunColor'));
    u.sunGlow.value.copy(this.color('sunGlow'));
    u.sunDir.value.copy(this.sunDir);
    u.cloudColor.value.copy(this.color('cloudColor'));
    u.clouds.value = a.clouds;
    u.time.value = this.time;
    u.fogColor.value.copy(this.color('fogColor'));
    this.sky.mesh.position.copy(camera.position);

    // ---- Horizon tree-line ---------------------------------------------
    const ring = this.horizon.material as THREE.MeshBasicMaterial;
    ring.color.copy(this.color('horizonColor')).lerp(this.color('fogColor'), 0.55);
    ring.opacity = a.horizonTrees;
    this.horizon.visible = a.horizonTrees > 0.02;
    this.horizon.position.set(camera.position.x, -6, camera.position.z);

    // ---- Water ------------------------------------------------------------
    this.water.visible = a.waterLevel > -3;
    this.water.position.set(0, a.waterLevel, playerZ - 220);
    (this.water.material as THREE.MeshStandardMaterial).color.copy(this.color('waterColor'));

    // ---- Wind ----------------------------------------------------------
    windUniforms.uTime.value = this.time;
    windUniforms.uWindStrength.value = w.windStrength * (0.7 + a.smoke * 0.3);

    this.renderer.toneMappingExposure = a.exposure * (1 + this.lantern * 0.12);
    this.updateEnvMap(dt);
  }

  /** Refresh the reflection map (used by water) when the sky has changed noticeably. */
  private updateEnvMap(dt: number): void {
    this.envTimer -= dt;
    if (this.envTimer > 0) return;
    this.envTimer = 1.5;
    const key = `${this.color('skyHorizon').getHexString()}${this.color('skyZenith').getHexString()}${this.color('fogColor').getHexString()}`;
    if (key === this.lastEnvKey) return;
    this.lastEnvKey = key;
    const prevPos = this.sky.mesh.position.clone();
    this.envTarget?.dispose();
    this.envTarget = this.pmrem.fromScene(this.envScene, 0, 1, 1000);
    this.sky.mesh.position.copy(prevPos);
    (Materials().water as THREE.MeshStandardMaterial).envMap = this.envTarget.texture;
    (Materials().water as THREE.MeshStandardMaterial).needsUpdate = true;
  }

  /** The sun's direction (for lens effects / god-rays). */
  get sunDirection(): THREE.Vector3 {
    return this.sunDir;
  }
}
