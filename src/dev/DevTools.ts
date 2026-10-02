import * as THREE from 'three';
import { ArmRig, type ArmPose } from '../player/ArmModel';
import { Difficulty } from '../core/Difficulty';
import type { Game } from '../core/Game';
import { GameState } from '../core/GameState';

/**
 * Development-only helpers, exposed as `window.dev` when running `npm run dev`
 * (never included in production builds). Handy for testing from the browser
 * console or automated tooling, e.g.:
 *
 *   dev.start(42)          fresh run with seed 42, frozen (no real-time loop)
 *   dev.sim(5)             simulate 5 s with the autopilot
 *   dev.goto(1500)         jump ahead (chunks generated in order)
 *   dev.shot()             render the current frame to an overlay image
 *   dev.armSheet({...})    render the arm rig alone from three angles
 *   dev.hide()             remove the overlay image
 */
export function installDevTools(game: Game): void {
  const g = game;

  const show = (): void => {
    const url = g.renderer.domElement.toDataURL('image/jpeg', 0.88);
    let img = document.getElementById('dev-shot') as HTMLImageElement | null;
    if (!img) {
      img = document.createElement('img');
      img.id = 'dev-shot';
      img.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:contain;z-index:9999;background:#000;pointer-events:none';
      document.body.appendChild(img);
    }
    img.src = url;
    img.style.display = 'block';
  };

  const step = (auto: boolean): void => {
    const p = g.players.player;
    const intent = auto ? g.autopilot.update(p, g.world.chunks, g.world.obstacles) : 'none';
    g.players.update(1 / 60, Difficulty.runSpeed(p.d), g.world.ground, intent);
    const hit = g.world.obstacles.collide(p);
    if (hit?.trip) g.players.movement.startFall(p);
    g.world.collectibles.collect(p);
    g.weather.update(1 / 60, g.bus);
    g.world.update(1 / 60, p, g.camera, g.weather);
    g.arms.update(1 / 60, p);
  };

  const dev = {
    start(seed = 42, level = 1): void {
      g.ui.hideAllScreens();
      g.ui.hud.show();
      g.resetWorld(seed, level);
      g.state = GameState.Paused; // the real loop just renders; we drive the simulation
    },
    sim(seconds: number, auto = true): number {
      for (let i = 0; i < Math.round(seconds * 60); i++) step(auto);
      return Math.round(g.players.player.d);
    },
    goto(d: number): number {
      const p = g.players.player;
      while (p.d < d - 5) {
        p.d = Math.min(d - 5, p.d + 30);
        g.world.chunks.update(p.d, 3);
      }
      g.world.chunks.fill(p.d);
      return dev.sim(1);
    },
    shot(): void {
      g.post.update(1 / 60, g.world.environment.current);
      g.post.render();
      g.ui.hud.update(g.players.player, g.stats.distance, g.stats.mapPieces, g.pursuit.gap);
      show();
    },
    hide(): void {
      const img = document.getElementById('dev-shot');
      if (img) img.style.display = 'none';
    },
    /** Render the arm rig alone, from the side, front and above-behind. */
    armSheet(pose: Partial<ArmPose> = {}, target: [number, number, number] = [0, -0.35, -0.15]): void {
      const r = g.renderer;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x777b80);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.5));
      const dl = new THREE.DirectionalLight(0xffffff, 3);
      dl.position.set(1, 2, 1);
      scene.add(dl);
      const rig = new ArmRig();
      rig.apply({ swing: 0.9, abduct: 0.1, twist: 0, elbow: 1.5, wristFlex: 0.1, pronate: 0, curl: 1.05, thumb: 0.7, spread: 0, ...pose });
      scene.add(rig.root);
      const W = r.domElement.width / r.getPixelRatio();
      const H = r.domElement.height / r.getPixelRatio();
      const views: [number, number, number][] = [
        [1.5, -0.3, -0.2],
        [0.3, -0.25, -1.4],
        [-0.9, 0.5, 0.6],
      ];
      const cam = new THREE.PerspectiveCamera(35, W / views.length / H, 0.01, 10);
      r.setScissorTest(true);
      views.forEach((v, i) => {
        cam.position.set(...v);
        cam.lookAt(...target);
        r.setViewport((i * W) / views.length, 0, W / views.length, H);
        r.setScissor((i * W) / views.length, 0, W / views.length, H);
        r.render(scene, cam);
      });
      r.setScissorTest(false);
      r.setViewport(0, 0, W, H);
      show();
    },
    /** Freeze the arms at a stride phase (0.5 = right arm forward) and shoot. */
    armsAt(stridePhase: number): void {
      const p = g.players.player;
      p.stride = Math.floor(p.stride) + stridePhase;
      for (let i = 0; i < 60; i++) g.arms.update(1 / 60, p);
      g.players.view.update(p, false, 0.0001);
      dev.shot();
    },
    /** Override both arms' pose directly (for tuning) and shoot. */
    poseArms(p: Partial<ArmPose>): void {
      const arms = g.arms as unknown as { right: ArmRig; left: ArmRig; current: { right: ArmPose; left: ArmPose } };
      arms.right.apply({ ...arms.current.right, ...p });
      arms.left.apply({ ...arms.current.left, ...p });
      dev.shot();
    },
    /** Trip, then advance to `t` seconds into the fall and shoot. */
    fallAt(t: number): void {
      const p = g.players.player;
      if (!p.falling) g.players.movement.startFall(p);
      while (p.fallTime >= 0 && p.fallTime < t) step(false);
      dev.shot();
    },
  };

  (window as unknown as { dev: typeof dev }).dev = dev;
}
