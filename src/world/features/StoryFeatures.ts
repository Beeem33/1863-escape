import * as THREE from 'three';
import { BODY } from '../../characters/HumanGeometry';
import type { Human } from '../../characters/HumanCrowd';
import { Anim } from '../../characters/HumanPose';
import { Styles } from '../../characters/Styles';
import type { Characters } from '../../characters/Characters';
import type { Random } from '../../utils/Random';
import { Materials } from '../Materials';
import { Feature, type FeatureContext } from './Feature';

let signTexture: THREE.CanvasTexture | null = null;
function sign(): THREE.CanvasTexture {
  if (signTexture) return signTexture;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d')!;
  // Weathered board.
  g.fillStyle = '#8a7356';
  g.fillRect(0, 0, 256, 96);
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = `rgba(60,40,25,${0.1 + Math.random() * 0.2})`;
    g.beginPath();
    const y = Math.random() * 96;
    g.moveTo(0, y);
    g.lineTo(256, y + (Math.random() - 0.5) * 6);
    g.stroke();
  }
  // Crude hand-painted letters.
  g.fillStyle = '#1c1410';
  g.font = 'bold 52px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('RUNNER', 128, 52);
  signTexture = new THREE.CanvasTexture(c);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  return signTexture;
}

/**
 * A man hanged from a limb as a warning, a board around his neck that reads
 * RUNNER. Rare by design; kept back from the trail and without gore — the
 * weight of the scene is in what it says, not in what it shows.
 * params: facing (yaw toward the trail)
 */
export class HangingTree extends Feature {
  private body: Human | null = null;
  private seed = 0;
  private readonly limb: THREE.Mesh;
  private readonly rope: THREE.Mesh;
  private readonly board: THREE.Mesh;
  private readonly cords: THREE.Mesh;
  private yaw = 0;

  constructor() {
    super();
    const bark = Materials().bark;
    // A thick limb reaching out from the oak's trunk (the oak itself is decor).
    const limbGeo = new THREE.CylinderGeometry(0.11, 0.2, 3.4, 8).rotateZ(Math.PI / 2 - 0.15).translate(1.6, 4.55, 0);
    this.limb = new THREE.Mesh(limbGeo, bark);
    this.limb.castShadow = true;
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 1 });
    this.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 5).translate(0, -0.5, 0), ropeMat);
    this.cords = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.006, 4, 12, Math.PI), ropeMat);
    this.board = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.17),
      new THREE.MeshStandardMaterial({ map: sign(), roughness: 1, side: THREE.DoubleSide }),
    );
    this.object.add(this.limb, this.rope, this.board, this.cords);
  }

  protected configure(params: Record<string, number>, rng: Random): void {
    this.yaw = params.facing ?? 0;
    this.object.rotation.y = this.yaw;
    this.seed = rng.range(0, 10);
  }

  override dispose(ctx: { characters: Characters }): void {
    ctx.characters.humans.remove(this.body);
    this.body = null;
  }

  update(ctx: FeatureContext): void {
    if (!this.body) {
      this.body = ctx.characters.humans.spawn({ ...Styles.runner(this.seed / 10), hat: 'none' });
      if (!this.body) return;
    }
    if (this.distanceTo(ctx) > 220) return;
    this.object.updateMatrixWorld(true);
    // Rope hangs from the end of the limb, 3 m out from the trunk.
    const limbEnd = new THREE.Vector3(3.0, 4.3, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const ax = this.x + limbEnd.x;
    const az = -this.d + limbEnd.z;
    const ay = this.y + limbEnd.y;
    const t = ctx.time;
    const swing = Math.sin(t * 0.6 + this.seed) * 0.04;
    const neckY = ay - 1.0;
    Anim.hang(this.body.pose, t, this.seed);
    const p = this.body.pose;
    p.x = ax + swing;
    p.z = az;
    p.y = neckY - BODY.spineOffset - BODY.neckHeight;
    p.yaw = this.yaw + Math.PI / 2 + Math.sin(t * 0.25 + this.seed) * 0.35;
    // Rope from limb to neck, in the feature's local space.
    const local = (wx: number, wy: number, wz: number) => this.object.worldToLocal(new THREE.Vector3(wx, wy, wz));
    const top = local(ax, ay, az);
    this.rope.position.copy(top);
    this.rope.scale.set(1, ay - neckY + 0.05, 1);
    this.rope.rotation.set(0, 0, -swing * 0.8);
    // The board hangs on the chest, facing the way he faces.
    const fwdX = -Math.sin(p.yaw);
    const fwdZ = -Math.cos(p.yaw);
    const chest = local(p.x + fwdX * 0.16, neckY - 0.28, p.z + fwdZ * 0.16);
    this.board.position.copy(chest);
    this.board.rotation.set(0.12, p.yaw - this.yaw, 0);
    this.cords.position.copy(local(p.x + fwdX * 0.1, neckY - 0.17, p.z + fwdZ * 0.1));
    this.cords.rotation.set(0, p.yaw - this.yaw, 0);
  }
}
