import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Textures } from '../utils/TextureFactory';

/**
 * A procedural first-person arm: shoulder → elbow → wrist → hand, with
 * every finger built from three jointed segments (thumb included).
 *
 * Built for the RIGHT arm in its own space: the arm hangs down −Y, forward
 * is −Z, the palm faces −X (toward the body's midline). The left arm is the
 * same rig mirrored (scale.x = −1), so poses are shared.
 *
 * Joint conventions (radians):
 *   swing      shoulder about X, + swings the arm forward
 *   abduct     shoulder about Z, + lifts the arm out to the side
 *   twist      shoulder about Y, + turns a forward arm toward the midline
 *   elbow      elbow about X, + bends the forearm forward/up
 *   wristFlex  wrist about Z, + curls the hand toward the palm, − bends it back
 *   pronate    forearm twist, + turns the palm from facing inward to facing down/forward
 *   curl       finger joints toward the palm (0 open … ~1.5 tight fist)
 *   thumb      thumb curl across the fingers
 *   spread     fingers fanning apart
 */
export interface ArmPose {
  swing: number;
  abduct: number;
  twist: number;
  elbow: number;
  wristFlex: number;
  pronate: number;
  curl: number;
  thumb: number;
  spread: number;
}

export const ARM_POSE_KEYS: (keyof ArmPose)[] = ['swing', 'abduct', 'twist', 'elbow', 'wristFlex', 'pronate', 'curl', 'thumb', 'spread'];

const UPPER = 0.29;
const FORE = 0.26;

/** Deep brown skin, lighter palms (sRGB hex). */
const SKIN = new THREE.Color(0x3d2519);
const SKIN_PALM = new THREE.Color(0x7c5242);

let materials: { skin: THREE.MeshStandardMaterial; cloth: THREE.MeshStandardMaterial } | null = null;
function mats() {
  return (materials ??= {
    skin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 }),
    cloth: new THREE.MeshStandardMaterial({ map: Textures.cloth(), color: 0xb4a78b, roughness: 1, side: THREE.DoubleSide }),
  });
}

/**
 * Colour vertices dark on the back, lighter toward the palm side (−X in the
 * piece's local frame), the way real hands and inner forearms are.
 */
function skinColors(geo: THREE.BufferGeometry, palmAmount: number): THREE.BufferGeometry {
  const nor = geo.getAttribute('normal');
  const colors = new Float32Array(nor.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < nor.count; i++) {
    const k = THREE.MathUtils.smoothstep(-nor.getX(i), 0.1, 0.9) * palmAmount;
    c.copy(SKIN).lerp(SKIN_PALM, k);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** A tapered limb along −Y from a radius profile r(t), t = 0..1 along `length`. */
function limb(length: number, radius: (t: number) => number, flatten = 1): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const steps = 14;
  // Lathe profiles must run bottom → top for outward-facing triangles.
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    pts.push(new THREE.Vector2(radius(t), -t * length));
  }
  const g = new THREE.LatheGeometry(pts, 16);
  g.scale(flatten, 1, 1);
  g.computeVertexNormals();
  return g;
}

/** A rounded finger segment spanning y = 0 … −length. */
function phalanx(length: number, radius: number): THREE.BufferGeometry {
  const g = new THREE.CapsuleGeometry(radius, Math.max(0.001, length - radius), 4, 10);
  g.translate(0, -length / 2, 0);
  return skinColors(g, 1);
}

interface Finger {
  joints: THREE.Group[];
  /** How much this finger fans out with `spread`. */
  fan: number;
}

export class ArmRig {
  readonly root = new THREE.Group();
  private readonly shoulder = new THREE.Group();
  private readonly elbowJoint = new THREE.Group();
  private readonly wrist = new THREE.Group();
  private readonly fingers: Finger[] = [];
  private readonly thumb: THREE.Group[] = [];

