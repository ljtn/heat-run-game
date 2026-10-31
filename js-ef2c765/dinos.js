// Primeval Valley: the gate arch, electric paddock fences, prehistoric planting, and the sauropods.
// Each sauropod is a jointed rig: a deep barrel body on four pillar legs (thigh, shin, broad foot), a long neck of
// tapering segments carried high in an S-curve and a whip tail held clear of the ground. They walk in a
// four-beat lateral sequence (hind-left, fore-left, hind-right, fore-right): the body bobs twice per stride and
// rolls with the weight shift, the neck counter-sways, the tail swings. Between walks they browse: necks up into
// the treetops, heads working slowly.
import * as THREE from 'three';
import { mergeGeometries } from '../lib/addons/utils/BufferGeometryUtils.js';
import { PARK } from './world.js';

const TAU = Math.PI * 2;
const _fwd = new THREE.Vector3();

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

// wrinkled, mottled hide: big soft blotches, fine pebbly scales, darker along the back
function skinTexture() {
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#7f8070'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { ctx.fillStyle = `rgba(${60 + Math.random() * 40},${60 + Math.random() * 30},${45 + Math.random() * 25},0.35)`; ctx.beginPath(); ctx.ellipse(Math.random() * w, Math.random() * h, 8 + Math.random() * 30, 6 + Math.random() * 18, Math.random() * 3, 0, TAU); ctx.fill(); }
    for (let i = 0; i < 5000; i++) { const v = Math.random(); ctx.fillStyle = v < 0.5 ? 'rgba(40,36,28,0.25)' : 'rgba(200,190,160,0.18)'; ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
    ctx.strokeStyle = 'rgba(40,34,26,0.12)'; ctx.lineWidth = 1;
    for (let i = 0; i < 30; i++) { const y = Math.random() * h; ctx.beginPath(); ctx.moveTo(0, y); for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.08 + i) * 3); ctx.stroke(); } // skin folds
  });
}

