// Loot: cash bags all over town and countryside, gold bars in the tricky spots.
// Drive through one to grab it; each has a light beam so you can spot it from afar.
import * as THREE from 'three';
import { mergeGeometries } from '../lib/addons/utils/BufferGeometryUtils.js';
import { CITY } from './world.js';
import { mulberry32 } from './noise.js';

const ACTIVE = 170;
const PICK_R = 3.2;

function bagGeo() {
  const sack = new THREE.SphereGeometry(0.55, 14, 10); sack.scale(1, 0.95, 0.85); sack.translate(0, 0.55, 0);
  const neck = new THREE.CylinderGeometry(0.16, 0.24, 0.28, 10); neck.translate(0, 1.12, 0);
  const tie = new THREE.TorusGeometry(0.18, 0.05, 6, 12); tie.rotateX(Math.PI / 2); tie.translate(0, 1.04, 0);
  const tuft = new THREE.ConeGeometry(0.22, 0.22, 8); tuft.rotateX(Math.PI); tuft.translate(0, 1.36, 0);
  const sign = new THREE.BoxGeometry(0.42, 0.42, 0.04); sign.translate(0, 0.6, 0.48); // the $ patch
  return mergeGeometries([sack, neck, tie, tuft, sign].map((g) => g.index ? g.toNonIndexed() : g));
}

