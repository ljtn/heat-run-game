// HUD: speedo, tach, heat, damage, messages, minimap and full map
import { HALF, SIZE, CITY, SURF, NV, N, CELL, PEAKS, PARK } from './world.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(world) {
    this.world = world;
    this.el = {
      speed: $('speed'), gear: $('gear'), tach: $('tach'), heat: $('heat'), dmg: $('dmgfill'),
      msgs: $('messages'), evade: $('evade'), evadeFill: $('evadefill'), bust: $('bust'), bustFill: $('bustfill'),
      loc: $('location'), cam: $('cammode'), stats: $('stats'), chase: $('chasetime'), warn: $('wrongway'),
    };
    this.mini = $('minimap');
    this.mctx = this.mini.getContext('2d');
    this.big = $('bigmap');
    this.bctx = this.big.getContext('2d');
    this.tctx = this.el.tach.getContext('2d');
    this.mapImg = this.renderMap();
    this.msgQueue = [];
    this.locT = 0;
    this.lastLoc = '';
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('div');
      s.className = 'star';
      this.el.heat.appendChild(s);
    }
    this.stars = [...this.el.heat.children];
  }

  renderMap() {
    const S = 1024, w = this.world;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    const m = SIZE / S;
    for (let py = 0; py < S; py++) {
      const z = -HALF + (py + 0.5) * m;
      for (let px = 0; px < S; px++) {
        const x = -HALF + (px + 0.5) * m;
        const h = w.terrainHeight(x, z);
        const hx = w.terrainHeight(x + m, z) - h, hz = w.terrainHeight(x, z + m) - h;
        const shade = Math.max(0.55, Math.min(1.25, 1 - (hx * 0.6 + hz * 0.4) * 0.45));
        const gi = Math.round((z + HALF) / CELL) * NV + Math.round((x + HALF) / CELL);
        let r, g, b;
        if (h < 0.05) { const d = Math.min(1, -h / 4); r = 40 - d * 15; g = 72 - d * 20; b = 92 - d * 10; }
        else {
          const s = w.surf[gi];
          if (s === SURF.SAND) { r = 170; g = 155; b = 115; }
          else if (s === SURF.ROCK) { r = 120; g = 115; b = 108; }
          else if (s === SURF.FIELD) { r = 150; g = 135; b = 80; }
          else { const f = w.forest[gi]; r = 78 - f * 30; g = 102 - f * 25; b = 55 - f * 15; }
          r *= shade; g *= shade; b *= shade;
        }
        const k = (py * S + px) * 4;
        img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tx = (x) => ((x + HALF) / SIZE) * S;
    // city blocks + buildings
    ctx.fillStyle = '#5b5852';
    for (const blk of w.blocks) {
      ctx.fillStyle = blk.kind === 'park' ? '#4f6b3a' : blk.kind === 'res' ? '#6b7258' : '#77736b';
      ctx.fillRect(tx(blk.x0), tx(blk.z0), tx(blk.x1) - tx(blk.x0), tx(blk.z1) - tx(blk.z0));
    }
    ctx.fillStyle = '#9a958a';
    for (const b of w.buildings) ctx.fillRect(tx(b.x - b.hx), tx(b.z - b.hz), (b.hx * 2 * S) / SIZE, (b.hz * 2 * S) / SIZE);
    ctx.fillStyle = '#b39a7d';
    for (const h of w.houses) ctx.fillRect(tx(h.x) - 1.5, tx(h.z) - 1.5, 3, 3);
    // roads
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const roadCol = { city: '#2e2d2c', avenue: '#262524', highway: '#1f1f22', mountain: '#3a3734', road: '#2a2a2b', dirt: '#6e5a40', village: '#3a3938' };
    for (const pass of [0, 1]) {
      for (const e of w.edges) {
        ctx.strokeStyle = pass === 0 ? 'rgba(0,0,0,0.45)' : roadCol[e.type];
        ctx.lineWidth = ((e.width * S) / SIZE) * (pass === 0 ? 1.0 : 0.7) + (pass === 0 ? 2 : 1);
        ctx.beginPath();
        e.pts.forEach((p, i) => (i ? ctx.lineTo(tx(p.x), tx(p.z)) : ctx.moveTo(tx(p.x), tx(p.z))));
        ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(230,190,90,0.55)';
    ctx.lineWidth = 1;
    for (const e of w.edges) {
      if (e.type !== 'road' && e.type !== 'highway') continue;
      ctx.beginPath();
      e.pts.forEach((p, i) => (i ? ctx.lineTo(tx(p.x), tx(p.z)) : ctx.moveTo(tx(p.x), tx(p.z))));
      ctx.stroke();
    }
    return c;
  }

  message(text, dur = 2, cls = '', delay = 0) {
    setTimeout(() => {
      const d = document.createElement('div');
      d.className = 'msg ' + cls;
      d.textContent = text;
      this.el.msgs.appendChild(d);
      setTimeout(() => d.classList.add('out'), dur * 1000);
      setTimeout(() => d.remove(), dur * 1000 + 600);
    }, delay * 1000);
  }

  locationName(p) {
    const w = this.world;
    if (w.inCityRect(p.x, p.z, 30)) {
      const blk = w.cityBlockAt(p.x, p.z);
      if (Math.hypot(p.x - CITY.cx, p.z - CITY.cz) < 220) return 'DOWNTOWN';
      if (blk && blk.kind === 'park') return 'CITY PARK';
      if (p.x > CITY.x1 - 150) return 'RIVERSIDE';
      return 'MERIDIAN CITY';
    }
    if (Math.hypot(p.x - PARK.x, p.z - PARK.z) < PARK.r + 80) return PARK.name;
    for (const v of w.villages) if (Math.hypot(p.x - v.x, p.z - v.z) < v.r) return v.name.toUpperCase();
    for (const f of w.farms || []) if (p.x > f.x0 && p.x < f.x1 && p.z > f.z0 && p.z < f.z1) return f.name;
    for (const P of PEAKS) if (Math.hypot(p.x - P.x, p.z - P.z) < P.R * 0.85) return P.name;
    if (w.lakeBank(p.x, p.z) < 120) return 'LAKE CORVIN';
    if (w.terrainHeight(p.x, p.z) > 70) return 'HIGH RIDGE';
    if (w.sampleGrid(w.waterDist, p.x, p.z) < 60) return 'RIVER VALLEY';
    if (p.z > 300 && p.x < -300) return 'FARMLANDS';
    return 'COUNTRYSIDE';
  }

  update(dt, g) {
    const p = g.player;
    const kmh = Math.round(Math.abs(p.speed) * 3.6);
    this.el.speed.textContent = kmh;
    this.el.gear.textContent = p.gear === -1 ? 'R' : p.gear;
    this.drawTach(p.rpm / p.spec.redline);
    // heat
    const heat = g.traffic.heat;
    const lvl = Math.ceil(heat - 0.001);
    this.stars.forEach((s, i) => {
      s.classList.toggle('on', i < lvl);
      s.classList.toggle('flash', i < lvl && g.traffic.evadeT < 0.5 && heat > 0);
    });
    this.el.dmg.style.width = `${Math.min(100, p.damage * 100)}%`;
    this.el.dmg.style.background = p.damage > 0.7 ? '#e04030' : p.damage > 0.4 ? '#e0a030' : '#d8d0b0';
    const ev = heat > 0 && g.traffic.evadeT > 0.3;
    this.el.evade.style.opacity = ev ? 1 : 0;
    if (ev) this.el.evadeFill.style.width = `${Math.min(100, (g.traffic.evadeT / g.traffic.evadeLimit) * 100)}%`;
    const bt = g.traffic.bustT;
    this.el.bust.style.opacity = bt > 0.05 ? 1 : 0;
    this.el.bustFill.style.width = `${Math.min(100, (bt / 3.2) * 100)}%`;
    this.el.chase.textContent = heat > 0 ? fmtTime(g.traffic.chaseTime) : '';
    this.el.warn.style.opacity = g.traffic.wrongWay ? 1 : 0;
    // location
    this.locT -= dt;
    if (this.locT <= 0) {
      this.locT = 0.5;
      const name = this.locationName(p.pos);
      if (name !== this.lastLoc) {
        this.lastLoc = name;
        this.el.loc.textContent = name;
        this.el.loc.classList.remove('show');
        void this.el.loc.offsetWidth;
        this.el.loc.classList.add('show');
      }
    }
    this.drawMini(g);
    if (g.showMap) this.drawBig(g);
  }

  drawTach(f) {
    const ctx = this.tctx, W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.92, R = W * 0.44;
    const a0 = Math.PI * 1.05, a1 = Math.PI * 1.95;
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.stroke();
    const t = Math.max(0, Math.min(1.02, f));
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#f2d28a'); grad.addColorStop(0.75, '#f2a33a'); grad.addColorStop(1, '#ff3b2a');
    ctx.strokeStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, R, a0, a0 + (a1 - a0) * t); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,60,40,0.8)';
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.arc(cx, cy, R, a0 + (a1 - a0) * 0.9, a1); ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1;
  }

  drawMini(g) {
    const ctx = this.mctx, S = this.mini.width;
    const p = g.player;
    const scale = (S / 2) / 210; // px per metre (210 m radius)
    ctx.save();
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#1d2a22'; ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    const heading = p.heading;
    ctx.rotate(heading);
    const m = this.mapImg.width / SIZE;
    ctx.scale(scale / m, scale / m);
    ctx.drawImage(this.mapImg, -(p.pos.x + HALF) * m, -(p.pos.z + HALF) * m);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // blips
    const toScreen = (x, z) => {
      const dx = (x - p.pos.x) * scale, dz = (z - p.pos.z) * scale;
      const c = Math.cos(heading), s = Math.sin(heading);
      return [S / 2 + dx * c - dz * s, S / 2 + dx * s + dz * c];
    };
    const t = performance.now() / 1000;
    for (const d of g.traffic.drivers) {
      const [x, y] = toScreen(d.v.pos.x, d.v.pos.z);
      if (d.role === 'police') {
        const on = d.sirenOn ? (Math.floor(t * 6) % 2 ? '#ff3030' : '#3060ff') : '#7fa0ff';
        ctx.fillStyle = d.v.wrecked ? '#555' : on;
        ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(230,230,220,0.55)';
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    }
    if (g.loot) for (const it of g.loot.items) {
      const [x, y] = toScreen(it.x, it.z);
      if (Math.hypot(x - S / 2, y - S / 2) > S / 2 - 5) continue;
      ctx.fillStyle = it.gold ? '#ffd84a' : '#9be36a';
      ctx.beginPath(); ctx.arc(x, y, it.gold ? 3.4 : 2.4, 0, Math.PI * 2); ctx.fill();
    }
    for (const ws of this.world.workshops || []) {
      const [x, y] = toScreen(ws.x, ws.z);
      if (Math.hypot(x - S / 2, y - S / 2) > S / 2 - 8) continue;
      wrench(ctx, x, y, 7);
    }
    if (g.traffic.heat > 0 && g.traffic.evadeT > 0.5) {
      const [x, y] = toScreen(g.traffic.lastSeen.x, g.traffic.lastSeen.z);
      ctx.strokeStyle = 'rgba(255,80,60,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 14 + Math.sin(t * 4) * 3, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    // player arrow
    ctx.fillStyle = '#ffd04a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(S / 2, S / 2 - 9); ctx.lineTo(S / 2 + 6, S / 2 + 7); ctx.lineTo(S / 2, S / 2 + 4); ctx.lineTo(S / 2 - 6, S / 2 + 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.stroke();
  }

  drawBig(g) {
    const ctx = this.bctx, S = this.big.width;
    ctx.drawImage(this.mapImg, 0, 0, S, S);
    const tx = (x) => ((x + HALF) / SIZE) * S;
    ctx.font = 'bold 15px "Oswald", sans-serif';
    ctx.fillStyle = 'rgba(255,240,210,0.9)';
    ctx.textAlign = 'center';
    ctx.fillText('MERIDIAN CITY', tx(CITY.cx), tx(CITY.z0) - 14);
    for (const v of this.world.villages) ctx.fillText(v.name.toUpperCase(), tx(v.x), tx(v.z) - 18);
    ctx.save(); ctx.font = '600 13px Oswald, sans-serif'; ctx.fillStyle = '#e8d6a0';
    for (const f of this.world.farms || []) { ctx.fillText('🐑 ' + f.name, tx(f.cx), tx(f.cz)); }
    ctx.fillStyle = 'rgba(240,236,220,0.9)';
    for (const p of this.world.paddocks || []) { ctx.beginPath(); ctx.arc(tx(p.cx), tx(p.cz), 2.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    ctx.fillText('LAKE CORVIN', tx(640), tx(1090));
    for (const ws of this.world.workshops || []) wrench(ctx, tx(ws.x), tx(ws.z), 9);
    for (const d of g.traffic.drivers) {
      if (d.role !== 'police') continue;
      ctx.fillStyle = d.sirenOn ? '#ff4040' : '#7fa0ff';
      ctx.beginPath(); ctx.arc(tx(d.v.pos.x), tx(d.v.pos.z), 4, 0, 7); ctx.fill();
    }
    const p = g.player;
    ctx.save();
    ctx.translate(tx(p.pos.x), tx(p.pos.z));
    ctx.rotate(-p.heading);
    ctx.fillStyle = '#ffd04a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

// repair-workshop marker: yellow disc with a dark spanner
function wrench(ctx, x, y, r) {
  ctx.save();
  ctx.fillStyle = '#ffd23c'; ctx.strokeStyle = '#1b2a3a'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.translate(x, y); ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = '#1b2a3a';
  ctx.fillRect(-r * 0.15, -r * 0.55, r * 0.3, r * 1.15);
  ctx.beginPath(); ctx.arc(0, -r * 0.55, r * 0.32, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd23c'; ctx.fillRect(-r * 0.1, -r * 0.95, r * 0.2, r * 0.4);
  ctx.restore();
}

export function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
