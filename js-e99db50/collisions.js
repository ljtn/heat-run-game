// 2D (xz) oriented-box collision detection with full 3D rigid-body impulse response.
import * as THREE from 'three';

const _r = new THREE.Vector3(), _rb = new THREE.Vector3(), _n = new THREE.Vector3();
const _vp = new THREE.Vector3(), _vb = new THREE.Vector3(), _J = new THREE.Vector3(), _t = new THREE.Vector3();
const _fw = new THREE.Vector3(), _rt = new THREE.Vector3();
const hits = [];

// oriented box of a vehicle in xz
function carBox(v, out) {
  v.forward(_fw); v.right(_rt);
  let fx = _fw.x, fz = _fw.z;
  const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
  out.ax = -fz; out.az = fx; // right (unit)
  out.bx = fx; out.bz = fz; // forward (unit)
  // keep "right" consistent with the true right vector
  if (out.ax * _rt.x + out.az * _rt.z < 0) { out.ax = -out.ax; out.az = -out.az; }
  out.hx = v.hx; out.hz = v.hz;
  out.cx = v.pos.x - fx * v.boxZ; out.cz = v.pos.z - fz * v.boxZ;
  return out;
}
const boxA = {}, boxB = {}, boxS = {};

function staticBox(c, out) {
  out.ax = c.c; out.az = c.s; out.bx = -c.s; out.bz = c.c;
  out.hx = c.hx; out.hz = c.hz; out.cx = c.x; out.cz = c.z;
  return out;
}

function corners(b, out) {
  let k = 0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    out[k++] = b.cx + b.ax * b.hx * sx + b.bx * b.hz * sz;
    out[k++] = b.cz + b.az * b.hx * sx + b.bz * b.hz * sz;
  }
  return out;
}
const cA = new Float32Array(8), cB = new Float32Array(8);

const res = { nx: 0, nz: 0, depth: 0, px: 0, pz: 0 };
// SAT: returns null or res with normal pointing from B to A
function obbOverlap(A, B) {
  const axes = [[A.ax, A.az, 0], [A.bx, A.bz, 0], [B.ax, B.az, 1], [B.bx, B.bz, 1]];
  const dx = A.cx - B.cx, dz = A.cz - B.cz;
  let best = 1e9, bnx = 0, bnz = 0, owner = 0;
  for (const [lx, lz, o] of axes) {
    const rA = A.hx * Math.abs(A.ax * lx + A.az * lz) + A.hz * Math.abs(A.bx * lx + A.bz * lz);
    const rB = B.hx * Math.abs(B.ax * lx + B.az * lz) + B.hz * Math.abs(B.bx * lx + B.bz * lz);
    const d = dx * lx + dz * lz;
    const ov = rA + rB - Math.abs(d);
    if (ov <= 0) return null;
    if (ov < best) { best = ov; bnx = d >= 0 ? lx : -lx; bnz = d >= 0 ? lz : -lz; owner = o; }
  }
  res.nx = bnx; res.nz = bnz; res.depth = best;
  // contact point: deepest vertex of the box not owning the axis (average near-equal ones)
  if (owner === 1) {
    corners(A, cA);
    let m = 1e9;
    for (let k = 0; k < 8; k += 2) m = Math.min(m, cA[k] * bnx + cA[k + 1] * bnz);
    let sx = 0, sz = 0, n = 0;
    for (let k = 0; k < 8; k += 2) if (cA[k] * bnx + cA[k + 1] * bnz < m + 0.15) { sx += cA[k]; sz += cA[k + 1]; n++; }
    res.px = sx / n; res.pz = sz / n;
  } else {
    corners(B, cB);
    let m = -1e9;
    for (let k = 0; k < 8; k += 2) m = Math.max(m, cB[k] * bnx + cB[k + 1] * bnz);
    let sx = 0, sz = 0, n = 0;
    for (let k = 0; k < 8; k += 2) if (cB[k] * bnx + cB[k + 1] * bnz > m - 0.15) { sx += cB[k]; sz += cB[k + 1]; n++; }
    res.px = sx / n; res.pz = sz / n;
  }
  return res;
}

