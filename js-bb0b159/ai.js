// Traffic + police AI, spawning, and the heat (wanted) system.
import * as THREE from 'three';
import { Vehicle } from './vehicle.js';
import { CITY } from './world.js';

const _fw = new THREE.Vector3(), _rt = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _v1 = new THREE.Vector3();

const CIV_TYPES = [
  ['sedan', 26], ['compact', 17], ['taxi', 9], ['van', 10], ['pickup', 14], ['bus', 5], ['truck', 8],
  ['hatch', 14], ['sedan2', 15], ['suv', 13], ['sport', 2.6], ['super', 0.9], // modern cars; the sporty ones are a rare sight
];
const MODERN = new Set(['hatch', 'sedan2', 'suv', 'sport', 'super']);
const MODERN_COLORS = [0xc8ccd0, 0xe8e8e6, 0x2a2c30, 0x5a5e64, 0x1e3a6a, 0x8a1a1a, 0xf2f0ea, 0x3a4a5a, 0x6a7078, 0x0f0f10];
const SPORT_COLORS = [0xd81e1e, 0xf2c419, 0x1a1a1a, 0xf2f2f0, 0x2a6ad8, 0xf07a1a, 0x3aa84a];
const CIV_COLORS = [0xb8872a, 0x5d6b2c, 0xb5541f, 0x6b4a2e, 0xd9cfb4, 0x8fb2c9, 0x7a1f1f, 0x2e3a52, 0x3f5a3a, 0x9a9a8e, 0x1a1a1a, 0xc9b98a, 0x4f6f7a, 0x8a3a2a, 0xe0d8c0];

// city streets get lots of buses, delivery trucks and vans; taxis and buses stay in town
const CITY_BOOST = { bus: 2.4, truck: 1.7, van: 1.4, taxi: 1.3 };
function pickType(rand, city) {
  const wt = (t, w) => ((t === 'taxi' || t === 'bus') && !city ? 0 : w * (city ? CITY_BOOST[t] || 1 : 1));
  let tot = 0;
  for (const [t, w] of CIV_TYPES) tot += wt(t, w);
  let r = rand() * tot;
  for (const [t, w] of CIV_TYPES) if ((r -= wt(t, w)) <= 0) return t;
  return 'sedan';
}

export class AIDriver {
  constructor(vehicle, role) {
    this.v = vehicle;
    vehicle.driver = this;
    this.role = role; // 'civ' | 'police'
    this.queue = [];
    this.mode = role === 'police' ? 'patrol' : 'cruise';
    this.stuckT = 0;
    this.reverseT = 0;
    this.replanT = 0;
    this.waitT = 0;
    this.blockT = 0;
    this.lastNode = -1;
    this.offset = 0;
    this.horn = 0;
    this.aggression = 0.8 + Math.random() * 0.2;
    this.sirenOn = false;
    this.lightPhase = Math.random() * 10;
    this.sawPlayer = false;
    this.target = new THREE.Vector3();
  }
}

export class TrafficManager {
  constructor(world, scene, game) {
    this.world = world;
    this.scene = scene;
    this.game = game;
    this.drivers = [];
    this.pool = {};
    this.lanes = new Map();
    this.rand = Math.random;
    this.civTarget = 26;
    this.heat = 0;
    this.chaseTime = 0;
    this.evadeT = 0;
    this.lastSeen = new THREE.Vector3();
    this.bustT = 0;
    this.crimeCooldown = {};
    this.roadblockT = 20;
    this.copsWrecked = 0;
    this.time = 0;
    this.redNode = -1;
    this.stats = { escapes: 0, busted: 0, bestChase: 0 };
  }

