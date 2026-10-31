// Street races: now and then a sports car pulls up beside you, honks, and challenges you to a race to a landmark
// a few blocks away. A countdown, then it goes for it (dodging traffic, running reds). A golden beam marks the
// finish; get there first for a cash prize.
import * as THREE from 'three';

const PRIZE = { sport: 1500, super: 2500 };
const NAME = { sport: 'COUPÉ', super: 'SUPERCAR' };

export class Races {
  constructor(game, scene) {
    this.game = game;
    this.race = null;
    this.cool = 35;
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 60, 16, 1, true).translate(0, 30, 0), beamMat);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(6, 0.35, 8, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd25a }));
    this.beam.visible = this.ring.visible = false;
    scene.add(this.beam, this.ring);
  }

  // the finish: a junction ahead of the player, a few blocks off
  pickFinish(P) {
    const w = this.game.world, f = new THREE.Vector3();
    P.forward(f);
    const c = w.nodes.filter((n) => {
      const dx = n.x - P.pos.x, dz = n.z - P.pos.z, d = Math.hypot(dx, dz);
      return d > 420 && d < 780 && (dx * f.x + dz * f.z) / d > 0.35 && !n.elevFn && n.elevY === undefined;
    });
    return c.length ? c[Math.floor(Math.random() * c.length)] : null;
  }

  update(dt, playing) {
    const g = this.game, T = g.traffic, P = g.player;
    this.cool -= dt;
    const R = this.race;
    if (!R) {
      if (!playing || this.cool > 0 || g.traffic.heat > 0) return;
      // a sports car alongside, heading the same way
      for (const d of T.drivers) {
        if (d.role !== 'civ' || d.ghost || d.raced || (d.mode && d.mode !== 'cruise') || !(d.v.type === 'sport' || d.v.type === 'super')) continue;
        const v = d.v, dist = v.pos.distanceTo(P.pos);
        if (dist > 16) continue;
        const dh = Math.atan2(Math.sin(v.heading - P.heading), Math.cos(v.heading - P.heading));
        if (Math.abs(dh) > 0.5) continue;
        const fin = this.pickFinish(P);
        if (!fin) continue;
        d.raced = true;
        d.honkReq = true;
        const place = g.hud.locationName({ x: fin.x, z: fin.z });
        this.race = { d, fin, place, t: -3.5, said: 4, prize: PRIZE[v.type] };
        g.hud.message(`THE ${NAME[v.type]} WANTS TO RACE!`, 2.4, 'crime');
        g.hud.message(`First to ${place} wins ${g.money(PRIZE[v.type])}`, 3, '', 1.2);
        d.mode = 'onscene'; // holds still for the countdown
        this.beam.position.set(fin.x, fin.y, fin.z); this.ring.position.set(fin.x, fin.y + 0.3, fin.z);
        this.beam.visible = this.ring.visible = true;
        return;
      }
      return;
    }
    R.t += dt;
    const d = R.d, alive = T.drivers.includes(d) && !d.v.wrecked;
    // countdown, then go
    if (R.t < 0) {
      const n = Math.ceil(-R.t);
      if (n < R.said && n <= 3) { R.said = n; g.hud.message(String(n), 0.8, 'crime'); }
      return;
    }
    if (!R.go) {
      R.go = true;
      g.hud.message('GO!', 1, 'good');
      if (alive) { T.routeTo(d, R.fin.x, R.fin.z); d.mode = 'race'; d.aggression = 1.9; d.honkReq = true; }
    }
    this.ring.rotation.y += dt;
    this.beam.material.opacity = 0.28 + 0.1 * Math.sin(R.t * 4);
    const pd = Math.hypot(P.pos.x - R.fin.x, P.pos.z - R.fin.z);
    const ad = alive ? Math.hypot(d.v.pos.x - R.fin.x, d.v.pos.z - R.fin.z) : 1e9;
    if (pd < 16) {
      g.hud.message('YOU WON THE RACE!', 3, 'good');
      g.score.carried += R.prize;
      g.pop(`+${g.money(R.prize)} RACE`, 'gold');
      this.finish();
    } else if (ad < 16) {
      g.hud.message(`BEATEN! The ${NAME[d.v.type].toLowerCase()} got there first`, 3, 'crime');
      this.finish();
    } else if (R.t > 150 || pd > 1400) {
      this.finish();
    }
  }

  finish() {
    const R = this.race, T = this.game.traffic;
    if (R && T.drivers.includes(R.d)) { R.d.mode = 'cruise'; R.d.aggression = 1; R.d.queue.length = 0; R.d.lastNode = -1; }
    this.beam.visible = this.ring.visible = false;
    this.race = null;
    this.cool = 90;
  }
}
