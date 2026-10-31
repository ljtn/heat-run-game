// Procedural 1970s American cars. Model space: ground at y=0 (at rest), forward = -Z.
import * as THREE from 'three';

// u runs front (0) -> back (1). Heights in metres.
export const BODY_STYLES = {
  // hardtop muscle coupe: long hood, short deck, fastback sail panels, no B-pillar
  muscle: {
    L: 5.0, W: 2.06, clear: 0.2, nose: 0.76, hood: 0.86, belt: 0.88, tail: 0.86, hoodEnd: 0.42,
    cabStart: 0.43, cabEnd: 0.8, roof: 1.3, rakeF: 0.76, rakeR: 0.72, cabW: 0.9, topW: 0.8,
    bPillar: false, cPanel: 0.38, scoop: true, hips: 0.03, quad: true, grilleH: 0.5, chromeBump: true,
  },
  // full-size four-door: boxy, formal roofline with a wide C-pillar
  sedan: {
    L: 5.25, W: 2.08, clear: 0.2, nose: 0.8, hood: 0.88, belt: 0.92, tail: 0.92, hoodEnd: 0.33,
    cabStart: 0.34, cabEnd: 0.76, roof: 1.4, rakeF: 0.62, rakeR: 0.42, cabW: 0.9, topW: 0.84,
    bPillar: true, cPanel: 0.2, quad: true, grilleH: 0.55, chromeBump: true, hips: 0.012,
  },
  // subcompact hatch (Pinto/Gremlin vibe)
  compact: {
    L: 4.25, W: 1.82, clear: 0.18, nose: 0.74, hood: 0.84, belt: 0.88, tail: 0.92, hoodEnd: 0.27,
    cabStart: 0.28, cabEnd: 0.93, roof: 1.36, rakeF: 0.5, rakeR: 0.45, cabW: 0.9, topW: 0.82,
    bPillar: true, cPanel: 0.22, quad: false, grilleH: 0.45, chromeBump: true,
  },
  // full-size van
  van: {
    L: 5.0, W: 2.04, clear: 0.24, nose: 0.95, hood: 1.02, belt: 1.12, tail: 1.12, hoodEnd: 0.14,
    cabStart: 0.15, cabEnd: 0.985, roof: 2.06, rakeF: 0.5, rakeR: 0.03, cabW: 0.97, topW: 0.95,
    bPillar: true, cPanel: 0.72, quad: false, grilleH: 0.5, chromeBump: true,
  },
  // city transit bus
  bus: {
    L: 11.0, W: 2.5, clear: 0.32, nose: 1.2, hood: 1.24, belt: 1.25, tail: 1.25, hoodEnd: 0.03,
    cabStart: 0.035, cabEnd: 0.99, roof: 3.05, rakeF: 0.12, rakeR: 0.05, cabW: 0.99, topW: 0.97,
    bPillar: false, cPanel: 0, pillars: 7, quad: false, grilleH: 0.3, chromeBump: false,
  },
  // box truck
  truck: {
    L: 8.2, W: 2.42, clear: 0.38, nose: 1.35, hood: 1.5, belt: 1.55, tail: 1.45, hoodEnd: 0.12,
    cabStart: 0.13, cabEnd: 0.3, roof: 2.75, rakeF: 0.22, rakeR: 0.02, cabW: 0.95, topW: 0.93,
    bPillar: false, cPanel: 0, quad: false, grilleH: 0.55, chromeBump: true, cargo: { u0: 0.315, u1: 1.0, top: 3.55 },
  },
  // stepside-ish pickup
  pickup: {
    L: 5.3, W: 2.04, clear: 0.3, nose: 1.0, hood: 1.06, belt: 1.08, tail: 1.06, hoodEnd: 0.3,
    cabStart: 0.31, cabEnd: 0.53, roof: 1.8, rakeF: 0.4, rakeR: 0.04, cabW: 0.93, topW: 0.88,
    bPillar: false, cPanel: 0, quad: false, grilleH: 0.55, chromeBump: true, bed: true,
  },
};

// Car surfaces take the headlight beams (the only spot lights) at a sixth: a panel square-on to a headlight
// a few metres away would otherwise catch ~10x the light the road does and blow out to white.
export function softSpot(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin
      .replace('getSpotLightInfo( spotLight, geometryPosition, directLight );', 'getSpotLightInfo( spotLight, geometryPosition, directLight ); directLight.color *= 0.15;'));
  };
  mat.customProgramCacheKey = () => 'softspot';
  return mat;
}