// ---------------- a sauropod ----------------
class Sauropod {
  constructor(scene, mat, belly, start, kind) {
    this.kind = kind; // 0: high-shouldered browser (giraffe-like stance), 1: long low grazer
    const S = kind === 0 ? 1.4 : 1.3; // big: around 30 m nose to tail, the browser's head 15 m up
    this.x = start.x; this.z = start.z; this.heading = start.heading; this.pad = start.pad;
    this.state = 'walk'; this.t = 0; this.target = null; this.phase = Math.random(); this.speed = 0;
    this.browse = 0; this.browseTarget = 0; this.neckSway = 0; this.headBob = 0;
    const root = (this.root = new THREE.Group());
    root.scale.setScalar(S);
    scene.add(root);
    const body = (this.body = new THREE.Group());
    root.add(body);
    const hipH = kind === 0 ? 5.4 : 5.0, shH = kind === 0 ? 6.6 : 5.2;
    this.hipH = hipH; this.shH = shH;
    // the barrel: deepest at the chest, a hump over the hips, tapering into neck and tail
    const torso = new THREE.SphereGeometry(1, 28, 20);
    const p = torso.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const front = z > 0 ? z : 0, back = z < 0 ? -z : 0;
      const w = 2.25 * (1 - 0.16 * back * back) * (1 - 0.1 * front * front), hgt = 2.45 * (1 + 0.1 * front - 0.14 * back * back);
      x *= w; y *= hgt; if (y < 0) y *= 1.08; // a deep belly
      z *= 4.9;
      y += (shH - hipH) * 0.5 * (z / 4.9); // the back slopes up to the shoulders
      p.setXYZ(i, x, y, z);
    }
    torso.computeVertexNormals();
    const torsoM = new THREE.Mesh(torso, mat); torsoM.position.set(0, (hipH + shH) / 2 + 0.5, 0.2);
    torsoM.castShadow = true; body.add(torsoM);
    // legs: column-like, the forelegs straighter, the hind thighs heavier
    this.legs = [];
    const legDef = [[-1.45, -3.0, true], [1.45, -3.0, true], [-1.4, 3.2, false], [1.4, 3.2, false]]; // LH, RH, LF, RF
    const phaseOff = [0, 0.5, 0.25, 0.75];
    legDef.forEach(([x, z, hind], i) => {
      const topY = hind ? hipH + 0.6 : shH + 0.2, thighL = hind ? 2.9 : 3.0, shinL = topY - thighL - 0.35;
      const hip = new THREE.Group(); hip.position.set(x, topY, z); body.add(hip);
      const r0 = hind ? 1.05 : 0.85, r1 = hind ? 0.78 : 0.7; // pillar legs
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, thighL, 14).translate(0, -thighL / 2, 0), mat); thigh.castShadow = true; hip.add(thigh);
      hip.add(new THREE.Mesh(new THREE.SphereGeometry(r0 * 1.05, 14, 10), mat)); // the joint at the body
      const knee = new THREE.Group(); knee.position.y = -thighL; hip.add(knee);
      knee.add(new THREE.Mesh(new THREE.SphereGeometry(r1 * 1.02, 12, 8), mat));
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.66, r1, shinL, 14).translate(0, -shinL / 2, 0), mat); shin.castShadow = true; knee.add(shin);
      const ankle = new THREE.Group(); ankle.position.y = -shinL; knee.add(ankle);
      // a broad elephant-like foot with blunt toes
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.88, 0.45, 16).translate(0, -0.14, 0.08), belly); foot.castShadow = true; ankle.add(foot);
      for (let k = -1; k <= 1; k++) ankle.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6).translate(k * 0.3, -0.25, 0.62), belly));
      this.legs.push({ hip, knee, ankle, phase: phaseOff[i], hind });
    });
    // neck: tapering segments chained from the shoulders
    this.neck = [];
    const NS = 12, neckL = kind === 0 ? 9.6 : 8.6;
    let parent = new THREE.Group(); parent.position.set(0, shH + 1.0, 4.3); body.add(parent);
    for (let k = 0; k < NS; k++) {
      const f = k / NS, len = neckL / NS, r0 = 1.25 - f * 0.85, r1 = 1.25 - (k + 1) / NS * 0.85;
      const seg = new THREE.Group(); parent.add(seg);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len * 1.08, 14).rotateX(Math.PI / 2).translate(0, 0, len / 2), mat); m.castShadow = true; seg.add(m);
      seg.add(new THREE.Mesh(new THREE.SphereGeometry(r0, 12, 8), mat));
      this.neck.push(seg);
      const next = new THREE.Group(); next.position.z = len; seg.add(next); parent = next;
    }
    // head: a small long skull, a domed brow, nostrils high on the snout
    const head = (this.head = new THREE.Group()); parent.add(head);
    const skull = new THREE.SphereGeometry(1, 16, 12).scale(0.36, 0.34, 0.75).translate(0, 0.05, 0.55);
    head.add(new THREE.Mesh(skull, mat));
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8).translate(0, 0.28, 0.45), mat)); // brow/nasal dome
    head.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.5).translate(0, -0.18, 0.85), belly)); // lower jaw
    for (const sx of [-1, 1]) head.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5).translate(sx * 0.27, 0.12, 0.62), new THREE.MeshBasicMaterial({ color: 0x0a0806 }))); // eyes
    // tail: long, tapering to a whip
    this.tail = [];
    const TS = 16, tailL = kind === 0 ? 11 : 13.5;
    parent = new THREE.Group(); parent.position.set(0, hipH + 1.0, -4.4); body.add(parent);
    for (let k = 0; k < TS; k++) {
      const f = k / TS, len = tailL / TS, r0 = 1.15 * Math.pow(1 - f, 1.3) + 0.06, r1 = 1.15 * Math.pow(1 - (k + 1) / TS, 1.3) + 0.04;
      const seg = new THREE.Group(); parent.add(seg);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len * 1.1, 12).rotateX(Math.PI / 2).translate(0, 0, -len / 2), mat); m.castShadow = true; seg.add(m);
      seg.add(new THREE.Mesh(new THREE.SphereGeometry(r0, 10, 8), mat));
      this.tail.push(seg);
      const next = new THREE.Group(); next.position.z = -len; seg.add(next); parent = next;
    }
    this.S = S;
  }

  pickTarget(world, R) {
    for (let t = 0; t < 40; t++) {
      const x = PARK.x + (R() - 0.5) * 2 * PARK.r, z = PARK.z + (R() - 0.5) * 2 * PARK.r;
      if (this.pad.test(x, z) && world.fenceDist(x, z) > 26) { this.target = { x, z }; return; }
    }
    this.target = { x: PARK.x, z: PARK.z };
  }

  update(dt, world, time, others) {
    const R = Math.random;
    if (!this.target) this.pickTarget(world, R);
    this.t -= dt;
    // walking or browsing
    let want = 0;
    if (this.state === 'walk') {
      const dx = this.target.x - this.x, dz = this.target.z - this.z, d = Math.hypot(dx, dz);
      want = 1.5;
      const tgt = Math.atan2(dx, dz);
      let dh = tgt - this.heading; while (dh > Math.PI) dh -= TAU; while (dh < -Math.PI) dh += TAU;
      this.heading += Math.max(-0.14 * dt, Math.min(0.14 * dt, dh));
      if (Math.abs(dh) > 0.8) want = 0.8; // turning on the spot is slow and heavy
      if (d < 6) { this.state = 'browse'; this.t = 8 + R() * 12; this.browseTarget = R() < 0.65 ? 1 : -0.6; }
    } else if (this.t <= 0) { this.state = 'walk'; this.pickTarget(world, R); }
    // keep clear of the fence and of each other
    const ahead = { x: this.x + Math.sin(this.heading) * 12 * this.S, z: this.z + Math.cos(this.heading) * 12 * this.S };
    if (!this.pad.test(ahead.x, ahead.z) || world.fenceDist(ahead.x, ahead.z) < 12) { want = Math.min(want, 0.4); this.pickTarget(world, R); }
    for (const o of others) if (o !== this && Math.hypot(o.x - ahead.x, o.z - ahead.z) < 14) want = 0;
    this.speed += (want - this.speed) * Math.min(1, dt * 0.6);
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.browse += ((this.state === 'browse' ? this.browseTarget : 0) - this.browse) * Math.min(1, dt * 0.35);
    // gait: one stride is ~3.6 m of travel
    const strideS = 3.6 * this.S, legLenS = 5.6 * this.S;
    this.phase = (this.phase + (this.speed / strideS) * dt) % 1;
    const Aleg = Math.atan((0.72 * strideS * 0.5) / legLenS); // planted feet move back exactly as far as the body moves on
    const gaitAmt = Math.min(1, this.speed / 1.2);
    const y = world.terrainHeight(this.x, this.z);
    this.root.position.set(this.x, y, this.z);
    this.root.rotation.y = this.heading;
    // body: bobs twice a stride, rolls toward the planted side
    this.body.position.y = Math.sin(this.phase * TAU * 2) * 0.12 * gaitAmt;
    this.body.rotation.z = Math.sin(this.phase * TAU) * 0.035 * gaitAmt;
    this.body.rotation.x = Math.sin(this.phase * TAU * 2 + 0.6) * 0.012 * gaitAmt;
    for (const L of this.legs) {
      const ph = (this.phase + L.phase) % 1, A = Aleg * gaitAmt;
      let swing, lift;
      if (ph < 0.72) { swing = A - (ph / 0.72) * 2 * A; lift = 0; } // planted, sweeping back under the body
      else { const u = (ph - 0.72) / 0.28; swing = -A + u * 2 * A; lift = Math.sin(u * Math.PI); } // lifted and carried forward
      const knee = lift * (L.hind ? 0.55 : 0.45) * gaitAmt;
      L.hip.rotation.x = -swing - (L.hind ? -knee * 0.25 : knee * 0.35);
      L.knee.rotation.x = L.hind ? -knee : knee; // hind knees fold forward, fore "knees" (wrists) fold back
      L.ankle.rotation.x = -(L.hip.rotation.x + L.knee.rotation.x); // the foot stays level
    }
    // neck: an upward S-curve, raised high to browse (or swung low to graze), swaying gently against the stride
    const base = this.kind === 0 ? -0.8 : -0.5, up = this.browse > 0 ? this.browse * -0.3 : this.browse * -0.6;
    this.neckSway += (Math.sin(time * 0.31 + this.x) * 0.25 - this.neckSway) * Math.min(1, dt * 0.5);
    this.neck.forEach((seg, k) => {
      const f = k / this.neck.length;
      const curve = k === 0 ? base + up : k < 5 ? -0.035 : 0.07 * (f - 0.35); // up, up a little more, then easing forward to the head
      seg.rotation.x = curve + (k > 0 && this.browse < 0 ? 0.12 : 0) + (k > 0 ? up * 0.06 : 0);
      seg.rotation.y = (k === 0 ? this.neckSway * 0.5 : this.neckSway * 0.06) - Math.sin(this.phase * TAU) * 0.012 * gaitAmt;
    });
    this.headBob = Math.sin(time * (this.state === 'browse' ? 1.3 : 0.5) + this.z) * (this.state === 'browse' ? 0.12 : 0.04);
    this.head.rotation.x = 0.55 + this.headBob + (this.browse < 0 ? 0.4 : 0);
    // tail: carried out behind, a slow travelling wave side to side
    this.tail.forEach((seg, k) => {
      const f = k / this.tail.length;
      seg.rotation.x = k === 0 ? 0.28 : -0.035 + f * 0.02;
      seg.rotation.y = Math.sin(time * 0.9 - k * 0.38 + this.phase * TAU) * (0.03 + f * 0.06) * (0.4 + gaitAmt * 0.6);
    });
  }
}

