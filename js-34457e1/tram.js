// The El: an elevated tram loop over the downtown streets. Steel portal frames carry a girder deck with rails
// and sleepers; two stations with canopies and stairs; two three-car trains run the loop, easing round the
// corners and pausing at the platforms.
import * as THREE from 'three';
import { mergeGeometries } from '../lib/addons/utils/BufferGeometryUtils.js';
import { CITY } from './world.js';

const CAR_L = 11, GAP = 0.8, CARS = 3, VMAX = 13, STOP_T = 9;

function part(geo, color, x = 0, y = 0, z = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.translate(x, y, z);
  const c = new THREE.Color(color), a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// a box at (x, y, z) turned to heading rot (local x along the track)
const seg = (w, h, d, col, x, y, z, rot) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(rot); return part(g, col, x, y, z); };

export class Tram {
  constructor(world, scene) {
    this.world = world;
    const T = world.tram;
    if (!T) return;
    this.T = T;
    const P = T.pts, n = P.length, y = T.y, steel = 0x3e4a52, parts = [];
    const at = (k) => P[((k % n) + n) % n];
    // girder deck: short pieces following the line (finer on the curves)
    for (let k = 0; k < n;) {
      const step = at(k).curve || at(k + 4).curve ? 1 : 4, a = at(k), b = at(k + step);
      const L = Math.hypot(b.x - a.x, b.z - a.z), rot = Math.atan2(-(b.z - a.z), b.x - a.x), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      parts.push(seg(L + 0.12, 1.1, 4.6, steel, mx, y - 0.55, mz, rot)); // the box girder
      parts.push(seg(L + 0.12, 0.12, 5.2, 0x5a646c, mx, y + 0.06, mz, rot)); // walkway plates
      for (const sd of [-1, 1]) { // rails and a low parapet each side
        const ox = -Math.sin(rot) * 0, nx = Math.sin(rot), nz = Math.cos(rot);
        parts.push(seg(L + 0.05, 0.16, 0.09, 0x9aa0a6, mx + nx * 0.72 * sd + ox, y + 0.3, mz + nz * 0.72 * sd, rot));
        parts.push(seg(L + 0.1, 0.7, 0.1, steel, mx + nx * 2.55 * sd, y + 0.45, mz + nz * 2.55 * sd, rot));
      }
      for (let t = 0; t < L; t += 0.7) { // sleepers
        const f = (t + 0.35) / L, x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
        parts.push(seg(0.25, 0.12, 2.3, 0x4a3a2c, x, y + 0.16, z, rot));
      }
      k += step;
    }
    // portal frames: two columns on the sidewalks, a cross beam under the deck, knee braces
    for (const f of T.frames) {
      const rot = Math.atan2(-f.tz, f.tx), nx = -f.tz, nz = f.tx, gy = CITY.at(f.x, f.z) + CITY.curb;
      for (const sd of [-1, 1]) {
        const cx = f.x + nx * f.o * sd, cz = f.z + nz * f.o * sd, h = y - 1.1 - gy;
        parts.push(seg(0.55, h, 0.55, steel, cx, gy + h / 2, cz, rot));
        parts.push(seg(0.9, 0.3, 0.9, 0x6a6e72, cx, gy + 0.15, cz, rot)); // footing
        const kb = new THREE.BoxGeometry(0.22, 2.6, 0.22); kb.rotateX(sd * -0.75); kb.rotateY(rot);
        parts.push(part(kb, steel, f.x + nx * (f.o - 0.9) * sd, y - 2.2, f.z + nz * (f.o - 0.9) * sd));
      }
      parts.push(seg(0.7, 0.9, 2 * f.o + 0.6, steel, f.x, y - 1.55, f.z, rot));
    }
    // stations: platforms each side, a canopy on posts, a stair down to the sidewalk, name boards
    for (const st of T.stations) {
      const k = P.findIndex((p) => p.s === st.s), a = at(k - 1), b = at(k + 1), rot = Math.atan2(-(b.z - a.z), b.x - a.x);
      const nx = Math.sin(rot), nz = Math.cos(rot), tx = Math.cos(rot), tz = -Math.sin(rot), gy = CITY.at(st.x, st.z) + CITY.curb;
      for (const sd of [-1, 1]) {
        const px = st.x + nx * 3.6 * sd, pz = st.z + nz * 3.6 * sd;
        parts.push(seg(38, 0.35, 2.6, 0x8e8a82, px, y + 0.2, pz, rot));
        parts.push(seg(38, 0.04, 0.3, 0xf2c419, px - nx * 1.15 * sd, y + 0.39, pz - nz * 1.15 * sd, rot)); // the yellow edge line
        parts.push(seg(38, 1.1, 0.08, 0x9fb2ba, px + nx * 1.25 * sd, y + 0.95, pz + nz * 1.25 * sd, rot)); // glass wind screen
        for (let u = -16; u <= 16; u += 8) parts.push(seg(0.18, 3.2, 0.18, steel, px + tx * u + nx * 1.1 * sd, y + 1.9, pz + tz * u + nz * 1.1 * sd, rot));
        parts.push(seg(38, 0.18, 4.4, 0xb8322a, px - nx * 0.4 * sd, y + 3.55, pz - nz * 0.4 * sd, rot)); // canopy
        parts.push(seg(5, 0.9, 0.12, 0x1f3a68, px + tx * 8 + nx * 1.0 * sd, y + 2.75, pz + tz * 8 + nz * 1.0 * sd, rot)); // name board
        // stair from the platform end down to the sidewalk, along the street, outside the columns; a landing reaches it
        const sx = st.x + nx * (sd * st.so), sz = st.z + nz * (sd * st.so), steps = 24;
        const lw = st.so - 4.9, lx = st.x + nx * sd * (4.9 + lw / 2) + tx * 19, lz = st.z + nz * sd * (4.9 + lw / 2) + tz * 19;
        parts.push(seg(2.2, 0.3, lw, 0x7a7670, lx, y + 0.2, lz, rot));
        for (let q = 0; q < steps; q++) {
          const f = q / steps, ux = 20 + f * 14, sy = y + 0.3 - (y + 0.3 - gy) * f;
          parts.push(seg(0.6, 0.2, 1.6, 0x7a7670, sx + tx * ux, sy, sz + tz * ux, rot));
        }
        parts.push(seg(0.4, (y - gy) * 0.5, 0.4, steel, sx + tx * 27, gy + (y - gy) * 0.25, sz + tz * 27, rot));
      }
    }
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.35 });
    const m = new THREE.Mesh(mergeGeometries(parts), mat);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    // the trains: cream and red cars with a lit window band, a pantograph on top
    const car = [
      part(new THREE.BoxGeometry(CAR_L, 2.4, 2.6), 0xe8e0cc, 0, 1.75, 0),
      part(new THREE.BoxGeometry(CAR_L + 0.02, 0.55, 2.62), 0xb8322a, 0, 0.75, 0),
      part(new THREE.BoxGeometry(CAR_L - 0.4, 0.25, 2.3), 0x8a8478, 0, 3.05, 0),
      part(new THREE.BoxGeometry(1.6, 0.5, 2.0), 0x2a2b2d, -3.6, 0.3, 0), part(new THREE.BoxGeometry(1.6, 0.5, 2.0), 0x2a2b2d, 3.6, 0.3, 0), // bogies
      part(new THREE.BoxGeometry(0.05, 0.05, 1.6), 0x2a2b2d, 0, 3.75, 0), part(new THREE.BoxGeometry(1.2, 0.05, 0.05), 0x2a2b2d, 0.2, 3.45, 0),
    ];
    const pan = new THREE.BoxGeometry(1.3, 0.04, 0.04); pan.rotateZ(0.55); car.push(part(pan, 0x2a2b2d, 0.2, 3.5, 0));
    this.carGeo = mergeGeometries(car);
    const win = [];
    for (const sd of [-1, 1]) for (let u = -4.4; u <= 4.4; u += 1.25) win.push(part(new THREE.BoxGeometry(1.0, 0.8, 0.02), 0xffffff, u, 2.05, 1.31 * sd));
    for (const e of [-1, 1]) win.push(part(new THREE.BoxGeometry(0.02, 0.9, 1.9), 0xffffff, (CAR_L / 2 + 0.01) * e, 2.05, 0));
    this.winMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x1a2a34, emissive: 0xffe2a8, emissiveIntensity: 0.15, roughness: 0.2, metalness: 0.3 });
    this.trains = [0, 0.5].map((f) => ({ s: T.len * f + 40, v: 0, wait: 0, nextStop: -1 }));
    this.bodies = new THREE.InstancedMesh(this.carGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.2 }), this.trains.length * CARS);
    this.wins = new THREE.InstancedMesh(mergeGeometries(win), this.winMat, this.trains.length * CARS);
    for (const im of [this.bodies, this.wins]) { im.frustumCulled = false; im.castShadow = true; scene.add(im); }
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.one = new THREE.Vector3(1, 1, 1); this.up = new THREE.Vector3(0, 1, 0);
    this.update(0);
  }

  // position on the loop at distance s
  pointAt(s) {
    const T = this.T, P = T.pts, n = P.length;
    s = ((s % T.len) + T.len) % T.len;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (P[mid].s <= s) lo = mid; else hi = mid - 1; }
    const a = P[lo], b = P[(lo + 1) % n], segL = (lo + 1 < n ? b.s : T.len) - a.s || 1, f = (s - a.s) / segL;
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, curve: a.curve };
  }

  update(dt, night = false) {
    if (!this.T) return;
    const T = this.T, len = T.len;
    let i = 0;
    for (const tr of this.trains) {
      // the next station ahead, and the distance to it
      let dStop = 1e9;
      for (const st of T.stations) { const d = (((st.s - tr.s) % len) + len) % len; if (d < dStop) dStop = d; }
      if (tr.wait > 0) { tr.wait -= dt; tr.v = 0; if (tr.wait <= 0) tr.s += 0.6; }
      else {
        let vDes = VMAX;
        if (this.pointAt(tr.s + 18).curve || this.pointAt(tr.s).curve) vDes = 5; // ease round the corners
        vDes = Math.min(vDes, Math.sqrt(2 * 1.1 * Math.max(0, dStop - 0.3)) + 0.4);
        // keep apart from the train ahead
        const other = this.trains.find((o) => o !== tr), gap = (((other.s - tr.s) % len) + len) % len;
        if (gap < CARS * (CAR_L + GAP) + 30) vDes = Math.min(vDes, Math.max(0, (gap - CARS * (CAR_L + GAP) - 10) * 0.3));
        tr.v += Math.max(-2.2 * dt, Math.min(1.1 * dt, vDes - tr.v));
        tr.s = (tr.s + tr.v * dt) % len;
        if (dStop < 0.5 && tr.v < 0.6) { tr.wait = STOP_T; tr.v = 0; }
      }
      // each car sits on its two bogies, so it follows the curves
      for (let c = 0; c < CARS; c++) {
        const mid = tr.s - c * (CAR_L + GAP) - CAR_L / 2, f = this.pointAt(mid + 3.6), b = this.pointAt(mid - 3.6);
        const rot = Math.atan2(-(f.z - b.z), f.x - b.x);
        this.q.setFromAxisAngle(this.up, rot);
        this.m4.compose(this.v.set((f.x + b.x) / 2, T.y + 0.22, (f.z + b.z) / 2), this.q, this.one);
        this.bodies.setMatrixAt(i, this.m4); this.wins.setMatrixAt(i, this.m4); i++;
      }
    }
    this.bodies.instanceMatrix.needsUpdate = this.wins.instanceMatrix.needsUpdate = true;
    this.winMat.emissiveIntensity = night ? 1.4 : 0.15;
  }
}
