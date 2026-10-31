// Sky, sun, fog and time-of-day presets
import * as THREE from 'three';
import { Sky } from '../lib/addons/objects/Sky.js';

export const PRESETS = {
  dusk: {
    label: 'Golden Hour', elev: 3.2, azim: 238, turbidity: 10, rayleigh: 3.2, mie: 0.008, mieG: 0.88,
    exposure: 0.66, sun: 0xff9d5c, sunI: 2.9, hemiSky: 0xa9b8d8, hemiGround: 0x6a5240, hemiI: 0.75,
    fog: 0xd89a70, fogD: 0.0013, lights: 0.55, envI: 0.75, night: false, smoke: 0xd9c4b4,
  },
  day: {
    label: 'Afternoon', elev: 38, azim: 160, turbidity: 3.2, rayleigh: 1.1, mie: 0.004, mieG: 0.8,
    exposure: 0.48, sun: 0xfff1de, sunI: 3.4, hemiSky: 0xbcd3f0, hemiGround: 0x5d5a45, hemiI: 0.85,
    fog: 0xbfd2e2, fogD: 0.00085, lights: 0.0, envI: 0.9, night: false, smoke: 0xe8e8e8,
  },
  night: {
    label: 'Midnight', elev: 28, azim: 70, turbidity: 1, rayleigh: 0.2, mie: 0.002, mieG: 0.8,
    exposure: 1.05, sun: 0x8ea6e0, sunI: 0.32, hemiSky: 0x2c3c66, hemiGround: 0x161616, hemiI: 0.3,
    fog: 0x0d1424, fogD: 0.0017, lights: 1.0, envI: 0.35, night: true, smoke: 0x6a7080,
  },
};

const NIGHT_VS = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const NIGHT_FS = `
varying vec3 vDir;
uniform vec3 uMoonDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 horizon = vec3(0.05, 0.075, 0.12);
  vec3 zenith = vec3(0.004, 0.008, 0.022);
  vec3 col = mix(horizon, zenith, pow(max(h, 0.0), 0.45));
  // city glow near the horizon
  col += vec3(0.09, 0.06, 0.035) * exp(-max(h, 0.0) * 18.0);
  // stars
  vec3 g = floor(d * 420.0);
  float s = hash(g);
  float star = step(0.9975, s) * smoothstep(0.0, 0.25, h) * (0.5 + 0.5 * hash(g + 3.1));
  col += vec3(star) * 1.6;
  // moon
  float m = dot(d, normalize(uMoonDir));
  col += vec3(0.9, 0.92, 1.0) * smoothstep(0.9993, 0.9996, m) * 3.0;
  col += vec3(0.25, 0.3, 0.45) * pow(max(m, 0.0), 90.0) * 0.6;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Atmosphere {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.sky = new Sky();
    this.sky.scale.setScalar(20000);
    scene.add(this.sky);
    this.nightSky = new THREE.Mesh(new THREE.SphereGeometry(15000, 32, 16), new THREE.ShaderMaterial({
      vertexShader: NIGHT_VS, fragmentShader: NIGHT_FS, side: THREE.BackSide, depthWrite: false,
      uniforms: { uMoonDir: { value: new THREE.Vector3(0.5, 0.45, -0.6) } },
    }));
    this.nightSky.visible = false;
    scene.add(this.nightSky);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 900;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xffffff, 0.001);
    this.sunDir = new THREE.Vector3();
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this.preset = null;
  }

  apply(name) {
    const P = PRESETS[name];
    this.preset = P;
    this.name = name;
    const phi = THREE.MathUtils.degToRad(90 - P.elev), theta = THREE.MathUtils.degToRad(P.azim);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    const u = this.sky.material.uniforms;
    u.turbidity.value = P.turbidity; u.rayleigh.value = P.rayleigh;
    u.mieCoefficient.value = P.mie; u.mieDirectionalG.value = P.mieG;
    u.sunPosition.value.copy(this.sunDir);
    this.sky.visible = !P.night;
    this.nightSky.visible = P.night;
    this.nightSky.material.uniforms.uMoonDir.value.copy(this.sunDir);
    this.sun.color.set(P.sun);
    this.sun.intensity = P.sunI;
    this.hemi.color.set(P.hemiSky);
    this.hemi.groundColor.set(P.hemiGround);
    this.hemi.intensity = P.hemiI;
    this.scene.fog.color.set(P.fog);
    this.scene.fog.density = P.fogD;
    this.renderer.toneMappingExposure = P.exposure;
    // environment map from the sky only
    const envScene = new THREE.Scene();
    const clone = P.night ? this.nightSky.clone() : this.sky.clone();
    clone.visible = true;
    envScene.add(clone);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(envScene, 0, 1, 30000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = P.envI;
    return P;
  }

  follow(target) {
    // keep the shadow frustum centred on the player, snapped to texels to avoid shimmer
    const step = 150 / 2048;
    const x = Math.round(target.x / step) * step, z = Math.round(target.z / step) * step;
    this.sun.target.position.set(x, target.y, z);
    this.sun.position.set(x + this.sunDir.x * 400, target.y + Math.max(this.sunDir.y, 0.12) * 400, z + this.sunDir.z * 400);
    this.sky.position.copy(target);
    this.nightSky.position.copy(target);
  }
}