function circleOverlap(A, cx, cz, r) {
  const dx = cx - A.cx, dz = cz - A.cz;
  const lx = dx * A.ax + dz * A.az, lz = dx * A.bx + dz * A.bz;
  const qx = Math.max(-A.hx, Math.min(A.hx, lx)), qz = Math.max(-A.hz, Math.min(A.hz, lz));
  const ex = lx - qx, ez = lz - qz;
  const d2 = ex * ex + ez * ez;
  if (d2 > r * r) return null;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    // normal from circle to box (B -> A)
    const nlx = -ex / d, nlz = -ez / d;
    res.nx = nlx * A.ax + nlz * A.bx; res.nz = nlx * A.az + nlz * A.bz;
    res.depth = r - d;
  } else {
    // centre inside box: push out along shallowest axis
    const px = A.hx - Math.abs(lx), pz = A.hz - Math.abs(lz);
    if (px < pz) { const s = lx > 0 ? -1 : 1; res.nx = A.ax * s; res.nz = A.az * s; res.depth = px + r; }
    else { const s = lz > 0 ? -1 : 1; res.nx = A.bx * s; res.nz = A.bz * s; res.depth = pz + r; }
  }
  res.px = A.cx + qx * A.ax + qz * A.bx;
  res.pz = A.cz + qx * A.az + qz * A.bz;
  return res;
}

export class CollisionSystem {
  constructor(world) {
    this.world = world;
    this.onStaticHit = null;
    this.onCarHit = null;
    this.onBreak = null;
    this.tmp = [];
  }

  stepStatic(v, dt) {
    if (v.sleeping) return;
    const w = this.world;
    const A = carBox(v, boxA);
    const ext = Math.max(v.hx, v.hz) + 0.5;
    const list = w.queryColliders(A.cx - ext, A.cz - ext, A.cx + ext, A.cz + ext, this.tmp);
    const bottom = v.pos.y + v.bottomY, top = v.pos.y + v.topY;
    for (const c of list) {
      if (c.broken) continue;
      if (bottom > c.top) continue;
      if (c.soft) {
        // bushes: drag the car and rustle, no hard stop
        if (circleOverlap(A, c.x, c.z, c.r)) {
          const k = Math.max(0, 1 - 1.3 * dt);
          v.vel.x *= k; v.vel.z *= k;
          if (this.onSoft) this.onSoft(v, c);
        }
        continue;
      }
      if (c.bottom !== undefined && top < c.bottom) continue; // e.g. upper floors above a drive-through shop
      if (c.rail && top < c.top - 2.6) continue;
      const hit = c.type === 'circle' ? circleOverlap(A, c.x, c.z, c.r) : obbOverlap(A, staticBox(c, boxS));
      if (!hit) continue;
      if (c.rampAx !== undefined) {
        // hitting the end of a ramp segment: ride up it if that face is low enough
        const along = hit.nx * c.rampAx + hit.nz * c.rampAz;
        if (Math.abs(along) > 0.55) {
          const faceY = along < 0 ? c.ya : c.yb;
          if (faceY - bottom < 0.75) continue;
        } else if (Math.min(c.ya, c.yb) - bottom < 0.4) continue; // low side: bump up onto it diagonally
      }
      if (c.tree) {
        const vn = -(v.vel.x * hit.nx + v.vel.z * hit.nz);
        if (vn > c.snap) {
          // full-on hit: the trunk snaps and the car ploughs on, slowed
          c.broken = true;
          v.vel.multiplyScalar(0.4);
          if (this.onTreeSnap) this.onTreeSnap(c, v, hit.px, hit.pz);
          continue;
        }
        if (vn > 1.5 && this.onTreeHit) this.onTreeHit(c, v, hit.px, hit.pz, hit.nx, hit.nz, vn);
      }
      if (c.breakable) {
        const vn = -(v.vel.x * hit.nx + v.vel.z * hit.nz);
        if (vn > (c.breakV || 2.5)) {
          c.broken = true;
          v.vel.multiplyScalar(c.slow || 0.94);
          if (this.onBreak) this.onBreak(c, v, hit.px, hit.pz);
          continue;
        }
      }
      this.resolveStatic(v, hit, c);
    }
  }