// ---------------- plants ----------------
function plantGeos() {
  const paint = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g.index ? g.toNonIndexed() : g; };
  const frond = (len, w, droop, hex, ang, tilt, y) => { // a leaf blade arching out and down
    const g = new THREE.PlaneGeometry(w, len, 1, 6), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = (p.getY(i) + len / 2) / len; p.setXYZ(i, p.getX(i) * (1 - t * 0.7), t * len, -droop * t * t * len); }
    g.rotateX(-Math.PI / 2 + tilt); g.rotateY(ang); g.translate(0, y, 0);
    return paint(g, hex);
  };
  const fern = [paint(new THREE.CylinderGeometry(0.22, 0.32, 5, 8).translate(0, 2.5, 0), 0x4a3524)];
  for (let k = 0; k < 12; k++) fern.push(frond(3.4, 0.9, 0.5, k % 2 ? 0x3e6a2a : 0x4f7c32, (k / 12) * TAU, 0.9 - (k % 3) * 0.15, 5));
  const puzzle = [paint(new THREE.CylinderGeometry(0.3, 0.55, 16, 8).translate(0, 8, 0), 0x5a4636)];
  for (let w2 = 0; w2 < 6; w2++) for (let k = 0; k < 6; k++) { // whorls of up-curving branches with dark tufts, a domed crown
    const y = 10 + w2 * 1.2, r = 3.4 - w2 * 0.45, a = (k / 6) * TAU + w2;
    const br = new THREE.CylinderGeometry(0.08, 0.12, r, 5).rotateZ(Math.PI / 2 - 0.25).translate(r / 2, y, 0).rotateY(a);
    puzzle.push(paint(br, 0x5a4636));
    puzzle.push(paint(new THREE.SphereGeometry(0.75, 6, 5).scale(1.2, 0.7, 1.2).translate(Math.cos(a) * r, y + 0.6, -Math.sin(a) * r), 0x1f3a1c));
  }
  puzzle.push(paint(new THREE.SphereGeometry(2.2, 8, 6).scale(1, 0.6, 1).translate(0, 16.4, 0), 0x223f1e));
  const cycad = [paint(new THREE.CylinderGeometry(0.4, 0.55, 1.4, 8).translate(0, 0.7, 0), 0x5e4a30)];
  for (let k = 0; k < 14; k++) cycad.push(frond(2.2, 0.55, 0.15, 0x56802e, (k / 14) * TAU, 0.6, 1.4));
  return [fern, puzzle, cycad].map((parts) => { const g = mergeGeometries(parts); g.computeVertexNormals(); return g; });
}

