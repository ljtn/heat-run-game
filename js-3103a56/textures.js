// Procedural canvas textures
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function speckle(ctx, w, h, n, rnd, colorFn) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colorFn(rnd());
    const s = rnd() < 0.9 ? 1 : 2;
    ctx.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), s, s);
  }
}

// grayscale-ish detail texture multiplied over terrain vertex colours
export function grassDetail() {
  const [c, ctx] = canvas(512, 512);
  const r = mulberry32(11);
  ctx.fillStyle = '#b8b8b8';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26000; i++) {
    const v = 150 + Math.floor(r() * 105);
    ctx.strokeStyle = `rgba(${v},${v + 8},${v - 10},${0.35 + r() * 0.4})`;
    const x = r() * 512, y = r() * 512;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 5);
    ctx.stroke();
  }
  speckle(ctx, 512, 512, 6000, r, (v) => `rgba(90,85,70,${0.3 + v * 0.3})`);
  return tex(c);
}

function asphaltBase(ctx, w, h, r, base = 58) {
  ctx.fillStyle = `rgb(${base},${base},${base + 3})`;
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, w * h * 0.25, r, (v) => {
    const g = base - 18 + Math.floor(v * 40);
    return `rgb(${g},${g},${g + 2})`;
  });
  // patches & cracks
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = `rgba(${r() < 0.5 ? 30 : 80},${r() < 0.5 ? 30 : 80},${r() < 0.5 ? 34 : 82},0.12)`;
    ctx.beginPath();
    ctx.ellipse(r() * w, r() * h, 10 + r() * 40, 10 + r() * 60, r() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(25,25,25,0.35)';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    let x = r() * w, y = r() * h;
    ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 14; y += r() * 14; ctx.lineTo(x, y); }
    ctx.stroke();
  }
}

// road strip: u across (0..1), v along (one tile = 8m)
export function roadTexture(kind) {
  const W = 256, H = 512;
  const [c, ctx] = canvas(W, H);
  const r = mulberry32(kind.length * 7 + 3);
  if (kind === 'dirt') {
    ctx.fillStyle = '#7a6448';
    ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 40000, r, (v) => {
      const g = 80 + Math.floor(v * 70);
      return `rgb(${g + 25},${g + 5},${g - 20})`;
    });
    // wheel ruts
    for (const u of [0.3, 0.7]) {
      const g = ctx.createLinearGradient(W * (u - 0.08), 0, W * (u + 0.08), 0);
      g.addColorStop(0, 'rgba(60,45,30,0)');
      g.addColorStop(0.5, 'rgba(60,45,30,0.45)');
      g.addColorStop(1, 'rgba(60,45,30,0)');
      ctx.fillStyle = g;
      ctx.fillRect(W * (u - 0.08), 0, W * 0.16, H);
    }
    // soft edge alpha
    const img = ctx.getImageData(0, 0, W, H);
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1);
      const e = Math.min(u, 1 - u);
      const a = Math.min(1, e / 0.12);
      for (let y = 0; y < H; y++) img.data[(y * W + x) * 4 + 3] = Math.floor(255 * a * (0.85 + 0.15 * r()));
    }
    ctx.putImageData(img, 0, 0);
    return tex(c);
  }
  asphaltBase(ctx, W, H, r, kind === 'city' ? 62 : 55);
  const shoulder = kind === 'road' ? 0.1 : kind === 'highway' ? 0.09 : kind === 'village' ? 0.08 : 0;
  if (shoulder > 0) {
    // gravel shoulders fading out
    const img = ctx.getImageData(0, 0, W, H);
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1);
      const e = Math.min(u, 1 - u);
      if (e > shoulder) continue;
      const a = Math.min(1, e / (shoulder * 0.7));
      for (let y = 0; y < H; y++) {
        const k = (y * W + x) * 4;
        const g = 95 + r() * 60;
        img.data[k] = g + 12; img.data[k + 1] = g + 4; img.data[k + 2] = g - 8;
        img.data[k + 3] = Math.floor(255 * a);
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const line = (u, wPx, color, dash) => {
    ctx.fillStyle = color;
    if (!dash) ctx.fillRect(u * W - wPx / 2, 0, wPx, H);
    else ctx.fillRect(u * W - wPx / 2, 0, wPx, H * dash);
  };
  if (kind === 'avenue') {
    // four lanes: double yellow centre, dashed lane dividers, edge lines
    line(0.5 - 0.01, 4, 'rgba(214,170,40,0.9)');
    line(0.5 + 0.01, 4, 'rgba(214,170,40,0.9)');
    line(0.5 - 0.23, 4, 'rgba(232,232,225,0.8)', 0.4);
    line(0.5 + 0.23, 4, 'rgba(232,232,225,0.8)', 0.4);
    line(0.07, 4, 'rgba(225,225,215,0.75)');
    line(0.93, 4, 'rgba(225,225,215,0.75)');
  } else if (kind === 'city') {
    line(0.5 - 0.012, 4, 'rgba(214,170,40,0.9)');
    line(0.5 + 0.012, 4, 'rgba(214,170,40,0.9)');
    line(0.08, 4, 'rgba(225,225,215,0.75)');
    line(0.92, 4, 'rgba(225,225,215,0.75)');
  } else if (kind === 'highway') {
    // 2+2 lanes: double yellow median, dashed lane lines, solid edge lines (u spans road + shoulders)
    const span = 1 - 2 * shoulder, at = (m) => 0.5 + (m / 11) * (span / 2);
    line(at(-0.25), 4, 'rgba(225,185,50,0.9)');
    line(at(0.25), 4, 'rgba(225,185,50,0.9)');
    line(at(-4.65), 4, 'rgba(232,232,225,0.85)', 0.35);
    line(at(4.65), 4, 'rgba(232,232,225,0.85)', 0.35);
    line(at(-8.3), 5, 'rgba(232,232,225,0.88)');
    line(at(8.3), 5, 'rgba(232,232,225,0.88)');
  } else if (kind === 'road') {
    line(0.5, 5, 'rgba(225,185,50,0.88)', 0.4);
    line(shoulder + 0.03, 5, 'rgba(232,232,225,0.85)');
    line(1 - shoulder - 0.03, 5, 'rgba(232,232,225,0.85)');
  } else {
    line(0.5, 4, 'rgba(225,225,215,0.6)', 0.35);
  }
  // wear on the line paint
  speckle(ctx, W, H, 9000, r, (v) => `rgba(50,50,52,${v * 0.5})`);
  return tex(c);
}