const shared = {};
function sharedMats() {
  if (shared.glass) return shared;
  shared.glass = new THREE.MeshPhysicalMaterial({ color: 0x10161c, roughness: 0.08, metalness: 0.05, envMapIntensity: 0.7, clearcoat: 0.6, clearcoatRoughness: 0.05 });
  shared.tire = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.93, side: THREE.DoubleSide });
  shared.whitewall = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.7 });
  shared.steel = new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.5, metalness: 0.6 });
  shared.chrome = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.1, metalness: 1.0, envMapIntensity: 1.2 });
  shared.black = new THREE.MeshStandardMaterial({ color: 0x0e0e0f, roughness: 0.55 });
  shared.grille = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.35, metalness: 0.7 });
  shared.under = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 1, side: THREE.DoubleSide });
  shared.amber = new THREE.MeshStandardMaterial({ color: 0x7a4a08, emissive: 0xff9a1a, emissiveIntensity: 0.25, roughness: 0.3 });
  shared.plate = new THREE.MeshStandardMaterial({ color: 0xd8d2b8, roughness: 0.6 });
  shared.head = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, emissive: 0xfff3dd, emissiveIntensity: 0.0, roughness: 0.1, metalness: 0.3 });
  shared.vinyl = [0x161616, 0xe9e3d3, 0x4a3426].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
  shared.seat = new THREE.MeshStandardMaterial({ color: 0x2a1d16, roughness: 0.9 });
  for (const m of Object.values(shared).flat()) softSpot(m);
  return shared;
}
export function headlightMaterial() { return sharedMats().head; }

const paintCache = new Map();
function paint(hex) {
  if (!paintCache.has(hex)) {
    paintCache.set(hex, new THREE.MeshPhysicalMaterial({
      // a duller base coat (no broad sheet of sun across a whole panel) under a thin, sharp clearcoat:
      // the sun and sky show up as small crisp glints on curves and edges instead
      color: hex, vertexColors: true, roughness: 0.58, metalness: 0.08, clearcoat: 0.45, clearcoatRoughness: 0.05, envMapIntensity: 0.75,
    }));
    softSpot(paintCache.get(hex));
  }
  return paintCache.get(hex);
}
export function paintMaterial(hex) { return paint(hex); }

function profile(st, u) {
  const pts = [[0, st.nose], [0.025, st.hood * 0.985], [st.hoodEnd, st.hood], [st.cabStart, st.belt], [st.cabEnd, st.belt], [0.975, st.tail], [1, st.tail - 0.04]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [u0, h0] = pts[i], [u1, h1] = pts[i + 1];
    if (u <= u1) {
      const t = (u - u0) / Math.max(1e-6, u1 - u0);
      return h0 + (h1 - h0) * (t * t * (3 - 2 * t));
    }
  }
  return pts[pts.length - 1][1];
}

