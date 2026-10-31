// Fires: now and then a building or house within a few hundred metres catches fire. Flames lick up the wall, a
// dark smoke column rises over the rooftops, and a fire engine is sent across town under lights and siren (an
// ambulance often follows). It parks out front and hoses the fire down to steam, then both rejoin traffic.
// Separately, the odd ambulance races past on a call of its own.
import * as THREE from 'three';
import { radialTexture } from './textures.js';

const FLAMES = 40, SMOKE = 44, DROPS = 46;

// a tongue of flame: hot white-yellow core low down, tapering into a ragged orange tip
function flameTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 96, 2, 32, 84, 60);
  g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.25, 'rgba(255,200,80,0.95)'); g.addColorStop(0.6, 'rgba(255,110,20,0.6)'); g.addColorStop(1, 'rgba(200,40,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(32, 4);
  ctx.bezierCurveTo(46, 40, 60, 70, 54, 100); ctx.bezierCurveTo(50, 122, 14, 122, 10, 100); ctx.bezierCurveTo(4, 70, 18, 40, 32, 4);
  ctx.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class FireSystem {
  constructor(world, scene, game) {
    this.world = world; this.scene = scene; this.game = game;
    this.fire = null;
    this.nextFire = 50 + Math.random() * 40; // the first one soon, so it gets seen
    this.nextRun = 70 + Math.random() * 60;
    const flameTex = flameTexture();
    const smokeTex = radialTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)', 64, 0.1);
    const mk = (n, tex, blending, color) => Array.from({ length: n }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending }));
      s.visible = false; scene.add(s);
      return s;
    });
    this.flames = mk(FLAMES, flameTex, THREE.AdditiveBlending, 0xffa040);
    this.smoke = mk(SMOKE, smokeTex, THREE.NormalBlending, 0x2a2622);
    this.drops = mk(DROPS, smokeTex, THREE.NormalBlending, 0xd8ecff);
    this.light = new THREE.PointLight(0xff7a20, 0, 34, 1.6);
    scene.add(this.light);
    this.scorch = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x0a0806, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetUnits: -6 }));
    this.scorch.visible = false; scene.add(this.scorch);
    this.flames.forEach((f, i) => (f.userData.t = i / FLAMES));
    this.smoke.forEach((f, i) => (f.userData.t = i / SMOKE));
    this.drops.forEach((f, i) => (f.userData.t = i / DROPS));
    this.v = new THREE.Vector3();
  }

  // somewhere to burn: an ordinary building or a house, a fair way off, with a street in front for the engine
  pickTarget(player) {
    const w = this.world, R = Math.random;
    for (let tries = 0; tries < 60; tries++) {
      const useHouse = !w.inCityRect(player.pos.x, player.pos.z, 200) || R() < 0.25;
      let base, nx, nz, width, y;
      if (useHouse && w.houses.length) {
        const h = w.houses[Math.floor(R() * w.houses.length)];
        base = { x: h.x, z: h.z }; y = h.y; width = Math.min(h.w, 7);
      } else {
        const b = w.buildings[Math.floor(R() * w.buildings.length)];
        if (!b || b.driveThru || b.h < 6 || b.h > 45) continue;
        base = { x: b.x, z: b.z, b }; y = b.y; width = 6;
      }
      const d = Math.hypot(base.x - player.pos.x, base.z - player.pos.z);
      if (d < 150 || d > 430) continue;
      // the street in front: the nearest open road point on a ring round it
      let road = null;
      for (let r = 6; r <= 34 && !road; r += 2) for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2, x = base.x + Math.cos(a) * r, z = base.z + Math.sin(a) * r;
        const nr = w.nearestRoad(x, z);
        if (nr.edge && nr.d < -1.5 && !nr.edge.elev && !nr.edge.fwy && w.bridgeAt(x, z, 1e9) === null) { road = { x, z }; break; }
      }
      if (!road) continue;
      // the burning wall faces the street
      let fx, fz;
      if (base.b) { const b = base.b; fx = Math.max(b.x - b.hx, Math.min(b.x + b.hx, road.x)); fz = Math.max(b.z - b.hz, Math.min(b.z + b.hz, road.z)); }
      else { const L = Math.hypot(road.x - base.x, road.z - base.z); fx = base.x + (road.x - base.x) / L * 4; fz = base.z + (road.z - base.z) / L * 4; }
      const L = Math.hypot(road.x - fx, road.z - fz) || 1;
      nx = (road.x - fx) / L; nz = (road.z - fz) / L;
      return { x: fx, z: fz, y, nx, nz, width, road };
    }
    return null;
  }

  start(player) {
    const t = this.pickTarget(player);
    if (!t) return;
    const T = this.game.traffic;
    this.fire = { ...t, strength: 1, age: 0, out: false, outT: 0, truck: null, amb: null };
    this.fire.truck = T.spawnEmergency('firetruck', player, this.game.camera, t.road);
    if (Math.random() < 0.55) {
      // the ambulance parks a little further along the street
      const ax = t.road.x + t.nz * 12, az = t.road.z - t.nx * 12;
      this.fire.amb = T.spawnEmergency('ambulance', player, this.game.camera, { x: ax, z: az });
    }
    this.game.hud.message('FIRE REPORTED · ' + this.game.hud.locationName({ x: t.x, z: t.z }), 3.5, 'crime');
    // the scorch mark on the wall behind the flames
    this.scorch.position.set(t.x + t.nx * 0.05, t.y + 2.4, t.z + t.nz * 0.05);
    this.scorch.rotation.set(0, Math.atan2(t.nx, t.nz), 0);
    this.scorch.scale.set(t.width * 1.1, 4.5, 1);
    this.scorch.visible = true;
  }

  end() {
    const F = this.fire, T = this.game.traffic;
    for (const d of [F.truck, F.amb]) if (d && T.drivers.includes(d)) T.standDown(d);
    for (const s of [...this.flames, ...this.smoke, ...this.drops]) s.visible = false;
    this.light.intensity = 0;
    this.scorch.visible = false;
    this.fire = null;
  }

  update(dt, player, time, playing) {
    const T = this.game.traffic;
    if (playing) {
      // the odd ambulance on a call, siren going, standing down after a while
      this.nextRun -= dt;
      if (this.nextRun <= 0) {
        this.nextRun = 80 + Math.random() * 90;
        const d = T.spawnEmergency('ambulance', player, this.game.camera);
        if (d) d.runT = 35 + Math.random() * 20;
      }
      for (const d of T.drivers) if (d.runT !== undefined && d.mode !== 'respond' && d.mode !== 'onscene') { d.runT -= dt; if (d.runT <= 0) { T.standDown(d); d.runT = undefined; } }
      if (!this.fire) { this.nextFire -= dt; if (this.nextFire <= 0) { this.nextFire = 120 + Math.random() * 120; this.start(player); } }
    }
    const F = this.fire;
    if (!F) return;
    F.age += dt;
    // the crews arrive: park once close to the spot
    let spraying = false;
    for (const d of [F.truck, F.amb]) {
      if (!d || !T.drivers.includes(d)) continue;
      if (d.mode === 'respond' && d.dest && Math.hypot(d.v.pos.x - d.dest.x, d.v.pos.z - d.dest.z) < 14 && Math.abs(d.v.speed) < 3) d.mode = 'onscene';
      if (d === F.truck && d.mode === 'onscene' && !F.out) spraying = true;
    }
    if (spraying) F.strength -= dt / 24;
    else if (F.age > 170) F.strength -= dt / 40; // nobody came: it burns itself out
    if (!F.out && F.strength <= 0) { F.out = true; F.strength = 0; this.game.hud.message('FIRE OUT', 2.5, 'good'); }
    if (F.out) F.outT += dt;
    if ((F.out && F.outT > 22) || Math.hypot(F.x - player.pos.x, F.z - player.pos.z) > 900) { this.end(); return; }

    const st = Math.max(0, F.strength), tx = -F.nz, tz = F.nx; // along the wall
    // flames: tongues rising up the face of the wall, flickering
    this.flames.forEach((s, i) => {
      const u = s.userData;
      u.t += dt * (0.9 + (i % 5) * 0.12);
      if (u.t > 1) { u.t -= 1; u.o = (Math.random() - 0.5) * F.width; u.h = 0.6 + Math.random() * 0.8; }
      const k = u.t, o = u.o || 0, life = Math.sin(Math.PI * k);
      s.visible = st > 0.02;
      s.position.set(F.x + tx * o + F.nx * (0.6 + k * 0.6), F.y + 0.3 + k * 5.5 * (u.h || 1) * (0.5 + st * 0.5), F.z + tz * o + F.nz * (0.6 + k * 0.6));
      const sc = (1.4 + life * 2.4) * (0.35 + st * 0.65);
      s.scale.set(sc * 0.7, sc * 1.6, 1);
      s.material.opacity = life * Math.min(1, st * 1.4);
      s.material.color.setHSL(0.1 - k * 0.08, 1, 0.62 - k * 0.2);
    });
    // smoke: a thick column, dark while burning, white steam once hosed down
    const dark = F.out ? 0.85 : spraying ? 0.5 : 0.12;
    this.smoke.forEach((s, i) => {
      const u = s.userData;
      u.t += dt * 0.07 * (1 + (i % 3) * 0.2);
      if (u.t > 1) { u.t -= 1; u.ox = (Math.random() - 0.5) * F.width * 0.6; u.oz = Math.random() * 1.5; }
      const k = u.t, drift = k * k * 14;
      s.visible = true;
      s.position.set(F.x + tx * (u.ox || 0) + F.nx * (1 + (u.oz || 0)) + drift * 0.6, F.y + 3 + k * 34, F.z + tz * (u.ox || 0) + F.nz * (1 + (u.oz || 0)) + drift * 0.35);
      const sc = 4 + k * 20;
      s.scale.set(sc, sc, 1);
      const fade = F.out ? Math.max(0, 1 - F.outT / 20) : 1;
      s.material.opacity = Math.sin(Math.PI * Math.min(1, k * 1.3)) * (F.out ? 0.4 : 0.9) * fade * (0.4 + Math.max(st, F.out ? 0.6 : 0) * 0.6);
      s.material.color.setScalar(dark + (i % 4) * 0.03);
    });
    // water: an arc from the monitor on the engine's roof to the fire
    const truck = F.truck && T.drivers.includes(F.truck) ? F.truck.v : null;
    this.drops.forEach((s, i) => {
      if (!spraying || !truck) { s.visible = false; return; }
      const u = s.userData;
      u.t += dt * 1.1; if (u.t > 1) u.t -= 1;
      truck.upv(this.v);
      const ax = truck.pos.x + this.v.x * 3.4, ay = truck.pos.y + 3.4, az = truck.pos.z + this.v.z * 3.4;
      const bx = F.x + F.nx * 0.8 + tx * Math.sin(time * 0.7 + i) * F.width * 0.35, by = F.y + 2.4, bz = F.z + F.nz * 0.8 + tz * Math.sin(time * 0.7 + i) * F.width * 0.35;
      const k = u.t, arc = Math.sin(Math.PI * k) * 4.5;
      s.visible = true;
      s.position.set(ax + (bx - ax) * k, ay + (by - ay) * k + arc, az + (bz - az) * k);
      const sc = 0.35 + k * 1.1;
      s.scale.set(sc, sc, 1);
      s.material.opacity = 0.75 * (1 - k * 0.5);
    });
    // firelight
    this.light.position.set(F.x + F.nx * 2.5, F.y + 2.5, F.z + F.nz * 2.5);
    this.light.intensity = st > 0.02 ? (40 + Math.sin(time * 23) * 10 + Math.sin(time * 37) * 7) * st : 0;
    this.scorch.material.opacity = Math.min(0.75, F.age / 25);
  }
}
