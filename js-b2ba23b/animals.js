// Farm animals: flocks of sheep and chickens in fenced paddocks. They graze and peck, keep together,
// bolt from cars, and get out through any fence piece you've smashed. Clip one and it tumbles away.
import * as THREE from 'three';
import { mergeGeometries } from '../lib/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './noise.js';

function col(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.index ? g.toNonIndexed() : g;
}
// lumpy wool: a cluster of jittered blobs
function wool(r, blobs, w, h, l, hex) {
  const parts = [];
  for (let k = 0; k < blobs; k++) {
    const g = new THREE.IcosahedronGeometry(w * (0.42 + r() * 0.18), 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const f = 0.85 + r() * 0.3; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f); }
    g.translate((r() - 0.5) * w * 0.8, h + (r() - 0.3) * w * 0.45, (k / (blobs - 1) - 0.5) * l);
    parts.push(col(g, hex));
  }
  return parts;
}

// all models face -z; legs are separate so they can step
function sheepBody(r) {
  const g = mergeGeometries([...wool(r, 7, 0.62, 0.78, 0.95, 0xe9e3d2), col(new THREE.SphereGeometry(0.16, 8, 6).translate(0, 0.86, 0.62), 0xe0d9c6)]);
  g.computeVertexNormals();
  return g;
}
function sheepHead() { // pivot at the neck; face down -z
  const face = new THREE.SphereGeometry(0.17, 10, 8).scale(0.85, 0.9, 1.45).translate(0, -0.02, -0.2);
  const ears = [-1, 1].map((s) => new THREE.SphereGeometry(0.07, 6, 4).scale(1.8, 0.5, 0.8).translate(s * 0.17, 0.06, -0.08));
  const tuft = new THREE.SphereGeometry(0.13, 8, 6).translate(0, 0.1, -0.08);
  const eyes = [-1, 1].map((s) => new THREE.SphereGeometry(0.028, 6, 4).translate(s * 0.1, 0.04, -0.3));
  const g = mergeGeometries([col(face, 0x2b2522), ...ears.map((e) => col(e, 0x2b2522)), col(tuft, 0xe9e3d2), ...eyes.map((e) => col(e, 0x0a0a0a))]);
  g.computeVertexNormals();
  return g;
}
const leg = (len, rad, hex) => col(new THREE.CylinderGeometry(rad * 0.8, rad, len, 6).translate(0, -len / 2, 0), hex);

function chickenBody(r, hex, tail) {
  const body = new THREE.SphereGeometry(0.2, 12, 9).scale(0.9, 0.85, 1.25).translate(0, 0.32, 0.02);
  const tailG = new THREE.ConeGeometry(0.12, 0.28, 7).rotateX(-0.9).translate(0, 0.46, 0.24);
  const wings = [-1, 1].map((s) => new THREE.SphereGeometry(0.11, 8, 6).scale(0.35, 0.75, 1.3).translate(s * 0.17, 0.33, 0.04));
  const g = mergeGeometries([col(body, hex), col(tailG, tail), ...wings.map((w) => col(w, tail))]);
  g.computeVertexNormals();
  return g;
}
function chickenHead() { // pivot at neck base
  const neck = new THREE.CylinderGeometry(0.06, 0.08, 0.16, 7).translate(0, 0.08, 0);
  const head = new THREE.SphereGeometry(0.075, 9, 7).translate(0, 0.18, -0.03);
  const comb = new THREE.BoxGeometry(0.025, 0.07, 0.1).translate(0, 0.26, -0.03);
  const wattle = new THREE.SphereGeometry(0.025, 6, 4).scale(1, 1.4, 1).translate(0, 0.12, -0.09);
  const beak = new THREE.ConeGeometry(0.025, 0.07, 6).rotateX(-Math.PI / 2).translate(0, 0.17, -0.12);
  const eyes = [-1, 1].map((s) => new THREE.SphereGeometry(0.014, 5, 4).translate(s * 0.06, 0.2, -0.06));
  const g = mergeGeometries([col(neck, 0xffffff), col(head, 0xffffff), col(comb, 0xd8261c), col(wattle, 0xd8261c), col(beak, 0xe8a83a), ...eyes.map((e) => col(e, 0x101010))]);
  g.computeVertexNormals();
  return g;
}

const SPEC = {
  sheep: { walk: 1.1, run: 5.5, sep: 3.2, startle: 22, r: 0.6, legLen: 0.48, legs: [[-0.2, -0.38], [0.2, -0.38], [-0.2, 0.36], [0.2, 0.36]], neck: [0, 0.92, -0.5], hipY: 0.5 },
  chicken: { walk: 0.7, run: 3.6, sep: 1.2, startle: 12, r: 0.22, legLen: 0.2, legs: [[-0.06, 0.02], [0.06, 0.02]], neck: [0, 0.4, -0.16], hipY: 0.2 },
};