export class PrimevalValley {
  constructor(world, scene) {
    this.world = world;
    if (!world.parkGate) return;
    const steel = 0x5a5e62, post = 0x6e6a64;
    const parts = [], col = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g.index ? g.toNonIndexed() : g); };
    // fences: concrete posts, six live wires, insulators; a warning sign every so often
    const signs = [];
    world.parkFences.forEach((f, i) => {
      const L = Math.hypot(f.bx - f.ax, f.bz - f.az), rot = Math.atan2(-(f.bz - f.az), f.bx - f.ax), mx = (f.ax + f.bx) / 2, mz = (f.az + f.bz) / 2;
      col(new THREE.BoxGeometry(0.4, 6.4, 0.4).translate(f.ax, f.y + 3.2, f.az), post);
      col(new THREE.BoxGeometry(0.8, 0.3, 0.8).translate(f.ax, f.y + 6.45, f.az), post);
      for (let k = 0; k < 6; k++) col(new THREE.CylinderGeometry(0.025, 0.025, L, 4).rotateZ(Math.PI / 2).rotateY(rot).translate(mx, f.y + 0.8 + k * 0.95, mz), steel);
      if (i % 10 === 0) signs.push({ x: mx, z: mz, y: f.y, rot });
    });
    // the gate: stone footings, log columns, a log lintel with the name board, torches, gates swung open
    const G = world.parkGate, gr = Math.atan2(G.tx, G.tz), nx = -G.tz, nz = G.tx;
    for (const sd of [-1, 1]) {
      const x = G.x + nx * G.half * sd, z = G.z + nz * G.half * sd;
      col(new THREE.BoxGeometry(3.2, 3, 3.2).rotateY(gr).translate(x, G.y + 1.5, z), 0x8a8478);
      for (const o of [-0.7, 0.7]) col(new THREE.CylinderGeometry(0.55, 0.65, 13, 10).translate(x + G.tx * o, G.y + 9, z + G.tz * o), 0x6a4a2c);
      col(new THREE.ConeGeometry(0.9, 1.4, 8).translate(x, G.y + 16.2, z), 0x4a3420);
      col(new THREE.CylinderGeometry(0.18, 0.12, 1.3, 6).translate(x - G.tx * 1.1, G.y + 4.2, z - G.tz * 1.1), 0x3a2a1a); // torch
      // the gate leaf, swung open along the inside of the drive
      const leafW = G.half - 1.4, hx = x + G.tx * 1.6 - nx * sd * 1.4, hz = z + G.tz * 1.6 - nz * sd * 1.4;
      const leaf = new THREE.BoxGeometry(0.3, 7, leafW).translate(0, 3.5, leafW / 2);
      leaf.rotateY(gr + sd * 0.12); leaf.translate(hx, G.y, hz);
      col(leaf, 0x5a3e24);
    }
    col(new THREE.CylinderGeometry(0.7, 0.7, G.half * 2 + 5, 10).rotateZ(Math.PI / 2).rotateY(gr).translate(G.x, G.y + 14.6, G.z), 0x6a4a2c); // lintel log, across the drive
    const fm = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    fm.castShadow = fm.receiveShadow = true;
    scene.add(fm);
    // the name board: carved timber, fiery letters, a ring of jungle leaves
    const boardTex = canvasTex(1024, 320, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5a3a1e'); g.addColorStop(1, '#3a2412'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; for (let y = 10; y < h; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); for (let x = 0; x < w; x += 40) ctx.lineTo(x, y + Math.sin(x * 0.03 + y) * 3); ctx.stroke(); }
      for (let i = 0; i < 40; i++) { ctx.fillStyle = i % 2 ? '#2e5a20' : '#3f7a2a'; ctx.beginPath(); const x = i < 20 ? (i / 20) * w : ((i - 20) / 20) * w, y = i < 20 ? 8 : h - 8; ctx.ellipse(x, y, 34, 12, (i % 5) - 2, 0, TAU); ctx.fill(); }
      ctx.font = '900 112px Impact, "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#1a0e06'; ctx.fillText(PARK.name, w / 2 + 6, h / 2 + 8);
      const tg = ctx.createLinearGradient(0, h * 0.3, 0, h * 0.7); tg.addColorStop(0, '#ffd23a'); tg.addColorStop(1, '#e8541a'); ctx.fillStyle = tg; ctx.fillText(PARK.name, w / 2, h / 2);
      ctx.lineWidth = 3; ctx.strokeStyle = '#2a1408'; ctx.strokeText(PARK.name, w / 2, h / 2);
    });
    const board = new THREE.Mesh(new THREE.BoxGeometry(G.half * 2 + 2, (G.half * 2 + 2) * 0.31, 0.5), [0, 0, 0, 0, 1, 1].map((k) => (k ? new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.8 }) : new THREE.MeshStandardMaterial({ color: 0x3a2412 }))));
    board.position.set(G.x, G.y + 12.2, G.z); board.rotation.y = gr;
    board.castShadow = true;
    scene.add(board);
    // torches burning on the columns
    this.torches = [-1, 1].map((sd) => {
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 8), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.position.set(G.x + nx * G.half * sd - G.tx * 1.1, G.y + 5.2, G.z + nz * G.half * sd - G.tz * 1.1);
      scene.add(s);
      return s;
    });
    // warning signs on the fence
    const signTex = canvasTex(256, 160, (ctx, w, h) => {
      ctx.fillStyle = '#f2c419'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#111'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.font = 'bold 44px Impact, sans-serif'; ctx.fillText('DANGER', w / 2, 60);
      ctx.font = 'bold 24px Arial, sans-serif'; ctx.fillText('HIGH VOLTAGE FENCE', w / 2, 100); ctx.fillText('KEEP OUT', w / 2, 132);
    });
    const sg = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshStandardMaterial({ map: signTex, side: THREE.DoubleSide, roughness: 0.6 }), signs.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    signs.forEach((s, i) => { q.setFromAxisAngle(up, s.rot + Math.PI / 2); m4.compose(new THREE.Vector3(s.x, s.y + 2.2, s.z), q, new THREE.Vector3(1, 1, 1)); sg.setMatrixAt(i, m4); });
    scene.add(sg);
    // plants
    const pg = plantGeos(), pmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    [0, 1, 2].forEach((kind) => {
      const list = world.parkFlora.filter((f) => f.kind === kind);
      const im = new THREE.InstancedMesh(pg[kind], pmat, list.length);
      list.forEach((f, i) => { q.setFromAxisAngle(up, f.rot); m4.compose(new THREE.Vector3(f.x, f.y - 0.1, f.z), q, new THREE.Vector3(f.s, f.s, f.s)); im.setMatrixAt(i, m4); });
      im.castShadow = im.receiveShadow = true;
      scene.add(im);
    });
    // the sauropods
    const skin = skinTexture();
    skin.repeat.set(3, 3);
    const mat = new THREE.MeshStandardMaterial({ map: skin, color: 0xa8a894, roughness: 0.92 });
    const belly = new THREE.MeshStandardMaterial({ map: skin, color: 0xa89a84, roughness: 0.95 });
    this.dinos = world.dinoStarts.map((s, i) => new Sauropod(scene, mat, belly, s, i % 2));
    this.buildCompound(world, scene);
  }

  // the tyrannosaur compound: heavy panels (each its own instance so it can be knocked out), a closed gate,
  // floodlight towers, a guard booth, warning signs all over
  buildCompound(world, scene) {
    const C = world.rex;
    if (!C) return;
    const panelG = mergeGeometries([
      new THREE.BoxGeometry(4, 0.3, 0.3).translate(0, 0.15, 0), new THREE.BoxGeometry(4, 0.25, 0.25).translate(0, 7.9, 0),
      ...[1.4, 2.8, 4.2, 5.6, 7].map((y) => new THREE.BoxGeometry(4, 0.08, 0.08).translate(0, y, 0)),
      ...[-1, 0, 1].map((x) => new THREE.BoxGeometry(0.09, 8, 0.09).translate(x * 1.3, 4, 0)),
      new THREE.BoxGeometry(0.45, 8.6, 0.45).translate(-2, 4.3, 0),
    ].map((g) => g.toNonIndexed()));
    const gateG = mergeGeometries([new THREE.BoxGeometry(4, 8.5, 0.35).translate(0, 4.25, 0), new THREE.BoxGeometry(4.2, 0.4, 0.5).translate(0, 4, 0)].map((g) => g.toNonIndexed()));
    const pm = new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.55, metalness: 0.6 });
    const gm = new THREE.MeshStandardMaterial({ color: 0x7a6a3a, roughness: 0.6, metalness: 0.5 });
    const fence = C.panels.filter((p) => !p.gate), gates = C.panels.filter((p) => p.gate);
    this.panelMeshes = [[fence, new THREE.InstancedMesh(panelG, pm, fence.length)], [gates, new THREE.InstancedMesh(gateG, gm, gates.length)]];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    for (const [list, im] of this.panelMeshes) {
      list.forEach((p, i) => { p.im = im; p.ii = i; q.setFromAxisAngle(up, Math.atan2(-(p.z1 - p.z0), p.x1 - p.x0)); m4.compose(new THREE.Vector3((p.x0 + p.x1) / 2, p.y, (p.z0 + p.z1) / 2), q, one); im.setMatrixAt(i, m4); });
      im.castShadow = true; scene.add(im);
    }
    // warning signs every few panels, big ones at the gate
    const signTex = canvasTex(256, 192, (ctx, w, h) => {
      ctx.fillStyle = '#f2c419'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#111'; for (let k = -2; k < 12; k++) { ctx.beginPath(); ctx.moveTo(k * 32, 0); ctx.lineTo(k * 32 + 16, 0); ctx.lineTo(k * 32 - 8, 24); ctx.lineTo(k * 32 - 24, 24); ctx.fill(); }
      ctx.fillStyle = '#c81e1e'; ctx.fillRect(10, 30, w - 20, 54); ctx.fillStyle = '#fff'; ctx.font = 'bold 44px Impact, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('DANGER', w / 2, 74);
      ctx.fillStyle = '#111'; ctx.font = 'bold 22px Arial, sans-serif'; ctx.fillText('LARGE CARNIVORE', w / 2, 116); ctx.fillText('DO NOT APPROACH', w / 2, 144); ctx.fillText('10,000 VOLTS', w / 2, 172);
    });
    const sm = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6, side: THREE.DoubleSide });
    const sp = C.panels.filter((p, i) => i % 3 === 1 && !p.gate);
    const signs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.6, 1.2), sm, sp.length + 4);
    sp.forEach((p, i) => { const rot = Math.atan2(-(p.z1 - p.z0), p.x1 - p.x0); q.setFromAxisAngle(up, rot); const ox = Math.sin(rot) * 0.25, oz = Math.cos(rot) * 0.25; m4.compose(new THREE.Vector3((p.x0 + p.x1) / 2 - ox, p.y + 2.4, (p.z0 + p.z1) / 2 - oz), q, one); signs.setMatrixAt(i, m4); });
    [[-12, 6], [-12, -6], [-26, 14], [-26, -14]].forEach(([dx, dz], k) => { q.setFromAxisAngle(up, -Math.PI / 2); m4.compose(new THREE.Vector3(C.x - C.half + dx, C.y + 2.2, C.gateZ + dz), q, new THREE.Vector3(2.2, 2.2, 1)); signs.setMatrixAt(sp.length + k, m4); });
    scene.add(signs);
    // sign posts for the free-standing ones, floodlight towers, the guard booth
    const parts = [], col = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g.index ? g.toNonIndexed() : g); };
    for (const [dx, dz] of [[-12, 6], [-12, -6], [-26, 14], [-26, -14]]) col(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 6).translate(C.x - C.half + dx, C.y + 1.7, C.gateZ + dz + 0.3), 0x5a5e62);
    for (const [x, z] of C.towers) {
      col(new THREE.CylinderGeometry(0.35, 0.5, 18, 8).translate(x, C.y + 9, z), 0x5a5e62);
      col(new THREE.BoxGeometry(3, 0.3, 1).translate(x, C.y + 18, z), 0x3a3e42);
      for (const o of [-1, 0, 1]) col(new THREE.BoxGeometry(0.7, 0.6, 0.5).translate(x + o * 0.9, C.y + 18.4, z), 0xe8e8e0);
    }
    const B = C.booth;
    col(new THREE.BoxGeometry(3.2, 2.8, 3.2).translate(B.x, C.y + 1.4, B.z), 0xd8d2c4);
    col(new THREE.BoxGeometry(3.6, 0.3, 3.6).translate(B.x, C.y + 2.95, B.z), 0x3a3e42);
    col(new THREE.BoxGeometry(3.25, 1, 2.6).translate(B.x, C.y + 1.8, B.z), 0x2a3a44);
    const cm = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
    cm.castShadow = cm.receiveShadow = true;
    scene.add(cm);
    this.floods = C.towers.map(([x, z]) => { const l = new THREE.SpotLight(0xfff4e0, 0, 120, 0.7, 0.5, 1.2); l.position.set(x, C.y + 18, z); l.target.position.set(C.x, C.y, C.z); scene.add(l, l.target); return l; });
  }

  // a panel knocked out: hide it; a breach sets the tyrannosaur loose
  breakPanel(idx, rex) {
    const C = this.world.rex, p = C.panels[idx];
    if (!p || p.broken) return;
    p.broken = true;
    p.im.setMatrixAt(p.ii, new THREE.Matrix4().makeScale(0, 0, 0)); p.im.instanceMatrix.needsUpdate = true;
    if (rex && rex.state === 'caged') {
      rex.state = 'escaping'; rex.breach = { x: (p.x0 + p.x1) / 2 + Math.sign((p.x0 + p.x1) / 2 - C.x) * 8 * (Math.abs(p.x0 - p.x1) < 1 ? 1 : 0), z: (p.z0 + p.z1) / 2 + Math.sign((p.z0 + p.z1) / 2 - C.z) * 8 * (Math.abs(p.z0 - p.z1) < 1 ? 1 : 0) };
      rex.roar();
      return true;
    }
    return false;
  }

  // put everything back: panels up, the animal back inside
  reset(rex) {
    const C = this.world.rex;
    if (!C) return;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    for (const p of C.panels) if (p.broken) { p.broken = false; q.setFromAxisAngle(up, Math.atan2(-(p.z1 - p.z0), p.x1 - p.x0)); m4.compose(new THREE.Vector3((p.x0 + p.x1) / 2, p.y, (p.z0 + p.z1) / 2), q, one); p.im.setMatrixAt(p.ii, m4); p.im.instanceMatrix.needsUpdate = true; }
    if (rex) rex.place();
  }

  update(dt, time, camPos) {
    if (!this.dinos) return;
    const near = Math.hypot(camPos.x - PARK.x, camPos.z - PARK.z) < PARK.r + 900;
    for (const d of this.dinos) {
      d.root.visible = near;
      if (near) d.update(Math.min(dt, 0.05), this.world, time, this.dinos);
    }
    for (const t of this.torches) { const f = 0.85 + Math.sin(time * 17 + t.position.x) * 0.1 + Math.sin(time * 29) * 0.06; t.scale.set(f, 0.8 + f * 0.4, f); }
    const nearC = this.world.rex && Math.hypot(camPos.x - this.world.rex.x, camPos.z - this.world.rex.z) < 600;
    if (this.floods) for (const l of this.floods) l.intensity = nearC ? (this.night ? 900 : 0) : 0;
  }
}

