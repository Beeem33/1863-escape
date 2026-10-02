import * as THREE from 'three';

export interface ParticleSpawn {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  /** Size at end of life (defaults to `size`). */
  endSize?: number;
  /** Peak opacity. */
  alpha?: number;
  color?: number | THREE.Color;
  rotation?: number;
  spin?: number;
  /** Fraction of velocity lost per second (0..1+). */
  drag?: number;
  /** Upward acceleration (negative = falls). */
  lift?: number;
  /** Fraction of life spent fading in (rest fades out). */
  fadeIn?: number;
}

const VERT = /* glsl */ `
  attribute vec3 offset;
  attribute vec4 pdata;   // size, rotation, alpha, unused
  attribute vec3 pcolor;
  varying vec2 vUv;
  varying vec4 vColor;
  #include <fog_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(offset, 1.0);
    float c = cos(pdata.y);
    float s = sin(pdata.y);
    vec2 p = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
    mvPosition.xy += p * pdata.x;
    gl_Position = projectionMatrix * mvPosition;
    vUv = uv;
    vColor = vec4(pcolor, pdata.z);
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 tint;
  varying vec2 vUv;
  varying vec4 vColor;
  #include <fog_pars_fragment>
  void main() {
    vec4 tex = texture2D(map, vUv);
    gl_FragColor = vec4(vColor.rgb * tex.rgb * tint, vColor.a * tex.a);
    if (gl_FragColor.a < 0.003) discard;
    #include <fog_fragment>
  }
`;

/**
 * Camera-facing particles drawn with ONE instanced draw call per system.
 * Simulation runs on the CPU in flat typed arrays (no per-particle objects,
 * no garbage).
 */
export class ParticleSystem {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly offsetAttr: THREE.InstancedBufferAttribute;
  private readonly dataAttr: THREE.InstancedBufferAttribute;
  private readonly colorAttr: THREE.InstancedBufferAttribute;

  private count = 0;
  private readonly p: Float32Array; // x y z vx vy vz
  private readonly l: Float32Array; // age life size endSize alpha rot spin drag lift fadeIn
  private readonly c: Float32Array; // r g b
  private readonly tmp = new THREE.Color();

  constructor(
    readonly capacity: number,
    texture: THREE.Texture,
    blending: THREE.Blending,
    renderOrder = 10,
  ) {
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = quad.index;
    this.geometry.setAttribute('position', quad.getAttribute('position'));
    this.geometry.setAttribute('uv', quad.getAttribute('uv'));
    this.offsetAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.dataAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('offset', this.offsetAttr);
    this.geometry.setAttribute('pdata', this.dataAttr);
    this.geometry.setAttribute('pcolor', this.colorAttr);
    this.geometry.instanceCount = 0;

    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, tint: { value: new THREE.Color(1, 1, 1) } }]),
      transparent: true,
      depthWrite: false,
      blending,
      fog: true,
    });
    material.uniforms.map.value = texture;
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;

    this.p = new Float32Array(capacity * 6);
    this.l = new Float32Array(capacity * 10);
    this.c = new Float32Array(capacity * 3);
  }

  /** Multiplies every particle's colour — used to light smoke to match the scene. */
  get tint(): THREE.Color {
    return (this.mesh.material as THREE.ShaderMaterial).uniforms.tint.value as THREE.Color;
  }

  get alive(): number {
    return this.count;
  }

  spawn(s: ParticleSpawn): void {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    const p = i * 6;
    this.p[p] = s.x;
    this.p[p + 1] = s.y;
    this.p[p + 2] = s.z;
    this.p[p + 3] = s.vx ?? 0;
    this.p[p + 4] = s.vy ?? 0;
    this.p[p + 5] = s.vz ?? 0;
    const l = i * 10;
    this.l[l] = 0;
    this.l[l + 1] = s.life;
    this.l[l + 2] = s.size;
    this.l[l + 3] = s.endSize ?? s.size;
    this.l[l + 4] = s.alpha ?? 1;
    this.l[l + 5] = s.rotation ?? Math.random() * Math.PI * 2;
    this.l[l + 6] = s.spin ?? 0;
    this.l[l + 7] = s.drag ?? 0;
    this.l[l + 8] = s.lift ?? 0;
    this.l[l + 9] = s.fadeIn ?? 0.15;
    if (s.color instanceof THREE.Color) this.tmp.copy(s.color);
    else this.tmp.setHex(s.color ?? 0xffffff);
    this.c[i * 3] = this.tmp.r;
    this.c[i * 3 + 1] = this.tmp.g;
    this.c[i * 3 + 2] = this.tmp.b;
  }

  clear(): void {
    this.count = 0;
    this.geometry.instanceCount = 0;
  }

  update(dt: number): void {
    const off = this.offsetAttr.array as Float32Array;
    const dat = this.dataAttr.array as Float32Array;
    const col = this.colorAttr.array as Float32Array;
    let i = 0;
    while (i < this.count) {
      const l = i * 10;
      this.l[l] += dt;
      const age = this.l[l];
      const life = this.l[l + 1];
      if (age >= life) {
        this.kill(i);
        continue;
      }
      const p = i * 6;
      const drag = Math.max(0, 1 - this.l[l + 7] * dt);
      this.p[p + 3] *= drag;
      this.p[p + 4] = this.p[p + 4] * drag + this.l[l + 8] * dt;
      this.p[p + 5] *= drag;
      this.p[p] += this.p[p + 3] * dt;
      this.p[p + 1] += this.p[p + 4] * dt;
      this.p[p + 2] += this.p[p + 5] * dt;
      this.l[l + 5] += this.l[l + 6] * dt;

      const t = age / life;
      const fadeIn = this.l[l + 9];
      const a = t < fadeIn ? t / fadeIn : 1 - (t - fadeIn) / (1 - fadeIn);
      off[i * 3] = this.p[p];
      off[i * 3 + 1] = this.p[p + 1];
      off[i * 3 + 2] = this.p[p + 2];
      dat[i * 4] = this.l[l + 2] + (this.l[l + 3] - this.l[l + 2]) * t;
      dat[i * 4 + 1] = this.l[l + 5];
      dat[i * 4 + 2] = this.l[l + 4] * Math.max(0, a);
      col[i * 3] = this.c[i * 3];
      col[i * 3 + 1] = this.c[i * 3 + 1];
      col[i * 3 + 2] = this.c[i * 3 + 2];
      i++;
    }
    this.geometry.instanceCount = this.count;
    if (this.count > 0) {
      this.offsetAttr.needsUpdate = true;
      this.dataAttr.needsUpdate = true;
      this.colorAttr.needsUpdate = true;
    }
  }

  /** Swap-remove particle i with the last one. */
  private kill(i: number): void {
    const last = --this.count;
    if (i === last) return;
    this.p.copyWithin(i * 6, last * 6, last * 6 + 6);
    this.l.copyWithin(i * 10, last * 10, last * 10 + 10);
    this.c.copyWithin(i * 3, last * 3, last * 3 + 3);
  }
}