// box geometry whose normalised coords (0..1)^3 are mapped through fn -> [x,y,z]
function mapped(fn, sx = 1, sy = 1, sz = 1, colorFn = null) {
  const g = new THREE.BoxGeometry(1, 1, 1, sx, sy, sz);
  const p = g.attributes.position;
  const col = colorFn ? new Float32Array(p.count * 3) : null;
  for (let i = 0; i < p.count; i++) {
    const xn = p.getX(i) + 0.5, yn = p.getY(i) + 0.5, zn = p.getZ(i) + 0.5;
    const v = fn(xn, yn, zn);
    p.setXYZ(i, v[0], v[1], v[2]);
    if (col) { const c = colorFn(xn, yn, zn); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
  }
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const WHITE = [1, 1, 1];

function bodyHalfWidth(st, yy, u) {
  const W = st.W;
  const e = Math.abs(2 * u - 1);
  let hw = W / 2;
  hw *= 1 - 0.13 * Math.pow(yy, 4); // rounded shoulders / tumblehome
  hw *= 1 - 0.07 * Math.pow(1 - yy, 3); // tucked rocker
  hw *= 1 + 0.025 * Math.sin(Math.PI * Math.min(1, yy * 1.15)); // full "fuselage" sides
  hw *= 1 + 0.009 * Math.exp(-(((yy - 0.66) / 0.06) ** 2)); // character line
  hw *= 1 - 0.09 * Math.pow(e, 5) - 0.05 * Math.pow(e, 14); // rounded corners in plan view
  if (st.hips) hw *= 1 + st.hips * Math.exp(-(((u - 0.74) / 0.09) ** 2)) * Math.sin(Math.PI * Math.min(1, yy * 1.2)); // coke-bottle rear hips
  return hw;
}

function lowerBody(st, spec, scheme) {
  const L = st.L;
  const uF = (spec.frontZ + L / 2) / L, uR = (spec.rearZ + L / 2) / L;
  const ar = (spec.wheelR + 0.1) / L;
  const archTop = spec.wheelR * 2 + 0.07;
  return mapped((xn, yn, zn) => {
    const u = zn;
    let bottom = st.clear + 0.05 * Math.pow(Math.abs(2 * u - 1), 10);
    for (const uw of [uF, uR]) {
      const d = (u - uw) / ar;
      if (Math.abs(d) < 1) bottom = Math.max(bottom, st.clear + (archTop - st.clear) * Math.sqrt(1 - d * d));
    }
    const xs = xn * 2 - 1;
    const e = Math.abs(2 * u - 1);
    // crowned hood/deck: centre higher than the edges, rounding into the sides
    const crown = 0.045 * (1 - xs * xs) * Math.pow(yn, 3);
    const top = profile(st, u) + crown - 0.03 * Math.pow(Math.abs(xs), 6) * Math.pow(yn, 4);
    const Y = bottom + (top - bottom) * yn;
    const hw = bodyHalfWidth(st, yn, u);
    // rounded nose and tail: top edge rolls back, lower valance tucks under
    const roll = (0.14 * Math.pow(yn, 5) + 0.07 * Math.pow(1 - yn, 3)) * Math.pow(e, 14) + 0.06 * Math.pow(Math.abs(xs), 4) * Math.pow(e, 20);
    const Z = -L / 2 + u * L + (u < 0.5 ? roll : -roll);
    return [xs * hw, Y, Z];
  }, 12, 8, 44, (xn, yn, zn) => {
    if (scheme === 'police') return zn > 0.33 && zn < 0.74 && yn < 0.97 ? [0.92, 0.92, 0.9] : [0.02, 0.02, 0.025];
    if (scheme === 'bus') return yn > 0.55 && yn < 0.8 ? [0.92, 0.86, 0.68] : [0.1, 0.32, 0.2];
    return WHITE;
  });
}

// point on the greenhouse surface: side s (-1/1), height yy (0..1), length u (0..1), inset metres
function cabPoint(st, s, yy, u, inset = 0) {
  const L = st.L, W = st.W;
  const z0 = -L / 2 + st.cabStart * L, z1 = -L / 2 + st.cabEnd * L;
  const Y = st.belt - 0.02 + (st.roof - st.belt + 0.02) * yy;
  const zf = z0 + st.rakeF * yy, zr = z1 - st.rakeR * yy;
  const Z = zf + (zr - zf) * u;
  const hw = (W / 2) * (st.cabW + (st.topW - st.cabW) * Math.pow(yy, 1.6)) - inset;
  return [s * hw, Y, Z];
}

function addMesh(model, geo, mat, list, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow; m.receiveShadow = true;
  model.add(m);
  if (list) list.push(geo);
  return m;
}

function boxAt(w, h, d, x, y, z) { return new THREE.BoxGeometry(w, h, d).translate(x, y, z); }

let wheelCache = {};
function wheelParts(R, W) {
  const key = `${R}|${W}`;
  if (!wheelCache[key]) {
    // rounded tyre via lathe (axis along y, then rotated to x)
    const pts = [];
    const rr = R * 0.66, sh = Math.min(0.06, W * 0.25);
    pts.push(new THREE.Vector2(rr, -W / 2));
    pts.push(new THREE.Vector2(R - sh, -W / 2));
    for (let k = 0; k <= 4; k++) { const a = -Math.PI / 2 + (k / 4) * (Math.PI / 2); pts.push(new THREE.Vector2(R - sh + Math.cos(a) * sh, -W / 2 + sh + Math.sin(a) * sh)); }
    for (let k = 0; k <= 4; k++) { const a = (k / 4) * (Math.PI / 2); pts.push(new THREE.Vector2(R - sh + Math.cos(a) * sh, W / 2 - sh + Math.sin(a) * sh)); }
    pts.push(new THREE.Vector2(rr, W / 2));
    const tire = new THREE.LatheGeometry(pts, 22).rotateZ(Math.PI / 2);
    const ww = new THREE.RingGeometry(R * 0.7, R * 0.84, 22).rotateY(Math.PI / 2).translate(W / 2 + 0.002, 0, 0);
    const wwIn = ww.clone().rotateY(Math.PI);
    const rim = new THREE.CylinderGeometry(rr, rr, W * 0.9, 18).rotateZ(Math.PI / 2);
    // chrome hubcap: shallow dome with ribs so rotation is visible
    // flat "dog dish" hubcap with a shallow centre and spoke ribs so rotation reads
    const cap = new THREE.CylinderGeometry(R * 0.5, R * 0.54, 0.035, 22).rotateZ(-Math.PI / 2).translate(W * 0.46, 0, 0);
    const ribs = [new THREE.CylinderGeometry(R * 0.16, R * 0.24, 0.03, 14).rotateZ(-Math.PI / 2).translate(W * 0.48 + 0.015, 0, 0)];
    for (let k = 0; k < 5; k++) ribs.push(new THREE.BoxGeometry(0.012, R * 0.3, 0.035).translate(W * 0.48 + 0.006, R * 0.33, 0).rotateX((k / 5) * Math.PI * 2));
    const nut = new THREE.CylinderGeometry(0.03, 0.03, 0.03, 8).rotateZ(Math.PI / 2).translate(W * 0.5 + 0.02, 0, 0);
    wheelCache[key] = { tire, ww, wwIn, rim, cap, ribs, nut };
  }
  return wheelCache[key];
}

function decalTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, 256, 64); }
  ctx.fillStyle = fg;
  ctx.font = 'bold 44px Impact, "Arial Narrow", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let policeDecal = null, taxiDecal = null;