  constructor() {
    const { skin, cloth } = mats();
    this.root.add(this.shoulder);

    // ---- Upper arm with a rolled linen sleeve ---------------------------------
    const upperR = (t: number) => 0.049 + 0.011 * Math.sin(Math.PI * Math.min(1, t * 1.1)) - 0.006 * t;
    this.shoulder.add(new THREE.Mesh(skinColors(limb(UPPER, upperR), 0.15), skin));
    const sleeveLen = UPPER * 0.78;
    const sleeveGeo = limb(sleeveLen + 0.05, (t) => upperR(Math.max(0, (t * (sleeveLen + 0.05) - 0.05) / UPPER)) + 0.011);
    sleeveGeo.translate(0, 0.05, 0);
    // Creases in the cloth.
    const sp = sleeveGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i);
      const z = sp.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + 0.06 * Math.sin(a * 5 + sp.getY(i) * 40) * Math.min(1, -sp.getY(i) * 6);
      sp.setXYZ(i, x * k, sp.getY(i), z * k);
    }
    sleeveGeo.computeVertexNormals();
    this.shoulder.add(new THREE.Mesh(sleeveGeo, cloth));
    // The roll of the cuff hugs the arm where the sleeve ends — part of the sleeve, never floating.
    const cuffR = upperR(sleeveLen / UPPER) + 0.013;
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(cuffR, 0.011, 8, 20), cloth);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -sleeveLen;
    this.shoulder.add(cuff);

    // ---- Elbow and forearm ---------------------------------------------------
    this.elbowJoint.position.y = -UPPER;
    this.shoulder.add(this.elbowJoint);
    this.elbowJoint.add(new THREE.Mesh(skinColors(new THREE.SphereGeometry(0.043, 16, 12), 0.15), skin));
    const foreR = (t: number) => 0.041 + 0.009 * Math.sin(Math.PI * Math.min(1, t * 1.6)) - 0.012 * t;
    this.elbowJoint.add(new THREE.Mesh(skinColors(limb(FORE, foreR, 0.86), 0.35), skin));

    // ---- Wrist and hand --------------------------------------------------------
    this.wrist.position.y = -FORE;
    this.elbowJoint.add(this.wrist);
    const wristCap = new THREE.Mesh(skinColors(new THREE.SphereGeometry(0.03, 14, 10).scale(0.85, 1, 1.05), 0.5), skin);
    this.wrist.add(wristCap);
    // Palm: breadth along Z, length down −Y, thin along X (palm faces −X).
    // A softened box blended with an ellipsoid so it reads as flesh, not a block.
    const palmBox = new RoundedBoxGeometry(0.026, 0.084, 0.078, 5, 0.012);
    const palm = new THREE.Mesh(skinColors(palmBox, 1), skin);
    palm.position.set(0, -0.056, 0.002);
    this.wrist.add(palm);
    const heel = new THREE.Mesh(skinColors(new THREE.SphereGeometry(1, 18, 12).scale(0.017, 0.04, 0.04), 1), skin);
    heel.position.set(-0.003, -0.04, 0.0);
    this.wrist.add(heel);

    // Four fingers, three joints each. Index at the front (−Z), pinky at the back.
    const specs: { z: number; lengths: [number, number, number]; r: number; fan: number }[] = [
      { z: -0.03, lengths: [0.043, 0.026, 0.021], r: 0.0095, fan: -1 },
      { z: -0.0095, lengths: [0.047, 0.029, 0.022], r: 0.0099, fan: -0.3 },
      { z: 0.0105, lengths: [0.044, 0.027, 0.021], r: 0.0093, fan: 0.3 },
      { z: 0.0295, lengths: [0.035, 0.021, 0.019], r: 0.0083, fan: 1 },
    ];
    for (const f of specs) {
      const joints: THREE.Group[] = [];
      let parent: THREE.Object3D = this.wrist;
      let y = -0.098;
      let r = f.r;
      for (let k = 0; k < 3; k++) {
        const j = new THREE.Group();
        j.position.set(k === 0 ? -0.004 : 0, y, k === 0 ? f.z : 0);
        j.add(new THREE.Mesh(phalanx(f.lengths[k], r), skin));
        parent.add(j);
        joints.push(j);
        parent = j;
        y = -f.lengths[k];
        r *= 0.9;
      }
      this.fingers.push({ joints, fan: f.fan });
    }

    // Thumb: rooted low on the palm's front edge, angled forward and inward.
    let parent: THREE.Object3D = this.wrist;
    const thumbLen = [0.034, 0.028, 0.022];
    let tr = 0.0115;
    for (let k = 0; k < 3; k++) {
      const j = new THREE.Group();
      if (k === 0) {
        j.position.set(-0.008, -0.045, -0.03);
      } else {
        j.position.y = -thumbLen[k - 1];
      }
      j.add(new THREE.Mesh(phalanx(thumbLen[k], tr), skin));
      parent.add(j);
      this.thumb.push(j);
      parent = j;
      tr *= 0.9;
    }

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        o.frustumCulled = false; // always attached to the camera
      }
    });
  }

  apply(p: ArmPose): void {
    this.shoulder.rotation.set(p.swing, p.twist, p.abduct, 'ZYX');
    this.elbowJoint.rotation.set(p.elbow, 0, 0);
    this.wrist.rotation.set(0, p.pronate, -p.wristFlex, 'YXZ');
    for (const f of this.fingers) {
      // Proximal joints bend a little less than the middle joints in a natural fist.
      const curls = [p.curl * 0.85, p.curl * 1.1, p.curl * 0.75];
      f.joints.forEach((j, k) => {
        j.rotation.set(0, k === 0 ? f.fan * p.spread * 0.12 : 0, -curls[k]);
      });
    }
    // Thumb base swings across the palm; the joints curl over the fingers.
    this.thumb[0].rotation.set(0.35 + p.thumb * 0.3, 0, -0.2 - p.thumb * 0.45);
    this.thumb[1].rotation.set(p.thumb * 0.2, 0, -p.thumb * 0.45);
    this.thumb[2].rotation.set(p.thumb * 0.15, 0, -p.thumb * 0.5);
  }
}
