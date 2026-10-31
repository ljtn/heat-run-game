// Breakable wall fixtures: drainpipes with roof gutters, and steel fire ladders.
// Their lower sections tear off and topple when you clip them.
import * as THREE from 'three';
import { mergeGeometries } from '../lib/addons/utils/BufferGeometryUtils.js';
import { CITY } from './world.js';
import { mulberry32 } from './noise.js';

const BREAK_H = { pipe: 5.2, ladder: 6.0 };

function pipeGeo(h) {
  const g = [new THREE.CylinderGeometry(0.075, 0.075, h, 8).translate(0, h / 2, 0)];
  for (let y = 1.2; y < h; y += 2.2) g.push(new THREE.BoxGeometry(0.22, 0.06, 0.16).translate(0, y, -0.07)); // brackets
  return mergeGeometries(g);
}
function ladderGeo(h) {
  const g = [];
  for (const x of [-0.25, 0.25]) g.push(new THREE.BoxGeometry(0.05, h, 0.05).translate(x, h / 2, 0));
  for (let y = 0.3; y < h; y += 0.35) g.push(new THREE.BoxGeometry(0.5, 0.035, 0.035).translate(0, y, 0));
  for (let y = 1.5; y < h; y += 2.5) for (const x of [-0.25, 0.25]) g.push(new THREE.BoxGeometry(0.04, 0.04, 0.2).translate(x, y, -0.1)); // wall stand-offs
  return mergeGeometries(g);
}