function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 32;
  const ctx = c.getContext('2d');
  for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { ctx.fillStyle = (x + y) % 2 ? '#111' : '#f2c230'; ctx.fillRect(x * 16, y * 16, 16, 16); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildCar(spec, colorHex, scheme = 'plain') {
  const st = BODY_STYLES[spec.style];
  const M = sharedMats();
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);
  const paintMat = scheme === 'police' || scheme === 'bus' ? paint(0xffffff) : paint(colorHex);
  const deformGeos = [];
  const paintMeshes = [];
  const L = st.L, W = st.W, front = -L / 2, back = L / 2;

  // ---- body ----
  const body = addMesh(model, lowerBody(st, spec, scheme), paintMat, deformGeos);
  paintMeshes.push(body);

  // ---- greenhouse: glass, roof, pillars ----
  const cabRound = (xn, yn, zn, inset) => {
    const xs = xn * 2 - 1;
    const p = cabPoint(st, xs, yn, zn, inset);
    p[0] = xs * Math.abs(p[0]) * (1 - 0.08 * Math.pow(Math.abs(xs), 2) * Math.pow(yn, 3));
    p[1] += 0.05 * (1 - xs * xs) * Math.pow(yn, 4) - 0.03 * Math.pow(Math.abs(xs), 3) * Math.pow(yn, 6);
    return p;
  };
  const cab = addMesh(model, mapped((xn, yn, zn) => cabRound(xn, yn * 0.9, zn, 0.03), 6, 4, 8), M.glass, deformGeos);
  cab.receiveShadow = false;
  // interior silhouettes (seats/headrests) seen through the glass
  const seatZ = -L / 2 + (st.cabStart + (st.cabEnd - st.cabStart) * 0.45) * L;
  addMesh(model, boxAt(W * 0.7, 0.3, 0.3, 0, st.belt - 0.06, seatZ + 0.2), M.seat, null, false);
  const vinyl = scheme === 'plain' && spec.style === 'sedan' && Math.random() < 0.45 ? M.vinyl[Math.floor(Math.random() * 3)] : null;
  const roofMat = vinyl || paintMat;
  const roofColor = scheme === 'police' ? [0.92, 0.92, 0.9] : scheme === 'bus' ? [0.92, 0.86, 0.68] : WHITE;
  const roof = addMesh(model, mapped((xn, yn, zn) => {
    const p = cabRound(xn, 1, -0.015 + zn * 1.03, -0.015);
    const xs = xn * 2 - 1;
    p[1] += yn * 0.08 - 0.07 - 0.015 * Math.pow(Math.abs(xs), 4);
    return p;
  }, 8, 1, 10, () => roofColor), roofMat, deformGeos);
  if (roofMat === paintMat) paintMeshes.push(roof);
  const pillar = (s, u0, u1, inset0 = -0.012, depth = 0.05, mat = paintMat) => {
    const g = mapped((xn, yn, zn) => cabPoint(st, s, yn, u0 + (u1 - u0) * zn, inset0 + xn * depth), 1, 2, 2, () => (scheme === 'police' ? [0.02, 0.02, 0.025] : scheme === 'bus' ? [0.1, 0.32, 0.2] : WHITE));
    const m = addMesh(model, g, mat, deformGeos);
    if (mat === paintMat) paintMeshes.push(m);
  };
  const cabLen = (st.cabEnd - st.cabStart) * L;
  const aW = 0.07 / cabLen;
  for (const s of [-1, 1]) {
    pillar(s, 0, aW * 1.4); // A
    if (st.bPillar) pillar(s, 0.47, 0.47 + aW * 1.3); // B
    if (st.cPanel > 0) pillar(s, 1 - st.cPanel, 1.0); // wide C / sail panel
    else pillar(s, 1 - aW * 1.6, 1.0);
    if (st.pillars) for (let k = 1; k <= st.pillars; k++) { const u = k / (st.pillars + 1); pillar(s, u - aW * 0.8, u + aW * 0.8); }
  }
  if (st.cargo) {
    // cargo box behind the cab
    const c = st.cargo;
    const g = mapped((xn, yn, zn) => {
      const u = c.u0 + (c.u1 - c.u0) * zn;
      return [(xn * 2 - 1) * (W / 2) * 0.995, st.belt - 0.15 + (c.top - st.belt + 0.15) * yn, -L / 2 + u * L];
    }, 1, 1, 1);
    const cargoMat = softSpot(new THREE.MeshStandardMaterial({ color: [0xe8e4da, 0xd8c9a0, 0xc8d4dc][Math.floor(Math.random() * 3)], roughness: 0.6 }));
    addMesh(model, g, cargoMat, deformGeos);
    // ribs and rear door seam
    for (let k = 1; k < 7; k++) {
      const z = -L / 2 + (c.u0 + (c.u1 - c.u0) * k / 7) * L;
      for (const sx of [-1, 1]) addMesh(model, boxAt(0.02, c.top - st.belt, 0.05, sx * W / 2, (c.top + st.belt) / 2 - 0.07, z), M.black, null, false);
    }
    addMesh(model, boxAt(0.03, c.top - st.belt - 0.2, 0.02, 0, (c.top + st.belt) / 2, L / 2 + 0.01), M.black, null, false);
  }
  // ---- side trim ----
  const beltHW = bodyHalfWidth(st, 0.9, 0.5);
  for (const s of [-1, 1]) {
    // belt chrome: follows the shoulder and the rounded ends
    addMesh(model, mapped((xn, yn, zn) => {
      const u = 0.035 + zn * 0.93;
      return [s * (bodyHalfWidth(st, 0.9, u) + 0.003 + xn * 0.012), profile(st, u) - 0.07 + yn * 0.022, -L / 2 + u * L];
    }, 1, 1, 30), M.chrome, null, false);
    // rocker chrome
    const rockY = st.clear + 0.1;
    addMesh(model, boxAt(0.02, 0.05, L * 0.42, s * (bodyHalfWidth(st, 0.08, 0.5) + 0.006), rockY, (spec.frontZ + spec.rearZ) / 2), M.chrome, null, false);
    // door gaps
    const doorFront = -L / 2 + st.cabStart * L + 0.05;
    const doorBack = st.bPillar ? -L / 2 + (st.cabStart + (st.cabEnd - st.cabStart) * 0.47) * L : -L / 2 + (st.cabStart + (st.cabEnd - st.cabStart) * 0.62) * L;
    const gapX = s * (bodyHalfWidth(st, 0.6, 0.5) + 0.003);
    const gapH = st.belt - 0.06 - (st.clear + 0.12);
    for (const z of [doorFront, doorBack].concat(st.bPillar ? [-L / 2 + (st.cabEnd - 0.03) * L] : [])) {
      addMesh(model, boxAt(0.012, gapH, 0.012, gapX, st.clear + 0.12 + gapH / 2, z), M.black, null, false);
    }
    // door handles
    addMesh(model, boxAt(0.02, 0.03, 0.17, s * (beltHW + 0.01), st.belt - 0.1, doorBack - 0.22), M.chrome, null, false);
    // side markers
    addMesh(model, boxAt(0.012, 0.04, 0.1, s * (bodyHalfWidth(st, 0.6, 0.05) + 0.004), st.hood - 0.2, front + 0.25), M.amber, null, false);
    // mirror
    addMesh(model, boxAt(0.09, 0.06, 0.08, s * (beltHW + 0.04), st.belt + 0.06, -L / 2 + st.cabStart * L + 0.3), M.chrome, null, false);
  }
  if (st.scoop) {
    // hood bulge / scoop
    const hz0 = front + 0.6, hz1 = -L / 2 + st.hoodEnd * L - 0.15;
    const g = mapped((xn, yn, zn) => {
      const z = hz0 + (hz1 - hz0) * zn;
      const u = (z + L / 2) / L;
      const base = profile(st, u) - 0.005;
      const h = 0.06 * Math.sin(Math.PI * Math.min(1, zn * 1.6)) ** 0.5;
      const w = 0.42 + 0.08 * zn;
      return [(xn * 2 - 1) * w * (1 - 0.3 * yn), base + h * yn, z];
    }, 2, 1, 6, () => WHITE);
    paintMeshes.push(addMesh(model, g, paintMat, deformGeos));
  }

  // ---- front fascia ----
  const faceH = st.nose - st.clear;
  const grY = st.clear + 0.24 + faceH * st.grilleH * 0.5 - 0.02;
  const grH = Math.max(0.2, faceH * st.grilleH);
  addMesh(model, boxAt(W * 0.84, grH + 0.05, 0.04, 0, grY, front + 0.012), M.chrome, null, false);
  addMesh(model, boxAt(W * 0.8, grH, 0.04, 0, grY, front - 0.003), M.grille, null, false);
  for (let k = 1; k < 6; k++) addMesh(model, boxAt(W * 0.8, 0.012, 0.03, 0, grY - grH / 2 + (k * grH) / 6, front - 0.018), M.chrome, null, false);
  const heads = [];
  const headGeo = new THREE.CylinderGeometry(st.quad ? 0.085 : 0.11, st.quad ? 0.085 : 0.11, 0.04, 16).rotateX(Math.PI / 2);
  const bezelGeo = new THREE.TorusGeometry(st.quad ? 0.095 : 0.12, 0.014, 6, 18);
  const lampXs = st.quad ? [0.27, 0.37] : [0.33];
  for (const s of [-1, 1]) for (const fx of lampXs) {
    const x = s * W * fx;
    const h = new THREE.Mesh(headGeo, M.head);
    h.position.set(x, grY, front - 0.022);
    model.add(h);
    heads.push(h);
    const b = new THREE.Mesh(bezelGeo, M.chrome);
    b.position.set(x, grY, front - 0.027);
    model.add(b);
  }
  // bumpers with rubber strip and amber parking lamps
  const bumpMat = st.chromeBump ? M.chrome : M.black;
  const bumpY = st.clear + 0.13;
  const bumperF = addMesh(model, boxAt(W * 0.86, 0.2, 0.16, 0, bumpY, front - 0.04), bumpMat);
  addMesh(model, boxAt(W * 0.82, 0.04, 0.02, 0, bumpY, front - 0.125), M.black, null, false);
  for (const s of [-1, 1]) addMesh(model, boxAt(0.16, 0.06, 0.02, s * W * 0.33, bumpY - 0.05, front - 0.135), M.amber, null, false);
  const bumperR = addMesh(model, boxAt(W * 0.86, 0.2, 0.16, 0, bumpY, back + 0.04), bumpMat);
  addMesh(model, boxAt(W * 0.82, 0.04, 0.02, 0, bumpY, back + 0.125), M.black, null, false);
  // license plates
  addMesh(model, boxAt(0.3, 0.15, 0.01, 0, bumpY + 0.02, front - 0.14), M.plate, null, false);
  addMesh(model, boxAt(0.3, 0.15, 0.01, 0, st.clear + 0.36, back + 0.005), M.plate, null, false);

  // ---- rear fascia ----
  const tailMat = softSpot(new THREE.MeshStandardMaterial({ color: 0x5a0a08, emissive: 0xff1a0a, emissiveIntensity: 0.25, roughness: 0.25 }));
  const tails = [];
  const tailY = st.tail - 0.17;
  addMesh(model, boxAt(W * 0.8, 0.17, 0.02, 0, tailY, back - 0.012), M.chrome, null, false);
  for (const s of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(W * 0.29, 0.13, 0.03), tailMat);
    t.position.set(s * W * 0.235, tailY, back - 0.004);
    model.add(t);
    tails.push(t);
    const rev = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.03), M.plate);
    rev.position.set(s * W * 0.06, tailY, back - 0.004);
    model.add(rev);
  }
  // dual exhaust tips
  for (const s of spec.style === 'muscle' ? [-1, 1] : [-1]) {
    addMesh(model, new THREE.CylinderGeometry(0.04, 0.04, 0.25, 10).rotateX(Math.PI / 2).translate(s * W * 0.3, st.clear + 0.02, back - 0.05), M.chrome, null, false);
  }
  if (st.bed) {
    addMesh(model, boxAt(W * 0.86, 0.04, L * 0.38, 0, st.belt - 0.35, -L / 2 + 0.77 * L), M.black, null, false);
  }

  // ---- arch liners and underbody ----
  addMesh(model, boxAt(W * 0.9, 0.1, L * 0.86, 0, st.clear + 0.06, 0), M.under, null, false);
  for (const zc of [spec.frontZ, spec.rearZ]) {
    const g = new THREE.CylinderGeometry(spec.wheelR + 0.09, spec.wheelR + 0.09, W * 0.96, 16, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, spec.wheelR + 0.02, zc);
    addMesh(model, g, M.under, null, false);
  }

  // ---- livery ----
  let lightbar = null;
  if (scheme === 'police') {
    const red = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff0a0a, emissiveIntensity: 0 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x000a40, emissive: 0x1a3cff, emissiveIntensity: 0 });
    const zr = cabPoint(st, 0, 1, 0.42)[2];
    addMesh(model, boxAt(1.3, 0.07, 0.3, 0, st.roof + 0.06, zr), M.chrome, null, false);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.16, 12), red);
    r.position.set(-0.38, st.roof + 0.17, zr);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.16, 12), blue);
    b.position.set(0.38, st.roof + 0.17, zr);
    const siren = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.22), M.chrome);
    siren.position.set(0, st.roof + 0.15, zr);
    model.add(r, b, siren);
    addMesh(model, boxAt(W * 0.62, 0.32, 0.07, 0, st.clear + 0.3, front - 0.18), M.black, null, false);
    lightbar = { red, blue };
    policeDecal = policeDecal || new THREE.MeshBasicMaterial({ map: decalTexture('POLICE', null, '#111'), transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
    const dz = -L / 2 + (st.cabStart + (st.cabEnd - st.cabStart) * 0.5) * L;
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.26), policeDecal);
      p.rotation.y = s * Math.PI / 2;
      p.position.set(s * (bodyHalfWidth(st, 0.55, 0.5) + 0.006), st.clear + (st.belt - st.clear) * 0.55, dz);
      model.add(p);
    }
  }
  if (scheme === 'taxi') {
    const zr = cabPoint(st, 0, 1, 0.5)[2];
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.2, 0.26), new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffc21c, emissiveIntensity: 0.5 }));
    sign.position.set(0, st.roof + 0.12, zr);
    model.add(sign);
    taxiDecal = taxiDecal || new THREE.MeshBasicMaterial({ map: checkerTexture(), polygonOffset: true, polygonOffsetFactor: -2 });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.5, 0.1), taxiDecal);
      p.rotation.y = s * Math.PI / 2;
      p.position.set(s * (bodyHalfWidth(st, 0.6, 0.5) + 0.006), st.belt - 0.16, -L / 2 + (st.cabStart + 0.2) * L);
      model.add(p);
    }
  }

  // ---- wheels ----
  const wp = wheelParts(spec.wheelR, spec.wheelW);
  const whitewalls = scheme !== 'police' && spec.style !== 'muscle' && spec.style !== 'van' && Math.random() < 0.6;
  const wheels = [], caps = [];
  for (let i = 0; i < 4; i++) {
    const steer = new THREE.Group();
    const spin = new THREE.Group();
    steer.add(spin);
    const outer = i % 2 === 0 ? -1 : 1; // left wheels face -x
    const side = new THREE.Group();
    side.scale.x = -outer; // our parts face +x; mirror for left side
    if (outer > 0) side.scale.x = 1;
    spin.add(side);
    const tire = new THREE.Mesh(wp.tire, M.tire);
    tire.castShadow = true;
    const capMesh = new THREE.Mesh(wp.cap, M.chrome);
    caps.push(capMesh);
    side.add(tire, new THREE.Mesh(wp.rim, M.steel), capMesh, new THREE.Mesh(wp.nut, M.chrome));
    for (const rg of wp.ribs) side.add(new THREE.Mesh(rg, M.chrome));
    if (whitewalls) side.add(new THREE.Mesh(wp.ww, M.whitewall));
    root.add(steer);
    wheels.push({ steer, spin });
  }

  // fake headlight beam on the ground (used at night for every car)
  // one ground glow per side, wider and longer, angled slightly outward; each dies with its headlights
  const beams = [-1, 1].map((s) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 36).rotateX(-Math.PI / 2).translate(0, 0, -18).rotateY(-s * 0.08).translate(s * W * 0.32, 0, -L / 2 + 0.3), beamMaterial());
    m.position.y = 0.12;
    m.renderOrder = 4;
    m.visible = false;
    m.userData.side = s;
    model.add(m);
    return m;
  });
  const beam = beams[0];

  const deform = {
    geos: deformGeos,
    orig: deformGeos.map((g) => g.attributes.position.array.slice()),
    origCol: deformGeos.map((g) => (g.attributes.color ? g.attributes.color.array.slice() : null)),
  };
  // the cab may carry extra child pieces (none); remember its intact glass
  const parts = { bumperF, bumperR, caps, glass: cab.material };
  return { paintHex: colorHex, root, model, body, cab, roof, wheels, tailMat, heads, tails, lightbar, beam, beams, deform, style: st, paintMeshes, parts };
}

