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
    this.phase = (this.phase + (this.speed / (3.6 * this.S)) * dt) % 1;
    const gaitAmt = Math.min(1, this.speed / 1.2);
    const y = world.terrainHeight(this.x, this.z);
    this.root.position.set(this.x, y, this.z);
    this.root.rotation.y = this.heading;
    // body: bobs twice a stride, rolls toward the planted side
    this.body.position.y = Math.sin(this.phase * TAU * 2) * 0.12 * gaitAmt;
    this.body.rotation.z = Math.sin(this.phase * TAU) * 0.035 * gaitAmt;
    this.body.rotation.x = Math.sin(this.phase * TAU * 2 + 0.6) * 0.012 * gaitAmt;
    for (const L of this.legs) {
      const ph = (this.phase + L.phase) % 1, A = 0.3 * gaitAmt;
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
  }

  update(dt, time, camPos) {
    if (!this.dinos) return;
    const near = Math.hypot(camPos.x - PARK.x, camPos.z - PARK.z) < PARK.r + 900;
    for (const d of this.dinos) {
      d.root.visible = near;
      if (near) d.update(Math.min(dt, 0.05), this.world, time, this.dinos);
    }
    for (const t of this.torches) { const f = 0.85 + Math.sin(time * 17 + t.position.x) * 0.1 + Math.sin(time * 29) * 0.06; t.scale.set(f, 0.8 + f * 0.4, f); }
  }
}
