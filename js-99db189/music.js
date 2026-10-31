// Music spilling out of bars, cafés, showrooms and boomboxes: tiny synthesised bands, positioned in the world.
const STYLES = {
  disco: { bpm: 118, swing: 0, vol: 0.5, radius: 85 },
  rock: { bpm: 128, swing: 0, vol: 0.45, radius: 80 },
  jazz: { bpm: 96, swing: 0.33, vol: 0.42, radius: 60 },
  hiphop: { bpm: 88, swing: 0.18, vol: 0.55, radius: 70 },
};
// chord progressions as semitone offsets of the chord roots, with chord qualities
const PROGS = {
  disco: [[0, 'm7'], [5, 'm7'], [3, 'maj7'], [10, '7']],
  rock: [[0, '5'], [10, '5'], [5, '5'], [0, '5']],
  jazz: [[2, 'm7'], [7, '7'], [0, 'maj7'], [9, '7']],
  hiphop: [[0, 'm7'], [0, 'm7'], [8, 'maj7'], [7, 'm7']],
};
const QUAL = { m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], 7: [0, 4, 7, 10], 5: [0, 7, 12] };
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class MusicSystem {
  constructor(audio, world) {
    this.audio = audio;
    this.spots = world.musicSpots || [];
    this.active = new Map(); // spot -> voice
    this.scanT = 0;
  }

  update(dt, cam) {
    const A = this.audio, ctx = A.ctx;
    if (!ctx || !A.master || ctx.state !== 'running') return;
    const px = cam.position.x, py = cam.position.y, pz = cam.position.z;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.5;
      // keep the three nearest audible spots playing
      const near = [];
      for (const s of this.spots) {
        const d = Math.hypot(s.x - px, s.z - pz);
        if (d < STYLES[s.style].radius) near.push([d, s]);
      }
      near.sort((a, b) => a[0] - b[0]);
      const want = new Set(near.slice(0, 3).map((n) => n[1]));
      for (const [s, v] of this.active) if (!want.has(s)) { this.stopVoice(v); this.active.delete(s); }
      for (const s of want) if (!this.active.has(s)) this.active.set(s, this.startVoice(s));
    }
    // listener orientation
    const e = cam.matrixWorld.elements, rx = e[0], rz = e[2];
    const now = ctx.currentTime;
    for (const [s, v] of this.active) {
      const St = STYLES[s.style];
      const dx = s.x - px, dz = s.z - pz, dy = s.y - py;
      const d = Math.hypot(dx, dz, dy * 0.5);
      const k = Math.max(0, 1 - d / St.radius);
      const g = St.vol * k * k * (A.muted ? 0 : 1);
      v.out.gain.setTargetAtTime(g, now, 0.15);
      // muffled through walls from afar, bright when you're at the door
      v.lp.frequency.setTargetAtTime(350 + 9000 * k * k * k, now, 0.15);
      v.pan.pan.setTargetAtTime(d > 0.5 ? Math.max(-0.85, Math.min(0.85, (dx * rx + dz * rz) / d)) : 0, now, 0.1);
      this.schedule(v, now + 0.25);
    }
  }

  startVoice(s) {
    const ctx = this.audio.ctx;
    const out = ctx.createGain(); out.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800; lp.Q.value = 0.5;
    const pan = ctx.createStereoPanner();
    out.connect(lp).connect(pan).connect(this.audio.master);
    const St = STYLES[s.style];
    const rnd = mulberry(s.seed + 1);
    const root = 36 + Math.floor(rnd() * 8); // bass register MIDI note
    const step = 60 / St.bpm / 4;
    // start mid-song, aligned to the bar so it feels like it was already playing
    return { s, out, lp, pan, St, rnd, root, step, next: ctx.currentTime + 0.05, i: Math.floor(rnd() * 4) * 16 };
  }

  stopVoice(v) {
    const ctx = this.audio.ctx;
    v.out.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    setTimeout(() => v.pan.disconnect(), 1500);
  }

  schedule(v, until) {
    while (v.next < until) {
      const i = v.i, st = i % 16;
      let t = v.next;
      if (st % 2 === 1) t += v.St.swing * v.step; // swung offbeats
      if (t > this.audio.ctx.currentTime) this[v.s.style](v, t, st, Math.floor(i / 16));
      v.i++;
      v.next += v.step;
    }
  }

  chord(v, bar) {
    const [off, q] = PROGS[v.s.style][bar % 4];
    return { r: v.root + off, iv: QUAL[q] };
  }

  // ---- styles ----
  disco(v, t, st, bar) {
    const c = this.chord(v, bar), o = v.out;
    if (st % 4 === 0) this.kick(o, t, 0.9);
    if (st % 4 === 2) this.hat(o, t, 0.35, 0.12);
    else if (st % 2 === 1) this.hat(o, t, 0.12, 0.03);
    if (st === 4 || st === 12) { this.snare(o, t, 0.45); this.clap(o, t, 0.3); }
    // octave-jumping bass
    if (st % 2 === 0) this.bass(o, t, hz(c.r + (st % 4 === 2 ? 12 : 0)), 0.42, v.step * 1.6, 'sawtooth', 900);
    // chicken-scratch stabs on the offbeats
    if (st === 2 || st === 7 || st === 10 || st === 14) this.stab(o, t, c.r + 24, c.iv, 0.09, 0.12, 'square', 2600);
  }

  rock(v, t, st, bar) {
    const c = this.chord(v, bar), o = v.out;
    if (st === 0 || st === 8 || st === 10) this.kick(o, t, 1);
    if (st === 4 || st === 12) this.snare(o, t, 0.8);
    if (st % 2 === 0) this.hat(o, t, 0.16, 0.05);
    if (st % 2 === 0) this.bass(o, t, hz(c.r), 0.38, v.step * 1.8, 'sawtooth', 600);
    // chugging power chords, crunchy through a waveshaper
    if (st % 2 === 0) this.stab(o, t, c.r + 12, c.iv, 0.09, st % 8 === 0 ? 0.5 : 0.17, 'sawtooth', 1800, true);
  }

  jazz(v, t, st, bar) {
    const c = this.chord(v, bar), o = v.out;
    // ride: ding, ding-a ding
    if (st % 4 === 0 || st === 7 || st === 15) this.ride(o, t, 0.18);
    if (st === 4 || st === 12) this.brush(o, t, 0.22);
    if (st === 0 && v.rnd() < 0.5) this.kick(o, t, 0.25);
    // walking bass: chord tones and approach notes on every beat
    if (st % 4 === 0) {
      const walk = [0, c.iv[1], c.iv[2], c.iv[2] + 2][st / 4] ?? 0;
      this.bass(o, t, hz(c.r + walk), 0.5, v.step * 3.5, 'triangle', 700);
    }
    // soft Rhodes comping
    if (st === 0 || (st === 6 && v.rnd() < 0.6) || (st === 11 && v.rnd() < 0.3)) this.keys(o, t, c.r + 24, c.iv, 0.07, v.step * 5);
  }

  hiphop(v, t, st, bar) {
    const c = this.chord(v, bar), o = v.out;
    if (st === 0 || st === 7 || st === 10) this.kick(o, t, 1);
    if (st === 4 || st === 12) this.snare(o, t, 0.85);
    if (st % 2 === 0) this.hat(o, t, st % 4 === 2 ? 0.14 : 0.1, 0.04);
    if (st === 0 || st === 10) this.bass(o, t, hz(c.r), 0.55, v.step * 5, 'sine', 400);
    // dusty loop: detuned minor keys each half bar
    if (st === 0 || st === 8) this.keys(o, t, c.r + 24, c.iv, 0.06, v.step * 7);
  }

  // ---- instruments ----
  env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  kick(dest, t, v) {
    const ctx = this.audio.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    this.env(g, t, 0.003, v, 0.3);
    o.connect(g).connect(dest); o.start(t); o.stop(t + 0.35);
  }

  noise(dest, t, v, type, f, q, dec, a = 0.002) {
    const ctx = this.audio.ctx, n = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = this.audio.noiseBuf; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    this.env(g, t, a, v, dec);
    n.connect(fl).connect(g).connect(dest);
    const off = Math.random() * 1.5;
    n.start(t, off); n.stop(t + a + dec + 0.05);
  }

  snare(dest, t, v) {
    this.noise(dest, t, v * 0.6, 'bandpass', 1800, 0.7, 0.16);
    const ctx = this.audio.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.06);
    this.env(g, t, 0.002, v * 0.4, 0.08);
    o.connect(g).connect(dest); o.start(t); o.stop(t + 0.12);
  }

  clap(dest, t, v) { for (let k = 0; k < 3; k++) this.noise(dest, t + k * 0.011, v, 'bandpass', 1300, 1.2, 0.06); }
  hat(dest, t, v, dec) { this.noise(dest, t, v, 'highpass', 8000, 0.5, dec); }
  ride(dest, t, v) { this.noise(dest, t, v, 'bandpass', 6500, 2.5, 0.35); }
  brush(dest, t, v) { this.noise(dest, t, v, 'bandpass', 2500, 0.6, 0.22, 0.03); }

  bass(dest, t, f, v, dur, type, cut) {
    const ctx = this.audio.ctx, o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(cut * 2, t); fl.frequency.exponentialRampToValueAtTime(cut * 0.5, t + dur);
    this.env(g, t, 0.006, v, dur);
    o.connect(fl).connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }

  stab(dest, t, root, iv, v, dur, type, cut, dirt = false) {
    const ctx = this.audio.ctx, fl = ctx.createBiquadFilter(), g = ctx.createGain();
    fl.type = 'lowpass'; fl.frequency.value = cut;
    this.env(g, t, 0.004, v, dur);
    let head = fl;
    if (dirt) {
      if (!this.curve) { this.curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; this.curve[i] = Math.tanh(x * 4); } }
      const ws = ctx.createWaveShaper(); ws.curve = this.curve;
      ws.connect(fl); head = ws;
    }
    fl.connect(g).connect(dest);
    for (const n of iv) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = hz(root + n); o.detune.value = (Math.random() - 0.5) * 12;
      o.connect(head); o.start(t); o.stop(t + dur + 0.05);
    }
  }

  keys(dest, t, root, iv, v, dur) {
    const ctx = this.audio.ctx, g = ctx.createGain(), trem = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    this.env(g, t, 0.01, v, dur);
    trem.gain.value = 0.8; lfo.frequency.value = 4.5; lg.gain.value = 0.2;
    lfo.connect(lg).connect(trem.gain);
    g.connect(trem).connect(dest);
    lfo.start(t); lfo.stop(t + dur + 0.05);
    for (const n of iv) {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o.type = 'sine'; o.frequency.value = hz(root + n); o.detune.value = (Math.random() - 0.5) * 8;
      o2.type = 'sine'; o2.frequency.value = hz(root + n) * 2; g2.gain.value = 0.25; // bell-ish overtone
      o.connect(g); o2.connect(g2).connect(g);
      o.start(t); o.stop(t + dur + 0.05); o2.start(t); o2.stop(t + dur + 0.05);
    }
  }
}

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
