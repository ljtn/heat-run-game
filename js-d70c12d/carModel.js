// Procedural 1970s American cars. Model space: ground at y=0 (at rest), forward = -Z.
import * as THREE from 'three';
import { mergeGeometries } from '../lib/addons/utils/BufferGeometryUtils.js';

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
    L: 11.0, W: 2.5, clear: 0.32, nose: 1.3, hood: 1.4, belt: 1.6, tail: 1.6, hoodEnd: 0.03,
    cabStart: 0.035, cabEnd: 0.99, roof: 3.05, rakeF: 0.42, rakeR: 0.18, cabW: 0.99, topW: 0.95,
    bPillar: false, cPanel: 0, pillars: 7, quad: false, grilleH: 0.3, chromeBump: false, soft: true, roll: 1.8,
  },
  // box truck
  truck: {
    L: 10.2, W: 2.55, clear: 0.42, nose: 1.45, hood: 1.6, belt: 1.65, tail: 1.5, hoodEnd: 0.1,
    cabStart: 0.11, cabEnd: 0.26, roof: 3.0, rakeF: 0.5, rakeR: 0.02, cabW: 0.95, topW: 0.88,
    bPillar: false, cPanel: 0, quad: false, grilleH: 0.55, chromeBump: true, cargo: { u0: 0.275, u1: 1.0, top: 3.95 }, soft: true, roll: 1.6,
  },
  // ---- modern cars: rounder, wedgier, raked glass, body-colour bumpers, slim lamps ----
  // compact hatchback
  hatch: {
    L: 4.2, W: 1.8, clear: 0.17, nose: 0.66, hood: 0.86, belt: 0.95, tail: 1.0, hoodEnd: 0.24,
    cabStart: 0.26, cabEnd: 0.94, roof: 1.48, rakeF: 0.95, rakeR: 0.38, cabW: 0.9, topW: 0.76,
    bPillar: true, cPanel: 0.16, modern: true, roll: 2.4, arch: 0.1, grilleH: 0.26,
  },
  // mid-size sedan with a fastback-ish roof
  sedan2: {
    L: 4.85, W: 1.86, clear: 0.16, nose: 0.66, hood: 0.84, belt: 0.95, tail: 1.0, hoodEnd: 0.3,
    cabStart: 0.31, cabEnd: 0.82, roof: 1.44, rakeF: 1.0, rakeR: 0.75, cabW: 0.9, topW: 0.74,
    bPillar: true, cPanel: 0.1, modern: true, roll: 2.2, arch: 0.12, grilleH: 0.24, hips: 0.015,
  },
  // crossover SUV: tall, rounded, black cladding round the arches and sills
  suv: {
    L: 4.7, W: 1.95, clear: 0.26, nose: 0.86, hood: 1.04, belt: 1.12, tail: 1.14, hoodEnd: 0.24,
    cabStart: 0.26, cabEnd: 0.93, roof: 1.72, rakeF: 0.85, rakeR: 0.3, cabW: 0.92, topW: 0.8,
    bPillar: true, cPanel: 0.14, modern: true, roll: 2.0, arch: 0.13, grilleH: 0.34, clad: true, rails: true,
  },
  // low sports coupe
  sport: {
    L: 4.5, W: 1.92, clear: 0.13, nose: 0.56, hood: 0.74, belt: 0.84, tail: 0.92, hoodEnd: 0.36,
    cabStart: 0.37, cabEnd: 0.8, roof: 1.24, rakeF: 1.05, rakeR: 0.85, cabW: 0.86, topW: 0.68,
    bPillar: false, cPanel: 0.2, modern: true, roll: 2.6, arch: 0.12, grilleH: 0.2, hips: 0.05, spoiler: true,
  },
  // mid-engine supercar: a low, wide wedge, the cabin pushed forward, a long rear deck with a wing
  super: {
    L: 4.6, W: 2.02, clear: 0.11, nose: 0.46, hood: 0.66, belt: 0.82, tail: 0.94, hoodEnd: 0.24,
    cabStart: 0.25, cabEnd: 0.66, roof: 1.12, rakeF: 1.15, rakeR: 0.95, cabW: 0.84, topW: 0.62,
    bPillar: false, cPanel: 0.3, modern: true, roll: 2.8, arch: 0.12, grilleH: 0.18, hips: 0.07, spoiler: true, wing: true,
  },
  // ambulance: van cab with a tall box body
  ambulance: {
    L: 6.3, W: 2.2, clear: 0.28, nose: 0.95, hood: 1.05, belt: 1.12, tail: 1.1, hoodEnd: 0.14,
    cabStart: 0.15, cabEnd: 0.31, roof: 2.15, rakeF: 0.5, rakeR: 0.02, cabW: 0.95, topW: 0.93,
    bPillar: false, cPanel: 0, quad: false, grilleH: 0.5, chromeBump: true, cargo: { u0: 0.32, u1: 1.0, top: 2.8 },
  },
  // fire engine: crew cab, red locker body, ladder on the roof
  firetruck: {
    L: 9.4, W: 2.5, clear: 0.38, nose: 1.35, hood: 1.45, belt: 1.5, tail: 1.45, hoodEnd: 0.06,
    cabStart: 0.07, cabEnd: 0.3, roof: 2.95, rakeF: 0.25, rakeR: 0.02, cabW: 0.97, topW: 0.95,
    bPillar: true, cPanel: 0, quad: true, grilleH: 0.55, chromeBump: true, cargo: { u0: 0.31, u1: 1.0, top: 2.75 },
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
  const prevKey = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey') ? mat.customProgramCacheKey : null;
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|softspot'; // (keep any shader variant the material already had)
  return mat;
}