export class Animals {
  constructor(world, scene, effects, audio) {
    this.world = world; this.effects = effects; this.audio = audio;
    const R = mulberry32(5150);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    this.list = [];
    for (const pad of world.paddocks || []) {
      const n = pad.kind === 'sheep' ? 9 + Math.floor(R() * 8) : 8 + Math.floor(R() * 6);
      pad.animals = [];
      for (let i = 0; i < n; i++) {
        const a = {
          kind: pad.kind, pad, free: false,
          x: pad.cx + (R() - 0.5) * pad.hx * 1.4, z: pad.cz + (R() - 0.5) * pad.hz * 1.4, y: 0,
          vx: 0, vz: 0, heading: R() * 6.28, phase: R() * 6.28, gait: 0,
          mode: 'graze', modeT: R() * 4, wx: 0, wz: 0, fear: 0, hop: 0, vy: 0, spin: 0, roll: 0,
          tint: pad.kind === 'chicken' ? (R() < 0.6 ? 0 : 1) : 0, noise: R() * 10,
        };
        pad.animals.push(a); this.list.push(a);
      }
    }
    // meshes: sheep (body, head, 4 legs) and two breeds of hen (brown, white) with head + 2 legs
    const N = (k, t) => this.list.filter((a) => a.kind === k && (t === undefined || a.tint === t)).length || 1;
    const mk = (geo, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.castShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; };
    this.mesh = {
      sheep: { body: mk(sheepBody(R), N('sheep')), head: mk(sheepHead(), N('sheep')), leg: mk(leg(0.48, 0.055, 0x2b2522), N('sheep') * 4) },
      hen0: { body: mk(chickenBody(R, 0x9a5a2a, 0x5a2e16), N('chicken', 0)), head: mk(chickenHead(), N('chicken', 0)), leg: mk(leg(0.2, 0.014, 0xe0a030), N('chicken', 0) * 2) },
      hen1: { body: mk(chickenBody(R, 0xf2efe6, 0xdad4c4), N('chicken', 1)), head: mk(chickenHead(), N('chicken', 1)), leg: mk(leg(0.2, 0.014, 0xe0a030), N('chicken', 1) * 2) },
    };
    const idx = { sheep: 0, hen0: 0, hen1: 0 };
    for (const a of this.list) { a.set = a.kind === 'sheep' ? 'sheep' : a.tint ? 'hen1' : 'hen0'; a.i = idx[a.set]++; a.y = world.terrainHeight(a.x, a.z); }
    this.m4 = new THREE.Matrix4(); this.m5 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1);
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.soundT = 2;
  }

  // is the fence piece where this animal is trying to cross still standing?
  fenceIntact(pad, side, t) {
    for (const s of pad.segs) if (s.side === side && t >= Math.min(s.a, s.b) - 0.2 && t <= Math.max(s.a, s.b) + 0.2) return !s.prop.broken;
    return true;
  }

  update(dt, time, camPos, cars, player) {
    const W = this.world;
    for (const pad of W.paddocks || []) {
      const near = Math.hypot(pad.cx - camPos.x, pad.cz - camPos.z) < 360 || pad.animals.some((a) => a.free && Math.hypot(a.x - camPos.x, a.z - camPos.z) < 360);
      pad.active = near;
      if (!near) continue;
      // flock centre for cohesion
      let cx = 0, cz = 0;
      for (const a of pad.animals) { cx += a.x; cz += a.z; }
      cx /= pad.animals.length; cz /= pad.animals.length;
      // cars around: what are we scared of?
      const threats = cars.filter((c) => !c.sleeping && Math.abs(c.pos.x - pad.cx) < pad.hx + 70 && Math.abs(c.pos.z - pad.cz) < pad.hz + 70);
      // a dinosaur about: much more frightening than any car
      for (const m of this.predators || []) if (Math.abs(m.x - pad.cx) < pad.hx + 120 && Math.abs(m.z - pad.cz) < pad.hz + 120) threats.push({ pos: { x: m.x, y: m.root.position.y, z: m.z }, vel: { length: () => 14 }, dino: true });
      for (const a of pad.animals) if (!a.eaten) this.step(a, pad, dt, time, cx, cz, threats, camPos, player);
    }
    this.draw(time, camPos);
    // the odd bleat or cluck nearby
    this.soundT -= dt;
    if (this.soundT <= 0 && this.audio.enabled) {
      this.soundT = 2.5 + Math.random() * 5;
      const near = this.list.filter((a) => Math.hypot(a.x - camPos.x, a.z - camPos.z) < 60);
      if (near.length) {
        const a = near[Math.floor(Math.random() * near.length)], d = Math.hypot(a.x - camPos.x, a.z - camPos.z);
        this.audio.animal(a.kind, Math.min(1, 14 / Math.max(6, d)), a.fear > 0.5);
      }
    }
  }

  step(a, pad, dt, time, cx, cz, threats, camPos, player) {
    const S = SPEC[a.kind], W = this.world;
    // knocked flying: simple ballistic tumble, then back on its feet and running
    if (a.hop > 0) {
      a.vy -= 9.8 * dt;
      a.x += a.vx * dt; a.z += a.vz * dt; a.y += a.vy * dt; a.roll += a.spin * dt;
      const g = W.terrainHeight(a.x, a.z);
      if (a.y <= g) { a.y = g; a.vy = 0; a.hop -= dt * 3; a.vx *= 0.8; a.vz *= 0.8; if (a.hop <= 0) { a.hop = 0; a.roll = 0; a.fear = 1; } }
      return;
    }
    let ax = 0, az = 0;
    // fear: nearest car, how close and how fast
    let fx = 0, fz = 0, fear = 0;
    for (const c of threats) {
      const dx = a.x - c.pos.x, dz = a.z - c.pos.z, d = Math.hypot(dx, dz) || 0.01;
      const sp = c.vel.length();
      const reach = c.dino ? 70 : S.startle * (0.5 + Math.min(1, sp / 12));
      if (d < reach) { const k = (1 - d / reach) * (0.4 + Math.min(1, sp / 8)); fx += (dx / d) * k; fz += (dz / d) * k; fear = Math.max(fear, k); }
      // hit!
      if (!c.dino && d < S.r + 1.3 && sp > 2.5 && Math.abs(a.y - c.pos.y) < 2) {
        a.hop = 1; a.vx = c.vel.x * 0.75 + (dx / d) * 2; a.vz = c.vel.z * 0.75 + (dz / d) * 2; a.vy = 2.5 + sp * 0.18; a.spin = (Math.random() - 0.5) * 14; a.y += 0.2;
        if (a.kind === 'sheep') this.effects.debris(a.x, a.y + 0.6, a.z, 0.95, 0.93, 0.88, 14);
        else this.effects.debris(a.x, a.y + 0.3, a.z, a.tint ? 0.97 : 0.7, a.tint ? 0.95 : 0.45, a.tint ? 0.9 : 0.25, 10);
        if (c === player && this.audio.enabled) this.audio.animal(a.kind, 1, true);
        return;
      }
    }
    a.fear = Math.max(fear, a.fear - dt * 0.35);
    // grazing / wandering cycles
    a.modeT -= dt;
    if (a.modeT <= 0) {
      const r = Math.random();
      if (a.kind === 'sheep') { a.mode = r < 0.65 ? 'graze' : 'walk'; a.modeT = a.mode === 'graze' ? 3 + Math.random() * 7 : 1.5 + Math.random() * 3; }
      else { a.mode = r < 0.45 ? 'peck' : r < 0.85 ? 'walk' : 'dash'; a.modeT = 0.6 + Math.random() * (a.mode === 'dash' ? 0.6 : 2.2); }
      const ang = Math.random() * 6.28;
      a.wx = Math.cos(ang); a.wz = Math.sin(ang);
    }
    const scared = a.fear > 0.08;
    let want = scared ? S.run * Math.min(1, 0.35 + a.fear) : a.mode === 'walk' ? S.walk : a.mode === 'dash' ? S.walk * 2.6 : 0;
    // steering: wander + flee + cohesion + separation
    ax += a.wx * want * 0.8;
    if (scared) { ax += fx * S.run * 2.2; az += fz * S.run * 2.2; }
    az += a.wz * want * 0.8;
    // a loose flock: a gentle pull to the group, and some strays that go their own way
    if (a.stray === undefined) a.stray = Math.random() < 0.25;
    const coh = a.stray && !scared ? 0 : a.kind === 'sheep' ? (scared ? 0.5 : 0.04) : 0.015;
    ax += (cx - a.x) * coh; az += (cz - a.z) * coh;
    for (const b of pad.animals) {
      if (b === a) continue;
      const dx = a.x - b.x, dz = a.z - b.z, d2 = dx * dx + dz * dz;
      if (d2 < S.sep * S.sep && d2 > 1e-6) { const d = Math.sqrt(d2), k = (S.sep - d) / S.sep * 6; ax += (dx / d) * k; az += (dz / d) * k; }
    }
    // accelerate toward the steering target (capped speed)
    const k = Math.min(1, dt * (scared ? 3 : 1.5));
    a.vx += (ax - a.vx) * k; a.vz += (az - a.vz) * k;
    const sp = Math.hypot(a.vx, a.vz), cap = scared ? S.run : Math.max(want, 0.05);
    if (sp > cap) { a.vx *= cap / sp; a.vz *= cap / sp; }
    if (!scared && want === 0) { a.vx *= Math.exp(-dt * 3); a.vz *= Math.exp(-dt * 3); }
    let nx = a.x + a.vx * dt, nz = a.z + a.vz * dt;
    // the fence: stay in unless the piece in the way is broken
    if (!a.free) {
      const m = S.r + 0.3;
      const x0 = pad.cx - pad.hx + m, x1 = pad.cx + pad.hx - m, z0 = pad.cz - pad.hz + m, z1 = pad.cz + pad.hz - m;
      if (nx < x0 && !this.fenceIntact(pad, 'w', nz)) a.free = true; else if (nx < x0) { nx = x0; a.vx = Math.abs(a.vx) * 0.3; a.wx = Math.abs(a.wx); }
      if (!a.free && nx > x1 && !this.fenceIntact(pad, 'e', nz)) a.free = true; else if (!a.free && nx > x1) { nx = x1; a.vx = -Math.abs(a.vx) * 0.3; a.wx = -Math.abs(a.wx); }
      if (!a.free && nz < z0 && !this.fenceIntact(pad, 'n', nx)) a.free = true; else if (!a.free && nz < z0) { nz = z0; a.vz = Math.abs(a.vz) * 0.3; a.wz = Math.abs(a.wz); }
      if (!a.free && nz > z1 && !this.fenceIntact(pad, 's', nx)) a.free = true; else if (!a.free && nz > z1) { nz = z1; a.vz = -Math.abs(a.vz) * 0.3; a.wz = -Math.abs(a.wz); }
    }
    a.x = nx; a.z = nz;
    a.y = this.world.terrainHeight(a.x, a.z);
    const v = Math.hypot(a.vx, a.vz);
    if (v > 0.15) {
      const want = Math.atan2(-a.vx, -a.vz);
      let d = want - a.heading; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283;
      a.heading += d * Math.min(1, dt * (scared ? 8 : 4));
    }
    a.gait += v * dt * (a.kind === 'sheep' ? 3.2 : 9);
    a.speed = v;
  }

  draw(time, camPos) {
    const { m4, m5, q, e, v, s } = this;
    const dirty = new Set();
    for (const a of this.list) {
      const M = this.mesh[a.set];
      const S = SPEC[a.kind];
      const visible = !a.eaten && a.pad.active && Math.hypot(a.x - camPos.x, a.z - camPos.z) < 300;
      if (!visible) {
        M.body.setMatrixAt(a.i, this.zero); M.head.setMatrixAt(a.i, this.zero);
        for (let l = 0; l < S.legs.length; l++) M.leg.setMatrixAt(a.i * S.legs.length + l, this.zero);
        dirty.add(M);
        continue;
      }
      const bounce = a.speed > 0.3 ? Math.abs(Math.sin(a.gait * 2)) * (a.kind === 'sheep' ? 0.05 : 0.03) : 0;
      e.set(a.roll * 0.3, a.heading, a.roll, 'YXZ');
      q.setFromEuler(e);
      m4.compose(v.set(a.x, a.y + bounce, a.z), q, s.set(1, 1, 1));
      M.body.setMatrixAt(a.i, m4);
      // head: down to graze / peck, up and looking round otherwise
      let pitch = 0, yaw = Math.sin(time * 0.7 + a.noise) * 0.3;
      if (a.kind === 'sheep' && a.mode === 'graze' && a.fear < 0.1 && a.speed < 0.3) pitch = 0.95 + Math.sin(time * 3 + a.noise) * 0.06;
      if (a.kind === 'chicken' && a.mode === 'peck' && a.fear < 0.1) pitch = Math.max(0, Math.sin(time * 9 + a.noise * 3)) * 1.1;
      if (a.fear > 0.1) { pitch = -0.2; yaw = 0; }
      e.set(-pitch, yaw, 0, 'YXZ');
      m5.compose(v.set(S.neck[0], S.neck[1], S.neck[2]), q.setFromEuler(e), s.set(1, 1, 1));
      M.head.setMatrixAt(a.i, m5.premultiply(m4));
      // legs swing with the gait
      S.legs.forEach(([lx, lz], l) => {
        const sw = a.speed > 0.15 ? Math.sin(a.gait * 2 + (l % 2 === 0 ? 0 : Math.PI) + (l >= 2 ? Math.PI : 0)) * Math.min(0.7, a.speed * 0.25) : 0;
        e.set(sw, 0, 0);
        m5.compose(v.set(lx, S.hipY, lz), q.setFromEuler(e), s.set(1, 1, 1));
        M.leg.setMatrixAt(a.i * S.legs.length + l, m5.premultiply(m4));
      });
      dirty.add(M);
    }
    for (const M of dirty) { M.body.instanceMatrix.needsUpdate = M.head.instanceMatrix.needsUpdate = M.leg.instanceMatrix.needsUpdate = true; }
  }
}