export class Loot {
  constructor(world, scene) {
    this.world = world;
    const R = (this.rand = mulberry32(9917));
    const spots = { city: [], gold: [], country: [] };
    const cy = (x, z) => CITY.at(x, z) + CITY.curb;
    // town: sidewalks, alleys, shop floors
    for (const b of world.blocks) {
      if (b.kind === 'fwy') continue;
      const y = cy((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
      for (const [x, z] of [[b.x0 + 2, (b.z0 + b.z1) / 2], [b.x1 - 2, (b.z0 + b.z1) / 2], [(b.x0 + b.x1) / 2, b.z0 + 2], [(b.x0 + b.x1) / 2, b.z1 - 2]]) spots.city.push({ x, z, y: b.slope ? cy(x, z) : y });
      if (b.kind === 'park' || b.kind === 'plaza' || b.kind === 'skate') spots.city.push({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, y: cy((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2) });
    }
    for (const a of world.alleys) spots.city.push({ x: (a.x0 + a.x1) / 2, z: (a.z0 + a.z1) / 2, y: cy((a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2) });
    for (const b of world.buildings) if (b.driveThru && b.shop && b.shopKind !== 'passage') (b.through || R() < 0.3 ? spots.gold : spots.city).push({ x: (b.shop.x0 + b.shop.x1) / 2, z: (b.shop.z0 + b.shop.z1) / 2, y: b.y });
    // up on things: decks (garage roofs, ramps, footbridges), expressways, tunnels, the summit
    for (const br of world.bridges) {
      if (br.custom) { const p = br.pts[Math.floor(br.pts.length / 2)]; if (p && p.y > CITY.y + 3) spots.gold.push({ x: p.x, z: p.z, y: p.y }); continue; }
      const e = world.edges[br.edge];
      if (e && e.fwy) for (let i = 10; i < br.pts.length - 10; i += 18) { const p = br.pts[i]; spots.city.push({ x: p.x, z: p.z, y: p.y }); }
    }
    for (const tn of world.tunnels || []) { const p = tn.pts[Math.floor(tn.pts.length / 2)]; spots.gold.push({ x: p.x, z: p.z, y: p.y }); }
    for (const e of world.edges) {
      if (e.city || e.fwy) continue;
      if (e.peak) { const p = e.pts[e.pts.length - 1]; spots.gold.push({ x: p.x, z: p.z, y: p.y }); }
      for (let i = 20; i < e.pts.length - 20; i += 30) {
        const p = e.pts[i], q = e.pts[i + 1], L = Math.hypot(q.x - p.x, q.z - p.z) || 1;
        const off = (R() < 0.5 ? -1 : 1) * e.halfW * 0.5;
        spots.country.push({ x: p.x - ((q.z - p.z) / L) * off, z: p.z + ((q.x - p.x) / L) * off, y: p.y });
      }
    }
    this.spots = spots;
    // meshes: green canvas bags, gold bars, and a soft beam over each
    const bagMat = new THREE.MeshStandardMaterial({ color: 0x5f7f33, emissive: 0x2a4a10, emissiveIntensity: 0.6, roughness: 0.8 });
    const barMat = new THREE.MeshStandardMaterial({ color: 0xffc83c, emissive: 0xc98a10, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.9 });
    const barGeo = new THREE.BoxGeometry(1.0, 0.36, 0.5).translate(0, 0.5, 0);
    this.bags = new THREE.InstancedMesh(bagGeo(), bagMat, ACTIVE);
    this.bars = new THREE.InstancedMesh(barGeo, barMat, ACTIVE);
    // soft marker beam: bright at the base, fading out by ~22 m up
    const beamGeo = new THREE.CylinderGeometry(0.5, 1.1, 22, 10, 1, true).translate(0, 11, 0);
    this.beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uOp: { value: 0.18 } },
      vertexShader: 'varying float vH; void main() { vH = position.y / 22.0; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      // (clamped: pow() of a negative number is NaN on some GPUs, and bloom smears NaN into black blocks)
      fragmentShader: 'uniform float uOp; varying float vH; void main() { float f = clamp(1.0 - vH, 0.0, 1.0); gl_FragColor = vec4(1.0, 0.82, 0.42, clamp(uOp * f * f * sqrt(f), 0.0, 1.0)); }',
    });
    this.beams = new THREE.InstancedMesh(beamGeo, this.beamMat, ACTIVE);
    for (const m of [this.bags, this.bars, this.beams]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
    this.bags.castShadow = this.bars.castShadow = true;
    this.items = [];
    const far = { x: 1e9, z: 1e9 };
    for (let i = 0; i < ACTIVE; i++) this.items.push(this.place({}, far));
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.p = new THREE.Vector3();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  // put an item on a fresh spot, away from the player and from other loot
  place(it, player) {
    const R = this.rand;
    for (let tries = 0; tries < 40; tries++) {
      const r = R();
      const pool = r < 0.14 ? this.spots.gold : r < 0.72 ? this.spots.city : this.spots.country;
      if (!pool.length) continue;
      const s = pool[Math.floor(R() * pool.length)];
      if (Math.hypot(s.x - player.x, s.z - player.z) < 220) continue;
      if (this.items.some((o) => o !== it && o.spot === s)) continue;
      const gold = pool === this.spots.gold;
      Object.assign(it, { spot: s, x: s.x, y: s.y, z: s.z, gold, value: gold ? 1000 : 100 + Math.floor(R() * 5) * 50, phase: R() * 6.28 });
      return it;
    }
    return it;
  }

  // spin and bob them, check pickups; returns what the player grabbed this frame
  update(dt, time, player, camPos) {
    const got = [];
    const pp = player.pos;
    this.items.forEach((it, i) => {
      const dx = it.x - pp.x, dz = it.z - pp.z;
      if (dx * dx + dz * dz < PICK_R * PICK_R && Math.abs(it.y + 0.6 - pp.y) < 2.6) {
        got.push({ gold: it.gold, value: it.value, x: it.x, y: it.y, z: it.z });
        this.place(it, pp);
      }
      const spin = time * 1.6 + it.phase, bob = Math.sin(time * 2.2 + it.phase) * 0.18;
      this.q.setFromAxisAngle(this.p.set(0, 1, 0), spin);
      this.m4.compose(this.p.set(it.x, it.y + 0.35 + bob, it.z), this.q, this.s.set(1, 1, 1));
      this.bags.setMatrixAt(i, it.gold ? this.zero : this.m4);
      this.bars.setMatrixAt(i, it.gold ? this.m4 : this.zero);
      // beams only for loot that's a fair way off (up close you can see the thing itself)
      const d = Math.hypot(it.x - camPos.x, it.z - camPos.z);
      this.m4.compose(this.p.set(it.x, it.y, it.z), this.q.identity(), this.s.set(1, 1, 1));
      this.beams.setMatrixAt(i, d > 25 && d < 420 ? this.m4 : this.zero);
    });
    this.bags.instanceMatrix.needsUpdate = this.bars.instanceMatrix.needsUpdate = this.beams.instanceMatrix.needsUpdate = true;
    this.beamMat.uniforms.uOp.value = 0.16 + 0.05 * Math.sin(time * 3);
    return got;
  }
}
