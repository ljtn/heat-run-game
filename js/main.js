import * as THREE from 'three';
import { EffectComposer } from '../lib/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../lib/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../lib/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../lib/addons/postprocessing/OutputPass.js';
import { ShaderPass } from '../lib/addons/postprocessing/ShaderPass.js';
import { World, CITY, WATER, SURF } from './world.js';
import { buildWorldMeshes } from './worldMesh.js';
import { Vehicle } from './vehicle.js';
import { deformCar, repairCar, breakCarParts, headlightMaterial, paintMaterial } from './carModel.js';
import { CollisionSystem } from './collisions.js';
import { TrafficManager } from './ai.js';
import { Effects } from './effects.js';
import { AudioEngine } from './audio.js';
import { MusicSystem } from './music.js';
import { WallFixtures } from './fixtures.js';
import { Aircraft } from './aircraft.js';
import { setCarLod } from './carLod.js';
import { Loot } from './loot.js';
import { Animals } from './animals.js';
import { HUD, fmtTime } from './hud.js';
import { CameraRig, CAM_MODES } from './camera.js';
import { Input } from './input.js';
import { Atmosphere, PRESETS } from './sky.js';
import { PropSystem, buildShopSigns, buildAlleyDressing } from './props.js';
import { Weather } from './weather.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 1.0 }, uLift: { value: new THREE.Color(1, 1, 1) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform vec3 uLift;
    varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime*17.0) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(d * vec2(1.0, 0.8)));
      c.rgb *= mix(1.0, v, 0.55 * uVig);
      c.rgb *= uLift;
      float g = (rnd(vUv * 900.0) - 0.5) * 0.035;
      c.rgb += g * (0.3 + c.rgb);
      gl_FragColor = c;
    }`,
};

const STARTS = [
  { key: 'downtown', label: 'DOWNTOWN', desc: 'Towers, traffic, expressways' },
  { key: 'oldtown', label: 'OLD TOWN', desc: 'Steep streets on the hill', x: -1630, z: -46 },
  { key: 'river', label: 'RIVERSIDE', desc: 'The east bank highways', x: -236, z: 100 },
  { key: 'ashford', label: 'ASHFORD', desc: 'Village in the hills', x: 700, z: -900 },
  { key: 'lakeview', label: 'LAKEVIEW', desc: 'Lakeside village', x: 1050, z: 550 },
  { key: 'harlow', label: 'HARLOW', desc: 'Farm country', x: -950, z: 1150 },
  { key: 'millbrook', label: 'MILLBROOK', desc: 'Mountain hamlet', x: -1250, z: -1250 },
  { key: 'ridge', label: 'HIGH RIDGE', desc: 'Ridge road', x: 1380, z: -520 },
];
const PAINT_NAMES = ['MAHOGANY', 'CANDY RED', 'MIDNIGHT BLUE', 'OLIVE DRAB', 'GOLDENROD', 'GLOSS BLACK', 'CREAM'];
const TOD_ICON = { dusk: 'linear-gradient(135deg,#ffb36b,#e0603a)', day: 'linear-gradient(135deg,#fff3b0,#f2c14a)', night: 'linear-gradient(135deg,#9fb6ff,#2b3b7a)' };
const PAINTS = [0x5a2a1a, 0x7a1414, 0x1d2f4a, 0x3c4a2a, 0xc08a22, 0x111111, 0xd9cfb4];
const QUALITY = { LOW: { pr: 0.75, shadow: 1024 }, MEDIUM: { pr: 1, shadow: 2048 }, HIGH: { pr: 1.5, shadow: 2048 } };
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();

class Game {
  constructor() {
    this.started = false;
    this.paused = false;
    this.state = 'drive';
    this.stateT = 0;
    this.showMap = false;
    this.tod = 'dusk';
    this.paint = PAINTS[0];
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.quality = this.isTouch ? 'LOW' : 'MEDIUM';
    this.cars = [];
    this.falling = [];
    this.resetCool = 0;
    this.time = 0;
    this.fpsAcc = 0; this.fpsN = 0;
  }

  async init() {
    const canvas = document.getElementById('c');
    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY[this.quality].pr));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 3200);
    this.buildMenu();

    const progress = (txt, f) => {
      document.getElementById('loadtxt').textContent = txt + '…';
      document.querySelector('#loadbar > div').style.width = `${f * 100}%`;
    };
    const world = (this.world = new World());
    await world.build(progress);
    progress('Building meshes', 0.75);
    await new Promise((r) => setTimeout(r, 0));
    this.meshes = buildWorldMeshes(world, scene);
    this.props = new PropSystem(world, scene);
    buildShopSigns(world, scene, this.meshes.mats);
    buildAlleyDressing(world, scene, this.meshes.mats);
    this.fixtures = new WallFixtures(world, scene);
    this.atmo = new Atmosphere(renderer, scene);
    this.effects = new Effects(scene);
    this.collisions = new CollisionSystem(world);
    this.audio = new AudioEngine();
    this.music = new MusicSystem(this.audio, world);
    this.aircraft = new Aircraft(scene, this.audio, world);
    this.loot = new Loot(world, scene);
    this.animals = new Animals(world, scene, this.effects, this.audio);
    this.score = { banked: 0, carried: 0, combo: 0, comboT: 0, best: +(localStorage.getItem('heatrun.best') || 0) };
    progress('Drawing maps', 0.88);
    await new Promise((r) => setTimeout(r, 0));
    this.hud = new HUD(world);
    this.input = new Input();
    this.camRig = new CameraRig(this.camera, world);
    this.traffic = new TrafficManager(world, scene, this);

    // player
    this.player = new Vehicle(world, 'muscle', this.paint, 'plain');
    scene.add(this.player.root);
    this.cars.push(this.player);
    // two real headlight beams (left/right), wide and long; each goes dark if its lamps are smashed
    this.spots = [-1, 1].map((s) => {
      const sp = new THREE.SpotLight(0xfff1dc, 0, 190, 0.78, 0.6, 1.15);
      sp.position.set(s * 0.75, 0.1, -2.4);
      const tgt = new THREE.Object3D();
      tgt.position.set(s * 4, -2.6, -34);
      this.player.root.add(sp, tgt);
      sp.target = tgt;
      sp.userData.side = s;
      return sp;
    });
    this.spot = this.spots[0];
    this.copLights = [0, 1].map(() => {
      const l = new THREE.PointLight(0xff0000, 0, 40, 1.8);
      scene.add(l);
      return l;
    });

    this.weather = new Weather(scene, this.atmo, this.meshes.mats, world);
    this.weather.onChange = (label) => this.started && this.hud.message(label, 2.5, 'crime');
    // bark scars and falling trees
    this.scars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.42, 0.05), new THREE.MeshStandardMaterial({ color: 0xc8a878, roughness: 0.9 }), 240);
    for (let i = 0; i < 240; i++) this.scars.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    this.scars.frustumCulled = false;
    scene.add(this.scars);
    this.scarNext = 0;
    this.scarM4 = new THREE.Matrix4();
    this.fallingTrees = [];
    this.setupCollisionEvents();
    this.spawnAtStart();
    // parked cars in the garages: real cars with the handbrake on, asleep until you come close
    const PCOL = [0xb8872a, 0x5d6b2c, 0xb5541f, 0x6b4a2e, 0xd9cfb4, 0x8fb2c9, 0x7a1f1f, 0x2e3a52, 0x9a9a8e, 0x1a1a1a];
    this.parked = world.parkedCars.map((p) => {
      const v = new Vehicle(world, p.type, PCOL[Math.floor(Math.random() * PCOL.length)], p.type === 'taxi' ? 'taxi' : 'plain');
      v.resetTo(p.x, p.y, p.z, p.heading, 0);
      v.input.handbrake = 1; v.input.brake = 1;
      v.sleeping = true;
      v.parked = true;
      scene.add(v.root);
      this.cars.push(v);
      return v;
    });

    // post-processing
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, this.camera));
    // safety net: scrub any NaN/inf pixel before bloom blurs it into a big black block
    this.composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { vec4 c = texture2D(tDiffuse, vUv); if (!(c.r == c.r && c.g == c.g && c.b == c.b) || max(c.r, max(c.g, c.b)) > 6.0e4) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 6.0e4), c.a); }',
    }));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.35, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.applyTod(this.tod);

    addEventListener('resize', () => this.resize());
    progress('Ready', 1);
    // warm up shaders
    this.camRig.update(0.016, this.player, false);
    renderer.compile(scene, this.camera);
    const go = document.getElementById('go');
    go.disabled = false;
    document.getElementById('golabel').textContent = 'DRIVE';
    document.getElementById('loadtxt').textContent = '';
    go.onclick = () => this.start();
    addEventListener('keydown', (e) => { if (!this.started && e.code === 'Enter' && !go.disabled) this.start(); });
    this.clock = new THREE.Clock();
    renderer.setAnimationLoop(() => this.frame());
  }

  buildMenu() {
    const best = +(localStorage.getItem('heatrun.best') || 0);
    document.getElementById('bestline').textContent = best > 0 ? `BEST HAUL $${best.toLocaleString('en-US')}` : '';
    const ss = document.getElementById('startsel');
    this.startAt = STARTS[0];
    for (const s of STARTS) {
      const b = document.createElement('button');
      b.innerHTML = `<b>${s.label}</b><small>${s.desc}</small>`;
      b.className = 'card' + (s === this.startAt ? ' sel' : '');
      b.onclick = () => {
        this.startAt = s;
        [...ss.children].forEach((c) => c.classList.remove('sel')); b.classList.add('sel');
        if (this.player && !this.started) this.spawnAtStart();
      };
      ss.appendChild(b);
    }
    const tod = document.getElementById('todsel');
    for (const k of Object.keys(PRESETS)) {
      const b = document.createElement('button');
      b.innerHTML = `<span class="ico" style="background:${TOD_ICON[k] || '#888'}"></span>${PRESETS[k].label.toUpperCase()}`;
      b.className = k === this.tod ? 'sel' : '';
      b.onclick = () => { this.tod = k; [...tod.children].forEach((c) => c.classList.remove('sel')); b.classList.add('sel'); if (this.atmo) this.applyTod(k); };
      tod.appendChild(b);
    }
    const ps = document.getElementById('paintsel');
    PAINTS.forEach((p, i) => {
      const b = document.createElement('button');
      b.className = 'sw' + (i === 0 ? ' sel' : '');
      b.style.background = '#' + p.toString(16).padStart(6, '0');
      b.title = PAINT_NAMES[i];
      b.onclick = () => {
        this.paint = p;
        document.getElementById('paintname').textContent = PAINT_NAMES[i];
        [...ps.children].forEach((c) => c.classList.remove('sel')); b.classList.add('sel');
        if (this.player) this.repaint(p);
      };
      ps.appendChild(b);
    });
    document.getElementById('paintname').textContent = PAINT_NAMES[0];
    const qs = document.getElementById('qualsel');
    for (const k of Object.keys(QUALITY)) {
      const b = document.createElement('button');
      b.textContent = k;
      b.className = k === this.quality ? 'sel' : '';
      b.onclick = () => { this.quality = k; [...qs.children].forEach((c) => c.classList.remove('sel')); b.classList.add('sel'); if (this.composer) this.resize(); };
      qs.appendChild(b);
    }
  }

  repaint(hex) {
    const mat = paintMaterial(hex);
    for (const mesh of this.player.car.paintMeshes) mesh.material = mat;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.camera.clearViewOffset(); this.menuView = false;
    document.getElementById('menu').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    document.getElementById('touch').classList.add('on');
    if (this.isTouch) {
      // go full screen and sideways where the browser allows it
      const de = document.documentElement;
      (de.requestFullscreen || de.webkitRequestFullscreen || (() => Promise.resolve())).call(de)?.catch?.(() => {});
      screen.orientation?.lock?.('landscape').catch(() => {});
    }
    this.audio.init();
    this.hud.message('MERIDIAN CITY', 3, '', 0.3);
    this.hud.message('Drive. Break the law and the cops will chase you.', 4, 'crime', 1.2);
    this.camRig.first = true;
  }

  resize() {
    this.menuView = false; // re-frame the menu shot for the new size
    const q = QUALITY[this.quality];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, q.pr));
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(innerWidth, innerHeight);
    if (this.atmo.sun.shadow.mapSize.x !== q.shadow) {
      this.atmo.sun.shadow.mapSize.set(q.shadow, q.shadow);
      this.atmo.sun.shadow.map?.dispose();
      this.atmo.sun.shadow.map = null;
    }
  }

  applyTod(name) {
    this.tod = name;
    const P = this.atmo.apply(name);
    const L = P.lights;
    const m = this.meshes.mats;
    m.facades.forEach((f) => (f.emissiveIntensity = 0.95 * L));
    m.shop.emissiveIntensity = 0.12 + 1.6 * L;
    m.winLit.emissiveIntensity = 1.3 * L;
    m.lampHead.emissiveIntensity = 7 * L;
    if (m.signs) m.signs.emissiveIntensity = 0.35 + 2.4 * L;
    if (m.alleyLamp) m.alleyLamp.emissiveIntensity = 0.4 + 5 * L;
    m.shopLight.emissiveIntensity = 1.2 + 1.5 * L;
    if (m.garageLight) m.garageLight.emissiveIntensity = 1.5 + 2 * L;
    if (m.workshopSign) m.workshopSign.emissiveIntensity = 0.4 + 1.8 * L;
    if (m.billboard) m.billboard.emissiveIntensity = 0.12 + 0.9 * L;
    m.lampPool.opacity = 0.85 * L;
    m.lampPool.visible = L > 0.01;
    m.water.color.set(P.night ? 0x0c1a22 : 0x1e3f46);
    const lightsOn = L > 0.3;
    headlightMaterial().emissiveIntensity = lightsOn ? 5 : 0.3;
    this.spotPower = lightsOn ? 380 * L : 0;
    this.headlights = lightsOn;
    this.effects.setLight(new THREE.Color(P.smoke));
    this.bloom.strength = 0.22 + L * 0.5;
    this.bloom.threshold = P.night ? 0.75 : 0.92;
    this.grade.uniforms.uLift.value.set(...(name === 'dusk' ? [1.04, 0.99, 0.93] : name === 'night' ? [0.92, 0.98, 1.08] : [1.0, 1.0, 1.0]));
  }

  spawnAtStart() {
    const s = this.startAt;
    this.spawnPlayer(s && s.x !== undefined ? new THREE.Vector3(s.x, 0, s.z) : null);
  }

  spawnPlayer(near = null) {
    const w = this.world;
    let sp;
    if (!near) {
      const e = w.edges.find((e) => e.type === 'city' && w.nodes[e.a].id === w.cityNode(9, 7) && w.nodes[e.b].id === w.cityNode(10, 7));
      const ln = this.traffic.lane(e, 0);
      const p = ln.pts[2];
      sp = { x: p.x, z: p.z, y: p.y, heading: Math.atan2(-p.tx, -p.tz) };
    } else {
      sp = w.roadSpawnNear(near.x, near.z, 0, 2000);
    }
    const g = w.groundAt(sp.x, sp.z, (sp.y || 0) + 3).h;
    this.player.resetTo(sp.x, g, sp.z, sp.heading, 0);
    this.camRig.first = true;
  }

  setupCollisionEvents() {
    const C = this.collisions;
    C.onTreeHit = (c, v, px, pz, nx, nz, vn) => {
      const now = this.time;
      if ((c.hitT || 0) > now) return;
      c.hitT = now + 0.4;
      const t = c.tree;
      if (v.pos.distanceTo(this.camera.position) > 140) return;
      // bark scar where the car hit
      const sy = v.pos.y + 0.1 + Math.random() * 0.4;
      this.scarM4.compose(_v.set(c.x + nx * c.r * 0.9, sy, c.z + nz * c.r * 0.9), _q.setFromAxisAngle(UP, Math.atan2(nx, nz)), _w.set(1 + Math.random() * 0.5, 1 + Math.random() * 0.6, 1));
      this.scars.setMatrixAt(this.scarNext, this.scarM4);
      this.scars.instanceMatrix.needsUpdate = true;
      this.scarNext = (this.scarNext + 1) % this.scars.count;
      // branches and leaves come down, more for harder hits
      const top = t.y + 4.5 * t.s;
      // leafy green branches come down (a twig plus a clump of foliage), more for harder hits
      const nB = Math.min(9, 1 + Math.floor(vn / 1.8)), nL = Math.min(22, 5 + Math.floor(vn * 1.6));
      const green = t.type === 1 ? [0x22402a, 0x2f5233] : t.v === 5 ? [0xc8601a, 0xe8a030, 0xa83a14] : t.v === 4 ? [0x5a2a22, 0x6e3428] : t.v === 2 ? [0x7a9a3a, 0x9ab84a] : [0x3f6b2a, 0x4f7a30, 0x5f7f2e];
      for (let k = 0; k < nB; k++) {
        const a = Math.random() * 6.28, r = 0.8 + Math.random() * 1.6 * t.s;
        const x = c.x + Math.cos(a) * r, y = top - Math.random() * 1.5, z = c.z + Math.sin(a) * r;
        const vx = (Math.random() - 0.5) * 2 + nx, vz = (Math.random() - 0.5) * 2 + nz;
        const len = 0.6 + Math.random() * 1.0;
        this.props.debris.spawn(x, y, z, vx, -0.5, vz, 0.07, 0.07, len, 0x5a4430);
        const s = 0.45 + Math.random() * 0.45;
        this.props.debris.spawn(x + (Math.random() - 0.5) * 0.3, y + 0.15, z + (Math.random() - 0.5) * 0.3, vx, -0.3, vz, s, s * 0.6, s, green[k % green.length]);
      }
      for (let k = 0; k < nL; k++) {
        const a = Math.random() * 6.28, r = Math.random() * 2 * t.s, s = 0.12 + Math.random() * 0.18;
        this.props.debris.spawn(c.x + Math.cos(a) * r, top + Math.random() * 2, c.z + Math.sin(a) * r, (Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2,
          s, 0.02, s, t.type === 1 ? 0x2a4a2a : Math.random() < 0.5 ? 0x3f6b2a : 0x5f7f2e);
      }
      if (v === this.player) { this.audio.crash(Math.min(0.5, vn / 16)); this.camRig.addShake(Math.min(0.5, vn * 0.05)); }
    };
    C.onTreeSnap = (c, v, px, pz) => {
      const t = c.tree;
      const sp = Math.max(0.1, Math.hypot(v.vel.x, v.vel.z));
      this.fallingTrees.push({ t, c, dx: v.vel.x / sp, dz: v.vel.z / sp, k: 0, w: 0, done: false, brokenAt: this.time });
      for (let k = 0; k < 10; k++) {
        this.props.debris.spawn(c.x + (Math.random() - 0.5), t.y + 0.4 + Math.random() * 1.2, c.z + (Math.random() - 0.5), v.vel.x * 0.4 + (Math.random() - 0.5) * 3, 1 + Math.random() * 3, v.vel.z * 0.4 + (Math.random() - 0.5) * 3,
          0.12 + Math.random() * 0.15, 0.08, 0.3 + Math.random() * 0.5, 0x6b4f33);
      }
      this.effects.debris(c.x, t.y + 0.8, c.z, 0.5, 0.42, 0.3, 4);
      if (v === this.player) { this.audio.crash(0.7); this.camRig.addShake(0.45); this.traffic.crime('PROPERTY DAMAGE', 0.5, v); }
      else this.crashSoundAt(v.pos, 7);
    };
    C.onSoft = (v, c) => {
      // leaves fly when you plough through a bush (rate-limited per bush)
      const now = this.time;
      if ((c.leafT || 0) > now) return;
      c.leafT = now + 0.25;
      const sp = Math.hypot(v.vel.x, v.vel.z);
      if (sp < 3 || v.pos.distanceTo(this.camera.position) > 120) return;
      for (let k = 0; k < Math.min(14, 3 + sp * 0.5); k++) {
        const s = 0.08 + Math.random() * 0.12;
        this.props.debris.spawn(c.x + (Math.random() - 0.5) * c.r, v.pos.y + Math.random(), c.z + (Math.random() - 0.5) * c.r,
          v.vel.x * 0.3 + (Math.random() - 0.5) * 3, 1 + Math.random() * 3, v.vel.z * 0.3 + (Math.random() - 0.5) * 3, s, 0.02, s, Math.random() < 0.5 ? 0x3f6b2a : 0x5f7f2e);
      }
    };
    C.onScrape = (v, c, px, pz, nx, nz, slide) => {
      if (v.pos.distanceTo(this.camera.position) > 120) return;
      v.bodyScrape = Math.max(v.bodyScrape, slide * 0.6);
      if (Math.random() < 0.35) {
        const s = 2 + slide * 0.25;
        this.effects.sparks.emit(px, v.pos.y - 0.1 + Math.random() * 0.5, pz,
          -v.vel.x * 0.15 + nx * s * 0.5 + (Math.random() - 0.5) * 2, 1 + Math.random() * 2.5, -v.vel.z * 0.15 + nz * s * 0.5 + (Math.random() - 0.5) * 2,
          0.22, -0.2, 0.25 + Math.random() * 0.3, 1, 1.0, 0.7, 0.3, 0.6, 9.8);
      }
    };
    C.onStaticHit = (v, c, j, px, pz, nx, nz, vn) => {
      const dv = j / v.mass;
      if (c.tree && dv > 2) {
        // a tree is a brutal thing to hit: extra damage, and the trunk leans over from the blow
        v.damage = Math.min(1, v.damage + (dv - 2) * (v === this.player ? 0.008 : 0.012));
        if (dv > 5 && !c.broken) {
          const t = c.tree, sp = Math.max(0.1, Math.hypot(v.vel.x, v.vel.z) + 1e-3);
          t.lean = Math.min(0.3, (t.lean || 0) + dv * 0.012);
          t.leanX = -nx; t.leanZ = -nz; // away from the car
          this.meshes.trees.pose(t, t.lean, t.leanX, t.leanZ);
          void sp;
        }
      }
      // walls bite back: chunks of masonry and a dust puff, scaled by the impact
      if ((c.tall || c.rail || c.bottom !== undefined) && dv > 4 && v.pos.distanceTo(this.camera.position) < 150) {
        const house = c.c !== 1 || c.s !== 0;
        const cols = c.rail ? [0x9a958c, 0x6b6e73] : house ? [0xd9cfb4, 0xe8dcc4, 0x7a5a3a] : [0x8f8b84, 0x8a4a3a, 0xa8a49c, 0x5d5a55];
        const n = Math.min(16, Math.floor((dv - 3) * 1.6));
        for (let k = 0; k < n; k++) {
          const s = 0.06 + Math.random() * 0.22;
          this.props.debris.spawn(px + nx * 0.2, v.pos.y + Math.random() * 1.2, pz + nz * 0.2,
            nx * (1 + Math.random() * dv * 0.25) + (Math.random() - 0.5) * 3, 1 + Math.random() * dv * 0.3, nz * (1 + Math.random() * dv * 0.25) + (Math.random() - 0.5) * 3,
            s, s * (0.5 + Math.random() * 0.5), s * (0.6 + Math.random() * 0.4), cols[k % cols.length]);
        }
        this.effects.debris(px + nx * 0.4, v.pos.y + 0.3, pz + nz * 0.4, 0.62, 0.6, 0.56, Math.min(10, 2 + Math.floor(dv / 3)));
      }
      if (v === this.player) {
        if (dv > 1.2) { this.audio.crash(Math.min(1, dv / 14)); this.camRig.addShake(Math.min(1, dv * 0.07)); }
        if (dv > 5) this.traffic.crime('RECKLESS DRIVING', 0.5, v);
      } else if (dv > 3) this.crashSoundAt(v.pos, dv);
      if (dv > 4.5 && !c.tree) this.effects.burstSparks(px, v.pos.y - 0.1, pz, nx, nz, dv);
      this._treeHit = !!c.tree;
      this.applyDamage(v, dv, px, pz, nx, nz);
      this._treeHit = false;
    };
    C.onCarHit = (a, b, j, px, py, pz, nx, nz, vn) => {
      // soft contacts spread an impact over several substeps: judge damage by closing speed, once per impact
      const fa = b.mass / (a.mass + b.mass), fb = 1 - fa;
      const hitOnce = (v, dv) => {
        const fresh = this.time - (v._carHitT || -9) > 0.35;
        const extra = fresh ? dv : dv - (v._carHitDv || 0);
        if (fresh || dv > (v._carHitDv || 0)) { v._carHitDv = Math.max(fresh ? 0 : v._carHitDv || 0, dv); }
        v._carHitT = this.time;
        return Math.max(0, extra);
      };
      const dva = hitOnce(a, vn * fa * 1.15), dvb = hitOnce(b, vn * fb * 1.15);
      if (dva > 0) this.applyDamage(a, dva, px, pz, nx, nz);
      if (dvb > 0) this.applyDamage(b, dvb, px, pz, -nx, -nz);
      const P = this.player;
      if (a === P || b === P) {
        if (vn > 1.2) { this.audio.crash(Math.min(1, vn / 16)); this.camRig.addShake(Math.min(1, vn * 0.06)); }
        const other = a === P ? b : a;
        _v.copy(other.pos).sub(P.pos).setY(0).normalize();
        const pApp = P.vel.dot(_v), oApp = -other.vel.dot(_v);
        const d = other.driver;
        if (d && d.role === 'police') {
          if (pApp > 3 && pApp > oApp) this.traffic.crime('ASSAULTING AN OFFICER', 2, P, true);
        } else if (vn > 3.5 && pApp >= oApp * 0.8) this.traffic.crime('HIT AND RUN', 1, P);
      } else if (vn > 3) this.crashSoundAt(a.pos, vn);
      if (vn > 5) this.effects.burstSparks(px, py, pz, nx, nz, vn * 0.6);
    };
    C.onBreak = (c, v, px, pz) => {
      const ref = c.ref;
      if (c.mullion) {
        c.mullion.broken = true;
        this.meshes.mats.mullionBreak(c.mullion);
        const y = CITY.at(c.mullion.x, c.mullion.z) + CITY.curb;
        const thick = c.mullion.solid ? 0.4 : 0.14;
        this.props.debris.spawn(c.mullion.x, y + 2.3, c.mullion.z, v.vel.x * 0.7, 2 + Math.random() * 2, v.vel.z * 0.7, thick, 4.4, thick, 0x2c2e31);
        if (c.mullion.solid) for (let k = 0; k < 5; k++) this.props.debris.spawn(c.mullion.x, y + Math.random() * 4, c.mullion.z, v.vel.x * 0.4 + (Math.random() - 0.5) * 4, 1 + Math.random() * 3, v.vel.z * 0.4 + (Math.random() - 0.5) * 4, 0.3, 0.25, 0.3, 0x8a857c);
        this.props.debris.spawn(c.mullion.x, y + 1, c.mullion.z, v.vel.x * 0.5 + (Math.random() - 0.5) * 2, 3, v.vel.z * 0.5, 0.14, 1.2, 0.14, 0x2c2e31);
        this.effects.burstSparks(px, y + 0.8, pz, v.vel.x * 0.05, v.vel.z * 0.05, 7);
        if (v === this.player) { this.audio.crash(0.35); this.camRig.addShake(0.12); this.traffic.crime('PROPERTY DAMAGE', 0.5, v); } else this.crashSoundAt(v.pos, 3);
        return;
      }
      if (c.fixture) {
        const f = c.fixture;
        this.fixtures.breakFixture(f, v);
        this.effects.burstSparks(px, f.y + 0.8, pz, v.vel.x * 0.05, v.vel.z * 0.05, 5);
        for (let k = 0; k < 3; k++) this.props.debris.spawn(f.x, f.y + 0.5 + Math.random() * 2, f.z, v.vel.x * 0.4 + (Math.random() - 0.5) * 2, 1 + Math.random() * 2, v.vel.z * 0.4 + (Math.random() - 0.5) * 2, 0.1, 0.4, 0.1, f.kind === 'pipe' ? 0x6b7074 : 0x2a2b2d);
        if (v === this.player) { this.audio.crash(0.25); this.camRig.addShake(0.08); this.traffic.crime('PROPERTY DAMAGE', 0.4, v); } else this.crashSoundAt(v.pos, 2);
        return;
      }
      if (c.railPiece) {
        const pc = c.railPiece;
        pc.broken = true;
        this.meshes.rails.breakPiece(pc);
        const y = c.top - 0.6;
        for (let k = 0; k < 6; k++) {
          const t = Math.random();
          const len = 0.6 + Math.random() * 1.2;
          this.props.debris.spawn(pc.ax + (pc.bx - pc.ax) * t, y + Math.random() * 0.5, pc.az + (pc.bz - pc.az) * t,
            v.vel.x * (0.5 + Math.random() * 0.5) + (Math.random() - 0.5) * 3, 1.5 + Math.random() * 3, v.vel.z * (0.5 + Math.random() * 0.5) + (Math.random() - 0.5) * 3,
            k < 2 ? 0.07 : len, 0.07, k < 2 ? 1.1 : 0.07, 0x3b4046);
        }
        this.effects.burstSparks(px, y, pz, v.vel.x * 0.05, v.vel.z * 0.05, 6);
        if (v === this.player) { this.audio.crash(0.3); this.camRig.addShake(0.12); this.traffic.crime('PROPERTY DAMAGE', 0.5, v); } else this.crashSoundAt(v.pos, 3);
        return;
      }
      if (c.prop) {
        this.props.breakProp(c.prop, v, this.effects);
        const heavy = ['stall', 'hydrant', 'table', 'news', 'dumpster', 'window', 'shelf', 'fridge', 'counter', 'busstop', 'phone'].includes(c.prop.kind);
        if (c.prop.kind === 'window') {
          this.audio.glass(Math.min(1, 20 / Math.max(8, v.pos.distanceTo(this.camera.position))));
          if (v === this.player) { this.camRig.addShake(0.25); this.traffic.crime('PROPERTY DAMAGE', 0.5, v); }
          return;
        }
        if (v === this.player) {
          this.audio.crash(heavy ? 0.4 : 0.15);
          this.camRig.addShake(heavy ? 0.2 : 0.05);
          this.traffic.crime('PROPERTY DAMAGE', 0.5, v);
        } else this.crashSoundAt(v.pos, heavy ? 4 : 2);
        return;
      }
      if (ref && ref.idx !== undefined) {
        const sp = Math.max(0.1, Math.hypot(v.vel.x, v.vel.z));
        ref.fdx = v.vel.x / sp; ref.fdz = v.vel.z / sp;
        ref.broken = true;
        this.falling.push({ lamp: ref, t: 0 });
      } else if (ref) this.meshes.signals.knock(ref);
      this.effects.burstSparks(px, v.pos.y + 0.3, pz, v.vel.x * 0.05, v.vel.z * 0.05, 8);
      if (v === this.player) {
        this.audio.crash(0.35);
        this.camRig.addShake(0.15);
        this.traffic.crime('PROPERTY DAMAGE', 0.5, v);
      } else this.crashSoundAt(v.pos, 4);
    };
  }

  crashSoundAt(pos, intensity) {
    const d = pos.distanceTo(this.camera.position);
    if (d < 120) this.audio.crash(Math.min(1, intensity / 16) * Math.min(1, 20 / Math.max(d, 8)));
  }

  applyDamage(v, dv, px, pz, nx, nz) {
    const isP = v === this.player;
    if (dv < (isP ? 1.8 : 1.1)) return;
    const police = v.driver && v.driver.role === 'police';
    const k = isP ? 0.0105 : police ? 0.018 : 0.035;
    const before = v.damage;
    v.damage = Math.min(1, v.damage + (dv - 2.2) * k);
    if (police && before < 1 && v.damage >= 1) {
      v.wrecked = true;
      this.traffic.copsWrecked++;
      this.traffic.heat = Math.min(5, this.traffic.heat + 0.4);
      this.hud.message('COP DOWN', 1.8, 'good');
    }
    // visual dents for nearby cars
    if (v.pos.distanceTo(this.camera.position) < 140) {
      _q.copy(v.quat).invert();
      _v.set(px - v.pos.x, -0.05, pz - v.pos.z).applyQuaternion(_q);
      _w.set(nx, 0, nz).applyQuaternion(_q);
      const mx = _v.x, my = 0.55 + v.style.clear, mz = _v.z + v.spec.comZ;
      // the cars you hit crumple hard: big, wide dents, buckled hoods, scraped paint, bits flying off
      if (isP) deformCar(v.car, mx, my, mz, _w.x, _w.y, _w.z, Math.min(0.5, (dv - 1.5) * (this._treeHit ? 0.06 : 0.04)));
      else deformCar(v.car, mx, my, mz, _w.x, _w.y, _w.z, Math.min(0.85, (dv - 0.8) * 0.085), { R: 1.55, maxOff: 0.8, buckle: 0.55, scuff: 7 });
      for (const part of breakCarParts(v.car, isP ? v.damage : Math.min(1, v.damage * 1.6 + 0.1), mz, v.hz, isP ? dv : dv * 1.4)) {
        // the detached piece tumbles away as debris
        part.getWorldPosition(_v);
        const chrome = part === v.car.parts.bumperF || part === v.car.parts.bumperR;
        this.props.debris.spawn(_v.x, _v.y, _v.z, v.vel.x * 0.6 + nx * 3, 2 + Math.random() * 3, v.vel.z * 0.6 + nz * 3,
          chrome ? v.style.W * 0.8 : 0.34, chrome ? 0.18 : 0.06, chrome ? 0.15 : 0.34, 0xdedede);
      }
      if (dv > (isP ? 6 : 3.5)) {
        if (mz < -v.hz * 0.55) for (const h of v.car.heads) if (Math.abs(h.position.x - mx) < 1.1 && Math.random() < 0.8) h.visible = false;
        if (mz > v.hz * 0.55) for (const t of v.car.tails) if (Math.abs(t.position.x - mx) < 1.0 && Math.random() < 0.7) t.visible = false;
      }
    }
  }

  // ------------- game flow -------------
  onSpawn(v) {
    if (!this.cars.includes(v)) this.cars.push(v);
    v.headlightsOn = this.headlights;
    repairCar(v.car);
  }
  onDespawn(v) {
    const i = this.cars.indexOf(v);
    if (i >= 0) this.cars.splice(i, 1);
  }
  message(t, d, c, delay) { this.hud.message(t, d, c, delay); }
  onEscape(t) { this.hud.message(`EVADED · ${fmtTime(t)}`, 3, 'crime', 0.8); }
  onBusted() { this.deathPos = null; this.endRun('BUSTED', 'The long arm of the law'); }

  endRun(title, sub) {
    if (this.state !== 'drive') return;
    this.state = 'dead';
    this.stateT = 0;
    document.getElementById('deadtxt').textContent = title;
    // the run ends: anything still in the car is lost, the banked total is the score
    const S = this.score;
    const lost = S.carried;
    S.carried = 0;
    if (S.banked > S.best) { S.best = S.banked; localStorage.setItem('heatrun.best', String(S.best)); }
    document.getElementById('deadsub').innerHTML = `${sub}<br><span style="color:#8fe6a6">RUN TOTAL ${this.money(S.banked)}</span>` +
      (lost ? ` &nbsp;·&nbsp; <span style="color:#ff6a50">LOST ${this.money(lost)}</span>` : '') + `<br><span style="opacity:.7">BEST ${this.money(S.best)}</span>`;
    S.banked = 0; S.combo = 0;
    document.getElementById('dead').style.display = 'flex';
  }

  respawn() {
    document.getElementById('dead').style.display = 'none';
    const T = this.traffic;
    for (const d of [...T.drivers]) if (d.role === 'police') T.release(d);
    T.heat = 0; T.bustT = 0; T.evadeT = 0; T.chaseTime = 0;
    this.player.damage = 0;
    this.player.wrecked = false;
    repairCar(this.player.car);
    if (this.state === 'dead' && this.deathPos) this.spawnPlayer(this.deathPos);
    else this.spawnAtStart();
    this.deathPos = null;
    this.state = 'drive';
  }

  resetCar() {
    const p = this.player;
    if (this.resetCool > 0) return;
    this.resetCool = 1.5;
    const g = this.world.groundAt(p.pos.x, p.pos.z, p.pos.y + 0.5);
    const nr = this.world.nearestRoad(p.pos.x, p.pos.z);
    if (p.inWater > 0 || g.h < WATER + 0.5) {
      this.spawnPlayer(p.pos.clone());
    } else {
      p.resetTo(p.pos.x, g.h + 0.5, p.pos.z, p.heading, 0);
    }
    void nr;
  }

  // ------------- frame -------------
  frame() {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.time += dt;
    const fpsEl = document.getElementById('fps');
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { fpsEl.textContent = `${Math.round(this.fpsN / this.fpsAcc)} fps`; this.fpsAcc = 0; this.fpsN = 0; }

    const inp = this.input;
    const P = this.player;
    if (!this.started) {
      // slow orbit behind the menu
      const a = this.time * 0.05;
      this.camera.position.set(P.pos.x + Math.sin(a) * 14, P.pos.y + 3.5, P.pos.z + Math.cos(a) * 14);
      this.camera.lookAt(P.pos.x, P.pos.y + 0.6, P.pos.z);
      // frame the car in the open space to the right of the menu panel
      if (!this.menuView) { this.menuView = true; this.camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.2, 0, innerWidth, innerHeight); }
      this.atmo.follow(P.pos);
      this.composer.render(dt);
      return;
    }
    inp.update(dt, Math.abs(P.speed));
    if (inp.was('Escape') || inp.was('KeyP')) this.togglePause();
    if (this.paused) { inp.endFrame(); this.composer.render(dt); return; }
    if (inp.was('KeyC')) { this.camRig.cycle(); this.hud.el.cam.textContent = CAM_MODES[this.camRig.mode] + ' CAM'; clearTimeout(this.camMsgT); this.camMsgT = setTimeout(() => (this.hud.el.cam.textContent = ''), 1500); }
    if (inp.was('KeyR')) this.resetCar();
    if (inp.was('KeyM')) { this.showMap = !this.showMap; document.getElementById('bigmapwrap').style.display = this.showMap ? 'flex' : 'none'; }
    if (inp.was('KeyN')) this.audio.muted = !this.audio.muted;
    if (inp.was('KeyF')) fpsEl.style.display = fpsEl.style.display === 'block' ? 'none' : 'block';
    if (inp.was('KeyT')) {
      const keys = Object.keys(PRESETS);
      this.applyTod(keys[(keys.indexOf(this.tod) + 1) % keys.length]);
      for (const c of this.cars) c.headlightsOn = this.headlights;
      this.hud.message(PRESETS[this.tod].label.toUpperCase(), 1.5);
    }
    this.resetCool -= dt;

    if (this.state === 'drive') {
      P.input.throttle = inp.throttle; P.input.brake = inp.brake; P.input.steer = inp.steer; P.input.handbrake = inp.handbrake;
    } else {
      P.input.throttle = 0; P.input.brake = 0; P.input.steer = 0; P.input.handbrake = 1;
      this.stateT += dt;
      if (this.stateT > 3.5) this.respawn();
    }
    P.headlightsOn = this.headlights;
    for (const sp of this.spots) sp.intensity = P.car.heads.some((h) => h.visible && Math.sign(h.position.x) === sp.userData.side) ? this.spotPower || 0 : 0;

    // AI + physics
    this.traffic.update(dt, P, this.camera, this.cars);
    for (const d of this.traffic.drivers) if (d.honkReq) {
      d.honkReq = 0;
      const dist = d.v.pos.distanceTo(this.camera.position);
      _v.copy(d.v.pos).sub(this.camera.position).normalize();
      _w.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
      this.audio.aiHorn(Math.max(-0.8, Math.min(0.8, _v.dot(_w))), Math.min(1, 12 / Math.max(6, dist)));
    }
    for (const v of this.parked) {
      const d = v.pos.distanceTo(P.pos);
      if (v.sleeping && d < 70) { v.sleeping = false; v.input.handbrake = 1; v.input.brake = 1; }
      else if (!v.sleeping && d > 95 && v.vel.lengthSq() < 0.05) v.sleeping = true;
    }
    const sim = this.cars.filter((c) => !c.ghost); // far-off ghosts are moved by the traffic manager instead
    for (const c of sim) c.prepare(dt);
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let s = 0; s < n; s++) {
      for (const c of sim) c.step(h);
      for (const c of sim) this.collisions.stepStatic(c, h);
      this.collisions.stepCars(sim);
    }
    const camPos = this.camera.position;
    for (const c of this.cars) {
      c.syncVisual(dt);
      const d = c.pos.distanceTo(camPos);
      c.root.visible = d < (c.parked ? 230 : 650);
      if (c !== this.player && c.root.visible) setCarLod(c, d > 85);
      if (!c.sleeping && !c.ghost) this.effects.vehicle(c, dt, d < 160);
    }

    // player condition
    if (this.state === 'drive') {
      if (P.damage >= 1) { this.deathPos = P.pos.clone(); this.endRun('WRECKED', 'Your ride is scrap metal'); }
      if (P.inWater > 1.2) {
        this.sinkT = (this.sinkT || 0) + dt;
        if (this.sinkT > 2.5) { this.sinkT = 0; this.deathPos = P.pos.clone(); this.endRun('SUNK', 'Cars make poor boats'); }
      } else this.sinkT = 0;
      if (P.isFlipped() && P.vel.length() < 2) {
        this.flipT = (this.flipT || 0) + dt;
        if (this.flipT > 2.5) { this.flipT = 0; this.resetCar(); }
      } else this.flipT = 0;
    }
    // water entry splash
    const wasIn = this.wasInWater || false;
    const inNow = P.inWater > -0.3;
    if (inNow && !wasIn && P.vel.length() > 3) { this.effects.splash(P.pos.x, WATER + 0.2, P.pos.z, P.vel.length()); this.audio.splash(); }
    this.wasInWater = inNow;
    if (inNow && P.vel.length() > 2 && Math.random() < 0.5) this.effects.splash(P.pos.x, WATER + 0.1, P.pos.z, 3);

    // repair workshops: stop inside one to fix the car (and lose the heat if no cop sees you)
    this.updateWorkshops(dt);

    // toppling trees: accelerate over, bounce slightly, then lie as a log across the ground
    for (let i = this.fallingTrees.length - 1; i >= 0; i--) {
      const f = this.fallingTrees[i];
      if (!f.done) {
        f.w += dt * (1.2 + f.k * 4);
        f.k = Math.min(1.5, f.k + f.w * dt);
        this.meshes.trees.pose(f.t, f.k, f.dx, f.dz);
        if (f.k >= 1.5) {
          f.done = true;
          // the fallen trunk is a low obstacle
          const len = 4.5 * f.t.s;
          const log = { type: 'box', x: f.t.x + f.dx * len / 2, z: f.t.z + f.dz * len / 2, hx: len / 2, hz: 0.45 * f.t.s, c: f.dx, s: f.dz, top: f.t.y + 0.9 };
          this.world.colliders.push(log);
          this.world.insertCollider(log);
          f.log = log;
          this.effects.debris(log.x, f.t.y + 0.5, log.z, 0.55, 0.5, 0.38, 6);
          if (f.t.y && this.camera.position.distanceTo(_v.set(log.x, f.t.y, log.z)) < 100) this.audio.crash(0.4);
        }
      } else if (this.time - f.brokenAt > 60 && Math.hypot(f.t.x - P.pos.x, f.t.z - P.pos.z) > 300) {
        // regrow once you're far away
        f.t.lean = 0;
        this.meshes.trees.pose(f.t, 0);
        f.c.broken = false;
        if (f.log) f.log.broken = true;
        this.fallingTrees.splice(i, 1);
      }
    }

    // falling lamps
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.t += dt;
      f.lamp.tilt = Math.min(1.5, f.t * f.t * 5);
      this.meshes.lamps.update(f.lamp);
      if (f.lamp.tilt >= 1.5) this.falling.splice(i, 1);
    }

    this.camRig.update(dt, P, inp.lookBack, inp.mouse);
    this.atmo.follow(P.pos);
    this.weather.update(dt, this.camera, this.atmo.preset.night);
    this.updateTunnelLight(dt);
    if (this.started && this.state === 'drive') this.updateLoot(dt);
    this.animals.update(dt, this.time, this.camera.position, this.cars, P);
    this.fixtures.update(dt, this.camera.position);
    this.aircraft.update(dt, this.camera, this.atmo.preset.night, this.traffic.heat || 0);
    this.meshes.signals.update(this.traffic.time);
    this.meshes.mats.water.userData.time.value = this.time;
    this.grade.uniforms.uTime.value = this.time % 10;
    this.effects.setScale(this.renderer.domElement.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
    this.effects.update(dt);
    this.props.update(dt, P.pos, this.effects);
    this.updateCopLights(dt);
    this.hud.update(dt, this);
    this.updateAudio(dt);
    this.composer.render(dt);
    inp.endFrame();
  }

  // inside tunnels and covered streets daylight dies away: only sparse sodium lamps and your headlights
  updateTunnelLight(dt) {
    const cp = this.camera.position, w = this.world, A = this.atmo, P = A.preset;
    if (!this.tunLights) {
      this.tunLights = [];
      for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffa040, 0, 26, 1.6); this.scene.add(l); this.tunLights.push(l); }
      this.tunnelDark = 0;
    }
    const inT = w.tunnelAt(cp.x, cp.z, cp.y) !== null || w.coveredAt(cp.x, cp.z, cp.y);
    this.tunnelDark += ((inT ? 1 : 0) - this.tunnelDark) * Math.min(1, dt * 2.2);
    const f = 1 - 0.9 * this.tunnelDark;
    if (P) {
      A.sun.intensity *= f; A.hemi.intensity *= f;
      this.scene.environmentIntensity = P.envI * f;
      this.scene.fog.color.multiplyScalar(1 - 0.8 * this.tunnelDark);
    }
    const lamps = this.meshes.tunnelLamps;
    const near = [];
    if (this.tunnelDark > 0.02) for (const L of lamps) { const d = Math.abs(L.x - cp.x) + Math.abs(L.z - cp.z); if (d < 90) near.push([d, L]); }
    near.sort((a, b) => a[0] - b[0]);
    this.tunLights.forEach((l, i) => {
      const L = near[i] && near[i][1];
      if (!L) { l.intensity = 0; return; }
      l.position.set(L.x, L.y, L.z);
      const fl = L.flicker ? (Math.sin(this.time * 31 + L.x) > 0.3 || Math.random() < 0.1 ? 0.15 : 1) : 1;
      l.intensity = 90 * this.tunnelDark * fl;
    });
  }

  // ---------- loot run ----------
  money(v) { return '$' + Math.round(v).toLocaleString('en-US'); }

  pop(text, cls) {
    const el = document.createElement('div');
    el.className = 'pop ' + (cls || '');
    el.textContent = text;
    document.getElementById('pops').appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  updateLoot(dt) {
    const S = this.score, T = this.traffic;
    const heatLvl = Math.ceil(T.heat - 0.001);
    const mult = 1 + heatLvl; // the hotter the chase, the more it's worth
    S.comboT -= dt;
    if (S.comboT <= 0) S.combo = 0;
    for (const g of this.loot.update(dt, this.time, this.player, this.camera.position)) {
      S.combo = S.comboT > 0 ? S.combo + 1 : 1;
      S.comboT = 7;
      const bonus = Math.min(2, 1 + 0.15 * (S.combo - 1));
      const gain = Math.round((g.value * mult * bonus) / 10) * 10;
      S.carried += gain;
      this.pop(`+${this.money(gain)}${mult > 1 ? `  ×${mult} HEAT` : ''}`, g.gold ? 'gold' : '');
      this.audio.pickup(g.gold);
      this.effects.burstSparks(g.x, g.y + 0.8, g.z, 0, 0, g.gold ? 18 : 8);
    }
    document.getElementById('banked').textContent = this.money(S.banked);
    document.getElementById('carried').textContent = this.money(S.carried);
    document.getElementById('mult').textContent = mult > 1 ? `×${mult}` : '';
    document.getElementById('combo').textContent = S.combo > 1 ? `COMBO ×${S.combo}  ${'▮'.repeat(Math.max(0, Math.ceil(S.comboT)))}` : '';
  }

  bankLoot() {
    const S = this.score;
    if (S.carried <= 0) return;
    S.banked += S.carried;
    this.pop(`BANKED ${this.money(S.carried)}`, 'bank');
    this.hud.message('LOOT STASHED', 2, 'good');
    this.audio.bank();
    S.carried = 0;
    if (S.banked > S.best) { S.best = S.banked; localStorage.setItem('heatrun.best', String(S.best)); }
  }

  updateWorkshops(dt) {
    const P = this.player;
    let inside = null;
    for (const ws of this.world.workshops) {
      const dx = P.pos.x - ws.x, dz = P.pos.z - ws.z, c = Math.cos(ws.rot), s = Math.sin(ws.rot);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < ws.w / 2 - 0.8 && Math.abs(lz) < ws.d / 2 && Math.abs(P.pos.y - ws.y - P.comH) < 1.5) { inside = ws; break; }
    }
    if (!inside) { this.repairT = 0; this.repaired = false; return; }
    if (this.state === 'drive' && P.vel.length() < 2.5 && this.score.carried > 0 && (this.traffic.heat <= 0 || this.traffic.evadeT > 1.0)) this.bankLoot();
    if (this.repaired || this.state !== 'drive') return;
    if (P.vel.length() > 2.5) { this.repairT = 0; return; }
    if (!this.repairT) this.hud.message('REPAIRING…', 1.8, 'crime');
    this.repairT = (this.repairT || 0) + dt;
    if (this.repairT > 2.0) {
      this.repaired = true;
      P.damage = 0; P.wrecked = false;
      repairCar(P.car);
      this.hud.message('GOOD AS NEW', 2.2, 'good');
      const T = this.traffic;
      if (T.heat > 0 && T.evadeT > 1.0) {
        T.heat = 0; T.bustT = 0; T.stats.escapes++;
        for (const d of T.drivers) if (d.role === 'police') { d.mode = 'patrol'; d.sirenOn = false; d.queue.length = 0; d.lastNode = -1; }
        this.hud.message('NEW PLATES · HEAT LOST', 3, 'good', 0.6);
      }
    }
  }

  togglePause() {
    this.paused = !this.paused;
    const T = this.traffic;
    document.getElementById('stats').innerHTML =
      `ESCAPES ${T.stats.escapes} &nbsp;·&nbsp; BUSTED ${T.stats.busted} &nbsp;·&nbsp; COPS WRECKED ${T.copsWrecked}<br>LONGEST PURSUIT ${fmtTime(T.stats.bestChase)}`;
    document.getElementById('pause').style.display = this.paused ? 'flex' : 'none';
    document.getElementById('resume').onclick = () => this.togglePause();
    if (this.audio.ctx) this.paused ? this.audio.ctx.suspend() : this.audio.ctx.resume();
  }

  updateCopLights(dt) {
    const P = this.player;
    const cops = this.traffic.drivers.filter((d) => d.role === 'police' && d.sirenOn && !d.v.wrecked)
      .map((d) => ({ d, dist: d.v.pos.distanceTo(P.pos) })).sort((a, b) => a.dist - b.dist);
    this.copLights.forEach((l, i) => {
      const c = cops[i];
      if (!c || c.dist > 90) { l.intensity = 0; return; }
      const v = c.d.v;
      v.upv(_v);
      l.position.copy(v.pos).addScaledVector(_v, 1.7);
      const red = Math.sin(c.d.lightPhase * 7) > 0;
      l.color.set(red ? 0xff1a10 : 0x2040ff);
      l.intensity = (this.tod === 'day' ? 15 : 45);
    });
    this.sirenList = cops;
  }

  updateAudio(dt) {
    const P = this.player;
    const cam = this.camera;
    cam.getWorldDirection(_v);
    const rx = -_v.z, rz = _v.x; // camera right in xz
    const pan = (pos) => {
      const dx = pos.x - cam.position.x, dz = pos.z - cam.position.z;
      const l = Math.hypot(dx, dz) || 1;
      return Math.max(-1, Math.min(1, (dx * rx + dz * rz) / l));
    };
    let screech = 0, offroad = 0;
    for (const w of P.wheels) {
      if (!w.contact) continue;
      const paved = w.surface === SURF.ASPHALT || w.surface === SURF.CONCRETE;
      if (paved) screech += Math.max(0, w.slip - 2.5);
      else offroad += P.vel.length();
    }
    // handbrake: locked rears howl on tarmac, scrub on dirt
    if (P.input.handbrake > 0 && P.vel.length() > 3) {
      const rearPaved = P.wheels.slice(2).some((w) => w.contact && (w.surface === SURF.ASPHALT || w.surface === SURF.CONCRETE));
      if (rearPaved) screech = Math.max(screech, 5 + P.vel.length() * 0.45);
      else offroad += P.vel.length() * 2;
    }
    const sirens = (this.sirenList || []).slice(0, 2).map((c) => ({ dist: c.dist, pan: pan(c.d.v.pos) }));
    let other = null, od = 1e9;
    for (const c of this.cars) {
      if (c === P) continue;
      const d = c.pos.distanceTo(cam.position);
      if (d < od) { od = d; other = c; }
    }
    this.music.update(dt, this.camera);
    this.audio.update(dt, {
      rpm: P.rpm, throttle: P.throttleEff, load: Math.min(1, Math.abs(P.speed) / 50), speed: P.vel.length(),
      screech, offroad: offroad / 4, scrape: P.bodyScrape, water: P.inWater, horn: this.input.horn && this.state === 'drive',
      locked: P.input.handbrake > 0 || P.wheels.some((w) => w.contact && Math.abs(w.w) < 0.5 && P.vel.length() > 4),
      rain: this.weather ? this.weather.cur.rain : 0,
      sirens, other: other && od < 60 ? { rpm: other.rpm, throttle: other.throttleEff, dist: od, pan: pan(other.pos), layout: other.type === 'compact' || other.type === 'sedan' || other.type === 'taxi' ? 'i4' : other.type === 'police' ? 'v8' : 'i6' } : null,
    });
  }
}

const game = new Game();
window.game = game;
game.init().catch((e) => {
  console.error(e);
  document.getElementById('loadtxt').textContent = 'Error: ' + e.message;
});