export function intersectionTexture() {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const r = mulberry32(99);
  asphaltBase(ctx, S, S, r, 62);
  ctx.fillStyle = 'rgba(230,230,222,0.8)';
  // zebra crossings on all four sides
  const n = 9, band = S * 0.13;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const w = S * 0.045;
    ctx.fillRect(S * 0.08 + t * S * 0.84 - w / 2, 0, w, band);
    ctx.fillRect(S * 0.08 + t * S * 0.84 - w / 2, S - band, w, band);
    ctx.fillRect(0, S * 0.08 + t * S * 0.84 - w / 2, band, w);
    ctx.fillRect(S - band, S * 0.08 + t * S * 0.84 - w / 2, band, w);
  }
  speckle(ctx, S, S, 12000, r, (v) => `rgba(50,50,52,${v * 0.5})`);
  return tex(c, { repeat: false });
}

export function sidewalkTexture() {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const r = mulberry32(5);
  ctx.fillStyle = '#9d9a93';
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, S, 16000, r, (v) => {
    const g = 130 + Math.floor(v * 50);
    return `rgb(${g},${g - 2},${g - 6})`;
  });
  ctx.strokeStyle = 'rgba(60,58,55,0.55)';
  ctx.lineWidth = 2;
  for (let k = 0; k <= 4; k++) {
    ctx.beginPath(); ctx.moveTo(0, (k * S) / 4); ctx.lineTo(S, (k * S) / 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo((k * S) / 4, 0); ctx.lineTo((k * S) / 4, S); ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(70,65,60,${0.08 + r() * 0.1})`;
    ctx.beginPath(); ctx.ellipse(r() * S, r() * S, 8 + r() * 20, 6 + r() * 14, r() * 3, 0, 6.3); ctx.fill();
  }
  return tex(c);
}

export function roofTexture() {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const r = mulberry32(8);
  ctx.fillStyle = '#5b5a58';
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, S, 30000, r, (v) => {
    const g = 60 + Math.floor(v * 60);
    return `rgb(${g},${g},${g - 3})`;
  });
  return tex(c);
}

// building facades: 8 window columns x 8 floors per tile; returns {map, emissive}
const FACADES = [
  { wall: [168, 160, 148], win: [40, 52, 64], frame: [220, 214, 200], style: 'punched' }, // stone
  { wall: [128, 62, 48], win: [36, 40, 48], frame: [210, 200, 185], style: 'punched' }, // brick
  { wall: [70, 86, 98], win: [52, 82, 104], frame: [120, 135, 145], style: 'curtain' }, // glass tower
  { wall: [150, 150, 152], win: [38, 44, 52], frame: [100, 100, 104], style: 'bands' }, // concrete
  { wall: [196, 178, 140], win: [44, 50, 58], frame: [235, 225, 205], style: 'punched' }, // sandstone
  { wall: [92, 44, 36], win: [30, 34, 40], frame: [190, 178, 160], style: 'arched' }, // dark brick, arched windows
  { wall: [212, 196, 168], win: [40, 46, 54], frame: [150, 120, 70], style: 'deco' }, // art-deco piers
  { wall: [222, 222, 216], win: [46, 70, 84], frame: [90, 96, 100], style: 'ribbon' }, // 60s white ribbon windows
  { wall: [140, 70, 52], win: [56, 66, 70], frame: [52, 56, 58], style: 'industrial' }, // warehouse, steel multi-pane
  { wall: [206, 168, 140], win: [44, 52, 60], frame: [240, 236, 228], style: 'balcony' }, // apartments with balconies
  { wall: [176, 196, 186], win: [36, 46, 52], frame: [70, 104, 90], style: 'shutters' }, // pastel with green shutters
  { wall: [60, 92, 88], win: [40, 92, 96], frame: [100, 130, 130], style: 'curtain' }, // green-tinted glass tower
];
export const FACADE_COUNT = FACADES.length;
export const FACADE_GLASS = FACADES.map((f) => f.style === 'curtain');

export function facadeTextures(variant) {
  const F = FACADES[variant];
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const [ce, cte] = canvas(S, S);
  const r = mulberry32(variant * 31 + 17);
  const rgb = (a, m = 1) => `rgb(${Math.min(255, a[0] * m) | 0},${Math.min(255, a[1] * m) | 0},${Math.min(255, a[2] * m) | 0})`;
  ctx.fillStyle = rgb(F.wall);
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, S, 22000, r, (v) => `rgba(${v < 0.5 ? 0 : 255},${v < 0.5 ? 0 : 255},${v < 0.5 ? 0 : 255},0.05)`);
  cte.fillStyle = '#000';
  cte.fillRect(0, 0, S, S);
  const cols = 8, rows = 8, cw = S / cols, rh = S / rows;
  const warm = ['#ffd9a0', '#ffe7c0', '#fff1d8', '#ffc98a', '#cfe4ff'];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let wx, wy, ww, wh;
      if (F.style === 'curtain') { wx = x * cw + 1; wy = y * rh + 3; ww = cw - 2; wh = rh - 6; }
      else if (F.style === 'bands' || F.style === 'ribbon') { wx = x * cw; wy = y * rh + rh * 0.3; ww = cw; wh = rh * (F.style === 'ribbon' ? 0.42 : 0.5); }
      else if (F.style === 'industrial') { wx = x * cw + cw * 0.1; wy = y * rh + rh * 0.14; ww = cw * 0.8; wh = rh * 0.7; }
      else if (F.style === 'deco') { wx = x * cw + cw * 0.3; wy = y * rh + rh * 0.16; ww = cw * 0.4; wh = rh * 0.7; }
      else { wx = x * cw + cw * 0.22; wy = y * rh + rh * 0.2; ww = cw * 0.56; wh = rh * 0.58; }
      ctx.fillStyle = rgb(F.frame);
      if (F.style === 'punched' || F.style === 'balcony') ctx.fillRect(wx - 3, wy - 3, ww + 6, wh + 7);
      if (F.style === 'arched') { ctx.beginPath(); ctx.arc(wx + ww / 2, wy + ww / 2, ww / 2 + 4, Math.PI, 0); ctx.lineTo(wx + ww + 4, wy + wh + 4); ctx.lineTo(wx - 4, wy + wh + 4); ctx.fill(); }
      const g = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
      const shade = 0.8 + r() * 0.5;
      g.addColorStop(0, rgb(F.win, shade * 1.5));
      g.addColorStop(1, rgb(F.win, shade * 0.8));
      ctx.fillStyle = g;
      if (F.style === 'arched') { ctx.beginPath(); ctx.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0); ctx.lineTo(wx + ww, wy + wh); ctx.lineTo(wx, wy + wh); ctx.fill(); }
      else ctx.fillRect(wx, wy, ww, wh);
      if (F.style === 'industrial') {
        // steel glazing bars
        ctx.fillStyle = rgb(F.frame);
        for (let k = 1; k < 4; k++) ctx.fillRect(wx + (ww * k) / 4 - 1, wy, 2, wh);
        for (let k = 1; k < 3; k++) ctx.fillRect(wx, wy + (wh * k) / 3 - 1, ww, 2);
        if (r() < 0.12) { ctx.fillStyle = 'rgba(20,20,20,0.7)'; ctx.fillRect(wx + ww * 0.5, wy + wh * 0.34, ww / 4, wh / 3); } // a broken pane
      } else if (F.style === 'shutters') {
        ctx.fillStyle = rgb(F.frame);
        ctx.fillRect(wx - ww * 0.3, wy, ww * 0.26, wh); ctx.fillRect(wx + ww * 1.04, wy, ww * 0.26, wh);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        for (let k = 0; k < wh; k += 4) { ctx.fillRect(wx - ww * 0.3, wy + k, ww * 0.26, 1); ctx.fillRect(wx + ww * 1.04, wy + k, ww * 0.26, 1); }
      } else if (F.style === 'balcony' && y % 2 === 0 && x % 2 === 0) {
        // balcony slab and railing spanning two windows
        ctx.fillStyle = rgb(F.wall, 0.7); ctx.fillRect(x * cw + 4, wy + wh + 2, cw * 2 - 8, 5);
        ctx.fillStyle = 'rgba(40,40,40,0.8)'; ctx.fillRect(x * cw + 4, wy + wh * 0.62, cw * 2 - 8, 2);
        for (let k = 6; k < cw * 2 - 8; k += 6) ctx.fillRect(x * cw + 2 + k, wy + wh * 0.62, 1, wh * 0.38 + 2);
      }
      if (F.style === 'curtain' || F.style === 'industrial') {
        if (F.style === 'curtain') { ctx.fillStyle = 'rgba(200,220,235,0.15)'; ctx.fillRect(wx, wy, ww * 0.4, wh); }
      } else if (F.style !== 'curtain') {
        ctx.fillStyle = rgb(F.frame, 0.9);
        ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      } else {
        ctx.fillStyle = 'rgba(200,220,235,0.15)';
        ctx.fillRect(wx, wy, ww * 0.4, wh);
      }
      if (r() < 0.38) {
        cte.fillStyle = warm[Math.floor(r() * warm.length)];
        cte.globalAlpha = 0.5 + r() * 0.5;
        cte.fillRect(wx + 1, wy + 1, ww - 2, wh - 2);
        // blinds / silhouettes
        cte.fillStyle = '#000';
        cte.globalAlpha = 0.3;
        if (r() < 0.5) cte.fillRect(wx + 1, wy + 1, ww - 2, wh * (0.2 + r() * 0.4));
        cte.globalAlpha = 1;
      }
    }
    if (F.style === 'bands' || F.style === 'ribbon') {
      ctx.fillStyle = rgb(F.wall, 0.85);
      ctx.fillRect(0, y * rh + rh * 0.8, S, 3);
    }
    if (F.style === 'deco') {
      // vertical piers running up the face, with a cornice band every other floor
      ctx.fillStyle = rgb(F.wall, 1.08);
      for (let x = 0; x < cols; x++) ctx.fillRect(x * cw + cw * 0.08, y * rh, cw * 0.14, rh);
      if (y % 2 === 0) { ctx.fillStyle = rgb(F.frame); ctx.fillRect(0, y * rh, S, 3); }
    }
  }
  // grime streaks
  for (let i = 0; i < 40; i++) {
    const x = r() * S;
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, 'rgba(20,20,20,0.12)');
    g.addColorStop(1, 'rgba(20,20,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 2 + r() * 6, S * r());
  }
  return { map: tex(c), emissive: tex(ce) };
}

// dressed stone blocks with mortar joints, for tunnel portals
export function stoneBlockTexture() {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const r = mulberry32(404);
  ctx.fillStyle = '#5e5a54';
  ctx.fillRect(0, 0, S, S);
  const rows = 6, rh = S / rows;
  for (let y = 0; y < rows; y++) {
    let x = y % 2 ? -rh * 0.7 : 0;
    while (x < S) {
      const w = rh * (1.2 + r() * 0.9), v = 0.75 + r() * 0.35;
      ctx.fillStyle = `rgb(${(150 * v) | 0},${(143 * v) | 0},${(132 * v) | 0})`;
      ctx.fillRect(x + 2, y * rh + 2, w - 4, rh - 4);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x + 2, y * rh + rh - 7, w - 4, 5);
      x += w;
    }
  }
  speckle(ctx, S, S, 9000, r, (v) => `rgba(${v < 0.5 ? 0 : 255},${v < 0.5 ? 0 : 255},${v < 0.5 ? 0 : 255},0.07)`);
  return tex(c);
}

export function shopTextures() {
  const W = 512, H = 128;
  const [c, ctx] = canvas(W, H);
  const [ce, cte] = canvas(W, H);
  const r = mulberry32(77);
  ctx.fillStyle = '#3a3634';
  ctx.fillRect(0, 0, W, H);
  cte.fillStyle = '#000';
  cte.fillRect(0, 0, W, H);
  const awnings = ['#8c2b2b', '#2b5a8c', '#2f6b3d', '#8c6a2b', '#5a2b6b', '#333'];
  const n = 4;
  for (let k = 0; k < n; k++) {
    const x0 = (k * W) / n + 6, w = W / n - 12;
    ctx.fillStyle = '#1d2024';
    ctx.fillRect(x0, 34, w, 84);
    ctx.fillStyle = 'rgba(160,190,210,0.25)';
    ctx.fillRect(x0 + 4, 38, w * 0.35, 78);
    ctx.fillStyle = awnings[Math.floor(r() * awnings.length)];
    ctx.fillRect(x0 - 4, 14, w + 8, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    for (let s = 0; s < w + 8; s += 12) ctx.fillRect(x0 - 4 + s, 14, 6, 18);
    // signage glow
    const sc = ['#ff5a3c', '#ffd23c', '#3cd2ff', '#ff3cc8', '#ffffff'][Math.floor(r() * 5)];
    cte.fillStyle = sc;
    cte.globalAlpha = 0.9;
    cte.fillRect(x0 + w * 0.15, 2, w * 0.7, 9);
    ctx.fillStyle = sc;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x0 + w * 0.15, 2, w * 0.7, 9);
    ctx.globalAlpha = 1;
    cte.globalAlpha = 0.55 + r() * 0.4;
    cte.fillStyle = '#ffdcae';
    cte.fillRect(x0 + 2, 36, w - 4, 80);
    cte.globalAlpha = 1;
  }
  return { map: tex(c), emissive: tex(ce) };
}

export function waterNormals() {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const img = ctx.createImageData(S, S);
  // sum of sines on a torus -> tileable height; derive normals
  const hgt = new Float32Array(S * S);
  const r = mulberry32(3);
  const waves = [];
  for (let i = 0; i < 14; i++) waves.push({ kx: Math.floor(r() * 9) - 4, ky: Math.floor(r() * 9) - 4, ph: r() * 6.28, a: 0.4 + r() });
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let h = 0;
    for (const w of waves) h += w.a * Math.sin(((w.kx * x + w.ky * y) / S) * Math.PI * 2 + w.ph) / (1 + Math.abs(w.kx) + Math.abs(w.ky));
    hgt[y * S + x] = h;
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const hx = hgt[y * S + ((x + 1) % S)] - hgt[y * S + ((x - 1 + S) % S)];
    const hy = hgt[((y + 1) % S) * S + x] - hgt[((y - 1 + S) % S) * S + x];
    const nx = -hx * 6, ny = -hy * 6, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const k = (y * S + x) * 4;
    img.data[k] = ((nx / l) * 0.5 + 0.5) * 255;
    img.data[k + 1] = ((ny / l) * 0.5 + 0.5) * 255;
    img.data[k + 2] = ((nz / l) * 0.5 + 0.5) * 255;
    img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { srgb: false });
}

export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128, stop = 0) {
  const [c, ctx] = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  if (stop) g.addColorStop(stop, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return tex(c, { repeat: false });
}

export function smokeTexture() {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const r = mulberry32(42);
  for (let i = 0; i < 26; i++) {
    const x = S / 2 + (r() - 0.5) * S * 0.4, y = S / 2 + (r() - 0.5) * S * 0.4;
    const rad = S * (0.15 + r() * 0.22);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  return tex(c, { repeat: false });
}

export function headlightPoolTexture() {
  const W = 128, H = 256;
  const [c, ctx] = canvas(W, H);
  // cone of light: bright near (bottom), fading far (top)
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = 1 - y / H; // 1 near car
    const u = (x / (W - 1)) * 2 - 1;
    const spread = 0.25 + 0.75 * (1 - v);
    const a = Math.max(0, 1 - Math.abs(u) / spread) * Math.pow(v, 0.6) * Math.min(1, (1 - v) * 6);
    const k = (y * W + x) * 4;
    img.data[k] = 255; img.data[k + 1] = 240; img.data[k + 2] = 210; img.data[k + 3] = Math.floor(255 * a * a);
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { repeat: false });
}

// one parking space (u: along the street, 6.2 m; v: across the bay, 2.4 m): asphalt, white end lines, oil stain
export function parkingBayTexture() {
  const W = 256, H = 100;
  const [c, ctx] = canvas(W, H);
  const r = mulberry32(61);
  ctx.fillStyle = '#3d3d3f';
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 9000, r, (v) => { const g = 45 + Math.floor(v * 40); return `rgb(${g},${g},${g + 2})`; });
  ctx.fillStyle = 'rgba(15,14,12,0.35)';
  ctx.beginPath(); ctx.ellipse(W * 0.5, H * 0.5, 34, 16, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = 'rgba(232,230,220,0.9)';
  ctx.fillRect(0, 0, 4, H); ctx.fillRect(W - 4, 0, 4, H); // the T-marks between spaces
  ctx.fillRect(0, H - 4, 18, 4); ctx.fillRect(W - 18, H - 4, 18, 4);
  return tex(c);
}

// spray-paint tags in a 4 x 2 atlas: chunky outlined letters, a drop shadow, drips, the odd throw-up bubble
export function graffitiAtlas() {
  const CW = 256, CH = 128;
  const [c, ctx] = canvas(CW * 4, CH * 2);
  const r = mulberry32(1312);
  const words = ['HEAT', 'KRAK', 'ZAP!', 'NOVA', 'RAW', 'BLOK', 'DUKE', 'FLOW', 'YO', 'MRD', 'VIBE', '2FST', 'ACE', 'GRIM'];
  const fills = ['#ff3d6e', '#30d5ff', '#ffd23a', '#7dff5a', '#b86bff', '#ff8a1c', '#f4f4f4', '#2bd6a0'];
  for (let k = 0; k < 8; k++) {
    const ox = (k % 4) * CW, oy = Math.floor(k / 4) * CH;
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, CW, CH); ctx.clip();
    const fill = fills[Math.floor(r() * fills.length)], word = words[Math.floor(r() * words.length)];
    ctx.translate(ox + CW / 2, oy + CH / 2);
    ctx.rotate((r() - 0.5) * 0.25);
    ctx.transform(1, 0, (r() - 0.5) * 0.5, 1, 0, 0);
    if (r() < 0.4) { // a throw-up bubble behind the letters
      ctx.fillStyle = fills[Math.floor(r() * fills.length)];
      ctx.beginPath(); ctx.ellipse(0, 0, CW * 0.44, CH * 0.36, 0, 0, 6.3); ctx.fill();
      ctx.lineWidth = 6; ctx.strokeStyle = '#111'; ctx.stroke();
    }
    const size = Math.min(84, (CW * 1.6) / word.length);
    ctx.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#111'; ctx.fillText(word, 5, 6); // 3D shadow
    ctx.lineWidth = 9; ctx.strokeStyle = '#111'; ctx.strokeText(word, 0, 0);
    ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText(word, 0, 0);
    ctx.fillStyle = fill; ctx.fillText(word, 0, 0);
    // drips
    ctx.strokeStyle = fill; ctx.lineWidth = 2.5;
    for (let d = 0; d < 5; d++) { const x = (r() - 0.5) * CW * 0.6, y = size * 0.3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 6 + r() * 26); ctx.stroke(); }
    ctx.restore();
  }
  const t = tex(c, { repeat: false });
  return t;
}

// twelve billboard ads in a 4 x 3 atlas (each 512 x 256): bold colours, a drawn product, a name and a tagline
export const AD_COUNT = 12;
export function adAtlas() {
  const CW = 512, CH = 256;
  const [c, ctx] = canvas(CW * 4, CH * 3);
  const ads = [
    ['FIZZ COLA', 'TASTE THE RUSH', '#c8322a', '#7a1010', '#fff3d8', 'bottle'],
    ['ACE MOTOR OIL', 'KEEPS YOU MOVING', '#1f4f9a', '#0c2550', '#ffd23c', 'can'],
    ['SUNNY TV', 'COLOUR FOR EVERYONE', '#f0c419', '#d0801a', '#1a1a1a', 'tv'],
    ['LUCKY RADIO', '101.7 FM ALL NIGHT', '#2e7d4a', '#123d22', '#ffffff', 'note'],
    ['HOTEL METRO', 'ROOMS FROM $19', '#3a2a5a', '#160c2a', '#ff9ad8', 'star'],
    ['BIG BOB\'S', 'BURGERS & SHAKES', '#ff7a2a', '#b83a10', '#fff8e0', 'burger'],
    ['VELOCE', 'THE NEW V8 IS HERE', '#16181c', '#3a3e46', '#ff3a30', 'car'],
    ['SURF CITY', 'FLY THERE TODAY', '#30b8e0', '#0a5a8a', '#ffffff', 'plane'],
    ['MINT FRESH', 'SMILE WIDER', '#e8f6ee', '#9adcc0', '#106040', 'tooth'],
    ['GOLDEN BREW', 'COLD. GOLD. GOOD.', '#e8a020', '#8a4a08', '#2a1408', 'bottle'],
    ['ROCKET BANK', 'LOANS IN 5 MINUTES', '#5a2ad0', '#24086a', '#ffe23a', 'rocket'],
    ['PIZZA PALACE', 'HOT IN 30 OR FREE', '#2a8a3a', '#0e4a18', '#fff3d8', 'pizza'],
  ];
  ads.forEach(([name, tag, c0, c1, fg, icon], k) => {
    const x0 = (k % 4) * CW, y0 = Math.floor(k / 4) * CH;
    const gr = ctx.createLinearGradient(x0, y0, x0 + CW, y0 + CH); gr.addColorStop(0, c0); gr.addColorStop(1, c1);
    ctx.fillStyle = gr; ctx.fillRect(x0, y0, CW, CH);
    // sunburst stripes behind the product
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, CW, CH); ctx.clip();
    ctx.translate(x0 + 400, y0 + 130); ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let a = 0; a < 12; a++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(400, -40); ctx.lineTo(400, 40); ctx.fill(); }
    ctx.restore();
    // the product, drawn simply on the right
    ctx.save(); ctx.translate(x0 + 400, y0 + 135); ctx.fillStyle = fg; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 5;
    const sh = (f) => { ctx.beginPath(); f(); ctx.fill(); ctx.stroke(); };
    if (icon === 'bottle') { sh(() => { ctx.moveTo(-12, -95); ctx.lineTo(12, -95); ctx.lineTo(14, -50); ctx.quadraticCurveTo(36, -30, 34, 0); ctx.lineTo(34, 85); ctx.lineTo(-34, 85); ctx.lineTo(-34, 0); ctx.quadraticCurveTo(-36, -30, -14, -50); ctx.closePath(); }); ctx.fillStyle = c0; ctx.fillRect(-34, 0, 68, 34); }
    else if (icon === 'can') { sh(() => ctx.roundRect(-38, -70, 76, 150, 10)); ctx.fillStyle = c0; ctx.fillRect(-38, -20, 76, 40); }
    else if (icon === 'tv') { sh(() => ctx.roundRect(-70, -60, 140, 105, 14)); ctx.fillStyle = '#5ad0ff'; ctx.fillRect(-56, -48, 112, 80); ctx.strokeStyle = fg; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-25, -60); ctx.lineTo(-45, -95); ctx.moveTo(25, -60); ctx.lineTo(45, -95); ctx.stroke(); }
    else if (icon === 'note') { sh(() => { ctx.ellipse(-30, 50, 26, 19, -0.4, 0, 6.3); }); sh(() => { ctx.ellipse(40, 30, 26, 19, -0.4, 0, 6.3); }); ctx.fillRect(-10, -80, 10, 128); ctx.fillRect(60, -100, 10, 128); ctx.fillRect(-10, -100, 80, 22); }
    else if (icon === 'star') sh(() => { for (let i = 0; i < 10; i++) { const r = i % 2 ? 40 : 95, a = i * Math.PI / 5 - Math.PI / 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); });
    else if (icon === 'burger') { ctx.fillStyle = '#e8a040'; sh(() => ctx.ellipse(0, -30, 80, 45, 0, Math.PI, 0)); ctx.fillStyle = '#6a2a10'; sh(() => ctx.roundRect(-82, -28, 164, 30, 12)); ctx.fillStyle = '#7ac040'; ctx.fillRect(-86, 2, 172, 12); ctx.fillStyle = '#e8a040'; sh(() => ctx.roundRect(-80, 14, 160, 34, 14)); }
    else if (icon === 'car') { sh(() => { ctx.moveTo(-100, 30); ctx.lineTo(-95, -5); ctx.lineTo(-40, -15); ctx.lineTo(-15, -50); ctx.lineTo(45, -50); ctx.lineTo(75, -12); ctx.lineTo(105, -5); ctx.lineTo(105, 30); ctx.closePath(); }); ctx.fillStyle = '#222'; for (const wx of [-55, 65]) sh(() => ctx.arc(wx, 32, 22, 0, 6.3)); }
    else if (icon === 'plane') sh(() => { ctx.moveTo(-100, 0); ctx.lineTo(90, -12); ctx.quadraticCurveTo(110, 0, 90, 12); ctx.lineTo(-100, 8); ctx.closePath(); ctx.moveTo(10, -5); ctx.lineTo(-30, -80); ctx.lineTo(-10, -80); ctx.lineTo(40, -5); ctx.moveTo(10, 8); ctx.lineTo(-30, 80); ctx.lineTo(-10, 80); ctx.lineTo(40, 8); ctx.moveTo(-90, 0); ctx.lineTo(-105, -40); ctx.lineTo(-85, -40); ctx.lineTo(-70, 0); });
    else if (icon === 'tooth') sh(() => { ctx.moveTo(-50, -60); ctx.quadraticCurveTo(0, -85, 50, -60); ctx.quadraticCurveTo(70, 0, 40, 80); ctx.quadraticCurveTo(20, 30, 0, 30); ctx.quadraticCurveTo(-20, 30, -40, 80); ctx.quadraticCurveTo(-70, 0, -50, -60); });
    else if (icon === 'rocket') { sh(() => { ctx.moveTo(0, -100); ctx.quadraticCurveTo(40, -50, 30, 50); ctx.lineTo(-30, 50); ctx.quadraticCurveTo(-40, -50, 0, -100); }); ctx.fillStyle = '#ff7a2a'; sh(() => { ctx.moveTo(-20, 55); ctx.lineTo(0, 100); ctx.lineTo(20, 55); }); }
    else if (icon === 'pizza') { ctx.fillStyle = '#f0c060'; sh(() => { ctx.moveTo(0, 90); ctx.lineTo(-80, -70); ctx.quadraticCurveTo(0, -105, 80, -70); ctx.closePath(); }); ctx.fillStyle = '#c8322a'; for (const [px, py] of [[-25, -40], [25, -45], [0, 10], [-5, -70]]) sh(() => ctx.arc(px, py, 13, 0, 6.3)); }
    ctx.restore();
    // name and tagline on the left
    ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const fs = Math.min(72, 560 / name.length);
    ctx.font = `900 ${fs}px Impact, "Arial Black", sans-serif`;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillText(name, x0 + 28, y0 + 120 + 4);
    ctx.fillStyle = fg; ctx.fillText(name, x0 + 24, y0 + 120);
    ctx.font = `bold 26px "Arial Narrow", Arial, sans-serif`;
    ctx.fillText(tag, x0 + 28, y0 + 168);
    ctx.fillRect(x0 + 28, y0 + 186, 120, 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 8; ctx.strokeRect(x0 + 4, y0 + 4, CW - 8, CH - 8);
  });
  return tex(c, { repeat: false });
}

// overhead street signs, 2 x 4 cells of 512 x 128: green guide signs with arrows, then blue-on-white street names
export function streetSignAtlas() {
  const [c, ctx] = canvas(1024, 512);
  const cells = [['DOWNTOWN', '↑'], ['EXPRESSWAY', '↗'], ['OLD TOWN', '←'], ['RIVERSIDE', '→'], ['MERIDIAN AVE'], ['5TH STREET'], ['CORVIN BLVD'], ['MARKET ST']];
  cells.forEach(([t, arrow], k) => {
    const x0 = (k % 2) * 512, y0 = Math.floor(k / 2) * 128, guide = k < 4;
    ctx.fillStyle = guide ? '#0f6a3a' : '#1d4f9a'; ctx.fillRect(x0, y0, 512, 128);
    ctx.strokeStyle = '#f4f4f0'; ctx.lineWidth = 6; ctx.strokeRect(x0 + 8, y0 + 8, 496, 112);
    ctx.fillStyle = '#f4f4f0'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${guide ? 58 : 54}px "Arial Narrow", Arial, sans-serif`;
    ctx.textAlign = guide ? 'left' : 'center';
    ctx.fillText(t, guide ? x0 + 30 : x0 + 256, y0 + 66);
    if (arrow) { ctx.font = 'bold 80px Arial, sans-serif'; ctx.textAlign = 'right'; ctx.fillText(arrow, x0 + 490, y0 + 66); }
  });
  return tex(c, { repeat: false });
}
