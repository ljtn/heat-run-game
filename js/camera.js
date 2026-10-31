// Chase / hood / cinematic cameras
import * as THREE from 'three';

const _f = new THREE.Vector3(), _v = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3();
const tmp = [];

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export const CAM_MODES = ['CHASE', 'FAR CHASE', 'BUMPER', 'CINEMATIC'];

export class CameraRig {
  constructor(camera, world) {
    this.cam = camera;
    this.world = world;
    this.mode = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.shake = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.cine = new THREE.Vector3();
    this.cineT = 0;
    this.first = true;
    this.distSm = 6.5;
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this.orbitT = 0;
  }

  addShake(a) { this.shake = Math.min(1.2, this.shake + a); }

  cycle() { this.mode = (this.mode + 1) % CAM_MODES.length; this.first = true; this.cineT = 0; }

  // pull camera in front of tall boxes between a and b
  clip(ax, az, bx, bz, ay = 0) {
    const w = this.world;
    w.queryColliders(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), tmp);
    let tmin = 1;
    for (const c of tmp) {
      if (!c.tall) continue;
      if (c.bottom !== undefined && ay < c.bottom) continue; // we're under its upper floors (drive-through shop)
      const lax = (ax - c.x) * c.c + (az - c.z) * c.s, laz = -(ax - c.x) * c.s + (az - c.z) * c.c;
      const lbx = (bx - c.x) * c.c + (bz - c.z) * c.s, lbz = -(bx - c.x) * c.s + (bz - c.z) * c.c;
      const dx = lbx - lax, dz = lbz - laz;
      let t0 = 0, t1 = 1, ok = true;
      const hx = c.hx + 0.4, hz = c.hz + 0.4;
      for (const [p, d, h] of [[lax, dx, hx], [laz, dz, hz]]) {
        if (Math.abs(d) < 1e-9) { if (p < -h || p > h) { ok = false; break; } continue; }
        let ta = (-h - p) / d, tb = (h - p) / d;
        if (ta > tb) { const q = ta; ta = tb; tb = q; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 < tmin) tmin = t0;
    }
    return tmin;
  }

