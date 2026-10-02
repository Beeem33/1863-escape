import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { AtmosphereSettings } from '../maps/MapDefinition';

/**
 * Cinematic grade applied after tone mapping: lift/gain colour grade,
 * contrast, saturation, vignette, film grain, plus gameplay overlays —
 * a red-dark pulse at the edges when the pursuers are close, desaturation
 * when exhausted, an impact flash, and the fade to black.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    aspect: { value: 1 },
    gain: { value: new THREE.Vector3(1, 1, 1) },
    lift: { value: new THREE.Vector3(0, 0, 0) },
    saturation: { value: 1 },
    contrast: { value: 1 },
    vignette: { value: 0.35 },
    grain: { value: 0.035 },
    danger: { value: 0 },
    desat: { value: 0 },
    flash: { value: 0 },
    fade: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, aspect, saturation, contrast, vignette, grain, danger, desat, flash, fade;
    uniform vec3 gain, lift;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = c * gain + lift * (1.0 - c);
      c = (c - 0.5) * contrast + 0.5;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, saturation * (1.0 - desat * 0.65));

      vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
      float r = length(q);
      float vig = smoothstep(0.35, 1.05, r);
      c *= 1.0 - vig * vignette;

      // Pursuers close: the edges darken and redden, pulsing like a heartbeat.
      float beat = 0.75 + 0.25 * sin(time * 7.5) * sin(time * 3.75);
      c = mix(c, c * vec3(0.55, 0.16, 0.1), smoothstep(0.25, 0.95, r) * danger * beat);

      // Impact.
      c = mix(c, vec3(0.45, 0.1, 0.05), flash * smoothstep(0.1, 0.9, r) * 0.8);
      c += flash * 0.06;

      c += (hash(vUv * 1024.0 + fract(time) * 37.0) - 0.5) * grain;
      c *= 1.0 - fade;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

export class PostProcessing {
  readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly grade: ShaderPass;
  private bloomEnabled = true;
  /** Gameplay overlays, 0..1 — set by the Game. */
  danger = 0;
  desaturate = 0;
  flash = 0;
  fade = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.55, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  setBloom(on: boolean): void {
    this.bloomEnabled = on;
    this.bloom.enabled = on;
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    // Bloom at half resolution is plenty and much cheaper.
    this.bloom.resolution.set(w / 2, h / 2);
    this.grade.uniforms.aspect.value = w / h;
  }

  update(dt: number, a: AtmosphereSettings): void {
    const u = this.grade.uniforms;
    u.time.value += dt;
    (u.gain.value as THREE.Vector3).set(...a.grade.gain);
    (u.lift.value as THREE.Vector3).set(...a.grade.lift);
    u.saturation.value = a.grade.saturation;
    u.contrast.value = a.grade.contrast;
    u.vignette.value = a.grade.vignette;
    u.danger.value = this.danger;
    u.desat.value = this.desaturate;
    u.flash.value = this.flash;
    u.fade.value = this.fade;
    this.bloom.strength = this.bloomEnabled ? a.bloom * 0.75 : 0;
    this.flash = Math.max(0, this.flash - dt * 2.2);
  }

  render(): void {
    this.composer.render();
  }
}