let beamMat = null;
function beamMaterial() {
  if (beamMat) return beamMat;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(64, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
    const v = y / 127;
    const u = (x / 63) * 2 - 1;
    const spread = 0.3 + 0.7 * (1 - v);
    let a = Math.max(0, 1 - Math.abs(u) / spread);
    a *= Math.pow(v, 0.8) * Math.min(1, (1 - v) * 8);
    const k = (y * 64 + x) * 4;
    img.data[k] = 255; img.data[k + 1] = 236; img.data[k + 2] = 200; img.data[k + 3] = Math.floor(255 * a * a * 0.9);
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  beamMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.42, polygonOffset: true, polygonOffsetFactor: -6 });
  return beamMat;
}

let crackedGlass = null;
function crackedGlassMaterial() {
  if (crackedGlass) return crackedGlass;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#5d6a73'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(235,240,245,0.85)';
  // a couple of impact stars with spider-web rings
  for (const [cx, cy] of [[90, 120], [190, 70], [160, 200]]) {
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2 + Math.random() * 0.3;
      g.lineWidth = 1 + Math.random();
      g.beginPath(); g.moveTo(cx, cy);
      let x = cx, y = cy;
      for (let s = 0; s < 6; s++) { x += Math.cos(a + (Math.random() - 0.5) * 0.5) * 18; y += Math.sin(a + (Math.random() - 0.5) * 0.5) * 18; g.lineTo(x, y); }
      g.stroke();
    }
    for (const r of [14, 30, 52]) { g.lineWidth = 0.8; g.beginPath(); g.arc(cx, cy, r + Math.random() * 6, 0, Math.PI * 2); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  crackedGlass = softSpot(new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.1 }));
  return crackedGlass;
}

