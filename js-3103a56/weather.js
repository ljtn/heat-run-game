// Changing weather (clear / cloudy / rain / fog), a cloud layer, rain, and flocks of birds.
import * as THREE from 'three';
import { WATER } from './world.js';

const STATES = {
  clear: { cloud: 0.18, rain: 0, fog: 0, low: 0.12, label: 'CLEAR SKIES' },
  cloudy: { cloud: 0.75, rain: 0, fog: 0.15, low: 0.6, label: 'CLOUDING OVER' },
  rain: { cloud: 0.95, rain: 1, fog: 0.35, low: 0.8, label: 'RAIN' },
  fog: { cloud: 0.55, rain: 0, fog: 1, low: 1, label: 'FOG ROLLING IN' },
};
const NEXT = { clear: ['clear', 'cloudy', 'cloudy', 'fog'], cloudy: ['clear', 'rain', 'rain', 'fog'], rain: ['cloudy', 'cloudy', 'rain'], fog: ['clear', 'cloudy'] };

const CLOUD_VS = `
varying vec3 vWorld;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const CLOUD_FS = `
uniform float uTime, uCover; uniform vec3 uColor, uShade; uniform vec3 uCam;
varying vec3 vWorld;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec2 p = vWorld.xz / 900.0 + vec2(uTime * 0.004, uTime * 0.0025);
  float d = fbm(p) * 0.75 + fbm(p * 3.1 + 7.0) * 0.25;
  float c = smoothstep(1.0 - uCover - 0.12, 1.0 - uCover + 0.28, d);
  float dist = length(vWorld.xz - uCam.xz);
  c *= 1.0 - smoothstep(2500.0, 4200.0, dist);
  vec3 col = mix(uColor, uShade, smoothstep(0.3, 1.0, d) * 0.6 + uCover * 0.3);
  gl_FragColor = vec4(col, c * 0.92);
}`;

const LOW_FS = `
uniform float uTime, uAmt, uScale, uSpeed; uniform vec3 uColor; uniform vec2 uCenter;
varying vec3 vWorld;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n(p); p *= 2.07; a *= 0.5; } return s; }
void main() {
  vec2 p = vWorld.xz / (160.0 * uScale) + vec2(uTime * 0.012 * uSpeed, -uTime * 0.007 * uSpeed);
  float d = fbm(p);
  float c = smoothstep(0.62 - uAmt * 0.32, 0.95 - uAmt * 0.2, d) * uAmt;
  c *= 1.0 - smoothstep(380.0, 700.0, length(vWorld.xz - uCenter)); // a bank over downtown, fading at the edges
  gl_FragColor = vec4(uColor, c * 0.85);
}`;

export class Weather {
  constructor(scene, atmo, mats, world) {
    this.scene = scene;
    this.atmo = atmo;
    this.mats = mats;
    this.world = world;
    this.state = 'clear';
    this.cur = { ...STATES.clear };
    this.timer = 150 + Math.random() * 120;
    this.time = 0;
    this.onChange = null;
    // cloud layer
    this.cloudMat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      uniforms: { uTime: { value: 0 }, uCover: { value: 0.2 }, uColor: { value: new THREE.Color(1, 1, 1) }, uShade: { value: new THREE.Color(0.5, 0.5, 0.55) }, uCam: { value: new THREE.Vector3() } },
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(Math.PI / 2), this.cloudMat);
    this.clouds.position.y = 650;
    this.clouds.renderOrder = -1;
    scene.add(this.clouds);
    // rain streaks in a box around the camera
    const N = 2600;
    this.rainN = N;
    this.rainPos = new Float32Array(N * 6);
    this.rainSeed = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { this.rainSeed[i * 3] = (Math.random() - 0.5) * 70; this.rainSeed[i * 3 + 1] = Math.random() * 40; this.rainSeed[i * 3 + 2] = (Math.random() - 0.5) * 70; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rainMat = new THREE.LineBasicMaterial({ color: 0xb8c4d0, transparent: true, opacity: 0, depthWrite: false });
    this.rain = new THREE.LineSegments(g, this.rainMat);
    this.rain.frustumCulled = false;
    scene.add(this.rain);
    // wet roads: remember the dry look
    this.roadMats = Object.keys(mats).filter((k) => k.startsWith('road_')).map((k) => mats[k]);
    this.dry = this.roadMats.map((m) => ({ r: m.roughness, c: m.color.clone() }));
    this.fogGrey = new THREE.Color(0x8d9399);
    this.tmpC = new THREE.Color();
    this.birds = new Birds(scene, world);
    // low cloud banks hanging around the skyscraper tops over downtown
    this.lowMats = [];
    this.mistT = 60 + Math.random() * 120;
    this.mist = 0;
    for (const [y, sc, sp] of [[105, 1.0, 1.0], [128, 1.25, 0.8], [152, 1.5, 0.6]]) {
      const m = new THREE.ShaderMaterial({
        vertexShader: CLOUD_VS, fragmentShader: LOW_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
        uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uScale: { value: sc }, uSpeed: { value: sp }, uColor: { value: new THREE.Color(1, 1, 1) }, uCenter: { value: new THREE.Vector2(world.downtown.x, world.downtown.z) } },
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500).rotateX(Math.PI / 2), m);
      plane.position.set(world.downtown.x, y, world.downtown.z);
      plane.renderOrder = 7;
      scene.add(plane);
      this.lowMats.push(m);
    }
  }

  setState(s) {
    if (s === this.state) return;
    this.state = s;
    if (this.onChange) this.onChange(STATES[s].label);
  }

  // apply on top of the time-of-day preset
  update(dt, camera, night) {
    this.time += dt;
    this.timer -= dt;
    if (this.timer <= 0) {
      const opts = NEXT[this.state];
      this.setState(opts[Math.floor(Math.random() * opts.length)]);
      this.timer = 120 + Math.random() * 180;
    }
    const T = STATES[this.state], k = Math.min(1, dt / 25);
    for (const key of ['cloud', 'rain', 'fog', 'low']) this.cur[key] += (T[key] - this.cur[key]) * k;
    // random misty spells around the towers, whatever the weather
    this.mistT -= dt;
    if (this.mistT <= 0) { this.mistTarget = this.mistTarget > 0 ? 0 : 0.6 + Math.random() * 0.4; this.mistT = this.mistTarget > 0 ? 50 + Math.random() * 70 : 90 + Math.random() * 180; }
    this.mist += ((this.mistTarget || 0) - this.mist) * Math.min(1, dt / 20);
    const { cloud, rain, fog } = this.cur;
    const P = this.atmo.preset;
    if (!P) return;
    const A = this.atmo;
    A.sun.intensity = P.sunI * (1 - 0.7 * Math.max(0, cloud - 0.2));
    A.hemi.intensity = P.hemiI * (1 - 0.15 * cloud);
    this.scene.fog.density = P.fogD * (1 + 0.8 * cloud + 2.8 * fog);
    this.tmpC.set(P.fog);
    if (!P.night) this.tmpC.lerp(this.fogGrey, Math.min(0.75, cloud * 0.5 + fog * 0.5));
    this.scene.fog.color.copy(this.tmpC);
    // clouds
    const u = this.cloudMat.uniforms;
    u.uTime.value = this.time;
    u.uCover.value = 0.15 + cloud * 0.7;
    u.uColor.value.set(P.night ? 0x1a2030 : P.sun).lerp(this.tmpC.set(0xffffff), P.night ? 0 : 0.55).multiplyScalar(P.night ? 0.6 : 1.0 - cloud * 0.35);
    u.uShade.value.set(P.night ? 0x0b0f18 : 0x6a6e78);
    u.uCam.value.copy(camera.position);
    this.clouds.position.x = camera.position.x; this.clouds.position.z = camera.position.z;
    // low cloud around the towers
    const low = Math.min(1, Math.max(this.cur.low, this.mist));
    for (const m of this.lowMats) {
      m.uniforms.uTime.value = this.time;
      m.uniforms.uAmt.value = low;
      m.uniforms.uColor.value.set(P.night ? 0x2a3040 : 0xffffff).lerp(this.tmpC.set(P.fog), P.night ? 0.3 : 0.35).multiplyScalar(P.night ? 0.8 : 1 - cloud * 0.2);
    }
    // wet roads
    this.roadMats.forEach((m, i) => {
      m.roughness = this.dry[i].r * (1 - 0.6 * rain);
      m.color.copy(this.dry[i].c).multiplyScalar(1 - 0.35 * rain);
    });
    this.world.weatherGrip = 1 - 0.18 * rain;
    // rain streaks
    this.rainMat.opacity = 0.55 * rain;
    this.rain.visible = rain > 0.02;
    if (this.rain.visible) {
      const c = camera.position, p = this.rainPos, s = this.rainSeed;
      const fall = (this.time * 22) % 40;
      for (let i = 0; i < this.rainN; i++) {
        const x = c.x + s[i * 3], z = c.z + s[i * 3 + 2];
        let y = c.y + 20 - ((s[i * 3 + 1] + fall) % 40);
        p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z;
        p[i * 6 + 3] = x + 0.08; p[i * 6 + 4] = y - 0.9; p[i * 6 + 5] = z + 0.05;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    this.birds.update(dt, camera, night || rain > 0.6);
  }
}

// flapping birds: one instanced mesh, wings flap in the vertex shader
class Birds {
  constructor(scene, world) {
    this.world = world;
    const g = new THREE.BufferGeometry();
    // body + two wings as a shallow V
    const v = [0, 0, -0.35, 0, 0, 0.45, -1.1, 0.05, 0.05, 0, 0, -0.35, 1.1, 0.05, 0.05, 0, 0, 0.45];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    this.flocks = [];
    const nF = 7, perF = 14;
    this.count = nF * perF;
    const phase = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) phase[i] = Math.random() * 6.28;
    g.setAttribute('phase', new THREE.InstancedBufferAttribute(phase, 1));
    this.mat = new THREE.MeshBasicMaterial({ color: 0x1d1d22, side: THREE.DoubleSide, fog: true });
    this.time = { value: 0 };
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time;
      sh.vertexShader = 'attribute float phase;\nuniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n transformed.y += abs(position.x) * sin(uTime * 9.0 + phase) * 0.75;');
    };
    this.mesh = new THREE.InstancedMesh(g, this.mat, this.count);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    for (let f = 0; f < nF; f++) {
      const members = [];
      for (let k = 0; k < perF; k++) members.push({ ox: (Math.random() - 0.5) * 18, oy: (Math.random() - 0.5) * 6, oz: (Math.random() - 0.5) * 18, w: Math.random() * 6.28 });
      this.flocks.push({ cx: 0, cz: 0, alt: 40 + Math.random() * 70, r: 50 + Math.random() * 110, ang: Math.random() * 6.28, spd: (0.12 + Math.random() * 0.15) * (Math.random() < 0.5 ? 1 : -1), members, placed: false, scale: 0.55 + Math.random() * 0.35 });
    }
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(); this.e = new THREE.Euler();
    this.vis = 1;
  }

  update(dt, camera, hide) {
    this.time.value += dt;
    this.vis += ((hide ? 0 : 1) - this.vis) * Math.min(1, dt * 0.5);
    this.mesh.visible = this.vis > 0.02;
    if (!this.mesh.visible) return;
    const cam = camera.position;
    let i = 0;
    for (const F of this.flocks) {
      // keep each flock's circle within ~450 m of the camera; re-seat far ones somewhere new
      if (!F.placed || Math.hypot(F.cx - cam.x, F.cz - cam.z) > 520) {
        const a = Math.random() * 6.28, d = 120 + Math.random() * 280;
        F.cx = cam.x + Math.cos(a) * d; F.cz = cam.z + Math.sin(a) * d; F.placed = true;
      }
      F.ang += F.spd * dt;
      const fx = F.cx + Math.cos(F.ang) * F.r, fz = F.cz + Math.sin(F.ang) * F.r;
      const ground = Math.max(this.world.waterLevelAt(fx, fz), this.world.terrainHeight(fx, fz));
      const heading = F.ang + (F.spd > 0 ? Math.PI / 2 : -Math.PI / 2);
      for (const m of F.members) {
        m.w += dt * 0.8;
        this.p.set(fx + m.ox + Math.sin(m.w) * 3, ground + F.alt + m.oy + Math.sin(m.w * 1.3) * 1.5, fz + m.oz + Math.cos(m.w) * 3);
        this.q.setFromEuler(this.e.set(0, -heading, Math.sin(m.w) * 0.2));
        const sc = F.scale * this.vis;
        this.m4.compose(this.p, this.q, this.s.set(sc, sc, sc));
        this.mesh.setMatrixAt(i++, this.m4);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
