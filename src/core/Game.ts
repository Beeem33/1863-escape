import * as THREE from 'three';
import { GameLoop } from './GameLoop';
import { InputManager } from './InputManager';
import { EventBus } from './EventBus';
import { Settings } from './Settings';
import { GameState, RunStats } from './GameState';
import { PlayerSystem } from '../player/PlayerSystem';
import { PlayerConfig } from '../config/GameConfig';
import type { GroundQuery } from '../player/PlayerMovement';

/**
 * Top-level owner of every system. Wires them together and runs the frame.
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly bus = new EventBus();
  readonly input: InputManager;
  readonly settings = new Settings();
  readonly stats = new RunStats();
  readonly loop: GameLoop;
  readonly players: PlayerSystem;
  state = GameState.Playing;

  private readonly flatGround: GroundQuery = {
    height: () => 0,
    surface: () => 'dirt',
    waterLevel: () => -10,
  };

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly uiRoot: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 1200);
    this.scene.background = new THREE.Color(0xd8b98a);
    this.scene.fog = new THREE.Fog(0xd8b98a, 20, 220);

    // Temporary test track: posts every 10 m so movement is readable.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 20000).rotateX(-Math.PI / 2).translate(0, 0, -9900),
      new THREE.MeshStandardMaterial({ color: 0x8a6a45 }),
    );
    const postGeo = new THREE.BoxGeometry(0.2, 1.2, 0.2).translate(0, 0.6, 0);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3420 });
    const posts = new THREE.InstancedMesh(postGeo, postMat, 4000);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 2000; i++) {
      posts.setMatrixAt(i * 2, m.makeTranslation(-PlayerConfig.corridorHalfWidth, 0, -i * 10));
      posts.setMatrixAt(i * 2 + 1, m.makeTranslation(PlayerConfig.corridorHalfWidth, 0, -i * 10));
    }
    this.scene.add(ground, posts, new THREE.HemisphereLight(0xffe8c0, 0x553b22, 2.5));

    this.input = new InputManager(canvas);
    this.players = new PlayerSystem(this.input, this.bus, this.camera, this.settings);
    this.players.reset();
    this.loop = new GameLoop((dt, t) => this.frame(dt, t));

    canvas.addEventListener('click', () => this.input.requestPointerLock());
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  start(): void {
    this.loop.start();
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private frame(dt: number, _time: number): void {
    this.players.update(dt, PlayerConfig.baseRunSpeed, this.flatGround, true);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }
}
