// Smashable street furniture (instanced), flying debris, and neon blade signs.
import * as THREE from 'three';
import { mergeGeometries } from '../lib/addons/utils/BufferGeometryUtils.js';
import { CITY } from './world.js';
import { mulberry32 } from './noise.js';

function part(geo, color, x = 0, y = 0, z = 0) {
  geo.translate(x, y, z);
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
}
const box = (w, h, d, c, x, y, z) => part(new THREE.BoxGeometry(w, h, d), c, x, y, z);
const cyl = (r0, r1, h, c, x, y, z, s = 10) => part(new THREE.CylinderGeometry(r0, r1, h, s), c, x, y, z);

function geometries() {
  const G = {};
  G.cone = mergeGeometries([
    box(0.42, 0.04, 0.42, 0x1a1a1a, 0, 0.02, 0),
    cyl(0.03, 0.17, 0.6, 0xff6a14, 0, 0.34, 0, 12),
    cyl(0.085, 0.115, 0.1, 0xf2f2f2, 0, 0.42, 0, 12),
  ]);
  const legs = (w, d, h, c) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => box(0.04, h, 0.04, c, sx * w, h / 2, sz * d));
  G.chair = mergeGeometries([
    box(0.42, 0.04, 0.42, 0x8a5a32, 0, 0.46, 0), box(0.42, 0.42, 0.04, 0x8a5a32, 0, 0.7, -0.2), ...legs(0.18, 0.18, 0.46, 0x2c2c2c),
  ]);
  const umb = [];
  for (let k = 0; k < 8; k++) {
    const g = new THREE.ConeGeometry(1.25, 0.45, 8, 1, true, (k / 8) * Math.PI * 2, Math.PI / 4);
    umb.push(part(g, k % 2 ? 0xf1ece0 : 0xb8322a, 0, 2.25, 0));
  }
  G.table = mergeGeometries([
    cyl(0.4, 0.4, 0.04, 0xe8e2d4, 0, 0.74, 0, 16), cyl(0.03, 0.03, 2.1, 0x444444, 0, 1.05, 0, 6), cyl(0.22, 0.25, 0.04, 0x333333, 0, 0.02, 0, 12), ...umb,
  ]);
  G.table.computeVertexNormals();
  // fruit stall: counter, slanted produce trays, posts and a striped awning
  const stall = [box(2.6, 0.85, 1.1, 0x6e4a2c, 0, 0.43, 0)];
  const fruit = [0xe8781e, 0xc9261c, 0x7fae2a, 0xf0c419, 0x8b2a5a];
  for (let i = 0; i < 4; i++) {
    stall.push(box(0.6, 0.12, 0.8, 0x8f6a40, -0.95 + i * 0.63, 0.92, 0.05));
    for (let k = 0; k < 6; k++) stall.push(box(0.13, 0.13, 0.13, fruit[(i + k) % 5], -1.12 + i * 0.63 + (k % 3) * 0.17, 1.03, -0.15 + Math.floor(k / 3) * 0.3));
  }
  for (const sx of [-1.25, 1.25]) for (const sz of [-0.5, 0.5]) stall.push(box(0.06, 2.3, 0.06, 0x3a2a1c, sx, 1.15, sz));
  for (let k = 0; k < 9; k++) {
    const g = new THREE.BoxGeometry(0.32, 0.05, 1.5);
    g.rotateX(-0.25);
    stall.push(part(g, k % 2 ? 0xf3efe2 : 0x2e7d4a, -1.3 + k * 0.325, 2.3, 0.1));
  }
  G.stall = mergeGeometries(stall);
  const crate = [box(0.7, 0.32, 0.5, 0x9a7444, 0, 0.16, 0)];
  for (let k = 0; k < 8; k++) crate.push(box(0.14, 0.14, 0.14, fruit[k % 5], -0.24 + (k % 4) * 0.16, 0.36, -0.08 + Math.floor(k / 4) * 0.16));
  G.crate = mergeGeometries(crate);
  G.bin = mergeGeometries([cyl(0.28, 0.25, 0.9, 0x3d4a3a, 0, 0.45, 0, 12), cyl(0.3, 0.3, 0.05, 0x2a332a, 0, 0.92, 0, 12)]);
  G.news = mergeGeometries([box(0.5, 0.9, 0.45, 0x1f4f9a, 0, 0.75, 0), box(0.42, 0.25, 0.02, 0xd8d4c8, 0, 0.95, 0.23), ...legs(0.18, 0.15, 0.3, 0x222222)]);
  G.hydrant = mergeGeometries([cyl(0.13, 0.15, 0.6, 0xc92a1c, 0, 0.3, 0, 10), part(new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xc92a1c, 0, 0.6, 0), box(0.4, 0.09, 0.09, 0xb8b8b8, 0, 0.42, 0)]);
  const bar = [];
  for (const sx of [-0.75, 0.75]) { const g = new THREE.BoxGeometry(0.06, 1.05, 0.06); g.rotateX(0.25); bar.push(part(g, 0x333333, sx, 0.5, 0.12)); const g2 = new THREE.BoxGeometry(0.06, 1.05, 0.06); g2.rotateX(-0.25); bar.push(part(g2, 0x333333, sx, 0.5, -0.12)); }
  for (let k = 0; k < 6; k++) bar.push(box(0.27, 0.28, 0.04, k % 2 ? 0xf2f2f2 : 0xff6a14, -0.68 + k * 0.27, 0.85, 0));
  G.barrier = mergeGeometries(bar);
  const pl = [box(1.1, 0.5, 0.55, 0x8d8780, 0, 0.25, 0), box(1.0, 0.06, 0.45, 0x3d2a1c, 0, 0.5, 0)];
  const flower = [0xd8324a, 0xf2c14a, 0xf0f0f0, 0xb44ad8];
  for (let k = 0; k < 5; k++) {
    pl.push(part(new THREE.IcosahedronGeometry(0.2, 0), 0x3f6b2a, -0.4 + k * 0.2, 0.68, (k % 2) * 0.12 - 0.06));
    pl.push(box(0.08, 0.08, 0.08, flower[k % 4], -0.4 + k * 0.2, 0.86, 0.05));
  }
  G.planter = mergeGeometries(pl);
  G.dumpster = mergeGeometries([
    box(1.9, 1.15, 1.15, 0x2f4a36, 0, 0.62, 0), box(1.95, 0.08, 1.2, 0x223428, 0, 1.24, 0.03),
    ...legs(0.85, 0.5, 0.12, 0x1a1a1a), box(0.04, 0.05, 1.0, 0x777777, -0.98, 0.9, 0), box(0.04, 0.05, 1.0, 0x777777, 0.98, 0.9, 0),
  ]);
  G.window = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const pick = [box(4.0, 0.08, 0.05, 0xe8e2d4, 0, 0.35, 0), box(4.0, 0.08, 0.05, 0xe8e2d4, 0, 0.85, 0)];
  for (let k = 0; k < 13; k++) pick.push(box(0.1, 1.05, 0.03, 0xf0ece0, -1.9 + k * 0.316, 0.52, 0.04));
  for (const x of [-1.98, 1.98]) pick.push(box(0.1, 1.15, 0.1, 0xd8d2c4, x, 0.57, 0));
  G.fence = mergeGeometries(pick);
  // farm fence: posts and three rails
  const rails = [];
  for (const x of [-1.95, 0, 1.95]) rails.push(box(0.13, 1.2, 0.13, 0x6b4a2e, x, 0.6, 0));
  for (const y of [0.35, 0.7, 1.05]) rails.push(box(4.0, 0.1, 0.05, 0x7d5a38, 0, y, 0.07));
  G.railfence = mergeGeometries(rails);
  // café parklet planter: slatted wooden box with turf, shrubs and flowers
  const pb = [box(2.4, 0.8, 0.9, 0x9a7146, 0, 0.4, 0)];
  for (let k = 0; k < 5; k++) pb.push(box(2.42, 0.02, 0.92, 0x7a5532, 0, 0.12 + k * 0.16, 0));
  pb.push(box(2.3, 0.06, 0.8, 0x4f7a30, 0, 0.81, 0));
  for (let k = 0; k < 4; k++) pb.push(part(new THREE.IcosahedronGeometry(0.26, 0), 0x3f6b2a, -0.85 + k * 0.57, 1.0, (k % 2) * 0.16 - 0.08));
  for (let k = 0; k < 7; k++) pb.push(box(0.09, 0.09, 0.09, [0xd8324a, 0xf2c14a, 0xf0f0f0, 0xe87a2a][k % 4], -1.0 + k * 0.33, 1.12 + (k % 2) * 0.08, 0.2 - (k % 3) * 0.15));
  G.planterbox = mergeGeometries(pb);
  // big market-tent sun roof over the tables, with a string of lights round the valance
  const tent = (roofCol) => {
    const t = [];
    for (const [x, z] of [[-2.1, -2.1], [2.1, -2.1], [-2.1, 2.1], [2.1, 2.1]]) t.push(cyl(0.05, 0.05, 2.5, 0xe8e6e0, x, 1.25, z, 6));
    const roof = new THREE.ConeGeometry(3.05, 1.2, 4, 1, true); roof.rotateY(Math.PI / 4); t.push(part(roof, roofCol, 0, 3.1, 0));
    for (const [w, d, x, z] of [[4.3, 0.04, 0, -2.15], [4.3, 0.04, 0, 2.15], [0.04, 4.3, -2.15, 0], [0.04, 4.3, 2.15, 0]]) t.push(box(w, 0.32, d, roofCol, x, 2.38, z));
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; t.push(part(new THREE.SphereGeometry(0.05, 5, 4), 0xfff2b0, Math.cos(a) * 2.0, 2.15 - Math.abs(Math.sin(a * 2)) * 0.1, Math.sin(a) * 2.0)); }
    return mergeGeometries(t);
  };
  G.tent = tent(0xf4f2ec);
  G.tentgreen = tent(0x3f6b4a);
  const tor = (r, t, c, x, y, z, rx = Math.PI / 2) => { const g = new THREE.TorusGeometry(r, t, 6, 14); g.rotateX(rx); return part(g, c, x, y, z); };
  G.tire = mergeGeometries([tor(0.33, 0.12, 0x1a1a1a, 0, 0.12, 0), tor(0.33, 0.12, 0x1d1d1d, 0.04, 0.36, 0.02), tor(0.33, 0.12, 0x181818, -0.02, 0.6, -0.03)]);
  G.bench = mergeGeometries([box(1.8, 0.06, 0.45, 0x7a5a3a, 0, 0.45, 0), box(1.8, 0.4, 0.05, 0x7a5a3a, 0, 0.75, -0.22), ...legs(0.8, 0.18, 0.45, 0x2c2c2c)]);
  const frame = (len, ang, x, y) => { const g = new THREE.BoxGeometry(len, 0.04, 0.04); g.rotateZ(ang); return part(g, 0x2a6aa8, x, y, 0); };
  G.bike = mergeGeometries([
    tor(0.33, 0.025, 0x151515, -0.55, 0.34, 0, 0), tor(0.33, 0.025, 0x151515, 0.55, 0.34, 0, 0),
    frame(0.7, 0, 0, 0.62), frame(0.75, 0.9, -0.22, 0.48), frame(0.7, -0.9, 0.25, 0.48), box(0.22, 0.05, 0.1, 0x1a1a1a, -0.2, 0.86, 0), box(0.05, 0.05, 0.5, 0x888888, 0.45, 0.9, 0),
  ]);
  // mountain warning sign (yellow diamond with a black ! ) and a black/yellow chevron board
  const dia = new THREE.BoxGeometry(0.72, 0.72, 0.03); dia.rotateZ(Math.PI / 4);
  const diaB = new THREE.BoxGeometry(0.8, 0.8, 0.02); diaB.rotateZ(Math.PI / 4);
  G.sign = mergeGeometries([cyl(0.04, 0.04, 2.2, 0x8a8e92, 0, 1.1, 0, 6), part(diaB, 0x161616, 0, 2.1, 0.05), part(dia, 0xf2c419, 0, 2.1, 0.07),
    box(0.08, 0.3, 0.02, 0x161616, 0, 2.17, 0.09), box(0.08, 0.08, 0.02, 0x161616, 0, 1.94, 0.09)]);
  const chev = [cyl(0.05, 0.05, 1.0, 0x8a8e92, -0.45, 0.5, 0, 6), cyl(0.05, 0.05, 1.0, 0x8a8e92, 0.45, 0.5, 0, 6), box(1.2, 0.6, 0.03, 0x161616, 0, 1.2, 0.04)];
  for (let k = -1; k <= 1; k++) for (const s of [1, -1]) {
    const g = new THREE.BoxGeometry(0.1, 0.32, 0.02); g.rotateZ(s * 0.75);
    chev.push(part(g, 0xf2c419, k * 0.36 + 0.04, 1.2 + s * 0.1, 0.06));
  }
  G.chevron = mergeGeometries(chev);
  // cardboard box pile and black trash bags
  const bx = [];
  for (const [w2, h2, d2, x, y, z, c] of [[0.6, 0.45, 0.5, -0.2, 0.22, 0, 0xb8955f], [0.5, 0.4, 0.45, 0.35, 0.2, 0.1, 0xa8854f], [0.45, 0.35, 0.4, -0.05, 0.62, 0.05, 0xc4a06a], [0.4, 0.3, 0.6, 0.15, 0.15, -0.45, 0x9a7a48]]) {
    const g = new THREE.BoxGeometry(w2, h2, d2); g.rotateY((x + z) * 2);
    bx.push(part(g, c, x, y, z));
  }
  G.boxes = mergeGeometries(bx);
  const bag = [];
  for (const [r, x, y, z] of [[0.38, 0, 0.32, 0], [0.32, 0.45, 0.27, 0.15], [0.3, -0.3, 0.25, 0.35], [0.26, 0.1, 0.62, 0.1]]) {
    const g = new THREE.IcosahedronGeometry(r, 1); g.scale(1, 0.85, 1);
    bag.push(part(g, 0x141414, x, y, z));
  }
  G.bags = mergeGeometries(bag);
  // bus stop: frame, glass panels, bench, sign
  G.busstop = mergeGeometries([
    box(3.0, 0.08, 1.4, 0x3a3f45, 0, 2.4, 0), box(0.08, 2.4, 0.08, 0x3a3f45, -1.45, 1.2, -0.65), box(0.08, 2.4, 0.08, 0x3a3f45, 1.45, 1.2, -0.65),
    box(0.08, 2.4, 0.08, 0x3a3f45, -1.45, 1.2, 0.65), box(0.08, 2.4, 0.08, 0x3a3f45, 1.45, 1.2, 0.65),
    box(2.9, 1.9, 0.03, 0x9fc4d6, 0, 1.3, -0.68), box(0.03, 1.9, 1.25, 0x9fc4d6, -1.45, 1.3, 0), box(2.0, 0.08, 0.45, 0x7a5a3a, 0, 0.5, -0.4),
    box(0.06, 2.8, 0.06, 0x3a3f45, 1.8, 1.4, 0.6), box(0.5, 0.5, 0.04, 0x1f6fd8, 1.8, 2.6, 0.6),
  ]);
  G.phone = mergeGeometries([box(0.9, 2.2, 0.9, 0xb8322a, 0, 1.1, 0), box(0.7, 1.4, 0.02, 0x9fc4d6, 0, 1.25, 0.46), box(0.95, 0.15, 0.95, 0xd8d2c4, 0, 2.27, 0)]);
  G.meter = mergeGeometries([cyl(0.04, 0.05, 1.1, 0x444444, 0, 0.55, 0, 6), box(0.22, 0.32, 0.16, 0x2a5a3a, 0, 1.25, 0), box(0.14, 0.1, 0.02, 0xd8d2c4, 0, 1.3, 0.09)]);
  G.mailbox = mergeGeometries([box(0.5, 0.9, 0.45, 0x1f4f9a, 0, 0.75, 0), part(new THREE.CylinderGeometry(0.25, 0.25, 0.45, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), 0x1f4f9a, 0, 1.2, 0), ...legs(0.18, 0.15, 0.3, 0x222222)]);
  G.guardrail = mergeGeometries([
    box(4.1, 0.32, 0.06, 0xa8adb2, 0, 0.62, 0), box(4.1, 0.05, 0.1, 0xc8ccd0, 0, 0.78, 0),
    box(0.12, 0.85, 0.12, 0x6b5a44, -2.0, 0.42, -0.08), box(0.12, 0.85, 0.12, 0x6b5a44, 0, 0.42, -0.08), box(0.12, 0.85, 0.12, 0x6b5a44, 2.0, 0.42, -0.08),
  ]);
  // gondola shelving stocked with products on both faces
  const goods = [0xd8324a, 0xf2c14a, 0x3a6ea8, 0x5aa83a, 0xf28c28, 0xe8e2d4, 0x8a3ad8, 0x2a9a9a];
  const sh = [box(3.0, 1.75, 0.08, 0x8d9096, 0, 0.88, 0), box(3.0, 0.12, 0.9, 0x6b6e73, 0, 0.06, 0)];
  let gi = 0;
  for (const yy of [0.12, 0.62, 1.12]) {
    sh.push(box(3.0, 0.04, 0.88, 0xb8bbbf, 0, yy + 0.02, 0));
    for (const side of [-1, 1]) for (let k = 0; k < 9; k++) {
      const h = 0.18 + ((k * 7 + gi) % 5) * 0.06;
      sh.push(box(0.28, h, 0.3, goods[(gi++ + k) % goods.length], -1.33 + k * 0.33, yy + 0.04 + h / 2, side * 0.24));
    }
  }
  G.shelf = mergeGeometries(sh);
  const fr = [box(2.0, 2.0, 0.8, 0xdfe3e6, 0, 1.0, 0), box(1.9, 1.7, 0.02, 0x9fc4d6, 0, 1.05, 0.41)];
  for (const yy of [0.45, 0.95, 1.45]) for (let k = 0; k < 7; k++) fr.push(box(0.18, 0.3, 0.18, goods[(k * 3 + Math.round(yy * 10)) % goods.length], -0.75 + k * 0.25, yy, 0.25));
  G.fridge = mergeGeometries(fr);
  G.counter = mergeGeometries([box(2.4, 1.0, 0.8, 0x6e4a2c, 0, 0.5, 0), box(2.5, 0.05, 0.85, 0x2a2a2a, 0, 1.02, 0), box(0.4, 0.3, 0.35, 0x3a3a3a, 0.6, 1.2, 0), box(0.3, 0.2, 0.25, 0xe8e2d4, -0.5, 1.15, 0)]);
  return G;
}

