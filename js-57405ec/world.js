// World generation: terrain heightfield, rivers, lake, road network, city layout,
// houses, trees and static colliders. Pure data — visuals live in worldMesh.js.
import { makeNoise2D, fbm, ridged, mulberry32, clamp, lerp, smoothstep } from './noise.js';

export const SIZE = 4800;
export const HALF = SIZE / 2;
export const CELL = 5;
export const N = SIZE / CELL;
export const NV = N + 1;
export const WATER = 0;
export const BOUND = 2370;

export const CITY = { x0: -1726, z0: -622, B: 96, NX: 15, NZ: 11, y: 6, roadW: 14, curb: 0.15, walk: 4, avenueI: 11, avenueJ: 6 };
// the old core sits at (6..14, 2..10); the west districts climb a hill in terraces, the north strip is industrial
CITY.LEVEL = [28, 28, 28, 14, 14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // extra height of each north-south street line
// half widths of the north-south road in column i and the east-west road in row j (avenues are wider)
CITY.vw = (i) => (i === CITY.avenueI ? 10 : 7);
CITY.hw = (j) => (j === CITY.avenueJ ? 10 : 7);
CITY.x1 = CITY.x0 + CITY.B * CITY.NX;
CITY.z1 = CITY.z0 + CITY.B * CITY.NZ;
CITY.cx = (CITY.x0 + CITY.x1) / 2;
// ground height anywhere in the city: flat around every street line, ramping between terrace levels
// (so a block is either level, or a smooth hillside the cross streets climb)
CITY.height = (x) => {
  const u = (x - CITY.x0) / CITY.B, i = clamp(Math.floor(u), 0, CITY.NX - 1), f = u - i;
  const a = CITY.LEVEL[i], b = CITY.LEVEL[Math.min(CITY.NX, i + 1)];
  if (a === b || u < 0) return CITY.y + (u < 0 ? CITY.LEVEL[0] : a);
  const m0 = (CITY.vw(i) + CITY.walk + 1) / CITY.B, m1 = 1 - (CITY.vw(i + 1) + CITY.walk + 1) / CITY.B;
  const t = clamp((f - m0) / (m1 - m0), 0, 1);
  return CITY.y + a + (b - a) * t;
};
CITY.at = (x, z) => CITY.height(x);
// elevated expressways run through one block row (east-west) and one block column (north-south)
CITY.fwyJ = 3; CITY.fwyI = 8; // (z kept for callers: levels only vary west to east)
CITY.cz = (CITY.z0 + CITY.z1) / 2;

export const SURF = { ASPHALT: 0, CONCRETE: 1, GRASS: 2, DIRT: 3, SAND: 4, ROCK: 5, DIRTROAD: 6, FIELD: 7, SNOW: 8 };
export const SURF_NAME = ['asphalt', 'concrete', 'grass', 'dirt', 'sand', 'rock', 'dirt road', 'field'];
export const SURF_GRIP = [1.0, 0.94, 0.78, 0.76, 0.62, 0.82, 0.82, 0.72, 0.5];
export const SURF_ROLL = [0.013, 0.015, 0.045, 0.04, 0.075, 0.02, 0.03, 0.05, 0.06];
export const SURF_BUMP = [0.0, 0.0, 0.03, 0.035, 0.025, 0.02, 0.025, 0.04, 0.02];
export const SURF_DUST = [0, 0, 0.35, 0.8, 0.7, 0.3, 0.9, 0.7, 0.8];

export const ROAD_TYPES = {
  city: { width: 14, lane: 3.4, speed: 13.9 },
  avenue: { width: 20, lane: 2.6, lanes: [2.6, 6.6], speed: 15.3 },
  highway: { width: 22, lane: 2.9, lanes: [2.9, 6.4], speed: 33 },
  road: { width: 12.5, lane: 3.1, speed: 25 },
  mountain: { width: 9, lane: 2.3, speed: 16 },
  dirt: { width: 9.5, lane: 2.3, speed: 16.7 },
  village: { width: 9.5, lane: 2.4, speed: 12.5 },
};

const RIVER_CTRL = [
  [-260, -2550], [-200, -2100], [-150, -1750], [-75, -1250], [-60, -1100], [-170, -650], [-170, -350],
  [-115, -50], [-40, 300], [120, 700], [260, 920], [400, 1050],
];
export const LAKE = { x: 640, z: 1090, r: 280 };
// Primeval Valley: a drive-through prehistoric park out east, in its own flattened valley
export const PARK = { x: 1680, z: 560, r: 300, name: 'PRIMEVAL VALLEY', gate: { x: 1395, z: 470 } };
const DOWNTOWN = { x: -698, z: -8 }; // the tower core stays where the old centre was
export { DOWNTOWN };
// giant snow-capped massifs. The first has a road spiralling up to a ring round its summit.
// prof: broad bell-shaped flanks (gentle foothills you can drive up, steepening higher up);
// rough: how strongly ridges and gullies carve the flanks; stretch/ang: elongated, not round.
export const PEAKS = [
  { name: 'MOUNT MERIDIAN', x: -170, z: 1170, R: 380, top: 330, plat: [50, 110], rough: 0.22, stretch: 1.35, ang: 0, ravines: [0.9, 2.6, 4.3, 5.6] },
  { name: 'NORTH HORN', x: 300, z: -1580, R: 760, top: 560, plat: [0, 0], rough: 0.3, stretch: 1.6, ang: 0.15, ravines: [], subs: [[-260, 60, 0.75], [330, 20, 0.7]] },
  { name: 'GREY KNUCKLE', x: -1480, z: 1500, R: 720, top: 520, plat: [0, 0], rough: 0.3, stretch: 1.3, ang: -0.8, ravines: [], subs: [[200, -120, 0.7]] },
  { name: 'IRON CROWN', x: 1560, z: -1500, R: 620, top: 470, plat: [0, 0], rough: 0.3, stretch: 1.35, ang: 0.9, ravines: [], subs: [[-220, 90, 0.65]] },
];
const bell = (u) => (u >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * u));
// height of a peak's smooth profile at radius r (no rock noise)
function peakProfile(P, r) {
  if (r >= P.R) return 0;
  const [p0, p1] = P.plat;
  if (p1 > 0) {
    if (r <= p0) return P.top + 70 * (1 - (r / p0) ** 2); // rounded rocky summit dome
    if (r <= p1) return P.top;
    return P.top * bell((r - p1) / (P.R - p1));
  }
  return P.top * bell(r / P.R);
}

function catmullRom(ctrl, step) {
  const dense = [];
  const P = ctrl;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(i - 1, 0)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(i + 2, P.length - 1)];
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(segLen / 1.0));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push([P[P.length - 1][0], P[P.length - 1][1]]);
  // resample by arc length
  const out = [dense[0]];
  let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1], b = dense[i];
    let seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let sx = a[0], sz = a[1];
    while (acc + seg >= step) {
      const need = step - acc;
      const t = need / seg;
      sx = sx + (b[0] - sx) * t;
      sz = sz + (b[1] - sz) * t;
      out.push([sx, sz]);
      seg -= need;
      acc = 0;
    }
    acc += seg;
  }
  const last = dense[dense.length - 1];
  const pl = out[out.length - 1];
  if (Math.hypot(last[0] - pl[0], last[1] - pl[1]) > step * 0.35) out.push([last[0], last[1]]);
  else out[out.length - 1] = [last[0], last[1]];
  return out;
}

function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz;
  let t = L2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px, qz = az + dz * t - pz;
  return [Math.sqrt(qx * qx + qz * qz), t];
}

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

export class World {
  constructor(seed = 20261030) {
    this.seed = seed;
    this.rand = mulberry32(seed);
    this.noiseA = makeNoise2D(seed + 1);
    this.noiseB = makeNoise2D(seed + 2);
    this.noiseC = makeNoise2D(seed + 3);
    this.noiseD = makeNoise2D(seed + 4);
    this.heights = new Float32Array(NV * NV);
    this.waterDist = new Float32Array(NV * NV);
    this.surf = new Uint8Array(NV * NV);
    this.forest = new Float32Array(NV * NV);
    this.nodes = [];
    this.edges = [];
    this.bridges = [];
    this.blocks = [];
    this.buildings = [];
    this.houses = [];
    this.trees = [];
    this.rocks = [];
    this.lamps = [];
    this.trafficLights = [];
    this.parkedSpots = [];
    this.colliders = [];
    this.GC = 32;
    this.GN = Math.ceil(SIZE / this.GC);
    this.grid = new Array(this.GN * this.GN);
    this.RC = 16;
    this.RN = Math.ceil(SIZE / this.RC);
    this.roadGrid = new Array(this.RN * this.RN);
    this.villages = [];
    this.downtown = DOWNTOWN;
    this.musicSpots = [];
    this._gr = { h: 0, nx: 0, ny: 1, nz: 0, bridge: false };
    this._nr = { d: 1e9, edge: null, seg: 0, t: 0 };
    this.queryStamp = 1;
  }

  async build(progress = () => {}) {
    progress('Shaping terrain', 0.05); await yieldFrame();
    this.buildWater();
    progress('Laying roads', 0.12); await yieldFrame();
    this.buildRoadNetwork();
    this.buildRoadField();
    this.placePonds();
    progress('Raising hills', 0.2); await yieldFrame();
    this.buildBaseTerrain();
    // the ponds count as water for everything placed later (trees, houses, farms, props)
    for (let k = 0; k < this.waterDist.length; k++) if (this.pondDist[k] < this.waterDist[k]) this.waterDist[k] = this.pondDist[k];
    this.profileRoads();
    this.blendForks();
    this.flattenJunctions();
    this.findTunnels();
    progress('Grading roads', 0.4); await yieldFrame();
    this.stampRoads();
    this.buildRoadGrid();
    this.classifySurfaces();
    progress('Building the city', 0.5); await yieldFrame();
    this.buildCity();
    this.buildPark();
    this.buildVillages();
    this.buildFarms();
    // driveway cars: settle them on the final ground, and drop any left on a slope they'd roll down
    for (const h of this.houses) {
      if (!h.parked) continue;
      const p = h.parked, T = (x, z) => this.terrainHeight(x, z);
      p.y = T(p.x, p.z);
      if (Math.max(Math.abs(T(p.x + 2.5, p.z) - T(p.x - 2.5, p.z)), Math.abs(T(p.x, p.z + 2.5) - T(p.x, p.z - 2.5))) / 5 > 0.12) {
        this.parkedCars.splice(this.parkedCars.indexOf(p), 1);
        h.parked = null;
      }
    }
    progress('Planting forests', 0.6); await yieldFrame();
    this.buildCountryJumps();
    this.buildTrees();
    this.buildProps();
    this.buildBridgeColliders();
    this.buildBoundary();
    for (const c of this.colliders) this.insertCollider(c);
    progress('World ready', 0.7);
  }

  // ---------- grid helpers ----------
  idx(i, j) { return j * NV + i; }
  vx(i) { return -HALF + i * CELL; }

  sampleGrid(arr, x, z) {
    const gx = clamp((x + HALF) / CELL, 0, N - 1e-4);
    const gz = clamp((z + HALF) / CELL, 0, N - 1e-4);
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const k = j * NV + i;
    const a = arr[k], b = arr[k + 1], c = arr[k + NV], d = arr[k + NV + 1];
    if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
    return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }

  // ---------- water ----------
  lakeBank(x, z) {
    const dx = x - LAKE.x, dz = z - LAKE.z;
    const ang = Math.atan2(dz, dx);
    const R = LAKE.r + 38 * this.noiseC(Math.cos(ang) * 1.3, Math.sin(ang) * 1.3) + 18 * this.noiseC(Math.cos(ang) * 3 + 5, Math.sin(ang) * 3);
    return Math.hypot(dx, dz) - R;
  }

