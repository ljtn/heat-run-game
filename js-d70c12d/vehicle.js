// Rigid-body vehicle with raycast spring/damper suspension, combined-slip tyre model,
// wheel spin dynamics, limited-slip diff, automatic gearbox and body/ground contacts.
import * as THREE from 'three';
import { SURF, SURF_GRIP, SURF_ROLL, SURF_BUMP, WATER } from './world.js';
import { buildCar, BODY_STYLES } from './carModel.js';

const G = 9.81;

const base = {
  L0: 0.46, travel: 0.27, rollCenter: 0.32, mu: 1.08, kappaPeak: 0.11, alphaPeak: 0.15,
  idle: 850, redline: 6300, final: 3.3, reverse: 3.1, drive: 'rwd', handbrake: 3800, absSlip: 0.16,
  maxSteer: 0.6, steerRate: 2.6, cd: 0.42, lsd: 160, falloff: 0.1,
};

export const SPECS = {
  muscle: {
    ...base, style: 'muscle', mass: 1520, frontZ: -1.45, rearZ: 1.38, comZ: -0.1, track: 1.69, wheelR: 0.34, wheelW: 0.28,
    kF: 25000, kR: 23000, cBump: 1750, cReb: 2600, arbF: 7000, arbR: 2200,
    torque: 520, peakRpm: 3000, idle: 700, redline: 5000, gears: [2.45, 1.72, 1.3, 1.02, 0.82], final: 3.0, brakeF: 2900, brakeR: 1700, mu: 1.32, cd: 1.05, topFall: 1.0,
  },
  police: {
    ...base, style: 'sedan', mass: 1680, frontZ: -1.42, rearZ: 1.4, comZ: -0.08, track: 1.68, wheelR: 0.34, wheelW: 0.26,
    kF: 28000, kR: 26000, cBump: 2000, cReb: 2900, arbF: 8500, arbR: 3500,
    torque: 545, peakRpm: 3200, idle: 740, redline: 5200, gears: [2.45, 1.72, 1.3, 1.02, 0.82], final: 3.0, brakeF: 3200, brakeR: 1900, mu: 1.32, cd: 1.0, topFall: 1.05,
  },
  sedan: {
    ...base, style: 'sedan', mass: 1450, frontZ: -1.42, rearZ: 1.4, comZ: -0.08, track: 1.66, wheelR: 0.33, wheelW: 0.24,
    kF: 23000, kR: 21000, cBump: 1600, cReb: 2400, arbF: 6000, arbR: 2500,
    torque: 300, peakRpm: 3600, redline: 5800, gears: [2.9, 1.9, 1.35, 1.0, 0.8], brakeF: 2600, brakeR: 1500, mu: 1.0, cd: 1.05, topFall: 1.1,
  },
  taxi: null,
  compact: {
    ...base, style: 'compact', mass: 1050, frontZ: -1.25, rearZ: 1.2, comZ: -0.15, track: 1.46, wheelR: 0.3, wheelW: 0.21,
    kF: 19000, kR: 16000, cBump: 1300, cReb: 1900, arbF: 5000, arbR: 3000,
    torque: 175, peakRpm: 4200, redline: 6500, gears: [3.4, 2.1, 1.45, 1.1, 0.88], final: 3.9, brakeF: 1900, brakeR: 1000, drive: 'fwd', mu: 1.0, cd: 0.8,
  },
  van: {
    ...base, style: 'van', mass: 2150, frontZ: -1.65, rearZ: 1.55, comZ: -0.05, track: 1.68, wheelR: 0.36, wheelW: 0.25,
    kF: 33000, kR: 34000, cBump: 2400, cReb: 3500, arbF: 9000, arbR: 5000, L0: 0.5,
    torque: 400, peakRpm: 3200, redline: 5200, gears: [3.0, 1.9, 1.35, 1.0, 0.78], final: 3.6, brakeF: 3400, brakeR: 2400, mu: 0.95, cd: 1.3,
  },
  pickup: {
    ...base, style: 'pickup', mass: 1950, frontZ: -1.7, rearZ: 1.55, comZ: -0.25, track: 1.7, wheelR: 0.38, wheelW: 0.28,
    kF: 30000, kR: 28000, cBump: 2200, cReb: 3200, arbF: 7000, arbR: 2500, L0: 0.52,
    torque: 450, peakRpm: 3200, redline: 5300, gears: [3.0, 1.9, 1.35, 1.0, 0.78], final: 3.5, brakeF: 3200, brakeR: 2000, mu: 1.0, cd: 1.15,
  },
};
SPECS.taxi = { ...SPECS.sedan, torque: 330 };
SPECS.ambulance = { ...SPECS.van, style: 'ambulance', mass: 3400, frontZ: -2.2, rearZ: 1.75, wheelR: 0.38, wheelW: 0.26, torque: 650, kF: 52000, kR: 62000, cBump: 3800, cReb: 5200, arbF: 15000, arbR: 9000, L0: 0.5, brakeF: 5200, brakeR: 3800 };
// modern cars: lighter, grippier, bigger wheels
SPECS.hatch = { ...SPECS.compact, style: 'hatch', mass: 1150, frontZ: -1.3, rearZ: 1.22, wheelR: 0.31, wheelW: 0.21, torque: 210, mu: 1.08, cd: 0.75 };
SPECS.sedan2 = { ...SPECS.sedan, style: 'sedan2', mass: 1420, frontZ: -1.45, rearZ: 1.35, wheelR: 0.33, wheelW: 0.23, torque: 320, mu: 1.1, cd: 0.8, drive: 'fwd' };
SPECS.suv = { ...SPECS.pickup, style: 'suv', mass: 1750, frontZ: -1.45, rearZ: 1.35, wheelR: 0.36, wheelW: 0.25, torque: 380, mu: 1.05, cd: 1.0, L0: 0.5 };
SPECS.sport = { ...SPECS.muscle, style: 'sport', mass: 1350, frontZ: -1.35, rearZ: 1.3, wheelR: 0.33, wheelW: 0.27, torque: 460, mu: 1.4, cd: 0.7, kF: 30000, kR: 30000, arbF: 9000, arbR: 5000 };
SPECS.super = { ...SPECS.muscle, style: 'super', mass: 1400, frontZ: -1.45, rearZ: 1.25, comZ: 0.15, wheelR: 0.34, wheelW: 0.3, torque: 620, peakRpm: 5000, redline: 7800, idle: 950, mu: 1.55, cd: 0.6, kF: 34000, kR: 36000, arbF: 11000, arbR: 6000, gears: [3.0, 2.1, 1.6, 1.25, 1.0, 0.82] };
// heavy diesels
SPECS.bus = {
  ...base, style: 'bus', mass: 11000, frontZ: -3.55, rearZ: 2.55, comZ: -0.3, track: 2.06, wheelR: 0.5, wheelW: 0.32, L0: 0.55, travel: 0.3,
  kF: 150000, kR: 170000, cBump: 13000, cReb: 18000, arbF: 60000, arbR: 60000, rollCenter: 0.5,
  torque: 1500, peakRpm: 1500, idle: 600, redline: 2700, gears: [5.5, 3.3, 2.1, 1.4, 1.0], final: 4.3,
  brakeF: 16000, brakeR: 14000, handbrake: 20000, mu: 0.95, cd: 3.2, topFall: 1.2, maxSteer: 0.62,
};
SPECS.truck = {
  ...SPECS.bus, style: 'truck', mass: 11500, frontZ: -3.55, rearZ: 3.0, comZ: -0.4, wheelR: 0.54, kF: 120000, kR: 130000, cBump: 10000, cReb: 14000,
  arbF: 45000, arbR: 45000, torque: 1150, brakeF: 13000, brakeR: 11000, cd: 2.8,
};
SPECS.firetruck = { ...SPECS.truck, style: 'firetruck', mass: 14000, frontZ: -3.25, rearZ: 2.6, torque: 1700, kF: 190000, kR: 210000, cBump: 16000, cReb: 22000, arbF: 70000, arbR: 70000, brakeF: 21000, brakeR: 18000 };

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _r = new THREE.Vector3(), _vp = new THREE.Vector3(), _f = new THREE.Vector3();
const _wf = new THREE.Vector3(), _ws = new THREE.Vector3(), _n = new THREE.Vector3();
const _qi = new THREE.Quaternion(), _qs = new THREE.Quaternion();
const _right = new THREE.Vector3(), _up = new THREE.Vector3(), _fwd = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function smoothstep01(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

function tyreCurve(s, falloff) {
  if (s <= 1) return 1.5 * s - 0.5 * s * s * s;
  return 1 - falloff * (1 - Math.exp(-(s - 1) * 1.3));
}

export class Vehicle {
  constructor(world, type, color = 0xaa2222, scheme = 'plain') {
    // full-size wheels set out flush with the body (no toy-car tucked-in track); buses and trucks keep theirs
    const base0 = SPECS[type], heavy = base0.style === 'bus' || base0.style === 'truck' || base0.style === 'firetruck';
    const spec = (this.spec = heavy ? base0 : { ...base0, wheelR: base0.wheelR * 1.08, wheelW: base0.wheelW * 1.25 });
    if (!heavy) spec.track = BODY_STYLES[spec.style].W - spec.wheelW - 0.05;
    this.type = type;
    this.world = world;
    this.car = buildCar(spec, color, scheme);
    this.root = this.car.root;
    this.scheme = scheme;
    const st = BODY_STYLES[spec.style];
    this.style = st;
    const m = (this.mass = spec.mass);
    this.invMass = 1 / m;
    const L = st.L, W = st.W, H = st.roof;
    this.I = new THREE.Vector3((m / 12) * (H * H + L * L) * 0.85, (m / 12) * (W * W + L * L) * 0.9, (m / 12) * (W * W + H * H) * 1.1);
    this.invI = new THREE.Vector3(1 / this.I.x, 1 / this.I.y, 1 / this.I.z);
    const wbF = -spec.frontZ + spec.comZ, wbR = spec.rearZ - spec.comZ; // distances from COM
    const wb = wbF + wbR;
    this.wheelbase = wb;
    const loadF = (m * G * wbR) / wb / 2, loadR = (m * G * wbF) / wb / 2;
    const lStaticF = spec.L0 - loadF / spec.kF, lStaticR = spec.L0 - loadR / spec.kR;
    this.comH = (lStaticF + lStaticR) / 2 + spec.wheelR;
    this.car.model.position.set(0, -this.comH, -spec.comZ);
    this.hx = W / 2; this.hz = L / 2; this.boxZ = -spec.comZ;
    this.bottomY = st.clear - this.comH;
    this.topY = st.roof - this.comH;

    this.wheels = [];
    for (let i = 0; i < 4; i++) {
      const front = i < 2, left = i % 2 === 0;
      const x = (left ? -1 : 1) * spec.track / 2;
      const z = (front ? spec.frontZ : spec.rearZ) - spec.comZ;
      const driven = spec.drive === 'awd' || (spec.drive === 'rwd' ? !front : front);
      this.wheels.push({
        mount: new THREE.Vector3(x, 0, z), front, left, driven,
        k: front ? spec.kF : spec.kR, arb: front ? spec.arbF : spec.arbR,
        w: 0, l: spec.L0, lPrev: spec.L0, contact: false, Fs: 0, comp: 0, N: 0,
        steer: 0, spinAngle: 0, slip: 0, slipLong: 0, slipLat: 0, surface: SURF.ASPHALT,
        sx: 0, sc: 0, contactPos: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), hitH: 0, ws: new THREE.Vector3(),
        bumpPhase: Math.random() * 10,
      });
    }
    // body hull points (local) for ground contact
    const hx = W / 2 * 0.92, z0 = -L / 2 * 0.95 - spec.comZ, z1 = L / 2 * 0.95 - spec.comZ;
    const yb = this.bottomY + 0.05, yt = this.topY - 0.02, yb2 = st.belt - this.comH;
    this.hull = [];
    for (const z of [z0, z1, (z0 + z1) / 2]) for (const x of [-hx, hx]) {
      this.hull.push(new THREE.Vector3(x, yb, z), new THREE.Vector3(x * 0.85, yt, z * 0.55), new THREE.Vector3(x, yb2, z));
    }
    this.hull.push(new THREE.Vector3(0, yt, 0));

    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.vel = new THREE.Vector3();
    this.angVel = new THREE.Vector3();
    this.force = new THREE.Vector3();
    this.torque = new THREE.Vector3();
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
    this.steerAngle = 0;
    this.gear = 1;
    this.autoReverse = false;
    this.indicate = 0; // -1 left, 1 right
    this.hazards = false;
    this.rpm = spec.idle;
    this.shiftT = 0;
    this.shiftHold = 0;
    this.tc = 1;
    this.tcSlip = type === 'muscle' ? 1.3 : 1.1;
    this.escAngle = 0.11;
    this.rearSlipAngle = 0;
    this.revTimer = 0;
    this.throttleEff = 0;
    this.brakeEff = 0;
    this.speed = 0;
    this.latSpeed = 0;
    this.damage = 0;
    this.inWater = 0;
    this.airborne = 0;
    this.groundedWheels = 0;
    this.bodyScrape = 0;
    this.lastHitT = 0;
    this.wrecked = false;
    this.assist = 0.75;
    this.stability = 0.6;
    this.recovery = 1.0;
    this.headlightsOn = false;
    this.sleeping = false;
  }

  resetTo(x, y, z, heading, speed = 0) {
    this.pos.set(x, y + this.comH + 0.15, z);
    this.quat.setFromAxisAngle(UP, heading);
    _fwd.set(0, 0, -1).applyQuaternion(this.quat);
    this.vel.copy(_fwd).multiplyScalar(speed);
    this.angVel.set(0, 0, 0);
    for (const w of this.wheels) { w.w = speed / this.spec.wheelR; w.l = w.lPrev = this.spec.L0 * 0.7; }
    this.gear = 1;
    this.steerAngle = 0;
    this.inWater = 0;
    this.syncVisual(0);
  }

  get heading() {
    _fwd.set(0, 0, -1).applyQuaternion(this.quat);
    return Math.atan2(-_fwd.x, -_fwd.z);
  }

  forward(out) { return out.set(0, 0, -1).applyQuaternion(this.quat); }
  right(out) { return out.set(1, 0, 0).applyQuaternion(this.quat); }
  upv(out) { return out.set(0, 1, 0).applyQuaternion(this.quat); }

  pointVelocity(r, out) { return out.copy(this.angVel).cross(r).add(this.vel); }

  applyImpulse(J, r) {
    this.vel.addScaledVector(J, this.invMass);
    _v3.copy(r).cross(J);
    this.applyAngularImpulse(_v3);
  }

  applyAngularImpulse(L) {
    _qi.copy(this.quat).invert();
    _v1.copy(L).applyQuaternion(_qi);
    _v1.x *= this.invI.x; _v1.y *= this.invI.y; _v1.z *= this.invI.z;
    _v1.applyQuaternion(this.quat);
    this.angVel.add(_v1);
  }

  // effective inverse mass along direction n at offset r (for impulse solving)
  invMassAt(r, n) {
    _v2.copy(r).cross(n);
    _qi.copy(this.quat).invert();
    _v2.applyQuaternion(_qi);
    _v2.x *= this.invI.x; _v2.y *= this.invI.y; _v2.z *= this.invI.z;
    _v2.applyQuaternion(this.quat);
    _v2.cross(r);
    return this.invMass + _v2.dot(n);
  }

  // per-frame: surfaces and driver aids
  prepare(dt) {
    if (this.sleeping) return;
    const world = this.world;
    for (const w of this.wheels) {
      if (!w.contact) continue;
      w.surface = world.surfaceAt(w.contactPos.x, w.contactPos.z);
    }
    // gearbox logic and reverse handling
    const spec = this.spec;
    const inp = this.input;
    this.forward(_fwd);
    this.speed = this.vel.dot(_fwd);
    this.right(_right);
    this.latSpeed = this.vel.dot(_right);
    let thr = inp.throttle, brk = inp.brake;
    if (this.gear === -1) {
      if (inp.throttle > 0.1 && this.speed > -1.0) { this.gear = 1; }
      else { thr = inp.brake; brk = inp.throttle; }
    } else {
      // (holding the brake at a standstill selects reverse: the player's controls only; AI cars pick their own gear)
      if (this.autoReverse && this.speed < 0.8 && inp.brake > 0.1 && inp.throttle < 0.1) {
        this.revTimer += dt;
        if (this.revTimer > 0.22) { this.gear = -1; thr = inp.brake; brk = 0; }
      } else this.revTimer = 0;
    }
    if (this.gear === -1 && this.speed > 1.5 && thr > 0) { brk = thr; thr = 0; }
    const dmgPower = this.damage > 0.7 ? 1 - (this.damage - 0.7) * 1.6 : 1;
    this.throttleEff = thr * dmgPower;
    this.brakeEff = brk;

    // steering with speed-sensitive lock + countersteer assist
    const v = Math.abs(this.speed);
    const maxLock = spec.maxSteer;
    const lim = Math.min(maxLock, Math.atan((this.wheelbase * 8.5) / Math.max(v * v, 1)) + spec.alphaPeak * 0.9);
    let target = -inp.steer * lim;
    if (v > 4 && this.speed > 0 && this.groundedWheels >= 2) {
      const beta = Math.atan2(this.latSpeed, Math.abs(this.speed));
      if (Math.abs(beta) > 0.04) target += -beta * this.assist * Math.min(1, (v - 4) / 6);
    }
    target = Math.max(-maxLock, Math.min(maxLock, target));
    const rate = spec.steerRate * (1 + Math.abs(target - this.steerAngle) * 1.5);
    const d = target - this.steerAngle;
    this.steerAngle += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    const wb = this.wheelbase, tr = spec.track;
    const sa = this.steerAngle;
    this.wheels[0].steer = this.wheels[1].steer = 0;
    // wheel 0 is left. For a left turn (sa>0) the left wheel is inner -> larger angle
    if (Math.abs(sa) > 1e-4) {
      const R = wb / Math.tan(sa);
      this.wheels[0].steer = Math.atan(wb / (R - tr / 2));
      this.wheels[1].steer = Math.atan(wb / (R + tr / 2));
    }
  }

  engineTorque(rpm) {
    const s = this.spec;
    const span = rpm < s.peakRpm ? (s.peakRpm - s.idle) * 1.7 : (s.redline - s.peakRpm) * (s.topFall || 2.1);
    const x = (rpm - s.peakRpm) / span;
    return s.torque * Math.max(0.4, 1 - x * x);
  }

  step(dt) {
    if (this.sleeping) return;
    const spec = this.spec, world = this.world;
    const q = this.quat;
    this.forward(_fwd); this.right(_right); this.upv(_up);
    const F = this.force.set(0, -G * this.mass, 0);
    // keep the car planted: a little speed-dependent downforce, and heavier while all four wheels are off the
    // ground so crests and kerbs give short hops instead of floaty flights (real ramp jumps still fly)
    const v2 = this.vel.x * this.vel.x + this.vel.z * this.vel.z;
    F.y -= this.mass * G * 0.22 * Math.min(1.6, v2 / 900);
    if (!this.wheels.some((w) => w.contact)) F.y -= this.mass * G * (this.vel.y > 0 ? 0.55 : 0.3);
    const T = this.torque.set(0, 0, 0);

    // ---- drivetrain ----
    const ratio = this.gear > 0 ? spec.gears[this.gear - 1] : this.gear < 0 ? -spec.reverse : 0;
    let wsum = 0, nd = 0;
    for (const w of this.wheels) if (w.driven) { wsum += w.w; nd++; }
    const wAvg = wsum / nd;
    const wheelRpm = Math.abs(wAvg * ratio * spec.final) * 9.549;
    const thr = this.throttleEff;
    // launch: the clutch lets the engine sit a little above idle, not straight to the top
    const clutchRpm = spec.idle + thr * 1100;
    let targetRpm = Math.max(wheelRpm, (this.gear === 1 || this.gear === -1) ? clutchRpm : spec.idle);
    if (this.shiftT > 0) targetRpm = Math.max(spec.idle, targetRpm * 0.92);
    if (wheelRpm >= clutchRpm - 50) this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * 20); // clutch locked: follows the wheels
    else this.rpm += Math.max(-5000 * dt, Math.min(2200 * dt, targetRpm - this.rpm)); // heavy flywheel feel
    if (this.rpm > spec.redline + 150) this.rpm = spec.redline + 150;
    let Te = thr * this.engineTorque(this.rpm);
    if (this.rpm > spec.redline) Te = 0;
    let Tdrive = this.shiftT > 0 ? 0 : Te * ratio * spec.final * 0.86;
    // soft traction control: lets the tail step out a little but prevents endless burnouts
    {
      // combined slip of the driven tyres (friction circle usage), from the previous substep
      // only forward wheelspin counts; sideways slip must not choke the power (you drive out of slides)
      let sc = 0, nc = 0;
      for (const w of this.wheels) if (w.driven && w.contact) { sc += Math.max(0, w.sx * Math.sign(ratio || 1)); nc++; }
      const usage = nc ? sc / nc : 0;
      const thr = this.tcSlip;
      if (usage > thr) this.tc = Math.max(0.4, this.tc - dt * 20 * (usage - thr));
      else this.tc = Math.min(1, this.tc + dt * 4);
      if (Te > 0) Tdrive *= this.tc;
      // stability: back off the power as the rear slip angle grows (handbrake disables it)
      const ra = this.rearSlipAngle;
      if (Te > 0 && this.input.handbrake === 0 && ra > this.escAngle) Tdrive *= Math.max(0.45, 1 - (ra - this.escAngle) * 6);
    }
    if (thr < 0.05 && this.gear !== 0) {
      // engine braking always opposes wheel rotation
      const eb = spec.torque * 0.14 * (this.rpm / spec.redline) * Math.abs(ratio) * spec.final * 0.86;
      Tdrive = -Math.sign(wAvg) * Math.min(1, Math.abs(wAvg) * 0.5) * eb;
    }
    if (this.wrecked) Tdrive = 0;
    if (this.shiftT > 0) this.shiftT -= dt;
    else if (this.gear >= 1) {
      this.shiftHold -= dt;
      if (this.shiftHold <= 0) {
        const roadRpm = Math.abs(this.speed / spec.wheelR * ratio * spec.final) * 9.549;
        const shiftRpm = this.input.handbrake > 0 ? roadRpm : Math.max(wheelRpm, roadRpm);
        if (this.gear < spec.gears.length && wheelRpm > 2200 + Math.pow(thr, 1.5) * (spec.redline - 3200)) { this.gear++; this.shiftT = 0.18; this.shiftHold = 0.8; }
        else if (this.gear > 1) {
          const down = spec.gears[this.gear - 2] / spec.gears[this.gear - 1];
          const lowRpm = 1300 + thr * 1700;
          if (shiftRpm < lowRpm && shiftRpm * down < spec.redline - 1300) { this.gear--; this.shiftT = 0.12; this.shiftHold = 0.8; }
        }
      }
    }
    const engI = 0.17 * ratio * ratio * spec.final * spec.final / nd;

    // ---- suspension pass ----
    const ws = this.wheels;
    let grounded = 0;
    for (const w of ws) {
      const mw = _v1.copy(w.mount).applyQuaternion(q).add(this.pos);
      const g1 = world.groundAt(mw.x, mw.z, mw.y);
      let nx = g1.nx, ny = g1.ny, nz = g1.nz, h = g1.h;
      let denom = nx * _up.x + ny * _up.y + nz * _up.z;
      let t = denom > 0.2 ? (ny * (mw.y - h)) / denom : 1e9;
      if (t < 2.5) {
        const hx = mw.x - _up.x * t, hz = mw.z - _up.z * t;
        const g2 = world.groundAt(hx, hz, mw.y);
        nx = g2.nx; ny = g2.ny; nz = g2.nz; h = g2.h;
        const bump = SURF_BUMP[w.surface];
        if (bump > 0) h += bump * (Math.sin(hx * 2.3 + w.bumpPhase) * Math.sin(hz * 1.9) + 0.5 * Math.sin(hx * 5.1 + hz * 4.3));
        denom = nx * _up.x + ny * _up.y + nz * _up.z;
        // plane through (hx, h, hz): t = n.(mw - P0)/(n.up)
        t = denom > 0.2 ? (nx * (mw.x - hx) + ny * (mw.y - h) + nz * (mw.z - hz)) / denom : 1e9;
      }
      const l = t - spec.wheelR;
      w.lPrev = w.l;
      // a ledge taller than the suspension can swallow is a wall (handled by colliders/body), not a spring launch
      const ledge = l < spec.L0 - spec.travel - 0.3;
      if (l >= spec.L0 || denom <= 0.2 || ledge) {
        w.contact = false; w.l = Math.min(spec.L0, w.l + dt * 3); w.Fs = 0; w.comp = 0; w.N = 0;
        continue;
      }
      w.contact = true;
      grounded++;
      w.l = Math.max(l, spec.L0 - spec.travel - 0.06);
      w.normal.set(nx, ny, nz);
      w.hitH = h;
      w.comp = spec.L0 - l;
      let cv = (w.lPrev - l) / dt;
      cv = Math.max(-2.5, Math.min(2.5, cv));
      let Fs = w.k * w.comp + (cv > 0 ? spec.cBump : spec.cReb) * cv;
      const lMin = spec.L0 - spec.travel;
      if (l < lMin) Fs += 70000 * (lMin - l) + 14000 * Math.max(0, cv); // bump stop soaks the hit up rather than springing it back
      w.Fs = Fs;
      w.contactPos.copy(mw).addScaledVector(_up, -t);
    }
    // anti-roll bars
    for (let a = 0; a < 2; a++) {
      const L = ws[a * 2], R = ws[a * 2 + 1];
      if (L.contact && R.contact) {
        const f = (L.comp - R.comp) * L.arb;
        L.Fs += f; R.Fs -= f;
      }
    }
    this.groundedWheels = grounded;

    // ---- forces per wheel ----
    const absOn = true;
    for (let i = 0; i < 4; i++) {
      const w = ws[i];
      const Iw = 1.1 + (w.driven ? engI : 0);
      let Tw = w.driven ? Tdrive / nd : 0;
      let Tb = this.brakeEff * (w.front ? spec.brakeF : spec.brakeR);
      if (!w.front && this.input.handbrake > 0) Tb = Math.max(Tb, this.input.handbrake * spec.handbrake);
      // idle hold
      if (thr < 0.02 && this.brakeEff < 0.02 && Math.abs(this.speed) < 0.4 && this.input.handbrake === 0) Tb = Math.max(Tb, 400);
      if (!w.contact) {
        let wn = w.w + (Tw / Iw) * dt;
        const db = (Tb / Iw) * dt;
        wn = Math.abs(wn) <= db ? 0 : wn - Math.sign(wn) * db;
        w.w = wn * 0.999;
        w.slip = 0;
        continue;
      }
      const Fs = Math.max(0, w.Fs);
      // suspension force along body up at hub
      _r.copy(w.contactPos).sub(this.pos);
      _f.copy(_up).multiplyScalar(Fs);
      F.add(_f);
      _v2.copy(_r).cross(_f); T.add(_v2);
      // tyre frame
      _n.copy(w.normal);
      const cs = Math.cos(w.steer), sn = Math.sin(w.steer);
      _wf.copy(_fwd).multiplyScalar(cs).addScaledVector(_right, -sn);
      _wf.addScaledVector(_n, -_wf.dot(_n)).normalize();
      _ws.copy(_wf).cross(_n);
      this.pointVelocity(_r, _vp);
      const vx = _vp.dot(_wf), vy = _vp.dot(_ws);
      const N = Math.min(Fs * Math.max(0.3, _up.dot(_n)), this.mass * G * 1.6);
      w.N = N;
      const grip = SURF_GRIP[w.surface] * spec.mu * (w.front ? 1.08 : 1.12) * (w.surface <= 1 ? world.weatherGrip ?? 1 : 1); // wet tarmac in the rain
      const N0 = (this.mass * G) / 4;
      const loadSens = Math.max(0.75, 1 - 0.09 * (N / N0 - 1));
      const Fmax = grip * N * loadSens;
      const R = spec.wheelR;
      const denomV = Math.max(Math.abs(vx), 3.0);
      const alpha = Math.atan2(vy, denomV);
      const sy = alpha / spec.alphaPeak;
      // implicit longitudinal update
      const kSlope = (Fmax * 1.5) / spec.kappaPeak * (R / denomV);
      let kappa = (w.w * R - vx) / denomV;
      let sx = kappa / spec.kappaPeak;
      let s = Math.hypot(sx, sy);
      let Fc = s > 1e-6 ? Fmax * tyreCurve(s, spec.falloff) : 0;
      let Fx = s > 1e-6 ? (Fc * sx) / s : 0;
      let wn = (Iw * w.w + dt * (Tw - R * Fx + R * kSlope * w.w)) / (Iw + dt * R * kSlope);
      // brakes
      if (Tb > 0) {
        const db = (Tb / Iw) * dt;
        let wb2 = Math.abs(wn) <= db ? 0 : wn - Math.sign(wn) * db;
        const isHand = !w.front && this.input.handbrake > 0;
        if (absOn && !isHand && Math.abs(vx) > 2) {
          const wmin = (vx * (1 - spec.absSlip)) / R;
          if (vx > 0) wb2 = Math.min(wn, Math.max(wb2, wmin));
          else wb2 = Math.max(wn, Math.min(wb2, wmin));
        }
        wn = wb2;
      }
      w.w = wn;
      kappa = (w.w * R - vx) / denomV;
      sx = kappa / spec.kappaPeak;
      s = Math.hypot(sx, sy);
      Fc = s > 1e-6 ? Fmax * tyreCurve(s, spec.falloff) : 0;
      // locked (handbraked) rears keep part of their side grip so the slide catches instead of floating
      const sxd = !w.front && this.input.handbrake > 0 ? sx * 0.3 : sx;
      const sd = Math.hypot(sxd, sy);
      Fx = sd > 1e-6 ? (Fc * sxd) / sd : 0;
      let Fy = sd > 1e-6 ? (-Fc * sy) / sd : 0;
      // rolling resistance
      const roll = SURF_ROLL[w.surface] * N * Math.max(-1, Math.min(1, vx * 2));
      Fx -= roll;
      w.sx = sx; w.sc = s;
      w.slipLong = w.w * R - vx;
      w.slipLat = vy;
      w.slip = Math.hypot(w.slipLong, vy);
      _f.copy(_wf).multiplyScalar(Fx).addScaledVector(_ws, Fy);
      F.add(_f);
      // apply tyre force raised towards the roll centre to tame body roll / tipping
      _r.addScaledVector(_up, spec.rollCenter);
      _v2.copy(_r).cross(_f); T.add(_v2);
      w.ws.copy(_ws);
    }
    {
      const a = ws[2], b = ws[3];
      const vxa = Math.max(Math.abs(this.speed), 3);
      this.rearSlipAngle = Math.abs(Math.atan2((a.slipLat + b.slipLat) * 0.5, vxa));
    }
    // LSD coupling between driven wheels
    const dA = spec.drive === 'fwd' ? [0, 1] : [2, 3];
    {
      const a = ws[dA[0]], b = ws[dA[1]];
      const diff = a.w - b.w;
      const t = Math.max(-500, Math.min(500, diff * spec.lsd)) * dt;
      const I = 1.1 + engI;
      a.w -= t / I; b.w += t / I;
    }

    // ---- yaw stability assist ----
    // Damps yaw beyond what the steering asks for once the car slides, and when you're off the
    // handbrake it eases the nose back toward the direction of travel so you regain traction quickly.
    const vFwd = this.vel.dot(_fwd), vLat = this.vel.dot(_right);
    const vPlanar = Math.hypot(vFwd, vLat);
    if (grounded >= 3 && this.input.handbrake === 0 && vPlanar > 4) {
      const beta = Math.atan2(vLat, vFwd); // signed slip angle, ±π when going backwards
      const ab = Math.abs(beta);
      if (ab < 2.2) {
        const slide = smoothstep01((ab - 0.15) / 0.3); // 0 = gripping, 1 = properly sideways
        const want = (vFwd * Math.tan(this.steerAngle)) / this.wheelbase;
        const lim = 9.5 / Math.max(vPlanar, 4);
        const target = Math.max(-lim, Math.min(lim, want)) * (1 - slide);
        const yaw = this.angVel.dot(_up);
        const k = this.stability * (1 + this.input.throttle * 0.8) * smoothstep01((ab - 0.08) / 0.15);
        if (k > 0) T.addScaledVector(_up, -(yaw - target) * this.I.y * 7 * k);
        // straighten-out: rotate toward the velocity (beta > 0 = sliding right -> yaw right = negative y)
        const fade = 1 - smoothstep01((ab - 1.4) / 0.6);
        const align = this.recovery * (0.5 + 0.7 * this.input.throttle) * slide * fade * Math.min(1, vPlanar / 10);
        if (align > 0) T.addScaledVector(_up, -Math.sign(beta) * Math.min(ab, 1.0) * this.I.y * 5 * align);
      }
    }

    // ---- aero ----
    const sp = this.vel.length();
    F.addScaledVector(this.vel, -spec.cd * sp);
    F.addScaledVector(_up, -0.25 * sp * sp * 0.4);

    // ---- body / ground contact ----
    this.bodyScrape = 0;
    for (const hp of this.hull) {
      const pw = _v1.copy(hp).applyQuaternion(q).add(this.pos);
      const g = world.groundAt(pw.x, pw.z, pw.y - 0.35); // only decks right under the body, never a ledge beside it
      const pen = g.h - pw.y;
      if (pen <= 0) continue;
      _n.set(g.nx, g.ny, g.nz);
      _r.copy(pw).sub(this.pos);
      this.pointVelocity(_r, _vp);
      const vn = _vp.dot(_n);
      let Fn = 80000 * Math.min(pen, 0.25) - 9000 * Math.min(0, vn);
      if (Fn < 0) Fn = 0;
      _f.copy(_n).multiplyScalar(Fn);
      _v2.copy(_vp).addScaledVector(_n, -vn);
      const vt = _v2.length();
      if (vt > 1e-3) {
        const ft = Math.min(0.2 * Fn, vt * this.mass * 12); // the body scrapes and slides rather than digging in
        _f.addScaledVector(_v2, -ft / vt);
      }
      F.add(_f);
      _v2.copy(_r).cross(_f); T.add(_v2);
      this.bodyScrape = Math.max(this.bodyScrape, vt * Math.min(1, pen * 10));
    }

    // ---- water ----
    const sub = this.world.waterLevelAt(this.pos.x, this.pos.z) - (this.pos.y - 0.2);
    this.inWater = sub;
    if (sub > 0) {
      const f = Math.min(sub, 1.3) / 1.3;
      F.y += f * this.mass * G * 0.82;
      F.addScaledVector(this.vel, -this.mass * 1.4 * f);
      this.angVel.multiplyScalar(1 - 1.5 * f * dt);
    }

    // ---- integrate ----
    this.vel.addScaledVector(F, this.invMass * dt);
    _qi.copy(q).invert();
    _v1.copy(T).applyQuaternion(_qi);
    _v1.x *= this.invI.x; _v1.y *= this.invI.y; _v1.z *= this.invI.z;
    _v1.applyQuaternion(q);
    this.angVel.addScaledVector(_v1, dt);
    this.angVel.multiplyScalar(1 - 0.05 * dt);
    this.pos.addScaledVector(this.vel, dt);
    const wx = this.angVel.x, wy = this.angVel.y, wz = this.angVel.z;
    _qs.set(wx * dt * 0.5, wy * dt * 0.5, wz * dt * 0.5, 0).multiply(q);
    q.x += _qs.x; q.y += _qs.y; q.z += _qs.z; q.w += _qs.w;
    q.normalize();

    for (const w of ws) w.spinAngle -= w.w * dt;
    this.airborne = grounded === 0 ? this.airborne + dt : 0;
  }

  syncVisual(dt) {
    this.root.position.copy(this.pos);
    this.root.quaternion.copy(this.quat);
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i], vw = this.car.wheels[i];
      vw.steer.position.set(w.mount.x, w.mount.y - w.l, w.mount.z);
      vw.steer.rotation.y = w.steer;
      vw.spin.rotation.x = w.spinAngle;
    }
    // the people inside: heads glance about now and then; after a crash, arms up and shaking, heads to the impact
    const F = this.car.folk;
    if (F && this.root.visible && !this.lodOn) {
      const fs = this.folkState || (this.folkState = Array.from({ length: F.n }, () => ({ yaw: 0, pitch: 0, ty: 0, tp: 0, t: Math.random() * 3 })));
      const g = this.gestureT || 0, now = performance.now() / 1000;
      if (g > 0) this.gestureT = g - dt;
      const env = g > 0 ? Math.min(1, (3.5 - g) * 5) * Math.min(1, g * 1.5) : 0;
      fs.forEach((p, i) => {
        p.t -= dt;
        if (p.t <= 0) { // a new thing to look at: mostly ahead, sometimes out of a window or at the mirror
          p.t = 1.2 + Math.random() * 3.5;
          const r = Math.random();
          p.ty = r < 0.5 ? (Math.random() - 0.5) * 0.3 : r < 0.8 ? (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5) : (Math.random() - 0.5) * 1.6;
          p.tp = (Math.random() - 0.5) * 0.25;
        }
        const ty = env > 0 ? (this.gestureSide || 1) * 0.9 + Math.sin(now * 9 + i) * 0.25 : p.ty;
        p.yaw += (ty - p.yaw) * Math.min(1, dt * (env > 0 ? 8 : 3));
        p.pitch += ((env > 0 ? -0.15 : p.tp) - p.pitch) * Math.min(1, dt * 3);
        F.u.uHead.value[i].set(p.yaw, p.pitch);
        const shake = Math.sin(now * 13 + i * 1.7) * 0.35;
        F.u.uArm.value[i].set(env * (2.2 + shake), env * (2.2 - shake)); // (positive: up and forward)
      });
    }
    // turn signals: 1.5 blinks a second on the side the driver is turning (or both, as hazards)
    if (this.car.indicators) {
      const on = Math.floor(performance.now() / 333) % 2 === 0;
      this.car.indicators[0].emissiveIntensity = on && (this.indicate < 0 || this.hazards) ? 3 : 0;
      this.car.indicators[1].emissiveIntensity = on && (this.indicate > 0 || this.hazards) ? 3 : 0;
    }
    const braking = this.brakeEff > 0.1 || this.input.handbrake > 0;
    const night = this.headlightsOn ? 0.6 : 0;
    this.car.tailMat.emissiveIntensity = braking ? 2.8 : this.gear === -1 ? 1.5 : 0.25 + night;
    // each side's ground glow only while that side still has a working headlight
    for (const bm of this.car.beams) bm.visible = this.headlightsOn && this.car.heads.some((h) => h.visible && Math.sign(h.position.x) === bm.userData.side);
  }

  isFlipped() {
    this.upv(_up);
    return _up.y < 0.25;
  }
}