  // ---------------- lanes ----------------
  lane(e, dir, police = false, laneIdx = 0) {
    laneIdx = Math.min(laneIdx, e.lanes.length - 1);
    const key = ((e.id * 2 + dir) * 2 + (police ? 1 : 0)) * 4 + laneIdx;
    if (this.lanes.has(key)) return this.lanes.get(key);
    const P = dir === 0 ? e.pts : e.pts.slice().reverse();
    const n0 = this.world.nodes[dir === 0 ? e.a : e.b], n1 = this.world.nodes[dir === 0 ? e.b : e.a];
    const cross = (nd) => (e.axis === 1 ? nd.hx : nd.hz) + 2;
    const r0 = n0.city ? cross(n0) : 6, r1 = n1.city ? cross(n1) : 6;
    const off = police ? e.lanes[0] * 0.55 : e.lanes[laneIdx];
    const out = [];
    let s = 0;
    for (let i = 0; i < P.length; i++) {
      if (i > 0) s += Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z);
      if (s < r0 || s > e.len - r1) continue;
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      let tx = b.x - a.x, tz = b.z - a.z;
      const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
      out.push({ x: P[i].x - tz * off, z: P[i].z + tx * off, y: P[i].y, v: e.speed, stop: -1, axis: e.axis, tx, tz });
    }
    if (out.length < 2) {
      // very short edge: use endpoints
      const a = P[0], b = P[P.length - 1];
      let tx = b.x - a.x, tz = b.z - a.z;
      const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
      out.length = 0;
      out.push({ x: a.x + tx * r0 - tz * off, z: a.z + tz * r0 + tx * off, y: a.y, v: e.speed, stop: -1, axis: e.axis, tx, tz });
      out.push({ x: b.x - tx * r1 - tz * off, z: b.z - tz * r1 + tx * off, y: b.y, v: e.speed, stop: -1, axis: e.axis, tx, tz });
    }
    // curvature speeds
    for (let i = 1; i < out.length - 1; i++) {
      const a = out[i - 1], b = out[i + 1];
      const ang = Math.abs(Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz));
      const ds = Math.hypot(b.x - a.x, b.z - a.z);
      const k = ang / Math.max(ds, 0.1);
      if (k > 1e-4) out[i].v = Math.min(out[i].v, Math.sqrt(3.0 / k));
    }
    out[out.length - 1].stop = n1.id;
    const res = { pts: out, edge: e, dir, from: n0.id, to: n1.id };
    this.lanes.set(key, res);
    return res;
  }

  appendLane(d, ln) {
    const q = d.queue;
    if (q.length) {
      const last = q[q.length - 1];
      const first = ln.pts[0];
      const ang = Math.abs(Math.atan2(last.tx * first.tz - last.tz * first.tx, last.tx * first.tx + last.tz * first.tz));
      const vt = Math.max(4.5, 15 - ang * 7.5);
      last.v = Math.min(last.v, vt);
      // turning: follow a curve through the junction (control point where the two lanes would meet)
      // instead of a straight chord the car would cut across the corner on
      if (ang > 0.3) {
        const ax = last.x, az = last.z, bx = first.x, bz = first.z;
        const det = last.tx * -first.tz - last.tz * -first.tx;
        if (Math.abs(det) > 0.05) {
          const t1 = ((bx - ax) * -first.tz - (bz - az) * -first.tx) / det;
          const L = Math.hypot(bx - ax, bz - az);
          if (t1 > 0 && t1 < L * 1.5) {
            const cx = ax + last.tx * t1, cz = az + last.tz * t1;
            for (let k = 1; k < 6; k++) {
              const t = k / 6, u = 1 - t;
              const x = u * u * ax + 2 * u * t * cx + t * t * bx, z = u * u * az + 2 * u * t * cz + t * t * bz;
              const dx = 2 * u * (cx - ax) + 2 * t * (bx - cx), dz = 2 * u * (cz - az) + 2 * t * (bz - cz), dl = Math.hypot(dx, dz) || 1;
              q.push({ x, z, y: last.y + (first.y - last.y) * t, v: vt, stop: -1, axis: last.axis, tx: dx / dl, tz: dz / dl, edgeId: last.edgeId, dirId: last.dirId });
            }
          }
        }
      }
      for (const p of ln.pts) q.push({ ...p, v: p === first ? Math.min(p.v, vt) : p.v, edgeId: ln.edge.id, dirId: ln.dir });
    } else for (const p of ln.pts) q.push({ ...p, edgeId: ln.edge.id, dirId: ln.dir });
    d.lastNode = ln.to;
    d.lastEdge = ln.edge.id;
  }

  extendRandom(d) {
    const w = this.world;
    const node = w.nodes[d.lastNode];
    let opts = node.edges.filter((id) => id !== d.lastEdge);
    if (!opts.length) opts = node.edges;
    // civilians prefer staying on the road type they're on, and prefer going straight a bit
    const id = opts[Math.floor(Math.random() * opts.length)];
    const e = w.edges[id];
    const dir = e.a === node.id ? 0 : 1;
    this.appendLane(d, this.lane(e, dir, d.role === 'police' && d.mode !== 'patrol', d.laneIdx || 0));
  }

  // ---------------- spawning ----------------
  getVehicle(type, scheme) {
    const key = type + '|' + scheme;
    const p = this.pool[key];
    if (p && p.length) {
      const v = p.pop();
      v.root.visible = true;
      return v;
    }
    const pal = type === 'sport' || type === 'super' ? SPORT_COLORS : MODERN.has(type) ? MODERN_COLORS : CIV_COLORS;
    const color = scheme === 'police' ? 0xffffff : scheme === 'fire' ? 0xb81c14 : scheme === 'ambulance' ? 0xf2f0ea : type === 'taxi' ? 0xf2c230 : pal[Math.floor(Math.random() * pal.length)];
    const v = new Vehicle(this.world, type, color, type === 'bus' ? 'bus' : scheme);
    this.scene.add(v.root);
    return v;
  }

  release(d) {
    const v = d.v;
    v.root.visible = false;
    v.sleeping = true;
    v.ghost = false;
    const key = v.type + '|' + v.scheme;
    (this.pool[key] || (this.pool[key] = [])).push(v);
    const i = this.drivers.indexOf(d);
    if (i >= 0) this.drivers.splice(i, 1);
    this.game.onDespawn(v);
  }

  placeOnLane(d, ln, idx, speed) {
    const v = d.v;
    const p = ln.pts[Math.min(idx, ln.pts.length - 1)];
    v.resetTo(p.x, this.world.groundAt(p.x, p.z, p.y + 2).h, p.z, Math.atan2(-p.tx, -p.tz), speed);
    v.sleeping = false;
    v.damage = 0;
    v.wrecked = false;
    v.gear = 1;
    d.queue.length = 0;
    this.appendLane(d, { ...ln, pts: ln.pts.slice(Math.min(idx, ln.pts.length - 1)) });
    d.lastEdge = ln.edge.id;
  }

  spawnCiv(player, cam, dense) {
    const w = this.world;
    let sp = this.findSpawn(player, dense ? 75 : 110, dense ? 300 : 380, cam, true);
    if (!sp) return null;
    const city = w.inCityRect(sp.x, sp.z, 0);
    const type = pickType(Math.random, city);
    const v = this.getVehicle(type, type === 'taxi' ? 'taxi' : type === 'bus' ? 'bus' : 'plain');
    const d = new AIDriver(v, 'civ');
    if (type === 'bus' || type === 'truck') d.aggression *= 0.85;
    d.laneIdx = Math.random() < 0.5 ? 1 : 0;
    if (sp.ln.edge.lanes.length > 1 && d.laneIdx) {
      const ln2 = this.lane(sp.ln.edge, sp.ln.dir, false, 1);
      sp = { ...sp, ln: ln2, idx: Math.min(sp.idx, ln2.pts.length - 1) };
    }
    this.placeOnLane(d, sp.ln, sp.idx, Math.min(sp.ln.pts[sp.idx].v, sp.ln.edge.speed) * 0.85);
    this.drivers.push(d);
    this.game.onSpawn(v);
    return d;
  }

  // an ambulance or fire engine, out of sight, under lights and siren; with a destination it drives there and parks
  spawnEmergency(type, player, cam, dest = null, close = false) {
    // responders set off from a few blocks away from the call (out of the player's sight); runs start near the player
    let sp = null;
    for (let k = 0; k < 6 && !sp; k++) {
      sp = dest ? this.findSpawn({ pos: { x: dest.x, y: 0, z: dest.z } }, close ? 50 : 160, close ? 130 : 300, cam, true) : this.findSpawn(player, 230, 420, cam, true);
      if (sp && Math.hypot(sp.x - player.pos.x, sp.z - player.pos.z) < (close ? 90 : 140)) sp = null;
    }
    if (!sp) return null;
    const v = this.getVehicle(type, type === 'firetruck' ? 'fire' : type === 'police' ? 'police' : 'ambulance');
    const d = new AIDriver(v, type === 'firetruck' ? 'fire' : type === 'police' ? 'police' : 'ems');
    d.aggression = 1.3;
    d.sirenOn = true;
    this.placeOnLane(d, sp.ln, sp.idx, 8);
    this.drivers.push(d);
    this.game.onSpawn(v);
    if (dest) this.routeTo(d, dest.x, dest.z);
    return d;
  }

  // U-turn: take the opposite lane of this road from here, and keep going away
  flee(d, m) {
    const v = d.v, w = this.world, q0 = d.queue[0];
    d.mode = 'flee'; d.fleeT = 18 + Math.random() * 8; d.aggression = this.panic ? 2.3 : 1.8; d.honkReq = true; v.hazards = true;
    v.forward(_fw);
    const towards = (m.x - v.pos.x) * _fw.x + (m.z - v.pos.z) * _fw.z > 0;
    if (!towards || !q0 || q0.edgeId === undefined || q0.dirId === undefined) return; // already heading away: just floor it
    const e = w.edges[q0.edgeId], ln = this.lane(e, 1 - q0.dirId);
    let bi = 0, bd = 1e18;
    ln.pts.forEach((p, i) => { const dd = (p.x - v.pos.x) ** 2 + (p.z - v.pos.z) ** 2; if (dd < bd) { bd = dd; bi = i; } });
    d.queue.length = 0;
    this.appendLane(d, { ...ln, pts: ln.pts.slice(Math.min(bi + 2, ln.pts.length - 1)) });
    d.lastEdge = e.id;
  }

  routeTo(d, x, z) {
    const w = this.world, v = d.v;
    let start = -1;
    for (const p of d.queue) if (p.stop >= 0) { start = p.stop; break; }
    if (start < 0) start = this.nearestNode(v.pos.x, v.pos.z);
    const keep = [];
    for (const p of d.queue) { keep.push(p); if (p.stop === start) break; }
    d.queue = keep;
    d.lastNode = start;
    for (const step of this.dijkstra(start, this.nearestNode(x, z))) this.appendLane(d, this.lane(w.edges[step.edge], step.dir));
    d.queue.push({ x, z, y: w.groundAt(x, z, 99).h, v: 0, stop: -1, axis: -1, tx: 0, tz: 1 });
    d.mode = 'respond';
    d.dest = { x, z };
  }

  // back into ordinary traffic: lights off, wander on
  standDown(d) {
    d.sirenOn = false;
    d.mode = 'cruise';
    d.queue.length = 0;
    d.lastNode = -1;
    if (d.v.car.lightbar) { d.v.car.lightbar.red.emissiveIntensity = 0; d.v.car.lightbar.blue.emissiveIntensity = 0; }
  }

  spawnPolice(player, cam, minD = 170, maxD = 340, mode = 'pursuit') {
    const sp = this.findSpawn(player, minD, maxD, cam, true);
    if (!sp) return null;
    const v = this.getVehicle('police', 'police');
    const d = new AIDriver(v, 'police');
    d.mode = mode;
    this.placeOnLane(d, sp.ln, sp.idx, 10);
    this.drivers.push(d);
    this.game.onSpawn(v);
    return d;
  }

  findSpawn(player, minD, maxD, cam, avoidView) {
    const w = this.world;
    const px = player.pos.x, pz = player.pos.z;
    cam.getWorldDirection(_fw);
    for (let tries = 0; tries < 40; tries++) {
      const e = w.edges[Math.floor(Math.random() * w.edges.length)];
      // quick reject by edge bbox distance
      const mid = e.pts[e.pts.length >> 1];
      if (Math.hypot(mid.x - px, mid.z - pz) > maxD + e.len / 2) continue;
      const ln = this.lane(e, Math.random() < 0.5 ? 0 : 1);
      if (ln.pts.length < 2) continue;
      const idx = Math.floor(Math.random() * (ln.pts.length - 1));
      const p = ln.pts[idx];
      const dx = p.x - px, dz = p.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist < minD || dist > maxD) continue;
      if (avoidView && dist < 260) {
        const dot = (dx * _fw.x + dz * _fw.z) / dist;
        if (dot > 0.35) continue;
      }
      let clear = true;
      for (const o of this.drivers) if (Math.hypot(o.v.pos.x - p.x, o.v.pos.z - p.z) < 14) { clear = false; break; }
      if (!clear) continue;
      return { ln, idx, x: p.x, z: p.z };
    }
    return null;
  }

  spawnRoadblock(player) {
    player.forward(_fw);
    const sp = player.vel.length() > 8 ? player.vel.clone().normalize() : _fw.clone();
    this.spawnBlockAt(player.pos.x + sp.x * 230, player.pos.z + sp.z * 230);
  }

  // a roadblock across the road nearest (tx, tz); dino roadblocks hold until told otherwise
  spawnBlockAt(tx, tz, dino = false) {
    const w = this.world;
    let best = null, bd = 1e9;
    for (const e of w.edges) {
      for (let i = 2; i < e.pts.length - 2; i += 2) {
        if (e.bridge[i]) continue;
        const p = e.pts[i];
        const d = Math.hypot(p.x - tx, p.z - tz);
        if (d < bd) { bd = d; best = { e, i }; }
      }
    }
    if (!best || bd > 90) return;
    const { e, i } = best;
    const p = e.pts[i], q = e.pts[i + 1];
    let ux = q.x - p.x, uz = q.z - p.z;
    const ul = Math.hypot(ux, uz); ux /= ul; uz /= ul;
    const rx = -uz, rz = ux;
    const heading = Math.atan2(-rx, -rz);
    for (const s of [-1, 1]) {
      const v = this.getVehicle('police', 'police');
      const d = new AIDriver(v, 'police');
      const x = p.x + rx * s * (e.halfW * 0.45), z = p.z + rz * s * (e.halfW * 0.45);
      v.resetTo(x, w.groundAt(x, z, p.y + 2).h, z, heading + (s > 0 ? Math.PI : 0) + (Math.random() - 0.5) * 0.4, 0);
      v.sleeping = false; v.damage = 0; v.wrecked = false;
      d.mode = 'block';
      d.blockT = dino ? 60 : 35;
      d.dinoBlock = dino;
      d.queue.length = 0;
      d.lastNode = e.b; d.lastEdge = e.id;
      this.drivers.push(d);
      this.game.onSpawn(v);
    }
    if (!dino) this.game.message('ROADBLOCK AHEAD', 2.5);
  }

  // ---------------- heat ----------------
  witnessed(player, range = 110) {
    for (const d of this.drivers) {
      if (d.role !== 'police' || d.v.wrecked) continue;
      const dist = d.v.pos.distanceTo(player.pos);
      if (dist < 35) return true;
      if (dist < range && this.world.lineOfSight(d.v.pos.x, d.v.pos.y + 1, d.v.pos.z, player.pos.x, player.pos.y + 1, player.pos.z)) return true;
    }
    return false;
  }

  crime(name, severity, player, force = false) {
    const cd = this.crimeCooldown[name] || 0;
    if (cd > this.time) return;
    if (!force && !this.witnessed(player)) return;
    this.crimeCooldown[name] = this.time + 6;
    const was = this.heat;
    if (this.heat < 1) {
      this.heat = Math.max(1, severity);
      this.chaseTime = 0;
      this.game.message(name, 2.2, 'crime');
      this.game.message('POLICE PURSUIT', 3, 'alert', 0.6);
      for (const d of this.drivers) if (d.role === 'police' && d.mode === 'patrol') this.setPursuit(d);
    } else {
      this.heat = Math.min(5, this.heat + severity * 0.35);
      this.game.message(name, 1.8, 'crime');
    }
    this.lastSeen.copy(player.pos);
    this.evadeT = 0;
    if (Math.floor(this.heat) > Math.floor(was) && was >= 1) this.game.message('HEAT LEVEL ' + Math.floor(this.heat), 2, 'alert', 0.3);
  }

  setPursuit(d) {
    d.mode = 'pursuit';
    d.replanT = 0;
    d.sirenOn = true;
  }

  updateHeat(dt, player) {
    this.time += dt;
    if (this.heat <= 0) { this.bustT = 0; return; }
    this.chaseTime += dt;
    this.stats.bestChase = Math.max(this.stats.bestChase, this.chaseTime);
    // slow escalation
    const lvl = Math.floor(this.heat);
    this.heat = Math.min(5, this.heat + dt / 70);
    if (Math.floor(this.heat) > lvl) this.game.message('HEAT LEVEL ' + Math.floor(this.heat), 2, 'alert');
    // visibility
    let seen = false, nearest = 1e9;
    for (const d of this.drivers) {
      if (d.role !== 'police' || d.v.wrecked) continue;
      const dist = d.v.pos.distanceTo(player.pos);
      nearest = Math.min(nearest, dist);
      if (d.mode === 'patrol' && dist < 250) this.setPursuit(d);
      if (dist < 40 || (dist < 130 && this.world.lineOfSight(d.v.pos.x, d.v.pos.y + 1.2, d.v.pos.z, player.pos.x, player.pos.y + 1.2, player.pos.z))) {
        seen = true; d.sawPlayer = true;
      } else d.sawPlayer = false;
    }
    if (seen) { this.evadeT = 0; this.lastSeen.copy(player.pos); }
    else this.evadeT += dt;
    this.evadeLimit = 9 + this.heat * 2.5;
    if (this.evadeT > this.evadeLimit) {
      this.heat = 0;
      this.stats.escapes++;
      this.game.message('YOU LOST THEM', 3, 'good');
      this.game.onEscape(this.chaseTime);
      for (const d of this.drivers) if (d.role === 'police') { d.mode = 'patrol'; d.sirenOn = false; d.queue.length = 0; d.lastNode = -1; }
      return;
    }
    // bust
    const slow = player.vel.length() < 1.8;
    let close = false;
    for (const d of this.drivers) {
      if (d.role !== 'police' || d.v.wrecked) continue;
      if (d.v.pos.distanceTo(player.pos) < 9.5) { close = true; break; }
    }
    if (slow && close) this.bustT += dt;
    else this.bustT = Math.max(0, this.bustT - dt * 2);
    if (this.bustT > 3.2) { this.bustT = 0; this.stats.busted++; this.game.onBusted(); }
    // roadblocks at high heat
    if (this.heat >= 3) {
      this.roadblockT -= dt;
      if (this.roadblockT <= 0) { this.roadblockT = 45 - this.heat * 4; this.spawnRoadblock(player); }
    }
  }

  checkPlayerCrimes(dt, player) {
    const w = this.world;
    const spd = player.vel.length();
    const nr = w.nearestRoad(player.pos.x, player.pos.z);
    const limit = nr.edge ? nr.edge.speed : 25;
    if (spd > limit * 1.3 + 2) this.crime('SPEEDING', 1, player);
    // wrong side of the road (right-hand traffic), held for a moment, away from junctions
    this.wrongWay = false;
    if (nr.edge && nr.d < -0.3 && spd > 7) {
      const e = nr.edge, P = e.pts, a = P[nr.seg], b = P[nr.seg + 1];
      const tl = Math.hypot(b.x - a.x, b.z - a.z) || 1, tx = (b.x - a.x) / tl, tz = (b.z - a.z) / tl;
      const cx = a.x + (b.x - a.x) * nr.t, cz = a.z + (b.z - a.z) * nr.t;
      const lat = (player.pos.x - cx) * -tz + (player.pos.z - cz) * tx;
      const along = player.vel.x * tx + player.vel.z * tz;
      const fromEnds = Math.min(nr.seg, P.length - 2 - nr.seg) * 4;
      if (fromEnds > 22 && Math.abs(lat) > 1.2 && along * lat < 0 && Math.abs(along) > 0.7 * spd) this.wrongWay = true;
    }
    this.wrongT = this.wrongWay ? (this.wrongT || 0) + dt : Math.max(0, (this.wrongT || 0) - dt * 2);
    if (this.wrongT > 1.5) this.crime('WRONG WAY', 1, player);
    // tearing along the sidewalk / through the park
    const blk = w.inCityRect(player.pos.x, player.pos.z, 0) ? w.cityBlockAt(player.pos.x, player.pos.z) : null;
    const onDeck = player.pos.y - w.groundAt(player.pos.x, player.pos.z, -1e9).h > player.comH + 0.8;
    const walk = blk && blk.kind !== 'garage' && blk.kind !== 'lot' && !onDeck && spd > 8.3;
    this.walkT = walk ? (this.walkT || 0) + dt : 0;
    if (this.walkT > 1.0) this.crime('RECKLESS DRIVING', 1, player);
    // red lights
    let inNode = -1;
    if (w.inCityRect(player.pos.x, player.pos.z, 2)) {
      const i = Math.round((player.pos.x - CITY.x0) / CITY.B), j = Math.round((player.pos.z - CITY.z0) / CITY.B);
      if (i >= 0 && j >= 0 && i <= CITY.NX && j <= CITY.NZ) {
        const nd = w.nodes[w.cityNode(i, j)];
        if (Math.abs(player.pos.x - nd.x) < 6 && Math.abs(player.pos.z - nd.z) < 6) {
          inNode = nd.id;
          if (this.redNode !== nd.id && nd.light && spd > 5) {
            const axis = Math.abs(player.vel.x) > Math.abs(player.vel.z) ? 1 : 0;
            if (w.lightState(nd, axis, this.time) === 'R') this.crime('RAN A RED LIGHT', 1, player);
          }
        }
      }
    }
    this.redNode = inNode;
  }

  // ---------------- driving ----------------
  update(dt, player, cam, allCars) {
    this.updateHeat(dt, player);
    this.checkPlayerCrimes(dt, player);
    // spawn / despawn
    const civs = this.drivers.filter((d) => d.role === 'civ').length;
    const inCity = this.world.inCityRect(player.pos.x, player.pos.z, 200);
    this.civTarget = inCity ? (this.game.isTouch ? 120 : 272) : (this.game.isTouch ? 20 : 30); // phones get lighter traffic
    if (civs < this.civTarget) this.spawnCiv(player, cam, inCity);
    const police = this.drivers.filter((d) => d.role === 'police' && !d.v.wrecked);
    const lvl = Math.ceil(this.heat);
    const wantCops = this.heat > 0 ? [0, 2, 3, 4, 6, 7][lvl] : (this.world.inCityRect(player.pos.x, player.pos.z, 300) ? 3 : 1);
    const pursuing = police.filter((d) => d.mode !== 'block').length;
    if (pursuing < wantCops) this.spawnPolice(player, cam, this.heat > 0 ? 120 : 150, this.heat > 0 ? 260 : 380, this.heat > 0 ? 'pursuit' : 'patrol');
    for (let i = this.drivers.length - 1; i >= 0; i--) {
      const d = this.drivers[i];
      const dist = d.v.pos.distanceTo(player.pos);
      const onCall = d.mode === 'respond' || d.mode === 'onscene';
      const tooFar = dist > (onCall ? 950 : d.role === 'police' && this.heat > 0 ? 520 : d.role === 'civ' && this.civTarget > 30 ? 360 : 440);
      const dead = (d.v.wrecked || d.v.isFlipped() || d.v.inWater > 0.5) && dist > 120;
      const hopeless = ((d.stuckCount || 0) > 3 && dist > 140) || ((d.waitT || 0) > 30 && dist > 110);
      if (tooFar || dead || hopeless || d.v.pos.y < -20) this.release(d);
      else if (d.v.speed > 5) d.stuckCount = 0;
    }
    // far-off civilians become "ghosts": they glide along their lanes without full physics (cheap),
    // and turn back into real cars as you approach
    const cp = cam.position;
    for (const d of this.drivers) {
      if (d.role !== 'civ' || d.v.wrecked) { if (d.ghost) this.unghost(d); continue; }
      const dc = Math.hypot(d.v.pos.x - cp.x, d.v.pos.z - cp.z), dp = Math.hypot(d.v.pos.x - player.pos.x, d.v.pos.z - player.pos.z);
      const near = Math.min(dc, dp);
      if (!d.ghost && near > 115 && d.queue.length && !d.v.isFlipped()) { d.ghost = true; d.v.ghost = true; d.gSpeed = Math.max(0, d.v.speed); }
      else if (d.ghost && near < 95 && (near < 55 || !this.overlapsAny(d.v, allCars))) this.unghost(d, allCars); // (wait until clear of its neighbours)
    }
    this.emergencies = this.drivers.filter((d) => d.sirenOn && !d.v.wrecked && d.mode !== 'onscene');
    for (const d of this.drivers) d.ghost ? this.ghostDrive(d, dt, allCars) : this.drive(d, dt, player, allCars);
    for (const d of this.drivers.filter((x) => x.kill)) { d.kill = false; this.release(d); }
  }

  cutIn(d, now) {
    if (now && !d.cut) {
      if (Math.random() < 0.5 && this.time - (d.lastHonk || -99) > 12 && this.time - (this.lastHonkAll || -99) > 1.5) {
        d.honkReq = 1; d.lastHonk = this.time; this.lastHonkAll = this.time;
      }
    }
    d.cut = now;
  }

  overlapsAny(v, allCars) {
    for (const o of allCars) {
      if (o === v || o.sleeping) continue;
      const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z, r = v.hz + o.hz + 0.5;
      if (dx * dx + dz * dz < r * r) {
        v.forward(_fw);
        const along = Math.abs(dx * _fw.x + dz * _fw.z), lat = Math.abs(dx * _fw.z - dz * _fw.x);
        if (along < v.hz + o.hz + 0.6 && lat < v.hx + o.hx + 0.3) return true;
      }
    }
    return false;
  }

  unghost(d, allCars) {
    const v = d.v;
    d.unghostT = performance.now();
    d.ghost = false; v.ghost = false;
    // start no faster than the gap to whoever is just ahead allows (a gliding queue packs tighter than real brakes do)
    let speed = d.gSpeed || 0;
    v.forward(_fw);
    for (const o of allCars || []) {
      if (o === v || o.sleeping) continue;
      const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z, fwd = dx * _fw.x + dz * _fw.z;
      if (fwd < 0 || fwd > 25 || Math.abs(dx * _fw.z - dz * _fw.x) > 2.4) continue;
      const gap = fwd - v.hz - o.hz;
      speed = Math.min(speed, Math.max(0, o.vel.dot(_fw)) + Math.sqrt(2 * 4 * Math.max(0, gap - 1.5)));
    }
    const g = this.world.groundAt(v.pos.x, v.pos.z, v.pos.y + 1.5).h;
    v.resetTo(v.pos.x, g, v.pos.z, v.heading, speed);
  }

  ghostDrive(d, dt, allCars) {
    const v = d.v, q = d.queue, w = this.world;
    if (!q.length) this.joinNearestRoad(d);
    let rem = 0;
    for (let i = 1; i < q.length && rem < 90; i++) rem += Math.abs(q[i].x - q[i - 1].x) + Math.abs(q[i].z - q[i - 1].z);
    if (rem < 90 && d.lastNode >= 0) this.extendRandom(d);
    if (!q.length) return;
    v.forward(_fw);
    // desired speed: lane speed, red lights, and whoever is ahead
    let vDes = q[0].v * d.aggression, acc = 0, px = v.pos.x, pz = v.pos.z;
    for (let i = 0; i < q.length && acc < 60; i++) {
      acc += Math.hypot(q[i].x - px, q[i].z - pz); px = q[i].x; pz = q[i].z;
      vDes = Math.min(vDes, Math.sqrt(q[i].v * q[i].v * d.aggression * d.aggression + 2 * 3.8 * acc));
      if (q[i].stop >= 0) {
        const nd = w.nodes[q[i].stop];
        if (nd.light) {
          const s = w.lightState(nd, q[i].axis, this.time);
          if (s === 'R' || (s === 'Y' && acc > 12)) { vDes = Math.min(vDes, Math.sqrt(2 * 3.8 * Math.max(0, acc - 3))); break; }
        }
        if (acc < 45 && this.boxBlocked(d, q, i, allCars)) { vDes = Math.min(vDes, Math.sqrt(2 * 3.8 * Math.max(0, acc - 3))); break; } // (same rule as real cars)
      }
    }
    for (const o of allCars) {
      if (o === v || o.sleeping) continue;
      const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z;
      if (Math.abs(dx) > 30 || Math.abs(dz) > 30) continue;
      const fwd = dx * _fw.x + dz * _fw.z;
      if (fwd < 0 || fwd > 28) continue;
      if (Math.abs(dx * _fw.z - dz * _fw.x) > 2.4) continue;
      const gap = fwd - v.hz - o.hz - 1;
      vDes = Math.min(vDes, Math.max(0, Math.max(0, o.vel.dot(_fw)) + gap * 0.45), Math.sqrt(2 * 5 * Math.max(0, gap - 1)));
    }
    d.gSpeed += Math.max(-6 * dt, Math.min(2.6 * dt, vDes - d.gSpeed));
    // slide along the lane polyline
    let s = d.gSpeed * dt, x = v.pos.x, z = v.pos.z;
    while (s > 0 && q.length) {
      const dx = q[0].x - x, dz = q[0].z - z, L = Math.hypot(dx, dz);
      if (L <= s) { x = q[0].x; z = q[0].z; s -= L; if (q.length > 1) q.shift(); else break; }
      else { x += (dx / L) * s; z += (dz / L) * s; s = 0; }
    }
    const tx = q[0].x - x, tz = q[0].z - z;
    if (tx * tx + tz * tz > 0.01) {
      const want = Math.atan2(-tx, -tz), cur = v.heading;
      let dh = want - cur; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
      v.quat.setFromAxisAngle(_up, cur + dh * Math.min(1, dt * 6));
    }
    // height straight from the lane's own road profile: asking the ground here can pick a ramp deck
    // passing just overhead and carry the car up onto it
    const ly = q[0].y !== undefined ? q[0].y : w.groundAt(x, z, v.pos.y + 1.5).h;
    // a route that disagrees with where the car actually is (e.g. a street under the expressway): out of sight, so retire it
    if (Math.abs(ly + v.comH - v.pos.y) > 2.5) { d.kill = true; return; }
    v.pos.set(x, ly + v.comH, z); // (where a parked car's body settles on its springs)
    v.forward(_fw);
    v.vel.copy(_fw).multiplyScalar(d.gSpeed);
    v.angVel.set(0, 0, 0);
    v.speed = d.gSpeed;
    for (const wh of v.wheels) wh.spinAngle += (d.gSpeed / v.spec.wheelR) * dt;
    v.input.throttle = 0; v.input.brake = d.gSpeed < vDes - 0.5 ? 0 : 0.3; v.input.steer = 0;
  }

  drive(d, dt, player, allCars) {
    const v = d.v, inp = v.input;
    if (v.wrecked || v.damage >= 1) {
      v.wrecked = true;
      v.hazards = true;
      inp.throttle = 0; inp.brake = 0.3; inp.handbrake = 1; inp.steer = 0;
      d.sirenOn = false;
      return;
    }
    if (v.car.lightbar) {
      d.lightPhase += dt;
      const lb = v.car.lightbar;
      if (lb) {
        const on = d.sirenOn;
        const ph = d.lightPhase * 7;
        lb.red.emissiveIntensity = on ? (Math.sin(ph) > 0 ? 7 : 0.2) : 0;
        lb.blue.emissiveIntensity = on ? (Math.sin(ph) <= 0 ? 7 : 0.2) : 0;
      }
    }
    if (d.mode === 'onscene') { // parked at a call-out, lights going
      inp.throttle = 0; inp.brake = 1; inp.steer = 0; inp.handbrake = 1;
      v.hazards = false;
      return;
    }
    if (d.mode === 'block') {
      inp.throttle = 0; inp.brake = 1; inp.steer = 0; inp.handbrake = 1;
      d.sirenOn = true;
      d.blockT -= dt;
      const dist = v.pos.distanceTo(player.pos);
      if (d.blockT < 0 || (dist < 28 && this.heat > 0) || (this.heat <= 0 && !d.dinoBlock)) {
        inp.handbrake = 0;
        d.mode = this.heat > 0 ? 'pursuit' : 'patrol';
        d.queue.length = 0;
      }
      return;
    }
    v.forward(_fw); v.right(_rt);
    const pos = v.pos;
    const speed = v.speed;
    const police = d.role === 'police';
    const chasing = police && d.mode === 'pursuit' && this.heat > 0;

    // path maintenance
    if (chasing) {
      d.replanT -= dt;
      if (d.replanT <= 0 || d.queue.length < 3) { this.planChase(d, player); d.replanT = 1.4; }
    } else {
      if (!d.queue.length) this.joinNearestRoad(d);
      let rem = 0;
      for (let i = 1; i < d.queue.length && rem < 90; i++) rem += Math.abs(d.queue[i].x - d.queue[i - 1].x) + Math.abs(d.queue[i].z - d.queue[i - 1].z);
      if (rem < 90 && d.lastNode >= 0 && d.mode !== 'respond' && d.mode !== 'race') this.extendRandom(d);
    }
    const q = d.queue;
    // drop passed points
    while (q.length > 1) {
      const p = q[0];
      const dx = p.x - pos.x, dz = p.z - pos.z;
      const along = dx * _fw.x + dz * _fw.z;
      const dd = Math.hypot(dx, dz);
      if (dd < 3.5 || (along < 0 && dd < 14)) q.shift();
      else break;
    }

    // turn signal: a bend of more than ~30 degrees in the next 40 m of the route
    v.indicate = 0;
    if (!chasing) {
      let ac = 0, qx = pos.x, qz = pos.z;
      for (let i = 0; i < q.length && ac < 40; i++) {
        ac += Math.hypot(q[i].x - qx, q[i].z - qz); qx = q[i].x; qz = q[i].z;
        const side = q[i].tx * _rt.x + q[i].tz * _rt.z, fwdc = q[i].tx * _fw.x + q[i].tz * _fw.z;
        if (Math.abs(side) > 0.5 && fwdc < 0.87) { v.indicate = side > 0 ? 1 : -1; break; }
      }
    }

    // target point (pure pursuit)
    const ld = police ? 5 + Math.abs(speed) * 0.5 : 3.5 + Math.abs(speed) * 0.42;
    let tx = pos.x + _fw.x * ld, tz = pos.z + _fw.z * ld;
    let acc = 0, px = pos.x, pz = pos.z;
    for (let i = 0; i < q.length; i++) {
      const seg = Math.hypot(q[i].x - px, q[i].z - pz);
      if (acc + seg >= ld) {
        const t = (ld - acc) / Math.max(seg, 1e-3);
        tx = px + (q[i].x - px) * t; tz = pz + (q[i].z - pz) * t;
        break;
      }
      acc += seg; px = q[i].x; pz = q[i].z;
      if (i === q.length - 1) { tx = q[i].x; tz = q[i].z; }
    }
    // desired speed from the path
    const decel = police ? 8 : 3.8;
    let vDes = police ? (chasing ? 62 : 19) : 99;
    acc = 0; px = pos.x; pz = pos.z;
    for (let i = 0; i < q.length && acc < 160; i++) {
      acc += Math.hypot(q[i].x - px, q[i].z - pz); px = q[i].x; pz = q[i].z;
      let pv = q[i].v * (police ? (chasing ? 1.9 : 1.1) : d.aggression);
      if (!police || !chasing) {
        // traffic lights
        if (q[i].stop >= 0) {
          const nd = this.world.nodes[q[i].stop];
          if (nd.light) {
            const s = this.world.lightState(nd, q[i].axis, this.time);
            if (d.mode === 'race' || d.mode === 'flee') pv = Math.min(pv, 14); // racing or fleeing: lights mean nothing
            else if (d.sirenOn && (d.role !== 'police' || d.mode === 'respond')) pv = Math.min(pv, 6); // under lights and siren: through the red, carefully
            else if (s === 'R' || (s === 'Y' && acc > 12)) pv = 0;
          }
          // don't block the box: never drive into a junction without room to get out the other side
          if (pv > 0 && acc < 45 && !d.sirenOn && d.mode !== 'race' && d.mode !== 'flee' && this.boxBlocked(d, q, i, allCars)) pv = 0;
        }
      }
      const allowed = Math.sqrt(pv * pv + 2 * decel * Math.max(0, acc - (pv === 0 ? 2 : 0)));
      if (pv === 0) vDes = Math.min(vDes, Math.sqrt(2 * decel * Math.max(0, acc - 2.5)));
      else vDes = Math.min(vDes, allowed);
      if (pv === 0) break;
    }

    // direct chase
    if (chasing) {
      const dist = pos.distanceTo(player.pos);
      const los = dist < 85 && this.world.lineOfSight(pos.x, pos.y + 1, pos.z, player.pos.x, player.pos.y + 1, player.pos.z);
      if (los || dist < 22) {
        const tpred = Math.min(1.1, dist / Math.max(12, Math.abs(speed)));
        tx = player.pos.x + player.vel.x * tpred;
        tz = player.pos.z + player.vel.z * tpred;
        const ps = player.vel.length();
        vDes = Math.max(vDes, dist < 18 ? ps + 6 : 60);
        if (dist < 30) vDes = Math.max(ps + 4, 12);
      }
    }

    // civilians: look along their own path (not just straight ahead) for anything in the way,
    // including cars about to cross it, and yield at junctions that are occupied
    if ((!police || !chasing) && !this.legacyAI) {
      const look = 18 + Math.max(0, speed) * 2.2;
      const path = [pos.x, pos.z];
      let L = 0, lx = pos.x, lz = pos.z;
      for (let i = 0; i < q.length && L < look; i++) { L += Math.hypot(q[i].x - lx, q[i].z - lz); lx = q[i].x; lz = q[i].z; path.push(lx, lz); }
      const myW = v.hx + 0.6;
      let blockS = 1e9, blockV = 0, blockO = null;
      for (const o of allCars) {
        if (o === v || o.sleeping) continue;
        const ox = o.pos.x - pos.x, oz = o.pos.z - pos.z;
        if (ox * ox + oz * oz > (look + 12) ** 2) continue;
        if (ox * _fw.x + oz * _fw.z < -2) continue; // behind us
        const ovx = o.vel.x, ovz = o.vel.z;
        const same = ovx * _fw.x + ovz * _fw.z > 0.6 * Math.hypot(ovx, ovz); // travelling our way
        for (const tp of same ? [0] : [0, 0.8, 1.6]) {
          const cx = o.pos.x + ovx * tp, cz = o.pos.z + ovz * tp;
          let s = 0;
          for (let k = 0; k + 3 < path.length; k += 2) {
            const ax = path[k], az = path[k + 1], bx = path[k + 2], bz = path[k + 3];
            const sx = bx - ax, sz = bz - az, l2 = sx * sx + sz * sz || 1;
            const t = Math.max(0, Math.min(1, ((cx - ax) * sx + (cz - az) * sz) / l2));
            const dd = Math.hypot(ax + sx * t - cx, az + sz * t - cz);
            const along = s + t * Math.sqrt(l2);
            // a crossing car only matters if we'd get there at about the same time
            const eta = along / Math.max(3, speed);
            if (dd < myW + o.hx && (same || Math.abs(eta - tp) < 1.3 || tp === 0)) {
              const gapS = along - v.hz - o.hz;
              if (gapS < blockS) { blockS = gapS; blockV = same ? Math.max(0, ovx * _fw.x + ovz * _fw.z) : 0; blockO = o; }
              break;
            }
            s += Math.sqrt(l2);
          }
        }
      }
      if (blockS < 1e9) {
        const headway = 2 + Math.max(0, speed) * 0.9;
        vDes = Math.min(vDes, Math.max(0, blockV + (blockS - headway) * 0.5), Math.sqrt(2 * 4.5 * Math.max(0, blockS - 1.5)));
        if (blockS < 4 && player && Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z) < 14) d.horn = 0.4;
      }
      // you just cut in front of them: sometimes they lean on the horn
      this.cutIn(d, blockO === player && blockS < 10 && speed > 3.5 && blockV < speed - 2);
      // junction etiquette: wait at the line if someone is already in the junction, or arriving first from the side
      let jWaiting = false;
      acc = 0; px = pos.x; pz = pos.z;
      for (let i = 0; i < q.length && acc < 30; i++) {
        acc += Math.hypot(q[i].x - px, q[i].z - pz); px = q[i].x; pz = q[i].z;
        if (q[i].stop < 0) continue;
        const nd = this.world.nodes[q[i].stop];
        if (nd.edges.length < 3) break;
        const r = nd.city ? Math.max(nd.hx, nd.hz) + 1.5 : 9;
        const myD = Math.hypot(pos.x - nd.x, pos.z - nd.z);
        if (myD < r + 1) break; // already in it: clear it
        for (const o of allCars) {
          if (o === v || o.sleeping) continue;
          const od = Math.hypot(o.pos.x - nd.x, o.pos.z - nd.z);
          if (od > 22) continue;
          const osp = o.vel.length();
          const parallel = osp > 1 && Math.abs((o.vel.x * _fw.x + o.vel.z * _fw.z) / osp) > 0.8;
          if (parallel) continue;
          const inside = od < r;
          const arrivingFirst = !nd.light && osp > 2 && od < myD - 3 && (o.vel.x * (nd.x - o.pos.x) + o.vel.z * (nd.z - o.pos.z)) > 0;
          // (after waiting a while, go anyway: two polite drivers must not wait for each other forever)
          if ((inside || arrivingFirst) && (d.jWait || 0) < 5) { vDes = Math.min(vDes, Math.sqrt(2 * 4 * Math.max(0, acc - 2.5))); jWaiting = true; break; }
        }
        break;
      }
      d.jWait = jWaiting && speed < 1 ? (d.jWait || 0) + dt : 0;
    }

    // closing in on a moving target (the loose tyrannosaur): drive straight at it once near
    if (d.chaseTarget) {
      const ct = d.chaseTarget, cd = Math.hypot(ct.x - pos.x, ct.z - pos.z);
      if (cd < 110) { tx = ct.x; tz = ct.z; vDes = Math.max(Math.min(vDes, 16), cd < 20 ? 6 : 14); }
    }
    // a dinosaur in sight: turn round and get away (honking, hazards on), then calm down after a while
    if (d.role === 'civ' && this.monsters && this.monsters.length) {
      if (d.mode === 'flee') { d.fleeT -= dt; if (d.fleeT <= 0) { d.mode = 'cruise'; d.aggression = 1; v.hazards = false; } }
      else for (const m of this.monsters) {
        const dx = m.x - pos.x, dz = m.z - pos.z, dd = Math.hypot(dx, dz), ahead = (dx * _fw.x + dz * _fw.z) / (dd || 1);
        if (dd < (this.panic ? 60 : 25) || (dd < (this.panic ? 150 : 80) && ahead > 0.1)) { this.flee(d, m); break; } // (in a city-wide panic, anyone near gets out)
      }
    }
    // pull over for an emergency vehicle coming up behind with its siren on
    if (d.role === 'civ') for (const e of this.emergencies || []) {
      const ev = e.v;
      if (ev === v) continue;
      const dx = ev.pos.x - pos.x, dz = ev.pos.z - pos.z, fwd = dx * _fw.x + dz * _fw.z, lat = dx * _rt.x + dz * _rt.z;
      if (fwd < -50 || fwd > 2 || Math.abs(lat) > 5) continue;
      ev.forward(_v1);
      if (_v1.x * _fw.x + _v1.z * _fw.z < 0.6) continue;
      vDes = Math.min(vDes, 3.5);
      tx += _rt.x * 1.8; tz += _rt.z * 1.8;
      v.indicate = 1;
      break;
    }

    // obstacle avoidance / following
    let nearestAhead = 1e9, aheadSpeed = 0, aheadLat = 0, aheadLen = 2.5;
    for (const o of allCars) {
      if (o === v || o.sleeping) continue;
      const dx = o.pos.x - pos.x, dz = o.pos.z - pos.z;
      if (Math.abs(dx) > 40 || Math.abs(dz) > 40) continue;
      const fwd = dx * _fw.x + dz * _fw.z;
      const lat = dx * _rt.x + dz * _rt.z;
      if (fwd < 0 || fwd > 38 + v.hz) continue;
      if (Math.abs(lat) > 2.6) continue;
      if (chasing && o === player) continue;
      if (fwd < nearestAhead) { nearestAhead = fwd; aheadSpeed = o.vel.dot(_fw); aheadLat = lat; aheadLen = o.hz; }
    }
    if (nearestAhead < 1e9) {
      const gap = nearestAhead - v.hz - aheadLen - 0.5;
      if (chasing) {
        // swerve around traffic
        const side = aheadLat > 0 ? -1 : 1;
        tx += _rt.x * side * 3.5; tz += _rt.z * side * 3.5;
      } else if ((d.mode === 'race' || d.mode === 'flee') && gap < 22) {
        // racing: dart round whoever is in the way
        const side = aheadLat > 0 ? -1 : 1;
        tx += _rt.x * side * 3.4; tz += _rt.z * side * 3.4;
      } else if (d.sirenOn && (d.role !== 'police' || d.mode === 'respond') && gap < 18 && aheadSpeed < 4) {
        // under lights: pull out and pass the stopped traffic on the left, steadily
        tx -= _rt.x * 3.6; tz -= _rt.z * 3.6;
        vDes = Math.min(vDes, 8);
      } else {
        const follow = Math.max(0, aheadSpeed) + gap * 0.45;
        vDes = Math.min(vDes, Math.max(0, follow), Math.sqrt(2 * 5 * Math.max(0, gap - 1)));
        if (gap < 4 && player && Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z) < 12) d.horn = 0.4;
      }
    }

    // steering: pure pursuit
    const dx = tx - pos.x, dz = tz - pos.z;
    const fwdD = dx * _fw.x + dz * _fw.z, latD = dx * _rt.x + dz * _rt.z;
    const alpha = Math.atan2(latD, Math.max(0.1, fwdD));
    const Ld = Math.max(3, Math.hypot(dx, dz));
    let delta = Math.atan((2 * v.wheelbase * Math.sin(alpha)) / Ld);
    if (fwdD < 0) delta = Math.sign(latD) * 0.6;
    const lim = Math.min(v.spec.maxSteer, Math.atan((v.wheelbase * 8.5) / Math.max(speed * speed, 1)) + v.spec.alphaPeak * 0.9);
    inp.steer = Math.max(-1, Math.min(1, delta / lim));
    // slow down for sharp steering
    if (Math.abs(alpha) > 0.6 && !chasing) vDes = Math.min(vDes, 7);

    // longitudinal control
    const err = vDes - speed;
    inp.throttle = Math.max(0, Math.min(1, err * (police ? 0.5 : 0.3)));
    inp.brake = Math.max(0, Math.min(1, -err * 0.25));
    if (vDes < 0.6 && speed < 1.5) { inp.brake = 1; inp.throttle = 0; }
    inp.handbrake = 0;
    if (chasing && Math.abs(alpha) > 1.0 && speed > 14) inp.handbrake = 0.6;

    // stuck handling
    if (d.reverseT > 0) {
      d.reverseT -= dt;
      inp.throttle = 0; inp.brake = 0.8; inp.steer = -Math.sign(latD || 1);
      v.gear = -1;
      if (d.reverseT <= 0) v.gear = 1;
    } else if (vDes > 3 && Math.abs(speed) < 0.8) {
      // queued behind another car? then just wait - backing up would start a reverse wave down the queue
      const queued = nearestAhead < 10 + v.hz;
      let roomBehind = true;
      for (const o of allCars) {
        if (o === v || o.sleeping) continue;
        const dx = o.pos.x - pos.x, dz = o.pos.z - pos.z;
        if (dx * dx + dz * dz < 81 && dx * _fw.x + dz * _fw.z < 0) { roomBehind = false; break; }
      }
      if (queued && !chasing) d.stuckT = 0;
      else d.stuckT += dt;
      if (d.stuckT > (police ? 1.2 : 4.0)) {
        d.stuckT = 0;
        if (roomBehind || police) { d.reverseT = police ? 1.0 : 1.2; d.stuckCount = (d.stuckCount || 0) + 1; }
      }
    } else d.stuckT = Math.max(0, d.stuckT - dt);
    // long waits (gridlock) are tracked so the traffic manager can quietly clear them away from the player
    d.waitT = Math.abs(speed) < 0.5 && !police ? (d.waitT || 0) + dt : 0;
    if (d.horn > 0) d.horn -= dt;
  }

  // is the way through this junction (from the stop point q[i], across it and a car length beyond) held up by a
  // slow or stopped car?
  boxBlocked(d, q, i, allCars) {
    const v = d.v, nd = this.world.nodes[q[i].stop];
    const need = 2 * Math.max(nd.hx || 8, nd.hz || 8) + 2 * v.hz + 3;
    // only the slow cars around this junction matter
    const near = [], R2 = (need + 6) ** 2;
    for (const o of allCars) {
      if (o === v || o.sleeping || Math.abs(o.speed) >= 2.5) continue;
      const dx = o.pos.x - q[i].x, dz = o.pos.z - q[i].z;
      if (dx * dx + dz * dz < R2) near.push(o);
    }
    if (!near.length) return false;
    let dist = 0;
    for (let k = i + 1; k < q.length && dist < need; k++) {
      dist += Math.hypot(q[k].x - q[k - 1].x, q[k].z - q[k - 1].z);
      for (const o of near) {
        if (o === v || o.sleeping) continue;
        const dx = o.pos.x - q[k].x, dz = o.pos.z - q[k].z;
        if (dx * dx + dz * dz < 3.2 * 3.2 + o.hz * o.hz * 0.25 && Math.abs(o.speed) < 2.5) return true;
      }
    }
    return false;
  }

  joinNearestRoad(d) {
    const v = d.v;
    const sp = this.world.roadSpawnNear(v.pos.x, v.pos.z, 0, 300);
    if (!sp) return;
    const e = sp.edge;
    v.forward(_fw);
    const a = e.pts[Math.max(0, sp.idx - 1)], b = e.pts[Math.min(e.pts.length - 1, sp.idx + 1)];
    const dir = (b.x - a.x) * _fw.x + (b.z - a.z) * _fw.z >= 0 ? 0 : 1;
    const ln = this.lane(e, dir, d.role === 'police' && d.mode === 'pursuit');
    let bi = 0, bd = 1e18;
    ln.pts.forEach((p, i) => { const dd = (p.x - v.pos.x) ** 2 + (p.z - v.pos.z) ** 2; if (dd < bd) { bd = dd; bi = i; } });
    this.appendLane(d, { ...ln, pts: ln.pts.slice(Math.min(bi + 1, ln.pts.length - 1)) });
  }

  // police route planning (Dijkstra on the road graph)
  planChase(d, player) {
    const w = this.world;
    const v = d.v;
    // start node: nearest node ahead on current queue, or nearest node overall
    let start = -1;
    for (const p of d.queue) if (p.stop >= 0) { start = p.stop; break; }
    if (start < 0) start = this.nearestNode(v.pos.x, v.pos.z);
    const goal = this.nearestNode(this.heat > 0 && this.evadeT > 0.5 ? this.lastSeen.x : player.pos.x, this.heat > 0 && this.evadeT > 0.5 ? this.lastSeen.z : player.pos.z);
    // keep queue up to the start node
    const keep = [];
    for (const p of d.queue) { keep.push(p); if (p.stop === start) break; }
    if (!keep.length || keep[keep.length - 1].stop !== start) {
      // jump straight toward the start node
      keep.length = 0;
      const n = w.nodes[start];
      keep.push({ x: n.x, z: n.z, y: n.y, v: 20, stop: start, axis: -1, tx: n.x - v.pos.x, tz: n.z - v.pos.z });
    }
    d.queue = keep;
    d.lastNode = start;
    const path = this.dijkstra(start, goal);
    for (let i = 0; i < path.length; i++) {
      const e = w.edges[path[i].edge];
      this.appendLane(d, this.lane(e, path[i].dir, true));
    }
    // final approach to the player
    const pp = player.pos;
    d.queue.push({ x: pp.x, z: pp.z, y: pp.y, v: 30, stop: -1, axis: -1, tx: 0, tz: 1 });
  }

  nearestNode(x, z) {
    let best = 0, bd = 1e18;
    for (const n of this.world.nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = n.id; }
    }
    return best;
  }

  dijkstra(a, b) {
    const w = this.world;
    if (a === b) return [];
    const N = w.nodes.length;
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const prevE = new Int32Array(N).fill(-1);
    const done = new Uint8Array(N);
    dist[a] = 0;
    for (;;) {
      let u = -1, bd = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
      if (u < 0 || u === b) break;
      done[u] = 1;
      for (const eid of w.nodes[u].edges) {
        const e = w.edges[eid];
        const o = e.a === u ? e.b : e.a;
        const nd = dist[u] + e.len;
        if (nd < dist[o]) { dist[o] = nd; prev[o] = u; prevE[o] = eid; }
      }
    }
    const out = [];
    let c = b;
    while (c !== a && prev[c] >= 0) {
      const e = w.edges[prevE[c]];
      out.push({ edge: e.id, dir: e.a === prev[c] ? 0 : 1 });
      c = prev[c];
    }
    out.reverse();
    return out.slice(0, 6);
  }
}