// dent the car: point & dir in model space (dir points into the car)
export function deformCar(car, px, py, pz, dx, dy, dz, amount, opts = {}) {
  const R = opts.R || 1.15, R2 = R * R, maxOff = opts.maxOff || 0.5, buckle = opts.buckle || 0;
  for (let g = 0; g < car.deform.geos.length; g++) {
    const geo = car.deform.geos[g];
    const pos = geo.attributes.position;
    const col = geo.attributes.color;
    const a = pos.array, o = car.deform.orig[g];
    let changed = false;
    for (let i = 0; i < a.length; i += 3) {
      const ex = a[i] - px, ey = a[i + 1] - py, ez = a[i + 2] - pz;
      const d2 = ex * ex + ey * ey + ez * ez;
      if (d2 > R2) continue;
      const f = 1 - Math.sqrt(d2) / R;
      const k = amount * f * f;
      // crumple with a little random wrinkle so it doesn't look like a smooth push
      const wr = 1 + (Math.sin(a[i] * 17.3 + a[i + 2] * 11.1) * 0.35);
      // panels above the impact buckle upward (hood/boot lids folding), lower ones get pushed in and down
      const up = a[i + 1] > py ? buckle * k * (0.6 + 0.4 * Math.sin(a[i] * 9.1 + a[i + 2] * 7.3)) : -k * 0.15 * f;
      let nx = a[i] + dx * k * wr, ny = a[i + 1] + dy * k * 0.5 + up, nz = a[i + 2] + dz * k * wr;
      const ox = nx - o[i], oy = ny - o[i + 1], oz = nz - o[i + 2];
      const ol = Math.hypot(ox, oy, oz);
      if (ol > maxOff) { nx = o[i] + (ox / ol) * maxOff; ny = o[i + 1] + (oy / ol) * maxOff; nz = o[i + 2] + (oz / ol) * maxOff; }
      a[i] = nx; a[i + 1] = ny; a[i + 2] = nz;
      // scuffed, scraped paint around the dent
      if (col) {
        const s = Math.min(0.85, f * amount * (opts.scuff || 5));
        const ca = col.array;
        ca[i] = ca[i] * (1 - s) + 0.22 * s; ca[i + 1] = ca[i + 1] * (1 - s) + 0.17 * s; ca[i + 2] = ca[i + 2] * (1 - s) + 0.13 * s;
      }
      changed = true;
    }
    if (changed) {
      pos.needsUpdate = true;
      if (col) col.needsUpdate = true;
      geo.computeVertexNormals();
    }
  }
}