// ---------------- the tyrannosaur ----------------
// A biped balanced over the hips: the body leans forward, the heavy tail counterweights the huge head. Legs are
// bird-like: thigh, shin and a long metatarsus, walking on three toes, the knee forward and the ankle back.
// Caged it paces its compound and comes to the fence to roar at you; loose, it heads along the roads for the city,
// charges you when you're close, shoves and stomps cars and swings its tail into police cars.
export class TRex {
  constructor(scene, world, game) {
    this.world = world; this.game = game;
    const C = world.rex;
    this.x = C.x; this.z = C.z; this.heading = 0; this.speed = 0; this.phase = 0;
    this.state = 'caged'; this.t = 0; this.target = null; this.roarT = 0; this.jaw = 0; this.swipe = 0; this.swipeDir = 1; this.swipeCool = 0; this.path = [];
    const skin = skinTexture(); skin.repeat.set(4, 4);
    const mat = new THREE.MeshStandardMaterial({ map: skin, color: 0x6a6450, roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ map: skin, color: 0x3e3a2e, roughness: 0.85 });
    const pale = new THREE.MeshStandardMaterial({ map: skin, color: 0x9a907a, roughness: 0.9 });
    const tooth = new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.4 });
    const mouth = new THREE.MeshStandardMaterial({ color: 0x5a1a14, roughness: 0.6 });
    const S = 1.15;
    const root = (this.root = new THREE.Group()); root.scale.setScalar(S); scene.add(root);
    const hipH = 4.0;
    const pelvis = (this.pelvis = new THREE.Group()); pelvis.position.y = hipH; root.add(pelvis);
    // torso: deep chest, slung belly, tapering from the hips forward to the neck
    const tg = new THREE.SphereGeometry(1, 26, 18), p = tg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i); // z: -1 (hips) .. +1 (shoulders)
      const w = 1.25 * (1 - 0.25 * Math.max(0, z) ** 2), hgt = 1.45 * (1 + 0.15 * (z > 0 ? -z : 0)) * (y < 0 ? 1.2 : 1);
      p.setXYZ(i, x * w, y * hgt - z * 0.25, z * 2.8 + 1.4);
    }
    tg.computeVertexNormals();
    const torso = new THREE.Mesh(tg, mat); torso.castShadow = true; pelvis.add(torso);
    // a row of low bumps (osteoderm-like ridging) down the back
    for (let k = 0; k < 8; k++) pelvis.add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6).scale(0.8, 0.6, 1.4).translate(0, 1.45 - k * 0.04 + 0.05, 3.4 - k * 0.7), dark));
    // neck and head: a short thick S-neck, a massive deep skull, the lower jaw on a hinge
    const neck = (this.neck = new THREE.Group()); neck.position.set(0, 0.55, 3.9); pelvis.add(neck);
    neck.add(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 2.0, 16).rotateX(Math.PI / 2 - 0.5).translate(0, 0.45, 0.8), mat));
    neck.add(new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10).scale(0.62, 0.55, 1.1).translate(0, -0.25, 1.2), pale)); // the throat
    for (let k = 0; k < 4; k++) neck.add(new THREE.Mesh(new THREE.TorusGeometry(0.86 - k * 0.04, 0.05, 6, 18).rotateY(Math.PI / 2).rotateZ(Math.PI / 2).rotateX(-0.5).translate(0, 0.2 + k * 0.17, 0.35 + k * 0.32), dark)); // skin folds
    const head = (this.head = new THREE.Group()); head.position.set(0, 1.0, 1.7); neck.add(head);
    const sk = new THREE.BoxGeometry(1.5, 1.35, 3.2, 6, 6, 8), sp = sk.attributes.position;
    for (let i = 0; i < sp.count; i++) { // narrow snout, broad cheeks, rounded top
      let x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i); const f = (z + 1.6) / 3.2; // 0 back .. 1 snout
      x *= 1 - 0.42 * f; y *= 1 - 0.35 * f; y += (y > 0 ? -0.12 * Math.pow(Math.abs(x) / 0.75, 2) : 0);
      sp.setXYZ(i, x, y + 0.1 * f, z + 1.2);
    }
    sk.computeVertexNormals();
    head.add(Object.assign(new THREE.Mesh(sk, mat), { castShadow: true }));
    for (const sx of [-1, 1]) {
      head.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8).scale(1, 0.7, 1.2).translate(sx * 0.55, 0.62, 0.55), dark)); // brow horns
      head.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6).translate(sx * 0.62, 0.4, 0.45), new THREE.MeshStandardMaterial({ color: 0xc8a020, emissive: 0x3a2a00, roughness: 0.2 }))); // eyes
      head.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5).translate(sx * 0.22, 0.48, 2.65), dark)); // nostrils
      for (let k = 0; k < 13; k++) { const L2 = 0.16 + 0.12 * Math.sin((k / 12) * Math.PI) + (k % 3 === 1 ? 0.05 : 0); head.add(new THREE.Mesh(new THREE.ConeGeometry(0.045 + L2 * 0.12, L2, 5).rotateX(Math.PI).translate(sx * (0.64 - k * 0.034), -0.55 - L2 / 2, 0.25 + k * 0.19), tooth)); } // upper teeth, the middle ones longest
    }
    for (const sx of [-1, 1]) {
      // scaly lips along the upper jaw (the teeth show beneath), cheek bosses, a deep eye socket with a wet glint
      head.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 2.5).rotateY(sx * 0.12).translate(sx * 0.6, -0.5, 1.3), pale));
      head.add(new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8).scale(0.7, 0.9, 1.1).translate(sx * 0.72, -0.15, -0.15), mat));
      head.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8).translate(sx * 0.6, 0.4, 0.43), dark));
      head.add(new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5).translate(sx * 0.69, 0.43, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff })));
      for (let k = 0; k < 4; k++) head.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5).translate(sx * (0.35 - k * 0.04), 0.58 - k * 0.04, 1.0 + k * 0.4), dark)); // rough nasal ridge
    }
    const jaw = (this.jawG = new THREE.Group()); jaw.position.set(0, -0.5, -0.1); head.add(jaw);
    const jg = new THREE.BoxGeometry(1.25, 0.5, 2.9, 4, 2, 6), jp = jg.attributes.position;
    for (let i = 0; i < jp.count; i++) { const z = jp.getZ(i), f = (z + 1.45) / 2.9; jp.setXYZ(i, jp.getX(i) * (1 - 0.4 * f), jp.getY(i) * (1 - 0.3 * f) - 0.15, z + 1.45); }
    jg.computeVertexNormals();
    jaw.add(new THREE.Mesh(jg, pale));
    jaw.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 2.4).translate(0, 0.1, 1.4), mouth));
    for (const sx of [-1, 1]) for (let k = 0; k < 11; k++) { const L2 = 0.13 + 0.08 * Math.sin((k / 10) * Math.PI); jaw.add(new THREE.Mesh(new THREE.ConeGeometry(0.04, L2, 5).translate(sx * (0.52 - k * 0.032), 0.1 + L2 / 2, 0.35 + k * 0.21), tooth)); }
    // the famous little arms: two fingers each, folded under the chest
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(sx * 0.95, -0.55, 3.3); pelvis.add(arm);
      arm.add(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.8, 8).translate(0, -0.4, 0).rotateX(0.6), mat));
      const fore = new THREE.Group(); fore.position.set(0, -0.62, 0.45); arm.add(fore);
      fore.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 8).translate(0, -0.3, 0).rotateX(-0.9), mat));
      for (const fx of [-0.05, 0.06]) fore.add(new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 5).rotateX(-1.6).translate(fx, -0.48, 0.42), dark));
    }
    // tail: thick at the root, a long counterweight tapering to a point
    this.tail = [];
    let parent = new THREE.Group(); parent.position.set(0, 0.25, -1.2); pelvis.add(parent);
    const TS = 14, tailL = 6.8;
    for (let k = 0; k < TS; k++) {
      const f = k / TS, len = tailL / TS, r0 = 1.05 * (1 - f) ** 1.2 + 0.05, r1 = 1.05 * (1 - (k + 1) / TS) ** 1.2 + 0.04;
      const seg = new THREE.Group(); parent.add(seg);
      seg.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len * 1.12, 14).rotateX(Math.PI / 2).translate(0, 0, -len / 2), mat), { castShadow: true }));
      seg.add(new THREE.Mesh(new THREE.SphereGeometry(r0, 12, 8), mat));
      if (k < TS - 3) seg.add(new THREE.Mesh(new THREE.ConeGeometry(0.1 + r0 * 0.08, 0.2 + r0 * 0.15, 5).translate(0, r0 * 0.98, -len * 0.4), dark)); // a scute down the spine
      this.tail.push(seg);
      const next = new THREE.Group(); next.position.z = -len; seg.add(next); parent = next;
    }
    // legs: a huge drumstick thigh, a long shin, the metatarsus, three forward toes and a small dewclaw
    this.legs = [-1, 1].map((sx) => {
      const hip = new THREE.Group(); hip.position.set(sx * 0.95, 0, 0.2); pelvis.add(hip);
      hip.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12).scale(0.75, 1.25, 0.95).translate(0, -0.7, 0.15), mat), { castShadow: true })); // the thigh muscle
      const knee = new THREE.Group(); knee.position.set(0, -1.5, 0.45); hip.add(knee);
      knee.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.5, 1.6, 12).translate(0, -0.8, 0), mat), { castShadow: true }));
      const ankle = new THREE.Group(); ankle.position.y = -1.6; knee.add(ankle);
      ankle.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.25, 10).translate(0, -0.62, 0), mat), { castShadow: true }));
      const foot = new THREE.Group(); foot.position.y = -1.25; ankle.add(foot);
      for (const [a, l] of [[-0.35, 0.95], [0, 1.15], [0.35, 0.95]]) {
        foot.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.17, l, 8).rotateX(Math.PI / 2).translate(0, 0, l / 2).rotateY(a), mat));
        foot.add(new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 6).rotateX(Math.PI / 2).translate(0, -0.03, l + 0.1).rotateY(a), dark));
      }
      foot.add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5).rotateX(-Math.PI / 2).translate(0, 0.15, -0.25), dark)); // dewclaw
      return { hip, knee, ankle, foot, sx };
    });
    mat.vertexColors = true;
    root.traverse((o) => {
      if (!o.isMesh || o.material !== mat) return;
      const g = o.geometry; g.computeVertexNormals();
      const n = g.attributes.normal, a = new Float32Array(n.count * 3);
      for (let i = 0; i < n.count; i++) { const y = n.getY(i), k = y > 0 ? 0.62 + 0.38 * (1 - y) : 1 - 0.45 * y; a[i * 3] = k * (y < -0.3 ? 1.12 : 1); a[i * 3 + 1] = k * (y < -0.3 ? 1.08 : 1); a[i * 3 + 2] = k * (y < -0.3 ? 0.98 : 0.95); }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    });
    this.S = S;
    this.place();
  }

  place() {
    const C = this.world.rex;
    this.x = C.x + 10; this.z = C.z; this.heading = -Math.PI / 2; this.state = 'caged'; this.speed = 0; this.path = [];
  }

  roar() {
    this.jawT = 2.4;
    const g = this.game, d = Math.hypot(g.player.pos.x - this.x, g.player.pos.z - this.z);
    if (g.audio.roar) g.audio.roar(Math.max(0.05, 1 - d / 400));
  }

  // the road path to somewhere in town
  planTo(x, z) {
    const T = this.game.traffic, w = this.world;
    const a = T.nearestNode(this.x, this.z), b = T.nearestNode(x, z);
    this.path = [];
    for (const step of T.dijkstra(a, b)) { const e = w.edges[step.edge], P = step.dir === 0 ? e.pts : e.pts.slice().reverse(); for (let i = 0; i < P.length; i += 4) this.path.push({ x: P[i].x, z: P[i].z }); }
  }

  update(dt, time) {
    const w = this.world, g = this.game, C = w.rex, P = g.player;
    const pd = Math.hypot(P.pos.x - this.x, P.pos.z - this.z);
    this.t -= dt; this.roarT -= dt; this.swipeCool -= dt;
    let want = 0, tx = this.x, tz = this.z;
    if (this.state === 'caged') {
      // pace the compound; when you come near, stride to the fence on your side and roar at you
      if (pd < 70) { tx = Math.max(C.x - C.half + 9, Math.min(C.x + C.half - 9, P.pos.x)); tz = Math.max(C.z - C.half + 9, Math.min(C.z + C.half - 9, P.pos.z)); want = 3.2; if (this.roarT <= 0) { this.roar(); this.roarT = 7 + Math.random() * 6; } }
      else { if (!this.target || this.t <= 0) { this.target = { x: C.x + (Math.random() - 0.5) * (C.half - 14) * 2, z: C.z + (Math.random() - 0.5) * (C.half - 14) * 2 }; this.t = 10 + Math.random() * 10; } tx = this.target.x; tz = this.target.z; want = 1.6; }
      if (Math.hypot(tx - this.x, tz - this.z) < 3) want = 0;
    } else if (this.state === 'escaping') {
      // out through the gap, then away down the road
      tx = this.breach.x; tz = this.breach.z; want = 9;
      if (Math.hypot(tx - this.x, tz - this.z) < 5) { this.state = 'loose'; this.planTo(-698, -8); this.roar(); }
    } else {
      // loose: chase the player when close, otherwise follow the roads into town (and on, from block to block)
      if (pd < 85) { tx = P.pos.x; tz = P.pos.z; want = 13; }
      else {
        while (this.path.length && Math.hypot(this.path[0].x - this.x, this.path[0].z - this.z) < 6) this.path.shift();
        if (!this.path.length) { const ns = w.nodes.filter((n) => n.city); const n = ns[Math.floor(Math.random() * ns.length)]; this.planTo(n.x, n.z); }
        if (this.path.length) { tx = this.path[0].x; tz = this.path[0].z; }
        want = 8;
      }
      if (this.roarT <= 0 && pd < 220) { this.roar(); this.roarT = 9 + Math.random() * 8; }
    }
    // low growls between the roars whenever you're near
    this.growlT = (this.growlT || 2) - dt;
    if (this.growlT <= 0 && pd < 160 && !(this.jawT > 0)) { this.growlT = 2.2 + Math.random() * 2.5; if (g.audio.growl) g.audio.growl(Math.max(0.05, 1 - pd / 160)); this.jawT = -0.01; this.growlJaw = 1.1; }
    this.growlJaw = Math.max(0, (this.growlJaw || 0) - dt);
    // steer and stride
    const dh0 = Math.atan2(tx - this.x, tz - this.z) - this.heading, dh = Math.atan2(Math.sin(dh0), Math.cos(dh0));
    this.heading += Math.max(-1.1 * dt, Math.min(1.1 * dt, dh));
    if (Math.abs(dh) > 1.2) want = Math.min(want, 2);
    this.speed += (want - this.speed) * Math.min(1, dt * 2.2);
    const nx = this.x + Math.sin(this.heading) * this.speed * dt, nz = this.z + Math.cos(this.heading) * this.speed * dt;
    // caged: the fence holds it (unless there's a gap it's heading for)
    if (this.state === 'caged') { this.x = Math.max(C.x - C.half + 6, Math.min(C.x + C.half - 6, nx)); this.z = Math.max(C.z - C.half + 6, Math.min(C.z + C.half - 6, nz)); }
    else { this.x = nx; this.z = nz; }
    const y = w.groundAt(this.x, this.z, (this.root.position.y || 80) + 4).h;
    this.root.position.set(this.x, y, this.z);
    this.root.rotation.y = this.heading;
    // gait: stride length grows with speed (a walk is ~3.4 m, the run longer)
    const run = Math.min(1, this.speed / 9), amt = Math.min(1, this.speed / 1.5);
    const stride = 3.6 + this.speed * 0.45, stance = 0.6 - 0.18 * run, legLen = 4.4 * this.S; // longer strides and less ground time when running
    this.phase = (this.phase + (this.speed / stride) * dt) % 1;
    // the planted foot must travel back exactly as far as the body moves forward meanwhile (or it skates)
    const Aleg = Math.atan((stance * stride * 0.5) / legLen);
    const s2 = Math.sin(this.phase * TAU * 2);
    this.pelvis.position.y = 4.0 + s2 * (0.1 + run * 0.15) * amt;
    this.pelvis.rotation.x = 0.08 + run * 0.06 + Math.sin(this.phase * TAU * 2 + 1) * 0.02 * amt; // body leans into a run
    this.pelvis.rotation.z = Math.sin(this.phase * TAU) * 0.05 * amt;
    this.pelvis.rotation.y = Math.sin(this.phase * TAU) * 0.06 * amt;
    this.legs.forEach((L, i) => {
      const ph = (this.phase + i * 0.5) % 1, A = Aleg * amt;
      let swing, lift;
      if (ph < stance) { swing = A - (ph / stance) * 2 * A; lift = 0; } else { const u = (ph - stance) / (1 - stance); swing = -A + u * 2 * A; lift = Math.sin(u * Math.PI); }
      const flex = 0.25 + lift * (0.7 + run * 0.4);
      L.hip.rotation.x = -swing - 0.25 - flex * 0.4;
      L.knee.rotation.x = flex;          // knee folds forward
      L.ankle.rotation.x = -flex * 1.1 - 0.25; // ankle folds back (digitigrade)
      L.foot.rotation.x = -(L.hip.rotation.x + L.knee.rotation.x + L.ankle.rotation.x) + lift * 0.5; // toes flat on the ground, curled lifting
    });
    // head: low and forward when charging, up and swinging when it roars, the jaw gaping
    this.jawT = (this.jawT || 0) - dt;
    const roaring = this.jawT > 0;
    this.jaw += ((roaring ? 0.75 + Math.sin(time * 30) * 0.05 : this.growlJaw > 0 ? 0.18 + Math.sin(time * 18) * 0.04 : 0.04 + run * 0.1) - this.jaw) * Math.min(1, dt * 6);
    this.jawG.rotation.x = this.jaw;
    this.neck.rotation.x = roaring ? -0.35 + Math.sin(time * 2) * 0.1 : 0.1 + run * 0.15 + Math.sin(this.phase * TAU * 2) * 0.04 * amt;
    this.neck.rotation.y = roaring ? Math.sin(time * 1.6) * 0.3 : Math.sin(time * 0.7) * 0.12;
    this.head.rotation.x = roaring ? -0.2 : 0.05;
    // tail: swings with the stride, whips round in a swipe
    if (this.swipe > 0) this.swipe -= dt;
    const sw = this.swipe > 0 ? Math.sin((1 - this.swipe / 0.9) * Math.PI) * this.swipeDir : 0;
    this.tail.forEach((seg, k) => {
      const f = k / this.tail.length;
      seg.rotation.x = k === 0 ? -0.25 - run * 0.08 : 0.03 + f * 0.02;
      seg.rotation.y = Math.sin(time * 1.4 - k * 0.35 + this.phase * TAU) * (0.03 + f * 0.05) * (0.5 + amt) + sw * (0.12 + f * 0.06);
    });
    if (this.state !== 'caged') this.smash(dt, sw);
  }

  // shove, stomp and tail-swipe the cars around it
  smash(dt, sw) {
    const g = this.game, s = Math.sin(this.heading), c = Math.cos(this.heading), S = this.S;
    // the swipe lands at the top of the swing: the target is batted sideways, lifted and rolled over
    const tgt = this.swipeTarget;
    if (tgt && !this.swiped && this.swipe > 0 && this.swipe < 0.5) {
      this.swiped = true;
      const dx = tgt.pos.x - this.x, dz = tgt.pos.z - this.z, d = Math.hypot(dx, dz) || 1;
      if (d < 15) {
        const nx = dx / d, nz = dz / d;
        tgt.sleeping = false;
        tgt.vel.x += nx * 15; tgt.vel.z += nz * 15; tgt.vel.y += 6.5;
        tgt.forward(_fwd);
        const roll = (nx * _fwd.z - nz * _fwd.x) > 0 ? 1 : -1; // tip it over away from the tail
        tgt.angVel.addScaledVector(_fwd, roll * 5.5);
        g.applyDamage(tgt, 18, tgt.pos.x - nx, tgt.pos.z - nz, -nx, -nz, 20);
        if (g.audio.crash) g.audio.crash(0.9);
      }
    }
    const pts = [[0, 0.4, 2.2], [0, 1.5, 3.5], [0, 2.4, 1.2], [0, 6.2, 1.4], [0, -2.5, 1.6], [0, -5.5, 1.1], [0, -8, 0.8]]; // [side, along, radius]
    // tail tip swings with the swipe
    for (const car of g.cars) {
      const dx0 = car.pos.x - this.x, dz0 = car.pos.z - this.z;
      if (dx0 * dx0 + dz0 * dz0 > 400) continue;
      // a police car beside or behind: whip the tail round into it
      if (this.swipe <= 0 && this.swipeCool <= 0 && (car.scheme === 'police' || (car !== g.player && Math.random() < 0.02))) {
        const along = dx0 * s + dz0 * c, side = dx0 * c - dz0 * s;
        if (Math.hypot(along, side) < 13) { this.swipe = 0.9; this.swipeDir = side > 0 ? -1 : 1; this.swipeCool = 2.2; this.hitBy = new Set(); this.swipeTarget = car; this.swiped = false; }
      }
      for (const [, along, r] of pts) {
        const tailBend = along < 0 ? sw * (-along) * 0.35 * this.swipeDir * this.swipeDir : 0; // the swinging tail sweeps sideways
        const px = this.x + s * along * S + c * tailBend * S, pz = this.z + c * along * S - s * tailBend * S;
        const dx = car.pos.x - px, dz = car.pos.z - pz, d = Math.hypot(dx, dz), reach = r * S + car.hx + 0.4;
        if (d > reach) continue;
        const nx = dx / (d || 1), nz = dz / (d || 1), tailHit = along < -4 && Math.abs(sw) > 0.4;
        if (tailHit && this.hitBy && this.hitBy.has(car)) continue;
        car.sleeping = false;
        const push = tailHit ? 20 : 3 + this.speed * 0.9;
        car.vel.x += nx * push * dt * (tailHit ? 30 : 8); car.vel.z += nz * push * dt * (tailHit ? 30 : 8);
        car.pos.x += nx * (reach - d) * 0.5; car.pos.z += nz * (reach - d) * 0.5;
        if (tailHit) { this.hitBy.add(car); car.vel.y += 7; car.angVel.x += (Math.random() - 0.5) * 6; car.angVel.z += nx * 5 + (Math.random() - 0.5) * 3; g.applyDamage(car, 16, car.pos.x - nx, car.pos.z - nz, -nx, -nz, 18); }
        else if (this.speed > 3) g.applyDamage(car, Math.min(9, 2 + this.speed * 0.6), car.pos.x - nx, car.pos.z - nz, -nx, -nz, this.speed);
        break;
      }
    }
  }
}
