// Physically-inspired engine synth running on the audio thread.
// A virtual crankshaft fires each cylinder in order; every combustion pulse excites
// exhaust resonances (body, pipe rasp, low thump) and a pipe comb filter, then a
// muffler low-pass and soft saturation. Cross-plane V8 bank timing gives the burble.

const TAU = Math.PI * 2;

// firing angles in a 720° cycle, and which exhaust bank each cylinder dumps into
const LAYOUTS = {
  // cross-plane V8 (1-8-4-3-6-5-7-2): even 90° firing, uneven per bank -> lumpy burble
  v8: { angles: [0, 90, 180, 270, 360, 450, 540, 630], banks: [0, 1, 0, 0, 1, 0, 1, 1], body: 78, rasp: 340, pipe: 0.0048, lope: [1.0, 0.4, 0.88, 0.52, 1.0, 0.36, 0.8, 0.48], lopeRpm: 5200 },
  // inline four: smooth, buzzy
  i4: { angles: [0, 180, 360, 540], banks: [0, 0, 0, 0], body: 150, rasp: 620, pipe: 0.0029, lope: [1, 0.85, 0.95, 0.8], lopeRpm: 1500 },
  // straight six (vans/pickups): smooth and deep
  i6: { angles: [0, 120, 240, 360, 480, 600], banks: [0, 0, 0, 0, 0, 0], body: 115, rasp: 480, pipe: 0.0036, lope: [1, 0.75, 0.9, 0.7, 0.95, 0.8], lopeRpm: 2000 },
};

class SVF {
  constructor() { this.lp = 0; this.bp = 0; }
  run(x, f, q) {
    const hp = x - this.lp - q * this.bp;
    this.bp += f * hp;
    this.lp += f * this.bp;
    return this.bp;
  }
}

class EngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 850, minValue: 0, maxValue: 12000, automationRate: 'k-rate' },
      { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'gain', defaultValue: 0, minValue: 0, maxValue: 4, automationRate: 'k-rate' },
    ];
  }

  constructor(opts) {
    super();
    const L = LAYOUTS[(opts.processorOptions && opts.processorOptions.layout) || 'v8'];
    this.L = L;
    this.phase = 0;
    this.rpm = 850; this.thr = 0; this.gain = 0;
    this.env = [0, 0];
    this.noiseEnv = [0, 0];
    this.body = [new SVF(), new SVF()];
    this.rasp = [new SVF(), new SVF()];
    this.thump = 0;
    this.intake = new SVF();
    this.mufA = 0; this.mufB = 0;
    this.dc = 0; this.dcIn = 0;
    const N = Math.ceil(sampleRate * 0.02);
    this.delay = new Float32Array(N);
    this.dIdx = 0;
    this.lastThr = 0;
    this.popTimer = 0;
    this.seed = 12345;
    this.cylJitter = L.angles.map(() => 0.85 + Math.random() * 0.3);
  }

  rnd() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  process(_in, outputs, params) {
    const out = outputs[0][0];
    if (!out) return true;
    const n = out.length, sr = sampleRate, L = this.L;
    const rpm1 = params.rpm[0], thr1 = params.throttle[0], g1 = params.gain[0];
    const rpm0 = this.rpm, thr0 = this.thr, g0 = this.gain;
    // throttle lift at high revs -> overrun pops for a moment
    if (this.lastThr > 0.5 && thr1 < 0.15 && rpm1 > 3200) this.popTimer = 0.9;
    this.lastThr = thr1;
    const ncyl = L.angles.length;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n;
      const rpm = rpm0 + (rpm1 - rpm0) * t;
      const thr = thr0 + (thr1 - thr0) * t;
      const g = g0 + (g1 - g0) * t;
      const load = 0.25 + 0.75 * thr;
      // advance the crank (720° per cycle)
      const prev = this.phase;
      this.phase += (rpm / 60) * 360 / sr * (1 + 0.035 * (this.lulPrev || 1) - 0.035);
      if (this.phase >= 720) { this.phase -= 720; this.cycle = ((this.cycle || 0) + 1) % 3; }
      // slow lope: one "lul" every 3 engine cycles (900 rpm ~2.5/s, 1300 rpm ~3.6/s), fading out with revs
      const lopePh = ((this.cycle || 0) * 720 + this.phase) / 2160;
      const lopeFade = Math.max(0, Math.min(1, 1 - (rpm - 1100) / 2400));
      const lul = 1 - 0.62 * lopeFade * (0.5 - 0.5 * Math.cos(TAU * lopePh));
      this.lulPrev = lul;
      for (let c = 0; c < ncyl; c++) {
        const a = L.angles[c];
        const crossed = prev <= this.phase ? prev < a && this.phase >= a : prev < a || this.phase >= a;
        if (!crossed) continue;
        const b = L.banks[c];
        // combustion strength: throttle, cylinder-to-cylinder variation, a little randomness
        // big-cam lope: a strong/weak pulse pattern each cycle -> the slow "lu-lu-lu" at low revs
        const lopeAmt = Math.max(0, Math.min(1, 1 - (rpm - 900) / (L.lopeRpm - 900)));
        const lope = 1 + (L.lope[c] - 1) * (0.3 + 0.25 * lopeAmt);
        let amp = (0.35 + 0.85 * load) * lope * lul * this.cylJitter[c] * (0.92 + 0.16 * this.rnd());
        let noise = 0.25 + 0.5 * thr;
        if (this.popTimer > 0 && thr < 0.2 && this.rnd() < 0.09) { amp *= 2.6; noise = 2.5; }
        // idle lope: occasionally weak firing at low rpm
        if (rpm < 1200 && this.rnd() < 0.12) amp *= 0.6;
        this.env[b] = Math.max(this.env[b], amp);
        this.noiseEnv[b] = Math.max(this.noiseEnv[b], amp * noise);
      }
      if (this.popTimer > 0) this.popTimer -= 1 / sr;
      // pulse decay: shorter at high rpm so pulses don't smear together
      const pulseMs = 4.2 - Math.min(3.0, rpm / 2200);
      const dec = Math.exp(-1 / (sr * pulseMs * 0.001));
      const fBody = 2 * Math.sin(Math.PI * Math.min(0.2, (L.body + rpm * 0.006) / sr));
      const fRasp = 2 * Math.sin(Math.PI * Math.min(0.24, (L.rasp + rpm * 0.025) / sr));
      let s = 0;
      for (let b = 0; b < 2; b++) {
        const nz = this.rnd() * 2 - 1;
        const ex = this.env[b] + this.noiseEnv[b] * nz;
        this.env[b] *= dec;
        this.noiseEnv[b] *= dec * 0.995;
        const body = this.body[b].run(ex, fBody, 0.55);
        const rasp = this.rasp[b].run(ex, fRasp, 0.35);
        s += body * 1.15 + rasp * (0.08 + 0.22 * thr) * Math.min(1, rpm / 4500) + ex * 0.06;
        // the second bank is slightly delayed/longer pipe: subtle stereo-ish thickness folded to mono
      }
      // low thump of each pulse
      this.thump += (s - this.thump) * 0.012;
      s += this.thump * 3.2;
      // intake / induction roar with throttle
      const inN = (this.rnd() * 2 - 1) * thr * (rpm / 6000);
      s += this.intake.run(inN, 2 * Math.sin(Math.PI * Math.min(0.2, (700 + rpm * 0.18) / sr)), 0.6) * 0.22;
      // exhaust pipe comb resonance
      const D = Math.floor(L.pipe * sr);
      const di = (this.dIdx - D + this.delay.length) % this.delay.length;
      const y = s + this.delay[di] * 0.38;
      this.delay[this.dIdx] = y;
      this.dIdx = (this.dIdx + 1) % this.delay.length;
      // muffler: two-pole low-pass, opens up with throttle
      const fc = 520 + 850 * thr + rpm * 0.12; // keep it deep: a big muffled V8, not a screamer
      const a = 1 - Math.exp(-TAU * fc / sr);
      this.mufA += (y - this.mufA) * a;
      this.mufB += (this.mufA - this.mufB) * a;
      // DC block + saturation
      const v = this.mufB;
      this.dc = v - this.dcIn + 0.995 * this.dc;
      this.dcIn = v;
      out[i] = Math.tanh(this.dc * 1.4) * g;
    }
    this.rpm = rpm1; this.thr = thr1; this.gain = g1;
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}