  resolveStatic(v, hit, c) {
    _n.set(hit.nx, 0, hit.nz);
    _r.set(hit.px - v.pos.x, -0.15, hit.pz - v.pos.z);
    v.pointVelocity(_r, _vp);
    const vn = _vp.dot(_n);
    // positional correction
    const corr = Math.max(0, hit.depth - 0.01) * 0.85;
    v.pos.x += hit.nx * corr; v.pos.z += hit.nz * corr;
    // grinding along a wall: report the sliding speed for sparks / scrape sound
    if (this.onScrape && (c.tall || c.rail || c.bottom !== undefined)) {
      _t.copy(_vp).addScaledVector(_n, -vn); _t.y = 0;
      const slide = _t.length();
      if (slide > 2.5) this.onScrape(v, c, hit.px, hit.pz, hit.nx, hit.nz, slide);
    }
    if (vn >= 0) return 0;
    const e = 0.18;
    const k = v.invMassAt(_r, _n);
    const j = (-(1 + e) * vn) / k;
    _J.copy(_n).multiplyScalar(j);
    v.applyImpulse(_J, _r);
    // friction
    _t.copy(_vp).addScaledVector(_n, -vn);
    _t.y = 0;
    const tl = _t.length();
    if (tl > 1e-3) {
      _t.multiplyScalar(1 / tl);
      const kt = v.invMassAt(_r, _t);
      const jt = Math.min(0.45 * j, tl / kt);
      _J.copy(_t).multiplyScalar(-jt);
      v.applyImpulse(_J, _r);
    }
    if (this.onStaticHit) this.onStaticHit(v, c, j, hit.px, hit.pz, hit.nx, hit.nz, -vn);
    return j;
  }

  stepCars(cars) {
    const n = cars.length;
    for (let i = 0; i < n; i++) {
      const a = cars[i];
      if (a.sleeping) continue;
      for (let k = i + 1; k < n; k++) {
        const b = cars[k];
        if (b.sleeping) continue;
        const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z;
        const R = a.hz + b.hz + 0.5;
        if (dx * dx + dz * dz > R * R) continue;
        if (Math.abs(a.pos.y - b.pos.y) > 1.8) continue;
        const A = carBox(a, boxA), B = carBox(b, boxB);
        const hit = obbOverlap(A, B);
        if (!hit) continue;
        this.resolveCars(a, b, hit);
      }
    }
  }

  resolveCars(a, b, hit) {
    _n.set(hit.nx, 0, hit.nz);
    const cy = (a.pos.y + b.pos.y) / 2 - 0.1;
    _r.set(hit.px - a.pos.x, cy - a.pos.y, hit.pz - a.pos.z);
    _rb.set(hit.px - b.pos.x, cy - b.pos.y, hit.pz - b.pos.z);
    a.pointVelocity(_r, _vp);
    b.pointVelocity(_rb, _vb);
    _vp.sub(_vb);
    const vn = _vp.dot(_n);
    const ia = a.invMass, ib = b.invMass;
    // crumple zones: bodies may sink ~0.3 m into each other before being pushed apart hard
    const corr = Math.max(0, hit.depth - 0.3) * 0.6 + Math.min(hit.depth, 0.3) * 0.06;
    a.pos.x += hit.nx * corr * ia / (ia + ib); a.pos.z += hit.nz * corr * ia / (ia + ib);
    b.pos.x -= hit.nx * corr * ib / (ia + ib); b.pos.z -= hit.nz * corr * ib / (ia + ib);
    if (vn >= 0) return;
    // almost no bounce, and the closing speed is soaked up over a few substeps instead of one rigid jolt
    const e = 0.04;
    const k = a.invMassAt(_r, _n) + b.invMassAt(_rb, _n);
    const give = Math.min(1, 0.3 + hit.depth * 2.5);
    const j = (-(1 + e) * vn * give) / k;
    _J.copy(_n).multiplyScalar(j);
    a.applyImpulse(_J, _r);
    _J.negate();
    b.applyImpulse(_J, _rb);
    _t.copy(_vp).addScaledVector(_n, -vn);
    _t.y = 0;
    const tl = _t.length();
    if (tl > 1e-3) {
      _t.multiplyScalar(1 / tl);
      const kt = a.invMassAt(_r, _t) + b.invMassAt(_rb, _t);
      const jt = Math.min(0.35 * j, tl / kt);
      _J.copy(_t).multiplyScalar(-jt);
      a.applyImpulse(_J, _r);
      _J.negate();
      b.applyImpulse(_J, _rb);
    }
    if (this.onCarHit) this.onCarHit(a, b, j, hit.px, cy, hit.pz, hit.nx, hit.nz, -vn);
  }
}
