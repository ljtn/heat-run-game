// Now and then something flies over: an airliner high up, a light plane, or a helicopter that
// sweeps low over the city (and sometimes circles the player for a while).
import * as THREE from 'three';
import { mergeGeometries } from '../lib/addons/utils/BufferGeometryUtils.js';

function part(geo, color, x = 0, y = 0, z = 0) {
  geo.translate(x, y, z);
  const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo.index ? geo.toNonIndexed() : geo;
}
const box = (w, h, d, c, x, y, z) => part(new THREE.BoxGeometry(w, h, d), c, x, y, z);

// all models face -z
function airliner() {
  const body = new THREE.CylinderGeometry(1.9, 1.9, 34, 12).rotateX(Math.PI / 2);
  return mergeGeometries([
    part(body, 0xf2f2f0), part(new THREE.SphereGeometry(1.9, 12, 8).scale(1, 1, 2), 0xf2f2f0, 0, 0, -17),
    part(new THREE.ConeGeometry(1.9, 6, 12).rotateX(-Math.PI / 2), 0xf2f2f0, 0, 0.3, 20),
    box(36, 0.4, 5, 0xd8d8d8, 0, -0.6, 1), box(12, 0.3, 2.6, 0xd8d8d8, 0, 0.8, 20.5), box(0.4, 7, 4, 0x1f4f9a, 0, 4, 20.5),
    box(0.1, 0.5, 30, 0x1f4f9a, 1.9, 0.2, 0), box(0.1, 0.5, 30, 0x1f4f9a, -1.9, 0.2, 0),
    part(new THREE.CylinderGeometry(1.1, 1.1, 4, 10).rotateX(Math.PI / 2), 0x9a9a9a, 7, -1.8, -0.5),
    part(new THREE.CylinderGeometry(1.1, 1.1, 4, 10).rotateX(Math.PI / 2), 0x9a9a9a, -7, -1.8, -0.5),
  ]);
}
function lightPlane() {
  return mergeGeometries([
    box(1.2, 1.3, 7, 0xe8e2d4, 0, 0, 0), box(11, 0.15, 1.6, 0xc8322a, 0, 0.75, -0.6), box(3.6, 0.12, 1.0, 0xc8322a, 0, 0.3, 3.5),
    box(0.12, 1.4, 1.1, 0xc8322a, 0, 1.0, 3.5), box(1.0, 0.6, 1.3, 0x28323c, 0, 0.75, -1.4),
    part(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), 0x222222, 0, 0, -3.6),
  ]);
}
function heliBody() {
  return mergeGeometries([
    part(new THREE.SphereGeometry(1.3, 12, 10).scale(1, 1, 1.7), 0x1d2c4a, 0, 0, 0),
    part(new THREE.SphereGeometry(1.05, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1.2).rotateX(-0.9), 0x6d8ca0, 0, 0.1, -1.2),
    part(new THREE.CylinderGeometry(0.22, 0.38, 5.5, 8).rotateX(Math.PI / 2), 0x1d2c4a, 0, 0.35, 4.4),
    box(0.12, 1.3, 0.9, 0x1d2c4a, 0, 0.9, 7.0), box(1.8, 0.1, 0.5, 0x1d2c4a, 0, 0.4, 6.4),
    box(0.1, 0.1, 3.4, 0x222222, 0.9, -1.35, 0), box(0.1, 0.1, 3.4, 0x222222, -0.9, -1.35, 0),
    box(0.06, 0.5, 0.06, 0x222222, 0.9, -1.1, -0.9), box(0.06, 0.5, 0.06, 0x222222, -0.9, -1.1, -0.9),
    box(0.06, 0.5, 0.06, 0x222222, 0.9, -1.1, 0.9), box(0.06, 0.5, 0.06, 0x222222, -0.9, -1.1, 0.9),
    box(0.4, 0.5, 0.4, 0x222222, 0, 1.45, 0), box(2.4, 0.15, 0.25, 0xf2f0ea, 0, 0.3, 0.6), box(0.1, 0.4, 2.4, 0xf2f0ea, 1.31, 0.1, 0.3),
  ]);
}