registerProcessor('engine-synth', EngineProcessor);

// Tyre squeal: stick-slip is a relaxation oscillation. The tread grips (slow ramp) then
// snaps loose (sharp drop) a few hundred times a second, with the period and strength
// varying cycle to cycle. That buzzy, jittery sawtooth is shaped by tyre/body formants.
class SquealProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'amount', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'pitch', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.seed = 987654;
    this.ph = 0; this.period = 1 / 700; this.cycAmp = 1;
    this.walk = 0; this.walkV = 0;
    this.f1 = new SVF(); this.f2 = new SVF(); this.f3 = new SVF();
    this.lp = 0; this.lp2 = 0; this.hp = 0; this.hpIn = 0;
    this.amt = 0;
    this.gate = 1; this.gateT = 0;
  }
  rnd() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  process(_in, outputs, params) {
    const out = outputs[0][0];
    if (!out) return true;
    const sr = sampleRate, n = out.length;
    const a1 = params.amount[0], p = params.pitch[0];
    const a0 = this.amt;
    const base = 520 + p * 420; // locked skid ~620 Hz, cornering squeal ~900 Hz
    const rough = 0.14 - p * 0.08; // locked wheels are rougher
    for (let i = 0; i < n; i++) {
      const amt = a0 + (a1 - a0) * ((i + 1) / n);
      // slow pitch drift
      this.walkV += (this.rnd() - 0.5) * 0.0006 - this.walk * 0.00003;
      this.walkV *= 0.9993;
      this.walk = Math.max(-0.18, Math.min(0.18, this.walk + this.walkV));
      // intermittent grip: brief drop-outs give the "chirp-chirp" texture
      this.gateT -= 1 / sr;
      if (this.gateT <= 0) { this.gateT = 0.03 + this.rnd() * 0.09; this.gateTarget = this.rnd() < 0.18 ? 0.35 : 1; }
      this.gate += ((this.gateTarget || 1) - this.gate) * 0.002;
      // stick-slip oscillator with per-cycle jitter
      this.ph += 1 / sr;
      let saw;
      if (this.ph >= this.period) {
        this.ph -= this.period;
        const f = base * (1 + this.walk);
        this.period = (1 / f) * (1 + (this.rnd() - 0.5) * rough);
        this.cycAmp = 0.7 + this.rnd() * 0.3;
      }
      const t = this.ph / this.period;
      // grip ramp (slow) then slip (fast, last 12% of the cycle)
      saw = (t < 0.88 ? t / 0.88 : 1 - (t - 0.88) / 0.12) * 2 - 1;
      saw *= this.cycAmp;
      const nz = this.rnd() * 2 - 1;
      const x = saw + nz * 0.25;
      // formants: carcass resonance and tread "edge"
      const g = Math.PI / sr;
      const b1 = this.f1.run(x, 2 * Math.sin(1100 * g), 0.5);
      const b2 = this.f2.run(x, 2 * Math.sin(2300 * g), 0.4);
      const b3 = this.f3.run(x, 2 * Math.sin(3500 * g), 0.5);
      let y = x * 0.25 + b1 * 0.9 + b2 * 0.6 + b3 * 0.25;
      // soften the top end and remove rumble
      this.lp += (y - this.lp) * 0.45;
      this.lp2 += (this.lp - this.lp2) * 0.6;
      this.hp = this.lp2 - this.hpIn + 0.985 * this.hp; this.hpIn = this.lp2;
      out[i] = Math.tanh(this.hp * 0.55 * amt * this.gate) * 0.75;
    }
    this.amt = a1;
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}
registerProcessor('tyre-squeal', SquealProcessor);
