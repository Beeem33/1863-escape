import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { capsule, ellipsoid, polygonize, union, type Sdf, type V3 } from './SdfMesh';

/**
 * Smooth body-part geometry for the human figures. Each part is built in its
 * joint's local frame: limbs hang down −Y from the joint, the torso and head
 * rise +Y, the figure faces −Z. Vertex colours act as a mask — white areas
 * take the instance's tint (cloth / skin colour), darker areas stay darker
 * (belts, hair, boot soles, gun metal).
 */

/** Skeleton measurements (metres). */
export const BODY = {
  hipHeight: 0.9,
  hipWidth: 0.095,
  spineOffset: 0.08,
  shoulderHeight: 0.44,
  shoulderWidth: 0.19,
  neckHeight: 0.5,
  upperArm: 0.29,
  forearm: 0.25,
  thigh: 0.43,
  shin: 0.42,
};

function finish(g: THREE.BufferGeometry, shade = 1): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.computeVertexNormals();
  const n = geo.getAttribute('position').count;
  const c = new Float32Array(n * 3).fill(shade);
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) geo.deleteAttribute(k);
  return geo;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)!;
  g.computeBoundingSphere();
  return g;
}

/** Lathe from a radius profile, running bottom→top so faces point outward. */
function lathe(points: [number, number][], segments = 14): THREE.BufferGeometry {
  const sorted = [...points].sort((a, b) => a[1] - b[1]);
  return new THREE.LatheGeometry(
    sorted.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)),
    segments,
  );
}

/** Tapered limb down −Y: radius r0 at the joint → r1 at the end, with a mid bulge. */
function limb(length: number, r0: number, r1: number, bulge = 0.1, bulgeAt = 0.3): THREE.BufferGeometry {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const r = r0 + (r1 - r0) * t + Math.sin(Math.PI * Math.min(1, t / (bulgeAt * 2))) * bulge * r0 * (t < bulgeAt * 2 ? 1 : 0);
    pts.push([r, -t * length]);
  }
  // Rounded caps so joints blend into each other.
  pts.push([r0 * 0.55, r0 * 0.6], [0.001, r0 * 0.9]);
  pts.push([r1 * 0.6, -length - r1 * 0.55], [0.001, -length - r1 * 0.8]);
  return lathe(pts, 12);
}

/** Colour a geometry's vertices by a rule (returns a darkening factor per vertex). */
function paint(g: THREE.BufferGeometry, rule: (x: number, y: number, z: number) => number): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const v = rule(pos.getX(i), pos.getY(i), pos.getZ(i));
    col.setXYZ(i, col.getX(i) * v, col.getY(i) * v, col.getZ(i) * v);
  }
  return g;
}

const sdfPart = (sdf: Sdf, min: V3, max: V3, cell: number, shade?: (x: number, y: number, z: number) => number) =>
  polygonize(sdf, min, max, cell, shade);