export class Aircraft {
  constructor(scene, audio, world) {
    this.scene = scene; this.audio = audio; this.world = world;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
    this.models = { airliner: new THREE.Mesh(airliner(), mat), plane: new THREE.Mesh(lightPlane(), mat), heli: new THREE.Group() };
    const hb = new THREE.Mesh(heliBody(), mat);
    this.rotor = new THREE.Group();
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
    for (const a of [0, Math.PI / 2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(11, 0.06, 0.32), bladeMat); b.rotation.y = a; this.rotor.add(b); }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(5.5, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.12, depthWrite: false }));
    this.rotor.add(disc);
    this.rotor.position.y = 1.75;
    this.tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.8, 0.15), bladeMat);
    this.tailRotor.position.set(0.2, 0.9, 7.0);
    this.models.heli.add(hb, this.rotor, this.tailRotor);
    // navigation / strobe lights (visible at night)
    this.navMat = [0xff2010, 0x20ff40, 0xffffff].map((c) => new THREE.MeshBasicMaterial({ color: c }));
    for (const [k, m] of Object.entries(this.models)) {
      const span = k === 'airliner' ? 18 : k === 'plane' ? 5.5 : 1.2;
      const lr = new THREE.Mesh(new THREE.SphereGeometry(k === 'airliner' ? 0.5 : 0.15, 6, 4), this.navMat[0]); lr.position.set(-span, 0, 0);
      const lg = new THREE.Mesh(new THREE.SphereGeometry(k === 'airliner' ? 0.5 : 0.15, 6, 4), this.navMat[1]); lg.position.set(span, 0, 0);
      const st = new THREE.Mesh(new THREE.SphereGeometry(k === 'airliner' ? 0.6 : 0.18, 6, 4), this.navMat[2]); st.position.set(0, k === 'heli' ? -1.4 : -1.9, 0);
      m.add(lr, lg, st); m.userData.strobe = st;
      m.visible = false;
      m.traverse((o) => { if (o.isMesh) o.castShadow = k === 'heli'; });
      scene.add(m);
    }
    // a heli searchlight for night passes
    this.spot = new THREE.SpotLight(0xe8f0ff, 0, 260, 0.16, 0.5, 1.2);
    this.spot.target = new THREE.Object3D();
    scene.add(this.spot, this.spot.target);
    this.active = null;
    this.wait = 25 + Math.random() * 40;
    this.vel = new THREE.Vector3();
  }

  spawn(cam) {
    const r = Math.random();
    const kind = r < 0.4 ? 'heli' : r < 0.7 ? 'airliner' : 'plane';
    const ang = Math.random() * Math.PI * 2, far = kind === 'airliner' ? 2200 : 1300;
    const alt = kind === 'airliner' ? 520 + Math.random() * 250 : kind === 'plane' ? 180 + Math.random() * 120 : 70 + Math.random() * 60;
    const speed = kind === 'airliner' ? 85 : kind === 'plane' ? 48 : 34;
    // pass near the player, offset a little to one side
    const off = (Math.random() - 0.5) * (kind === 'heli' ? 120 : 600);
    const sx = cam.x + Math.cos(ang) * far, sz = cam.z + Math.sin(ang) * far;
    const tx = cam.x - Math.sin(ang) * off, tz = cam.z + Math.cos(ang) * off;
    const m = this.models[kind];
    m.visible = true;
    m.position.set(sx, alt, sz);
    this.vel.set(tx - sx, 0, tz - sz).normalize().multiplyScalar(speed);
    this.active = { kind, m, speed, alt, t: 0, life: (far * 2) / speed, orbit: kind === 'heli' && Math.random() < 0.5 ? 0 : -1, orbitAng: 0, bank: 0 };
    this.startSound(kind);
  }

  startSound(kind) {
    const A = this.audio, ctx = A.ctx;
    if (!ctx || !A.noiseBuf) return;
    const src = ctx.createBufferSource(); src.buffer = A.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = kind === 'heli' ? 500 : kind === 'airliner' ? 380 : 900;
    const chop = ctx.createGain(); chop.gain.value = kind === 'heli' ? 0.4 : 1;
    const g = ctx.createGain(); g.gain.value = 0;
    const pan = ctx.createStereoPanner();
    src.connect(f).connect(chop).connect(g).connect(pan).connect(A.master);
    let lfo = null;
    if (kind === 'heli') { // blade slap
      lfo = ctx.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 11;
      const lg = ctx.createGain(); lg.gain.value = 0.6; lfo.connect(lg).connect(chop.gain); lfo.start();
    } else if (kind === 'plane') { // buzzing prop engine
      lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 38;
      const lg = ctx.createGain(); lg.gain.value = 0.3; lfo.connect(lg).connect(chop.gain); lfo.start();
    }
    src.start();
    this.snd = { src, g, pan, lfo, f };
  }

  stopSound() {
    const s = this.snd; if (!s) return;
    const t = this.audio.ctx.currentTime;
    s.g.gain.setTargetAtTime(0, t, 0.3);
    setTimeout(() => { try { s.src.stop(); s.lfo && s.lfo.stop(); s.pan.disconnect(); } catch (e) { /* already stopped */ } }, 1500);
    this.snd = null;
  }

  update(dt, camera, night, heat = 0, follow = null) {
    const cam = camera.position;
    // a loose dinosaur: a helicopter comes and stays over it, searchlight on it
    if (follow && !(this.active && this.active.chase)) {
      if (this.active) { this.active.m.visible = false; this.stopSound(); this.active = null; }
      const m = this.models.heli, ang = Math.random() * Math.PI * 2;
      m.visible = true; m.position.set(follow.x + Math.cos(ang) * 700, 120, follow.z + Math.sin(ang) * 700);
      this.vel.set(0, 0, 0);
      this.active = { kind: 'heli', m, speed: 30, alt: 60, t: 0, life: 1e9, orbit: -1, orbitAng: ang, bank: 0, chase: true };
      this.startSound('heli');
    }
    if (!follow && this.active && this.active.chase) { this.active.chase = false; this.active.life = this.active.t + 30; }
    const A = this.active;
    if (!A) {
      this.wait -= dt;
      this.spot.intensity = 0;
      if (this.wait <= 0) this.spawn(cam);
      return;
    }
    A.t += dt;
    const m = A.m, p = m.position;
    if (A.kind === 'heli') {
      this.rotor.rotation.y += dt * 38;
      this.tailRotor.rotation.x += dt * 60;
      // start circling once overhead, for a while
      const d = Math.hypot(p.x - cam.x, p.z - cam.z);
      if (A.orbit === 0 && d < 160) { A.orbit = 18 + Math.random() * 14 + heat * 8; A.orbitAng = Math.atan2(p.z - cam.z, p.x - cam.x); }
      if (A.orbit > 0) {
        A.orbit -= dt;
        A.orbitAng += dt * 0.22;
        const tx = cam.x + Math.cos(A.orbitAng) * 110, tz = cam.z + Math.sin(A.orbitAng) * 110;
        const want = new THREE.Vector3(tx - p.x, 0, tz - p.z);
        if (want.lengthSq() > 1) want.normalize().multiplyScalar(A.speed);
        this.vel.lerp(want, Math.min(1, dt * 0.8));
        if (A.orbit <= 0) { A.orbit = -1; A.life = A.t + 1500 / A.speed; }
      }
      if (A.chase && follow) {
        // circle the animal, close and low, nose in
        A.orbitAng += dt * 0.28;
        const fy = follow.root ? follow.root.position.y : 0;
        const tx = follow.x + Math.cos(A.orbitAng) * 60, tz = follow.z + Math.sin(A.orbitAng) * 60;
        const want = new THREE.Vector3(tx - p.x, 0, tz - p.z), dd = want.length();
        want.normalize().multiplyScalar(Math.min(40, 6 + dd * 0.5));
        this.vel.lerp(want, Math.min(1, dt * 1.2));
        p.y += (Math.max(fy + 42, this.world.groundAt(p.x, p.z, 1e9).h + 35) - p.y) * Math.min(1, dt * 0.6);
      } else {
        // keep clear of the ground and the towers
        const gh = this.world.groundAt(p.x, p.z, 1e9).h;
        p.y += (Math.max(A.alt, gh + 60) - p.y) * Math.min(1, dt * 0.5);
      }
    }
    p.addScaledVector(this.vel, dt);
    // face the direction of travel, banking into turns
    const yaw = Math.atan2(-this.vel.x, -this.vel.z);
    const dyaw = ((yaw - m.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    A.bank += (THREE.MathUtils.clamp(dyaw * 6, -0.45, 0.45) - A.bank) * Math.min(1, dt * 2);
    m.rotation.set(A.kind === 'heli' ? 0.12 : 0, yaw, A.kind === 'airliner' ? 0 : -A.bank, 'YXZ');
    // lights
    m.userData.strobe.visible = night && (A.t % 1.2) < 0.08;
    this.navMat[0].color.setScalar(night ? 1 : 0.3).multiply(new THREE.Color(0xff2010));
    if (A.kind === 'heli' && (night || (A.chase && follow))) {
      this.spot.intensity = night ? 9000 : 2500;
      this.spot.position.copy(p).y -= 1.5;
      if (A.chase && follow) this.spot.target.position.set(follow.x, (follow.root ? follow.root.position.y : 0) + 3, follow.z); // the light stays on the animal
      else this.spot.target.position.set(cam.x + Math.sin(A.t * 0.7) * 15, cam.y - 2, cam.z + Math.cos(A.t * 0.5) * 15);
    } else this.spot.intensity = 0;
    // sound: distance and side
    if (this.snd) {
      const d = p.distanceTo(cam);
      const ref = A.kind === 'airliner' ? 900 : A.kind === 'plane' ? 350 : 260;
      const vol = (A.kind === 'airliner' ? 0.22 : A.kind === 'plane' ? 0.16 : 0.32) * Math.min(1, ref / Math.max(d, 1)) ** 1.4 * (this.audio.muted ? 0 : 1);
      const t = this.audio.ctx.currentTime;
      this.snd.g.gain.setTargetAtTime(vol, t, 0.2);
      const e = camera.matrixWorld.elements;
      this.snd.pan.pan.setTargetAtTime(THREE.MathUtils.clamp(((p.x - cam.x) * e[0] + (p.z - cam.z) * e[2]) / Math.max(d, 1), -0.8, 0.8), t, 0.2);
    }
    if (A.t > A.life) {
      m.visible = false;
      this.active = null;
      this.stopSound();
      this.wait = 60 + Math.random() * 110;
    }
  }
}
