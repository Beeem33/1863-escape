import * as THREE from 'three';
import { GameLoop } from './GameLoop';
import { InputManager } from './InputManager';
import { EventBus } from './EventBus';
import { Settings } from './Settings';
import { GameState, RunStats } from './GameState';

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
  state = GameState.Menu;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly uiRoot: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 1200);
    this.camera.position.set(0, 1.66, 0);
    this.scene.background = new THREE.Color(0xd8b98a);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 400).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x8a6a45 }),
    );
    this.scene.add(ground, new THREE.HemisphereLight(0xffe8c0, 0x553b22, 2));

    this.input = new InputManager(canvas);
    this.loop = new GameLoop((dt, t) => this.frame(dt, t));

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
    this.camera.position.z -= dt * 9;
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }
}