export class WallFixtures {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.list = [];
    this.falling = [];
    const R = mulberry32(4242), gy = CITY.y + CITY.curb;
    const inside = (x, z, self) => world.buildings.some((o) => o !== self && Math.abs(x - o.x) < o.hx && Math.abs(z - o.z) < o.hz);
    const onGlass = (b, x, z) => b.shop && x > b.shop.x0 - 0.8 && x < b.shop.x1 + 0.8 && z > b.shop.z0 - 0.8 && z < b.shop.z1 + 0.8;
    for (const b of world.buildings) {
      const faces = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      // drainpipes near the corners of low and mid-rise buildings, a gutter along the roof edge
      if (b.h <= 70) for (const [nx, nz] of faces) {
        if (R() < 0.45) continue;
        const half = nx ? b.hz : b.hx, side = R() < 0.5 ? -1 : 1, along = side * (half - 0.5);
        const x = b.x + nx * (b.hx + 0.12) + (nz ? along : 0), z = b.z + nz * (b.hz + 0.12) + (nx ? along : 0);
        if (inside(x + nx * 1.5, z + nz * 1.5, b) || onGlass(b, x, z) || world.excluded(x, z, 0.3)) continue;
        this.list.push({ kind: 'pipe', x, z, nx, nz, y: b.y, h: b.h, gutter: half * 2, gx: b.x + nx * (b.hx + 0.12), gz: b.z + nz * (b.hz + 0.12), alongX: !nx });
      }
      // fire ladders up some buildings
      if (b.h <= 60 && R() < 0.5) {
        const [nx, nz] = faces[Math.floor(R() * 4)];
        const along = (R() - 0.5) * 1.4 * (nx ? b.hz : b.hx);
        const x = b.x + nx * (b.hx + 0.18) + (nz ? along : 0), z = b.z + nz * (b.hz + 0.18) + (nx ? along : 0);
        if (inside(x + nx * 1.5, z + nz * 1.5, b) || onGlass(b, x, z) || world.excluded(x, z, 0.3)) continue;
        this.list.push({ kind: 'ladder', x, z, nx, nz, y: b.y + 0.05, h: Math.min(b.h, b.setback ? b.h * 0.6 : b.h) + 1.0 });
      }
    }
    // static upper parts (stay on the wall) and instanced lower sections (can be torn off)
    const upper = { pipe: [], ladder: [] }, gutters = [];
    const kinds = { pipe: [], ladder: [] };
    for (const f of this.list) {
      const yaw = Math.atan2(f.nx, f.nz), bh = BREAK_H[f.kind];
      const top = f.h - bh - (f.kind === 'pipe' ? 0.3 : 0);
      if (top > 0.2) {
        upper[f.kind].push((f.kind === 'pipe' ? pipeGeo(top) : ladderGeo(top)).rotateY(yaw).translate(f.x, f.y + bh, f.z));
      }
      if (f.kind === 'pipe') {
        const L = f.gutter;
        gutters.push(new THREE.BoxGeometry(f.alongX ? L : 0.16, 0.16, f.alongX ? 0.16 : L).translate(f.gx + f.nx * 0.04, f.y + f.h - 0.2, f.gz + f.nz * 0.04));
      }
      f.yaw = yaw;
      f.idx = kinds[f.kind].length;
      kinds[f.kind].push(f);
      const c = { type: 'circle', x: f.x + f.nx * 0.1, z: f.z + f.nz * 0.1, r: f.kind === 'pipe' ? 0.2 : 0.32, top: f.y + 3, breakable: true, slow: 0.985, fixture: f };
      f.col = c;
      world.colliders.push(c);
      world.insertCollider(c);
    }
    this.pipeMat = new THREE.MeshStandardMaterial({ color: 0x6b7074, roughness: 0.5, metalness: 0.6 });
    this.ladderMat = new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.6, metalness: 0.5 });
    if (upper.pipe.length + gutters.length) this.addStatic(mergeGeometries(upper.pipe.concat(gutters)), this.pipeMat);
    if (upper.ladder.length) this.addStatic(mergeGeometries(upper.ladder), this.ladderMat);
    this.geo = { pipe: pipeGeo(BREAK_H.pipe), ladder: ladderGeo(BREAK_H.ladder) };
    this.inst = {};
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (const k of ['pipe', 'ladder']) {
      const arr = kinds[k];
      if (!arr.length) continue;
      const im = new THREE.InstancedMesh(this.geo[k], k === 'pipe' ? this.pipeMat : this.ladderMat, arr.length);
      arr.forEach((f, i) => { q.setFromAxisAngle(up, f.yaw); im.setMatrixAt(i, m4.compose(p.set(f.x, f.y, f.z), q, one)); });
      im.castShadow = true;
      scene.add(im);
      this.inst[k] = im;
    }
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.m4 = m4; this.q = q; this.p = p; this.one = one;
  }

  addStatic(g, mat) {
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    this.scene.add(m);
  }

  // the lower section snaps off and topples away from the wall, pushed the way the car was going
  breakFixture(f, v) {
    f.broken = true; f.brokenT = 0;
    const im = this.inst[f.kind];
    im.setMatrixAt(f.idx, this.zero); im.instanceMatrix.needsUpdate = true;
    const mesh = new THREE.Mesh(this.geo[f.kind], f.kind === 'pipe' ? this.pipeMat : this.ladderMat);
    mesh.castShadow = true;
    this.scene.add(mesh);
    // fall direction: mostly away from the wall, plus the car's travel
    const sp = Math.hypot(v.vel.x, v.vel.z) || 1;
    let dx = f.nx * 0.6 + (v.vel.x / sp) * 0.8, dz = f.nz * 0.6 + (v.vel.z / sp) * 0.8;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    this.falling.push({ f, mesh, ang: 0.05, w: 0.6 + sp * 0.08, dx, dz, x: f.x + (v.vel.x / sp) * 0.4, z: f.z + (v.vel.z / sp) * 0.4, t: 0, rest: false, spin: (Math.random() - 0.5) * 0.8 });
  }

  update(dt, camPos) {
    const axis = new THREE.Vector3(), qt = new THREE.Quaternion(), qy = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const F = this.falling[i];
      F.t += dt;
      if (!F.rest) {
        F.w += dt * 9 * Math.sin(F.ang + 0.2); // gravity pulls it over faster as it leans
        F.ang += F.w * dt;
        if (F.ang >= Math.PI / 2 - 0.04) { F.ang = Math.PI / 2 - 0.04; F.w *= -0.25; if (Math.abs(F.w) < 0.3) F.rest = true; }
      }
      // tip over around the base, about the horizontal axis perpendicular to the fall direction
      axis.set(F.dz, 0, -F.dx).normalize();
      qt.setFromAxisAngle(axis, F.ang);
      qy.setFromAxisAngle(up, F.f.yaw + F.spin * F.ang);
      F.mesh.quaternion.copy(qt).multiply(qy);
      F.mesh.position.set(F.x, F.f.y + 0.05, F.z);
      if (F.t > 45) { this.scene.remove(F.mesh); this.falling.splice(i, 1); }
    }
    // put them back once you're well away
    this.restoreT = (this.restoreT || 0) - dt;
    if (this.restoreT > 0) return;
    this.restoreT = 2;
    for (const f of this.list) {
      if (!f.broken) continue;
      f.brokenT += 2;
      if (f.brokenT > 90 && Math.hypot(f.x - camPos.x, f.z - camPos.z) > 200) {
        f.broken = false; f.col.broken = false;
        this.q.setFromAxisAngle(up, f.yaw);
        this.inst[f.kind].setMatrixAt(f.idx, this.m4.compose(this.p.set(f.x, f.y, f.z), this.q, this.one));
        this.inst[f.kind].instanceMatrix.needsUpdate = true;
      }
    }
  }
}
