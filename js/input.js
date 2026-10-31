// Keyboard + gamepad input with analogue-style smoothing for keys
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.steer = 0; this.throttle = 0; this.brake = 0; this.handbrake = 0;
    this.lookBack = false; this.horn = false;
    this.mouse = { dx: 0, dy: 0, down: false };
    this.usingPad = false;
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.usingPad = false;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousedown', (e) => { if (e.button === 2 || e.button === 0) this.mouse.down = true; });
    addEventListener('mouseup', () => (this.mouse.down = false));
    addEventListener('mousemove', (e) => { if (this.mouse.down) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; } });
    addEventListener('contextmenu', (e) => e.preventDefault());
    this.padPrev = [];
    this.touch = { on: false, steer: 0, gas: 0, brake: 0, hb: 0, horn: 0 };
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (this.isTouch) this.setupTouch();
  }

  // on-screen controls: drag anywhere on the left to steer, pedals and buttons on the right
  setupTouch() {
    document.body.classList.add('touch');
    const T = this.touch, el = (id) => document.getElementById(id);
    const zone = el('steerzone'), knob = el('steerknob'), bar = el('steerbar'), hint = el('steerhint');
    let sid = null, sx = 0;
    const R = 75; // pixels of drag for full lock
    const show = (x0, x, y) => {
      knob.style.display = bar.style.display = 'block';
      knob.style.left = x + 'px'; knob.style.top = y + 'px';
      bar.style.left = Math.min(x0, x) + 'px'; bar.style.width = Math.abs(x - x0) + 'px'; bar.style.top = y + 'px';
    };
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (sid !== null) return;
      const t = e.changedTouches[0]; sid = t.identifier; sx = t.clientX; T.on = true;
      hint.style.display = 'none';
      show(sx, sx, t.clientY);
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === sid) {
        T.steer = Math.max(-1, Math.min(1, (t.clientX - sx) / R));
        show(sx, sx + T.steer * R, t.clientY);
      }
    }, { passive: false });
    const endSteer = (e) => { for (const t of e.changedTouches) if (t.identifier === sid) { sid = null; T.steer = 0; knob.style.display = bar.style.display = 'none'; } };
    zone.addEventListener('touchend', endSteer); zone.addEventListener('touchcancel', endSteer);
    // hold buttons
    const hold = (id, key) => {
      const b = el(id);
      const on = (e) => { e.preventDefault(); T[key] = 1; T.on = true; b.classList.add('down'); };
      const off = (e) => { e.preventDefault(); T[key] = 0; b.classList.remove('down'); };
      b.addEventListener('touchstart', on, { passive: false }); b.addEventListener('touchend', off); b.addEventListener('touchcancel', off);
    };
    hold('t-gas', 'gas'); hold('t-brake', 'brake'); hold('t-hb', 'hb'); hold('t-horn', 'horn');
    // tap buttons map onto the keyboard shortcuts
    const tap = (id, code) => {
      const b = el(id);
      b.addEventListener('touchstart', (e) => { e.preventDefault(); this.pressed.add(code); b.classList.add('down'); }, { passive: false });
      b.addEventListener('touchend', () => b.classList.remove('down'));
    };
    tap('t-pause', 'Escape'); tap('t-cam', 'KeyC'); tap('t-map', 'KeyM'); tap('t-reset', 'KeyR');
  }

  was(code) { return this.pressed.has(code); }
  down(...codes) { return codes.some((c) => this.keys.has(c)); }

  update(dt, speed) {
    const k = this.keys;
    let tgtSteer = 0;
    if (this.down('KeyA', 'ArrowLeft')) tgtSteer -= 1;
    if (this.down('KeyD', 'ArrowRight')) tgtSteer += 1;
    const thr = this.down('KeyW', 'ArrowUp') ? 1 : 0;
    const brk = this.down('KeyS', 'ArrowDown') ? 1 : 0;
    const hb = this.down('Space') ? 1 : 0;
    // keyboard steering ramps like a real wheel: slower at speed, quick to centre
    const rateIn = 3.0 / (1 + speed * 0.02), rateOut = 5.5;
    const sameDir = tgtSteer !== 0 && Math.sign(tgtSteer) === Math.sign(this.steer);
    const rate = tgtSteer === 0 ? rateOut : sameDir ? rateIn : rateOut + rateIn;
    const d = tgtSteer - this.steer;
    this.steer += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    this.throttle += (thr - this.throttle) * Math.min(1, dt * (thr > this.throttle ? 7 : 12));
    this.brake += (brk - this.brake) * Math.min(1, dt * (brk > this.brake ? 9 : 14));
    this.handbrake = hb;
    this.lookBack = this.down('KeyB', 'KeyQ');
    this.horn = this.down('KeyH');

    // touch controls override when in use
    if (this.touch.on) {
      const T = this.touch;
      const sp = 1 / (1 + speed * 0.012); // a little less lock at speed so it isn't twitchy
      this.steer += (T.steer * sp - this.steer) * Math.min(1, dt * 12);
      this.throttle += (T.gas - this.throttle) * Math.min(1, dt * 8);
      this.brake += (T.brake - this.brake) * Math.min(1, dt * 10);
      this.handbrake = T.hb;
      if (T.horn) this.horn = true;
      return;
    }

    // gamepad overrides when active
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0;
      const rt = p.buttons[7] ? p.buttons[7].value : 0;
      const lt = p.buttons[6] ? p.buttons[6].value : 0;
      const any = Math.abs(ax) > 0.15 || rt > 0.05 || lt > 0.05 || p.buttons.some((b) => b && b.pressed);
      if (any) this.usingPad = true;
      if (!this.usingPad) break;
      const dz = 0.08;
      const s = Math.abs(ax) < dz ? 0 : Math.sign(ax) * ((Math.abs(ax) - dz) / (1 - dz));
      this.steer = Math.sign(s) * Math.pow(Math.abs(s), 1.6);
      this.throttle = rt;
      this.brake = lt;
      this.handbrake = p.buttons[0]?.pressed || p.buttons[1]?.pressed ? 1 : 0;
      this.lookBack = !!p.buttons[4]?.pressed;
      this.horn = !!p.buttons[10]?.pressed || !!p.buttons[2]?.pressed;
      const edge = (i, code) => { const b = !!p.buttons[i]?.pressed; if (b && !this.padPrev[i]) this.pressed.add(code); this.padPrev[i] = b; };
      edge(3, 'KeyC'); edge(9, 'Escape'); edge(8, 'KeyR'); edge(5, 'KeyM');
      break;
    }
  }

  endFrame() { this.pressed.clear(); }
}