// heavier damage: cracked windows, bumpers and hubcaps coming off. Returns detached parts for debris.
export function breakCarParts(car, damage, mz, hz, dv) {
  const out = [];
  if (damage > 0.4 && car.cab.material !== crackedGlassMaterial()) car.cab.material = crackedGlassMaterial();
  const P = car.parts;
  if (dv > 7 && mz < -hz * 0.5 && P.bumperF.visible) { P.bumperF.visible = false; out.push(P.bumperF); }
  if (dv > 7 && mz > hz * 0.5 && P.bumperR.visible) { P.bumperR.visible = false; out.push(P.bumperR); }
  if (dv > 5.5) for (const c of P.caps) if (c.visible && Math.random() < 0.25) { c.visible = false; out.push(c); break; }
  return out;
}

export function repairCar(car) {
  for (let g = 0; g < car.deform.geos.length; g++) {
    const geo = car.deform.geos[g];
    geo.attributes.position.array.set(car.deform.orig[g]);
    geo.attributes.position.needsUpdate = true;
    if (car.deform.origCol[g]) { geo.attributes.color.array.set(car.deform.origCol[g]); geo.attributes.color.needsUpdate = true; }
    geo.computeVertexNormals();
  }
  if (car.parts) {
    car.cab.material = car.parts.glass;
    car.parts.bumperF.visible = car.parts.bumperR.visible = true;
    for (const c of car.parts.caps) c.visible = true;
  }
  for (const h of car.heads) h.visible = true;
  for (const t of car.tails) t.visible = true;
}
