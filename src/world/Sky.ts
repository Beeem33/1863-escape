import * as THREE from 'three';

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    gl_Position.z = gl_Position.w; // pin to the far plane
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 sunColor;
  uniform vec3 sunGlow;
  uniform vec3 sunDir;
  uniform vec3 cloudColor;
  uniform float clouds;
  uniform float time;
  uniform vec3 fogColor;
  varying vec3 vDir;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.y;
    // Sky gradient: horizon band blends up to the zenith.
    float t = pow(clamp(h, 0.0, 1.0), 0.45);
    vec3 col = mix(horizon, zenith, t);
    // Below the horizon: fade into fog colour (hidden by terrain mostly).
    col = mix(col, fogColor, smoothstep(0.02, -0.12, h));

    // Sun disc and glow.
    float sd = max(dot(dir, sunDir), 0.0);
    col += sunGlow * pow(sd, 6.0) * 0.55;
    col += sunGlow * pow(sd, 48.0) * 0.6;
    col += sunColor * smoothstep(0.9993, 0.9997, sd) * 6.0;

    // Clouds on a virtual plane.
    if (h > 0.0 && clouds > 0.0) {
      vec2 uv = dir.xz / (h + 0.12) * 1.4 + vec2(time * 0.006, time * 0.003);
      float n = fbm(uv);
      float cover = smoothstep(1.0 - clouds, 1.0 - clouds + 0.35, n);
      float lit = pow(sd, 3.0);
      vec3 cc = mix(cloudColor, cloudColor * 1.3 + sunGlow * 0.4, lit);
      float fade = smoothstep(0.0, 0.18, h);
      col = mix(col, cc, cover * 0.85 * fade);
    }
    // Horizon haze toward the fog colour.
    col = mix(col, fogColor, (1.0 - smoothstep(0.0, 0.22, h)) * 0.6);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Procedural sky dome: gradient, sun disc + glow, drifting clouds. Follows the camera. */
export class Sky {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    zenith: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    sunColor: { value: new THREE.Color() },
    sunGlow: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    cloudColor: { value: new THREE.Color() },
    clouds: { value: 0.3 },
    time: { value: 0 },
    fogColor: { value: new THREE.Color() },
  };

  constructor() {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'sky';
  }
}
