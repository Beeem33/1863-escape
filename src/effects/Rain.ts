import * as THREE from 'three';
import { WeatherConfig } from '../config/WeatherConfig';

const VERT = /* glsl */ `
  attribute vec3 seed;   // 0..1 position in the rain box
  attribute float tip;   // 0 = bottom of the streak, 1 = top
  uniform float uTime;
  uniform vec3 uCam;
  uniform vec3 uBox;
  uniform vec2 uWind;
  uniform float uSpeed;
  uniform float uLength;
  varying float vTip;
  varying float vDist;
  void main() {
    vec3 fall = vec3(uWind.x, -uSpeed, uWind.y);
    // Each drop falls through a box that wraps around the camera, so the
    // same few thousand drops make endless rain wherever you are.
    vec3 p = seed * uBox + fall * uTime;
    p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;
    p -= normalize(fall) * uLength * tip;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vTip = tip;
    vDist = -mv.z;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vTip;
  varying float vDist;
  void main() {
    // Brighter head, fading tail; drops very close or far fade out.
    float a = uOpacity * mix(1.0, 0.15, vTip) * smoothstep(0.4, 1.6, vDist) * (1.0 - smoothstep(14.0, 22.0, vDist));
    gl_FragColor = vec4(uColor, a);
  }
`;

/**
 * Rain streaks: one LineSegments draw call. Drop positions are animated
 * entirely on the GPU; intensity changes how many drops are drawn.
 */
export class Rain {
  readonly mesh: THREE.LineSegments;
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private time = 0;

  constructor(scene: THREE.Scene) {
    const n = WeatherConfig.maxDrops;
    const seeds = new Float32Array(n * 2 * 3);
    const tips = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const x = Math.random();
      const y = Math.random();
      const z = Math.random();
      seeds.set([x, y, z, x, y, z], i * 6);
      tips[i * 2 + 1] = 1;
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    this.geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 3));
    this.geometry.setAttribute('tip', new THREE.BufferAttribute(tips, 1));
    this.geometry.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uBox: { value: new THREE.Vector3(36, 18, 36) },
        uWind: { value: new THREE.Vector2() },
        uSpeed: { value: 17 },
        uLength: { value: 0.75 },
        uColor: { value: new THREE.Color(0xb8bec4) },
        uOpacity: { value: 0.35 },
      },
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.LineSegments(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 22;
    this.mesh.name = 'rain';
    scene.add(this.mesh);
  }

  /** @param intensity 0..1  @param wind sideways drift multiplier  @param light scene brightness tint */
  update(dt: number, camera: THREE.Camera, intensity: number, wind: number, light: number): void {
    this.time += dt;
    const drops = Math.floor(WeatherConfig.maxDrops * Math.min(1, intensity));
    this.geometry.setDrawRange(0, drops * 2);
    this.mesh.visible = drops > 0;
    if (!this.mesh.visible) return;
    const u = this.material.uniforms;
    u.uTime.value = this.time;
    (u.uCam.value as THREE.Vector3).copy(camera.position);
    (u.uWind.value as THREE.Vector2).set(1.6 * wind, 0.6 * wind);
    u.uOpacity.value = 0.18 + 0.25 * intensity;
    (u.uColor.value as THREE.Color).setRGB(0.55 + 0.4 * light, 0.57 + 0.4 * light, 0.6 + 0.4 * light);
  }
}