export const HumanGeometry = {
  /** Hips and seat of the trousers, centred on the hip joint line. */
  pelvis(): THREE.BufferGeometry {
    return sdfPart(
      union(
        0.05,
        ellipsoid([0, 0.0, 0.0], [0.155, 0.12, 0.105]),
        ellipsoid([0.06, -0.04, 0.045], [0.075, 0.085, 0.07]),
        ellipsoid([-0.06, -0.04, 0.045], [0.075, 0.085, 0.07]),
        ellipsoid([0, 0.09, 0], [0.145, 0.06, 0.1]),
      ),
      [-0.22, -0.2, -0.16],
      [0.22, 0.18, 0.16],
      0.012,
    );
  },

  /** Chest, back and shoulders from the waist to the base of the neck; darker belt at the waist. */
  torso(): THREE.BufferGeometry {
    return sdfPart(
      union(
        0.06,
        ellipsoid([0, 0.08, 0.0], [0.145, 0.13, 0.1]),
        ellipsoid([0, 0.29, -0.012], [0.172, 0.19, 0.118]),
        ellipsoid([0, 0.31, 0.02], [0.16, 0.19, 0.1]),
        capsule([-0.168, 0.42, 0.01], [0.168, 0.42, 0.01], 0.062, 0.062),
        capsule([-0.08, 0.465, 0.02], [0.08, 0.465, 0.02], 0.048, 0.048),
        capsule([0, 0.44, 0.0], [0, 0.53, 0.0], 0.056, 0.05),
        ellipsoid([0, -0.01, 0.0], [0.155, 0.06, 0.108]),
      ),
      [-0.27, -0.1, -0.18],
      [0.27, 0.58, 0.18],
      0.012,
      (_x, y) => (y > -0.01 && y < 0.035 ? 0.28 : 1),
    );
  },

  /** Neck and head: skull, jaw, brow, nose, ears; darker hair, eyes and mouth. */
  head(): THREE.BufferGeometry {
    return sdfPart(
      union(
        0.025,
        capsule([0, 0.0, 0.005], [0, 0.1, 0.005], 0.052, 0.05),
        ellipsoid([0, 0.172, 0.012], [0.084, 0.104, 0.098]),
        ellipsoid([0, 0.105, -0.028], [0.066, 0.058, 0.07]),
        ellipsoid([0, 0.08, -0.05], [0.032, 0.024, 0.03]),
        capsule([-0.042, 0.168, -0.083], [0.042, 0.168, -0.083], 0.017, 0.017),
        capsule([0, 0.152, -0.094], [0, 0.118, -0.108], 0.011, 0.016),
        ellipsoid([0.086, 0.152, 0.004], [0.012, 0.027, 0.019]),
        ellipsoid([-0.086, 0.152, 0.004], [0.012, 0.027, 0.019]),
        ellipsoid([0.046, 0.128, -0.07], [0.022, 0.018, 0.02]),
        ellipsoid([-0.046, 0.128, -0.07], [0.022, 0.018, 0.02]),
      ),
      [-0.12, -0.03, -0.14],
      [0.12, 0.3, 0.14],
      0.008,
      (x, y, z) => {
        // Close-cropped hair over the crown and back of the head.
        if (y > 0.198 - (z > 0 ? 0.07 : 0) && !(z < -0.07 && y < 0.24)) return 0.22;
        // Eyes and mouth: small darker hollows.
        if (z < -0.075 && Math.abs(Math.abs(x) - 0.032) < 0.014 && Math.abs(y - 0.152) < 0.008) return 0.25;
        if (z < -0.085 && Math.abs(x) < 0.022 && Math.abs(y - 0.092) < 0.005) return 0.45;
        return 1;
      },
    );
  },
  /** Kepi: forward-tilted forage cap with a dark leather visor. */
  kepi(): THREE.BufferGeometry {
    const cap = finish(new THREE.CylinderGeometry(0.083, 0.098, 0.11, 14).rotateX(-0.25).translate(0, 0.29, 0.0));
    const top = finish(new THREE.CylinderGeometry(0.083, 0.083, 0.012, 14).rotateX(-0.25).translate(0, 0.345, -0.012));
    const visor = finish(new THREE.CylinderGeometry(0.08, 0.08, 0.008, 12, 1, false, Math.PI * 0.6, Math.PI * 0.8).translate(0, 0.245, -0.03), 0.2);
    return merge([cap, top, visor]);
  },

  /** Broad-brimmed slouch hat with a creased crown. */
  slouchHat(): THREE.BufferGeometry {
    const brim = finish(new THREE.CylinderGeometry(0.2, 0.21, 0.012, 20).translate(0, 0.255, 0));
    // Droop the brim edge.
    const p = brim.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getZ(i));
      p.setY(i, p.getY(i) - Math.max(0, r - 0.12) * 0.25 * (1 + 0.5 * Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 2)));
    }
    brim.computeVertexNormals();
    const crown = finish(new THREE.CylinderGeometry(0.075, 0.098, 0.12, 14).translate(0, 0.32, 0));
    const band = finish(new THREE.CylinderGeometry(0.099, 0.1, 0.022, 14).translate(0, 0.272, 0), 0.35);
    return merge([brim, crown, band]);
  },

  upperArm(): THREE.BufferGeometry {
    return sdfPart(
      union(0.03, capsule([0, 0.02, 0], [0, -BODY.upperArm, 0], 0.05, 0.04), ellipsoid([0, -0.12, -0.016], [0.046, 0.095, 0.046])),
      [-0.08, -0.36, -0.08],
      [0.08, 0.08, 0.08],
      0.01,
    );
  },

  forearm(): THREE.BufferGeometry {
    return sdfPart(
      union(0.03, capsule([0, 0.01, 0], [0, -BODY.forearm, 0], 0.042, 0.029), ellipsoid([0, -0.07, 0.004], [0.043, 0.085, 0.037])),
      [-0.07, -0.3, -0.07],
      [0.07, 0.06, 0.07],
      0.009,
    );
  },

  /** A loosely curled hand with a thumb. */
  hand(): THREE.BufferGeometry {
    return sdfPart(
      union(
        0.015,
        ellipsoid([0, -0.045, 0], [0.019, 0.045, 0.04]),
        capsule([0.0, -0.085, -0.008], [-0.018, -0.12, 0.0], 0.019, 0.016),
        capsule([-0.006, -0.03, -0.036], [-0.02, -0.066, -0.05], 0.012, 0.01),
      ),
      [-0.05, -0.15, -0.08],
      [0.04, 0.02, 0.06],
      0.007,
    );
  },

  thigh(): THREE.BufferGeometry {
    return sdfPart(
      union(0.04, capsule([0, 0.03, 0], [0, -BODY.thigh, 0], 0.08, 0.054), ellipsoid([0, -0.15, -0.018], [0.075, 0.16, 0.072])),
      [-0.12, -0.5, -0.12],
      [0.12, 0.13, 0.12],
      0.012,
    );
  },

  shin(): THREE.BufferGeometry {
    return sdfPart(
      union(
        0.03,
        capsule([0, 0.01, 0], [0, -BODY.shin, 0], 0.052, 0.038),
        ellipsoid([0, -0.12, 0.024], [0.05, 0.1, 0.05]),
        ellipsoid([0, 0.0, -0.03], [0.04, 0.04, 0.03]),
      ),
      [-0.09, -0.48, -0.09],
      [0.09, 0.08, 0.1],
      0.01,
    );
  },

  /** Boot (or bare foot when tinted with skin): ankle at the origin, toe toward −Z, darker sole. */
  foot(): THREE.BufferGeometry {
    const shape = union(0.03, ellipsoid([0, -0.02, 0.0], [0.05, 0.06, 0.055]), capsule([0, -0.045, 0.03], [0, -0.055, -0.15], 0.048, 0.042));
    const boot: Sdf = (x, y, z) => Math.max(shape(x, y, z), -(y + 0.095));
    return sdfPart(boot, [-0.08, -0.12, -0.22], [0.08, 0.06, 0.1], 0.009, (_x, y) => (y < -0.085 ? 0.3 : 1));
  },

  /** Rifle-musket held at the grip (origin); barrel toward −Z, butt toward +Z. */
  rifle(): THREE.BufferGeometry {
    const stock = finish(new RoundedBoxGeometry(0.04, 0.07, 0.42, 2, 0.015).translate(0, -0.01, 0.17), 1);
    paint(stock, () => 1);
    const fore = finish(new THREE.BoxGeometry(0.035, 0.035, 0.75).translate(0, 0.005, -0.4), 1);
    const barrel = finish(new THREE.CylinderGeometry(0.009, 0.011, 1.0, 6).rotateX(Math.PI / 2).translate(0, 0.03, -0.55), 0.45);
    const lock = finish(new THREE.BoxGeometry(0.045, 0.03, 0.06).translate(0, 0.02, -0.02), 0.4);
    const g = merge([stock, fore, barrel, lock]);
    // Wood vs metal: tint the wooden parts brown via vertex colour.
    const col = g.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < col.count; i++) {
      if (col.getX(i) > 0.9) col.setXYZ(i, 0.42, 0.27, 0.15);
      else col.setXYZ(i, 0.2, 0.2, 0.21);
    }
    return g;
  },

  /** Knapsack with a rolled blanket on top, worn on the back. */
  pack(): THREE.BufferGeometry {
    const sack = finish(new RoundedBoxGeometry(0.28, 0.3, 0.1, 2, 0.03).translate(0, 0.3, 0.13));
    const roll = finish(new THREE.CapsuleGeometry(0.05, 0.3, 4, 8).rotateZ(Math.PI / 2).translate(0, 0.48, 0.12), 0.75);
    return merge([sack, roll]);
  },

  /** Hanging rope: a short length from the neck up toward the branch. */
  noose(): THREE.BufferGeometry {
    const loop = finish(new THREE.TorusGeometry(0.06, 0.012, 6, 14).rotateX(Math.PI / 2).translate(0, 0.06, 0.0));
    return merge([loop]);
  },
};