// colours of the pieces each prop breaks into
const DEBRIS = {
  cone: { n: 3, cols: [0xff6a14, 0xf2f2f2, 0x1a1a1a], size: [0.18, 0.3] },
  chair: { n: 5, cols: [0x8a5a32, 0x2c2c2c], size: [0.08, 0.4] },
  table: { n: 7, cols: [0xe8e2d4, 0xb8322a, 0xf1ece0, 0x444444], size: [0.15, 0.6] },
  stall: { n: 34, cols: [0x6e4a2c, 0x8f6a40, 0x2e7d4a, 0xf3efe2, 0xe8781e, 0xc9261c, 0x7fae2a, 0xf0c419, 0xe8781e, 0xc9261c], size: [0.1, 0.7] },
  crate: { n: 14, cols: [0x9a7444, 0xe8781e, 0xc9261c, 0x7fae2a, 0xf0c419], size: [0.1, 0.35] },
  bin: { n: 8, cols: [0x3d4a3a, 0xe8e4d8, 0xd0c8b0, 0x8a8070], size: [0.08, 0.3] },
  news: { n: 9, cols: [0x1f4f9a, 0xe8e4d8, 0xf2f0ea], size: [0.08, 0.35] },
  hydrant: { n: 3, cols: [0xc92a1c, 0xb8b8b8], size: [0.12, 0.25] },
  barrier: { n: 6, cols: [0xff6a14, 0xf2f2f2, 0x333333], size: [0.15, 0.6] },
  planter: { n: 10, cols: [0x8d8780, 0x3f6b2a, 0xd8324a, 0xf2c14a, 0x3d2a1c], size: [0.1, 0.45] },
  dumpster: { n: 9, cols: [0x2f4a36, 0x223428, 0xd0c8b0, 0x8a8070, 0xe8e4d8], size: [0.15, 0.7] },
  fence: { n: 7, cols: [0xf0ece0, 0xe8e2d4, 0xd8d2c4], size: [0.1, 1.0] },
  tire: { n: 3, cols: [0x1a1a1a], size: [0.3, 0.6] },
  railfence: { n: 6, cols: [0x7d5a38, 0x6b4a2e], size: [0.1, 1.2] },
  planterbox: { n: 9, cols: [0x9a7146, 0x4f7a30, 0x3f6b2a, 0xd8324a, 0xf2c14a], size: [0.1, 0.6] },
  tent: { n: 10, cols: [0xf4f2ec, 0xe8e6e0, 0xfff2b0], size: [0.15, 1.2] },
  tentgreen: { n: 10, cols: [0x3f6b4a, 0xe8e6e0, 0xfff2b0], size: [0.15, 1.2] },
  bench: { n: 5, cols: [0x7a5a3a, 0x2c2c2c], size: [0.2, 0.9] },
  bike: { n: 4, cols: [0x2a6aa8, 0x151515], size: [0.15, 0.6] },
  boxes: { n: 10, cols: [0xb8955f, 0xa8854f, 0xc4a06a, 0xe8e2d4], size: [0.12, 0.45] },
  bags: { n: 8, cols: [0x141414, 0x222222, 0xd8d2c4], size: [0.1, 0.4] },
  busstop: { n: 22, cols: [0x3a3f45, 0x9fc4d6, 0xcfe6f2, 0x7a5a3a, 0x1f6fd8], size: [0.08, 0.8] },
  phone: { n: 12, cols: [0xb8322a, 0x9fc4d6, 0xd8d2c4], size: [0.1, 0.6] },
  sign: { n: 3, cols: [0xf2c419, 0x161616, 0x8a8e92], size: [0.1, 0.5] },
  chevron: { n: 4, cols: [0xf2c419, 0x161616, 0x8a8e92], size: [0.1, 0.5] },
  meter: { n: 3, cols: [0x444444, 0x2a5a3a], size: [0.08, 0.3] },
  mailbox: { n: 6, cols: [0x1f4f9a, 0xe8e2d4, 0xf2f0ea], size: [0.08, 0.35] },
  guardrail: { n: 6, cols: [0xa8adb2, 0xc8ccd0, 0x6b5a44], size: [0.12, 1.4] },
  shelf: { n: 30, cols: [0x8d9096, 0xd8324a, 0xf2c14a, 0x3a6ea8, 0x5aa83a, 0xf28c28, 0xe8e2d4, 0x8a3ad8], size: [0.12, 0.5] },
  fridge: { n: 16, cols: [0xdfe3e6, 0x9fc4d6, 0xd8324a, 0x3a6ea8, 0xf2c14a], size: [0.12, 0.6] },
  counter: { n: 10, cols: [0x6e4a2c, 0x2a2a2a, 0x3a3a3a, 0xe8e2d4], size: [0.15, 0.6] },
  window: { n: 30, cols: [0xcfe6f2, 0xa9c8d8, 0xffffff, 0xbfdcea], size: [0.06, 0.32], flat: true },
};