  buildWater() {
    const wd = this.waterDist;
    wd.fill(1e9);
    this.river = catmullRom(RIVER_CTRL, 5).map(([x, z], i) => ({ x, z, hw: 15 + 6 * this.noiseD(i * 0.02, 3.3) }));
    const R = 320;
    for (let s = 0; s < this.river.length - 1; s++) {
      const a = this.river[s], b = this.river[s + 1];
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - R + HALF) / CELL));
      const i1 = Math.min(N, Math.ceil((Math.max(a.x, b.x) + R + HALF) / CELL));
      const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - R + HALF) / CELL));
      const j1 = Math.min(N, Math.ceil((Math.max(a.z, b.z) + R + HALF) / CELL));
      for (let j = j0; j <= j1; j++) {
        const z = -HALF + j * CELL;
        for (let i = i0; i <= i1; i++) {
          const x = -HALF + i * CELL;
          const [d, t] = distToSeg(x, z, a.x, a.z, b.x, b.z);
          const bank = d - (a.hw + (b.hw - a.hw) * t);
          const k = j * NV + i;
          if (bank < wd[k]) wd[k] = bank;
        }
      }
    }
    for (let j = 0; j <= N; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i <= N; i++) {
        const x = -HALF + i * CELL;
        const lb = this.lakeBank(x, z);
        const k = j * NV + i;
        if (lb < wd[k]) wd[k] = lb;
      }
    }
  }

  // ---------- ponds and tarns: still water sitting in its own basin up in the hills ----------
  pondBank(p, x, z) {
    const dx = x - p.x, dz = z - p.z, ang = Math.atan2(dz, dx);
    return Math.hypot(dx / p.sx, dz / p.sz) - p.r * (1 + 0.22 * this.noiseC(Math.cos(ang) * 1.6 + p.seed, Math.sin(ang) * 1.6) + 0.08 * this.noiseD(Math.cos(ang) * 4 + p.seed, Math.sin(ang) * 4));
  }

  placePonds() {
    const R = mulberry32(4242), vil = [[700, -900], [1050, 550], [-950, 1150], [-1250, -1250], [PARK.x, PARK.z]];
    this.ponds = [];
    for (let tries = 0; tries < 3000 && this.ponds.length < 14; tries++) {
      const x = (R() * 2 - 1) * (HALF - 320), z = (R() * 2 - 1) * (HALF - 320);
      const r = this.ponds.length < 4 ? 70 + R() * 50 : 26 + R() * 40;
      const reach = r * 1.6 + 40;
      if (this.inCityRect(x, z, 260 + reach) || this.roadFieldAt(x, z) < reach + 25) continue;
      if (vil.some(([vx, vz]) => Math.hypot(x - vx, z - vz) < 330 + reach)) continue;
      if (this.ponds.some((o) => Math.hypot(x - o.x, z - o.z) < reach + o.r * 1.6 + 120)) continue;
      if (this.sampleGrid(this.waterDist, x, z) < reach + 80) continue;
      if (PEAKS.some((P) => Math.hypot(x - P.x, z - P.z) < (P.plat[1] ? P.R * P.stretch : P.R * 0.6) + reach)) continue; // (the summit roads aren't in the road field)
      const st = 1 + R() * 0.5, sx = R() < 0.5 ? st : 1, sz = sx === 1 ? st : 1;
      // the rim: the water stands a little below its lowest point, so it can't spill out
      let lo = 1e9, hi = -1e9;
      for (let a = 0; a < 32; a++) for (const rr of [1.4, 1.8, 2.3]) {
        const px = x + Math.cos(a / 32 * 6.283) * r * rr * sx, pz = z + Math.sin(a / 32 * 6.283) * r * rr * sz;
        const wv = smoothstep(0, 340, this.sampleGrid(this.waterDist, px, pz)); // (as buildBaseTerrain will shape it)
        const h = lerp(3, this.baseHeight(px, pz), wv * wv) + this.peakHeight(px, pz);
        lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
      if (lo < 9 || hi - lo > 45 + r * 0.4) continue; // not down by the river, not on a hillside
      this.ponds.push({ x, z, r, sx, sz, level: lo - 0.9, seed: R() * 50 });
    }
    // their distance field (negative = in the water)
    const pd = (this.pondDist = new Float32Array(NV * NV).fill(1e9));
    for (const p of this.ponds) {
      const ext = p.r * 2.2 + 130;
      const i0 = Math.max(0, Math.floor((p.x - ext + HALF) / CELL)), i1 = Math.min(N, Math.ceil((p.x + ext + HALF) / CELL));
      const j0 = Math.max(0, Math.floor((p.z - ext + HALF) / CELL)), j1 = Math.min(N, Math.ceil((p.z + ext + HALF) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * NV + i, d = this.pondBank(p, -HALF + i * CELL, -HALF + j * CELL);
        if (d < pd[k]) pd[k] = d;
      }
    }
  }

  // the water surface height here (the river/lake level, or a pond's)
  waterLevelAt(x, z) {
    const p = this.pondAt(x, z, 10);
    return p ? p.level : WATER;
  }

  pondAt(x, z, margin) {
    for (const p of this.ponds) if (Math.abs(x - p.x) < p.r * 2.6 + margin + 10 && Math.abs(z - p.z) < p.r * 2.6 + margin + 10 && this.pondBank(p, x, z) < margin) return p;
    return null;
  }

  // coarse distance-to-road field (20 m grid) used to carve valleys/passes for the roads
  buildRoadField() {
    const C = 20, n = SIZE / C + 1;
    const F = new Float32Array(n * n).fill(1e9);
    const R = 300;
    for (const e of this.edges) {
      if (e.city || e.type === 'mountain') continue;
      const P = e.pts;
      for (let s = 0; s < P.length - 1; s += 3) {
        const a = P[s], b = P[Math.min(s + 3, P.length - 1)];
        const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - R + HALF) / C)), i1 = Math.min(n - 1, Math.ceil((Math.max(a.x, b.x) + R + HALF) / C));
        const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - R + HALF) / C)), j1 = Math.min(n - 1, Math.ceil((Math.max(a.z, b.z) + R + HALF) / C));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const d = distToSeg(-HALF + i * C, -HALF + j * C, a.x, a.z, b.x, b.z)[0];
          const k = j * n + i;
          if (d < F[k]) F[k] = d;
        }
      }
    }
    this.roadField = { F, C, n };
  }

  roadFieldAt(x, z) {
    const { F, C, n } = this.roadField;
    const gx = clamp((x + HALF) / C, 0, n - 1.001), gz = clamp((z + HALF) / C, 0, n - 1.001);
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    const k = j * n + i;
    return lerp(lerp(F[k], F[k + 1], fx), lerp(F[k + n], F[k + n + 1], fx), fz);
  }

  baseHeight(x, z) {
    const nA = this.noiseA, nB = this.noiseB;
    let h = 16 + fbm(nA, x / 1100, z / 1100, 4) * 30 + fbm(nA, x / 260 + 7, z / 260, 3) * 6;
    // mountains: east/north-east and north-west
    const mE = smoothstep(150, 750, x) * (1 - smoothstep(350, 900, z));
    const mNW = (1 - smoothstep(-1100, -650, z)) * (1 - smoothstep(-700, -150, x)) * 0.8;
    const mS = smoothstep(1100, 1500, z) * 0.25 + smoothstep(1250, 1550, Math.abs(x)) * 0.5;
    let m = Math.min(1, mE + mNW + mS);
    // roads run through valleys and passes
    if (this.roadField) m *= 0.38 + 0.62 * smoothstep(20, 260, this.roadFieldAt(x, z));
    // rounded ridgelines (no needle peaks): smoothed ridge octaves, coarse to fine with fast fall-off
    let rs = 0, amp = 0.55, fq = 1;
    for (let o = 0; o < 4; o++) { const t = 1 - Math.abs(nB(x / 560 * fq + o * 7.1, z / 560 * fq)); rs += t * t * (3 - 2 * t) * amp; amp *= 0.42; fq *= 2.1; }
    h += Math.max(0, rs - 0.18) * 230 * m;
    // rolling country hills (the roads ride over these: crests, dips and ridges)
    const dCity = Math.hypot(Math.max(CITY.x0 - x, 0, x - CITY.x1), Math.max(CITY.z0 - z, 0, z - CITY.z1));
    const farm = (1 - smoothstep(-500, -200, x)) * smoothstep(300, 700, z);
    const hills = smoothstep(260, 650, dCity) * (1 - farm * 0.75);
    h += (fbm(nA, x / 380 + 31, z / 380 - 17, 4) * 26 + Math.abs(fbm(nB, x / 170, z / 170, 3)) * 10) * hills;
    // farmland in the south-west: flatter
    h = lerp(h, 12 + fbm(nA, x / 700, z / 700, 3) * 8, farm * 0.8);
    // no stray ponds outside the river/lake
    if (h < 3) h = 3 - (3 - h) * 0.08;
    // rim
    const edge = Math.max(Math.abs(x), Math.abs(z));
    h += smoothstep(HALF - 130, HALF, edge) * 70;
    return h;
  }

  // the giant peaks: elongated bell profile + domain-warped ridges and gullies, sub-summits, ravines
  peakHeight(x, z) {
    let sum = 0;
    for (const P of PEAKS) {
      const dx0 = x - P.x, dz0 = z - P.z;
      if (Math.abs(dx0) > P.R * P.stretch || Math.abs(dz0) > P.R * P.stretch) continue;
      // stretched along its axis
      const ca = Math.cos(P.ang), sa = Math.sin(P.ang);
      const lu = (dx0 * ca + dz0 * sa) / P.stretch, lv = -dx0 * sa + dz0 * ca;
      const r = Math.hypot(lu, lv);
      if (r >= P.R) continue;
      const road = P.plat[1] > 0;
      let h = peakProfile(P, r);
      // secondary summits along the ridge line
      if (P.subs) for (const [su, sv, k] of P.subs) {
        const d = Math.hypot(lu - su / P.stretch, lv - sv);
        h = Math.max(h, P.top * k * bell(d / (P.R * 0.45)));
      }
      const u = r / P.R;
      // warped ridged noise: sharp crests, deep gullies, strongest mid-slope
      const wx = x + 90 * this.noiseA(x / 420 + 3, z / 420), wz = z + 90 * this.noiseA(x / 420, z / 420 - 7);
      // broad rounded spurs and valleys (no needles): one soft ridge octave plus gentle fbm
      const n1 = 1 - Math.abs(this.noiseB(wx / 520, wz / 520));
      const spur = n1 * n1 * (3 - 2 * n1); // smoothstep-rounded crest
      const roll = fbm(this.noiseB, wx / 260 + 9, wz / 260, 3);
      const env = Math.min(1, 4.2 * u * (1 - u)) * (road ? 1 : 0.6 + 0.4 * (1 - u));
      h += ((spur - 0.55) * 0.75 + roll * 0.35) * P.top * P.rough * env;
      h += fbm(this.noiseC, x / 140, z / 140, 2) * 4 * (1 - u); // small crags
      if (road && r < P.plat[1] + 10 && r > P.plat[0] - 5) h = lerp(h, P.top, 0.85); // keep the summit ring flat
      if (road) {
        const rr = r, a = Math.atan2(lv, lu);
        for (const ra of P.ravines) {
          let da = Math.abs(a - ra); if (da > Math.PI) da = Math.PI * 2 - da;
          h -= 70 * (1 - smoothstep(8, 34, da * rr)) * smoothstep(P.R * 0.8, P.R * 0.4, rr) * smoothstep(P.plat[1] + 10, P.plat[1] + 50, rr);
        }
      }
      // the big ranges let the country roads through: foothills sink away near them
      if (this.roadField) h *= 0.12 + 0.88 * (road ? smoothstep(20, 120, this.roadFieldAt(x, z)) : smoothstep(30, 260, this.roadFieldAt(x, z)));
      sum += Math.max(0, h) * smoothstep(1, 0.85, u);
    }
    return sum;
  }

  buildBaseTerrain() {
    const H = this.heights, wd = this.waterDist;
    const vil = [[700, -900], [1050, 550], [-950, 1150], [-1250, -1250]];
    const vilH = vil.map(([x, z]) => this.baseHeight(x, z));
    this.parkH = Math.max(14, this.baseHeight(PARK.x, PARK.z) * 0.5 + 10);
    for (let j = 0; j <= N; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i <= N; i++) {
        const x = -HALF + i * CELL;
        const k = j * NV + i;
        let h = this.baseHeight(x, z);
        const w = wd[k];
        // river valleys
        const valley = smoothstep(0, 340, w);
        h = lerp(3.0 + Math.max(0, w) * 0.02, h, valley * valley);
        // city plateau
        const dxC = Math.max(CITY.x0 - 40 - x, 0, x - CITY.x1 - 40);
        const dzC = Math.max(CITY.z0 - 40 - z, 0, z - CITY.z1 - 40);
        const dC = Math.hypot(dxC, dzC);
        const cm = 1 - smoothstep(0, 220, dC);
        h = lerp(h, CITY.at(clamp(x, CITY.x0, CITY.x1), z), cm);
        // village flats
        for (let v = 0; v < vil.length; v++) {
          const dv = Math.hypot(x - vil[v][0], z - vil[v][1]);
          const vm = 1 - smoothstep(80, 260, dv);
          if (vm > 0) h = lerp(h, vilH[v], vm * 0.85);
        }
        // Primeval Valley: a broad level basin with only a gentle roll to it
        { const dp = Math.hypot(x - PARK.x, z - PARK.z), pm = 1 - smoothstep(PARK.r + 40, PARK.r + 260, dp); if (pm > 0) h = lerp(h, this.parkH + fbm(this.noiseA, x / 160, z / 160, 2) * 2.5, pm); }
        // giant peaks (they rise out of the river valleys, not through them)
        const pk = this.peakHeight(x, z);
        if (pk > 0) h += pk * smoothstep(10, 480, w);
        // carve water
        if (w < 0) h = lerp(0.6, -4.5, smoothstep(0, 14, -w));
        else if (w < 30) h = lerp(0.6, h, smoothstep(0, 30, w));
        if (h > 0.6 && w < 6) h = Math.min(h, 0.6 + w * 0.5);
        const pw = this.pondDist[k];
        if (pw < 90) {
          const lv = this.pondAt(x, z, 95).level;
          if (pw < 0) h = Math.min(h, lv - 0.4 - 4.2 * smoothstep(0, 22, -pw)); // a shelving bed
          else {
            h = Math.min(h, lv + 0.35 + pw * 0.06 + smoothstep(8, 75, pw) * 140); // low, grassy banks
            h += Math.max(0, lv + 0.45 + pw * 0.05 - h) * (1 - smoothstep(40, 90, pw)); // and a gentle lip where the land dips
          }
        }
        H[k] = h;
      }
    }
  }

  // ---------- road network ----------
  addNode(x, z, opts = {}) {
    const n = { id: this.nodes.length, x, z, y: 0, edges: [], city: !!opts.city, light: null, village: opts.village || null };
    this.nodes.push(n);
    return n.id;
  }

  addEdge(a, b, ctrl, type) {
    const A = this.nodes[a], B = this.nodes[b];
    const pts = catmullRom([[A.x, A.z], ...ctrl, [B.x, B.z]], 4).map(([x, z]) => ({ x, z, y: 0 }));
    const T = ROAD_TYPES[type];
    const e = {
      id: this.edges.length, a, b, type, pts, width: T.width, halfW: T.width / 2, lane: T.lane, lanes: T.lanes || [T.lane], speed: T.speed,
      bridge: new Uint8Array(pts.length), len: 0, axis: -1, city: type === 'city' || type === 'avenue', ctrl,
    };
    this.measureEdge(e);
    e.axis = Math.abs(B.x - A.x) < Math.abs(B.z - A.z) ? 0 : 1; // 0 = NS, 1 = EW (used by traffic lights)
    this.edges.push(e);
    A.edges.push(e.id);
    B.edges.push(e.id);
    return e.id;
  }

  measureEdge(e) {
    let len = 0;
    const pts = e.pts;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    e.len = len;
    e.bridge = new Uint8Array(pts.length);
  }

  rebuildEdge(e) {
    const A = this.nodes[e.a], B = this.nodes[e.b];
    e.pts = catmullRom([[A.x, A.z], ...e.ctrl, [B.x, B.z]], 4).map(([x, z]) => ({ x, z, y: 0 }));
    this.measureEdge(e);
  }

  // cut the country road nearest to (x, z) there; returns the new junction node
  splitNear(x, z, only = null, margin = 10) {
    let e = null, bi = 10, bd = 1e18;
    for (const c of this.edges) {
      if (c.city || (only && !only(c))) continue;
      for (let i = margin; i < c.pts.length - margin; i++) {
        const d = (c.pts[i].x - x) ** 2 + (c.pts[i].z - z) ** 2;
        if (d < bd) { bd = d; bi = i; e = c; }
      }
    }
    const p = e.pts[bi];
    const nid = this.addNode(p.x, p.z, {});
    const tail = { ...e, id: this.edges.length, a: nid, pts: e.pts.slice(bi), ctrl: null };
    e.pts = e.pts.slice(0, bi + 1);
    e.ctrl = null;
    const oldB = e.b;
    e.b = nid;
    this.measureEdge(e);
    this.measureEdge(tail);
    this.edges.push(tail);
    const nb = this.nodes[oldB];
    nb.edges[nb.edges.indexOf(e.id)] = tail.id;
    this.nodes[nid].edges.push(e.id, tail.id);
    return nid;
  }

  // reshape country T-junctions so the side road peels off at a shallow angle, like a slip road
  softenJunctions() {
    for (const nd of this.nodes) {
      if (nd.city || nd.belt || nd.edges.length !== 3) continue;
      const dirs = nd.edges.map((id) => {
        const e = this.edges[id];
        const P = e.a === nd.id ? e.pts : e.pts.slice().reverse();
        const q = P[Math.min(5, P.length - 1)];
        const dx = q.x - nd.x, dz = q.z - nd.z, l = Math.hypot(dx, dz) || 1;
        return { e, x: dx / l, z: dz / l };
      });
      let bi = 0, bj = 1, best = 2;
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
        const d = dirs[i].x * dirs[j].x + dirs[i].z * dirs[j].z;
        if (d < best) { best = d; bi = i; bj = j; }
      }
      const br = dirs[3 - bi - bj];
      if (!br.e.ctrl || br.e.len < 260) continue;
      const t = [dirs[bi], dirs[bj]].sort((p, q) => (q.x * br.x + q.z * br.z) - (p.x * br.x + p.z * br.z))[0];
      if (t.x * br.x + t.z * br.z > 0.64) continue; // already a gentle fork (< ~50 degrees)
      // leave alongside the main road, then bend half-way toward the side road's own heading
      const off = t.e.halfW + br.e.halfW;
      let ax = t.x * 0.88 + br.x * 0.12, az = t.z * 0.88 + br.z * 0.12;
      let al = Math.hypot(ax, az); ax /= al; az /= al;
      let bx = t.x + br.x, bz = t.z + br.z;
      const bl = Math.hypot(bx, bz); bx /= bl; bz /= bl;
      const P0 = [nd.x + ax * (18 + off), nd.z + az * (18 + off)];
      const P1 = [nd.x + bx * (55 + off * 1.5), nd.z + bz * (55 + off * 1.5)];
      const e = br.e;
      e.ctrl = e.a === nd.id ? [P0, P1, ...e.ctrl] : [...e.ctrl, P1, P0];
      this.rebuildEdge(e);
      e.fork = { node: nd.id, through: [dirs[bi].e.id, dirs[bj].e.id] };
    }
  }

  buildRoadNetwork() {
    const { x0, z0, B, NX, NZ } = CITY;
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const id = this.addNode(x0 + i * B, z0 + j * B, { city: true });
      this.nodes[id].hx = CITY.vw(i); this.nodes[id].hz = CITY.hw(j);
    }
    const C = (i, j) => j * (NX + 1) + i;
    for (let j = 0; j <= NZ; j++) for (let i = 0; i < NX; i++) this.addEdge(C(i, j), C(i + 1, j), [], j === CITY.avenueJ ? 'avenue' : 'city');
    for (let i = 0; i <= NX; i++) for (let j = 0; j < NZ; j++) this.addEdge(C(i, j), C(i, j + 1), [], i === CITY.avenueI ? 'avenue' : 'city');
    this.cityNode = C;

    const n = (x, z, v) => this.addNode(x, z, { village: v });
    const e = (a, b, c, t) => this.addEdge(a, b, c, t);

    // beltway around the city: every street that reaches the edge continues straight out onto it
    const BN = z0 - 200, BS = CITY.z1 + 200, BW = x0 - 200, BE = CITY.x1 + 50; // east side hugs the river
    const NB = [], SB = [], WB = [], EB = [];
    for (let i = 1; i < NX; i++) { NB[i] = n(x0 + i * B, BN); SB[i] = n(x0 + i * B, BS); }
    for (let j = 1; j < NZ; j++) { WB[j] = n(BW, z0 + j * B); EB[j] = n(BE, z0 + j * B); }
    for (const id of [...NB, ...SB, ...WB, ...EB]) if (id !== undefined) this.nodes[id].belt = true;
    for (let i = 1; i < NX; i++) { e(C(i, 0), NB[i], [], 'road'); e(C(i, NZ), SB[i], [], 'road'); }
    for (let j = 1; j < NZ; j++) { e(C(0, j), WB[j], [], 'road'); e(C(NX, j), EB[j], [], 'road'); }
    for (let i = 1; i < NX - 1; i++) { e(NB[i], NB[i + 1], [], 'road'); e(SB[i], SB[i + 1], [], 'road'); }
    for (let j = 1; j < NZ - 1; j++) { e(WB[j], WB[j + 1], [], 'road'); e(EB[j], EB[j + 1], [], 'road'); }
    // rounded corners (the west ones carry a junction for the country roads)
    const r = 200, k = r * Math.SQRT1_2;
    const NWm = n(x0 - k, z0 - k), SWm = n(x0 - k, CITY.z1 + k);
    this.nodes[NWm].belt = this.nodes[SWm].belt = true;
    e(NB[1], NWm, [[x0, BN]], 'road'); e(NWm, WB[1], [[BW, z0]], 'road');
    e(WB[NZ - 1], SWm, [[BW, CITY.z1]], 'road'); e(SWm, SB[1], [[x0, BS]], 'road');
    e(NB[NX - 1], EB[1], [[CITY.x1, BN], [BE - 10, BN + 55], [BE, z0]], 'road');
    e(EB[NZ - 1], SB[NX - 1], [[BE, CITY.z1], [BE - 10, BS - 54], [CITY.x1, BS]], 'road');

    const H1 = n(300, -200), H2 = n(650, 170), VA = n(700, -900, 'Ashford'), VB = n(1050, 550, 'Lakeview');
    const JN = n(-500, -1000), HAM = n(-1250, -1250, 'Millbrook'), VC = n(-950, 1150, 'Harlow');
    const JS = n(-800, 760), L = n(420, 690), H3 = n(250, 360);
    const HW = 'highway';
    // trunk highways (two lanes each way)
    e(EB[6], H1, [[-120, -50], [40, -70], [180, -120]], HW);
    e(H1, VA, [[430, -380], [560, -600], [650, -780]], 'road');
    e(H1, H2, [[470, -20]], HW);
    e(H2, VB, [[850, 330]], HW);
    e(H1, H3, [[330, 80]], HW); // north-south link east of the river
    e(VA, VB, [[950, -1020], [1250, -880], [1380, -520], [1310, -150], [1200, 250]], 'road');
    e(NB[11], JN, [[-640, -900]], HW);
    e(JN, VA, [[-300, -1110], [-60, -1150], [160, -1180], [400, -1080], [570, -990]], HW);
    e(NWm, HAM, [[-1750, -1000], [-1500, -1200]], 'road');
    e(HAM, JN, [[-1050, -1330], [-800, -1260], [-620, -1110]], 'dirt');
    e(SB[10], JS, [], HW);
    e(JS, VC, [[-860, 960]], 'road');
    e(JS, L, [[-450, 830], [-150, 770], [120, 700], [300, 690]], HW);
    e(L, VB, [[750, 640]], HW);
    e(VC, SWm, [[-1250, 1060], [-1600, 860]], 'dirt');
    // (the old south dirt road is gone: Mount Meridian stands there now)
    e(EB[10], H3, [[-120, 350], [50, 370]], 'road');
    e(H3, H2, [[450, 270]], 'road');
    e(H3, L, [[320, 520]], HW);
    // extra country roads branching off the network for more routes
    e(NB[8], this.splitNear(-900, -1290), [[-960, -920], [-930, -1100]], 'road');
    e(NB[13], this.splitNear(-300, -1110), [[-430, -900], [-360, -1000]], 'road');
    e(SB[8], this.splitNear(-870, 980), [[-960, 800]], 'road');
    e(SB[13], this.splitNear(-300, 800), [[-430, 720]], 'road');
    e(this.splitNear(1340, -350), H2, [[1050, -150], [820, 30]], 'road'); // ridge road
    e(this.splitNear(-1250, 1000), WB[8], [[-1650, 820], [-2050, 560], [-2050, 300]], 'dirt');
    e(this.splitNear(560, -600), this.splitNear(160, -1180), [[420, -820], [260, -1000]], 'road'); // hill shortcut
    // village lanes
    const a1 = n(620, -1080), b1 = n(800, -1110);
    e(VA, a1, [[650, -1000]], 'village'); e(a1, b1, [[710, -1150]], 'village'); e(b1, VA, [[780, -1010]], 'village');
    // scenic mountain roads (they keep the mountains: cliffs on one side, drops on the other)
    e(this.splitNear(1250, -880), b1, [[1400, -1050], [1360, -1290], [1120, -1400], [900, -1310]], 'mountain');
    e(HAM, this.splitNear(-620, -1110), [[-1420, -1400], [-1200, -1480], [-900, -1460], [-680, -1330]], 'mountain');
    this.buildPeakRoad(PEAKS[0]);
    // Primeval Valley: a spur off the country road to the park gate, then a loop round the paddocks
    {
      const G = n(PARK.gate.x, PARK.gate.z), cx = PARK.x, cz = PARK.z;
      e(this.splitNear(1180, 330), G, [[1290, 400]], 'road');
      const ring = [[1515, 470], [1690, 350], [1870, 520], [1760, 760], [1540, 690]].map(([x, z]) => n(x, z));
      const ids = [e(G, ring[0], [], 'village')];
      const mids = [[1590, 380], [1810, 400], [1850, 680], [1640, 770], [1500, 580]];
      for (let k = 0; k < ring.length; k++) ids.push(e(ring[k], ring[(k + 1) % ring.length], [mids[k]], 'village'));
      for (const id of ids) this.edges[id].park = true;
      this.parkLoop = ids.slice(1);
      void cx; void cz;
    }
    const a3 = n(-1100, 1250), b3 = n(-980, 1340);
    e(VC, a3, [], 'village'); e(a3, b3, [[-1060, 1330]], 'village'); e(b3, VC, [[-920, 1250]], 'village');
    this.villages = [
      { name: 'Ashford', x: 700, z: -900, r: 230 },
      { name: 'Lakeview', x: 1050, z: 550, r: 220 },
      { name: 'Harlow', x: -950, z: 1150, r: 230 },
      { name: 'Millbrook', x: -1250, z: -1250, r: 150 },
    ];

    this.buildFreeways(BN, BS, BW, BE);
    this.softenJunctions();
    // traffic lights at city junctions with 3+ roads
    for (const nd of this.nodes) {
      if (nd.city && nd.edges.length >= 3) nd.light = { offset: this.rand() * 22 };
    }
  }

  // a road spiralling round the mountain, climbing at a steady grade, ending in a ring round the summit spire
  buildPeakRoad(P) {
    const base = this.splitNear(P.x + 100, P.z - P.R);
    const B = this.nodes[base];
    // natural ground the way buildBaseTerrain will make it (base hills, river valleys, the peak)
    const est = (x, z) => {
      const w = this.sampleGrid(this.waterDist, x, z), valley = smoothstep(0, 340, w);
      return lerp(3 + Math.max(0, w) * 0.02, this.baseHeight(x, z), valley * valley) + this.peakHeight(x, z) * smoothstep(10, 480, w) - (w < 30 ? 40 : 0);
    };
    const ca = Math.cos(P.ang), sa = Math.sin(P.ang), k = (1 + P.stretch) / 2;
    const bu = ((B.x - P.x) * ca + (B.z - P.z) * sa) / P.stretch, bv = -(B.x - P.x) * sa + (B.z - P.z) * ca;
    let th = Math.atan2(bv, bu), r = Math.hypot(bu, bv) - 30;
    const g = 0.085, end = P.plat[1] + 4, ds = 22;
    // (rr, a) in the peak's stretched frame -> world
    const at = (rr, a) => { const u = Math.cos(a) * rr * P.stretch, v = Math.sin(a) * rr; return [P.x + u * ca - v * sa, P.z + u * sa + v * ca]; };
    const ctrl = [at(r, th)];
    // climb at a steady design grade on the smooth profile; the real (noisy) ground gets cut and filled to suit
    r = Math.min(r, P.R * 0.9);
    ctrl[0] = at(r, th);
    while (r > end) {
      const dth = ds / (r * k), target = peakProfile(P, r) + g * ds;
      let lo = end - 2, hi = r;
      for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (peakProfile(P, m) > target) lo = m; else hi = m; }
      r = Math.max(end, Math.min(r - 0.5, Math.max((lo + hi) / 2, r - ds * 0.22))); // never tighten into a hairpin
      th += dth;
      ctrl.push(at(r, th));
    }
    const last = ctrl.pop();
    const T1 = this.addNode(last[0], last[1]);
    const e1 = this.addEdge(base, T1, ctrl, 'mountain');
    this.edges[e1].peak = P;
    // a spur curving in off the spiral to a ring round the summit dome (kept well clear of the last lap)
    const rr = (P.plat[0] + P.plat[1]) / 2 + 2;
    const Sp = at(rr, th + 0.55), S = this.addNode(Sp[0], Sp[1]);
    this.edges[this.addEdge(T1, S, [at(r - 6, th + 0.18), at((r + rr) / 2, th + 0.38)], 'mountain')].peak = P;
    const T2p = at(rr, th + 0.55 + Math.PI);
    const T2 = this.addNode(T2p[0], T2p[1]);
    const arc = (a0, a1) => { const o = []; for (let k = 1; k < 6; k++) o.push(at(rr, a0 + (a1 - a0) * k / 6)); return o; };
    this.edges[this.addEdge(S, T2, arc(th + 0.55, th + 0.55 + Math.PI), 'mountain')].peak = P;
    this.edges[this.addEdge(T2, S, arc(th + 0.55 + Math.PI, th + 0.55 + Math.PI * 2), 'mountain')].peak = P;
    this.peakSummit = { x: P.x, z: P.z };
  }

  // two elevated expressways across the city (east-west 11 m up, north-south 19 m up, over the top),
  // with on-ramps climbing out of street junctions alongside the deck
  buildFreeways(BN, BS, BW, BE) {
    const { x0, z0, B, NX, NZ } = CITY;
    const H = this.heights;
    const zc = z0 + (CITY.fwyJ + 0.5) * B, xc = x0 + (CITY.fwyI + 0.5) * B;
    const ground = (p) => Math.max(2, this.sampleGrid(H, p.x, p.z));
    // deck height: fixed above the city ground, easing down to the land beyond town
    // (the east-west one crosses the river on its own viaduct and lands at the eastern highway junction)
    // over the hill terraces the deck averages the ground so it climbs gently instead of stepping
    const smoothCity = (x) => { let a = 0; for (let k = -3; k <= 3; k++) a += CITY.at(clamp(x + k * 50, x0, CITY.x1), 0); return a / 7; };
    const ew = (p) => lerp(Math.max(smoothCity(p.x), CITY.at(clamp(p.x, x0, CITY.x1), 0) + 7 - 11) + 11, ground(p), Math.max(smoothstep(x0 - 10, BW + 15, p.x), smoothstep(-140, 40, p.x)));
    const ns = (p) => lerp(CITY.at(clamp(p.x, x0, CITY.x1), p.z) + 19, ground(p), Math.max(smoothstep(z0 - 10, BN + 15, p.z), smoothstep(CITY.z1 + 10, BS - 15, p.z)));
    const fw = (a, b, ctrl, f) => { const id = this.addEdge(a, b, ctrl, 'highway'); this.edges[id].elev = (p) => f(p); this.edges[id].fwy = true; return id; };
    const W = this.splitNear(BW, zc), Nn = this.splitNear(xc, BN), S = this.splitNear(xc, BS);
    const E = this.splitNear(60, -75); // T-junction on the riverside highway, east of the river
    // where the decks land, the junction sits on the ground the deck profile lands on
    for (const id of [W, Nn, S, E]) this.nodes[id].elevFn = ground; // evaluated once the terrain exists
    fw(W, E, [[x0 - 60, zc], [CITY.x1 + 20, zc], [-160, zc], [-60, zc + 4], [20, -248], [52, -165]], ew); // evenly spaced through the bend (no spline loops)
    fw(Nn, S, [[xc, z0 - 60], [xc, CITY.z1 + 60]], ns);
    // ramps: from a junction, into the corridor strip beside the deck, climbing to merge
    const ramp = (ndId, pts, merge, f) => {
      const m = this.splitNear(merge[0], merge[1], (c) => c.fwy && !c.ramp, 3);
      const M = this.nodes[m];
      M.elevY = f(M);
      const nd = this.nodes[ndId];
      const y0 = nd.y !== undefined && nd.city ? CITY.at(nd.x, nd.z) : CITY.at(nd.x, nd.z);
      const id = this.addEdge(ndId, m, pts, 'road');
      const e = this.edges[id];
      e.ramp = true;
      // flat at street level until well clear of the junction (no deck or barriers in the crossing),
      // then a steady climb that's level with the expressway before it closes in
      const s0 = Math.max(nd.hx || 7, nd.hz || 7) + 12;
      e.elev = (p, t) => lerp(y0, M.elevY, clamp((t * e.len - s0) / (0.66 * e.len - s0), 0, 1));
    };
    const C = this.cityNode;
    // a ramp in the deck's own frame: u along the deck (dir = +1/-1), v across from its centre line.
    // It climbs beside the deck, fully clear of it, reaches deck height, and only then eases in to merge.
    const rampAt = (ndId, alongX, u0, v0, dir, L, f) => {
      const side = Math.sign(v0);
      const toW = (u, v) => (alongX ? [u, zc + v] : [xc + v, u]);
      const pts = [toW(u0 + dir * 10, v0 - side * 14), toW(u0 + dir * L * 0.3, side * 27), toW(u0 + dir * L * 0.62, side * 23), toW(u0 + dir * L * 0.82, side * 13)];
      ramp(ndId, pts, toW(u0 + dir * L, 0), f);
    };
    // east-west ramps (11 m climb): north side heading east, south side heading west
    for (const i of [6, 11]) rampAt(C(i, CITY.fwyJ), true, x0 + i * B, z0 + CITY.fwyJ * B - zc, 1, 190, ew);
    for (const i of [12, 14]) rampAt(C(i, CITY.fwyJ + 1), true, x0 + i * B, z0 + (CITY.fwyJ + 1) * B - zc, -1, 190, ew);
    // north-south ramps (19 m climb, so longer): west side heading south, east side heading north
    for (const j of [0, 5]) rampAt(C(CITY.fwyI, j), false, z0 + j * B, x0 + CITY.fwyI * B - xc, 1, 290, ns);
    for (const j of [9, 10]) rampAt(C(CITY.fwyI + 1, j), false, z0 + j * B, x0 + (CITY.fwyI + 1) * B - xc, -1, 290, ns);
  }

  lightState(node, axis, time) {
    if (!node.light) return 'G';
    const t = (time + node.light.offset) % 22;
    if (axis === 0) return t < 8.5 ? 'G' : t < 11 ? 'Y' : 'R';
    return t < 11.5 ? 'R' : t < 19.5 ? 'G' : t < 21.5 ? 'Y' : 'R';
  }

  profileRoads() {
    const H = this.heights;
    for (const nd of this.nodes) nd.y = nd.city ? CITY.at(nd.x, nd.z) : nd.elevFn ? (nd.elevY = nd.elevFn(nd)) : nd.elevY !== undefined ? nd.elevY : Math.max(1.8, this.sampleGrid(H, nd.x, nd.z));
    // keep junction heights within a drivable grade of their neighbours (city nodes are fixed)
    for (let pass = 0; pass < 300; pass++) {
      for (const e of this.edges) {
        const A = this.nodes[e.a], B = this.nodes[e.b];
        const g = (e.type === 'highway' ? 0.07 : 0.09) * Math.max(e.len * 0.4, e.len - 60); // (minus the level junction pads at each end)
        if (!A.city && A.elevY === undefined) A.y = clamp(A.y, B.y - g, B.y + g);
        if (!B.city && B.elevY === undefined) B.y = clamp(B.y, A.y - g, A.y + g);
      }
    }
    for (const e of this.edges) {
      const P = e.pts, n = P.length;
      if (e.city) { for (const p of P) p.y = CITY.at(p.x, p.z); continue; }
      if (e.elev) {
        // spline overshoot at uneven control spacing can double the line back on itself: drop those points
        for (let pass = 0; pass < 6; pass++) {
          const Q = e.pts, keep = [Q[0]];
          for (let i = 1; i < Q.length - 1; i++) {
            const a = keep[keep.length - 1], b = Q[i], c = Q[i + 1];
            if ((b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z) > 0 && Math.hypot(b.x - a.x, b.z - a.z) > 0.5) keep.push(b);
          }
          keep.push(Q[Q.length - 1]);
          if (keep.length === Q.length) break;
          e.pts = keep; this.measureEdge(e);
        }
      }
      const P2 = e.pts, n2 = P2.length;
      if (e.elev) {
        const P = P2, n = n2;
        // elevated expressway / ramp: its own height profile, a bridge wherever it's well clear of the ground
        let acc = 0;
        for (let i = 0; i < n; i++) {
          if (i) acc += Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z);
          P[i].y = e.elev(P[i], acc / e.len);
          e.bridge[i] = P[i].y > this.sampleGrid(H, P[i].x, P[i].z) + (e.ramp ? 0.12 : 1.5) ? 1 : 0; // ramps are decks right from the ground
        }
        P[0].y = this.nodes[e.a].y; P[n - 1].y = this.nodes[e.b].y;
        this.addBridgeRuns(e, true);
        continue;
      }
      const nat = P.map((p) => this.sampleGrid(H, p.x, p.z));
      const wat = P.map((p) => this.sampleGrid(this.waterDist, p.x, p.z));
      for (let i = 0; i < n; i++) if (wat[i] < 3 || nat[i] < 0.8) e.bridge[i] = 1;
      // grow bridge flags slightly so abutments sit on land
      const grown = Uint8Array.from(e.bridge);
      for (let i = 0; i < n; i++) if (e.bridge[i]) for (let k = -3; k <= 3; k++) if (i + k >= 0 && i + k < n) grown[i + k] = 1;
      e.bridge = grown;
      const minY = P.map((p, i) => (e.bridge[i] ? 5.0 : 1.6));
      let y = nat.map((h, i) => Math.max(h, minY[i]));
      y[0] = this.nodes[e.a].y; y[n - 1] = this.nodes[e.b].y;
      const tmp = new Float32Array(n);
      const gmax = (e.type === 'highway' ? 0.08 : e.type === 'road' ? 0.105 : e.type === 'mountain' ? 0.12 : 0.13) * 4;
      const gradeLimit = () => {
        for (let i = 1; i < n; i++) y[i] = clamp(y[i], y[i - 1] - gmax, y[i - 1] + gmax);
        y[n - 1] = this.nodes[e.b].y;
        for (let i = n - 2; i >= 0; i--) y[i] = clamp(y[i], y[i + 1] - gmax, y[i + 1] + gmax);
        y[0] = this.nodes[e.a].y;
      };
      // highways are smoothed hard; country roads keep the land's rises and dips
      const smoothPasses = e.type === 'highway' ? 16 : 7;
      for (let pass = 0; pass < smoothPasses; pass++) {
        const W = e.type === 'highway' ? (pass < 8 ? 6 : 3) : (pass < 3 ? 4 : 2);
        for (let i = 0; i < n; i++) {
          let s = 0, c = 0;
          for (let k = -W; k <= W; k++) {
            const q = clamp(i + k, 0, n - 1);
            s += y[q]; c++;
          }
          tmp[i] = s / c;
        }
        for (let i = 1; i < n - 1; i++) y[i] = Math.max(tmp[i], minY[i]);
        y[0] = this.nodes[e.a].y; y[n - 1] = this.nodes[e.b].y;
        gradeLimit();
      }
      for (let i = 0; i < n; i++) P[i].y = y[i];
      this.addBridgeRuns(e, false);
    }
  }

  // contiguous bridge-flagged runs of an edge become bridge decks (country bridges get a vaulted hump)
  addBridgeRuns(e, flat) {
    const P = e.pts, n = P.length;
      let i = 0;
      while (i < n) {
        if (!e.bridge[i]) { i++; continue; }
        let j = i;
        while (j + 1 < n && e.bridge[j + 1]) j++;
        const s = Math.max(0, i - 1), t = Math.min(n - 1, j + 1);
        // vaulted (arched) deck: a hump you can launch off at speed
        const span = t - s;
        const hump = flat ? 0 : Math.min(3.2, span * 4 * 0.045);
        if (hump > 0 && span > 0) for (let q = s; q <= t; q++) P[q].y += hump * Math.pow(Math.sin((Math.PI * (q - s)) / span), 1.2);
        const pts = P.slice(s, t + 1);
        let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
        for (const p of pts) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z); }
        const m = e.halfW + 2;
        this.bridges.push({ edge: e.id, i0: s, i1: t, pts, halfW: e.halfW, minx: minx - m, maxx: maxx + m, minz: minz - m, maxz: maxz + m });
        i = j + 1;
      }
  }

  // where a road would sit in a very deep cutting, keep the mountain and bore a tunnel instead
  findTunnels() {
    const H = this.heights;
    this.tunnels = [];
    for (const e of this.edges) {
      if (e.city || e.type === 'village') continue;
      const P = e.pts, n = P.length;
      e.tunnel = new Uint8Array(n);
      const deep = new Uint8Array(n);
      for (let i = 1; i < n - 1; i++) {
        if (e.bridge[i]) continue;
        const p = P[i], q = P[i + 1];
        const L = Math.hypot(q.x - p.x, q.z - p.z) || 1, rx = -(q.z - p.z) / L, rz = (q.x - p.x) / L;
        const o = e.halfW + 12;
        const c = this.sampleGrid(H, p.x, p.z) - p.y;
        const l = this.sampleGrid(H, p.x + rx * o, p.z + rz * o) - p.y, r = this.sampleGrid(H, p.x - rx * o, p.z - rz * o) - p.y;
        if (c > 7.5 && l > 8 && r > 8 && this.coverOK(e, i)) deep[i] = 1;
      }
      // keep junctions out in the open
      for (const [nd, from, dir] of [[this.nodes[e.a], 0, 1], [this.nodes[e.b], n - 1, -1]]) if (nd.edges.length > 2) for (let k = 0, i = from; k < 10 && i >= 0 && i < n; k++, i += dir) deep[i] = 0;
      // bridge short gaps so a ridge with a dip becomes one long bore instead of two stubs
      for (let i = 1, last = -1; i < n - 1; i++) if (deep[i]) { if (last >= 0 && i - last < 14 && i - last > 1) for (let k = last + 1; k < i; k++) if (this.coverOK(e, k)) deep[k] = 1; last = i; }
      let i = 0;
      while (i < n) {
        if (!deep[i]) { i++; continue; }
        let j = i;
        while (j + 1 < n && deep[j + 1]) j++;
        const a = i + 3, b = j - 3; // leave a cutting at each end for the portals
        if (b - a >= 8) {
          for (let k = a; k <= b; k++) e.tunnel[k] = 1;
          const pts = P.slice(a, b + 1);
          let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
          for (const p of pts) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z); }
          const m = e.halfW + 3;
          this.tunnels.push({ edge: e.id, pts, ext: P.slice(Math.max(0, a - 3), Math.min(n, b + 4)), halfW: e.halfW, minx: minx - m, maxx: maxx + m, minz: minz - m, maxz: maxz + m });
          // tube walls
          for (let k = 0; k < pts.length - 1; k++) {
            const p = pts[k], q = pts[k + 1], L = Math.hypot(q.x - p.x, q.z - p.z) || 1, tx = (q.x - p.x) / L, tz = (q.z - p.z) / L;
            for (const sd of [-1, 1]) {
              const o = e.halfW + 1.0;
              this.colliders.push({ type: 'box', x: (p.x + q.x) / 2 - tz * o * sd, z: (p.z + q.z) / 2 + tx * o * sd, hx: L / 2 + 0.3, hz: 0.3, c: tx, s: tz, top: p.y + 6.5, tall: true, bottom: p.y - 3 });
            }
          }
        }
        i = j + 1;
      }
    }
  }

  // sometimes a glass partition splits a shop in two: smash through the café into the bar next door
  splitShop(bld, axis, R) {
    const S = bld.shop, len = axis === 'x' ? S.x1 - S.x0 : S.z1 - S.z0;
    if (len < 14 || R() > 0.5) return;
    const v = axis === 'x' ? S.x0 + len * 0.42 : S.z0 + len * 0.42;
    S.split = { axis, v };
    S.faces.push(axis === 'x' ? [v, S.z0 + 0.3, v, S.z1 - 0.3] : [S.x0 + 0.3, v, S.x1 - 0.3, v]);
    const others = ['grocery', 'cafe', 'bar', bld.gallery ? 'cafe' : 'showroom'].filter((k) => k !== bld.shopKind);
    bld.shopKind2 = others[Math.floor(R() * others.length)];
  }

  // city tunnels: a few streets run underneath buildings that bridge right across them
  buildCoveredStreets() {
    const R = this.rand;
    this.covers = [];
    const cands = this.edges.filter((e) => e.type === 'city');
    for (let tries = 0; tries < 200 && this.covers.length < 6; tries++) {
      const e = cands[Math.floor(R() * cands.length)];
      const A = this.nodes[e.a], B = this.nodes[e.b];
      const alongX = Math.abs(B.x - A.x) > Math.abs(B.z - A.z);
      const hw = alongX ? A.hz : A.hx; // half-width of this street
      const span = hw + CITY.walk + 1.5, clear = 18;
      const c = alongX
        ? { x0: Math.min(A.x, B.x) + clear, x1: Math.max(A.x, B.x) - clear, z0: A.z - span, z1: A.z + span, alongX }
        : { x0: A.x - span, x1: A.x + span, z0: Math.min(A.z, B.z) + clear, z1: Math.max(A.z, B.z) - clear, alongX };
      if (this.covers.some((o) => o.x0 < c.x1 + 60 && o.x1 > c.x0 - 60 && o.z0 < c.z1 + 60 && o.z1 > c.z0 - 60)) continue;
      if (this.bridges.some((br) => br.minx < c.x1 + 4 && br.maxx > c.x0 - 4 && br.minz < c.z1 + 4 && br.maxz > c.z0 - 4)) continue;
      if (this.excl.some((r) => r.x0 < c.x1 && r.x1 > c.x0 && r.z0 < c.z1 && r.z1 > c.z0)) continue;
      // both sides must be ordinary building blocks
      const side = (sd) => this.cityBlockAt(alongX ? (c.x0 + c.x1) / 2 : A.x + sd * (span + 4), alongX ? A.z + sd * (span + 4) : (c.z0 + c.z1) / 2);
      const b1 = side(-1), b2 = side(1);
      if (!b1 || !b2 || b1.kind !== 'build' || b2.kind !== 'build') continue;
      const y = CITY.at(c.x0, c.z0);
      if (Math.abs(CITY.at(c.x1, c.z1) - y) > 0.1) continue; // only over level streets
      c.y0 = y + 7.2; c.y1 = y + 16 + Math.floor(R() * 3) * 3.4; c.fac = Math.floor(R() * 8);
      this.covers.push(c);
      this.excl.push({ x0: c.x0 - 2, x1: c.x1 + 2, z0: c.z0, z1: c.z1 });
      const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, hx = (c.x1 - c.x0) / 2, hz = (c.z1 - c.z0) / 2;
      // the bridging building itself: you pass under it (camera stays under its ceiling)
      this.colliders.push({ type: 'box', x: cx, z: cz, hx, hz, c: 1, s: 0, top: c.y1, bottom: c.y0, tall: true });
      // support piers along the curbs
      const L = alongX ? hx * 2 : hz * 2, n = Math.max(2, Math.round(L / 12));
      c.piers = [];
      for (let k = 0; k <= n; k++) for (const sd of [-1, 1]) {
        const t = (alongX ? c.x0 : c.z0) + (L * k) / n, o = hw + 0.7;
        const px = alongX ? t : A.x + sd * o, pz = alongX ? A.z + sd * o : t;
        c.piers.push([px, pz]);
        this.colliders.push({ type: 'box', x: px, z: pz, hx: 0.45, hz: 0.45, c: 1, s: 0, top: c.y0 + 0.5, tall: true });
      }
    }
  }

  coveredAt(x, z, y) {
    if (!this.covers) return false;
    for (const c of this.covers) if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && y < c.y0) return true;
    return false;
  }

  // enough rock over the tube across its full width at point k
  coverOK(e, k) {
    const P = e.pts, p = P[k], q = P[Math.min(k + 1, P.length - 1)], H = this.heights;
    const L = Math.hypot(q.x - p.x, q.z - p.z) || 1, rx = -(q.z - p.z) / L, rz = (q.x - p.x) / L;
    for (const o of [-e.halfW - 2, -e.halfW / 2, 0, e.halfW / 2, e.halfW + 2]) if (this.sampleGrid(H, p.x + rx * o, p.z + rz * o) - p.y < 7.5) return false;
    return true;
  }

  // inside a tunnel: the road surface under (x, z) if the query point is in the tube
  // ext: also cover the approach cuttings, where the ground under the road is the road itself
  tunnelAt(x, z, yHint, ext = false) {
    for (const tn of this.tunnels) {
      if (x < tn.minx - 14 || x > tn.maxx + 14 || z < tn.minz - 14 || z > tn.maxz + 14) continue;
      const P = ext ? tn.ext : tn.pts;
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
        if (L2 < 1e-9) continue;
        const t = ((x - a.x) * dx + (z - a.z) * dz) / L2;
        if (t < -0.05 || t > 1.05) continue;
        const qx = a.x + dx * t - x, qz = a.z + dz * t - z;
        if (qx * qx + qz * qz > (tn.halfW + 1.2) ** 2) continue;
        const y = a.y + (b.y - a.y) * clamp(t, 0, 1);
        if (yHint < y + 6.5) return y;
      }
    }
    return null;
  }

  // country junctions are level pads: every road eases in to the junction height, so crossing on a hillside
  // doesn't leave one road's surface standing proud of the other's in the middle of the crossing
  flattenJunctions() {
    const touched = new Set();
    for (const nd of this.nodes) {
      if (nd.city || nd.elevY !== undefined || nd.edges.length < 3) continue;
      const es = nd.edges.map((id) => this.edges[id]).filter((e) => !e.elev);
      const R0 = Math.max(...es.map((e) => e.halfW)) + 5;
      for (const e of es) {
        // how far the road climbs away from the junction decides how long the easing is (≤ ~9% extra grade)
        let rise = 0;
        for (const p of e.pts) { const d = Math.hypot(p.x - nd.x, p.z - nd.z); if (d < R0 + 30) rise = Math.max(rise, Math.abs(p.y - nd.y)); }
        const R1 = R0 + Math.max(25, rise * 12);
        for (const p of e.pts) {
          const d = Math.hypot(p.x - nd.x, p.z - nd.z);
          if (d < R1) { const t = smoothstep(R0, R1, d); p.y = lerp(nd.y, p.y, t); }
          if (d < R0) p.pad = true;
        }
        touched.add(e);
      }
    }
    // then keep every eased road drivable end to end (both ends pinned to their junctions)
    for (const e of touched) {
      const P = e.pts, n = P.length, g = e.type === 'highway' ? 0.08 : 0.13;
      const lim = (i, j) => g * Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z);
      for (const pinned of [true, false]) { // (if the pads leave too little room, let them tilt rather than leave a step)
        for (let i = 1; i < n - 1; i++) if (!(pinned && P[i].pad)) P[i].y = clamp(P[i].y, P[i - 1].y - lim(i, i - 1), P[i - 1].y + lim(i, i - 1));
        for (let i = n - 2; i > 0; i--) if (!(pinned && P[i].pad)) P[i].y = clamp(P[i].y, P[i + 1].y - lim(i, i + 1), P[i + 1].y + lim(i, i + 1));
        let ok = true;
        for (let i = 1; i < n; i++) if (Math.abs(P[i].y - P[i - 1].y) > lim(i, i - 1) * 1.2 + 0.01) ok = false;
        if (ok) break;
      }
    }
  }

  // fork branches share the main road's height while they run alongside it
  blendForks() {
    for (const e of this.edges) {
      if (!e.fork || e.elev) continue;
      const nd = this.nodes[e.fork.node];
      const thr = e.fork.through.map((id) => this.edges[id].pts);
      for (const p of e.pts) {
        const d = Math.hypot(p.x - nd.x, p.z - nd.z);
        if (d > 220) continue;
        let best = 1e18, by = p.y;
        for (const P of thr) for (const q of P) {
          const dd = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
          if (dd < best) { best = dd; by = q.y; }
        }
        p.y = lerp(by, p.y, smoothstep(40, 220, d));
      }
      // re-limit the grade after blending (ends stay pinned to their junctions)
      const P = e.pts, n = P.length;
      const gmax = (e.type === 'highway' ? 0.08 : e.type === 'road' ? 0.105 : e.type === 'mountain' ? 0.12 : 0.13) * 4;
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 1; i < n - 1; i++) P[i].y = clamp(P[i].y, P[i - 1].y - gmax, P[i - 1].y + gmax);
        for (let i = n - 2; i > 0; i--) P[i].y = clamp(P[i].y, P[i + 1].y - gmax, P[i + 1].y + gmax);
      }
    }
  }

  stampRoads() {
    const H = this.heights;
    const best = new Float32Array(NV * NV).fill(1e9);
    const bestY = new Float32Array(NV * NV);
    const bestB = new Float32Array(NV * NV);
    // cells closer to a tunnel than to any open road keep the hill above the tube (no ramps carved into the portal)
    const bestTun = new Float32Array(NV * NV).fill(1e9);
    for (const e of this.edges) {
      if (e.city || !e.tunnel) continue;
      const P = e.pts;
      for (let s = 0; s < P.length - 1; s++) {
        if (!(e.tunnel[s] && e.tunnel[s + 1])) continue;
        const a = P[s], b = P[s + 1], R = e.halfW + 30;
        for (let j = Math.max(0, Math.floor((Math.min(a.z, b.z) - R + HALF) / CELL)); j <= Math.min(N, Math.ceil((Math.max(a.z, b.z) + R + HALF) / CELL)); j++) {
          for (let i = Math.max(0, Math.floor((Math.min(a.x, b.x) - R + HALF) / CELL)); i <= Math.min(N, Math.ceil((Math.max(a.x, b.x) + R + HALF) / CELL)); i++) {
            const [d] = distToSeg(-HALF + i * CELL, -HALF + j * CELL, a.x, a.z, b.x, b.z);
            const k = j * NV + i;
            if (d - e.halfW < bestTun[k]) bestTun[k] = d - e.halfW;
          }
        }
      }
    }
    for (const e of this.edges) {
      if (e.city) continue;
      const P = e.pts;
      for (let s = 0; s < P.length - 1; s++) {
        if ((e.bridge[s] && e.bridge[s + 1]) || (e.tunnel && e.tunnel[s] && e.tunnel[s + 1])) continue;
        const a = P[s], b = P[s + 1];
        if (e.elev && this.inCityRect(a.x, a.z, 25)) continue; // no earth mounds under the expressway ramps in town
        const dh = Math.abs(this.sampleGrid(H, a.x, a.z) - a.y);
        // mountain roads cut straight into the rock; country roads get steep cuttings and embankments; highways stay gentle
        const blend = e.peak ? Math.max(10, dh * 1.1) : e.type === 'mountain' ? 3 : e.type === 'highway' ? Math.max(16, dh * 1.8) : Math.max(8, dh * 0.9);
        const R = e.halfW + 8 + blend;
        const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - R + HALF) / CELL));
        const i1 = Math.min(N, Math.ceil((Math.max(a.x, b.x) + R + HALF) / CELL));
        const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - R + HALF) / CELL));
        const j1 = Math.min(N, Math.ceil((Math.max(a.z, b.z) + R + HALF) / CELL));
        for (let j = j0; j <= j1; j++) {
          const z = -HALF + j * CELL;
          for (let i = i0; i <= i1; i++) {
            const x = -HALF + i * CELL;
            const [d, t] = distToSeg(x, z, a.x, a.z, b.x, b.z);
            const k = j * NV + i;
            const dn = d - e.halfW;
            if (dn < best[k] && dn < 8 + blend) { best[k] = dn; bestY[k] = a.y + (b.y - a.y) * t; bestB[k] = blend; }
          }
        }
      }
    }
    for (let k = 0; k < H.length; k++) {
      const d = best[k];
      if (d > 1e8) continue;
      if (bestTun[k] < d - 0.5 && bestTun[k] < 6) continue;
      // flat shoulder wider than a terrain cell so no ground triangle can tilt up through the asphalt
      const t = smoothstep(7.5, 7.5 + bestB[k], d);
      const target = bestY[k] - 0.05;
      // embankments fall off more gently than cuttings
      H[k] = lerp(target, H[k], t);
    }
  }

  buildRoadGrid() {
    const RC = this.RC, RN = this.RN;
    for (const e of this.edges) {
      const P = e.pts;
      for (let s = 0; s < P.length - 1; s++) {
        const a = P[s], b = P[s + 1];
        const m = e.halfW + 2;
        const i0 = clamp(Math.floor((Math.min(a.x, b.x) - m + HALF) / RC), 0, RN - 1);
        const i1 = clamp(Math.floor((Math.max(a.x, b.x) + m + HALF) / RC), 0, RN - 1);
        const j0 = clamp(Math.floor((Math.min(a.z, b.z) - m + HALF) / RC), 0, RN - 1);
        const j1 = clamp(Math.floor((Math.max(a.z, b.z) + m + HALF) / RC), 0, RN - 1);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const k = j * RN + i;
          (this.roadGrid[k] || (this.roadGrid[k] = [])).push(e.id, s);
        }
      }
    }
  }

  // nearest road centerline within ~16m (returns d=1e9 if none)
  nearestRoad(x, z) {
    const r = this._nr;
    r.d = 1e9; r.edge = null; r.seg = 0; r.t = 0;
    const RC = this.RC, RN = this.RN;
    const ci = Math.floor((x + HALF) / RC), cj = Math.floor((z + HALF) / RC);
    if (ci < 0 || cj < 0 || ci >= RN || cj >= RN) return r;
    const list = this.roadGrid[cj * RN + ci];
    if (!list) return r;
    for (let q = 0; q < list.length; q += 2) {
      const e = this.edges[list[q]], s = list[q + 1];
      const a = e.pts[s], b = e.pts[s + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const L2 = dx * dx + dz * dz;
      let t = L2 > 0 ? ((x - a.x) * dx + (z - a.z) * dz) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = a.x + dx * t - x, qz = a.z + dz * t - z;
      const d = Math.sqrt(qx * qx + qz * qz) - e.halfW;
      if (d < r.d) { r.d = d; r.edge = e; r.seg = s; r.t = t; }
    }
    return r;
  }

  roadDistance(x, z) {
    // wider search for placement (3x3 cells)
    let best = 1e9;
    const RC = this.RC, RN = this.RN;
    const ci = Math.floor((x + HALF) / RC), cj = Math.floor((z + HALF) / RC);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= RN || j >= RN) continue;
      const list = this.roadGrid[j * RN + i];
      if (!list) continue;
      for (let q = 0; q < list.length; q += 2) {
        const e = this.edges[list[q]], s = list[q + 1];
        const a = e.pts[s], b = e.pts[s + 1];
        const d = distToSeg(x, z, a.x, a.z, b.x, b.z)[0] - e.halfW;
        if (d < best) best = d;
      }
    }
    return best;
  }

  classifySurfaces() {
    const H = this.heights, S = this.surf, wd = this.waterDist, F = this.forest;
    for (let j = 0; j <= N; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i <= N; i++) {
        const x = -HALF + i * CELL;
        const k = j * NV + i;
        const h = H[k];
        const hx = H[Math.min(k + 1, H.length - 1)] - H[Math.max(k - 1, 0)];
        const hz = H[Math.min(k + NV, H.length - 1)] - H[Math.max(k - NV, 0)];
        const slope = Math.hypot(hx, hz) / (2 * CELL);
        let s = SURF.GRASS;
        if (wd[k] < 9 && h < 2.5) s = SURF.SAND;
        else if (h > 245 + this.noiseD(x / 70, z / 70) * 30 && slope < 1.25) s = SURF.SNOW;
        else if (slope > 0.75 || h > 150) s = SURF.ROCK;
        else {
          const farm = (1 - smoothstep(-450, -250, x)) * smoothstep(350, 650, z);
          const fieldN = this.noiseD(x / 140, z / 140);
          if (farm > 0.5 && fieldN > 0.1) s = SURF.FIELD;
          else if (this.noiseC(x / 90 + 3, z / 90) > 0.62) s = SURF.DIRT;
        }
        S[k] = s;
        const forestN = fbm(this.noiseC, x / 520 + 11, z / 520 - 4, 3);
        F[k] = smoothstep(0.02, 0.35, forestN) * (1 - smoothstep(0.55, 0.9, slope)) * (h < 160 ? 1 : h < 210 ? 0.3 : 0);
      }
    }
  }

  // ---------- city ----------
  cityBlockAt(x, z) {
    const { x0, z0, B, NX, NZ } = CITY;
    const u = x - x0, v = z - z0;
    const i = Math.floor(u / B), j = Math.floor(v / B);
    if (i < 0 || j < 0 || i >= NX || j >= NZ) return null;
    const fu = u - i * B, fv = v - j * B;
    if (fu < CITY.vw(i) || fu > B - CITY.vw(i + 1) || fv < CITY.hw(j) || fv > B - CITY.hw(j + 1)) return null;
    return this.blocks[j * NX + i];
  }

  buildCity() {
    const { x0, z0, B, NX, NZ, roadW, walk } = CITY;
    const R = this.rand;
    const parks = new Set(['9,7', '12,4', '7,2']);
    const skate = new Set(['13,9']); // skate park
    const plazas = new Set(['10,6']);
    const lots = new Set(['10,7', '13,4', '1,4']); // car parks where the stunt viaducts land
    const garages = new Set(['7,8', '12,8', '3,6']); // multi-storey car parks
    this.garages = [];
    this.parkedCars = [];
    this.excl = [];
    this.alleys = [];
    this.viaductPlan = [['9,7', '10,7'], ['12,4', '13,4']];
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const bx0 = x0 + i * B + CITY.vw(i), bz0 = z0 + j * B + CITY.hw(j);
      const bx1 = x0 + (i + 1) * B - CITY.vw(i + 1), bz1 = z0 + (j + 1) * B - CITY.hw(j + 1);
      const ring = i === 0 || j === 0 || i === NX - 1 || j === NZ - 1;
      let kind = 'build';
      const key = `${i},${j}`;
      if (parks.has(key)) kind = 'park';
      else if (plazas.has(key)) kind = 'plaza';
      else if (lots.has(key)) kind = 'lot';
      else if (garages.has(key)) kind = 'garage';
      else if (skate.has(key)) kind = 'skate';
      else if (ring) kind = 'res';
      const slope = Math.abs(CITY.at(bx0, bz0) - CITY.at(bx1, bz0)) > 0.1; // a block on the hillside between terraces
      if (slope) kind = 'park';
      if (j === CITY.fwyJ || i === CITY.fwyI) { kind = 'fwy'; this.excl.push({ x0: bx0, x1: bx1, z0: bz0, z1: bz1 }); } // expressway corridor: open ground under the decks
      const blk = { i, j, x0: bx0, z0: bz0, x1: bx1, z1: bz1, kind, slope, y: CITY.at((bx0 + bx1) / 2, (bz0 + bz1) / 2) };
      this.blocks.push(blk);
      const lx0 = bx0 + walk, lz0 = bz0 + walk, lx1 = bx1 - walk, lz1 = bz1 - walk;
      const gy = blk.y + CITY.curb;
      // districts: old town on the west hill, warehouses along the north strip, towers in the core
      const district = i <= 4 ? 'old' : j <= 1 ? 'ind' : 'core';
      blk.district = district;
      if (kind === 'build') {
        const dc = Math.hypot((bx0 + bx1) / 2 - DOWNTOWN.x, (bz0 + bz1) / 2 - DOWNTOWN.z);
        const tall = 1 - smoothstep(40, 540, dc);
        // split lot into parcels
        let nx = R() < 0.5 ? 2 : 3, nz = R() < 0.5 ? 2 : 3;
        let cutsX = [lx0], cutsZ = [lz0];
        for (let q = 1; q < nx; q++) cutsX.push(lerp(lx0, lx1, q / nx + (R() - 0.5) * 0.12));
        for (let q = 1; q < nz; q++) cutsZ.push(lerp(lz0, lz1, q / nz + (R() - 0.5) * 0.12));
        cutsX.push(lx1); cutsZ.push(lz1);
        // narrow back alleys through the block: one way, the other, or crossing (+)
        let alley = null, alleyV = null, alleyH = null;
        const ar = R();
        if (ar < 0.6) {
          const AW = 3.6;
          const mode = ar < 0.21 ? 'v' : ar < 0.42 ? 'h' : 'x';
          if (mode !== 'h') {
            const m = lerp(lx0, lx1, 0.38 + R() * 0.24);
            nx = 3; cutsX = [lx0, m - AW, m + AW, lx1];
            alleyV = { x0: m - AW, x1: m + AW, z0: bz0, z1: bz1, vertical: true, blk };
            this.alleys.push(alleyV);
          }
          if (mode !== 'v') {
            const m = lerp(lz0, lz1, 0.38 + R() * 0.24);
            nz = 3; cutsZ = [lz0, m - AW, m + AW, lz1];
            alleyH = { x0: bx0, x1: bx1, z0: m - AW, z1: m + AW, vertical: false, blk };
            this.alleys.push(alleyH);
          }
          alley = alleyV || alleyH;
          blk.alley = alley;
        }
        // perimeter block with a hidden courtyard, reached through a gateway in one building
        let court = null;
        if (!alley && R() < 0.65) {
          nx = 3; nz = 3;
          cutsX = [lx0, lerp(lx0, lx1, 0.3), lerp(lx0, lx1, 0.7), lx1];
          cutsZ = [lz0, lerp(lz0, lz1, 0.3), lerp(lz0, lz1, 0.7), lz1];
          const gates = [[1, 0], [1, 2], [0, 1], [2, 1]];
          court = { x0: cutsX[1], x1: cutsX[2], z0: cutsZ[1], z1: cutsZ[2], gate: gates[Math.floor(R() * 4)], blk };
          (this.courtyards || (this.courtyards = [])).push(court);
        }
        for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
          if ((alleyV && a === 1) || (alleyH && b === 1)) continue;
          if (court && a === 1 && b === 1) continue; // the courtyard itself
          const isGate = court && a === court.gate[0] && b === court.gate[1];
          const interior = a > 0 && a < nx - 1 && b > 0 && b < nz - 1;
          if (!alley && !court && interior && R() < (tall > 0.5 ? 0.15 : 0.5)) continue;
          if (!court && R() < 0.06) { // small parking lot / gap
            this.parkedSpots.push({ x: (cutsX[a] + cutsX[a + 1]) / 2, z: (cutsZ[b] + cutsZ[b + 1]) / 2, y: gy });
            continue;
          }
          const gap = 0.6 + R() * 1.6;
          const px0 = cutsX[a] + gap, px1 = cutsX[a + 1] - gap, pz0 = cutsZ[b] + gap, pz1 = cutsZ[b + 1] - gap;
          let h = lerp(10, 105, Math.pow(tall, 1.3)) * (0.6 + R() * 0.8);
          if (tall > 0.5 && R() < 0.42) h = 100 + R() * 90 + tall * tall * 70; // skyscrapers, tallest near the core
          if (district === 'old') h = 8 + R() * 14 + (R() < 0.15 ? 10 : 0); // old town: three-to-six storey terraces
          if (district === 'ind') h = 7 + R() * 8; // warehouses and works
          h = Math.max(7, Math.round(h / 3.4) * 3.4);
          // silhouette and roof for variety
          const big = Math.min(px1 - px0, pz1 - pz0) > 14;
          const pick = (arr) => arr[Math.floor(R() * arr.length)];
          const style = h > 60 && big ? pick(['setback', 'stepped', 'podium', 'chamfer', 'chamfer', 'plain']) : h > 25 ? pick(['plain', 'plain', 'setback', 'podium']) : 'plain';
          const top = h > 90 ? pick(['spire', 'crown', 'antenna', 'antenna', 'flat']) : h > 40 ? pick(['antenna', 'flat', 'flat', 'flat']) : 'flat';
          const bld = {
            x: (px0 + px1) / 2, z: (pz0 + pz1) / 2, hx: (px1 - px0) / 2, hz: (pz1 - pz0) / 2, y: gy, h,
            variant: district === 'old' ? [1, 4, 5, 9, 10, 1, 5][Math.floor(R() * 7)] : district === 'ind' ? (R() < 0.75 ? 8 : 3) : h > 90 && R() < 0.5 ? (R() < 0.5 ? 2 : 11) : Math.floor(R() * 12), tone: R(), setback: style !== 'plain', style, top, blk,
          };
          // glass shop fronts at street level: corner shops (drive in one street, out the other)
          // and long storefront galleries on mid-block buildings
          const corner = (a === 0 || a === nx - 1) && (b === 0 || b === nz - 1);
          const edgeFace = a === 0 ? '-x' : a === nx - 1 ? '+x' : b === 0 ? '-z' : b === nz - 1 ? '+z' : null;
          const X0 = bld.x - bld.hx, X1 = bld.x + bld.hx, Z0 = bld.z - bld.hz, Z1 = bld.z + bld.hz;
          if (h >= 7 && bld.hx > 5 && bld.hz > 5 && (district !== 'ind' || R() < 0.45)) {
            const kr = R();
            const kind2 = kr < 0.3 ? 'grocery' : kr < 0.55 ? 'cafe' : kr < 0.78 ? 'showroom' : 'bar';
            if (corner && R() < 0.95) {
              const sx = Math.sign(bld.x - (bx0 + bx1) / 2) || 1, sz = Math.sign(bld.z - (bz0 + bz1) / 2) || 1;
              const big = kind2 === 'showroom';
              const W = Math.min(bld.hx * 2 - 3, big ? 24 + R() * 10 : 19 + R() * 9), D = Math.min(bld.hz * 2 - 3, big ? 22 + R() * 10 : 18 + R() * 8);
              const ex = bld.x + sx * bld.hx, ez = bld.z + sz * bld.hz;
              const shop = { x0: Math.min(ex, ex - sx * W), x1: Math.max(ex, ex - sx * W), z0: Math.min(ez, ez - sz * D), z1: Math.max(ez, ez - sz * D), sx, sz };
              shop.faces = [[ex, ez - sz * D, ex, ez], [ex - sx * W, ez, ex, ez]];
              const zc = sz > 0 ? [Z0, shop.z0] : [shop.z1, Z1], xc = sx > 0 ? [X0, shop.x0] : [shop.x1, X1];
              bld.shopComp = [[X0, X1, zc[0], zc[1]], [xc[0], xc[1], shop.z0, shop.z1]];
              bld.shop = shop; bld.shopKind = kind2; bld.driveThru = true;
              this.splitShop(bld, 'x', R);
            } else if (!corner && edgeFace && R() < 0.95) {
              const along = edgeFace[1] === 'z'; // face runs along x
              const sign = edgeFace[0] === '+' ? 1 : -1;
              // does the back of this building open onto an alley or the courtyard? then the shop may run right through
              const backOpen = edgeFace === '-x' ? (alleyV && a === 0) || (court && a === 0 && b === 1)
                : edgeFace === '+x' ? (alleyV && a === nx - 1) || (court && a === nx - 1 && b === 1)
                : edgeFace === '-z' ? (alleyH && b === 0) || (court && b === 0 && a === 1)
                : (alleyH && b === nz - 1) || (court && b === nz - 1 && a === 1);
              const through = backOpen && R() < 0.6;
              const D = through ? (along ? bld.hz : bld.hx) * 2 : Math.min((along ? bld.hz : bld.hx) * 2 - 3, 15 + R() * 7), m = 2.0;
              let shop;
              if (through) {
                // a passage-shop: glass at the street and at the back, shelves and tables all the way through
                if (along) {
                  shop = { x0: X0 + m, x1: X1 - m, z0: Z0, z1: Z1, sx: 1, sz: sign };
                  shop.faces = [[shop.x0, Z0, shop.x1, Z0], [shop.x0, Z1, shop.x1, Z1]];
                  bld.shopComp = [[X0, shop.x0, Z0, Z1], [shop.x1, X1, Z0, Z1]];
                } else {
                  shop = { x0: X0, x1: X1, z0: Z0 + m, z1: Z1 - m, sx: sign, sz: 1 };
                  shop.faces = [[X0, shop.z0, X0, shop.z1], [X1, shop.z0, X1, shop.z1]];
                  bld.shopComp = [[X0, X1, Z0, shop.z0], [X0, X1, shop.z1, Z1]];
                }
                bld.shop = shop; bld.shopKind = kind2 === 'showroom' ? 'grocery' : kind2; bld.driveThru = true; bld.gallery = true; bld.through = true;
                this.splitShop(bld, along ? 'x' : 'z', R);
              } else if (along) {
                const fz = sign > 0 ? Z1 : Z0;
                shop = { x0: X0 + m, x1: X1 - m, z0: Math.min(fz, fz - sign * D), z1: Math.max(fz, fz - sign * D), sx: 1, sz: sign };
                shop.faces = [[shop.x0, fz, shop.x1, fz]];
                bld.shopComp = [[X0, X1, sign > 0 ? Z0 : shop.z1, sign > 0 ? shop.z0 : Z1], [X0, shop.x0, shop.z0, shop.z1], [shop.x1, X1, shop.z0, shop.z1]];
              } else {
                const fx = sign > 0 ? X1 : X0;
                shop = { x0: Math.min(fx, fx - sign * D), x1: Math.max(fx, fx - sign * D), z0: Z0 + m, z1: Z1 - m, sx: sign, sz: 1 };
                shop.faces = [[fx, shop.z0, fx, shop.z1]];
                bld.shopComp = [[sign > 0 ? X0 : shop.x1, sign > 0 ? shop.x0 : X1, Z0, Z1], [shop.x0, shop.x1, Z0, shop.z0], [shop.x0, shop.x1, shop.z1, Z1]];
              }
              if (!through) {
                bld.shop = shop; bld.shopKind = kind2 === 'showroom' ? 'cafe' : kind2; bld.driveThru = true; bld.gallery = true;
                this.splitShop(bld, along ? 'x' : 'z', R);
              }
            }
          }
          if (isGate) {
            // a gateway straight through the ground floor into the courtyard
            const along = court.gate[0] === 1; // gate parcel on the north/south edge: the passage runs along z
            const gw = 2.8;
            let shop;
            if (along) { shop = { x0: bld.x - gw, x1: bld.x + gw, z0: Z0, z1: Z1, sx: 1, sz: 1, faces: [] }; bld.shopComp = [[X0, shop.x0, Z0, Z1], [shop.x1, X1, Z0, Z1]]; }
            else { shop = { x0: X0, x1: X1, z0: bld.z - gw, z1: bld.z + gw, sx: 1, sz: 1, faces: [] }; bld.shopComp = [[X0, X1, Z0, shop.z0], [X0, X1, shop.z1, Z1]]; }
            bld.shop = shop; bld.shopKind = 'passage'; bld.driveThru = true; bld.gallery = false;
            court.passage = shop;
          }
          this.buildings.push(bld);
          this.colliders.push({ type: 'box', x: bld.x, z: bld.z, hx: bld.hx, hz: bld.hz, c: 1, s: 0, top: gy + h, tall: true, bottom: bld.driveThru ? gy + 4.5 : undefined });
          if (bld.driveThru) {
            // the solid ground-floor blocks around the shop are its inner walls
            for (const [a0, a1, b0, b1] of bld.shopComp) {
              if (a1 - a0 < 0.5 || b1 - b0 < 0.5) continue;
              this.colliders.push({ type: 'box', x: (a0 + a1) / 2, z: (b0 + b1) / 2, hx: (a1 - a0) / 2, hz: (b1 - b0) / 2, c: 1, s: 0, top: gy + 4.6, tall: true });
            }
          }
        }
      } else if (kind === 'res') {
        // houses facing the street around the lot
        const perSide = 3;
        const sides = [
          { ox: 0, oz: -1 }, { ox: 0, oz: 1 }, { ox: -1, oz: 0 }, { ox: 1, oz: 0 },
        ];
        for (const sd of sides) {
          for (let q = 0; q < perSide; q++) {
            const t = (q + 0.5) / perSide;
            let x, z, rot;
            const inset = 13;
            if (sd.oz !== 0) {
              x = lerp(lx0 + 12, lx1 - 12, t);
              z = sd.oz < 0 ? lz0 + inset : lz1 - inset;
              rot = sd.oz < 0 ? Math.PI : 0;
            } else {
              z = lerp(lz0 + 12, lz1 - 12, t);
              x = sd.ox < 0 ? lx0 + inset : lx1 - inset;
              rot = sd.ox < 0 ? -Math.PI / 2 : Math.PI / 2;
            }
            if (sd.oz === 0 && (q === 0 || q === perSide - 1)) continue; // corners already used
            this.addHouse(x, z, rot, gy, true);
          }
        }
        for (let q = 0; q < 4; q++) this.addTree(lerp(lx0 + 25, lx1 - 25, R()), lerp(lz0 + 25, lz1 - 25, R()), gy, 0, 0.8 + R() * 0.5);
      } else if (kind === 'park') {
        blk.treesPending = true; // planted after ramps are laid out
      } else if (kind === 'plaza') {
        this.plaza = { x: (lx0 + lx1) / 2, z: (lz0 + lz1) / 2 };
        this.colliders.push({ type: 'circle', x: this.plaza.x, z: this.plaza.z, r: 7.5, top: gy + 3 });
        for (let q = 0; q < 8; q++) {
          const a = (q / 8) * Math.PI * 2;
          this.addTree(this.plaza.x + Math.cos(a) * 24, this.plaza.z + Math.sin(a) * 24, gy, 0, 0.9);
        }
      }
    }

    this.buildViaducts();
    this.buildGarages();
    this.workshops = [];
    for (const blk of this.blocks) if (blk.kind === 'lot') this.addWorkshop(blk.x0 + 15, blk.z0 + 10.5, Math.PI, blk.y + CITY.curb);
    this.buildKickers();
    this.buildFootbridges();
    this.buildSkateParks();
    this.buildPlazaTerraces();
    this.buildAlleyFeatures();
    this.buildCoveredStreets();
    this.buildTramLine();
    this.planParkingBays();
    // park trees (after ramps so they stay clear of them)
    for (const blk of this.blocks) {
      if (!blk.treesPending) continue;
      const lx0 = blk.x0 + walk, lz0 = blk.z0 + walk, lx1 = blk.x1 - walk, lz1 = blk.z1 - walk;
      for (let q = 0; q < 30; q++) {
        const x = lerp(lx0 + 3, lx1 - 3, R()), z = lerp(lz0 + 3, lz1 - 3, R());
        if (this.excluded(x, z, 2)) continue;
        this.addTree(x, z, CITY.at(x, z) + CITY.curb, R() < 0.35 ? 2 : R() < 0.2 ? 1 : 0, 0.8 + R() * 0.7);
      }
    }
    this.buildStreetTrees();
    // street lamps along blocks
    for (const blk of this.blocks) {
      const inset = 1.0;
      const edges = [
        [blk.x0 + inset, blk.z0 + inset, blk.x1 - inset, blk.z0 + inset, Math.PI],
        [blk.x0 + inset, blk.z1 - inset, blk.x1 - inset, blk.z1 - inset, 0],
        [blk.x0 + inset, blk.z0 + inset, blk.x0 + inset, blk.z1 - inset, -Math.PI / 2],
        [blk.x1 - inset, blk.z0 + inset, blk.x1 - inset, blk.z1 - inset, Math.PI / 2],
      ];
      for (const [ax, az, bx, bz, rot] of edges) {
        const L = Math.hypot(bx - ax, bz - az);
        const n = Math.floor(L / 34);
        for (let q = 1; q < n; q++) {
          const t = q / n;
          if (this.excluded(lerp(ax, bx, t), lerp(az, bz, t), 0.5)) continue;
          this.addLamp(lerp(ax, bx, t), lerp(az, bz, t), CITY.at(lerp(ax, bx, t), lerp(az, bz, t)) + CITY.curb, rot);
        }
      }
    }
    // traffic light poles on block corners
    for (const nd of this.nodes) {
      if (!nd.light) continue;
      for (const [sx, sz] of [[-1, -1], [1, 1]]) {
        const x = nd.x + sx * (nd.hx + 1.2), z = nd.z + sz * (nd.hz + 1.2);
        if (this.onRampPath(x, z, 1)) continue; // a ramp leaves the junction through this corner
        const tl = { x, z, y: CITY.at(x, z) + CITY.curb, node: nd.id, sx, sz, broken: false };
        this.trafficLights.push(tl);
        this.colliders.push({ type: 'circle', x, z, r: 0.25, top: tl.y + 6, breakable: true, ref: tl });
      }
    }
  }

  excluded(x, z, m = 0) {
    for (const r of this.excl) if (x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m) return true;
    return this.onRampPath(x, z, m);
  }

  // farms out in the country: farmhouse, a drive-through barn, silo, tractor, hay bales, animals and crop fields
  buildFarms() {
    const R = this.rand;
    this.farms = [];
    this.fields = [];
    const names = ['MILLER', 'HOLLOWAY', 'BRIGGS', 'DALE', 'ASHCROFT', 'PEMBERTON', 'GREENWOOD', 'TALLIS'];
    const FW = 190, FD = 140; // farm footprint
    const clear = (x0, z0, x1, z1) => {
      for (let x = x0; x <= x1; x += 15) for (let z = z0; z <= z1; z += 15) {
        if (this.inCityRect(x, z, 100) || this.roadDistance(x, z) < 6 || this.sampleGrid(this.waterDist, x, z) < 20 || this.houseOverlaps(x, z, 14) || this.excluded(x, z, 2)) return false;
        if (this.terrainHeight(x, z) > 140 || PEAKS.some((P) => Math.hypot(x - P.x, z - P.z) < P.R * 0.9)) return false;
      }
      for (const v of this.villages) if (x1 > v.x - v.r && x0 < v.x + v.r && z1 > v.z - v.r && z0 < v.z + v.r) return false;
      return !this.farms.some((f) => x1 > f.x0 - 30 && x0 < f.x1 + 30 && z1 > f.z0 - 30 && z0 < f.z1 + 30);
    };
    const cands = [];
    for (const e of this.edges) {
      if (e.city || e.elev || e.type === 'highway' || e.type === 'mountain') continue;
      for (let i = 20; i < e.pts.length - 20; i += 9) cands.push(e.pts[i]);
    }
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    for (const p of cands) {
      if (this.farms.length >= 7) break;
      // the farm sits beside the road: try the four sides of the point
      // the farmyard + pens (140 x 64) must sit clear beside the road; fields are added wherever they fit
      const opts = [];
      for (const off of [14, 26]) for (const [sx0, sz0] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) opts.push([sx0, sz0, off]);
      for (const [sx, sz, off] of opts) {
        const nearX = p.x + sx * off - (sx > 0 ? 0 : 0), nearZ = p.z - sz * 20;
        const L = (u, v) => [nearX + sx * u, nearZ + sz * v]; // farm-local, u/v measured into the farm from the road corner
        const [ca, cb] = [L(0, 0), L(140, 64)];
        const x0 = Math.min(ca[0], cb[0]), x1 = Math.max(ca[0], cb[0]), z0 = Math.min(ca[1], cb[1]), z1 = Math.max(ca[1], cb[1]);
        if (!clear(x0, z0, x1, z1)) continue;
        const yard = [L(0, 0), L(70, 60)];
        const yx0 = Math.min(yard[0][0], yard[1][0]), yx1 = Math.max(yard[0][0], yard[1][0]), yz0 = Math.min(yard[0][1], yard[1][1]), yz1 = Math.max(yard[0][1], yard[1][1]);
        const hs = []; for (let x = yx0; x <= yx1; x += 10) for (let z = yz0; z <= yz1; z += 10) hs.push(this.terrainHeight(x, z));
        if (Math.max(...hs) - Math.min(...hs) > 9) continue;
        const yy = hs.reduce((a, b) => a + b, 0) / hs.length;
        const farm = { name: names[this.farms.length % names.length] + ' FARM', x0, z0, x1, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, y: yy, pens: [], bales: [] };
        void FW; void FD;
        // level the yard (cut and fill, blending into the land)
        const H = this.heights;
        for (let j = Math.floor((yz0 - 14 + HALF) / CELL); j <= Math.ceil((yz1 + 14 + HALF) / CELL); j++) for (let i = Math.floor((yx0 - 14 + HALF) / CELL); i <= Math.ceil((yx1 + 14 + HALF) / CELL); i++) {
          if (i < 0 || j < 0 || i > N || j > N) continue;
          const x = -HALF + i * CELL, z = -HALF + j * CELL, d = Math.hypot(Math.max(yx0 - x, 0, x - yx1), Math.max(yz0 - z, 0, z - yz1));
          const wgt = (1 - smoothstep(0, 14, d)) * smoothstep(3, 8, this.roadDistance(x, z));
          H[j * NV + i] = lerp(H[j * NV + i], yy, wgt);
          if (d < 1) this.surf[j * NV + i] = SURF.DIRT;
        }
        // farmhouse facing the road, barn behind it, silo, tractor, bales
        const face = (x, z) => Math.atan2(p.x - x, p.z - z); // front door toward the road point
        const [hx, hz] = L(16, 16);
        const house = this.addHouse(hx, hz, face(hx, hz), yy, false, 'farmhouse');
        house.roadGap = 14;
        const [bx, bz] = L(44, 30);
        farm.barn = { x: bx, z: bz, w: 22, d: 14, y: yy, rot: sx * sz > 0 ? 0 : Math.PI / 2 };
        this.addBarn(farm.barn);
        const [sx2, sz2] = L(60, 50);
        farm.silo = { x: sx2, z: sz2, r: 3.4, h: 15, y: yy };
        this.colliders.push({ type: 'circle', x: sx2, z: sz2, r: 3.5, top: yy + 18, tall: true });
        const [tx, tz] = L(30, 12);
        farm.tractor = { x: tx, z: tz, y: yy, rot: R() * 6.28 };
        this.colliders.push({ type: 'box', x: tx, z: tz, hx: 1.25, hz: 2.2, c: Math.cos(farm.tractor.rot), s: -Math.sin(farm.tractor.rot), top: yy + 2.8, tall: true });
        for (let k = 0; k < 7; k++) { const [bx2, bz2] = L(26 + R() * 30, 44 + R() * 12); farm.bales.push({ x: bx2, z: bz2, rot: R() * 6.28 }); }
        // animals
        const [px, pz] = L(108, 26); farm.pens.push({ kind: 'sheep', cx: px, cz: pz, hx: 26, hz: 18 });
        const [cx2, cz2] = L(14, 46); farm.pens.push({ kind: 'chicken', cx: cx2, cz: cz2, hx: 7, hz: 5 });
        // crop fields across the back of the farm, rows running along u
        const crops = ['potato', 'cabbage', 'wheat'];
        let fieldsMade = 0;
        for (const [u0, v0, u1, v1] of [[2, 70, 80, 128], [86, 70, 164, 128], [146, 2, 210, 60], [-74, 2, -8, 60]]) {
          const [ax, az] = L(u0, v0), [bx3, bz3] = L(u1, v1);
          const f = { x0: Math.min(ax, bx3), x1: Math.max(ax, bx3), z0: Math.min(az, bz3), z1: Math.max(az, bz3), crop: crops[Math.floor(R() * crops.length)], rowsAlongX: true };
          if (fieldsMade >= 3 || !clear(f.x0, f.z0, f.x1, f.z1) || this.fields.some((q) => f.x1 > q.x0 && f.x0 < q.x1 && f.z1 > q.z0 && f.z0 < q.z1)) continue;
          fieldsMade++;
          farm.x0 = Math.min(farm.x0, f.x0); farm.x1 = Math.max(farm.x1, f.x1); farm.z0 = Math.min(farm.z0, f.z0); farm.z1 = Math.max(farm.z1, f.z1);
          this.fields.push(f);
          for (let x = f.x0; x <= f.x1; x += CELL) for (let z = f.z0; z <= f.z1; z += CELL) { const k2 = Math.round((z + HALF) / CELL) * NV + Math.round((x + HALF) / CELL); if (k2 >= 0 && k2 < this.surf.length) this.surf[k2] = SURF.FIELD; }
        }
        farm.cx = (farm.x0 + farm.x1) / 2; farm.cz = (farm.z0 + farm.z1) / 2;
        this.excl.push({ x0: farm.x0 - 4, x1: farm.x1 + 4, z0: farm.z0 - 4, z1: farm.z1 + 4 });
        this.farms.push(farm);
        break;
      }
    }
  }

  // a big gambrel barn you can drive straight through: open doors at both gable ends
  addBarn(b) {
    const c = Math.cos(b.rot), s = -Math.sin(b.rot);
    const W = (lx, lz) => [b.x + lx * c + lz * Math.sin(b.rot), b.z - lx * Math.sin(b.rot) + lz * c];
    const wall = (lx, lz, hx, hz, extra = {}) => { const [x, z] = W(lx, lz); this.colliders.push({ type: 'box', x, z, hx, hz, c, s, top: b.y + 9, tall: true, ...extra }); };
    const hw = b.w / 2, hd = b.d / 2, door = 3.2;
    wall(0, -hd, hw, 0.25); wall(0, hd, hw, 0.25); // long side walls
    for (const sd of [-1, 1]) { wall(sd * hw, -(hd + door) / 2, 0.25, (hd - door) / 2); wall(sd * hw, (hd + door) / 2, 0.25, (hd - door) / 2); } // gable ends either side of the big doors
    wall(0, 0, hw, hd, { top: b.y + 9.5, bottom: b.y + 4.6 }); // roof / loft
    b.door = door;
  }

  // green gantry signs before every exit off the highways and expressways: an advance sign ~400 m out, a final one ~120 m
  buildExitSigns() {
    this.exitSigns = [];
    const place = (x, z) => { // which named place an exit leads towards
      if (this.inCityRect(x, z, 150)) return Math.hypot(x - CITY.cx, z - CITY.cz) < 400 ? 10 : x > CITY.x1 - 300 ? 11 : 0;
      let best = 0, bd = 1e18;
      const cands = [...this.villages.map((v, i) => [v.x, v.z, 1 + i]), ...PEAKS.map((P, i) => [P.x, P.z, 5 + i]), [LAKE.x, LAKE.z, 9], [CITY.cx, CITY.cz, 0]];
      for (const [px, pz, k] of cands) { const d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; best = k; } }
      return best;
    };
    const big = (e) => !e.ramp && (e.type === 'highway' || e.fwy);
    for (const nd of this.nodes) {
      if (nd.edges.length < 3) continue;
      const es = nd.edges.map((id) => this.edges[id]);
      const mains = es.filter(big), exits = es.filter((e) => !big(e));
      if (mains.length < 1 || !exits.length) continue;
      // where does the exit go: follow it to its far end
      const ex = exits[0], far = this.nodes[ex.a === nd.id ? ex.b : ex.a], dest = place(far.x, far.z);
      for (const e of mains) {
        const P = e.a === nd.id ? e.pts.slice().reverse() : e.pts; // travelling toward the junction
        for (const [dist, final] of [[400, false], [120, true]]) {
          let acc = 0, i = P.length - 1;
          while (i > 0 && acc < dist) { acc += Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z); i--; }
          if (acc < dist || i < 3) continue;
          const p = P[i], q = P[i + 1], L = Math.hypot(q.x - p.x, q.z - p.z) || 1, tx = (q.x - p.x) / L, tz = (q.z - p.z) / L;
          if (this.tunnelAt(p.x, p.z, p.y + 1) !== null || this.exitSigns.some((g) => Math.hypot(g.x - p.x, g.z - p.z) < 60)) continue;
          if (this.nodes.some((o) => o !== nd && o.edges.length > 2 && Math.hypot(o.x - p.x, o.z - p.z) < 40)) continue;
          const g = { x: p.x, z: p.z, y: p.y, tx, tz, hw: e.halfW, dest, final, deck: !!(e.fwy || e.bridge[i]) };
          const po = e.halfW + (g.deck ? 0.6 : 1.8);
          if ([-1, 1].some((sd) => this.onRampPath(p.x - tz * po * sd, p.z + tx * po * sd, 3) || this.roadDistance(p.x - tz * po * sd, p.z + tx * po * sd) < 0.5)) continue; // not where a ramp merges
          this.exitSigns.push(g);
          for (const sd of [-1, 1]) { // the posts stand just off each edge of the road (on the deck parapet when elevated)
            const o = e.halfW + (g.deck ? 0.6 : 1.8);
            this.colliders.push({ type: 'box', x: p.x - tz * o * sd, z: p.z + tx * o * sd, hx: 0.3, hz: 0.3, c: 1, s: 0, top: p.y + 9.5, bottom: p.y - 0.6, tall: true });
          }
        }
      }
    }
  }

  // Primeval Valley: the gate arch over the entrance road, two fenced paddocks inside the loop road (north and
  // south of a dividing fence), prehistoric planting, and where the sauropods start out
  buildPark() {
    const R = mulberry32(1993), cx = PARK.x, cz = PARK.z;
    this.excl.push({ x0: cx - PARK.r - 60, x1: cx + PARK.r + 60, z0: cz - PARK.r - 60, z1: cz + PARK.r + 60 }); // no ordinary woods, houses or props
    // the loop road as one closed polyline
    const loop = [];
    for (const id of this.parkLoop) { const e = this.edges[id]; for (const p of e.pts) loop.push(p); }
    // fence: the loop pulled 24 m in toward the middle (posts every 4 m)
    const fence = [];
    for (let i = 0; i < loop.length; i += 3) {
      const p = loop[i], dx = cx - p.x, dz = cz - p.z, L = Math.hypot(dx, dz) || 1;
      fence.push({ x: p.x + dx / L * 24, z: p.z + dz / L * 24 });
    }
    // a dividing fence east-west through the middle, splitting it into a north and a south paddock
    const crossZ = cz + 20;
    const xsAt = (zq) => { const xs = []; for (let i = 0; i < fence.length; i++) { const a = fence[i], b = fence[(i + 1) % fence.length]; if ((a.z - zq) * (b.z - zq) < 0) xs.push(a.x + (b.x - a.x) * (zq - a.z) / (b.z - a.z)); } return xs.sort((p, q) => p - q); };
    const cross = xsAt(crossZ);
    const lines = [fence.concat([fence[0]])];
    if (cross.length >= 2) lines.push([{ x: cross[0], z: crossZ }, { x: cross[cross.length - 1], z: crossZ }]);
    this.parkFences = [];
    for (const line of lines) for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L < 0.5) continue;
      const n = Math.ceil(L / 4);
      for (let k = 0; k < n; k++) {
        const ax = a.x + (b.x - a.x) * k / n, az = a.z + (b.z - a.z) * k / n, bx = a.x + (b.x - a.x) * (k + 1) / n, bz = a.z + (b.z - a.z) * (k + 1) / n;
        const y = this.terrainHeight(ax, az);
        this.parkFences.push({ ax, az, bx, bz, y });
        const sl = Math.hypot(bx - ax, bz - az);
        this.colliders.push({ type: 'box', x: (ax + bx) / 2, z: (az + bz) / 2, hx: sl / 2, hz: 0.25, c: (bx - ax) / sl, s: (bz - az) / sl, top: y + 6, tall: true });
      }
    }
    // the two paddocks as polygons (for keeping the animals in): fence ring clipped at the divide
    const inside = (poly, x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c; } return c; };
    const ring = fence;
    this.paddockPolys = [
      { test: (x, z) => inside(ring, x, z) && z < crossZ - 2 }, // north
      { test: (x, z) => inside(ring, x, z) && z > crossZ + 2 }, // south
    ];
    // distance from a point to the nearest fence (to keep the big animals clear of it)
    this.fenceDist = (x, z) => { let m = 1e9; for (const f of this.parkFences) { const dx = f.bx - f.ax, dz = f.bz - f.az, t = Math.max(0, Math.min(1, ((x - f.ax) * dx + (z - f.az) * dz) / (dx * dx + dz * dz))); m = Math.min(m, Math.hypot(f.ax + dx * t - x, f.az + dz * t - z)); } return m; };
    // prehistoric planting: tree ferns, monkey-puzzle pines and cycads, thick in the paddocks, a few by the road
    this.parkFlora = [];
    for (let k = 0; k < 900 && this.parkFlora.length < 260; k++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * (PARK.r + 40), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const inPad = this.paddockPolys.some((p) => p.test(x, z));
      if (this.roadDistance(x, z) < 7 || this.fenceDist(x, z) < 4 || (!inPad && R() < 0.6)) continue;
      if (inPad && this.fenceDist(x, z) < 20 && R() < 0.7) continue; // room along the fence to see in
      const kind = R() < 0.4 ? 0 : R() < 0.55 ? 1 : 2, s = kind === 1 ? 1.2 + R() * 0.9 : 0.8 + R() * 0.6, y = this.terrainHeight(x, z);
      this.parkFlora.push({ x, z, y, kind, s, rot: R() * 6.28 });
      this.colliders.push({ type: 'circle', x, z, r: kind === 1 ? 0.6 * s : 0.35 * s, top: y + 6 });
    }
    // the gate: two great pillars either side of the entrance road
    const G = PARK.gate, g1 = this.nodes.find((nd) => Math.hypot(nd.x - G.x, nd.z - G.z) < 1);
    const e0 = this.edges[g1.edges.find((id) => this.edges[id].park)];
    const P = e0.a === g1.id ? e0.pts : e0.pts.slice().reverse(), p0 = P[0], p1 = P[Math.min(4, P.length - 1)];
    const L = Math.hypot(p1.x - p0.x, p1.z - p0.z), tx = (p1.x - p0.x) / L, tz = (p1.z - p0.z) / L;
    this.parkGate = { x: p0.x + tx * 6, z: p0.z + tz * 6, y: p0.y, tx, tz, half: e0.halfW + 3.5 };
    for (const sd of [-1, 1]) this.colliders.push({ type: 'box', x: this.parkGate.x - tz * this.parkGate.half * sd, z: this.parkGate.z + tx * this.parkGate.half * sd, hx: 1.4, hz: 1.4, c: 1, s: 0, top: p0.y + 14, tall: true });
    // where the sauropods start: two in each paddock
    this.dinoStarts = [];
    for (const pad of this.paddockPolys) for (let k = 0, t = 0; k < 2 && t < 400; t++) {
      const x = cx + (R() - 0.5) * 2 * PARK.r, z = cz + (R() - 0.5) * 2 * PARK.r;
      if (pad.test(x, z) && this.fenceDist(x, z) > 22 && this.dinoStarts.every((d) => Math.hypot(d.x - x, d.z - z) > 40)) { this.dinoStarts.push({ x, z, pad, heading: R() * 6.28 }); k++; }
    }
  }

  // tall roadside billboards along the country highways and roads, angled to face oncoming traffic
  buildBillboards() {
    const R = this.rand;
    this.billboards = [];
    for (const e of this.edges) {
      if (e.city || e.elev || e.peak || !(e.type === 'highway' || e.type === 'road')) continue;
      for (let i = 25; i < e.pts.length - 25; i += 28 + Math.floor(R() * 30)) {
        if (R() > 0.4 || e.bridge[i] || (e.tunnel && e.tunnel[i])) continue;
        const p = e.pts[i], q = e.pts[i + 2], L = Math.hypot(q.x - p.x, q.z - p.z) || 1, tx = (q.x - p.x) / L, tz = (q.z - p.z) / L;
        const side = R() < 0.5 ? -1 : 1, off = e.halfW + 7 + R() * 5;
        const x = p.x - tz * off * side, z = p.z + tx * off * side;
        if (this.inCityRect(x, z, 40) || this.excluded(x, z, 8) || this.houseOverlaps(x, z, 12) || this.sampleGrid(this.waterDist, x, z) < 10 || this.roadDistance(x, z) < 5) continue;
        if (this.billboards.some((b) => Math.hypot(b.x - x, b.z - z) < 160)) continue;
        // the board runs across the road's direction, turned a little toward the traffic
        const ang = Math.atan2(-tz, tx) + Math.PI / 2 + side * 0.35, ca = Math.cos(ang), sa = Math.sin(ang);
        const ys = [-4, 4].map((u) => this.terrainHeight(x + ca * u, z - sa * u));
        const y = Math.min(...ys);
        if (Math.max(...ys) - y > 3) continue;
        const bb = { x, z, y, rot: ang, ad: Math.floor(R() * 12), ad2: Math.floor(R() * 12), h: 7 + R() * 3, w: 12 };
        this.billboards.push(bb);
        for (const u of [-3.6, 3.6]) this.colliders.push({ type: 'circle', x: x + ca * u, z: z - sa * u, r: 0.4, top: y + bb.h + 6, tall: true });
        this.excl.push({ x0: x - 7, x1: x + 7, z0: z - 7, z1: z + 7 });
      }
    }
  }

  // the elevated tram ("the El"): a loop over the downtown streets on steel portal frames, the columns on the
  // sidewalks so traffic runs underneath. The route is the rectangle of street lines nearest downtown that stays
  // clear of the expressways, their ramps, the avenues, covered streets and the hillside terraces.
  buildTramLine() {
    const { x0, z0, B } = CITY, DECK = 9.5, Rc = 6.5;
    const lineX = (i) => x0 + i * B, lineZ = (j) => z0 + j * B;
    const runOK = (ax, az, bx, bz) => {
      const L = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t <= L; t += 3) {
        const x = ax + (bx - ax) * t / L, z = az + (bz - az) * t / L;
        if (this.onRampPath(x, z, 6) || this.bridgeAt(x, z, 1e9) !== null || (this.covers || []).some((c) => x > c.x0 - 4 && x < c.x1 + 4 && z > c.z0 - 4 && z < c.z1 + 4)) return false;
        if (Math.abs(CITY.at(x, z) - CITY.y) > 0.01) return false; // level ground only
      }
      return true;
    };
    let best = null;
    for (let i0 = 6; i0 < 15; i0++) for (let i1 = i0 + 2; i1 <= Math.min(14, i0 + 4); i1++) for (let j0 = 1; j0 < 11; j0++) for (let j1 = j0 + 2; j1 <= Math.min(10, j0 + 4); j1++) {
      if ([i0, i1].includes(CITY.avenueI) || [j0, j1].includes(CITY.avenueJ)) continue;
      const xa = lineX(i0), xb = lineX(i1), za = lineZ(j0), zb = lineZ(j1);
      if (!runOK(xa, za, xb, za) || !runOK(xa, zb, xb, zb) || !runOK(xa, za, xa, zb) || !runOK(xb, za, xb, zb)) continue;
      const score = Math.hypot((xa + xb) / 2 - DOWNTOWN.x, (za + zb) / 2 - DOWNTOWN.z) - ((i1 - i0) + (j1 - j0)) * 30;
      if (!best || score < best.score) best = { score, xa, xb, za, zb };
    }
    this.tram = null;
    if (!best) return;
    const { xa, xb, za, zb } = best, y = CITY.y + DECK;
    // the loop with rounded corners, a point every metre (clockwise seen from above)
    const corners = [[xa, za, 1, 0, 0, 1], [xb, za, 0, 1, -1, 0], [xb, zb, -1, 0, 0, -1], [xa, zb, 0, -1, 1, 0]];
    const pts = [];
    for (let k = 0; k < 4; k++) {
      const [cx, cz, dx, dz] = corners[k], [nx, nz, ndx, ndz] = corners[(k + 1) % 4];
      const L = Math.hypot(nx - cx, nz - cz) - 2 * Rc;
      for (let t = 0; t < L; t += 1) pts.push({ x: cx + dx * (Rc + t), z: cz + dz * (Rc + t) });
      // quarter circle round the next corner
      const ox = nx - dx * Rc + ndx * Rc, oz = nz - dz * Rc + ndz * Rc;
      const a0 = Math.atan2(-ndz, -ndx), a1 = Math.atan2(dz, dx), da = ((a1 - a0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const n = Math.ceil(Math.abs(da) * Rc);
      for (let q = 0; q < n; q++) { const a = a0 + da * q / n; pts.push({ x: ox + Math.cos(a) * Rc, z: oz + Math.sin(a) * Rc, curve: true }); }
    }
    let s = 0;
    pts.forEach((p, k) => { if (k) s += Math.hypot(p.x - pts[k - 1].x, p.z - pts[k - 1].z); p.s = s; p.y = y; });
    const len = s + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z);
    // portal frames: a column on each sidewalk every ~24 m, never inside a junction
    const frames = [];
    for (const [ax, az, bx, bz] of [[xa, za, xb, za], [xb, za, xb, zb], [xb, zb, xa, zb], [xa, zb, xa, za]]) {
      const L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L, alongX = Math.abs(tx) > 0.5;
      for (let t = 12; t < L - 12; t += 16) {
        const x = ax + tx * t, z = az + tz * t;
        const nd = this.nodes.find((n) => n.city && Math.abs(n.x - x) < (alongX ? n.hx + 6 : 1) + 1 && Math.abs(n.z - z) < (alongX ? 1 : n.hz + 6) + 1);
        if (nd) continue;
        const hw = alongX ? CITY.hw(Math.round((z - z0) / B)) : CITY.vw(Math.round((x - x0) / B));
        const o = hw + 1.3, f = { x, z, tx, tz, o };
        frames.push(f);
        for (const sd of [-1, 1]) {
          const cx = x - tz * o * sd, cz = z + tx * o * sd;
          this.colliders.push({ type: 'box', x: cx, z: cz, hx: 0.35, hz: 0.35, c: 1, s: 0, top: y, tall: true });
          this.excl.push({ x0: cx - 1.2, x1: cx + 1.2, z0: cz - 1.2, z1: cz + 1.2 });
        }
      }
    }
    // two stations, on opposite sides of the loop
    const stations = [0.25, 0.75].map((f) => { const want = len * f; let p = pts[0]; for (const q of pts) if (!q.curve && Math.abs(q.s - want) < Math.abs(p.s - want)) p = q; return { s: p.s, x: p.x, z: p.z }; });
    // each platform's stair comes down on the sidewalk outside the columns, along the street: solid, and kept clear
    for (const st of stations) {
      const k = pts.findIndex((p) => p.s === st.s), a = pts[k - 1], b = pts[k + 1], L = Math.hypot(b.x - a.x, b.z - a.z);
      const tx = (b.x - a.x) / L, tz = (b.z - a.z) / L, alongX = Math.abs(tx) > 0.5;
      const hw = alongX ? CITY.hw(Math.round((st.z - z0) / B)) : CITY.vw(Math.round((st.x - x0) / B));
      Object.assign(st, { tx, tz, hw, so: hw + 2.6 });
      for (const sd of [-1, 1]) {
        const cx = st.x - tz * st.so * sd + tx * 27, cz = st.z + tx * st.so * sd + tz * 27;
        this.colliders.push({ type: 'box', x: cx, z: cz, hx: 7.5, hz: 0.9, c: tx, s: tz, top: y, tall: true });
        this.excl.push({ x0: cx - 8, x1: cx + 8, z0: cz - 8, z1: cz + 8 });
      }
    }
    this.tram = { pts, len, y, frames, stations, box: best };
  }

  // is (x, z) under the elevated tram (within r of its centre line)?
  nearTram(x, z, r = 4) {
    if (!this.tram) return false;
    const { xa, xb, za, zb } = this.tram.box;
    if (x < xa - r || x > xb + r || z < za - r || z > zb + r) return false;
    return Math.abs(x - xa) < r || Math.abs(x - xb) < r || Math.abs(z - za) < r || Math.abs(z - zb) < r;
  }

  // parking bays: lay-bys cut 2.4 m into the sidewalk, so cars parked along the street sit out of the traffic lane
  planParkingBays() {
    const R = this.rand, D = 2.4, SL = 6.2;
    this.bays = [];
    for (const blk of this.blocks) {
      blk.bays = [];
      if (blk.kind === 'fwy' || blk.slope) continue;
      const sides = [
        { alongX: true, lo: blk.x0, hi: blk.x1, a: blk.z0, b: blk.z0 + D, sgn: -1 },
        { alongX: true, lo: blk.x0, hi: blk.x1, a: blk.z1 - D, b: blk.z1, sgn: 1 },
        { alongX: false, lo: blk.z0, hi: blk.z1, a: blk.x0, b: blk.x0 + D, sgn: -1 },
        { alongX: false, lo: blk.z0, hi: blk.z1, a: blk.x1 - D, b: blk.x1, sgn: 1 },
      ];
      for (const sd of sides) {
        if (R() > 0.25) continue;
        const room = sd.hi - sd.lo - 28; // clear of the corners (crossings, traffic lights, hydrants)
        let n = Math.min(3 + Math.floor(R() * 6), Math.floor(room / SL));
        if (n < 2) continue;
        const u0 = sd.lo + 14 + R() * (room - n * SL), u1 = u0 + n * SL;
        const bay = sd.alongX ? { x0: u0, x1: u1, z0: sd.a, z1: sd.b } : { x0: sd.a, x1: sd.b, z0: u0, z1: u1 };
        let ok = true;
        for (let u = u0; u <= u1 && ok; u += 2) {
          const [x, z] = sd.alongX ? [u, (sd.a + sd.b) / 2] : [(sd.a + sd.b) / 2, u];
          if (this.excluded(x, z, 1.5) || this.cityBlockAt(sd.alongX ? x : x - sd.sgn * 4, sd.alongX ? z - sd.sgn * 4 : z) !== blk) ok = false;
        }
        if (!ok) continue;
        Object.assign(bay, { alongX: sd.alongX, sgn: sd.sgn, n, SL, blk, y: CITY.at((bay.x0 + bay.x1) / 2, (bay.z0 + bay.z1) / 2) });
        this.bays.push(bay);
        blk.bays.push(bay);
        this.excl.push({ x0: bay.x0, x1: bay.x1, z0: bay.z0, z1: bay.z1 }); // nothing else stands in the bay
      }
    }
  }

  inBay(x, z) {
    const blk = this.cityBlockAt(x, z);
    if (!blk || !blk.bays) return false;
    for (const b of blk.bays) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return true;
    return false;
  }

  // café parklets: in the kerb strip outside a café, a U of wooden planters round tables and chairs under a big sun roof
  buildParklets() {
    const R = this.rand;
    this.parklets = [];
    for (const b of this.buildings) {
      if (!(b.shopKind === 'cafe' || b.shopKind2 === 'cafe') || !b.shop || !b.shop.faces.length || R() < 0.55) continue;
      const blk = b.blk, [ax, az, bx, bz] = b.shop.faces[0];
      const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      // which side of the block is the street, and is it an ordinary (non-avenue) street?
      let curb, sgn;
      if (alongX) { const up = Math.abs(mz - blk.z0) < Math.abs(mz - blk.z1); curb = up ? blk.z0 : blk.z1; sgn = up ? -1 : 1; if (CITY.hw(up ? blk.j : blk.j + 1) > 7) continue; }
      else { const lf = Math.abs(mx - blk.x0) < Math.abs(mx - blk.x1); curb = lf ? blk.x0 : blk.x1; sgn = lf ? -1 : 1; if (CITY.vw(lf ? blk.i : blk.i + 1) > 7) continue; }
      const off = curb + sgn * 1.6; // centre of the kerb strip, 1.6 m out from the kerb
      const at = (u, v) => (alongX ? [mx + u, off + sgn * v] : [off + sgn * v, mz + u]);
      const [cx, cz] = at(0, 0);
      if (this.onRampPath(cx, cz, 4) || this.parklets.some((p) => Math.hypot(p.x - cx, p.z - cz) < 30) || this.bays.some((b) => cx > b.x0 - 6 && cx < b.x1 + 6 && cz > b.z0 - 6 && cz < b.z1 + 6)) continue;
      const y = CITY.at(cx, cz);
      const rot = alongX ? 0 : Math.PI / 2;
      // planters: two along the traffic side, one at each end
      for (const u of [-2.6, 2.6]) { const [x, z] = at(u, 1.1); this.addPropBox('planterbox', x, z, y, rot, 1.2, 0.45); }
      for (const u of [-4.3, 4.3]) { const [x, z] = at(u, -0.1); this.addPropBox('planterbox', x, z, y, rot + Math.PI / 2, 1.2, 0.45); }
      // tables and chairs underneath, more on the pavement by the window
      for (const u of [-2.2, 1.0]) { const [x, z] = at(u, -0.2); this.addPropRaw('table', x, z, y, R()); for (const d of [-0.8, 0.8]) { const [qx, qz] = at(u + d, -0.2); this.addPropRaw('chair', qx, qz, y, R() * 6); } }
      for (const u of [-3, 0, 3]) { const [x, z] = at(u, -3.6); this.addPropRaw('table', x, z, y + CITY.curb, R()); const [qx, qz] = at(u + 0.8, -3.6); this.addPropRaw('chair', qx, qz, y + CITY.curb, R() * 6); }
      const [tx, tz] = at(0, 0.2);
      this.addPropRaw(R() < 0.5 ? 'tent' : 'tentgreen', tx, tz, y, rot);
      this.parklets.push({ x: cx, z: cz });
    }
  }

  // somewhere to park: cars lined up along the kerb of some city streets, and gravel lots beside country roads
  buildRoadsideParking() {
    const R = this.rand;
    let kerb = 0;
    const types = ['sedan', 'sedan', 'compact', 'pickup', 'van', 'taxi', 'hatch', 'hatch', 'sedan2', 'sedan2', 'suv', 'suv', ...(R() < 0.25 ? ['sport'] : [])];
    for (const bay of this.bays) {
      for (let k = 0; k < bay.n; k++) {
        if (R() < 0.38) continue; // free spaces
        const u = (bay.alongX ? bay.x0 : bay.z0) + (k + 0.5) * bay.SL + (R() - 0.5) * 0.5, c = bay.alongX ? (bay.z0 + bay.z1) / 2 : (bay.x0 + bay.x1) / 2;
        const x = bay.alongX ? u : c, z = bay.alongX ? c : u;
        // parked nose to the traffic flow on that side
        const heading = bay.alongX ? (bay.sgn > 0 ? Math.PI / 2 : -Math.PI / 2) : (bay.sgn > 0 ? Math.PI : 0);
        this.parkedCars.push({ x, z, y: CITY.at(x, z), heading: heading + (R() - 0.5) * 0.04, type: types[Math.floor(R() * types.length)], kerb: true });
        kerb++;
      }
    }
    // country: flat gravel pull-offs beside the road with a few cars
    let lots = 0;
    for (const e of this.edges) {
      if (e.city || e.elev || e.type === 'highway' || e.type === 'mountain' || lots >= 14) continue;
      for (let i = 30; i < e.pts.length - 30 && lots < 14; i += 35) {
        if (R() > 0.4) continue;
        const p = e.pts[i], q = e.pts[i + 3], L = Math.hypot(q.x - p.x, q.z - p.z) || 1, tx = (q.x - p.x) / L, tz = (q.z - p.z) / L;
        const side = R() < 0.5 ? -1 : 1, off = e.halfW + 9;
        const cx = p.x - tz * off * side, cz = p.z + tx * off * side;
        const hs = [[-14, -6], [14, -6], [-14, 6], [14, 6], [0, 0]].map(([u, v]) => this.terrainHeight(cx + tx * u - tz * v * side, cz + tz * u + tx * v * side));
        if (Math.max(...hs) - Math.min(...hs) > 2.2 || this.houseOverlaps(cx, cz, 16) || this.excluded(cx, cz, 4) || this.sampleGrid(this.waterDist, cx, cz) < 12) continue;
        // gravel surface
        for (let u = -15; u <= 15; u += CELL) for (let v = -7; v <= 7; v += CELL) {
          const x = cx + tx * u - tz * v * side, z = cz + tz * u + tx * v * side;
          const k = Math.round((z + HALF) / CELL) * NV + Math.round((x + HALF) / CELL);
          if (k >= 0 && k < this.surf.length) this.surf[k] = SURF.DIRT;
        }
        const n = 2 + Math.floor(R() * 4);
        for (let k = 0; k < n; k++) {
          const u = -11 + k * 5.2, x = cx + tx * u, z = cz + tz * u;
          this.parkedCars.push({ x, z, y: this.terrainHeight(x, z), heading: Math.atan2(-tz, tx) + (R() < 0.5 ? 0 : Math.PI) + (R() - 0.5) * 0.15, type: types[Math.floor(R() * types.length)] });
        }
        this.excl.push({ x0: cx - 16, x1: cx + 16, z0: cz - 16, z1: cz + 16 });
        lots++;
      }
    }
    this.roadsideLots = lots; this.kerbCars = kerb;
  }

  // fenced sheep paddocks and chicken runs on open, gentle grass near the country roads and villages.
  // Every fence piece is a breakable prop: smash one and the animals can get out.
  buildPaddocks() {
    const R = this.rand;
    this.paddocks = [];
    const tryPlace = (kind, cx, cz, fixed = null) => {
      const hx = fixed ? fixed[0] : kind === 'sheep' ? 18 + R() * 8 : 6 + R() * 2, hz = fixed ? fixed[1] : kind === 'sheep' ? 13 + R() * 6 : 4.5 + R() * 1.5;
      if (fixed) return place(kind, cx, cz, hx, hz);
      const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]].map(([a, b]) => [cx + a * (hx + 2), cz + b * (hz + 2)]);
      const hs = corners.map(([x, z]) => this.terrainHeight(x, z));
      if (Math.max(...hs) - Math.min(...hs) > (kind === 'sheep' ? 7 : 2.2)) return false; // gentle ground only
      for (const [x, z] of corners) {
        if (this.inCityRect(x, z, 150) || this.roadDistance(x, z) < 6 || this.sampleGrid(this.waterDist, x, z) < 15) return false;
        if (this.sampleGrid(this.forest, x, z) > 0.25 || this.houseOverlaps(x, z, 12) || this.excluded(x, z, 2)) return false;
        if (this.terrainHeight(x, z) > 160) return false;
      }
      if (this.paddocks.some((p) => Math.abs(p.cx - cx) < p.hx + hx + 25 && Math.abs(p.cz - cz) < p.hz + hz + 25)) return false;
      return place(kind, cx, cz, hx, hz);
    };
    const place = (kind, cx, cz, hx, hz) => {
      const pad = { kind, cx, cz, hx, hz, segs: [] };
      // fence: 4 m pieces round the edge (posts and rails for sheep, a low picket run for the chickens)
      for (const [side, ax, az, bx, bz] of [['n', cx - hx, cz - hz, cx + hx, cz - hz], ['s', cx - hx, cz + hz, cx + hx, cz + hz], ['w', cx - hx, cz - hz, cx - hx, cz + hz], ['e', cx + hx, cz - hz, cx + hx, cz + hz]]) {
        const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 4));
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n, x = ax + (bx - ax) * (t0 + t1) / 2, z = az + (bz - az) * (t0 + t1) / 2;
          const rot = side === 'n' || side === 's' ? 0 : -Math.PI / 2;
          const prop = this.addPropBox(kind === 'sheep' ? 'railfence' : 'fence', x, z, this.terrainHeight(x, z), rot, L / n / 2, 0.12);
          pad.segs.push({ side, a: (side === 'n' || side === 's') ? ax + (bx - ax) * t0 : az + (bz - az) * t0, b: (side === 'n' || side === 's') ? ax + (bx - ax) * t1 : az + (bz - az) * t1, prop });
        }
      }
      // keep trees and other clutter out
      this.excl.push({ x0: cx - hx - 1, x1: cx + hx + 1, z0: cz - hz - 1, z1: cz + hz + 1 });
      this.paddocks.push(pad);
      return true;
    };
    // every farm has its own sheep paddock and chicken run
    for (const f of this.farms || []) for (const p of f.pens) tryPlace(p.kind, p.cx, p.cz, [p.hx, p.hz]);
    // candidates: points beside country roads (so you actually drive past them), more around the farms and villages
    const cands = [];
    for (const e of this.edges) {
      if (e.city || e.elev || e.type === 'highway' || e.type === 'mountain') continue;
      for (let i = 10; i < e.pts.length - 10; i += 12) {
        const p = e.pts[i], q = e.pts[i + 1], L = Math.hypot(q.x - p.x, q.z - p.z) || 1;
        const side = R() < 0.5 ? -1 : 1, off = e.halfW + 30 + R() * 25;
        cands.push([p.x - ((q.z - p.z) / L) * off * side, p.z + ((q.x - p.x) / L) * off * side]);
      }
    }
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    let sheep = 0, hens = 0;
    for (const [x, z] of cands) {
      if (sheep < 16 && tryPlace('sheep', x, z)) sheep++;
      else if (hens < 12 && R() < 0.5 && tryPlace('chicken', x, z)) hens++;
      if (sheep >= 16 && hens >= 12) break;
    }
  }

  // is (x,z) on the low part of an expressway ramp (where it leaves the street)? keep furniture off it
  onRampPath(x, z, m = 0) {
    if (!this._rampBoxes) {
      this._rampBoxes = this.edges.filter((e) => e.ramp).map((e) => {
        let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
        for (const p of e.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
        return { e, x0: x0 - e.halfW - 3, x1: x1 + e.halfW + 3, z0: z0 - e.halfW - 3, z1: z1 + e.halfW + 3 };
      });
    }
    for (const b of this._rampBoxes) {
      if (x < b.x0 - m || x > b.x1 + m || z < b.z0 - m || z > b.z1 + m) continue;
      const P = b.e.pts;
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], c = P[i + 1];
        if (Math.abs(a.x - x) > 20 || Math.abs(a.z - z) > 20) continue;
        if (distToSeg(x, z, a.x, a.z, c.x, c.z)[0] < b.e.halfW + 1.5 + m) return true;
      }
    }
    return false;
  }

  // A drivable elevated deck (ramp/footbridge/viaduct) using the bridge physics.
  // opts: rails ('auto' | list of [ax,az,bx,bz]), pillars [[x,z]], solidBelow (wall in under low parts)
  addDeck(pts, halfW, kind, opts = {}) {
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (const p of pts) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z); }
    const m = halfW + 2;
    let rails = opts.rails;
    if (!rails) {
      // railings along both edges of a straight deck
      const a = pts[0], b = pts[pts.length - 1], L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const rx = -(b.z - a.z) / L, rz = (b.x - a.x) / L, o = halfW + 0.25;
      rails = [-1, 1].map((s) => [a.x + rx * o * s, a.z + rz * o * s, b.x + rx * o * s, b.z + rz * o * s]);
    }
    const br = { custom: true, kind, pts, halfW, minx: minx - m, maxx: maxx + m, minz: minz - m, maxz: maxz + m, rails, pillars: [], solid: new Uint8Array(pts.length) };
    this.bridges.push(br);
    this.excl.push({ x0: minx - halfW - 1, x1: maxx + halfW + 1, z0: minz - halfW - 1, z1: maxz + halfW + 1 });
    // solid ramp body where the deck is too low to drive under
    for (let i = 0; i < pts.length - 1 && !opts.noSolid; i++) {
      const a = pts[i], b = pts[i + 1];
      const ground = this.terrainHeight((a.x + b.x) / 2, (a.z + b.z) / 2) + CITY.curb;
      if (Math.max(a.y, b.y) - ground > 4.4) continue;
      br.solid[i] = 1;
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
      if (L < 1e-3) continue;
      // solid ramp body: blocks from the sides, but a car meeting a low enough face drives up onto it
      this.colliders.push({ type: 'box', x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, hx: L / 2 + 0.05, hz: halfW, c: dx / L, s: dz / L, top: Math.min(a.y, b.y) - 0.25, rampAx: dx / L, rampAz: dz / L, ya: a.y, yb: b.y });
    }
    for (const [x, z] of opts.pillars || []) {
      const y = this.deckHeight(br, x, z);
      br.pillars.push({ x, z, y });
      this.colliders.push({ type: 'circle', x, z, r: 0.45, top: y - 1.2 });
    }
    return br;
  }

  // ramps climbing out of two parks onto a bridge over the street, landing in a car park
  buildViaducts() {
    const byKey = (k) => this.blocks.find((b) => `${b.i},${b.j}` === k);
    for (const [pk, lk] of this.viaductPlan) {
      const P = byKey(pk), Lb = byKey(lk);
      const zc = (P.z0 + P.z1) / 2, H = 6.6, hw = 3.2;
      const xs = P.x0 + 9, xa = P.x1 - 2, xb = Lb.x0 + 2, xe = Lb.x1 - 9;
      const gy = P.y + CITY.curb;
      const pts = [];
      const ease = (t) => t * t * (3 - 2 * t) * 0.35 + t * 0.65;
      for (let x = xs; x < xa; x += 2) pts.push({ x, z: zc, y: gy + H * ease((x - xs) / (xa - xs)) });
      for (let x = xa; x < xb; x += 2) pts.push({ x, z: zc, y: gy + H });
      for (let x = xb; x <= xe + 0.01; x += 2) pts.push({ x, z: zc, y: gy + H * ease(1 - (x - xb) / (xe - xb)) });
      this.addDeck(pts, hw, 'viaduct', { pillars: [[xa - 1, zc - hw + 0.6], [xa - 1, zc + hw - 0.6], [xb + 1, zc - hw + 0.6], [xb + 1, zc + hw - 0.6]] });
    }
  }

  // multi-storey car parks: three decks above the ground floor joined by switchback ramps
  buildGarages() {
    const R = this.rand;
    const gy = CITY.y + CITY.curb, FH = 3.7, SW = 6.5, NL = 3;
    for (const blk of this.blocks) {
      if (blk.kind !== 'garage') continue;
      const gy = blk.y + CITY.curb;
      const X0 = blk.x0 + 5.5, X1 = blk.x1 - 5.5, cz = (blk.z0 + blk.z1) / 2;
      const Z0 = cz - 23, Z1 = cz + 23;
      const lv = (k) => gy + k * FH;
      const sz0 = Z0 + SW, sz1 = Z1 - SW, zs = (sz0 + sz1) / 2, shw = (sz1 - sz0) / 2;
      const line = (xa, xb, z, ya, yb, step = 2) => {
        const out = [], n = Math.max(1, Math.round(Math.abs(xb - xa) / step));
        for (let q = 0; q <= n; q++) { const t = q / n; out.push({ x: xa + (xb - xa) * t, z, y: ya + (yb - ya) * t }); }
        return out;
      };
      const ease = (pts, y0, y1) => pts.map((p) => { const t = (p.y - y0) / (y1 - y0 || 1); return { ...p, y: y0 + (y1 - y0) * (t * t * (3 - 2 * t) * 0.3 + t * 0.7) }; });
      // decks
      for (let k = 1; k <= NL; k++) {
        this.addDeck(line(X0, X1, zs, lv(k), lv(k), 4), shw, 'garage', { noSolid: true, rails: [[X0, sz0, X0, sz1], [X1, sz0, X1, sz1]] });
      }
      // south lane: ground -> 1, and 2 -> roof
      const sZ = Z0 + SW / 2, nZ = Z1 - SW / 2, lw = SW / 2 - 0.15;
      const s0 = [...ease(line(X0 + 8, X1 - 9, sZ, lv(0), lv(1)), lv(0), lv(1)), ...line(X1 - 8, X1, sZ, lv(1), lv(1)).slice(0)];
      this.addDeck(s0, lw, 'garage', { rails: [[X0 + 8, Z0, X1, Z0], [X1, Z0, X1, Z0 + SW]] });
      const s2 = [...line(X0, X0 + 8, sZ, lv(2), lv(2)), ...ease(line(X0 + 9, X1 - 9, sZ, lv(2), lv(3)), lv(2), lv(3)), ...line(X1 - 8, X1, sZ, lv(3), lv(3))];
      this.addDeck(s2, lw, 'garage', { noSolid: true, rails: [[X0, Z0, X1, Z0], [X0, Z0, X0, Z0 + SW], [X1, Z0, X1, Z0 + SW]] });
      // north lane: 1 -> 2 (runs the other way)
      const n1 = [...line(X1, X1 - 8, nZ, lv(1), lv(1)), ...ease(line(X1 - 9, X0 + 9, nZ, lv(1), lv(2)), lv(1), lv(2)), ...line(X0 + 8, X0, nZ, lv(2), lv(2))];
      this.addDeck(n1, lw, 'garage', { noSolid: true, rails: [[X0, Z1, X1, Z1], [X0, Z1 - SW, X0, Z1], [X1, Z1 - SW, X1, Z1]] });
      // columns from the ground to the roof
      const cols = [];
      for (let x = X0 + 12; x <= X1 - 11; x += 12) {
        for (const z of [sz0, zs, sz1]) {
          cols.push({ x, z });
          this.colliders.push({ type: 'circle', x, z, r: 0.4, top: lv(NL) - 0.1 });
        }
      }
      // parking bays and parked cars
      const stalls = [];
      for (let k = 0; k <= NL; k++) {
        for (const [z, heading] of [[sz0 + 2.7, 0], [sz1 - 2.7, Math.PI]]) {
          for (let x = X0 + 10; x <= X1 - 10; x += 3.1) {
            stalls.push({ x, z, y: lv(k), heading });
            if (R() < (k === 0 ? 0.28 : 0.18)) {
              const type = ['sedan', 'sedan', 'compact', 'van', 'pickup', 'taxi'][Math.floor(R() * 6)];
              this.parkedCars.push({ x, z, y: lv(k), heading: heading + (R() - 0.5) * 0.08, type });
            }
          }
        }
      }
      this.garages.push({ X0, X1, Z0, Z1, SW, FH, NL, gy, cols, stalls, blk });
      this.excl.push({ x0: X0 - 1, x1: X1 + 1, z0: Z0 - 1, z1: Z1 + 1 });
    }
  }

  // small dirt wedge jumps out in the fields beside country roads
  buildCountryJumps() {
    const R = this.rand;
    const roads = this.edges.filter((e) => !e.city && e.len > 200);
    let made = 0, tries = 0;
    while (made < 70 && tries++ < 900) {
      const e = roads[Math.floor(R() * roads.length)];
      const i = 3 + Math.floor(R() * (e.pts.length - 6));
      if (e.bridge[i]) continue;
      const p = e.pts[i], q = e.pts[i + 1];
      const L = Math.hypot(q.x - p.x, q.z - p.z) || 1;
      const tx = (q.x - p.x) / L, tz = (q.z - p.z) / L, rx = -tz, rz = tx;
      const side = R() < 0.5 ? -1 : 1, off = e.halfW + 11 + R() * 14;
      const cx = p.x + rx * off * side, cz = p.z + rz * off * side;
      if (this.roadDistance(cx, cz) < 5 || this.inCityRect(cx, cz, 30) || this.houseOverlaps(cx, cz, 14)) continue;
      if (this.sampleGrid(this.waterDist, cx, cz) < 15) continue;
      // only out in open fields and meadows, never in the woods
      if (this.sampleGrid(this.forest, cx, cz) > 0.12) continue;
      const sk = Math.round((cz + HALF) / CELL) * NV + Math.round((cx + HALF) / CELL);
      if (this.surf[sk] === SURF.ROCK || this.surf[sk] === SURF.SAND) continue;
      // keep it to gentle ground
      const h0 = this.terrainHeight(cx - tx * 4, cz - tz * 4), h1 = this.terrainHeight(cx + tx * 4, cz + tz * 4);
      if (Math.abs(h1 - h0) > 1.2) continue;
      // a natural dirt mound shaped into the terrain: long run-up, crest, short drop
      const Hm = 1.0 + R() * 0.6, dir = R() < 0.5 ? 1 : -1;
      const dx = tx * dir, dz = tz * dir;
      const H = this.heights;
      for (let j = Math.floor((cz - 14 + HALF) / CELL); j <= Math.ceil((cz + 14 + HALF) / CELL); j++) {
        for (let i = Math.floor((cx - 14 + HALF) / CELL); i <= Math.ceil((cx + 14 + HALF) / CELL); i++) {
          if (i < 0 || j < 0 || i > N || j > N) continue;
          const x = -HALF + i * CELL - cx, z = -HALF + j * CELL - cz;
          const u = x * dx + z * dz, v = Math.abs(x * -dz + z * dx);
          const fu = u < -11 || u > 6 ? 0 : u < 0 ? smoothstep(-11, 0, u) : 1 - smoothstep(0, 6, u);
          const fv = 1 - smoothstep(3, 7, v);
          if (fu * fv <= 0) continue;
          H[j * NV + i] += Hm * fu * fv;
          if (fu * fv > 0.25) this.surf[j * NV + i] = SURF.DIRT;
        }
      }
      this.excl.push({ x0: cx - 14, x1: cx + 14, z0: cz - 14, z1: cz + 14 }); // a clear run-up and landing
      made++;
    }
  }

  // repair workshop: three walls and a roof, open at the front (local +z faces the street)
  addWorkshop(x, z, rot, y) {
    const w = 12, d = 9, h = 5.2;
    const ws = { x, z, rot, y, w, d, h };
    this.workshops.push(ws);
    const c = Math.cos(rot), s = Math.sin(rot);
    const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const wall = (lx, lz, hx, hz) => { const [wx, wz] = at(lx, lz); this.colliders.push({ type: 'box', x: wx, z: wz, hx, hz, c, s: -s, top: y + h, tall: true }); };
    wall(0, -d / 2, w / 2 + 0.25, 0.25);
    wall(-w / 2, 0, 0.25, d / 2);
    wall(w / 2, 0, 0.25, d / 2);
    const R = Math.hypot(w, d) / 2 + 2;
    this.excl.push({ x0: x - R, x1: x + R, z0: z - R, z1: z + R });
    return ws;
  }

  // little jump ramps in parks and the plaza
  buildKickers() {
    const R = this.rand;
    for (const blk of this.blocks) {
      if (blk.kind !== 'park' && blk.kind !== 'plaza' && blk.kind !== 'lot') continue;
      if (this.viaductPlan.some(([p]) => p === `${blk.i},${blk.j}`)) continue;
      for (let k = 0; k < 2; k++) {
        const horizontal = R() < 0.5, dir = R() < 0.5 ? 1 : -1;
        const cx = lerp(blk.x0 + 16, blk.x1 - 16, R()), cz = lerp(blk.z0 + 16, blk.z1 - 16, R());
        if (blk.kind === 'plaza' && Math.hypot(cx - this.plaza.x, cz - this.plaza.z) < 16) continue;
        if (this.excluded(cx, cz, 6)) continue;
        const pts = [], len = 8, rise = 0.9;
        for (let t = 0; t <= len + 0.01; t += 1) {
          const u = (t - len / 2) * dir;
          pts.push({ x: horizontal ? cx + u : cx, z: horizontal ? cz : cz + u, y: CITY.at(cx, cz) + CITY.curb + 0.02 + rise * Math.pow(t / len, 1.5) });
        }
        this.addDeck(pts, 2.1, 'kicker', { rails: [] });
        // keep the run-up and landing clear of trees
        const ax = horizontal ? 16 : 3, az = horizontal ? 3 : 16;
        this.excl.push({ x0: cx - ax, x1: cx + ax, z0: cz - az, z1: cz + az });
      }
    }
  }

  // sidewalks that ramp up into pedestrian bridges across the street
  buildFootbridges() {
    const R = this.rand;
    const { x0, z0, B, NX, NZ } = CITY;
    const cands = [];
    for (let j = 1; j < NZ; j++) for (let i = 0; i < NX; i++) cands.push({ h: true, i, j });
    for (let i = 1; i < NX; i++) for (let j = 0; j < NZ; j++) cands.push({ h: false, i, j });
    const blockAt = (i, j) => (i >= 0 && j >= 0 && i < NX && j < NZ ? this.blocks[j * NX + i] : null);
    let made = 0;
    while (cands.length && made < 7) {
      const c = cands.splice(Math.floor(R() * cands.length), 1)[0];
      const b1 = c.h ? blockAt(c.i, c.j - 1) : blockAt(c.i - 1, c.j), b2 = blockAt(c.i, c.j);
      if (!b1 || !b2 || b1.kind !== 'build' || b2.kind !== 'build') continue;
      if (c.h ? c.j === CITY.avenueJ : c.i === CITY.avenueI) continue;
      const half = c.h ? CITY.hw(c.j) : CITY.vw(c.i);
      const center = c.h ? z0 + c.j * B : x0 + c.i * B; // street centre line (across)
      const along0 = c.h ? x0 + c.i * B : z0 + c.j * B; // node position along
      const us = along0 + B / 2 + (R() - 0.5) * 10;
      const off = half + 2.0, W = 2.2, H = 5.6, Lr = 34;
      // local (u along street, v across) -> world
      const toW = (u, v) => (c.h ? [u, center + v] : [center + v, u]);
      if (this.excluded(...toW(us, 0), Lr + 8)) continue;
      const [fx0, fz0] = toW(us, 0), [fx1, fz1] = toW(us + Lr, 0);
      if (Math.abs(CITY.at(fx0, fz0) - CITY.at(fx1, fz1)) > 0.1) continue; // footbridges only over level streets
      const gy = CITY.at(fx0, fz0) + CITY.curb, top = gy - CITY.curb + H;
      const pts = [];
      const push = (u, v, y) => { const [x, z] = toW(u, v); pts.push({ x, z, y }); };
      for (let u = us - W - Lr; u < us - W; u += 2) push(u, -off, gy + (top - gy) * ((u - (us - W - Lr)) / Lr));
      push(us - W, -off, top); push(us, -off, top);
      for (let v = -off + 2; v < off; v += 2) push(us, v, top);
      push(us, off, top); push(us + W, off, top);
      for (let u = us + W + 2; u <= us + W + Lr + 0.01; u += 2) push(u, off, top - (top - gy) * ((u - (us + W)) / Lr));
      const r = W + 0.25;
      const seg = (u0, v0, u1, v1) => [...toW(u0, v0), ...toW(u1, v1)];
      const rails = [
        seg(us - W - Lr, -off - r, us + r, -off - r), // west ramp outer + landing back
        seg(us - W - Lr, -off + r, us - r, -off + r), // west ramp, street side (gap for the span)
        seg(us - r, -off + r, us - r, off + r), // span side
        seg(us + r, -off - r, us + r, off - r), // span side
        seg(us - r, off + r, us + W + Lr, off + r), // east ramp outer + landing back
        seg(us + r, off - r, us + W + Lr, off - r), // east ramp, street side
      ];
      const pillars = [toW(us, -off - 1.3), toW(us, off + 1.3)];
      this.addDeck(pts, W, 'footbridge', { rails, pillars });
      made++;
    }
  }

  // helper: deck along a local frame (origin ox,oz; heading ang = direction of u); prof(u) -> height above ground
  localDeck(ox, oz, ang, u0, u1, step, prof, halfW, kind, opts = {}) {
    const c = Math.cos(ang), s = Math.sin(ang), gy = CITY.at(ox, oz) + CITY.curb;
    const pts = [];
    for (let u = u0; u <= u1 + 1e-6; u += step) pts.push({ x: ox + c * u, z: oz + s * u, y: gy + 0.02 + prof(u) });
    return this.addDeck(pts, halfW, kind, { rails: [], ...opts });
  }

  // skate park: mini half-pipe, funbox, spine, kickers, grind ledges, graffiti walls
  buildSkateParks() {
    this.skateWalls = [];
    for (const blk of this.blocks) {
      if (blk.kind !== 'skate') continue;
      const cx = (blk.x0 + blk.x1) / 2, cz = (blk.z0 + blk.z1) / 2;
      // half-pipe along x in the north half: two quarter pipes facing each other with a platform behind each
      const R = 5.2, qu = 3.9, qh = R - Math.sqrt(R * R - qu * qu);
      const qp = (u) => (u <= 0 ? 0 : u >= qu ? qh : R - Math.sqrt(R * R - u * u));
      const zH = cz - 15, flat = 12;
      this.localDeck(cx + flat / 2, zH, 0, 0, qu + 3, 0.5, (u) => qp(Math.min(u, qu)), 6, 'skate');
      this.localDeck(cx - flat / 2, zH, Math.PI, 0, qu + 3, 0.5, (u) => qp(Math.min(u, qu)), 6, 'skate');
      // funbox: up, flat top, down
      this.localDeck(cx - 18, cz + 12, 0, 0, 16, 0.5, (u) => (u < 5 ? 1.1 * u / 5 : u < 11 ? 1.1 : 1.1 * (16 - u) / 5), 4, 'skate');
      // spine: two ramps back to back
      this.localDeck(cx + 14, cz + 6, Math.PI / 2, 0, 12, 0.5, (u) => 1.4 * (1 - Math.abs(u - 6) / 6) ** 0.8, 4, 'skate');
      // small kickers
      this.localDeck(cx + 4, cz + 24, Math.PI, 0, 5, 0.5, (u) => 0.6 * (u / 5) ** 1.3, 1.8, 'kicker');
      this.localDeck(cx - 28, cz - 2, -Math.PI / 2, 0, 5, 0.5, (u) => 0.6 * (u / 5) ** 1.3, 1.8, 'kicker');
      // grind ledges: low boxes you can drive over
      this.localDeck(cx - 4, cz + 2, 0, 0, 7, 0.5, (u) => (u < 0.4 ? u : u > 6.6 ? 7 - u : 0.4), 0.9, 'ledge');
      this.localDeck(cx + 24, cz - 26, Math.PI / 2, 0, 7, 0.5, (u) => (u < 0.4 ? u : u > 6.6 ? 7 - u : 0.4), 0.9, 'ledge');
      // graffiti walls (solid, low)
      for (const [x, z, hx, hz] of [[cx - 30, cz - 28, 8, 0.25], [cx + 30, cz + 20, 0.25, 9], [cx - 6, cz + 32, 10, 0.25]]) {
        this.skateWalls.push({ x, z, hx, hz, y: CITY.at(x, z) + CITY.curb, h: 1.8 });
        this.colliders.push({ type: 'box', x, z, hx, hz, c: 1, s: 0, top: CITY.at(x, z) + CITY.curb + 1.8 });
      }
      this.excl.push({ x0: blk.x0 + 4, x1: blk.x1 - 4, z0: blk.z0 + 4, z1: blk.z1 - 4 });
    }
  }

  // raised terraces in the plaza: a staircase up one side, a ramp down the other
  buildPlazaTerraces() {
    for (const blk of this.blocks) {
      if (blk.kind !== 'plaza') continue;
      for (const [fx, fz, ang] of [[0.25, 0.25, 0], [0.75, 0.75, Math.PI]]) {
        const ox = lerp(blk.x0, blk.x1, fx), oz = lerp(blk.z0, blk.z1, fz);
        const H = 1.6, stairs = 9, run = 0.45, rise = H / stairs;
        // u: staircase, then 12 m terrace, then a 9 m ramp back down
        const prof = (u) => {
          if (u < stairs * run) return Math.min(stairs, Math.floor((u + 0.03) / run)) * rise;
          if (u < stairs * run + 12) return H;
          return Math.max(0, H * (1 - (u - stairs * run - 12) / 9));
        };
        this.localDeck(ox - Math.cos(ang) * 14, oz - Math.sin(ang) * 14, ang, 0, stairs * run + 21, 0.15, prof, 4.5, 'stairs', { rails: [] });
      }
    }
  }

  // ramps in the back alleys: rooftop ramps, loading-dock ledges, kickers
  buildAlleyFeatures() {
    const R = this.rand;
    const gy = CITY.y + CITY.curb;
    let roofs = 0;
    // alley-local frame: u along the alley, v across (0 at the alley's low edge)
    for (const a of this.alleys) {
      const gy = CITY.at((a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2) + CITY.curb;
      const V = a.vertical;
      const u0 = V ? a.z0 : a.x0, u1 = V ? a.z1 : a.x1, v0 = V ? a.x0 : a.z0, v1 = V ? a.x1 : a.z1;
      const toW = (u, v) => (V ? [v, u] : [u, v]);
      const P = (u, v, y) => { const [x, z] = toW(u, v); return { x, z, y }; };
      const taken = [];
      const free = (ua, ub) => taken.every(([p, q]) => ub < p - 3 || ua > q + 3) && ua > u0 + 6 && ub < u1 - 6;
      // rooftop ramp onto a low building along one side
      if (roofs < 6 && R() < 0.55) {
        for (const side of [0, 1]) {
          const cands = this.buildings.filter((b) => b.blk === a.blk && !b.setback && !b.driveThru && b.h >= 6.8 && b.h <= 14 &&
            Math.abs((V ? (side ? b.x - b.hx : b.x + b.hx) : (side ? b.z - b.hz : b.z + b.hz)) - (side ? v1 : v0)) < 3.5);
          const b = cands[0];
          if (!b) continue;
          const roofY = gy + b.h + 0.3, H = roofY - gy;
          const bu0 = V ? b.z - b.hz : b.x - b.hx, bu1 = V ? b.z + b.hz : b.x + b.hx;
          const rampLen = H / 0.17, land = 6;
          const dir = (bu0 - u0) > (u1 - bu1) ? 1 : -1; // ramp rises toward the building's far end
          const top = dir > 0 ? Math.min(bu1 - 2, bu0 + land + 4) : Math.max(bu0 + 2, bu1 - land - 4);
          const start = top - dir * (rampLen + land);
          if (Math.min(start, top) < u0 + 4 || Math.max(start, top) > u1 - 4) continue;
          const vr = side ? v1 - 1.9 : v0 + 1.9;
          const pts = [];
          for (let q = 0; q <= rampLen; q += 2) pts.push(P(start + dir * q, vr, gy + H * (q / rampLen)));
          for (let q = 2; q <= land; q += 2) pts.push(P(start + dir * (rampLen + q), vr, roofY));
          const wallV = side ? v1 : v0, out = side ? -1 : 1;
          this.addDeck(pts, 1.75, 'ramp', { rails: [[...toW(start, vr - out * 2.0), ...toW(top, vr - out * 2.0)]] });
          // the roof itself is a deck you can drive on (no railings: jump off it!)
          const rpts = [];
          const ra = V ? b.x : b.z, rhw = V ? b.hx : b.hz, ru0 = bu0 + 0.3, ru1 = bu1 - 0.3;
          for (let u = ru0; u <= ru1 + 0.01; u += 3) rpts.push(P(u, ra, roofY));
          if (rpts.length > 1) this.addDeck(rpts, rhw - 0.2, 'roof', { rails: [], noSolid: true });
          b.roofDeck = true;
          taken.push([Math.min(start, top), Math.max(start, top)]);
          roofs++;
          void wallV;
          break;
        }
      }
      // loading-dock ledge: ramp up, run along the wall, drop off the end
      if (R() < 0.5) {
        const len = 14, rise = 0.7;
        const s0 = u0 + 8 + R() * Math.max(1, u1 - u0 - 16 - len);
        if (free(s0, s0 + len)) {
          const side = R() < 0.5 ? 0 : 1, vr = side ? v1 - 1.7 : v0 + 1.7, dir = R() < 0.5 ? 1 : -1;
          const base = dir > 0 ? s0 : s0 + len;
          const pts = [];
          for (let q = 0; q <= len; q += 1) pts.push(P(base + dir * q, vr, gy + 0.02 + rise * Math.min(1, q / 5)));
          this.addDeck(pts, 1.5, 'dock', { rails: [] });
          taken.push([s0, s0 + len]);
        }
      }
      // a short flight of steps up to a raised stretch of alley, then a ramp back down
      if (R() < 0.3) {
        const len = 18, s0 = u0 + 8 + R() * Math.max(1, u1 - u0 - 16 - len);
        if (free(s0, s0 + len)) {
          const dir = R() < 0.5 ? 1 : -1, base = dir > 0 ? s0 : s0 + len, vc = (v0 + v1) / 2;
          const pts = [];
          for (let q = 0; q <= len + 1e-6; q += 0.15) {
            const st = 5, run = 0.45, rise = 0.95 / st;
            const y = q < st * run ? Math.min(st, Math.floor((q + 0.03) / run)) * rise : q < len - 6 ? 0.95 : 0.95 * (len - q) / 6;
            pts.push(P(base + dir * q, vc, gy + 0.02 + y));
          }
          this.addDeck(pts, (v1 - v0) / 2 - 0.4, 'stairs', { rails: [] });
          taken.push([s0, s0 + len]);
        }
      }
      // a couple of kickers down the middle
      for (let k = 0; k < 2; k++) {
        if (R() > 0.55) continue;
        const len = 7, s0 = u0 + 8 + R() * Math.max(1, u1 - u0 - 16 - len);
        if (!free(s0, s0 + len)) continue;
        const dir = R() < 0.5 ? 1 : -1, base = dir > 0 ? s0 : s0 + len, vc = (v0 + v1) / 2;
        const pts = [];
        for (let q = 0; q <= len; q += 1) pts.push(P(base + dir * q, vc, gy + 0.02 + 0.75 * Math.pow(q / len, 1.4)));
        this.addDeck(pts, 1.6, 'kicker', { rails: [] });
        taken.push([s0, s0 + len]);
      }
    }
  }

  // street trees along the avenue sidewalks
  buildStreetTrees() {
    const { x0, z0, B } = CITY;
    const ax = x0 + CITY.avenueI * B, az = z0 + CITY.avenueJ * B;
    const gy = CITY.y + CITY.curb;
    for (const blk of this.blocks) {
      if (blk.kind === 'park' || blk.kind === 'lot') continue;
      const sides = [];
      if (Math.abs(blk.x1 - (ax - CITY.vw(CITY.avenueI))) < 0.5) sides.push([blk.x1 - 1.6, blk.z0, blk.x1 - 1.6, blk.z1]);
      if (Math.abs(blk.x0 - (ax + CITY.vw(CITY.avenueI))) < 0.5) sides.push([blk.x0 + 1.6, blk.z0, blk.x0 + 1.6, blk.z1]);
      if (Math.abs(blk.z1 - (az - CITY.hw(CITY.avenueJ))) < 0.5) sides.push([blk.x0, blk.z1 - 1.6, blk.x1, blk.z1 - 1.6]);
      if (Math.abs(blk.z0 - (az + CITY.hw(CITY.avenueJ))) < 0.5) sides.push([blk.x0, blk.z0 + 1.6, blk.x1, blk.z0 + 1.6]);
      for (const [a1, b1, a2, b2] of sides) {
        const L = Math.hypot(a2 - a1, b2 - b1);
        for (let d = 9; d < L - 8; d += 15) {
          const t = d / L, x = lerp(a1, a2, t), z = lerp(b1, b2, t);
          if (this.excluded(x, z, 1)) continue;
          this.addTree(x, z, CITY.at(x, z) + CITY.curb, 0, 0.85 + this.rand() * 0.2);
        }
      }
    }
  }

  addLamp(x, z, y, rot) {
    const lamp = { x, z, y, rot, broken: false, tilt: 0, tiltDir: 0, idx: this.lamps.length };
    this.lamps.push(lamp);
    this.colliders.push({ type: 'circle', x, z, r: 0.2, top: y + 8, breakable: true, ref: lamp });
  }

  // private homes in a handful of deliberate styles, each with its own proportions, roof and colours
  addHouse(x, z, rot, y, suburban = false, forceStyle = null) {
    const R = this.rand;
    const pick = (arr) => arr[Math.floor(R() * arr.length)];
    const nearFarm = this.surf[Math.round((z + HALF) / CELL) * NV + Math.round((x + HALF) / CELL)] === SURF.FIELD || Math.hypot(x + 950, z - 1150) < 400; // fields, or Harlow farm country
    const r = R();
    const style = forceStyle || (nearFarm && r < 0.3 ? 'barn' : r < 0.24 ? 'cottage' : r < 0.42 ? 'farmhouse' : r < 0.6 ? 'bungalow' : r < 0.76 ? 'colonial' : r < 0.9 ? 'modern' : 'cottage');
    const S = {
      cottage: { w: [8, 10], d: [7, 8.5], h: 3.3, roof: [3.2, 3.8], walls: [0xf0e6d6, 0xe8dcc4, 0xdfe6dc, 0xf2e2d0, 0xe6d5c3], roofs: [0x4a4a52, 0x6b3a2e, 0x3d4a5a], trim: 0xf6f3ec, accent: [0x3f6b4a, 0x2f5a8a, 0x8a3a2a] },
      farmhouse: { w: [11, 14], d: [8, 9.5], h: 6.3, roof: [2.6, 3.2], walls: [0xf4f1ea, 0xf0e6c8, 0xdfe3d4], roofs: [0x4a4f55, 0x5c3b30, 0x3a3f44], trim: 0xffffff, accent: [0x2f3a44, 0x8a3a2a, 0x3f6b4a] },
      bungalow: { w: [12, 15], d: [9, 11], h: 3.3, roof: [1.9, 2.4], walls: [0xd9c4a0, 0xc9d5b9, 0xb8a089, 0xd9a68a, 0xe2d2b6], roofs: [0x5c3b30, 0x6b4a36, 0x4a4a52], trim: 0xf0ece0, accent: [0x6b4a2e, 0x2f5a8a, 0x3f6b4a] },
      colonial: { w: [12, 14], d: [8, 9], h: 6.4, roof: [2.6, 3.0], walls: [0x8a3b2c, 0x9a4632, 0xf0ece0, 0xe8e2d4], roofs: [0x3a3f44, 0x2e3238], trim: 0xffffff, accent: [0x1a1a1a, 0x1f2f44] },
      modern: { w: [11, 14], d: [9, 11], h: R() < 0.5 ? 3.4 : 6.6, roof: [0.6, 0.6], walls: [0xf2f2ee, 0x3a3d40, 0xe6e4de], roofs: [0x2a2c2e], trim: 0x2a2c2e, accent: [0x9a6b3c, 0xb07a44] },
      barn: { w: [10, 12], d: [8, 10], h: 3.4, roof: [3.6, 4.2], walls: [0x8a2a1e, 0x9a3222, 0x7a5a3a], roofs: [0x3a3f44, 0x4a4f55], trim: 0xf6f3ec, accent: [0xf6f3ec] },
    }[style];
    const rng = (a) => a[0] + R() * (a[1] - a[0]);
    const w = rng(S.w), d = rng(S.d), h = S.h;
    const house = {
      x, z, rot, y, w, d, h, roofH: rng(S.roof), style,
      color: pick(S.walls), roof: pick(S.roofs), trim: S.trim, accent: pick(S.accent), suburban,
      chimney: style !== 'modern' && R() < 0.75, dormers: style === 'cottage' ? 1 + Math.floor(R() * 2) : 0, shutters: style === 'cottage' || style === 'colonial' || (style === 'farmhouse' && R() < 0.5),
      flowers: style === 'cottage' || R() < 0.3, seed: Math.floor(R() * 1e6),
    };
    if (house.color === 0x3a3d40) house.trim = 0xf2f2ee; // dark modern box: light trim
    this.houses.push(house);
    this.colliders.push({ type: 'box', x, z, hx: w / 2, hz: d / 2, c: Math.cos(rot), s: -Math.sin(rot), top: y + h + house.roofH, tall: true });
    if (style === 'farmhouse') { // the porch roof posts stop you too
      const [px, pz] = this.houseToWorld(house, 0, d / 2 + 1.3);
      this.colliders.push({ type: 'box', x: px, z: pz, hx: w / 2 - 0.5, hz: 1.2, c: Math.cos(rot), s: -Math.sin(rot), top: y + 3.2, bottom: y + 2.8, tall: true });
    }
    return house;
  }

  buildVillages() {
    const R = this.rand;
    // a repair workshop by the road in two of the villages
    for (const v of this.villages.filter((q) => q.name === 'Ashford' || q.name === 'Harlow')) {
      for (let tries = 0; tries < 40; tries++) {
        const nr = this.roadSpawnNear(v.x + (R() - 0.5) * 140, v.z + (R() - 0.5) * 140, 0, 200);
        if (!nr) continue;
        const e = nr.edge, p = e.pts[nr.idx], q = e.pts[nr.idx + 1] || p;
        const L = Math.hypot(q.x - p.x, q.z - p.z) || 1;
        const rx = -(q.z - p.z) / L, rz = (q.x - p.x) / L, side = R() < 0.5 ? -1 : 1;
        const off = e.halfW + 10;
        const x = p.x + rx * off * side, z = p.z + rz * off * side;
        if (this.roadDistance(x, z) < e.halfW + 3 || this.houseOverlaps(x, z, 16) || this.sampleGrid(this.waterDist, x, z) < 15) continue;
        // open front faces the road
        this.addWorkshop(x, z, Math.atan2(-rx * side, -rz * side), this.maxHeightAround(x, z, 6) - 0.1);
        break;
      }
    }
    for (const v of this.villages) {
      for (const e of this.edges) {
        if (e.city) continue;
        const P = e.pts;
        let acc = R() * 20;
        for (let s = 1; s < P.length - 1; s++) {
          const p = P[s];
          const dv = Math.hypot(p.x - v.x, p.z - v.z);
          acc += 4;
          if (dv > v.r || acc < 22 + R() * 14) continue;
          acc = 0;
          if (e.bridge[s]) continue;
          const tx = P[s + 1].x - P[s - 1].x, tz = P[s + 1].z - P[s - 1].z;
          const tl = Math.hypot(tx, tz);
          const rx = -tz / tl, rz = tx / tl;
          for (const side of [-1, 1]) {
            if (R() < 0.18) continue;
            const off = e.halfW + 10 + R() * 4;
            const x = p.x + rx * off * side, z = p.z + rz * off * side;
            if (this.roadDistance(x, z) < 8.5) continue;
            const h = this.sampleGrid(this.heights, x, z);
            if (h < 1.5 || this.sampleGrid(this.waterDist, x, z) < 12) continue;
            if (this.houseOverlaps(x, z, 13) || this.excluded(x, z, 7)) continue;
            // face the road: house local +z (front door) points to road
            const rot = Math.atan2(-rx * side, -rz * side);
            const samples = [[0, 0], [7, 7], [-7, 7], [7, -7], [-7, -7]].map(([dx, dz]) => this.sampleGrid(this.heights, x + dx, z + dz));
            if (Math.max(...samples) - Math.min(...samples) > 7) continue; // too steep to build on
            const hs = samples.reduce((a, b) => a + b, 0) / samples.length;
            const house = this.addHouse(x, z, rot, hs);
            house.yard = true;
            house.roadGap = off - e.halfW; // centre of house to the road edge
            this.addHouseGarage(house);
            this.levelPlot(house);
            if (R() < 0.5) this.addTree(x + rx * side * 10 + (R() - 0.5) * 8, z + rz * side * 10 + (R() - 0.5) * 8, null, 0, 0.9 + R() * 0.4);
          }
        }
      }
    }
  }

  // local (house) frame -> world: local +z faces the road
  houseToWorld(h, lx, lz) {
    const c = Math.cos(h.rot), s = Math.sin(h.rot);
    return [h.x + lx * c + lz * s, h.z - lx * s + lz * c];
  }

  // a garage beside the house with a gravel driveway to the road, often with a car on it
  addHouseGarage(h) {
    const R = this.rand;
    if (R() > 0.55) return;
    const side = R() < 0.5 ? -1 : 1;
    const gw = 6.4, gd = 7.6, lx = side * (h.w / 2 + 1.0 + gw / 2), lz = -0.6; // a real single garage: room for a car and the clutter
    const [gx, gz] = this.houseToWorld(h, lx, lz);
    if (this.houseOverlaps(gx, gz, 7.5) && this.houses.filter((o) => o !== h && Math.abs(o.x - gx) < 9 && Math.abs(o.z - gz) < 9).length) return;
    if (this.roadDistance(gx, gz) < 4) return;
    const gy = h.y;
    h.garage = { lx, lz, w: gw, d: gd, y: gy, x: gx, z: gz, carInside: R() < 0.4 };
    // hollow: side walls, back wall, door jambs and a roof you can drive in under; the door itself is a breakable prop
    const c = Math.cos(h.rot), sn = -Math.sin(h.rot);
    const wallAt = (wx, wz, hx, hz, extra = {}) => { const [x, z] = this.houseToWorld(h, lx + wx, lz + wz); this.colliders.push({ type: 'box', x, z, hx, hz, c, s: sn, top: gy + 3.1, tall: true, ...extra }); };
    wallAt(-gw / 2 + 0.12, 0, 0.14, gd / 2); wallAt(gw / 2 - 0.12, 0, 0.14, gd / 2); wallAt(0, -gd / 2 + 0.12, gw / 2, 0.14);
    wallAt(-gw / 2 + 0.25, gd / 2 - 0.15, 0.27, 0.15); wallAt(gw / 2 - 0.25, gd / 2 - 0.15, 0.27, 0.15);
    wallAt(0, 0, gw / 2, gd / 2, { top: gy + 3.3, bottom: gy + 2.75 }); // roof
    // driveway from the garage door to the road edge
    const len = Math.max(3, h.roadGap - (lz + gd / 2) + 0.5);
    h.drive = { lx, z0: lz + gd / 2, z1: lz + gd / 2 + len };
    if (h.garage.carInside) {
      const [cx, cz] = this.houseToWorld(h, lx - 0.4, lz + 0.2);
      this.parkedCars.push({ x: cx, z: cz, y: gy, heading: h.rot, type: ['sedan', 'compact', 'pickup', 'sedan'][Math.floor(R() * 4)], inGarage: true });
    }
    if (R() < (h.garage.carInside ? 0.35 : 0.75)) {
      const [cx, cz] = this.houseToWorld(h, lx, lz + gd / 2 + 3.2);
      const type = ['sedan', 'pickup', 'pickup', 'compact', 'van', 'sedan'][Math.floor(R() * 6)];
      h.parked = { x: cx, z: cz, y: 0, heading: h.rot, type };
      this.parkedCars.push(h.parked);
    }
  }

  // cut and fill a level plot for the house, garage and the parking spot in front, blending into the hillside
  levelPlot(h) {
    const H = this.heights, g = h.garage;
    const lx0 = Math.min(-h.w / 2, g ? g.lx - g.w / 2 : 0) - 2.5, lx1 = Math.max(h.w / 2, g ? g.lx + g.w / 2 : 0) + 2.5;
    const lz0 = -h.d / 2 - 2.5, lz1 = Math.max(h.d / 2 + 2.5, g ? g.lz + g.d / 2 + 6.5 : 0);
    const R = Math.hypot(Math.max(-lx0, lx1), Math.max(-lz0, lz1)) + 12;
    const c = Math.cos(h.rot), sn = Math.sin(h.rot);
    for (let j = Math.max(0, Math.floor((h.z - R + HALF) / CELL)); j <= Math.min(N, Math.ceil((h.z + R + HALF) / CELL)); j++) {
      for (let i = Math.max(0, Math.floor((h.x - R + HALF) / CELL)); i <= Math.min(N, Math.ceil((h.x + R + HALF) / CELL)); i++) {
        const x = -HALF + i * CELL, z = -HALF + j * CELL, dx = x - h.x, dz = z - h.z;
        const lx = dx * c - dz * sn, lz = dx * sn + dz * c; // world -> house local (inverse of houseToWorld)
        const ox = Math.max(lx0 - lx, 0, lx - lx1), oz = Math.max(lz0 - lz, 0, lz - lz1);
        let wgt = 1 - smoothstep(0, 10, Math.hypot(ox, oz));
        if (wgt <= 0) continue;
        wgt *= smoothstep(2.5, 7, this.roadDistance(x, z)); // leave the road shoulders alone
        const k = j * NV + i;
        H[k] = lerp(H[k], h.y - 0.05, wgt);
      }
    }
  }

  maxHeightAround(x, z, r) {
    let m = -1e9;
    for (const [dx, dz] of [[0, 0], [r, r], [-r, r], [r, -r], [-r, -r]]) m = Math.max(m, this.sampleGrid(this.heights, x + dx, z + dz));
    return m;
  }

  houseOverlaps(x, z, r) {
    for (let q = this.houses.length - 1; q >= Math.max(0, this.houses.length - 400); q--) {
      const h = this.houses[q];
      if (Math.abs(h.x - x) < r && Math.abs(h.z - z) < r) return true;
    }
    return false;
  }

  addTree(x, z, y, type, s) {
    if (y === null) y = this.sampleGrid(this.heights, x, z);
    s *= 1.45; // real-world tree size next to the cars
    const t = { x, z, y, type, s, rot: this.rand() * Math.PI * 2, tint: this.rand() };
    this.trees.push(t);
    // bushes (type 2) are soft: you plough through them, losing a bit of speed
    if (type === 2) this.colliders.push({ type: 'circle', x, z, r: 0.9 * s, top: y + 2 * s, soft: true });
    else {
      // trees take hits: scars and falling branches, and a hard enough hit snaps the trunk
      const c = { type: 'circle', x, z, r: 0.35 * s + 0.15, top: y + 8 * s, tree: t, snap: s < 1.35 ? 13 + s * 4 : Infinity }; // only thin young trees can be snapped
      t.col = c;
      this.colliders.push(c);
    }
  }

  inCityRect(x, z, m = 0) {
    return x > CITY.x0 - 7 - m && x < CITY.x1 + 7 + m && z > CITY.z0 - 7 - m && z < CITY.z1 + 7 + m;
  }

  buildTrees() {
    const R = this.rand;
    const step = 10.5;
    for (let z = -HALF + 20; z < HALF - 20; z += step) {
      for (let x = -HALF + 20; x < HALF - 20; x += step) {
        const jx = x + (R() - 0.5) * step * 0.9, jz = z + (R() - 0.5) * step * 0.9;
        if (this.inCityRect(jx, jz, 25)) continue;
        const f = this.sampleGrid(this.forest, jx, jz);
        const scatter = 0.012;
        if (R() > f * 0.75 + scatter) continue;
        const h = this.sampleGrid(this.heights, jx, jz);
        if (h < 1.6 || h > 215 || this.sampleGrid(this.waterDist, jx, jz) < 8) continue;
        const k = Math.round((jz + HALF) / CELL) * NV + Math.round((jx + HALF) / CELL);
        if (this.surf[k] === SURF.FIELD && R() < 0.95) continue;
        if (this.roadDistance(jx, jz) < 4 + R() * 3) continue;
        if (this.houseOverlaps(jx, jz, 9) || this.excluded(jx, jz, 2)) continue;
        // roadsides and open ground get bushes; deep forest keeps proper trees
        const nearRoad = this.roadDistance(jx, jz) < 14;
        if (R() < (nearRoad ? 0.6 : 0.3)) { this.addTree(jx, jz, h, 2, 0.7 + R() * 0.6); continue; }
        const pine = h > 55 ? R() < 0.8 : R() < 0.25;
        this.addTree(jx, jz, h, pine ? 1 : 0, 0.75 + R() * 0.7);
        if (this.trees.length > 32000) return;
      }
    }
    // boulders lining the country roads, mostly on the uphill side of cuttings
    let rb = 0;
    for (let tries = 0; tries < 6000 && rb < 650; tries++) {
      const e = this.edges[Math.floor(R() * this.edges.length)];
      if (e.city || e.type === 'highway' || e.type === 'village') continue;
      const i = 2 + Math.floor(R() * (e.pts.length - 4));
      if (e.bridge[i]) continue;
      const p = e.pts[i], q = e.pts[i + 1];
      const L = Math.hypot(q.x - p.x, q.z - p.z) || 1, rx = -(q.z - p.z) / L, rz = (q.x - p.x) / L;
      const side = R() < 0.5 ? -1 : 1, off = e.halfW + 2.5 + R() * 7;
      const x = p.x + rx * off * side, z = p.z + rz * off * side;
      const hh = this.terrainHeight(x, z);
      const uphill = hh > p.y + 0.8;
      if (!uphill && R() < 0.7) continue;
      if (this.roadDistance(x, z) < 2.2 || this.excluded(x, z, 2) || this.inCityRect(x, z, 60) || this.houseOverlaps(x, z, 10)) continue;
      const s = 0.7 + R() * (uphill ? 2.4 : 1.2);
      this.rocks.push({ x, z, y: hh, s, rot: R() * 6.28 });
      this.colliders.push({ type: 'circle', x, z, r: s * 0.85, top: hh + s * 1.2 });
      rb++;
    }
    // boulders on slopes
    for (let q = 0; q < 900; q++) {
      const x = (R() - 0.5) * (SIZE - 200), z = (R() - 0.5) * (SIZE - 200);
      const k = Math.round((z + HALF) / CELL) * NV + Math.round((x + HALF) / CELL);
      if (this.surf[k] !== SURF.ROCK && R() > 0.08) continue;
      if (this.inCityRect(x, z, 40) || this.roadDistance(x, z) < 6) continue;
      const h = this.sampleGrid(this.heights, x, z);
      if (h < 2) continue;
      const s = 0.8 + R() * 2.2;
      this.rocks.push({ x, z, y: h, s, rot: R() * 6.28 });
      this.colliders.push({ type: 'circle', x, z, r: s * 0.85, top: h + s * 1.2 });
    }
  }

  // street furniture you can smash through: cafés, fruit stalls, cones, bins, hydrants...
  addProp(kind, x, z, y, rot) {
    if (this.excl && this.excluded(x, z, 0.8)) return null;
    return this.addPropRaw(kind, x, z, y, rot);
  }

  // a breakable prop with a box footprint (local x along hx); rot is the three.js y-rotation
  addPropBox(kind, x, z, y, rot, hx, hz) {
    const p = { kind, x, z, y, rot, broken: false, brokenT: 0 };
    (this.props[kind] || (this.props[kind] = [])).push(p);
    p.idx = this.props[kind].length - 1;
    this.colliders.push({ type: 'box', x, z, hx, hz, c: Math.cos(rot), s: -Math.sin(rot), top: y + 1, breakable: true, prop: p, ref: p, slow: 0.95 });
    return p;
  }

  addPropRaw(kind, x, z, y, rot) {
    const PROP = {
      cone: { r: 0.3, slow: 0.997 }, barrier: { r: 0.8, slow: 0.985 }, chair: { r: 0.35, slow: 0.99 },
      table: { r: 0.55, slow: 0.98 }, table2: { r: 0.55, slow: 0.98 }, table3: { r: 0.55, slow: 0.98 }, table4: { r: 0.55, slow: 0.98 }, stall: { r: 1.3, slow: 0.9 }, crate: { r: 0.5, slow: 0.985 },
      bin: { r: 0.35, slow: 0.975 }, news: { r: 0.32, slow: 0.98 }, hydrant: { r: 0.22, slow: 0.93 },
      planter: { r: 0.6, slow: 0.95 }, dumpster: { r: 1.0, slow: 0.82 }, window: { r: 0, slow: 0.93 },
      boxes: { r: 0.6, slow: 0.995 }, bags: { r: 0.55, slow: 0.99 },
      shelf: { r: 1.0, slow: 0.95 }, fridge: { r: 0.7, slow: 0.93 }, counter: { r: 1.0, slow: 0.92 },
      tire: { r: 0.45, slow: 0.98 }, bench: { r: 0.8, slow: 0.97 }, bike: { r: 0.6, slow: 0.99 },
      busstop: { r: 1.4, slow: 0.9 }, phone: { r: 0.6, slow: 0.93 }, meter: { r: 0.15, slow: 0.995 }, mailbox: { r: 0.35, slow: 0.97 },
      haybale: { r: 0.9, slow: 0.86 }, sign: { r: 0.15, slow: 0.995 }, chevron: { r: 0.35, slow: 0.99 }, tent: { r: 1.6, slow: 0.9 }, tentgreen: { r: 1.6, slow: 0.9 },
    }[kind];
    if (this._cityProps && this.inCityRect(x, z, 6)) y = CITY.at(x, z) + CITY.curb;
    const p = { kind, x, z, y, rot, broken: false, brokenT: 0 };
    (this.props[kind] || (this.props[kind] = [])).push(p);
    p.idx = this.props[kind].length - 1;
    this.colliders.push({ type: 'circle', x, z, r: PROP.r, top: y + 2, breakable: true, prop: p, ref: p, slow: PROP.slow });
    return p;
  }

  buildProps() {
    this.terraces = [];
    const R = this.rand;
    this.props = {};
    let y = CITY.y + CITY.curb;
    this._cityProps = true; // props dropped in town sit on the local terrace / hillside height
    const curbIn = 0.9; // distance from the curb edge onto the sidewalk
    for (const blk of this.blocks) {
      y = blk.y + CITY.curb;
      const sides = [
        { ax: blk.x0, az: blk.z0, bx: blk.x1, bz: blk.z0, nx: 0, nz: -1 },
        { ax: blk.x0, az: blk.z1, bx: blk.x1, bz: blk.z1, nx: 0, nz: 1 },
        { ax: blk.x0, az: blk.z0, bx: blk.x0, bz: blk.z1, nx: -1, nz: 0 },
        { ax: blk.x1, az: blk.z0, bx: blk.x1, bz: blk.z1, nx: 1, nz: 0 },
      ];
      for (const sd of sides) {
        const L = Math.hypot(sd.bx - sd.ax, sd.bz - sd.az);
        const tx = (sd.bx - sd.ax) / L, tz = (sd.bz - sd.az) / L;
        const at = (t, inset) => [sd.ax + tx * t - sd.nx * inset, sd.az + tz * t - sd.nz * inset];
        const faceRot = Math.atan2(sd.nx, sd.nz);
        if (blk.kind === 'build' || blk.kind === 'plaza') {
          // café terrace: a wooden deck, a screen along the street side (gap to walk in), parasol tables of one design
          if (R() < 0.4) {
            const t0 = 12 + R() * (L - 30), n = 2 + Math.floor(R() * 2), len = (n - 1) * 4.5 + 4.4;
            const clear = [0, 0.5, 1].every((f) => { const [x, z] = at(t0 - 2.2 + len * f, 2.2); return !this.excluded(x, z, 1); });
            if (clear) {
              const kind = ['table', 'table2', 'table3', 'table4'][Math.floor(R() * 4)];
              const [dx, dz] = at(t0 - 2.2 + len / 2, 2.25);
              this.terraces.push({ x: dx, z: dz, y, len, depth: 3.3, rot: faceRot, wood: Math.floor(R() * 3) });
              for (let k = 0; k < n; k++) {
                const [cx, cz] = at(t0 + k * 4.5, 2.4);
                this.addProp(kind, cx, cz, y, R() * 6);
                for (let c = 0; c < 3; c++) {
                  const a = (c / 3) * Math.PI * 2 + R();
                  this.addProp('chair', cx + Math.cos(a) * 0.95, cz + Math.sin(a) * 0.95, y, -a + Math.PI / 2);
                }
              }
              const gap = Math.floor(R() * Math.max(1, Math.floor(len / 2.45)));
              for (let k = 0; k * 2.45 + 2.4 <= len + 0.1; k++) {
                if (k === gap) continue;
                const [sx, sz] = at(t0 - 2.2 + 1.22 + k * 2.45, 0.55);
                this.addPropBox('screen', sx, sz, y, faceRot, 1.2, 0.16);
              }
              if (R() < 0.6) { const [sx, sz] = at(t0 - 2.2 + (R() < 0.5 ? 0 : len), 2.2); this.addPropBox('screen', sx, sz, y, faceRot + Math.PI / 2, 1.2, 0.16); } // and one closed end
            }
          }
          // fruit market
          if (R() < 0.22) {
            const t0 = 14 + R() * (L - 28);
            const [sx, sz] = at(t0, 2.1);
            this.addProp('stall', sx, sz, y, faceRot);
            for (const dt of [-2.2, 2.2]) {
              const [cx, cz] = at(t0 + dt, 1.2);
              this.addProp('crate', cx, cz, y, faceRot + (R() - 0.5) * 0.4);
            }
          }
          if (R() < 0.35) {
            const t0 = 8 + R() * (L - 20);
            for (let k = 0; k < 3; k++) { const [x, z] = at(t0 + k * 3.2, curbIn + 0.1); this.addProp('planter', x, z, y, faceRot); }
          }
          // city clutter: bus stops, phone booths, parking meters, mailboxes
          if (R() < 0.2) { const [x, z] = at(L / 2 + (R() - 0.5) * 20, 1.6); this.addProp('busstop', x, z, y, faceRot + Math.PI); }
          if (R() < 0.18) { const [x, z] = at(5 + R() * (L - 10), 2.6); this.addProp('phone', x, z, y, faceRot + Math.PI); }
          if (R() < 0.35) { const t0 = 6 + R() * (L - 26); for (let k = 0; k < 6; k++) { const [x, z] = at(t0 + k * 3.4, 0.45); this.addProp('meter', x, z, y, faceRot + Math.PI); } }
          if (R() < 0.25) { const [x, z] = at(4 + R() * 6, 0.8); this.addProp('mailbox', x, z, y, faceRot + Math.PI); }
          if (R() < 0.5) { const [x, z] = at(6 + R() * (L - 12), curbIn); this.addProp('bin', x, z, y, R() * 6); }
          if (R() < 0.35) { const [x, z] = at(6 + R() * (L - 12), curbIn); this.addProp('news', x, z, y, faceRot); }
        } else if (R() < 0.3) {
          const [x, z] = at(6 + R() * (L - 12), curbIn); this.addProp('bin', x, z, y, R() * 6);
        }
      }
      // a hydrant near one corner of each block
      this.addProp('hydrant', blk.x0 + 2.2, blk.z0 + 2.2 + R() * 3, y, 0);
      // cardboard boxes and rubbish bags heaped against the buildings round the street corners
      if (blk.kind === 'build' || blk.kind === 'plaza') {
        const ins = CITY.walk - 0.55;
        for (const [cx, cz, sx, sz] of [[blk.x0, blk.z0, 1, 1], [blk.x1, blk.z0, -1, 1], [blk.x0, blk.z1, 1, -1], [blk.x1, blk.z1, -1, -1]]) {
          if (R() < 0.3) continue;
          const alongX = R() < 0.5, n = 1 + Math.floor(R() * 3);
          for (let k = 0; k < n; k++) {
            const d = ins + 1.2 + k * 1.1 + R() * 0.4;
            const x = cx + sx * (alongX ? d : ins + R() * 0.3), z = cz + sz * (alongX ? ins + R() * 0.3 : d);
            this.addProp(R() < 0.72 ? 'boxes' : 'bags', x, z, y, R() * 6);
          }
        }
      }
    }
    // drive-through corner shops: glass on the two street faces, solid posts and inner columns, a little store inside
    this.mullions = [];
    this.shopPillars = [];
    for (const b of this.buildings) {
      if (!b.driveThru) continue;
      y = b.y;
      const S = b.shop;
      const posts = new Set();
      for (const [ax, az, bx, bz] of S.faces) {
        const L = Math.hypot(bx - ax, bz - az);
        const n = Math.max(1, Math.round(L / 4.2));
        const along = Math.abs(bx - ax) > 0.1;
        for (let k = 0; k <= n; k++) {
          const x = lerp(ax, bx, k / n), z = lerp(az, bz, k / n);
          // ends of each glass run, and every third post on long galleries, are solid structure
          const solid = k === 0 || k === n || (b.gallery && k % 3 === 0);
          const key = `${x.toFixed(1)},${z.toFixed(1)}`;
          if (posts.has(key)) continue;
          posts.add(key);
          const mul = { x, z, idx: this.mullions.length, broken: false, solid };
          this.mullions.push(mul);
          if (solid) this.colliders.push({ type: 'circle', x, z, r: 0.38, top: y + 4.6, breakable: true, breakV: 6, slow: 0.86, mullion: mul }); // frame posts give way to a hard hit
          else this.colliders.push({ type: 'circle', x, z, r: 0.16, top: y + 4.6, breakable: true, slow: 0.96, mullion: mul });
        }
        for (let k = 0; k < n; k++) {
          const x = lerp(ax, bx, (k + 0.5) / n), z = lerp(az, bz, (k + 0.5) / n);
          const w = L / n - 0.35, rot = along ? 0 : -Math.PI / 2;
          const p = { kind: 'window', x, z, y: y + 0.05, rot, sx: w, sy: 4.35, sz: 0.06, broken: false, brokenT: 0 };
          (this.props.window || (this.props.window = [])).push(p);
          p.idx = this.props.window.length - 1;
          this.colliders.push({ type: 'box', x, z, hx: w / 2, hz: 0.15, c: Math.cos(rot), s: -Math.sin(rot), top: y + 4.5, breakable: true, prop: p, ref: p, slow: 0.93 });
        }
      }
      const W = S.x1 - S.x0, D = S.z1 - S.z0;
      // structural columns: one per ~9 m of span, so big glass fronts still hold up the tower
      const nxp = Math.floor(W / 15), nzp = Math.floor(D / 15);
      for (let a = 1; a <= nxp; a++) for (let c = 1; c <= nzp; c++) {
        const px = S.x0 + (W * a) / (nxp + 1), pz = S.z0 + (D * c) / (nzp + 1);
        // columns snap if you hit them fast enough (blast right through the shop)
        const pil = { x: px, z: pz, solid: true, pillar: true, broken: false };
        this.shopPillars.push(pil);
        this.colliders.push({ type: 'circle', x: px, z: pz, r: 0.45, top: y + 4.6, breakable: true, breakV: 7, slow: 0.82, mullion: pil });
      }
      // local helper: (t along x from the inner wall, q along z from the inner wall)
      const ix = S.sx > 0 ? S.x0 : S.x1, iz = S.sz > 0 ? S.z0 : S.z1;
      const at = (t, q) => [ix + S.sx * t, iz + S.sz * q];
      let half = null; // which side of a glass partition we're furnishing
      const inHalf = (x, z) => { if (!half) return true; const c = S.split.axis === 'x' ? x : z; return half < 0 ? c < S.split.v - 1.2 : c > S.split.v + 1.2; };
      const clear = (x, z) => inHalf(x, z) && this.shopPillars.every((p) => Math.hypot(p.x - x, p.z - z) > 1.6);
      const put = (kind, t, q, rot) => { const [x, z] = at(t, q); if (clear(x, z)) this.addPropRaw(kind, x, z, y, rot); };
      if (b.shopKind === 'passage') continue; // gateways stay clear
      for (const [hs, kind] of S.split ? [[-1, b.shopKind], [1, b.shopKind2]] : [[0, b.shopKind]]) {
      half = hs || null;
      if (kind === 'grocery') {
        for (let t = 2.5; t < W - 2; t += 2.4) if (R() < 0.7) put('fridge', t, 0.8, S.sz > 0 ? 0 : Math.PI);
        // aisles of shelving across the floor, plus shelves along the side wall
        for (let t = 4.2; t < W - 4; t += 3.6) for (let q = 4.5; q < D - 3; q += 2.3) if (R() < 0.85) put('shelf', t, q, Math.PI / 2);
        for (let q = 3.5; q < D - 2; q += 2.3) put('shelf', 0.9, q, Math.PI / 2);
        put('counter', W - 2.2, D * 0.45, Math.PI / 2);
      } else if (kind === 'cafe') {
        for (let t = 3.5; t < W - 2; t += 5.5) for (let q = 3.5; q < D - 2; q += 5.5) {
          if (R() < 0.35) continue;
          put('table', t, q, R() * 6);
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1]]) if (R() < 0.8) put('chair', t + dx, q + dz, R() * 6);
        }
        put('counter', 1.4, D * 0.5, 0);
        for (let t = 2.5; t < W - 2; t += 2.4) if (R() < 0.6) put('shelf', t, 0.7, 0); // cake and coffee shelves on the back wall
      } else if (kind === 'bar') {
        for (let t = 2; t < W - 2; t += 2.5) put('counter', t, 1.2, 0);
        for (let t = 2; t < W - 2; t += 2.2) put('shelf', t, 0.35, 0); // bottle shelves behind the bar
        for (let t = 2; t < W - 2; t += 1.3) put('chair', t, 2.6, R() * 6);
        for (let q = 6; q < D - 2; q += 6) { put('table', W * 0.6, q, 0); put('chair', W * 0.6 + 1, q, 1); }
      } else {
        // car showroom: cars on display (real cars you can shunt), planters at the windows
        let made = 0;
        for (let t = 4; t < W - 3 && made < 3; t += 6.5) {
          const [x, z] = at(t, D * 0.55);
          if (!clear(x, z)) continue;
          const type = ['muscle', 'sedan', 'pickup', 'compact'][Math.floor(R() * 4)];
          this.parkedCars.push({ x, z, y, heading: Math.PI / 4 * (R() < 0.5 ? 1 : -1) + (S.sz > 0 ? Math.PI : 0), type: type === 'muscle' ? 'sedan' : type, showroom: true });
          made++;
        }
        for (let t = 2; t < W; t += 5) put('planter', t, D - 1.2, 0);
        for (let t = 2.5; t < W - 2; t += 2.4) if (R() < 0.7) put('shelf', t, 0.7, 0); // parts and accessories
      }
      }
    }
    // hay bales round the farmyards (and a few stacked inside each barn)
    for (const f of this.farms || []) {
      for (const b of f.bales) this.addPropRaw('haybale', b.x, b.z, this.terrainHeight(b.x, b.z), b.rot);
      const B = f.barn, c = Math.cos(B.rot), sn = Math.sin(B.rot);
      for (const [lx, lz] of [[-6, -4], [-4, -4], [4, 4.5], [6, 4.5]]) this.addPropRaw('haybale', B.x + lx * c + lz * sn, B.z - lx * sn + lz * c, B.y, B.rot + Math.PI / 2);
    }
    // house garages: a breakable up-and-over door, and the usual clutter inside
    for (const h of this.houses) {
      const g = h.garage;
      if (!g) continue;
      const W = (lx, lz) => this.houseToWorld(h, g.lx + lx, g.lz + lz);
      const [dx, dz] = W(0, g.d / 2 - 0.1);
      this.addPropBox('garagedoor', dx, dz, g.y + 0.05, h.rot, g.w / 2 - 0.5, 0.12);
      const junk = (kind, lx, lz, rot) => { const [x, z] = W(lx, lz); this.addPropRaw(kind, x, z, g.y + 0.05, h.rot + rot); };
      const s = g.carInside ? 1 : -1; // clutter along the side the car isn't on
      junk('tire', s * (g.w / 2 - 0.6), -g.d / 2 + 0.7, 0); junk('tire', s * (g.w / 2 - 0.6), -g.d / 2 + 1.6, 0);
      junk('shelf', 0.5, -g.d / 2 + 0.55, 0);
      junk('boxes', s * (g.w / 2 - 0.7), -0.6, R() * 6);
      if (R() < 0.7) junk('bike', s * (g.w / 2 - 0.5), 1.2, Math.PI / 2);
      if (!g.carInside) { junk('chair', -1.2, 0.5, R() * 6); junk('bench', 0.4, -1.6, 0); if (R() < 0.5) junk('bin', 1.6, 1.6, 0); }
    }
    // village backyards: picket fence and junk (tyres, chairs, benches, bicycles)
    for (const h of this.houses) {
      if (!h.yard) continue;
      const yw = h.w / 2 + 3, z0 = -h.d / 2 - 0.5, z1 = -h.d / 2 - 12;
      const ok = (lx, lz) => { const [x, z] = this.houseToWorld(h, lx, lz); return this.roadDistance(x, z) > 2.5 && !this.excluded(x, z, 0.5) && this.sampleGrid(this.waterDist, x, z) > 4; };
      if (!ok(-yw, z1) || !ok(yw, z1)) continue;
      const fence = (ax, az, bx, bz) => {
        const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 4));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, lx = ax + (bx - ax) * t, lz = az + (bz - az) * t;
          if (h.garage && Math.abs(lx - h.garage.lx) < h.garage.w / 2 + 1 && lz > h.garage.lz - h.garage.d / 2 - 1) continue;
          const [x, z] = this.houseToWorld(h, lx, lz);
          const segRot = h.rot + Math.atan2(-(bz - az), bx - ax);
          this.addPropBox('fence', x, z, this.terrainHeight(x, z), segRot, L / n / 2, 0.12);
        }
      };
      fence(-yw, z1, yw, z1);
      fence(-yw, z0, -yw, z1);
      fence(yw, z0, yw, z1);
      const junk = ['tire', 'tire', 'chair', 'bench', 'bike', 'bike'];
      for (let k = 0; k < 2 + Math.floor(R() * 3); k++) {
        const lx = (R() - 0.5) * (yw * 2 - 2.5), lz = lerp(z0 - 1.5, z1 + 1.5, R());
        const [x, z] = this.houseToWorld(h, lx, lz);
        this.addPropRaw(junk[Math.floor(R() * junk.length)], x, z, this.terrainHeight(x, z), R() * 6);
      }
    }
    this._cityProps = false;
    this.buildPaddocks();
    this.buildParklets();
    this.buildRoadsideParking();
    this.buildBillboards();
    this.buildExitSigns();
    // guardrails on the drop side of the mountain roads (breakable: you can go over).
    // On the big mountain they have gaps: nothing between you and the chasm.
    for (const e of this.edges) {
      if (e.type !== 'mountain') continue;
      const P = e.pts;
      for (let i = 2; i < P.length - 3; i += 1) {
        if (e.peak && this.noiseD(i / 14 + e.id * 3.1, 0.5) > 0.25) continue;
        const p = P[i], q = P[i + 1];
        const L = Math.hypot(q.x - p.x, q.z - p.z) || 1;
        const tx = (q.x - p.x) / L, tz = (q.z - p.z) / L, rx = -tz, rz = tx;
        for (const side of [-1, 1]) {
          const drop = p.y - this.terrainHeight(p.x + rx * side * (e.halfW + 10), p.z + rz * side * (e.halfW + 10));
          if (drop < 2.5) continue;
          const o = e.halfW + 0.9;
          const x = (p.x + q.x) / 2 + rx * side * o, z = (p.z + q.z) / 2 + rz * side * o;
          this.addPropBox('guardrail', x, z, (p.y + q.y) / 2 - 0.05, Math.atan2(-tz, tx), 2.05, 0.15);
        }
      }
    }
    // warning signs: falling rocks / steep grade every so often on the uphill side, chevrons on the outside of bends
    for (const e of this.edges) {
      if (e.type !== 'mountain') continue;
      const P = e.pts;
      let lastSign = -40;
      for (let i = 6; i < P.length - 7; i++) {
        const p = P[i], a = P[i - 5], b = P[i + 5];
        const ax = p.x - a.x, az = p.z - a.z, bx = b.x - p.x, bz = b.z - p.z;
        const L = Math.hypot(bx, bz) || 1, tx = bx / L, tz = bz / L, rx = -tz, rz = tx;
        const turn = Math.atan2(ax * bz - az * bx, ax * bx + az * bz) / 40; // rad per metre
        const sideOf = (sd) => p.y - this.terrainHeight(p.x + rx * sd * (e.halfW + 10), p.z + rz * sd * (e.halfW + 10));
        const up = sideOf(1) < sideOf(-1) ? 1 : -1; // side with higher ground
        const rot = Math.atan2(-tz, tx);
        if (i - lastSign > 30) {
          lastSign = i + Math.floor(R() * 8);
          const o = e.halfW + 1.6, x = p.x + rx * up * o, z = p.z + rz * up * o;
          this.addPropRaw('sign', x, z, this.terrainHeight(x, z), rot + (up > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI);
        }
        // sharper bends: black-and-yellow chevrons on the outside
        if (Math.abs(turn) > 1 / 90 && i % 4 === 0) {
          const out = turn > 0 ? -1 : 1, o = e.halfW + 1.3;
          const x = p.x + rx * out * o, z = p.z + rz * out * o;
          this.addPropRaw('chevron', x, z, p.y - 0.05, rot + (out > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI);
        }
      }
    }
    // music spilling out onto the street from bars, cafés, showrooms, the skate park and a few alleys
    for (const b of this.buildings) {
      if (!b.driveThru || !b.shop || b.shopKind === 'passage' || b.shopKind === 'grocery') continue;
      const style = b.shopKind === 'cafe' ? 'jazz' : b.shopKind === 'bar' ? (R() < 0.5 ? 'disco' : 'rock') : 'disco';
      this.musicSpots.push({ x: (b.shop.x0 + b.shop.x1) / 2, z: (b.shop.z0 + b.shop.z1) / 2, y: b.y + 2, style, seed: Math.floor(R() * 1000) });
      if (b.shopKind2 === 'bar' || b.shopKind2 === 'cafe') this.musicSpots.push({ x: b.shop.x1 - 3, z: b.shop.z1 - 3, y: b.y + 2, style: b.shopKind2 === 'cafe' ? 'jazz' : 'disco', seed: Math.floor(R() * 1000) });
    }
    for (const blk of this.blocks) if (blk.kind === 'skate') this.musicSpots.push({ x: (blk.x0 + blk.x1) / 2, z: (blk.z0 + blk.z1) / 2, y: blk.y + 1, style: 'hiphop', seed: 7 });
    for (const a of this.alleys) if (R() < 0.25) this.musicSpots.push({ x: (a.x0 + a.x1) / 2, z: (a.z0 + a.z1) / 2, y: CITY.at(a.x0, a.z0) + 3, style: 'hiphop', seed: Math.floor(R() * 1000) });
    // courtyards: parked cars, bins, a tree and a bench
    for (const c of this.courtyards || []) {
      y = c.blk.y + CITY.curb;
      const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, w2 = (c.x1 - c.x0) / 2 - 3, d2 = (c.z1 - c.z0) / 2 - 3;
      for (let k = 0; k < 2; k++) {
        const x = cx + (k ? 1 : -1) * w2 * 0.6, z = cz + (R() - 0.5) * d2;
        this.parkedCars.push({ x, z, y, heading: R() < 0.5 ? 0 : Math.PI / 2, type: ['sedan', 'compact', 'pickup'][Math.floor(R() * 3)] });
      }
      this.addTree(cx, cz + d2 * 0.5, y, 0, 0.9);
      this.addPropRaw('bin', cx - w2, cz - d2, y, 0); this.addPropRaw('bin', cx - w2 + 0.8, cz - d2, y, 0);
      this.addPropRaw('bench', cx + w2 * 0.2, cz - d2, y, 0);
      this.addPropRaw('bike', cx + w2, cz + d2 * 0.2, y, R() * 6);
      this.addPropRaw('boxes', cx + w2, cz - d2 * 0.6, y, R() * 6);
    }
    // alley clutter: dumpsters and crates against the walls
    for (const a of this.alleys) {
      const L = a.vertical ? a.z1 - a.z0 : a.x1 - a.x0;
      const junk = ['dumpster', 'dumpster', 'dumpster', 'tire', 'tire', 'boxes', 'boxes', 'boxes', 'bags', 'bags', 'crate'];
      for (let k = 0; k < 9 + Math.floor(L / 12); k++) {
        const t = 5 + R() * (L - 10);
        const side = R() < 0.5 ? 0 : 1;
        const kind = junk[Math.floor(R() * junk.length)];
        const inset = kind === 'dumpster' ? 1.1 : 0.5 + R() * 0.4;
        const x = a.vertical ? (side ? a.x1 - inset : a.x0 + inset) : a.x0 + t;
        const z = a.vertical ? a.z0 + t : (side ? a.z1 - inset : a.z0 + inset);
        this.addProp(kind, x, z, y, a.vertical ? 0 : Math.PI / 2);
      }
    }
    // roadworks: rows of cones and a barrier along city street lanes and the beltway
    const streets = this.edges.filter((e) => e.city || (e.type === 'road' && e.len < 260));
    for (let q = 0; q < 26; q++) {
      const e = streets[Math.floor(R() * streets.length)];
      const P = e.pts;
      if (P.length < 10) continue;
      const i0 = 3 + Math.floor(R() * (P.length - 9));
      const side = R() < 0.5 ? -1 : 1;
      let last = null;
      for (let i = i0; i < i0 + 5; i++) {
        const a = P[i], b = P[i + 1];
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        const rx = -(b.z - a.z) / L, rz = (b.x - a.x) / L;
        const off = side * (e.halfW + 0.4); // on the edge of the road, not in a lane
        const x = a.x + rx * off, z = a.z + rz * off;
        const cone = this.addProp('cone', x, z, e.city ? CITY.at(x, z) : this.terrainHeight(x, z), 0);
        if (cone) { last = cone; last.rx = rx; last.rz = rz; }
      }
      if (last) {
        const x = last.x - last.rx * side * 1.6, z = last.z - last.rz * side * 1.6;
        this.addProp('barrier', x, z, e.city ? CITY.at(x, z) : this.terrainHeight(x, z), Math.atan2(last.rx, last.rz));
      }
    }
    // village fruit stands
    for (const v of this.villages) {
      const nr = this.roadSpawnNear(v.x, v.z, 0, 120);
      if (!nr) continue;
      const p = nr.edge.pts[nr.idx], q = nr.edge.pts[nr.idx + 1] || p;
      const L = Math.hypot(q.x - p.x, q.z - p.z) || 1;
      const rx = -(q.z - p.z) / L, rz = (q.x - p.x) / L;
      const x = p.x + rx * (nr.edge.halfW + 3), z = p.z + rz * (nr.edge.halfW + 3);
      this.addProp('stall', x, z, this.terrainHeight(x, z), Math.atan2(-rx, -rz));
      this.addProp('crate', x + (q.x - p.x) / L * 2.4, z + (q.z - p.z) / L * 2.4, this.terrainHeight(x, z), 0);
    }
  }

  buildBridgeColliders() {
    this.railPieces = [];
    for (const br of this.bridges) {
      if (br.custom) {
        for (const [ax, az, bx, bz] of br.rails) {
          const L = Math.hypot(bx - ax, bz - az);
          const n = Math.max(1, Math.ceil(L / 4));
          const tx = (bx - ax) / L, tz = (bz - az) / L;
          for (let k = 0; k < n; k++) {
            const t = (k + 0.5) / n;
            const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
            const y = this.deckHeight(br, x, z);
            // metal railing pieces break away when hit hard, so ramps can be launched off sideways
            const piece = { id: this.railPieces.length, ax: ax + (bx - ax) * (k / n), az: az + (bz - az) * (k / n), bx: ax + (bx - ax) * ((k + 1) / n), bz: az + (bz - az) * ((k + 1) / n), br, broken: false };
            this.railPieces.push(piece);
            this.colliders.push({ type: 'box', x, z, hx: L / n / 2 + 0.15, hz: 0.18, c: tx, s: tz, top: y + 1.1, rail: true, breakable: true, slow: 0.97, railPiece: piece });
          }
        }
        continue;
      }
      const P = br.pts;
      br.gap = new Set();
      const me = this.edges[br.edge];
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1];
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        if (L < 0.05) continue;
        // direction over a few points either side, so a tiny kink in the spline can't stand a rail across the road
        const pa = P[Math.max(0, i - 2)], pb = P[Math.min(P.length - 1, i + 3)];
        const dl = Math.hypot(pb.x - pa.x, pb.z - pa.z) || L;
        const tx = (pb.x - pa.x) / dl, tz = (pb.z - pa.z) / dl;
        const rx = -tz, rz = tx;
        for (const side of [-1, 1]) {
          const o = br.halfW + 0.35;
          const cx = (a.x + b.x) / 2 + rx * o * side, cz = (a.z + b.z) / 2 + rz * o * side;
          // where an on-ramp joins an expressway, leave the barrier out on both roads so cars can merge
          if (me && me.elev && this.mergeGap(me, cx, cz, (a.y + b.y) / 2)) { br.gap.add(i * 2 + (side > 0 ? 1 : 0)); continue; }
          // box local x along the road direction: rotation such that local x -> (tx,tz)
          this.colliders.push({ type: 'box', x: cx, z: cz, hx: L / 2 + 0.3, hz: 0.3, c: tx, s: tz, top: (a.y + b.y) / 2 + 1.2, rail: true });
        }
      }
    }
  }

  // how far (x,z) is from the centre line of the expressway this ramp merges into (Infinity if not a ramp)
  rampDeckDist(e, x, z) {
    if (!e.ramp) return { d: Infinity, hw: 0 };
    if (!e._fw) e._fw = this.edges.filter((f) => f.fwy && !f.ramp && (f.a === e.b || f.b === e.b));
    let best = Infinity, hw = 0;
    for (const f of e._fw) for (let i = 0; i < f.pts.length - 1; i++) {
      const a = f.pts[i], b = f.pts[i + 1];
      if (Math.abs(a.x - x) > 40 || Math.abs(a.z - z) > 40) continue;
      const [d] = distToSeg(x, z, a.x, a.z, b.x, b.z);
      if (d < best) { best = d; hw = f.halfW; }
    }
    return { d: best, hw };
  }

  // is this barrier spot on an expressway/ramp lying across another elevated road it merges with?
  mergeGap(me, x, z, y) {
    for (const e of this.edges) {
      if (e === me || !e.elev || (e.ramp === me.ramp)) continue;
      // only where this barrier would stand on the other road's own surface (decks overlap, no void between them)
      for (let i = 0; i < e.pts.length - 1; i++) {
        const a = e.pts[i], b = e.pts[i + 1];
        if (Math.abs(a.x - x) > e.halfW + 6 || Math.abs(a.z - z) > e.halfW + 6 || Math.abs(a.y - y) > 2.5) continue;
        if (distToSeg(x, z, a.x, a.z, b.x, b.z)[0] < e.halfW - 0.4) return true;
      }
    }
    return false;
  }

  buildBoundary() {
    const B = BOUND, T = 40;
    this.colliders.push({ type: 'box', x: 0, z: -B - T, hx: B + T * 2, hz: T, c: 1, s: 0, top: 1e4 });
    this.colliders.push({ type: 'box', x: 0, z: B + T, hx: B + T * 2, hz: T, c: 1, s: 0, top: 1e4 });
    this.colliders.push({ type: 'box', x: -B - T, z: 0, hx: T, hz: B + T * 2, c: 1, s: 0, top: 1e4 });
    this.colliders.push({ type: 'box', x: B + T, z: 0, hx: T, hz: B + T * 2, c: 1, s: 0, top: 1e4 });
  }

  // box convention: local x axis = (c, s) in world xz, local z axis = (-s, c)
  insertCollider(c) {
    let ex, ez;
    if (c.type === 'circle') { ex = c.r; ez = c.r; }
    else {
      ex = Math.abs(c.c) * c.hx + Math.abs(c.s) * c.hz;
      ez = Math.abs(c.s) * c.hx + Math.abs(c.c) * c.hz;
    }
    c.minx = c.x - ex; c.maxx = c.x + ex; c.minz = c.z - ez; c.maxz = c.z + ez;
    c.stamp = 0;
    const GC = this.GC, GN = this.GN;
    const i0 = clamp(Math.floor((c.minx + HALF) / GC), 0, GN - 1), i1 = clamp(Math.floor((c.maxx + HALF) / GC), 0, GN - 1);
    const j0 = clamp(Math.floor((c.minz + HALF) / GC), 0, GN - 1), j1 = clamp(Math.floor((c.maxz + HALF) / GC), 0, GN - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * GN + i;
      (this.grid[k] || (this.grid[k] = [])).push(c);
    }
  }

  queryColliders(minx, minz, maxx, maxz, out) {
    out.length = 0;
    const stamp = ++this.queryStamp;
    const GC = this.GC, GN = this.GN;
    const i0 = clamp(Math.floor((minx + HALF) / GC), 0, GN - 1), i1 = clamp(Math.floor((maxx + HALF) / GC), 0, GN - 1);
    const j0 = clamp(Math.floor((minz + HALF) / GC), 0, GN - 1), j1 = clamp(Math.floor((maxz + HALF) / GC), 0, GN - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const list = this.grid[j * GN + i];
      if (!list) continue;
      for (const c of list) {
        if (c.stamp === stamp) continue;
        c.stamp = stamp;
        if (c.maxx < minx || c.minx > maxx || c.maxz < minz || c.minz > maxz) continue;
        out.push(c);
      }
    }
    return out;
  }

  // segment vs tall boxes (buildings/houses) + terrain: true if clear
  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dz = bz - az;
    const L = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(L / 20));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const h = this.terrainHeight(ax + dx * t, az + dz * t);
      if (h > ay + (by - ay) * t + 0.5) return false;
    }
    const tmp = this._losTmp || (this._losTmp = []);
    this.queryColliders(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), tmp);
    for (const c of tmp) {
      if (!c.tall) continue;
      // transform to box local
      const lax = (ax - c.x) * c.c + (az - c.z) * c.s, laz = -(ax - c.x) * c.s + (az - c.z) * c.c;
      const lbx = (bx - c.x) * c.c + (bz - c.z) * c.s, lbz = -(bx - c.x) * c.s + (bz - c.z) * c.c;
      let t0 = 0, t1 = 1;
      const ddx = lbx - lax, ddz = lbz - laz;
      let ok = true;
      for (const [p, d, h] of [[lax, ddx, c.hx], [laz, ddz, c.hz]]) {
        if (Math.abs(d) < 1e-9) { if (p < -h || p > h) { ok = false; break; } continue; }
        let ta = (-h - p) / d, tb = (h - p) / d;
        if (ta > tb) { const q = ta; ta = tb; tb = q; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) { ok = false; break; }
      }
      if (ok) return false;
    }
    return true;
  }

  // ---------- ground queries ----------
  terrainHeight(x, z) { return this.sampleGrid(this.heights, x, z); }

  // Height of the highest deck under (x, z) that is at or below yHint (+0.6): a deck above you is never your ground.
  bridgeAt(x, z, yHint) {
    let best = null;
    for (const br of this.bridges) {
      if (x < br.minx || x > br.maxx || z < br.minz || z > br.maxz) continue;
      const P = br.pts;
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z;
        const L2 = dx * dx + dz * dz;
        if (L2 < 1e-9) continue;
        const t = ((x - a.x) * dx + (z - a.z) * dz) / L2;
        if (t < -0.02 || t > 1.02) continue;
        const qx = a.x + dx * t - x, qz = a.z + dz * t - z;
        if (qx * qx + qz * qz > (br.halfW + 0.2) * (br.halfW + 0.2)) continue;
        const y = a.y + (b.y - a.y) * clamp(t, 0, 1);
        if (y > yHint + 0.6) continue;
        if (best === null || y > best) best = y;
      }
    }
    return best;
  }

  // lowest ceiling above yFrom at (x, z): underside of a deck, or the upper floors of a drive-through shop
  ceilingAt(x, z, yFrom) {
    let best = Infinity;
    for (const br of this.bridges) {
      if (x < br.minx || x > br.maxx || z < br.minz || z > br.maxz) continue;
      const P = br.pts;
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
        if (L2 < 1e-9) continue;
        const t = ((x - a.x) * dx + (z - a.z) * dz) / L2;
        if (t < 0 || t > 1) continue;
        const qx = a.x + dx * t - x, qz = a.z + dz * t - z;
        if (qx * qx + qz * qz > br.halfW * br.halfW) continue;
        const under = a.y + (b.y - a.y) * t - 0.9;
        if (under > yFrom && under < best) best = under;
      }
    }
    if (this.tunnels) { const ty = this.tunnelAt(x, z, yFrom); if (ty !== null && ty + 5.6 > yFrom) best = Math.min(best, ty + 5.6); }
    if (this.covers) for (const c of this.covers) if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && c.y0 > yFrom) best = Math.min(best, c.y0);
    const list = this._ceilTmp || (this._ceilTmp = []);
    this.queryColliders(x - 0.1, z - 0.1, x + 0.1, z + 0.1, list);
    for (const c of list) {
      if (c.bottom === undefined || c.type !== 'box' || c.bottom < yFrom) continue;
      const lx = (x - c.x) * c.c + (z - c.z) * c.s, lz = -(x - c.x) * c.s + (z - c.z) * c.c;
      if (Math.abs(lx) <= c.hx && Math.abs(lz) <= c.hz) best = Math.min(best, c.bottom + 0.1);
    }
    return best;
  }

  // height of one particular deck at (x, z) (nearest segment), for rails on stacked decks
  deckHeight(br, x, z) {
    const P = br.pts;
    let bd = 1e18, by = P[0].y;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
      if (L2 < 1e-9) continue;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / L2, 0, 1);
      const d = (a.x + dx * t - x) ** 2 + (a.z + dz * t - z) ** 2;
      if (d < bd) { bd = d; by = a.y + (b.y - a.y) * t; }
    }
    return by;
  }

  // Ground height + normal at (x,z). yHint is the height of the query origin.
  groundAt(x, z, yHint = 1e9) {
    const r = this._gr;
    if (this.tunnels && this.tunnels.length && yHint > -1e8) {
      const ty = this.tunnelAt(x, z, yHint, true);
      if (ty !== null) { r.h = ty + 0.06; r.nx = 0; r.ny = 1; r.nz = 0; r.bridge = true; return r; }
    }
    const by = this.bridges.length ? this.bridgeAt(x, z, yHint) : null;
    if (by !== null) {
      const th = this.terrainHeight(x, z);
      if (by > th - 0.05) {
        r.h = by + 0.06; r.nx = 0; r.ny = 1; r.nz = 0; r.bridge = true;
        return r;
      }
    }
    r.bridge = false;
    const gx = clamp((x + HALF) / CELL, 0, N - 1e-4);
    const gz = clamp((z + HALF) / CELL, 0, N - 1e-4);
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const H = this.heights;
    const k = j * NV + i;
    const a = H[k], b = H[k + 1], c = H[k + NV], d = H[k + NV + 1];
    let h, dhdx, dhdz;
    if (fx + fz <= 1) { h = a + (b - a) * fx + (c - a) * fz; dhdx = (b - a) / CELL; dhdz = (c - a) / CELL; }
    else { h = d + (c - d) * (1 - fx) + (b - d) * (1 - fz); dhdx = (d - c) / CELL; dhdz = (d - b) / CELL; }
    if (x > CITY.x0 - 10 && x < CITY.x1 + 10 && z > CITY.z0 - 10 && z < CITY.z1 + 10) {
      const blk = this.cityBlockAt(x, z);
      if (blk && blk.kind !== 'fwy') {
        let d = Math.min(x - blk.x0, blk.x1 - x, z - blk.z0, blk.z1 - z);
        if (blk.bays) for (const b of blk.bays) d = Math.min(d, Math.max(b.x0 - x, x - b.x1, b.z0 - z, z - b.z1)); // the bays are at road level
        h += CITY.curb * smoothstep(0, 0.45, d);
      }
    }
    const inv = 1 / Math.sqrt(dhdx * dhdx + 1 + dhdz * dhdz);
    r.h = h; r.nx = -dhdx * inv; r.ny = inv; r.nz = -dhdz * inv;
    return r;
  }

  surfaceAt(x, z) {
    const nr = this.nearestRoad(x, z);
    if (nr.d < 0.2) return nr.edge.type === 'dirt' ? SURF.DIRTROAD : SURF.ASPHALT;
    if (this.bridges.length && this.bridgeAt(x, z, 1e9) !== null) return SURF.ASPHALT;
    if (this.inCityRect(x, z, 2)) {
      const blk = this.cityBlockAt(x, z);
      if (!blk || this.inBay(x, z)) return SURF.ASPHALT;
      if (blk.kind === 'park' || blk.kind === 'fwy') {
        const w = CITY.walk;
        if (x < blk.x0 + w || x > blk.x1 - w || z < blk.z0 + w || z > blk.z1 - w) return SURF.CONCRETE;
        return SURF.GRASS;
      }
      if (blk.kind === 'res') {
        const w = CITY.walk;
        if (x < blk.x0 + w || x > blk.x1 - w || z < blk.z0 + w || z > blk.z1 - w) return SURF.CONCRETE;
        return SURF.GRASS;
      }
      return SURF.CONCRETE;
    }
    const gx = Math.round((x + HALF) / CELL), gz = Math.round((z + HALF) / CELL);
    if (gx < 0 || gz < 0 || gx > N || gz > N) return SURF.GRASS;
    return this.surf[gz * NV + gx];
  }

  // pick a lane position near (x,z) for (re)spawning: returns {x,y,z,heading,edge,dir,idx}
  roadSpawnNear(x, z, minD = 0, maxD = 1e9, filter = null) {
    let best = null, bestScore = 1e18;
    for (const e of this.edges) {
      if (filter && !filter(e)) continue;
      const P = e.pts;
      for (let i = 2; i < P.length - 2; i += 3) {
        if (e.bridge[i]) continue;
        const d = Math.hypot(P[i].x - x, P[i].z - z);
        if (d < minD || d > maxD) continue;
        const score = minD > 0 ? d + this.rand() * 80 : d;
        if (score < bestScore) { bestScore = score; best = { e, i }; }
      }
    }
    if (!best) return null;
    const { e, i } = best;
    const dir = this.rand() < 0.5 ? 0 : 1;
    const a = e.pts[i], b = e.pts[dir === 0 ? i + 1 : i - 1];
    const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz);
    const rx = -tz / tl, rz = tx / tl;
    const px = a.x + rx * e.lane, pz = a.z + rz * e.lane;
    return { x: px, z: pz, y: a.y, heading: Math.atan2(-tx, -tz), edge: e, dir, idx: i };
  }
}
