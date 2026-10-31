// Fully synthesised audio: engines, tyres, wind, sirens, crashes, horn.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.muted = false;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    // noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.player = null;
    this.other = null;
    this.otherPan = ctx.createStereoPanner();
    this.otherPan.connect(this.master);
    ctx.audioWorklet.addModule(new URL('./engineWorklet.js', import.meta.url)).then(() => {
      this.player = this.makeEngine('v8', this.master);
      this.others = {
        v8: this.makeEngine('v8', this.otherPan),
        i4: this.makeEngine('i4', this.otherPan),
        i6: this.makeEngine('i6', this.otherPan),
      };
    }).catch((e) => console.warn('engine worklet failed', e));
    // recorded crashes (CC0, Freesound: magnuswaker #592388, qubodup #151624 / #332056, JoMungus #726486)
    this.crashBufs = {};
    for (const k of ['fast', 'clank', 'metal', 'glass']) {
      fetch(new URL(`../sounds/crash_${k}.mp3`, import.meta.url)).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b))
        .then((buf) => { this.crashBufs[k] = buf; }).catch((e) => console.warn('crash sample failed', k, e));
    }
    this.lastCrash = 0;
    // recorded tyre squeal (CC0, Freesound #850041 by JeffPearson), looped; rate & gain follow slip
    fetch(new URL('../sounds/squeal_loop.wav', import.meta.url))
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => {
        const src = ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        const g = ctx.createGain(); g.gain.value = 0;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000;
        src.connect(lp).connect(g).connect(this.master);
        src.start(0, Math.random() * buf.duration);
        this.squeal = { src, g, lp };
      })
      .catch((e) => console.warn('squeal sample failed', e));
    // tyres
    this.rumble = this.noiseVoice([['lowpass', 260, 0.7]], 0);
    this.wind = this.noiseVoice([['highpass', 400, 0.5], ['lowpass', 2600, 0.5]], 0);
    this.scrape = this.noiseVoice([['bandpass', 2600, 3]], 0);
    this.water = this.noiseVoice([['lowpass', 700, 1]], 0);
    this.rainV = this.noiseVoice([['highpass', 900, 0.5], ['lowpass', 7000, 0.4]], 0);
    // sirens
    this.sirens = [0, 1].map((k) => {
      const o = ctx.createOscillator();
      o.type = 'square';
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 2200;
      const g = ctx.createGain(); g.gain.value = 0;
      const p = ctx.createStereoPanner();
      o.connect(f).connect(g).connect(p).connect(this.master);
      o.start();
      return { o, g, p, phase: k * 1.7 };
    });
    // horn
    this.hornG = ctx.createGain(); this.hornG.gain.value = 0;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 1800;
    for (const fr of [392, 494]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr;
      o.connect(hf); o.start();
    }
    hf.connect(this.hornG).connect(this.master);
    this.enabled = true;
  }

  // loot pickup: bright little arpeggio (longer and shinier for gold)
  pickup(gold) {
    if (!this.enabled || this.muted) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.01;
    const notes = gold ? [784, 988, 1175, 1568] : [880, 1319];
    notes.forEach((f, k) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + k * 0.06); g.gain.linearRampToValueAtTime(0.13, t0 + k * 0.06 + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t0 + k * 0.06 + 0.35);
      o.connect(g).connect(this.master); o.start(t0 + k * 0.06); o.stop(t0 + k * 0.06 + 0.4);
    });
  }

  // banking the haul: cash-register drawer + bell
  bank() {
    if (!this.enabled || this.muted) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.01;
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = this.noiseBuf; f.type = 'bandpass'; f.frequency.value = 2500; f.Q.value = 1.5;
    g.gain.setValueAtTime(0.25, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
    n.connect(f).connect(g).connect(this.master); n.start(t0); n.stop(t0 + 0.2);
    for (const [fr, d] of [[2093, 0.12], [2637, 0.12]]) {
      const o = ctx.createOscillator(), gg = ctx.createGain();
      o.type = 'sine'; o.frequency.value = fr;
      gg.gain.setValueAtTime(0, t0 + d); gg.gain.linearRampToValueAtTime(0.16, t0 + d + 0.005); gg.gain.exponentialRampToValueAtTime(0.001, t0 + d + 1.2);
      o.connect(gg).connect(this.master); o.start(t0 + d); o.stop(t0 + d + 1.3);
    }
  }

  // another driver leaning on the horn: one or two blasts, placed in the stereo field, quieter with distance
  aiHorn(pan, vol) {
    if (!this.enabled || this.muted || vol < 0.02) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.02;
    const base = [330, 370, 415, 440][Math.floor(Math.random() * 4)];
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400 + vol * 1200;
    f.connect(p).connect(this.master);
    const blasts = Math.random() < 0.45 ? [[0, 0.16], [0.24, 0.5]] : [[0, 0.35 + Math.random() * 0.5]];
    for (const [st, len] of blasts) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(f);
      g.gain.setValueAtTime(0, t0 + st); g.gain.linearRampToValueAtTime(0.09 * vol, t0 + st + 0.015);
      g.gain.setValueAtTime(0.09 * vol, t0 + st + len); g.gain.linearRampToValueAtTime(0, t0 + st + len + 0.04);
      for (const fr of [base, base * 1.26]) {
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr;
        o.connect(g); o.start(t0 + st); o.stop(t0 + st + len + 0.08);
      }
    }
  }

  makeEngine(layout, dest) {
    const node = new AudioWorkletNode(this.ctx, 'engine-synth', { outputChannelCount: [1], processorOptions: { layout } });
    // cabin/exhaust colouring: a gentle low shelf and presence dip
    const shelf = this.ctx.createBiquadFilter();
    shelf.type = 'lowshelf'; shelf.frequency.value = 180; shelf.gain.value = 5;
    const peak = this.ctx.createBiquadFilter();
    peak.type = 'peaking'; peak.frequency.value = 2400; peak.Q.value = 0.8; peak.gain.value = -6;
    node.connect(shelf).connect(peak).connect(dest);
    return { node, rpm: node.parameters.get('rpm'), thr: node.parameters.get('throttle'), gain: node.parameters.get('gain') };
  }

  noiseVoice(filters, gain) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    let node = src;
    const fs = [];
    for (const [type, f, q] of filters) {
      const b = ctx.createBiquadFilter();
      b.type = type; b.frequency.value = f; b.Q.value = q;
      node.connect(b); node = b; fs.push(b);
    }
    const g = ctx.createGain(); g.gain.value = gain;
    node.connect(g).connect(this.master);
    src.start();
    return { g, fs, src };
  }

  setEngine(e, rpm, throttle, load, vol) {
    if (!e) return;
    const t = this.ctx.currentTime;
    e.rpm.setTargetAtTime(rpm, t, 0.015);
    e.thr.setTargetAtTime(throttle, t, 0.03);
    e.gain.setTargetAtTime(vol * (0.5 + throttle * 0.35 + load * 0.15), t, 0.04);
  }

  update(dt, s) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.7, t, 0.05);
    this.setEngine(this.player, s.rpm, s.throttle, s.load, 1);
    if (this.others) {
      for (const k in this.others) {
        const on = s.other && s.other.layout === k;
        if (on) this.setEngine(this.others[k], s.other.rpm, s.other.throttle, 0, Math.min(1, 10 / Math.max(6, s.other.dist)) * 0.7);
        else this.others[k].gain.setTargetAtTime(0, t, 0.1);
      }
      if (s.other) this.otherPan.pan.setTargetAtTime(s.other.pan, t, 0.05);
    }
    if (this.squeal) {
      // screech: summed slip of paved tyres; pitch: how fast the rubber is sliding vs locked
      const amt = Math.min(1, Math.max(0, (s.screech - 1) / 14));
      this.squeal.g.gain.setTargetAtTime(Math.pow(amt, 0.9) * 0.55, t, amt > 0.02 ? 0.05 : 0.15);
      // locked skids sit lower and duller; hard cornering squeals higher and brighter
      const rate = s.locked ? 0.86 : Math.min(1.25, 0.95 + s.screech * 0.015);
      this.squeal.src.playbackRate.setTargetAtTime(rate, t, 0.25);
      this.squeal.lp.frequency.setTargetAtTime(s.locked ? 3200 : 6000, t, 0.2);
    }
    this.rumble.g.gain.setTargetAtTime(Math.min(0.5, s.offroad * 0.02), t, 0.05);
    this.wind.g.gain.setTargetAtTime(Math.min(0.22, s.speed * s.speed * 0.00008), t, 0.1);
    this.scrape.g.gain.setTargetAtTime(Math.min(0.3, s.scrape * 0.05), t, 0.03);
    this.water.g.gain.setTargetAtTime(s.water > 0 ? Math.min(0.5, 0.1 + s.speed * 0.03) : 0, t, 0.05);
    this.hornG.gain.setTargetAtTime(s.horn ? 0.12 : 0, t, 0.01);
    this.rainV.g.gain.setTargetAtTime((s.rain || 0) * 0.16, t, 0.5);
    // sirens: wail / yelp
    for (let i = 0; i < 2; i++) {
      const sv = this.sirens[i], src = s.sirens[i];
      if (!src) { sv.g.gain.setTargetAtTime(0, t, 0.2); continue; }
      sv.phase += dt;
      const yelp = src.dist < 60;
      const ph = yelp ? sv.phase * 3.2 : sv.phase * 0.55;
      const tri = Math.abs(((ph % 1) + 1) % 1 * 2 - 1);
      const f = yelp ? 700 + tri * 650 : 620 + tri * 820;
      sv.o.frequency.setTargetAtTime(f, t, 0.015);
      sv.g.gain.setTargetAtTime(Math.min(0.13, 9 / Math.max(10, src.dist)) * 0.9, t, 0.08);
      sv.p.pan.setTargetAtTime(src.pan, t, 0.08);
    }
  }

  playBuf(buf, gain, rate, when, offset = 0) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(g).connect(this.master);
    src.start(when, offset);
  }

  crash(intensity) {
    if (!this.enabled || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const I = Math.min(1, intensity);
    // don't machine-gun samples during a long scrape
    if (t - this.lastCrash < 0.09 && I < 0.6) return;
    this.lastCrash = t;
    const B = this.crashBufs;
    const rate = 0.88 + Math.random() * 0.24;
    if (I > 0.62 && B.glass) {
      this.playBuf(B.glass, 0.5 + I * 0.5, rate, t);
      if (B.metal) this.playBuf(B.metal, 0.35 * I, rate * 0.95, t);
    } else if (I > 0.3 && (B.metal || B.clank)) {
      if (B.metal && Math.random() < 0.6) this.playBuf(B.metal, 0.3 + I * 0.6, rate, t);
      else this.playBuf(B.clank, 0.35 + I * 0.6, rate, t);
    } else if (B.fast || B.clank) {
      this.playBuf(Math.random() < 0.5 && B.fast ? B.fast : B.clank || B.fast, 0.15 + I * 1.2, rate * 1.05, t);
    } else return this.synthCrash(I);
    // body weight: a short low thump under the recording
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(85, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.6 * I, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(og).connect(this.master); o.start(t); o.stop(t + 0.35);
  }

  glass(gain = 1) {
    if (!this.enabled || this.muted || !this.crashBufs.glass) return;
    const t = this.ctx.currentTime;
    // skip the first thump of the crash recording so mostly the shattering glass remains
    this.playBuf(this.crashBufs.glass, 0.75 * gain, 1.15 + Math.random() * 0.15, t, 0.25);
  }

  synthCrash(intensity) {
    const ctx = this.ctx, t = ctx.currentTime;
    const I = Math.min(1, intensity);
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.6 + Math.random() * 0.3;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3500 * (0.4 + I), t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9 * I, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35 + I * 0.5);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t, Math.random()); src.stop(t + 1.2);
    // thump
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.3);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.9 * I, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(og).connect(this.master); o.start(t); o.stop(t + 0.4);
    // metal clank
    if (I > 0.25) {
      const m = ctx.createOscillator(); m.type = 'square';
      m.frequency.setValueAtTime(380 + Math.random() * 300, t);
      const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 2200; bf.Q.value = 8;
      const mg = ctx.createGain(); mg.gain.setValueAtTime(0.25 * I, t); mg.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      m.connect(bf).connect(mg).connect(this.master); m.start(t); m.stop(t + 0.3);
    }
  }

  splash() {
    if (!this.enabled || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    src.connect(bp).connect(g).connect(this.master); src.start(t); src.stop(t + 1.1);
  }
}