class Debris {
  constructor(scene, world, max = 500) {
    this.world = world;
    this.max = max;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.75 }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.p = [];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) {
      this.mesh.setMatrixAt(i, zero);
      this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
      this.p.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), s: new THREE.Vector3(), life: 0, rest: 0 });
    }
    this.next = 0;
    scene.add(this.mesh);
    this.m4 = new THREE.Matrix4();
    this.dq = new THREE.Quaternion();
    this.axis = new THREE.Vector3();
    this.sc = new THREE.Vector3();
    this.col = new THREE.Color();
  }
  spawn(x, y, z, vx, vy, vz, sx, sy, sz, color) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const d = this.p[i];
    d.alive = true; d.life = 7 + Math.random() * 4; d.rest = 0;
    d.pos.set(x, y, z); d.vel.set(vx, vy, vz);
    d.q.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    d.w.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
    d.s.set(sx, sy, sz);
    this.mesh.setColorAt(i, this.col.set(color));
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const d = this.p[i];
      if (!d.alive) continue;
      any = true;
      d.life -= dt;
      if (d.rest < 1) {
        d.vel.y -= 9.81 * dt;
        d.vel.multiplyScalar(1 - 0.3 * dt);
        d.pos.addScaledVector(d.vel, dt);
        const g = this.world.groundAt(d.pos.x, d.pos.z, d.pos.y + 1).h + d.s.y * 0.5;
        if (d.pos.y < g) {
          d.pos.y = g;
          if (d.vel.y < 0) d.vel.y *= -0.3;
          d.vel.x *= 0.7; d.vel.z *= 0.7;
          d.w.multiplyScalar(0.6);
          if (d.vel.lengthSq() < 0.3) d.rest = 1;
        }
        const wl = d.w.length();
        if (wl > 1e-3) { this.dq.setFromAxisAngle(this.axis.copy(d.w).divideScalar(wl), wl * dt); d.q.premultiply(this.dq); }
      }
      const fade = d.life < 1 ? Math.max(0, d.life) : 1;
      this.m4.compose(d.pos, d.q, this.sc.set(d.s.x * fade, d.s.y * fade, d.s.z * fade));
      this.mesh.setMatrixAt(i, this.m4);
      if (d.life <= 0) d.alive = false;
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class PropSystem {
  constructor(world, scene) {
    this.world = world;
    const G = geometries();
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
    this.meshes = {};
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    this.matrixFor = (p, out) => out.compose(v.set(p.x, p.y, p.z), q.setFromAxisAngle(up, p.rot), p.sx ? sc.set(p.sx, p.sy, p.sz) : one);
    this.glassMat = new THREE.MeshPhysicalMaterial({ color: 0x9fc4d6, roughness: 0.03, metalness: 0.1, transparent: true, opacity: 0.32, envMapIntensity: 1.5, depthWrite: false });
    for (const kind in world.props) {
      const list = world.props[kind];
      const im = new THREE.InstancedMesh(G[kind], kind === 'window' ? this.glassMat : this.mat, list.length);
      if (kind === 'window') im.renderOrder = 6;
      list.forEach((p, i) => im.setMatrixAt(i, this.matrixFor(p, m4)));
      im.castShadow = true; im.receiveShadow = true;
      im.computeBoundingSphere();
      scene.add(im);
      this.meshes[kind] = im;
    }
    this.m4 = m4;
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.debris = new Debris(scene, world);
    this.respawnCursor = 0;
    this.all = Object.values(world.props).flat();
    this.sprays = [];
  }

  breakProp(p, v, effects) {
    p.broken = true;
    p.brokenT = 0;
    const im = this.meshes[p.kind];
    im.setMatrixAt(p.idx, this.zero);
    im.instanceMatrix.needsUpdate = true;
    const D = DEBRIS[p.kind];
    const sp = Math.hypot(v.vel.x, v.vel.z);
    const n = p.kind === 'window' ? Math.round(D.n * Math.min(2, p.sx / 4)) : D.n;
    for (let k = 0; k < n; k++) {
      const s = D.size[0] + Math.random() * (D.size[1] - D.size[0]);
      if (D.flat) {
        // glass shards: thin, spread along the pane
        const u = (Math.random() - 0.5) * p.sx, c = Math.cos(p.rot), sn = -Math.sin(p.rot);
        const k1 = 0.4 + Math.random() * 0.7;
        this.debris.spawn(p.x + c * u, p.y + 0.3 + Math.random() * 3.6, p.z + sn * u,
          v.vel.x * k1 + (Math.random() - 0.5) * 3, Math.random() * 3, v.vel.z * k1 + (Math.random() - 0.5) * 3,
          s, 0.012, s * 0.8, D.cols[k % D.cols.length]);
        continue;
      }
      const k1 = 0.55 + Math.random() * 0.6;
      this.debris.spawn(
        p.x + (Math.random() - 0.5) * 0.8, p.y + 0.3 + Math.random() * 0.8, p.z + (Math.random() - 0.5) * 0.8,
        v.vel.x * k1 + (Math.random() - 0.5) * 4, 2 + Math.random() * (3 + sp * 0.12), v.vel.z * k1 + (Math.random() - 0.5) * 4,
        s, s * (0.3 + Math.random() * 0.7), s * (0.4 + Math.random() * 0.6), D.cols[k % D.cols.length]);
    }
    if (effects) {
      if (p.kind === 'hydrant') this.sprays.push({ x: p.x, y: p.y + 0.4, z: p.z, t: 8 });
      else effects.debris(p.x, p.y + 0.4, p.z, 0.55, 0.5, 0.42, p.kind === 'stall' ? 10 : 3);
    }
  }

  update(dt, playerPos, effects) {
    this.debris.update(dt);
    // hydrant water fountains
    for (let i = this.sprays.length - 1; i >= 0; i--) {
      const s = this.sprays[i];
      s.t -= dt;
      if (effects && Math.hypot(s.x - playerPos.x, s.z - playerPos.z) < 150) {
        for (let k = 0; k < 3; k++) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * 1.2;
          effects.smoke.emit(s.x, s.y, s.z, Math.cos(a) * r, 7 + Math.random() * 3, Math.sin(a) * r, 0.5, 1.6, 1.3, 0.55, 0.8, 0.88, 0.98, 0.4, 9.8);
        }
      }
      if (s.t <= 0) this.sprays.splice(i, 1);
    }
    // quietly put smashed props back once the player is far away
    for (let n = 0; n < 40 && this.all.length; n++) {
      const p = this.all[this.respawnCursor];
      this.respawnCursor = (this.respawnCursor + 1) % this.all.length;
      if (!p.broken) continue;
      p.brokenT += dt * 40;
      if (p.brokenT > 25 && Math.hypot(p.x - playerPos.x, p.z - playerPos.z) > 260) {
        p.broken = false;
        const im = this.meshes[p.kind];
        im.setMatrixAt(p.idx, this.matrixFor(p, this.m4));
        im.instanceMatrix.needsUpdate = true;
        for (const c of this.world.colliders) if (c.prop === p) { c.broken = false; break; }
      }
    }
  }
}