  update(dt, car, lookBack, mouse) {
    const cam = this.cam;
    car.forward(_f);
    const speed = car.vel.length();
    const carYaw = Math.atan2(-_f.x, -_f.z);
    const velYaw = Math.atan2(-car.vel.x, -car.vel.z);
    if (mouse && (mouse.dx || mouse.dy)) {
      this.orbitYaw -= mouse.dx * 0.005;
      this.orbitPitch = Math.max(-0.3, Math.min(0.9, this.orbitPitch + mouse.dy * 0.004));
      this.orbitT = 2.0;
      mouse.dx = mouse.dy = 0;
    }
    this.orbitT -= dt;
    if (this.orbitT < 0) {
      this.orbitYaw *= Math.exp(-dt * 3);
      this.orbitPitch *= Math.exp(-dt * 3);
    }

    if (this.mode === 0 || this.mode === 1) {
      // blend toward the velocity direction when sliding so you see where you're going
      let target = carYaw;
      if (speed > 6 && car.speed > 0) {
        const slide = Math.min(1, (speed - 6) / 10);
        target = lerpAngle(carYaw, velYaw, 0.45 * slide);
      }
      if (lookBack) target += Math.PI;
      target += this.orbitYaw;
      if (this.first) this.yaw = target;
      this.yaw = lerpAngle(this.yaw, target, 1 - Math.exp(-dt * (lookBack ? 30 : 4.2)));
      const far = this.mode === 1;
      const baseD = far ? 9.5 : 6.4, baseH = far ? 3.4 : 2.15;
      const dist = baseD + Math.min(speed, 50) * 0.035;
      this.distSm += (dist - this.distSm) * Math.min(1, dt * 3);
      const pitch = this.orbitPitch;
      const ch = Math.cos(pitch);
      _t.copy(car.pos).add(_v.set(0, 1.15, 0));
      let cx = _t.x + Math.sin(this.yaw) * this.distSm * ch;
      let cz = _t.z + Math.cos(this.yaw) * this.distSm * ch;
      let cy = _t.y + baseH - 1.15 + Math.sin(pitch) * this.distSm;
      // under a ceiling (garage deck, footbridge, shop): drop the camera below it, keeping the same distance
      const ceil = Math.min(this.world.ceilingAt(car.pos.x, car.pos.z, car.pos.y + 0.6), this.world.ceilingAt(cx, cz, car.pos.y + 0.6));
      if (ceil < cy + 0.4) {
        const D = Math.hypot(this.distSm * ch, cy - _t.y);
        const v1 = Math.max(0.15, ceil - 0.45 - _t.y);
        const h1 = Math.sqrt(Math.max(1, D * D - v1 * v1));
        cx = _t.x + Math.sin(this.yaw) * h1; cz = _t.z + Math.cos(this.yaw) * h1;
        cy = _t.y + v1;
        const ceil2 = this.world.ceilingAt(cx, cz, car.pos.y + 0.6);
        if (ceil2 < cy + 0.3) cy = Math.max(_t.y + 0.1, ceil2 - 0.4);
      }
      const tc = this.clip(_t.x, _t.z, cx, cz, car.pos.y);
      if (tc < 1) { cx = _t.x + (cx - _t.x) * tc * 0.92; cz = _t.z + (cz - _t.z) * tc * 0.92; }
      const g = this.world.groundAt(cx, cz, cy + 0.3).h;
      cy = Math.max(cy, g + 0.7);
      _d.set(cx, cy, cz);
      if (this.first) this.pos.copy(_d);
      this.pos.lerp(_d, 1 - Math.exp(-dt * 14));
      this.look.copy(car.pos).addScaledVector(_f, lookBack ? -2 : 2.5);
      this.look.y += 0.9;
      cam.position.copy(this.pos);
      cam.lookAt(this.look);
      cam.fov += ((62 + Math.min(speed, 60) * 0.26) - cam.fov) * Math.min(1, dt * 2);
    } else if (this.mode === 2) {
      _v.set(0, car.topY - 0.25, -0.25).applyQuaternion(car.quat).add(car.pos);
      cam.position.copy(_v);
      if (lookBack) {
        _t.copy(car.pos).addScaledVector(_f, 20);
        _t.set(2 * cam.position.x - _t.x, cam.position.y, 2 * cam.position.z - _t.z);
        cam.up.set(0, 1, 0);
        cam.lookAt(_t);
      } else {
        cam.quaternion.copy(car.quat);
        // look slightly into the turn
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), car.steerAngle * 0.25 + this.orbitYaw);
        cam.quaternion.multiply(q);
      }
      cam.fov += (72 + Math.min(speed, 60) * 0.2 - cam.fov) * Math.min(1, dt * 2);
    } else {
      // cinematic roadside cameras
      this.cineT -= dt;
      const dist = this.cine.distanceTo(car.pos);
      _v.copy(car.pos).sub(this.cine);
      const behind = _v.dot(car.vel) > 0 && dist > 25;
      if (this.first || this.cineT <= 0 || dist > 75 || behind) {
        const dir = speed > 3 ? _d.copy(car.vel).normalize() : _d.copy(_f);
        const side = Math.random() < 0.5 ? -1 : 1;
        const ahead = 35 + Math.random() * 25 + speed * 0.8;
        const lat = 6 + Math.random() * 8;
        const cx = car.pos.x + dir.x * ahead - dir.z * lat * side;
        const cz = car.pos.z + dir.z * ahead + dir.x * lat * side;
        const h = this.world.groundAt(cx, cz, 1e9).h;
        this.cine.set(cx, h + 1.2 + Math.random() * 4, cz);
        this.cineT = 6 + Math.random() * 3;
        this.first = false;
      }
      cam.position.copy(this.cine);
      this.look.lerp(_t.copy(car.pos).add(_v.set(0, 0.6, 0)), this.first ? 1 : 1 - Math.exp(-dt * 12));
      cam.lookAt(this.look);
      const fovT = THREE.MathUtils.clamp(2 * Math.atan(9 / Math.max(dist, 1)) * 57.3, 18, 60);
      cam.fov += (fovT - cam.fov) * Math.min(1, dt * 3);
    }
    this.first = false;
    // shake
    if (this.shake > 0.001) {
      const s = this.shake * 0.12;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
      this.shake *= Math.exp(-dt * 5);
    }
    cam.updateProjectionMatrix();
  }
}