// the people's material: per car, so each car's heads and arms can move on their own (the GPU program is shared)
function folkMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const rig = { uHead: { value: Array.from({ length: 8 }, () => new THREE.Vector2()) }, uArm: { value: Array.from({ length: 8 }, () => new THREE.Vector2()) } };
  m.userData.rig = rig;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHead = rig.uHead; sh.uniforms.uArm = rig.uArm;
    sh.vertexShader = 'attribute vec2 aRig; attribute vec3 aPivot; uniform vec2 uHead[8]; uniform vec2 uArm[8];\n' +
      'vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }\n' +
      'vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }\n' +
      'vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }\n' +
      sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        int pi = int(aRig.x + 0.5); float part = aRig.y;
        vec3 d = transformed - aPivot;
        if (part > 0.5 && part < 1.5) { d = rotX(rotY(d, uHead[pi].x), uHead[pi].y); transformed = aPivot + d; }
        else if (part > 1.5) { float r = part < 2.5 ? uArm[pi].x : uArm[pi].y, side = part < 2.5 ? -1.0 : 1.0;
          d = rotZ(rotX(d, r), side * r * 0.25); transformed = aPivot + d; }`);
  };
  m.customProgramCacheKey = () => 'folk';
  return softSpot(m);
}

const shared = {};
function sharedMats() {
  if (shared.glass) return shared;
  // tinted but see-through, so you can see who's driving
  shared.glass = new THREE.MeshPhysicalMaterial({ color: 0x0e141a, roughness: 0.06, metalness: 0.05, envMapIntensity: 0.8, transparent: true, opacity: 0.62, depthWrite: false });
  shared.tire = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.93, side: THREE.DoubleSide });
  shared.whitewall = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.7 });
  shared.steel = new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.5, metalness: 0.6 });
  shared.alloy = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.85, envMapIntensity: 1.0 });
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
  hw *= st.modern ? 1 - 0.13 * Math.pow(e, 3) - 0.08 * Math.pow(e, 8) - 0.05 * Math.pow(yy, 2)
    : st.soft ? 1 - 0.06 * Math.pow(e, 6) - 0.07 * Math.pow(e, 16) - 0.03 * Math.pow(yy, 3) // big vehicles: softened corners
    : 1 - 0.09 * Math.pow(e, 5) - 0.05 * Math.pow(e, 14); // rounded corners in plan view
  if (st.hips) hw *= 1 + st.hips * Math.exp(-(((u - 0.74) / 0.09) ** 2)) * Math.sin(Math.PI * Math.min(1, yy * 1.2)); // coke-bottle rear hips
  return hw;
}

function lowerBody(st, spec, scheme, dirt = 0) {
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
    bottom = Math.min(bottom, top - 0.08); // (big wheels under a low nose: the arch stops short of the bonnet)
    const Y = bottom + (top - bottom) * yn;
    const hw = bodyHalfWidth(st, yn, u);
    // rounded nose and tail: top edge rolls back, lower valance tucks under
    const k = st.roll || 1, ex = st.modern ? 6 : st.soft ? 9 : 14;
    const roll = k * ((0.14 * Math.pow(yn, 5) + 0.07 * Math.pow(1 - yn, 3)) * Math.pow(e, ex) + 0.06 * Math.pow(Math.abs(xs), 4) * Math.pow(e, ex + 6));
    const Z = -L / 2 + u * L + (u < 0.5 ? roll : -roll);
    return [xs * hw, Y, Z];
  }, 12, 8, 44, (xn, yn, zn) => {
    if (scheme === 'police') return zn > 0.33 && zn < 0.74 && yn < 0.97 ? [0.92, 0.92, 0.9] : [0.02, 0.02, 0.025];
    if (scheme === 'bus') return yn > 0.55 && yn < 0.8 ? [0.92, 0.86, 0.68] : [0.1, 0.32, 0.2];
    if (st.clad && yn < 0.24) return [0.07, 0.07, 0.075]; // black plastic cladding along the sills
    // road grime: a brownish film thickening toward the sills (some cars much dirtier than others)
    const g = dirt * Math.pow(Math.max(0, 1 - yn / 0.42), 2);
    return [1 - g * 0.32, 1 - g * 0.38, 1 - g * 0.46];
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
// everyday cars a touch broader than first drawn (they read narrow next to the lanes)
for (const k of ['muscle', 'sedan', 'compact', 'van', 'pickup', 'hatch', 'sedan2', 'suv', 'sport', 'super', 'ambulance']) BODY_STYLES[k].W *= 1.07;
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
    // modern alloy: a low-profile tyre's bigger rim, five twin spokes and a centre cap, the barrel dark behind
    const ar = R * 0.74;
    const alloy = [new THREE.CylinderGeometry(ar, ar, W * 0.92, 22).rotateZ(Math.PI / 2)];
    const alloyDark = [new THREE.CylinderGeometry(ar * 0.94, ar * 0.94, 0.02, 22).rotateZ(Math.PI / 2).translate(W * 0.44, 0, 0)];
    for (let k = 0; k < 5; k++) for (const o of [-0.13, 0.13]) {
      const g = new THREE.BoxGeometry(0.035, ar * 0.86, 0.045).translate(W * 0.46 + 0.01, ar * 0.47, 0).rotateX(o);
      alloy.push(g.rotateX((k / 5) * Math.PI * 2));
    }
    alloy.push(new THREE.CylinderGeometry(R * 0.17, R * 0.2, 0.05, 14).rotateZ(-Math.PI / 2).translate(W * 0.47, 0, 0));
    alloy.push(new THREE.TorusGeometry(ar * 0.97, 0.018, 4, 26).rotateY(Math.PI / 2).translate(W * 0.46, 0, 0));
    wheelCache[key] = { tire, ww, wwIn, rim, cap, ribs, nut, alloy, alloyDark };
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
let policeDecal = null, taxiDecal = null, emsDecal = null, fireDecal = null;
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
  const dirt = scheme === 'plain' || scheme === 'taxi' ? Math.pow(Math.random(), 1.6) : 0.15;
  const body = addMesh(model, lowerBody(st, spec, scheme, dirt), paintMat, deformGeos);
  paintMeshes.push(body);

  // ---- greenhouse: glass, roof, pillars ----
  const cabRound = (xn, yn, zn, inset) => {
    const xs = xn * 2 - 1;
    const p = cabPoint(st, xs, yn, zn, inset);
    p[0] = xs * Math.abs(p[0]) * (1 - 0.08 * Math.pow(Math.abs(xs), 2) * Math.pow(yn, 3));
    p[1] += (st.modern ? 0.09 : st.soft ? 0.1 : 0.05) * (1 - xs * xs) * Math.pow(yn, 4) - (st.soft ? 0.08 : 0.03) * Math.pow(Math.abs(xs), 3) * Math.pow(yn, 6);
    if (st.modern || st.soft) p[1] -= (st.soft ? 0.12 : 0.06) * Math.pow(Math.abs(2 * zn - 1), st.soft ? 6 : 3) * Math.pow(yn, 3); // the roof arcs down front and back
    return p;
  };
  // bus windows: see-through dark tinted glass (you can see the seats and riders), and they can be smashed out
  const tinted = spec.style === 'bus' || spec.style === 'truck';
  const cabMat = tinted ? (M.busGlass = M.busGlass || new THREE.MeshPhysicalMaterial({ color: 0x0c1218, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.84, envMapIntensity: 0.8, depthWrite: false, side: THREE.DoubleSide })) : M.glass;
  const cabGeo = mapped((xn, yn, zn) => cabRound(xn, yn * 0.9, zn, tinted ? 0.03 : 0.03), 6, 4, tinted ? 24 : 8);
  let cab, panes = null;
  if (tinted) {
    // the glass cut into panes (windscreen, rear, and a row down each side) so a knock only breaks the nearby ones
    const src = cabGeo.index ? cabGeo.toNonIndexed() : cabGeo, P = src.attributes.position, Nn = src.attributes.normal, UV = src.attributes.uv;
    const nSeg = spec.style === 'bus' ? 8 : 1, z0 = -L / 2 + st.cabStart * L, z1 = -L / 2 + st.cabEnd * L, buckets = new Map();
    for (let t = 0; t < P.count; t += 3) {
      let cx = 0, cz = 0, nx = 0, nz = 0, ny = 0;
      for (let q = t; q < t + 3; q++) { cx += P.getX(q) / 3; cz += P.getZ(q) / 3; nx += Nn.getX(q); ny += Nn.getY(q); nz += Nn.getZ(q); }
      const len = Math.hypot(nx, ny, nz) || 1;
      const key = nz / len < -0.6 ? 'F' : nz / len > 0.6 ? 'R' : (cx < 0 ? 'L' : 'S') + Math.min(nSeg - 1, Math.max(0, Math.floor(((cz - z0) / (z1 - z0)) * nSeg)));
      (buckets.get(key) || buckets.set(key, []).get(key)).push(t);
    }
    panes = [];
    for (const [key, tris] of buckets) {
      const g = new THREE.BufferGeometry(), pos = [], nor = [], uv = [];
      let sx = 0, sz = 0;
      for (const t of tris) for (let q = t; q < t + 3; q++) { pos.push(P.getX(q), P.getY(q), P.getZ(q)); nor.push(Nn.getX(q), Nn.getY(q), Nn.getZ(q)); if (UV) uv.push(UV.getX(q), UV.getY(q)); sx += P.getX(q); sz += P.getZ(q); }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      if (UV) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      const m = addMesh(model, g, cabMat, deformGeos);
      m.receiveShadow = false; m.renderOrder = 6;
      const n = tris.length * 3;
      panes.push({ mesh: m, x: sx / n, z: sz / n, key });
    }
    cab = panes[0].mesh;
  } else {
    cab = addMesh(model, cabGeo, cabMat, deformGeos);
    cab.receiveShadow = false;
  }
  if (spec.style === 'bus') {
    // rows of seats down both sides, and a floor
    const seatMat = M.busSeat = M.busSeat || new THREE.MeshStandardMaterial({ color: 0x2f4a6a, roughness: 0.8 });
    for (let z = -L / 2 + st.cabStart * L + 2.0; z < L / 2 - 0.9; z += 0.95) for (const sx of [-1, 1]) {
      addMesh(model, boxAt(0.9, 0.12, 0.45, sx * W * 0.26, 1.35, z), seatMat, null, false);
      addMesh(model, boxAt(0.9, 0.55, 0.08, sx * W * 0.26, 1.65, z + 0.22), seatMat, null, false);
    }
    addMesh(model, boxAt(W * 0.94, 0.04, L * 0.92, 0, 0.95, 0), M.black, null, false);
  }
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
    const g = mapped((xn, yn, zn) => {
      const u = u0 + (u1 - u0) * zn, p = cabPoint(st, s, yn, u, inset0 + xn * depth);
      p[1] -= (st.soft ? 0.08 : 0.03) * Math.pow(yn, 6); // the roof's rounded edge
      if (st.modern || st.soft) p[1] -= (st.soft ? 0.12 : 0.06) * Math.pow(Math.abs(2 * u - 1), st.soft ? 6 : 3) * Math.pow(yn, 3); // and its arc down front and back
      return p;
    }, 1, 2, 2, () => (scheme === 'police' ? [0.02, 0.02, 0.025] : scheme === 'bus' ? [0.1, 0.32, 0.2] : WHITE));
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
      const u = c.u0 + (c.u1 - c.u0) * zn, xs = xn * 2 - 1, ez = Math.abs(2 * zn - 1);
      // rounded top edges and corners rather than a raw box
      const edge = st.soft ? Math.pow(Math.abs(xs), 8) * Math.pow(yn, 8) : 0, corner = st.soft ? Math.pow(ez, 10) * Math.pow(Math.abs(xs), 6) : 0;
      return [xs * (W / 2) * 0.995 * (1 - 0.05 * edge - 0.04 * corner), st.belt - 0.15 + (c.top - st.belt + 0.15) * yn - 0.12 * edge - 0.08 * Math.pow(ez, 10) * Math.pow(yn, 8), -L / 2 + u * L - (zn < 0.5 ? -1 : 1) * 0.06 * corner];
    }, st.soft ? 10 : 1, st.soft ? 8 : 1, st.soft ? 10 : 1);
    const cargoMat = scheme === 'ambulance' || scheme === 'fire' ? paintMat : softSpot(new THREE.MeshStandardMaterial({ color: [0xe8e4da, 0xd8c9a0, 0xc8d4dc][Math.floor(Math.random() * 3)], roughness: 0.6 }));
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
  const heads = [], tails = [];
  const tailMat = softSpot(new THREE.MeshStandardMaterial({ color: 0x5a0a08, emissive: 0xff1a0a, emissiveIntensity: 0.25, roughness: 0.25 }));
  const tailY = st.tail - 0.17;
  let bumperF, bumperR;
  const bumpY = st.clear + 0.13;
  // the rounded nose and tail are rolled back from the bounding box: put parts on the real surface
  const rollAt = (y, x, h) => { const yn = Math.max(0, Math.min(1, (y - st.clear) / (h - st.clear))), xs = Math.min(1, Math.abs(x) / (W / 2)); return (st.roll || 1) * ((0.14 * Math.pow(yn, 5) + 0.07 * Math.pow(1 - yn, 3)) + 0.06 * Math.pow(xs, 4)); };
  const noseZ = (y, x) => front + rollAt(y, x, st.nose) - 0.012, tailZ = (y, x) => back - rollAt(y, x, st.tail) + 0.012;
  if (st.modern) {
    // slim swept-back lamps, a small dark grille and a lower intake, body-colour bumpers, a full-width light bar at the back
    const lampY = st.nose - 0.09;
    for (const s2 of [-1, 1]) {
      const z = noseZ(lampY, W * 0.31);
      const h = new THREE.Mesh(new THREE.BoxGeometry(W * 0.2, 0.07, 0.05).rotateY(s2 * -0.35), M.head);
      h.position.set(s2 * W * 0.31, lampY, z + 0.01);
      model.add(h); heads.push(h);
      addMesh(model, new THREE.BoxGeometry(W * 0.21, 0.1, 0.04).rotateY(s2 * -0.35).translate(s2 * W * 0.31, lampY, z + 0.025), M.black, null, false);
    }
    addMesh(model, boxAt(W * 0.36, 0.09, 0.04, 0, lampY - 0.02, noseZ(lampY - 0.02, 0) + 0.02), M.black, null, false); // grille
    addMesh(model, boxAt(W * 0.52, 0.12, 0.04, 0, st.clear + 0.16, noseZ(st.clear + 0.16, W * 0.26) + 0.02), M.black, null, false); // intake
    bumperF = addMesh(model, boxAt(W * 0.6, 0.06, 0.06, 0, st.clear + 0.06, noseZ(st.clear + 0.06, W * 0.3) + 0.03), M.black, null, false);
    const tY = st.tail - 0.12;
    const t = new THREE.Mesh(new THREE.BoxGeometry(W * 0.62, 0.06, 0.03), tailMat);
    t.position.set(0, tY, tailZ(tY, W * 0.31) - 0.01);
    model.add(t); tails.push(t);
    for (const s2 of [-1, 1]) { const t2 = new THREE.Mesh(new THREE.BoxGeometry(W * 0.14, 0.12, 0.04), tailMat); t2.position.set(s2 * W * 0.33, st.tail - 0.14, tailZ(st.tail - 0.14, W * 0.4) - 0.012); model.add(t2); tails.push(t2); }
    bumperR = addMesh(model, boxAt(W * 0.6, 0.06, 0.06, 0, st.clear + 0.08, tailZ(st.clear + 0.08, W * 0.3) - 0.03), M.black, null, false);
    addMesh(model, boxAt(0.3, 0.13, 0.01, 0, st.clear + 0.24, noseZ(st.clear + 0.24, 0.15) + 0.006), M.plate, null, false);
    addMesh(model, boxAt(0.3, 0.13, 0.01, 0, st.clear + 0.36, tailZ(st.clear + 0.36, 0.15) - 0.006), M.plate, null, false);
    const bz = tailZ(st.tail, 0);
    if (st.wing) { // a proper rear wing on two struts
      for (const s2 of [-1, 1]) addMesh(model, boxAt(0.05, 0.22, 0.12, s2 * W * 0.3, st.tail + 0.12, bz - 0.2), M.black, null, false);
      addMesh(model, boxAt(W * 0.86, 0.04, 0.32, 0, st.tail + 0.25, bz - 0.2), M.black, null, false);
    } else if (st.spoiler) addMesh(model, boxAt(W * 0.7, 0.04, 0.22, 0, st.tail + 0.06, bz - 0.12), M.black, null, false);
    if (st.wing) { const u = 0.62, y = st.belt - 0.14, yn = (y - st.clear) / (profile(st, u) - st.clear); for (const s2 of [-1, 1]) addMesh(model, boxAt(0.03, 0.14, 0.46, s2 * (bodyHalfWidth(st, yn, u) - 0.005), y, -L / 2 + u * L), M.black, null, false); } // side intakes
  } else {
    addMesh(model, boxAt(W * 0.84, grH + 0.05, 0.04, 0, grY, front + 0.012), M.chrome, null, false);
    addMesh(model, boxAt(W * 0.8, grH, 0.04, 0, grY, front - 0.003), M.grille, null, false);
    for (let k = 1; k < 6; k++) addMesh(model, boxAt(W * 0.8, 0.012, 0.03, 0, grY - grH / 2 + (k * grH) / 6, front - 0.018), M.chrome, null, false);
    const headGeo = new THREE.CylinderGeometry(st.quad ? 0.085 : 0.11, st.quad ? 0.085 : 0.11, 0.04, 16).rotateX(Math.PI / 2);
    const bezelGeo = new THREE.TorusGeometry(st.quad ? 0.095 : 0.12, 0.014, 6, 18);
    const lampXs = st.quad ? [0.27, 0.37] : [0.33];
    for (const s2 of [-1, 1]) for (const fx of lampXs) {
      const x = s2 * W * fx;
      const h = new THREE.Mesh(headGeo, M.head);
      h.position.set(x, grY, front - 0.022);
      model.add(h);
      heads.push(h);
      const bz2 = new THREE.Mesh(bezelGeo, M.chrome);
      bz2.position.set(x, grY, front - 0.027);
      model.add(bz2);
    }
    // bumpers with rubber strip and amber parking lamps
    const bumpMat = st.chromeBump ? M.chrome : M.black;
    bumperF = addMesh(model, boxAt(W * 0.86, 0.2, 0.16, 0, bumpY, front - 0.04), bumpMat);
    addMesh(model, boxAt(W * 0.82, 0.04, 0.02, 0, bumpY, front - 0.125), M.black, null, false);
    for (const s2 of [-1, 1]) addMesh(model, boxAt(0.16, 0.06, 0.02, s2 * W * 0.33, bumpY - 0.05, front - 0.135), M.amber, null, false);
    bumperR = addMesh(model, boxAt(W * 0.86, 0.2, 0.16, 0, bumpY, back + 0.04), bumpMat);
    addMesh(model, boxAt(W * 0.82, 0.04, 0.02, 0, bumpY, back + 0.125), M.black, null, false);
    // license plates
    addMesh(model, boxAt(0.3, 0.15, 0.01, 0, bumpY + 0.02, front - 0.14), M.plate, null, false);
    addMesh(model, boxAt(0.3, 0.15, 0.01, 0, st.clear + 0.36, back + 0.005), M.plate, null, false);
    // ---- rear fascia ----
    addMesh(model, boxAt(W * 0.8, 0.17, 0.02, 0, tailY, back - 0.012), M.chrome, null, false);
    for (const s2 of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(W * 0.29, 0.13, 0.03), tailMat);
      t.position.set(s2 * W * 0.235, tailY, back - 0.004);
      model.add(t);
      tails.push(t);
      const rev = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.03), M.plate);
      rev.position.set(s2 * W * 0.06, tailY, back - 0.004);
      model.add(rev);
    }
  }
  // turn signals: an amber lamp at each corner, front and back, blinked by the driver
  const indicators = [-1, 1].map((s2) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x6a3a06, emissive: 0xff8a10, emissiveIntensity: 0, roughness: 0.3 });
    const iy0 = st.modern ? st.nose - 0.17 : grY - grH / 2 - 0.02, iy1 = st.modern ? st.tail - 0.2 : tailY + 0.1, ix = W * (st.modern ? 0.4 : 0.43);
    for (const [z, y] of [[st.modern ? noseZ(iy0, ix) + 0.01 : front + 0.02, iy0], [st.modern ? tailZ(iy1, ix) - 0.01 : back - 0.02, iy1]]) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.04), m);
      g.position.set(s2 * W * (st.modern ? 0.4 : 0.43), y, z);
      model.add(g);
    }
    return m;
  });
  let folkMat = null, folkN = 0;
  // ---- interior: dash, steering wheel, a driver (and sometimes passengers) behind the glass ----
  if (st !== BODY_STYLES.bus || true) {
    const isBus = st === BODY_STYLES.bus;
    const z0 = -L / 2 + st.cabStart * L, zSeat = isBus ? z0 + st.rakeF + 0.9 : z0 + (st.cabEnd - st.cabStart) * L * (st.cargo || st.bed ? 0.55 : 0.36) + st.rakeF * 0.5;
    const dashZ = z0 + st.rakeF * 0.35 + 0.15;
    addMesh(model, boxAt(W * 0.78, 0.14, 0.32, 0, st.belt - 0.02, dashZ), M.black, null, false);
    const drvX = st === BODY_STYLES.bus ? -W * 0.3 : -W * 0.22;
    addMesh(model, new THREE.TorusGeometry(0.17, 0.025, 6, 16).rotateX(-0.45).translate(drvX, st.belt + 0.08, dashZ + 0.32), M.black, null, false);
    const headY = isBus ? 2.0 : st.belt + Math.min(0.36, (st.roof - st.belt) * 0.62) - 0.03;
    const skins = [0xf1c8a8, 0xd8a47a, 0xa86f48, 0x6e4628, 0xe8b896], shirts = [0x2a4a7a, 0x8a2a2a, 0x2e6a3a, 0xd8d2c4, 0x3a3a3a, 0xc8a040, 0x5a3a6a];
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    // seated people: shaped head with a nose, hair (short, long, bald or a cap), neck, tapered torso with shoulders,
    // arms reaching forward (to the wheel for the driver); all of a car's people merge into one mesh
    const folk = [];
    // every piece is tagged with its person and part (0 body, 1 head, 2/3 left/right arm) and that part's pivot,
    // so the vertex shader can turn heads and raise arms without splitting the mesh
    let pIdx = 0;
    const tint = (g, hex, part = 0, pv = [0, 0, 0]) => {
      if (g.index) g = g.toNonIndexed();
      const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3), rg = new Float32Array(n * 2), pvA = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; rg[i * 2] = pIdx; rg[i * 2 + 1] = part; pvA[i * 3] = pv[0]; pvA[i * 3 + 1] = pv[1]; pvA[i * 3 + 2] = pv[2]; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.setAttribute('aRig', new THREE.BufferAttribute(rg, 2)); g.setAttribute('aPivot', new THREE.BufferAttribute(pvA, 3));
      return g;
    };
    const limb = (x0, y0, z0, x1, y1, z1, r, hex, part, pv) => {
      const L2 = Math.hypot(x1 - x0, y1 - y0, z1 - z0), g = new THREE.CylinderGeometry(r * 0.9, r, L2, 6).translate(0, L2 / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize()));
      folk.push(tint(g.translate(x0, y0, z0), hex, part, pv));
    };
    const roofEnd = -L / 2 + st.cabEnd * L - st.rakeR - 0.2; // past here the roof slopes down: no room for a head
    const person = (x, z, driver = false) => {
      if (z > roofEnd || z < z0 + st.rakeF * 0.6 || pIdx > 7) return;
      const skin = pick(skins), shirt = pick(shirts), hair = pick([0x1a1410, 0x3a2414, 0x6a4a28, 0xc8a060, 0x8a8a88, 0x2a1a10]);
      const hy = headY, neck = [x, hy - 0.12, z + 0.01];
      const H = (g, hex) => folk.push(tint(g, hex, 1, neck));
      H(new THREE.SphereGeometry(0.095, 12, 10).scale(0.88, 1.12, 1).translate(x, hy, z), skin);
      H(new THREE.BoxGeometry(0.03, 0.05, 0.04).translate(x, hy - 0.01, z - 0.09), skin); // nose
      for (const ex of [-1, 1]) H(new THREE.SphereGeometry(0.022, 6, 5).scale(0.6, 1, 1).translate(x + ex * 0.085, hy, z + 0.005), skin); // ears
      const style = Math.random();
      if (style < 0.45) H(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.9, 1.05, 1.02).translate(x, hy + 0.012, z + 0.012), hair);
      else if (style < 0.75) { // long hair down the back
        H(new THREE.SphereGeometry(0.104, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6).scale(0.92, 1.05, 1.04).translate(x, hy + 0.01, z + 0.01), hair);
        H(new THREE.BoxGeometry(0.18, 0.22, 0.06).translate(x, hy - 0.1, z + 0.08), hair);
      } else if (style < 0.88) { // a cap
        const cap = pick([0xc81e1e, 0x1e3a6a, 0x2a2a2a, 0xe8e2d4, 0x2e6a3a]);
        H(new THREE.SphereGeometry(0.102, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45).translate(x, hy + 0.02, z + 0.005), cap);
        H(new THREE.BoxGeometry(0.15, 0.015, 0.1).translate(x, hy + 0.045, z - 0.1), cap);
      } // (else bald)
      folk.push(tint(new THREE.CylinderGeometry(0.042, 0.048, 0.1, 8).translate(x, hy - 0.14, z + 0.01), skin)); // neck
      folk.push(tint(new THREE.CylinderGeometry(0.19, 0.155, 0.44, 10).scale(1, 1, 0.62).translate(x, hy - 0.4, z + 0.03), shirt)); // torso
      for (const sx of [-1, 1]) {
        folk.push(tint(new THREE.SphereGeometry(0.075, 8, 6).translate(x + sx * 0.18, hy - 0.22, z + 0.03), shirt)); // shoulder
        const part = sx < 0 ? 2 : 3, sh = [x + sx * 0.19, hy - 0.22, z + 0.03];
        const ex = x + sx * 0.21, ey = hy - 0.47, ez = z - 0.06; // elbow
        limb(sh[0], sh[1], sh[2], ex, ey, ez, 0.045, shirt, part, sh);
        const hx = driver ? drvX + sx * 0.15 : x + sx * 0.12, hY = driver ? st.belt + 0.08 : hy - 0.55, hz = driver ? dashZ + 0.3 : z - 0.3;
        limb(ex, ey, ez, hx, hY, hz, 0.038, skin, part, sh);
        folk.push(tint(new THREE.SphereGeometry(0.035, 6, 5).translate(hx, hY, hz), skin, part, sh)); // hand
      }
      pIdx++;
    };
    person(drvX, zSeat, true);
    if (scheme === 'police' || Math.random() < 0.35) person(-drvX, zSeat);
    if (st.bPillar && !st.cargo && Math.random() < 0.18) person(drvX * 0.9, zSeat + 0.9);
    if (isBus) for (let z = z0 + 2.2; z < L / 2 - 1.0; z += 0.95) if (Math.random() < 0.35) person((Math.random() < 0.5 ? -1 : 1) * W * 0.26, z + 0.05); // riders in the seats
    if (folk.length) { folkMat = folkMaterial(); addMesh(model, mergeGeometries(folk), folkMat, null, false); folkN = pIdx; }
    // wipers parked along the bottom of the windscreen, a rear-view mirror up top
    for (const wx of [-0.28, 0.12]) addMesh(model, new THREE.BoxGeometry(0.5, 0.015, 0.02).rotateZ(0.05).translate(wx * W, st.belt + 0.035, z0 + 0.06), M.black, null, false);
    addMesh(model, boxAt(0.2, 0.06, 0.03, 0, st.roof - 0.12, z0 + st.rakeF * 0.85), M.black, null, false);
  }
  if (!st.modern && !st.cargo && Math.random() < 0.55) // whip antenna on the front fender
    addMesh(model, new THREE.CylinderGeometry(0.006, 0.006, 0.8, 4).translate(W * 0.4, st.hood + 0.4, front + 0.55), M.chrome, null, false);
  if (st.modern) addMesh(model, boxAt(0.05, 0.05, 0.16, 0, st.roof + 0.02, -L / 2 + st.cabEnd * L - st.rakeR * 0.9 - 0.15), M.black, null, false); // shark-fin antenna
  if (st.rails || ((spec.style === 'sedan' || spec.style === 'compact' || spec.style === 'hatch') && Math.random() < 0.12)) {
    const za = -L / 2 + st.cabStart * L + st.rakeF, zb = -L / 2 + st.cabEnd * L - st.rakeR, zr0 = za + (zb - za) * 0.15, zr1 = zb - (zb - za) * 0.15;
    for (const s2 of [-1, 1]) addMesh(model, boxAt(0.04, 0.04, zr1 - zr0, s2 * W * st.topW * 0.36, st.roof + 0.01, (zr0 + zr1) / 2), M.black, null, false);
    if (!st.rails && Math.random() < 0.5) addMesh(model, boxAt(W * 0.6, 0.3, 1.0, 0, st.roof + 0.2, (zr0 + zr1) / 2), M.black, null, true); // luggage pod
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
    // tucked inside the body: no wider than the body there, and under the bonnet line
    const u = (zc + L / 2) / L, rad = Math.min(spec.wheelR + 0.09, profile(st, u) - 0.06 - (spec.wheelR + 0.02));
    const g = new THREE.CylinderGeometry(rad, rad, 2 * bodyHalfWidth(st, 0.3, u) - 0.06, 16, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, spec.wheelR + 0.02, zc);
    addMesh(model, g, M.under, null, false);
  }

  // ---- livery ----
  let lightbar = null;
  if (scheme === 'ambulance' || scheme === 'fire') {
    const red = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff0a0a, emissiveIntensity: 0 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x404040, emissive: scheme === 'fire' ? 0xff3010 : 0xffffff, emissiveIntensity: 0 });
    const zr = -L / 2 + st.cabStart * L + st.rakeF * 0.9 + 0.3;
    addMesh(model, boxAt(W * 0.8, 0.08, 0.3, 0, st.roof + 0.05, zr), M.chrome, null, false);
    for (const [x, m] of [[-W * 0.28, red], [-W * 0.1, blue], [W * 0.1, red], [W * 0.28, blue]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(W * 0.17, 0.13, 0.26), m); b.position.set(x, st.roof + 0.15, zr); model.add(b); }
    const c = st.cargo, zb0 = -L / 2 + c.u0 * L + 0.2, zb1 = L / 2 - 0.15;
    for (const z of [zb0, zb1]) for (const sx of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), sx < 0 ? red : blue); b.position.set(sx * (W / 2 - 0.12), c.top + 0.07, z); model.add(b); }
    lightbar = { red, blue };
    const boxLen = (c.u1 - c.u0) * L, zc = -L / 2 + (c.u0 + c.u1) / 2 * L;
    if (scheme === 'ambulance') {
      // red stripe all round the box, a red cross on the sides and back, the word on the side
      const stripe = new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.5 });
      for (const sx of [-1, 1]) addMesh(model, boxAt(0.01, 0.22, boxLen - 0.1, sx * (W / 2 + 0.003), st.belt + 0.25, zc), stripe, null, false);
      addMesh(model, boxAt(W * 0.98, 0.22, 0.01, 0, st.belt + 0.25, L / 2 + 0.006), stripe, null, false);
      const crossAt = (x, z, ry) => { for (const [w2, h2] of [[0.6, 0.18], [0.18, 0.6]]) { const g = new THREE.BoxGeometry(w2, h2, 0.01).rotateY(ry).translate(x, (st.belt + c.top) / 2 + 0.35, z); addMesh(model, g, stripe, null, false); } };
      for (const sx of [-1, 1]) crossAt(sx * (W / 2 + 0.006), zc + boxLen * 0.22, Math.PI / 2);
      crossAt(0, L / 2 + 0.008, 0);
      emsDecal = emsDecal || new THREE.MeshBasicMaterial({ map: decalTexture('AMBULANCE', null, '#c81e1e'), transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
      for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), emsDecal); p.rotation.y = sx * Math.PI / 2; p.position.set(sx * (W / 2 + 0.008), (st.belt + c.top) / 2 + 0.35, zc - boxLen * 0.18); model.add(p); }
    } else {
      // fire engine: white stripe, chrome locker door seams, a ladder and a hose reel on the roof
      const white = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.5 });
      for (const sx of [-1, 1]) {
        addMesh(model, boxAt(0.01, 0.12, L * 0.96, sx * (W / 2 + 0.004), st.belt - 0.15, 0), white, null, false);
        for (let k = 0; k <= 5; k++) addMesh(model, boxAt(0.012, c.top - st.belt - 0.1, 0.03, sx * (W / 2 + 0.005), (c.top + st.belt) / 2, -L / 2 + c.u0 * L + 0.1 + k * (boxLen - 0.2) / 5), M.chrome, null, false);
        addMesh(model, boxAt(0.012, 0.03, boxLen - 0.2, sx * (W / 2 + 0.005), (c.top + st.belt) / 2 + 0.3, zc), M.chrome, null, false);
        addMesh(model, boxAt(0.06, 0.06, L * 0.85, sx * W * 0.28, c.top + 0.45, zc - 0.6), M.chrome, null, true); // ladder rails
      }
      for (let k = 0; k < 22; k++) addMesh(model, boxAt(W * 0.56, 0.04, 0.04, 0, c.top + 0.45, -L / 2 + 0.6 + k * 0.36), M.chrome, null, false);
      for (const z of [zc - boxLen * 0.3, zc + boxLen * 0.35]) addMesh(model, boxAt(W * 0.64, 0.3, 0.12, 0, c.top + 0.2, z), M.chrome, null, false); // ladder cradles
      addMesh(model, new THREE.CylinderGeometry(0.35, 0.35, 0.6, 14).rotateZ(Math.PI / 2).translate(0, c.top + 0.35, L / 2 - 0.8), white, null, false); // hose reel
      fireDecal = fireDecal || new THREE.MeshBasicMaterial({ map: decalTexture('FIRE DEPT', null, '#f2d24a'), transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
      for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), fireDecal); p.rotation.y = sx * Math.PI / 2; p.position.set(sx * (W / 2 + 0.008), st.belt + 0.25, -L / 2 + (st.cabStart + 0.11) * L); model.add(p); }
    }
  }
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
  const whitewalls = !st.modern && scheme !== 'police' && spec.style !== 'muscle' && spec.style !== 'van' && Math.random() < 0.6;
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
    if (st.modern) { // five-spoke alloys (the "cap" here is the centre badge that can pop off)
      side.add(tire);
      for (const g of wp.alloyDark) side.add(new THREE.Mesh(g, M.black));
      wp.alloy.forEach((g, k) => side.add(new THREE.Mesh(g, k === wp.alloy.length - 2 ? M.chrome : M.alloy)));
      capMesh.scale.set(1, 0.3, 0.3);
      side.add(capMesh);
    } else {
      side.add(tire, new THREE.Mesh(wp.rim, M.steel), capMesh, new THREE.Mesh(wp.nut, M.chrome));
      for (const rg of wp.ribs) side.add(new THREE.Mesh(rg, M.chrome));
    }
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
  return { folk: folkMat ? { mat: folkMat, n: folkN, u: folkMat.userData.rig } : null, breakGlass: tinted, panes, paintHex: colorHex, root, model, body, cab, roof, wheels, tailMat, heads, tails, lightbar, beam, beams, deform, style: st, paintMeshes, parts, indicators };
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
      // panels above the impact buckle upward (hood/boot lids folding), lower ones are only pushed in:
      // never down, or the sills and bumpers sag over the wheels and the car looks sunk into the road
      const up = a[i + 1] > py ? buckle * k * (0.6 + 0.4 * Math.sin(a[i] * 9.1 + a[i + 2] * 7.3)) : 0;
      let nx = a[i] + dx * k * wr, ny = Math.max(o[i + 1] - 0.03, a[i + 1] + dy * k * 0.5 + up), nz = a[i + 2] + dz * k * wr;
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
  if (damage > 0.4 && car.cab.material !== crackedGlassMaterial() && !car.cab.material.transparent) car.cab.material = crackedGlassMaterial();
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
    car.cab.visible = true; // (smashed bus and truck windows come back with the vehicle)
    if (car.panes) for (const p of car.panes) p.mesh.visible = true;
    car.parts.bumperF.visible = car.parts.bumperR.visible = true;
    for (const c of car.parts.caps) c.visible = true;
  }
  for (const h of car.heads) h.visible = true;
  for (const t of car.tails) t.visible = true;
}