// back-alley dressing: fire escapes, laundry lines, wall lamps, skywalks
export function buildAlleyDressing(world, scene, mats) {
  const R = mulberry32(77);
  const metal = [], cloth = [], lamps = [], sky = [];
  const gy = CITY.y + CITY.curb;
  const clothCols = [0xe8e2d4, 0xc8322a, 0x3a6ea8, 0xf0c419, 0x6b8f3a, 0xffffff, 0xd88aa8];
  for (const a of world.alleys) {
    const gy = CITY.at((a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2) + CITY.curb;
    const vertical = a.vertical;
    const L = vertical ? a.z1 - a.z0 : a.x1 - a.x0;
    const W = vertical ? a.x1 - a.x0 : a.z1 - a.z0;
    const at = (t, s, y) => (vertical ? [s ? a.x1 : a.x0, y, a.z0 + t] : [a.x0 + t, y, s ? a.z1 : a.z0]);
    // buildings lining each side of the alley
    const sideBld = [0, 1].map((s) => world.buildings.filter((b) => b.blk === a.blk && (vertical
      ? Math.abs((s ? b.x - b.hx : b.x + b.hx) - (s ? a.x1 : a.x0)) < 3.5
      : Math.abs((s ? b.z - b.hz : b.z + b.hz) - (s ? a.z1 : a.z0)) < 3.5)));
    // fire escapes
    for (let s = 0; s < 2; s++) for (const b of sideBld[s]) {
      if (b.h < 10 || R() < 0.35) continue;
      const wallPos = vertical ? (s ? b.x - b.hx : b.x + b.hx) : (s ? b.z - b.hz : b.z + b.hz);
      const c = vertical ? b.z : b.x, sign = s ? 1 : -1;
      const out = 1.1;
      for (let y = 4.2; y < Math.min(b.h - 2, 30); y += 3.4) {
        const yy = gy + y;
        if (vertical) {
          metal.push(box(out, 0.07, 3.2, 0x2a2b2d, wallPos + sign * out / 2, yy, c));
          metal.push(box(0.04, 1.0, 3.2, 0x2a2b2d, wallPos + sign * out, yy + 0.5, c));
          const st = new THREE.BoxGeometry(0.5, 0.05, 3.9); st.rotateX(Math.atan2(3.4, 3.2) * (R() < 0.5 ? 1 : -1));
          metal.push(part(st, 0x2a2b2d, wallPos + sign * out * 0.55, yy + 1.7, c));
        } else {
          metal.push(box(3.2, 0.07, out, 0x2a2b2d, c, yy, wallPos + sign * out / 2));
          metal.push(box(3.2, 1.0, 0.04, 0x2a2b2d, c, yy + 0.5, wallPos + sign * out));
          const st = new THREE.BoxGeometry(3.9, 0.05, 0.5); st.rotateZ(Math.atan2(3.4, 3.2) * (R() < 0.5 ? 1 : -1));
          metal.push(part(st, 0x2a2b2d, c, yy + 1.7, wallPos + sign * out * 0.55));
        }
      }
    }
    // laundry lines across the alley
    for (let t = 8; t < L - 6; t += 7 + R() * 6) {
      if (R() < 0.35) continue;
      const y = gy + 6 + R() * 4;
      const p0 = at(t, 0, y), p1 = at(t, 1, y);
      const line = new THREE.CylinderGeometry(0.015, 0.015, W, 4).rotateZ(Math.PI / 2);
      if (!vertical) line.rotateY(Math.PI / 2);
      metal.push(part(line, 0x222222, (p0[0] + p1[0]) / 2, y, (p0[2] + p1[2]) / 2));
      for (let k = 0; k < 4 + R() * 4; k++) {
        const f = 0.12 + R() * 0.76;
        const x = p0[0] + (p1[0] - p0[0]) * f, z = p0[2] + (p1[2] - p0[2]) * f;
        const w = 0.5 + R() * 0.5, h = 0.5 + R() * 0.5;
        const g = new THREE.PlaneGeometry(w, h);
        if (vertical) g.rotateY(Math.PI / 2);
        cloth.push(part(g, clothCols[Math.floor(R() * clothCols.length)], x, y - h / 2 - 0.02, z));
      }
    }
    // dim wall lamps
    for (let t = 6; t < L - 4; t += 11) {
      const s = Math.floor(t / 11) % 2;
      const [x, , z] = at(t, s, 0);
      const ix = vertical ? (s ? -0.25 : 0.25) : 0, iz = vertical ? 0 : (s ? -0.25 : 0.25);
      lamps.push(box(0.28, 0.2, 0.28, 0xffffff, x + ix, gy + 4.3, z + iz));
    }
    // a covered skywalk between two taller buildings
    if (sideBld[0].length && sideBld[1].length) {
      const a0 = sideBld[0].find((b) => b.h >= 17), a1 = sideBld[1].find((b) => b.h >= 17);
      if (a0 && a1) {
        const t = vertical ? (Math.max(a0.z - a0.hz, a1.z - a1.hz) + Math.min(a0.z + a0.hz, a1.z + a1.hz)) / 2 - a.z0
          : (Math.max(a0.x - a0.hx, a1.x - a1.hx) + Math.min(a0.x + a0.hx, a1.x + a1.hx)) / 2 - a.x0;
        if (t > 3 && t < L - 3) {
          const y = gy + 11 + R() * 3;
          const [x0, , z0] = at(t, 0, 0), [x1, , z1] = at(t, 1, 0);
          const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
          sky.push(vertical ? box(W + 1, 3, 3.2, 0x8a7f72, cx, y + 1.5, cz) : box(3.2, 3, W + 1, 0x8a7f72, cx, y + 1.5, cz));
          sky.push(vertical ? box(W + 1.05, 1.2, 3.25, 0x1d2830, cx, y + 1.6, cz) : box(3.25, 1.2, W + 1.05, 0x1d2830, cx, y + 1.6, cz));
        }
      }
    }
  }
  // (steel wall ladders now live in fixtures.js: their bottom sections can be torn off)
  // wooden water towers on mid-rise roofs
  for (const b of world.buildings) {
    if (b.h < 14 || b.h > 60 || b.style !== 'plain' || R() > 0.35) continue;
    const x = b.x + (R() - 0.5) * b.hx, z = b.z + (R() - 0.5) * b.hz, y = b.y + b.h + 0.3;
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) metal.push(box(0.12, 3.2, 0.12, 0x3a2f24, x + lx * 1.1, y + 1.6, z + lz * 1.1));
    sky.push(part(new THREE.CylinderGeometry(1.7, 1.7, 3.0, 14), 0x7a5a3a, x, y + 4.7, z));
    sky.push(part(new THREE.ConeGeometry(1.85, 1.3, 14), 0x4a3a2a, x, y + 6.85, z));
  }
  // rooftop billboards with retro ads
  const ads = ['FIZZ COLA', 'ACE MOTOR OIL', 'SUNNY TV', 'LUCKY RADIO', 'HOTEL METRO', 'DRIVE SAFE'];
  const adCols = [['#c8322a', '#fff3d8'], ['#1f4f9a', '#ffd23c'], ['#f0c419', '#1a1a1a'], ['#2e7d4a', '#ffffff'], ['#3a2a5a', '#ff9ad8'], ['#ff7a2a', '#1a1a1a']];
  const bc = document.createElement('canvas'); bc.width = 1024; bc.height = 512;
  const bx = bc.getContext('2d');
  ads.forEach((t, k) => {
    const x0 = (k % 2) * 512, y0 = Math.floor(k / 2) * 170;
    bx.fillStyle = adCols[k][0]; bx.fillRect(x0, y0, 512, 170);
    bx.fillStyle = adCols[k][1]; bx.font = 'bold 74px Impact, sans-serif'; bx.textAlign = 'center'; bx.textBaseline = 'middle';
    bx.fillText(t, x0 + 256, y0 + 88);
    bx.strokeStyle = adCols[k][1]; bx.lineWidth = 8; bx.strokeRect(x0 + 10, y0 + 10, 492, 150);
  });
  const btex = new THREE.CanvasTexture(bc); btex.colorSpace = THREE.SRGBColorSpace;
  const bpos = [], buv = [], bidx = [];
  for (const b of world.buildings) {
    if (b.h < 12 || b.h > 70 || b.top !== 'flat' || R() > 0.25) continue;
    const k = Math.floor(R() * ads.length);
    const u0 = (k % 2) * 0.5, u1 = u0 + 0.5, v1 = 1 - Math.floor(k / 2) * (170 / 512), v0 = v1 - 165 / 512;
    const y = b.y + (b.setback ? b.h : b.h) + 2.2, W2 = Math.min(7, b.hx * 0.9), H2 = 4.2;
    const z = b.z + (R() < 0.5 ? -1 : 1) * b.hz * 0.5;
    for (const lx of [-W2 * 0.7, W2 * 0.7]) metal.push(box(0.15, 2.4, 0.15, 0x2a2b2d, b.x + lx, y - 1.2, z));
    for (const dir of [1, -1]) {
      const base = bpos.length / 3;
      bpos.push(b.x - W2 * dir, y, z + 0.06 * dir, b.x + W2 * dir, y, z + 0.06 * dir, b.x + W2 * dir, y + H2, z + 0.06 * dir, b.x - W2 * dir, y + H2, z + 0.06 * dir);
      buv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      bidx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  if (bpos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(bpos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(buv, 2));
    g.setIndex(bidx); g.computeVertexNormals();
    mats.billboard = new THREE.MeshStandardMaterial({ map: btex, emissive: 0xffffff, emissiveMap: btex, emissiveIntensity: 0.15, roughness: 0.7 });
    scene.add(new THREE.Mesh(g, mats.billboard));
  }
  // dirt, grime and puddles on alley floors
  const grime = [], puddles = [];
  for (const a of world.alleys) {
    const gy = CITY.at((a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2) + CITY.curb;
    const vertical = a.vertical;
    const L = vertical ? a.z1 - a.z0 : a.x1 - a.x0, W = vertical ? a.x1 - a.x0 : a.z1 - a.z0;
    for (let k = 0; k < L / 4; k++) {
      const t = R() * L, v = (R() - 0.5) * (W - 0.8);
      const x = vertical ? (a.x0 + a.x1) / 2 + v : a.x0 + t, z = vertical ? a.z0 + t : (a.z0 + a.z1) / 2 + v;
      const s = 0.8 + R() * 2.4;
      const g = new THREE.CircleGeometry(s, 9); g.rotateX(-Math.PI / 2); g.scale(1, 1, 0.5 + R()); g.rotateY(R() * 6.28);
      const c = [0x2e2a24, 0x3a3328, 0x4a3f30, 0x252320][Math.floor(R() * 4)];
      (R() < 0.22 ? puddles : grime).push(part(g, c, x, gy + 0.025 + R() * 0.01, z));
    }
  }
  if (grime.length) {
    const gm = new THREE.Mesh(mergeGeometries(grime), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    gm.receiveShadow = true; scene.add(gm);
  }
  if (puddles.length) {
    const pm = new THREE.Mesh(mergeGeometries(puddles), new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    pm.receiveShadow = true; scene.add(pm);
  }
  const add = (list, mat, shadow) => {
    if (!list.length) return null;
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.castShadow = shadow; m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  add(metal.concat(sky), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide }), true);
  add(cloth, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }), true);
  mats.alleyLamp = new THREE.MeshStandardMaterial({ color: 0x777066, emissive: 0xffb866, emissiveIntensity: 0.5 });
  add(lamps, mats.alleyLamp, false);
}

// vertical neon blade signs on downtown buildings
const SIGN_WORDS = ['HOTEL', 'DINER', 'BAR', 'CAFE', 'PAWN', 'LOANS', 'MOTEL', 'PIZZA', 'DRUGS', 'LIQUOR', 'BOOKS', 'JAZZ'];
const SIGN_COLORS = ['#ff4a3a', '#ffd23c', '#3ce0ff', '#ff4ad2', '#7cff6a', '#ffffff', '#ff9a2a', '#b46aff', '#ff4a3a', '#3ce0ff', '#ffd23c', '#ff4ad2'];

export function buildShopSigns(world, scene, mats) {
  const cols = 6, rows = 2, cw = 128, ch = 512;
  const c = document.createElement('canvas');
  c.width = cols * cw; c.height = rows * ch;
  const ctx = c.getContext('2d');
  const ce = document.createElement('canvas');
  ce.width = c.width; ce.height = c.height;
  const cte = ce.getContext('2d');
  cte.fillStyle = '#000'; cte.fillRect(0, 0, ce.width, ce.height);
  SIGN_WORDS.forEach((word, k) => {
    const x0 = (k % cols) * cw, y0 = Math.floor(k / cols) * ch;
    ctx.fillStyle = '#16181c'; ctx.fillRect(x0, y0, cw, ch);
    ctx.strokeStyle = '#8a8a8a'; ctx.lineWidth = 6; ctx.strokeRect(x0 + 6, y0 + 6, cw - 12, ch - 12);
    const fs = Math.min(84, (ch - 40) / word.length);
    for (const [g, alpha] of [[ctx, 0.85], [cte, 1]]) {
      g.save();
      g.fillStyle = SIGN_COLORS[k]; g.globalAlpha = alpha;
      g.font = `bold ${fs}px Impact, "Arial Narrow", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      [...word].forEach((ch2, i) => g.fillText(ch2, x0 + cw / 2, y0 + 24 + fs * (i + 0.5) + ((ch - 48) - fs * word.length) / 2));
      g.strokeStyle = SIGN_COLORS[k]; g.lineWidth = 4;
      g.strokeRect(x0 + 14, y0 + 14, cw - 28, ch - 28);
      g.restore();
    }
  });
  const map = new THREE.CanvasTexture(c), emap = new THREE.CanvasTexture(ce);
  map.colorSpace = emap.colorSpace = THREE.SRGBColorSpace;
  mats.signs = new THREE.MeshStandardMaterial({ map, emissiveMap: emap, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.5, side: THREE.DoubleSide });
  const pos = [], uv = [], nor = [], idx = [];
  const R = mulberry32(31);
  const quad = (pts, uvs, n) => {
    const b = pos.length / 3;
    for (let i = 0; i < 4; i++) { pos.push(...pts[i]); uv.push(...uvs[i]); nor.push(...n); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  for (const b of world.buildings) {
    if (b.h < 10 || R() > 0.45) continue;
    const blk = world.cityBlockAt(b.x, b.z);
    if (!blk) continue;
    // face the nearest street
    const d = [b.x - b.hx - blk.x0, blk.x1 - b.x - b.hx, b.z - b.hz - blk.z0, blk.z1 - b.z - b.hz];
    const side = d.indexOf(Math.min(...d));
    const nx = side === 0 ? -1 : side === 1 ? 1 : 0, nz = side === 2 ? -1 : side === 3 ? 1 : 0;
    const along = (R() - 0.5) * 1.4 * (nx ? b.hz : b.hx);
    const px = b.x + nx * b.hx + (nz ? along : 0), pz = b.z + nz * b.hz + (nx ? along : 0);
    const k = Math.floor(R() * SIGN_WORDS.length);
    const u0 = (k % cols) / cols, u1 = u0 + 1 / cols, v1 = 1 - Math.floor(k / cols) / rows, v0 = v1 - 1 / rows;
    const y0 = b.y + 5.2, y1 = y0 + 4.2, out0 = 0.25, out1 = 1.35;
    // blade sticks straight out from the wall
    const ax = px + nx * out0, az = pz + nz * out0, bx = px + nx * out1, bz = pz + nz * out1;
    const sideN = nx ? [0, 0, 1] : [1, 0, 0];
    quad([[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], sideN);
    // bracket
    const br = 0.05;
    quad([[px, y1 - 0.1, pz], [bx, y1 - 0.1, bz], [bx, y1 - 0.1 + br, bz], [px, y1 - 0.1 + br, pz]], [[0, 0], [0, 0], [0, 0], [0, 0]], sideN);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, mats.signs);
  scene.add(mesh);
  return mesh;
}
