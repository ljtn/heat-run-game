// Builds all static visuals for the World.
import * as THREE from 'three';
import { mergeGeometries } from '../lib/addons/utils/BufferGeometryUtils.js';
import { N, NV, CELL, HALF, SIZE, CITY, SURF, WATER } from './world.js';
import { mulberry32, smoothstep, clamp, lerp } from './noise.js';
import * as TX from './textures.js';

const lin = (hex) => new THREE.Color(hex);

class GeoBuilder {
  constructor(withColor = false) {
    this.p = []; this.n = []; this.u = []; this.c = withColor ? [] : null; this.i = [];
  }
  get count() { return this.p.length / 3; }
  vert(x, y, z, nx, ny, nz, u, v, col) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.u.push(u, v);
    if (this.c) this.c.push(col.r, col.g, col.b);
    return this.count - 1;
  }
  // a,b,c,d: [x,y,z]; uv: [[u,v]x4]; counter-clockwise when viewed from front
  quad(a, b, c, d, uv, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    uv = uv || [[0, 0], [1, 0], [1, 1], [0, 1]];
    const i0 = this.vert(...a, nx, ny, nz, ...uv[0], col);
    const i1 = this.vert(...b, nx, ny, nz, ...uv[1], col);
    const i2 = this.vert(...c, nx, ny, nz, ...uv[2], col);
    const i3 = this.vert(...d, nx, ny, nz, ...uv[3], col);
    this.i.push(i0, i1, i2, i0, i2, i3);
  }
  tri(a, b, c, uv, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    uv = uv || [[0, 0], [1, 0], [0.5, 1]];
    const i0 = this.vert(...a, nx, ny, nz, ...uv[0], col);
    const i1 = this.vert(...b, nx, ny, nz, ...uv[1], col);
    const i2 = this.vert(...c, nx, ny, nz, ...uv[2], col);
    this.i.push(i0, i1, i2);
  }
  // vertical wall from A=(x,z) along outward normal n=(nx,nz), length len
  wall(ax, az, nx, nz, len, y0, y1, u0, uScale, vScale, vOff = 0, col) {
    const rx = nz, rz = -nx;
    const bx = ax + rx * len, bz = az + rz * len;
    const u1 = u0 + len * uScale;
    this.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az],
      [[u0, vOff], [u1, vOff], [u1, vOff + (y1 - y0) * vScale], [u0, vOff + (y1 - y0) * vScale]], col);
    return u1;
  }
  box(cx, cz, hx, hz, y0, y1, uScale, vScale, top = true, col, vOff = 0) {
    let u = 0;
    u = this.wall(cx - hx, cz + hz, 0, 1, 2 * hx, y0, y1, u, uScale, vScale, vOff, col);
    u = this.wall(cx + hx, cz + hz, 1, 0, 2 * hz, y0, y1, u, uScale, vScale, vOff, col);
    u = this.wall(cx + hx, cz - hz, 0, -1, 2 * hx, y0, y1, u, uScale, vScale, vOff, col);
    u = this.wall(cx - hx, cz - hz, -1, 0, 2 * hz, y0, y1, u, uScale, vScale, vOff, col);
    if (top) this.top(cx - hx, cz - hz, cx + hx, cz + hz, y1, 1 / 10, col);
  }
  top(x0, z0, x1, z1, y, s, col) {
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [[x0 * s, z1 * s], [x1 * s, z1 * s], [x1 * s, z0 * s], [x0 * s, z0 * s]], col);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    if (this.c) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
  // transform the last [from..] vertices: rotate around y by rot then translate
  transformFrom(from, rot, tx, ty, tz) {
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let k = from; k < this.count; k++) {
      const x = this.p[k * 3], z = this.p[k * 3 + 2];
      this.p[k * 3] = x * c + z * s + tx;
      this.p[k * 3 + 1] += ty;
      this.p[k * 3 + 2] = -x * s + z * c + tz;
      const nx = this.n[k * 3], nz = this.n[k * 3 + 2];
      this.n[k * 3] = nx * c + nz * s;
      this.n[k * 3 + 2] = -nx * s + nz * c;
    }
  }
}

const TILE = 400;
const tileKey = (x, z) => `${Math.floor((x + HALF) / TILE)},${Math.floor((z + HALF) / TILE)}`;

export function buildWorldMeshes(world, scene) {
  const mats = {};
  const group = new THREE.Group();
  scene.add(group);
  const R = mulberry32(4242);

  // ---------------- terrain ----------------
  const detail = TX.grassDetail();
  detail.colorSpace = THREE.NoColorSpace;
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.96, metalness: 0 });
  terrainMat.onBeforeCompile = (sh) => {
    // aerial haze thins with altitude, so mountain flanks and snowfields read through the evening murk
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWY;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWY;')
      .replace('#include <fog_fragment>', `
      #ifdef USE_FOG
        #ifdef FOG_EXP2
          float fdH = fogDensity * mix(0.3, 1.0, exp(-max(0.0, vWY - 30.0) / 200.0));
          float fogF = 1.0 - exp(-fdH * fdH * vFogDepth * vFogDepth);
        #else
          float fogF = smoothstep(fogNear, fogFar, vFogDepth);
        #endif
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogF);
      #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec3 t1 = texture2D(map, vMapUv).rgb;
        vec3 t2 = texture2D(map, vMapUv * 0.173 + vec2(0.37, 0.11)).rgb;
        diffuseColor.rgb *= t1 * t2 * 2.05;
      #endif
    `);
  };
  mats.terrain = terrainMat;
  const H = world.heights;
  const colGrass1 = lin(0x4d6b2a), colGrass2 = lin(0x6f7d34), colGrass3 = lin(0x3a5a26), colDry = lin(0x8a8a4a);
  const colField1 = lin(0xb59a4c), colField2 = lin(0x6b4f33), colField3 = lin(0x7f8f3a);
  const colDirt = lin(0x7a6247), colSand = lin(0xc2ae84), colRock = lin(0x7c776f), colRock2 = lin(0x5d5a55);
  const colSnow = lin(0xf1f4f8), colSnow2 = lin(0xc9d3e0);
  const colUnder = lin(0x3b4a3a), colConcrete = lin(0x8f8c86), colShoulder = lin(0x857a68);
  const colors = new Float32Array(NV * NV * 3);
  const tmp = new THREE.Color();
  for (let j = 0; j <= N; j++) {
    const z = -HALF + j * CELL;
    for (let i = 0; i <= N; i++) {
      const x = -HALF + i * CELL;
      const k = j * NV + i;
      const h = H[k];
      const s = world.surf[k];
      const n1 = world.noiseD(x / 60, z / 60), n2 = world.noiseC(x / 300 + 9, z / 300);
      if (s === SURF.SAND) tmp.copy(colSand).lerp(colDirt, Math.max(0, n1) * 0.4);
      else if (s === SURF.ROCK) tmp.copy(colRock).lerp(colRock2, n1 * 0.5 + 0.5);
      else if (s === SURF.SNOW) tmp.copy(colSnow).lerp(colSnow2, clamp(n1 * 0.5 + 0.5, 0, 1) * 0.6);
      else if (s === SURF.FIELD) {
        const fn = world.noiseD(x / 140 + 50, z / 140);
        tmp.copy(fn > 0.25 ? colField1 : fn > -0.15 ? colField2 : colField3);
        const stripe = Math.sin((x * 0.6 + z * 0.25)) * 0.5 + 0.5;
        tmp.multiplyScalar(0.85 + stripe * 0.25);
      } else if (s === SURF.DIRT) tmp.copy(colDirt).lerp(colGrass2, 0.3 + n1 * 0.3);
      else {
        tmp.copy(colGrass1).lerp(colGrass2, clamp(n2 * 0.8 + 0.5, 0, 1));
        tmp.lerp(colDry, clamp(n1 * 0.6, 0, 0.5));
        tmp.lerp(colGrass3, world.forest[k] * 0.6);
      }
      // rock showing on steeper slopes / high up
      const hx = H[Math.min(k + 1, H.length - 1)] - H[Math.max(k - 1, 0)];
      const hz = H[Math.min(k + NV, H.length - 1)] - H[Math.max(k - NV, 0)];
      const slope = Math.hypot(hx, hz) / (2 * CELL);
      if (s === SURF.SNOW) { /* snowfield: rock only on the steepest bits */ tmp.lerp(colRock2, smoothstep(0.9, 1.3, slope) * 0.7); }
      else {
        tmp.lerp(colRock, smoothstep(0.45, 0.8, slope) * 0.8);
        if (h > 120) tmp.lerp(colRock2, smoothstep(120, 170, h) * 0.6);
        // dusting of snow in the hollows near the snow line
        if (h > 200) tmp.lerp(colSnow, smoothstep(200, 260, h) * (1 - smoothstep(0.6, 1.1, slope)) * 0.8);
      }
      if (h < 0.4) tmp.lerp(colUnder, smoothstep(0.4, -3, h));
      if (world.inCityRect(x, z, 4)) tmp.copy(colConcrete);
      colors[k * 3] = tmp.r; colors[k * 3 + 1] = tmp.g; colors[k * 3 + 2] = tmp.b;
    }
  }
  // road shoulders darken
  for (const e of world.edges) {
    if (e.city) continue;
    for (const p of e.pts) {
      const i = Math.round((p.x + HALF) / CELL), j = Math.round((p.z + HALF) / CELL);
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii > N || jj > N) continue;
        const k = jj * NV + ii;
        const d = Math.hypot(-HALF + ii * CELL - p.x, -HALF + jj * CELL - p.z) - e.halfW;
        if (d < 4) {
          const t = 1 - smoothstep(0, 4, d);
          colors[k * 3] = lerp(colors[k * 3], colShoulder.r, t * 0.6);
          colors[k * 3 + 1] = lerp(colors[k * 3 + 1], colShoulder.g, t * 0.6);
          colors[k * 3 + 2] = lerp(colors[k * 3 + 2], colShoulder.b, t * 0.6);
        }
      }
    }
  }
  // tunnel mouths: a heightfield can't make a vertical rock face, so the terrain cells around each portal are
  // cut out of the mesh and the concrete portal block (apron, headwall, roof) fills the gap
  const HM = H, hole = new Uint8Array(NV * NV);
  for (const tn of world.tunnels || []) {
    const P = tn.pts, wo = tn.halfW + 0.8;
    for (const [p, q] of [[P[0], P[2]], [P[P.length - 1], P[P.length - 3]]]) {
      const L = Math.hypot(q.x - p.x, q.z - p.z) || 1, dx = (q.x - p.x) / L, dz = (q.z - p.z) / L;
      const R = wo + 12;
      for (let j = Math.max(0, Math.floor((p.z - R + HALF) / CELL)); j < Math.min(N, Math.ceil((p.z + R + HALF) / CELL)); j++) {
        for (let i = Math.max(0, Math.floor((p.x - R + HALF) / CELL)); i < Math.min(N, Math.ceil((p.x + R + HALF) / CELL)); i++) {
          const x = -HALF + (i + 0.5) * CELL - p.x, z = -HALF + (j + 0.5) * CELL - p.z; // cell centre
          const along = x * dx + z * dz, lat = Math.abs(-x * dz + z * dx);
          if (along > -3.5 && along < 4.5 && lat < wo + 1.5) hole[j * NV + i] = 1;
        }
      }
    }
  }
  const CH = 40;
  for (let cj = 0; cj < N / CH; cj++) for (let ci = 0; ci < N / CH; ci++) {
    const nv = CH + 1;
    const pos = new Float32Array(nv * nv * 3), nor = new Float32Array(nv * nv * 3), col = new Float32Array(nv * nv * 3), uv = new Float32Array(nv * nv * 2);
    for (let b = 0; b < nv; b++) for (let a = 0; a < nv; a++) {
      const i = ci * CH + a, j = cj * CH + b;
      const k = j * NV + i, q = b * nv + a;
      const x = -HALF + i * CELL, z = -HALF + j * CELL;
      pos[q * 3] = x; pos[q * 3 + 1] = HM[k]; pos[q * 3 + 2] = z;
      const hl = H[j * NV + Math.max(i - 1, 0)], hr = H[j * NV + Math.min(i + 1, N)];
      const hu = H[Math.max(j - 1, 0) * NV + i], hd = H[Math.min(j + 1, N) * NV + i];
      const nx = (hl - hr), nz = (hu - hd), ny = 2 * CELL;
      const l = Math.hypot(nx, ny, nz);
      nor[q * 3] = nx / l; nor[q * 3 + 1] = ny / l; nor[q * 3 + 2] = nz / l;
      col[q * 3] = colors[k * 3]; col[q * 3 + 1] = colors[k * 3 + 1]; col[q * 3 + 2] = colors[k * 3 + 2];
      uv[q * 2] = x / 6; uv[q * 2 + 1] = z / 6;
    }
    const idx = [];
    for (let b = 0; b < CH; b++) for (let a = 0; a < CH; a++) {
      if (hole[(cj * CH + b) * NV + ci * CH + a]) continue;
      const A = b * nv + a, B = A + 1, C = A + nv, D = C + 1;
      idx.push(A, C, B, B, C, D);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, terrainMat);
    m.receiveShadow = true;
    group.add(m);
  }

  // ---------------- water ----------------
  const wn = TX.waterNormals();
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x1e3f46, roughness: 0.07, metalness: 0.0, normalMap: wn, normalScale: new THREE.Vector2(0.22, 0.22),
    transparent: true, opacity: 0.86, envMapIntensity: 1.25,
  });
  waterMat.userData.time = { value: 0 };
  waterMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = waterMat.userData.time;
    sh.fragmentShader = 'uniform float uTime;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `
      vec3 n1 = texture2D(normalMap, vNormalMapUv * 0.37 + vec2(uTime * 0.011, uTime * 0.007)).xyz * 2.0 - 1.0;
      vec3 n2 = texture2D(normalMap, vNormalMapUv * 1.13 + vec2(-uTime * 0.023, uTime * 0.017)).xyz * 2.0 - 1.0;
      vec3 n3 = texture2D(normalMap, vNormalMapUv * 0.071 + vec2(uTime * 0.003, -uTime * 0.002)).xyz * 2.0 - 1.0;
      vec3 mapN = normalize(vec3((n1.xy * 0.6 + n2.xy * 0.5 + n3.xy * 0.8) * normalScale, 1.0));
      normal = normalize(tbn * mapN);
    `);
  };
  const wgeo = new THREE.PlaneGeometry(SIZE, SIZE, 1, 1);
  wgeo.rotateX(-Math.PI / 2);
  const uvA = wgeo.attributes.uv;
  for (let q = 0; q < uvA.count; q++) uvA.setXY(q, uvA.getX(q) * SIZE / 14, uvA.getY(q) * SIZE / 14);
  const water = new THREE.Mesh(wgeo, waterMat);
  water.position.y = WATER;
  water.receiveShadow = true;
  water.renderOrder = 1;
  group.add(water);
  mats.water = waterMat;

  // ---------------- roads ----------------
  const roadTex = { city: TX.roadTexture('city'), avenue: TX.roadTexture('avenue'), highway: TX.roadTexture('highway'), road: TX.roadTexture('road'), mountain: TX.roadTexture('mountain'), dirt: TX.roadTexture('dirt'), village: TX.roadTexture('village') };
  const meshScale = { city: 1, avenue: 1, mountain: 1, highway: 1 / (1 - 0.18), road: 1 / (1 - 0.2), dirt: 1 / (1 - 0.24), village: 1 / (1 - 0.16) };
  const roadBuilders = {};
  for (const k in roadTex) roadBuilders[k] = new GeoBuilder();
  const yOff = (e) => 0.05 + (e.id % 7) * 0.003;
  for (const e of world.edges) {
    const gb = roadBuilders[e.type];
    const hw = e.halfW * meshScale[e.type];
    const P = e.pts;
    let startD = 0, endD = e.len;
    const A = world.nodes[e.a], B = world.nodes[e.b];
    // trim where the road enters a city junction (the junction patch covers that part)
    if (A.city) startD = e.axis === 1 ? A.hx : A.hz;
    if (B.city) endD = e.len - (e.axis === 1 ? B.hx : B.hz);
    let dist = 0, prev = null;
    const sections = [];
    for (let i = 0; i < P.length; i++) {
      if (i > 0) dist += Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z);
      const p = P[i];
      const a = P[Math.max(i - 1, 0)], b = P[Math.min(i + 1, P.length - 1)];
      let tx = b.x - a.x, tz = b.z - a.z;
      const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
      let px = p.x, pz = p.z, py = p.y, d = dist;
      if (d < startD) {
        if (P[i + 1] && dist + Math.hypot(P[i + 1].x - p.x, P[i + 1].z - p.z) > startD) {
          const f = startD - d;
          px += tx * f; pz += tz * f; d = startD;
        } else continue;
      }
      if (d > endD) {
        if (prev && prev.d < endD) {
          const f = d - endD;
          px -= tx * f; pz -= tz * f; d = endD;
        } else break;
      }
      let lift = 0;
      if (e.ramp) {
        const rd = world.rampDeckDist(e, px, pz);
        if (rd.d < rd.hw - 3) break; // from here on the expressway's own surface carries the merging lane
        if (rd.d < rd.hw + e.halfW) lift = 0.05;
      }
      sections.push({ x: px, z: pz, y: py + lift, tx, tz, d, bridge: e.bridge[i] || (e.tunnel && e.tunnel[i]) });
      prev = sections[sections.length - 1];
    }
    // several vertices across so the surface follows the ground exactly (matters at junctions)
    const NA = e.city || e.type === 'dirt' ? 2 : 4;
    for (let s = 0; s < sections.length; s++) {
      const S = sections[s];
      const rx = -S.tz, rz = S.tx;
      S.v = [];
      for (let k = 0; k <= NA; k++) {
        const u = k / NA, o = (u * 2 - 1) * hw;
        const x = S.x + rx * o, z = S.z + rz * o;
        let y;
        if (e.city) y = CITY.at(x, z) + 0.03;
        else if (S.bridge) y = S.y + 0.06;
        else y = Math.max(world.terrainHeight(x, z), world.terrainHeight(S.x, S.z) - 0.3) + yOff(e);
        S.v.push(gb.vert(x, y, z, 0, 1, 0, u, S.d / 8));
      }
      if (s > 0) {
        const P0 = sections[s - 1];
        for (let k = 0; k < NA; k++) gb.i.push(P0.v[k], P0.v[k + 1], S.v[k + 1], P0.v[k], S.v[k + 1], S.v[k]);
      }
    }

  }
  for (const k in roadBuilders) {
    const g = roadBuilders[k].geometry();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      map: roadTex[k], roughness: k === 'dirt' ? 0.95 : 0.82, metalness: 0,
      transparent: k !== 'city', depthWrite: k === 'city', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    m.receiveShadow = true;
    m.renderOrder = 2;
    group.add(m);
    mats['road_' + k] = m.material;
  }
  // intersections
  const ib = new GeoBuilder();
  for (const nd of world.nodes) {
    if (!nd.city) continue;
    const hx = nd.hx, hz = nd.hz, y = nd.y + 0.03;
    ib.quad([nd.x - hx, y, nd.z + hz], [nd.x + hx, y, nd.z + hz], [nd.x + hx, y, nd.z - hz], [nd.x - hx, y, nd.z - hz], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  const interMesh = new THREE.Mesh(ib.geometry(), new THREE.MeshStandardMaterial({ map: TX.intersectionTexture(), roughness: 0.82, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  interMesh.receiveShadow = true;
  group.add(interMesh);

  // ---------------- city blocks ----------------
  const walkTex = TX.sidewalkTexture();
  const walkB = new GeoBuilder();
  const lawnB = new GeoBuilder();
  for (const blk of world.blocks) {
    const cx = (blk.x0 + blk.x1) / 2, cz = (blk.z0 + blk.z1) / 2;
    const hx = (blk.x1 - blk.x0) / 2, hz = (blk.z1 - blk.z0) / 2;
    if (blk.kind === 'fwy') { lawnB.top(blk.x0, blk.z0, blk.x1, blk.z1, blk.y + 0.02, 1 / 6); continue; } // grass under the expressway
    if (!blk.slope) {
      const yTop = blk.y + CITY.curb;
      walkB.box(cx, cz, hx, hz, blk.y - 0.4, yTop, 1 / 4, 1 / 4, false);
      walkB.top(blk.x0, blk.z0, blk.x1, blk.z1, yTop, 1 / 4);
      if (blk.kind === 'park' || blk.kind === 'res') {
        const w = CITY.walk;
        lawnB.top(blk.x0 + w, blk.z0 + w, blk.x1 - w, blk.z1 - w, yTop + 0.02, 1 / 6);
      }
      continue;
    }
    // hillside block: the slab follows the slope in strips, with a lawn park on top
    const Y = (x) => CITY.at(x, cz) + CITY.curb, n = Math.ceil((blk.x1 - blk.x0) / 3), w = CITY.walk;
    for (let k = 0; k < n; k++) {
      const xa = blk.x0 + ((blk.x1 - blk.x0) * k) / n, xb = blk.x0 + ((blk.x1 - blk.x0) * (k + 1)) / n, ya = Y(xa), yb = Y(xb);
      walkB.quad([xa, ya, blk.z1], [xb, yb, blk.z1], [xb, yb, blk.z0], [xa, ya, blk.z0], [[xa / 4, blk.z1 / 4], [xb / 4, blk.z1 / 4], [xb / 4, blk.z0 / 4], [xa / 4, blk.z0 / 4]]);
      for (const [z, s] of [[blk.z0, -1], [blk.z1, 1]]) {
        if (s > 0) walkB.quad([xa, ya - 0.4 - CITY.curb, z], [xb, yb - 0.4 - CITY.curb, z], [xb, yb, z], [xa, ya, z]);
        else walkB.quad([xb, yb - 0.4 - CITY.curb, z], [xa, ya - 0.4 - CITY.curb, z], [xa, ya, z], [xb, yb, z]);
      }
      const la = Math.max(xa, blk.x0 + w), lb = Math.min(xb, blk.x1 - w);
      if (lb > la) lawnB.quad([la, Y(la) + 0.02, blk.z1 - w], [lb, Y(lb) + 0.02, blk.z1 - w], [lb, Y(lb) + 0.02, blk.z0 + w], [la, Y(la) + 0.02, blk.z0 + w], [[la / 6, (blk.z1 - w) / 6], [lb / 6, (blk.z1 - w) / 6], [lb / 6, (blk.z0 + w) / 6], [la / 6, (blk.z0 + w) / 6]]);
    }
    for (const [x, s] of [[blk.x0, -1], [blk.x1, 1]]) walkB.wall(x, s < 0 ? blk.z0 : blk.z1, s, 0, blk.z1 - blk.z0, Y(x) - 0.4 - CITY.curb, Y(x), 0, 1 / 4, 1 / 4);
  }
  const walkMesh = new THREE.Mesh(walkB.geometry(), new THREE.MeshStandardMaterial({ map: walkTex, roughness: 0.9 }));
  walkMesh.receiveShadow = true;
  group.add(walkMesh);
  const lawnMat = new THREE.MeshStandardMaterial({ color: 0x5f7a35, map: detail, roughness: 0.95 });
  lawnMat.onBeforeCompile = terrainMat.onBeforeCompile;
  const lawn = new THREE.Mesh(lawnB.geometry(), lawnMat);
  lawn.receiveShadow = true;
  group.add(lawn);

  // ---------------- buildings ----------------
  mats.facades = [];
  const facadeB = {};
  for (let v = 0; v < TX.FACADE_COUNT; v++) {
    const ft = TX.facadeTextures(v), gl = TX.FACADE_GLASS[v];
    mats.facades.push(new THREE.MeshStandardMaterial({ map: ft.map, emissiveMap: ft.emissive, emissive: 0xffffff, emissiveIntensity: 0, roughness: gl ? 0.35 : 0.85, metalness: gl ? 0.3 : 0 }));
  }
  const st = TX.shopTextures();
  mats.shop = new THREE.MeshStandardMaterial({ map: st.map, emissiveMap: st.emissive, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.7 });
  const roofMat = new THREE.MeshStandardMaterial({ map: TX.roofTexture(), roughness: 0.95, side: THREE.DoubleSide });
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2010, emissiveIntensity: 4 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0xb8a070, roughness: 0.3, metalness: 0.8, side: THREE.DoubleSide });
  mats.shopLight = new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xfff0d0, emissiveIntensity: 1.6, side: THREE.DoubleSide });
  const addTo = (key, x, z) => {
    const k = key + '|' + tileKey(x, z);
    return facadeB[k] || (facadeB[k] = { key, b: new GeoBuilder() });
  };
  const US = 1 / 32, VS = 1 / 27.2;
  for (const b of world.buildings) {
    const fac = addTo('f' + b.variant, b.x, b.z).b;
    const roof = addTo('roof', b.x, b.z).b;
    let y0 = b.y;
    if (b.driveThru) {
      // the solid part of the ground floor (shop fronts), and an open lit corner shop
      y0 = b.y + 4.6;
      roof.box(b.x, b.z, b.hx + 0.6, b.hz + 0.6, y0, y0 + 0.4, 1 / 8, 1 / 8, true);
      const shopB = addTo('shop', b.x, b.z).b;
      for (const [a0, a1, c0, c1] of b.shopComp) if (a1 - a0 > 0.5 && c1 - c0 > 0.5) shopB.box((a0 + a1) / 2, (c0 + c1) / 2, (a1 - a0) / 2, (c1 - c0) / 2, b.y - 0.2, y0, 1 / 24, 1 / 4.8, false);
      const S = b.shop;
      const ceil = addTo('roof', b.x, b.z).b;
      ceil.quad([S.x0, y0 - 0.01, S.z0], [S.x1, y0 - 0.01, S.z0], [S.x1, y0 - 0.01, S.z1], [S.x0, y0 - 0.01, S.z1]);
      const lit = addTo('shoplight', b.x, b.z).b;
      const mx = (S.x0 + S.x1) / 2, mz = (S.z0 + S.z1) / 2, lw = (S.x1 - S.x0) * 0.35;
      for (const k of [-0.25, 0.25]) { const z = mz + k * (S.z1 - S.z0); lit.quad([mx - lw, y0 - 0.05, z - 0.35], [mx + lw, y0 - 0.05, z - 0.35], [mx + lw, y0 - 0.05, z + 0.35], [mx - lw, y0 - 0.05, z + 0.35]); }
    } else if (b.h > 12 && R() < 0.75) {
      const shop = addTo('shop', b.x, b.z).b;
      shop.box(b.x, b.z, b.hx + 0.25, b.hz + 0.25, b.y - 0.2, b.y + 4.6, 1 / 24, 1 / 4.8, false);
      y0 = b.y + 4.6;
      roof.box(b.x, b.z, b.hx + 0.6, b.hz + 0.6, y0, y0 + 0.4, 1 / 8, 1 / 8, true);
    }
    // tiers: stacked blocks that make up the tower's silhouette
    const tiers = [];
    const st = b.style || (b.setback ? 'setback' : 'plain');
    const ins = (f, minI = 3) => [Math.max(minI, b.hx * f), Math.max(minI, b.hz * f)];
    if (st === 'setback') { const [ix, iz] = ins(0.25); tiers.push({ hx: b.hx, hz: b.hz, y1: b.h * 0.62 }, { hx: b.hx - ix, hz: b.hz - iz, y1: b.h }); }
    else if (st === 'stepped') {
      const [ax, az] = ins(0.17, 2.5), [bx2, bz2] = ins(0.34, 5);
      tiers.push({ hx: b.hx, hz: b.hz, y1: b.h * 0.45 }, { hx: b.hx - ax, hz: b.hz - az, y1: b.h * 0.74 }, { hx: Math.max(4, b.hx - bx2), hz: Math.max(4, b.hz - bz2), y1: b.h });
    } else if (st === 'podium') tiers.push({ hx: b.hx, hz: b.hz, y1: Math.min(15, b.h * 0.2) }, { hx: b.hx * 0.6, hz: b.hz * 0.6, y1: b.h, ch: R() < 0.4 ? Math.min(b.hx, b.hz) * 0.18 : 0 });
    else if (st === 'chamfer') tiers.push({ hx: b.hx, hz: b.hz, y1: b.h * 0.82, ch: Math.min(b.hx, b.hz) * 0.3 }, { hx: b.hx * 0.82, hz: b.hz * 0.82, y1: b.h, ch: Math.min(b.hx, b.hz) * 0.25 });
    else tiers.push({ hx: b.hx, hz: b.hz, y1: b.h });
    let ty0 = y0;
    for (const t of tiers) {
      const yA = ty0, yB = b.y + t.y1, vOff = (yA - b.y) * VS;
      if (t.ch) {
        const c = t.ch, r2 = Math.SQRT1_2, d = c * Math.SQRT2;
        const X = b.x, Z = b.z, hx = t.hx, hz = t.hz;
        let u = 0;
        u = fac.wall(X - hx + c, Z + hz, 0, 1, 2 * hx - 2 * c, yA, yB, u, US, VS, vOff);
        u = fac.wall(X + hx - c, Z + hz, r2, r2, d, yA, yB, u, US, VS, vOff);
        u = fac.wall(X + hx, Z + hz - c, 1, 0, 2 * hz - 2 * c, yA, yB, u, US, VS, vOff);
        u = fac.wall(X + hx, Z - hz + c, r2, -r2, d, yA, yB, u, US, VS, vOff);
        u = fac.wall(X + hx - c, Z - hz, 0, -1, 2 * hx - 2 * c, yA, yB, u, US, VS, vOff);
        u = fac.wall(X - hx + c, Z - hz, -r2, -r2, d, yA, yB, u, US, VS, vOff);
        u = fac.wall(X - hx, Z - hz + c, -1, 0, 2 * hz - 2 * c, yA, yB, u, US, VS, vOff);
        fac.wall(X - hx, Z + hz - c, -r2, r2, d, yA, yB, u, US, VS, vOff);
        const ring = [[X - hx + c, Z + hz], [X + hx - c, Z + hz], [X + hx, Z + hz - c], [X + hx, Z - hz + c], [X + hx - c, Z - hz], [X - hx + c, Z - hz], [X - hx, Z - hz + c], [X - hx, Z + hz - c]];
        for (let k = 0; k < 8; k++) { const p = ring[k], q = ring[(k + 1) % 8]; roof.tri([X, yB + 0.02, Z], [p[0], yB + 0.02, p[1]], [q[0], yB + 0.02, q[1]]); }
      } else {
        fac.box(b.x, b.z, t.hx, t.hz, yA, yB, US, VS, false, undefined, vOff);
        roof.box(b.x, b.z, t.hx + 0.2, t.hz + 0.2, yB, yB + 0.8, 1 / 8, 1 / 8, false);
        roof.top(b.x - t.hx, b.z - t.hz, b.x + t.hx, b.z + t.hz, yB + 0.3, 1 / 10);
      }
      ty0 = yB;
    }
    const topT = tiers[tiers.length - 1];
    const topY = b.y + b.h + 0.3;
    // crowns, spires and antennas on the tall ones
    if (b.top === 'spire') {
      const sx = topT.hx * 0.55, sz = topT.hz * 0.55, apex = [b.x, topY + Math.min(45, b.h * 0.22), b.z];
      const c4 = [[b.x - sx, b.z + sz], [b.x + sx, b.z + sz], [b.x + sx, b.z - sz], [b.x - sx, b.z - sz]];
      for (let k = 0; k < 4; k++) { const p = c4[k], q = c4[(k + 1) % 4]; roof.tri([p[0], topY, p[1]], [q[0], topY, q[1]], apex); }
      addTo('beacon', b.x, b.z).b.box(b.x, b.z, 0.35, 0.35, apex[1] - 0.2, apex[1] + 0.5, 1, 1, true);
    } else if (b.top === 'crown') {
      // art-deco stepped crown with a pyramid cap
      let cx = topT.hx * 0.8, cz = topT.hz * 0.8, cy = topY;
      for (let k = 0; k < 3; k++) {
        fac.box(b.x, b.z, cx, cz, cy, cy + 3.4, US, VS, false, undefined, 0.3);
        roof.top(b.x - cx, b.z - cz, b.x + cx, b.z + cz, cy + 3.4, 1 / 10);
        cy += 3.4; cx *= 0.72; cz *= 0.72;
      }
      const apex = [b.x, cy + 7, b.z], c4 = [[b.x - cx, b.z + cz], [b.x + cx, b.z + cz], [b.x + cx, b.z - cz], [b.x - cx, b.z - cz]];
      for (let k = 0; k < 4; k++) { const p = c4[k], q = c4[(k + 1) % 4]; addTo('crown', b.x, b.z).b.tri([p[0], cy, p[1]], [q[0], cy, q[1]], apex); }
    } else if (b.top === 'antenna') {
      const ah = 10 + R() * 18;
      roof.box(b.x, b.z, 1.2, 1.2, topY, topY + 2.5, 1 / 4, 1 / 4, true);
      roof.box(b.x, b.z, 0.15, 0.15, topY + 2.5, topY + 2.5 + ah, 1, 1, false);
      addTo('beacon', b.x, b.z).b.box(b.x, b.z, 0.3, 0.3, topY + 2.5 + ah, topY + 3.1 + ah, 1, 1, true);
    }
    // rooftop clutter (AC units, vents, water tanks)
    const sx = topT.hx * 0.8, sz = topT.hz * 0.8;
    const nClutter = b.top === 'spire' || b.top === 'crown' ? 0 : 1 + Math.floor(R() * 3);
    for (let q = 0; q < nClutter; q++) {
      const w = 1 + R() * 3, d = 1 + R() * 3, h = 1 + R() * 2.5;
      const x = b.x + (R() - 0.5) * Math.max(0, sx - w) * 1.6, z = b.z + (R() - 0.5) * Math.max(0, sz - d) * 1.6;
      roof.box(x, z, w / 2, d / 2, topY, topY + h, 1 / 4, 1 / 4, true);
    }
  }
  for (const k in facadeB) {
    const { key, b } = facadeB[k];
    const mat = key === 'roof' ? roofMat : key === 'shop' ? mats.shop : key === 'shoplight' ? mats.shopLight : key === 'beacon' ? beaconMat : key === 'crown' ? crownMat : mats.facades[+key.slice(1)];
    const m = new THREE.Mesh(b.geometry(), mat);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }

  // parking garages: columns, bay lines, ceiling lights, P signs
  if (world.garages && world.garages.length) {
    const gb = new GeoBuilder(true), lb = new GeoBuilder(), lit = new GeoBuilder();
    const concrete = new THREE.Color(0x8f8b84), white = new THREE.Color(0xe8e6de), blue = new THREE.Color(0x1f4f9a);
    for (const g of world.garages) {
      const top = g.gy + g.NL * g.FH;
      for (const c of g.cols) gb.box(c.x, c.z, 0.4, 0.4, g.gy - 0.1, top - 0.05, 1, 1, false, concrete);
      for (const s of g.stalls) {
        // bay dividers either side of the stall
        const dz = s.heading === 0 ? -1 : 1;
        for (const ox of [-1.55, 1.55]) {
          const x = s.x + ox, z0 = s.z - 2.5, z1 = s.z + 2.5, y = s.y + 0.09;
          lb.quad([x - 0.06, y, z1], [x + 0.06, y, z1], [x + 0.06, y, z0], [x - 0.06, y, z0]);
        }
        void dz;
      }
      for (let k = 1; k <= g.NL; k++) {
        const y = g.gy + k * g.FH - 0.92;
        for (let x = g.X0 + 6; x < g.X1 - 4; x += 9) {
          const z = (g.Z0 + g.Z1) / 2;
          lit.quad([x - 0.7, y, z - 0.15], [x + 0.7, y, z - 0.15], [x + 0.7, y, z + 0.15], [x - 0.7, y, z + 0.15]);
        }
      }
      // big blue P sign on a pole at the entrance corner
      const px = g.X0 - 1.5, pz = g.Z0 - 1.5;
      gb.box(px, pz, 0.08, 0.08, g.gy, g.gy + 5.5, 1, 1, false, concrete);
      gb.box(px, pz, 0.08, 0.7, g.gy + 5.3, g.gy + 6.7, 1, 1, true, blue);
      gb.box(px + 0.09, pz, 0.01, 0.12, g.gy + 5.55, g.gy + 6.45, 1, 1, false, white);
      gb.box(px + 0.09, pz + 0.18, 0.01, 0.12, g.gy + 6.15, g.gy + 6.45, 1, 1, false, white);
      gb.box(px + 0.09, pz + 0.18, 0.01, 0.12, g.gy + 5.85, g.gy + 6.0, 1, 1, false, white);
      gb.box(px + 0.09, pz + 0.3, 0.01, 0.06, g.gy + 5.95, g.gy + 6.35, 1, 1, false, white);
    }
    const gm = new THREE.Mesh(gb.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    gm.castShadow = true; gm.receiveShadow = true;
    group.add(gm);
    group.add(new THREE.Mesh(lb.geometry(), new THREE.MeshBasicMaterial({ color: 0xd8d6cc, polygonOffset: true, polygonOffsetFactor: -3 })));
    mats.garageLight = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f0ff, emissiveIntensity: 2, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(lit.geometry(), mats.garageLight));
  }

  // repair workshops
  if (world.workshops && world.workshops.length) {
    const wb = new GeoBuilder(true);
    const brick = new THREE.Color(0x8a5a44), dark = new THREE.Color(0x2a2a2c), stripeY = new THREE.Color(0xf0c419), stripeK = new THREE.Color(0x1a1a1a), floor = new THREE.Color(0x6e6b66), red = new THREE.Color(0xb8322a);
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    const cx = c.getContext('2d');
    cx.fillStyle = '#1b2a3a'; cx.fillRect(0, 0, 512, 96);
    cx.fillStyle = '#ffd23c'; cx.font = 'bold 64px Impact, "Arial Narrow", sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText('AUTO REPAIRS', 256, 50);
    const signTex = new THREE.CanvasTexture(c); signTex.colorSpace = THREE.SRGBColorSpace;
    mats.workshopSign = new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.5 });
    for (const ws of world.workshops) {
      const start = wb.count, hw = ws.w / 2, hd = ws.d / 2;
      wb.box(0, -hd, hw + 0.25, 0.25, -0.3, ws.h, 1, 1, false, brick); // back
      wb.box(-hw, 0, 0.25, hd, -0.3, ws.h, 1, 1, false, brick);
      wb.box(hw, 0, 0.25, hd, -0.3, ws.h, 1, 1, false, brick);
      wb.box(0, 0, hw + 0.4, hd + 0.4, ws.h, ws.h + 0.35, 1, 1, true, dark); // roof
      wb.quad([-hw, ws.h - 0.02, hd], [hw, ws.h - 0.02, hd], [hw, ws.h - 0.02, -hd], [-hw, ws.h - 0.02, -hd], null, dark);
      wb.top(-hw + 0.2, -hd + 0.2, hw - 0.2, hd - 0.2, 0.06, 1, floor);
      // hazard stripes on the door posts
      for (const sx of [-1, 1]) for (let k = 0; k < 8; k++) wb.box(sx * (hw - 0.05), hd + 0.02, 0.3, 0.05, k * 0.55, k * 0.55 + 0.55, 1, 1, false, k % 2 ? stripeK : stripeY);
      // workbench and tool cabinets along the back wall
      wb.box(-hw + 2.5, -hd + 0.8, 1.6, 0.5, 0, 0.95, 1, 1, true, red);
      wb.box(hw - 2.0, -hd + 0.6, 1.0, 0.35, 0, 1.8, 1, 1, true, red);
      wb.box(0, -hd + 0.4, 0.9, 0.12, 2.0, 2.9, 1, 1, true, dark);
      wb.transformFrom(start, ws.rot, ws.x, ws.y, ws.z);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), mats.workshopSign);
      sign.position.set(ws.x + Math.sin(ws.rot) * (hd + 0.45), ws.y + ws.h - 0.6, ws.z + Math.cos(ws.rot) * (hd + 0.45));
      sign.rotation.y = ws.rot;
      group.add(sign);
    }
    const wm = new THREE.Mesh(wb.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
    wm.castShadow = true; wm.receiveShadow = true;
    group.add(wm);
    mats.workshopLight = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 2 });
    for (const ws of world.workshops) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, 0.4), mats.workshopLight);
      l.position.set(ws.x, ws.y + ws.h - 0.12, ws.z); l.rotation.y = ws.rot;
      group.add(l);
    }
  }

  // skate-park graffiti walls
  if (world.skateWalls && world.skateWalls.length) {
    const gc = document.createElement('canvas'); gc.width = 512; gc.height = 128;
    const g = gc.getContext('2d');
    g.fillStyle = '#9a958c'; g.fillRect(0, 0, 512, 128);
    const cols = ['#ff3c8a', '#3cd2ff', '#ffd23c', '#7cff6a', '#ff7a2a', '#b46aff'];
    for (let k = 0; k < 9; k++) {
      g.fillStyle = cols[k % cols.length];
      g.font = `bold ${40 + (k % 3) * 18}px Impact, sans-serif`;
      g.save(); g.translate(20 + k * 55, 70 + (k % 2) * 30); g.rotate(-0.2 + (k % 3) * 0.15);
      g.fillText(['SK8', 'HR', 'ZAP!', 'RAD', '77', 'WOW', 'K-OS', 'BLAM', 'GO'][k], 0, 0);
      g.restore();
    }
    for (let k = 0; k < 30; k++) { g.strokeStyle = cols[k % cols.length]; g.lineWidth = 3; g.beginPath(); g.moveTo(Math.random() * 512, Math.random() * 128); g.bezierCurveTo(Math.random() * 512, Math.random() * 128, Math.random() * 512, Math.random() * 128, Math.random() * 512, Math.random() * 128); g.stroke(); }
    const gt = new THREE.CanvasTexture(gc); gt.colorSpace = THREE.SRGBColorSpace;
    const sb = new GeoBuilder();
    for (const sw of world.skateWalls) sb.box(sw.x, sw.z, sw.hx, sw.hz, sw.y - 0.1, sw.y + sw.h, 1 / Math.max(sw.hx, sw.hz) / 2, 1 / sw.h, true);
    const sm = new THREE.Mesh(sb.geometry(), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.85 }));
    sm.castShadow = true; sm.receiveShadow = true;
    group.add(sm);
  }

  // shop-front pillars
  if (world.mullions && world.mullions.length) {
    const mb = new GeoBuilder();
    for (const m of world.mullions) {
      m.v0 = mb.count;
      const t = m.solid ? 0.34 : 0.14;
      mb.box(m.x, m.z, t, t, CITY.at(m.x, m.z) + CITY.curb - 0.05, CITY.at(m.x, m.z) + CITY.curb + 4.62, 1, 1, false);
      m.v1 = mb.count;
    }
    for (const p of world.shopPillars || []) { p.v0 = mb.count; mb.box(p.x, p.z, 0.42, 0.42, CITY.at(p.x, p.z) + CITY.curb - 0.05, CITY.at(p.x, p.z) + CITY.curb + 4.62, 1, 1, false); p.v1 = mb.count; }
    const mm = new THREE.Mesh(mb.geometry(), new THREE.MeshStandardMaterial({ color: 0x2c2e31, roughness: 0.4, metalness: 0.7 }));
    mm.castShadow = true;
    group.add(mm);
    const mp = mm.geometry.attributes.position;
    mats.mullionBreak = (m) => {
      for (let i = m.v0; i < m.v1; i++) mp.array[i * 3 + 1] = -100;
      mp.needsUpdate = true;
    };
  }

  // plaza fountain
  if (world.plaza) {
    const fb = new GeoBuilder();
    const { x, z } = world.plaza;
    const yTop = CITY.at(x, z) + CITY.curb;
    const seg = 24;
    const fmat = new THREE.MeshStandardMaterial({ color: 0xb5ada0, roughness: 0.8 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.8, 0.9, 32, 1, true), fmat);
    basin.position.set(x, yTop + 0.45, z);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.3, 8, 40), fmat);
    rim.rotation.x = Math.PI / 2; rim.position.set(x, yTop + 0.9, z);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(7.4, 32), waterMat);
    pool.rotation.x = -Math.PI / 2; pool.position.set(x, yTop + 0.7, z);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.0, 3.5, 12), fmat);
    col.position.set(x, yTop + 1.75, z);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 0.6, 0.6, 20), fmat);
    bowl.position.set(x, yTop + 3.4, z);
    for (const o of [basin, rim, col, bowl]) { o.castShadow = true; o.receiveShadow = true; group.add(o); }
    group.add(pool);
    void fb; void seg;
  }

  // ---------------- houses ----------------
  const houseB = {};
  const winLitB = {}, winDarkB = {};
  const getB = (store, x, z, col) => { const k = tileKey(x, z); return store[k] || (store[k] = new GeoBuilder(col)); };
  const foundation = lin(0x6e6a62), doorCol = lin(0x4a3424), chimney = lin(0x7b5546), garageDoor = lin(0xd8d2c4), doorLine = lin(0x8a857c);
  const drive = new GeoBuilder(), edge = new GeoBuilder();
  for (const h of world.houses) {
    const gb = getB(houseB, h.x, h.z, true);
    const wl = getB(winLitB, h.x, h.z, false), wd = getB(winDarkB, h.x, h.z, false);
    const start = gb.count, ws = wl.count, wds = wd.count;
    const wall = lin(h.color), roof = lin(h.roof), trim = lin(h.trim || 0xf0ece0), accent = lin(h.accent || 0x6b4a2e);
    const hw = h.w / 2, hd = h.d / 2, H1 = h.h, rh = h.roofH, o = 0.5, st = h.style || 'cottage';
    const hr = mulberry32(h.seed || 1);
    const brick = lin(0x7b5546), glassDark = null;
    gb.box(0, 0, hw + 0.05, hd + 0.05, -3.5, 0.35, 1, 1, false, foundation); // deep plinth for sloping plots
    gb.box(0, 0, hw, hd, 0.35, H1, 1, 1, false, wall);
    // ---- face helper: (u along the face, v up) -> local point, CCW seen from outside ----
    const F = {
      f: (u, v, off = 0) => [u, v, hd + off], b: (u, v, off = 0) => [-u, v, -hd - off],
      r: (u, v, off = 0) => [hw + off, v, -u], l: (u, v, off = 0) => [-hw - off, v, u],
    };
    const faceW = { f: hw, b: hw, r: hd, l: hd };
    const rect = (bld, face, u0, v0, u1, v1, off, col) => { const P = F[face]; bld.quad(P(u0, v0, off), P(u1, v0, off), P(u1, v1, off), P(u0, v1, off), null, col); };
    // a slab standing proud of a face: front plus its four edges
    const slab = (face, u0, v0, u1, v1, d0, d1, col) => {
      const P = F[face];
      gb.quad(P(u0, v0, d1), P(u1, v0, d1), P(u1, v1, d1), P(u0, v1, d1), null, col);
      gb.quad(P(u0, v1, d0), P(u0, v1, d1), P(u1, v1, d1), P(u1, v1, d0), null, col);
      gb.quad(P(u0, v0, d1), P(u0, v0, d0), P(u1, v0, d0), P(u1, v0, d1), null, col);
      gb.quad(P(u0, v0, d0), P(u0, v0, d1), P(u0, v1, d1), P(u0, v1, d0), null, col);
      gb.quad(P(u1, v0, d1), P(u1, v0, d0), P(u1, v1, d0), P(u1, v1, d1), null, col);
    };
    const lit = hr() < 0.55;
    const glass = () => (lit && hr() < 0.75 ? wl : wd);
    // a proper window: frame, glazing bars, sill, maybe shutters and a flower box
    const win = (face, u, v0, ww, wh, opts = {}) => {
      const g = glass(), P = F[face];
      g.quad(P(u - ww / 2, v0, 0.02), P(u + ww / 2, v0, 0.02), P(u + ww / 2, v0 + wh, 0.02), P(u - ww / 2, v0 + wh, 0.02));
      const t = 0.09;
      slab(face, u - ww / 2 - t, v0 - t, u + ww / 2 + t, v0, 0, 0.07, trim); // bottom frame
      slab(face, u - ww / 2 - t, v0 + wh, u + ww / 2 + t, v0 + wh + t, 0, 0.07, trim); // head
      slab(face, u - ww / 2 - t, v0, u - ww / 2, v0 + wh, 0, 0.07, trim);
      slab(face, u + ww / 2, v0, u + ww / 2 + t, v0 + wh, 0, 0.07, trim);
      if (!opts.picture) { slab(face, u - 0.025, v0, u + 0.025, v0 + wh, 0, 0.05, trim); slab(face, u - ww / 2, v0 + wh * 0.55 - 0.025, u + ww / 2, v0 + wh * 0.55 + 0.025, 0, 0.05, trim); }
      slab(face, u - ww / 2 - 0.16, v0 - t - 0.06, u + ww / 2 + 0.16, v0 - t, 0, 0.14, trim); // sill
      if (opts.shutters) for (const sd of [-1, 1]) slab(face, u + sd * (ww / 2 + 0.12), v0, u + sd * (ww / 2 + 0.12 + ww * 0.42), v0 + wh, 0, 0.05, accent);
      if (opts.flowers) {
        slab(face, u - ww / 2, v0 - 0.42, u + ww / 2, v0 - 0.16, 0, 0.3, lin(0x7a5532));
        for (let k = 0; k < 6; k++) { const fu = u - ww / 2 + 0.15 + (k * (ww - 0.3)) / 5; slab(face, fu - 0.07, v0 - 0.16, fu + 0.07, v0 - 0.02, 0.08, 0.24, lin([0xd8324a, 0xf2c14a, 0xf0f0f0, 0xe87a2a][k % 4])); }
      }
    };
    // ---- roof by style ----
    const fascia = (y) => { gb.box(0, 0, hw + o, hd + o, y - 0.22, y, 1, 1, false, trim); };
    if (st === 'modern') {
      gb.top(-hw, -hd, hw, hd, H1, 1 / 10, roof);
      gb.box(0, 0, hw + 0.15, hd + 0.15, H1, H1 + 0.6, 1, 1, false, trim); // parapet
      // cantilevered canopy over the entrance, and a wood-clad panel
      gb.box(-hw * 0.35, hd + 1.1, hw * 0.45, 1.2, 2.7, 2.9, 1, 1, true, trim);
      slab('f', hw * 0.15, 0.35, hw * 0.95, H1, 0, 0.06, accent);
      for (let k = 0; k < 7; k++) slab('f', hw * 0.15 + k * hw * 0.115, 0.35, hw * 0.15 + k * hw * 0.115 + 0.03, H1, 0.06, 0.08, lin(0x6b4a2e));
    } else if (st === 'bungalow') {
      // hipped roof: ridge along the long side
      const rl = Math.max(0.5, hw - hd);
      const E = [[-hw - o, -hd - o], [hw + o, -hd - o], [hw + o, hd + o], [-hw - o, hd + o]], Y = H1 - 0.15, T = H1 + rh;
      gb.quad([E[3][0], Y, E[3][1]], [E[2][0], Y, E[2][1]], [rl, T, 0], [-rl, T, 0], null, roof);
      gb.quad([E[1][0], Y, E[1][1]], [E[0][0], Y, E[0][1]], [-rl, T, 0], [rl, T, 0], null, roof);
      gb.tri([E[2][0], Y, E[2][1]], [E[1][0], Y, E[1][1]], [rl, T, 0], null, roof);
      gb.tri([E[0][0], Y, E[0][1]], [E[3][0], Y, E[3][1]], [-rl, T, 0], null, roof);
      fascia(H1 - 0.1);
    } else if (st === 'barn') {
      // gambrel: steep lower slopes, shallow upper ones
      const kz = hd * 0.55, ky = H1 + rh * 0.62, T = H1 + rh;
      for (const s of [1, -1]) {
        const a = [-hw - o, H1 - 0.15, s * (hd + o)], b = [hw + o, H1 - 0.15, s * (hd + o)], c = [hw + o, ky, s * kz], d = [-hw - o, ky, s * kz], e = [hw + o, T, 0], f = [-hw - o, T, 0];
        if (s > 0) { gb.quad(a, b, c, d, null, roof); gb.quad(d, c, e, f, null, roof); } else { gb.quad(b, a, d, c, null, roof); gb.quad(c, d, f, e, null, roof); }
      }
      for (const s of [1, -1]) { // gable ends (pentagon), with white trim crosses on the barn doors below
        const x = s * hw;
        const pts = [[x, H1, hd], [x, ky, kz], [x, T, 0], [x, ky, -kz], [x, H1, -hd]];
        for (let k = 1; k < 4; k++) s > 0 ? gb.tri(pts[0], pts[k + 1], pts[k], null, wall) : gb.tri(pts[0], pts[k], pts[k + 1], null, wall);
      }
      slab('f', -1.6, 0.35, 1.6, 3.0, 0, 0.06, lin(0x7a2418));
      for (const [u0, v0, u1, v1] of [[-1.6, 0.35, -1.45, 3.0], [1.45, 0.35, 1.6, 3.0], [-1.6, 2.85, 1.6, 3.0], [-1.6, 1.6, 1.6, 1.75]]) slab('f', u0, v0, u1, v1, 0.06, 0.1, trim);
    } else {
      // gable (ridge along x)
      gb.quad([-hw - o, H1 - 0.15, hd + o], [hw + o, H1 - 0.15, hd + o], [hw + o, H1 + rh, 0], [-hw - o, H1 + rh, 0], null, roof);
      gb.quad([hw + o, H1 - 0.15, -hd - o], [-hw - o, H1 - 0.15, -hd - o], [-hw - o, H1 + rh, 0], [hw + o, H1 + rh, 0], null, roof);
      gb.tri([hw, H1, hd], [hw, H1, -hd], [hw, H1 + rh, 0], null, wall);
      gb.tri([-hw, H1, -hd], [-hw, H1, hd], [-hw, H1 + rh, 0], null, wall);
      fascia(H1 - 0.1);
      // cottage dormers poking out of the front slope
      for (let k = 0; k < (h.dormers || 0); k++) {
        const u = h.dormers === 1 ? 0 : (k ? 1 : -1) * hw * 0.45, z0 = hd * 0.25, yb = H1 + rh * (1 - z0 / (hd + o)) * 0.35;
        gb.box(u, z0 + 0.6, 0.85, 0.65, yb - 0.6, yb + 1.25, 1, 1, false, wall);
        gb.quad([u - 1.05, yb + 1.15, z0 + 1.35], [u + 1.05, yb + 1.15, z0 + 1.35], [u, yb + 1.8, z0 + 1.35], [u, yb + 1.8, z0 + 1.35], null, roof);
        gb.quad([u - 1.05, yb + 1.15, z0 + 1.35], [u, yb + 1.8, z0 + 1.35], [u, yb + 1.8, z0 - 0.2], [u - 1.05, yb + 1.15, z0 - 0.2], null, roof);
        gb.quad([u, yb + 1.8, z0 + 1.35], [u + 1.05, yb + 1.15, z0 + 1.35], [u + 1.05, yb + 1.15, z0 - 0.2], [u, yb + 1.8, z0 - 0.2], null, roof);
        const g = glass(); g.quad([u - 0.5, yb, z0 + 1.27], [u + 0.5, yb, z0 + 1.27], [u + 0.5, yb + 0.95, z0 + 1.27], [u - 0.5, yb + 0.95, z0 + 1.27]);
      }
    }
    // chimneys: brick with a cap (colonial: one each end)
    if (h.chimney) {
      const spots = st === 'colonial' ? [[-hw + 0.6, 0], [hw - 0.6, 0]] : [[hw * 0.5, -hd * 0.3]];
      for (const [cx, cz] of spots) { gb.box(cx, cz, 0.42, 0.42, H1, H1 + rh + 1.0, 1, 1, false, brick); gb.box(cx, cz, 0.52, 0.52, H1 + rh + 1.0, H1 + rh + 1.18, 1, 1, true, lin(0x5a5752)); }
    }
    // corner boards
    if (st !== 'modern') for (const [cx, cz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) gb.box(cx, cz, 0.11, 0.11, 0.35, H1, 1, 1, false, trim);
    // ---- door with frame, step, and a porch / portico / canopy by style ----
    const doorU = st === 'colonial' ? 0 : st === 'modern' ? -hw * 0.35 : hw > 6 && hr() < 0.5 ? -hw * 0.3 : 0;
    rect(gb, 'f', doorU - 0.55, 0.35, doorU + 0.55, 2.45, 0.03, st === 'modern' ? lin(0x3a2a1c) : accent);
    for (const [u0, v0, u1, v1] of [[doorU - 0.7, 0.35, doorU - 0.55, 2.6], [doorU + 0.55, 0.35, doorU + 0.7, 2.6], [doorU - 0.7, 2.45, doorU + 0.7, 2.6]]) slab('f', u0, v0, u1, v1, 0, 0.08, trim);
    gb.box(doorU, hd + 0.5, 0.9, 0.5, 0, 0.35, 1, 1, true, lin(0x9a958c)); // step
    if (st === 'farmhouse') {
      // full-width front porch: deck, columns, rail, and its own roof
      gb.box(0, hd + 1.3, hw - 0.3, 1.3, 0.1, 0.45, 1, 1, true, lin(0x8a7a66));
      for (let k = 0; k <= 4; k++) { const u = -hw + 0.6 + (k * (h.w - 1.2)) / 4; gb.box(u, hd + 2.4, 0.11, 0.11, 0.45, 2.85, 1, 1, false, trim); }
      gb.box(-hw * 0.55, hd + 2.4, hw * 0.4, 0.05, 1.25, 1.33, 1, 1, true, trim); gb.box(hw * 0.55, hd + 2.4, hw * 0.4, 0.05, 1.25, 1.33, 1, 1, true, trim);
      gb.quad([-hw + 0.1, 2.85, hd + 2.7], [hw - 0.1, 2.85, hd + 2.7], [hw - 0.1, 3.35, hd], [-hw + 0.1, 3.35, hd], null, roof);
      gb.quad([hw - 0.1, 2.7, hd + 2.7], [-hw + 0.1, 2.7, hd + 2.7], [-hw + 0.1, 2.85, hd + 2.7], [hw - 0.1, 2.85, hd + 2.7], null, trim);
    } else if (st === 'colonial') {
      // portico: two columns and a pediment over the door
      for (const sd of [-1, 1]) gb.box(doorU + sd * 1.2, hd + 1.3, 0.13, 0.13, 0.35, 2.95, 1, 1, false, trim);
      gb.box(doorU, hd + 0.75, 1.55, 0.75, 2.95, 3.15, 1, 1, true, trim);
      gb.quad([doorU - 1.55, 3.15, hd + 1.5], [doorU + 1.55, 3.15, hd + 1.5], [doorU, 3.85, hd + 1.5], [doorU, 3.85, hd + 1.5], null, trim);
      gb.quad([doorU - 1.6, 3.12, hd + 1.55], [doorU, 3.9, hd + 1.55], [doorU, 3.9, hd], [doorU - 1.6, 3.12, hd], null, roof);
      gb.quad([doorU, 3.9, hd + 1.55], [doorU + 1.6, 3.12, hd + 1.55], [doorU + 1.6, 3.12, hd], [doorU, 3.9, hd], null, roof);
    } else if (st === 'cottage' || st === 'bungalow') {
      gb.box(doorU, hd + 0.55, 0.95, 0.55, 2.7, 2.82, 1, 1, true, trim); // little canopy
      for (const sd of [-1, 1]) gb.box(doorU + sd * 0.85, hd + 0.9, 0.04, 0.04, 2.0, 2.72, 1, 1, false, trim);
    }
    // ---- windows: laid out per face and floor, with style-specific sizes ----
    const floors = H1 > 5 ? 2 : 1;
    const ww = st === 'modern' ? 2.4 : st === 'bungalow' ? 1.7 : 1.15, wh = st === 'modern' ? (floors > 1 ? 2.1 : 2.2) : 1.35;
    const opts = { shutters: h.shutters, flowers: h.flowers, picture: st === 'modern' };
    for (let f = 0; f < floors; f++) {
      const v0 = (st === 'modern' ? 0.5 : 1.05) + f * 3.05;
      for (const face of ['f', 'b', 'r', 'l']) {
        const W = faceW[face];
        const n = face === 'f' || face === 'b' ? Math.max(2, Math.floor((W * 2 - 1.5) / (ww + 1.6))) : Math.max(1, Math.floor((W * 2 - 1.5) / (ww + 2.2)));
        for (let k = 0; k < n; k++) {
          const u = -W + (W * 2 * (k + 0.5)) / n;
          if (face === 'f' && f === 0 && Math.abs(u - doorU) < ww / 2 + 0.95) continue; // leave room for the door
          if (st === 'modern' && face === 'f' && u > hw * 0.1) continue; // the wood-clad panel
          win(face, u, v0, ww, wh, face === 'f' ? opts : { shutters: opts.shutters, picture: opts.picture });
        }
      }
    }
    // a paved path from the front step toward the road, hugging the ground
    {
      const pl = Math.max(2, Math.min(9, (h.roadGap || 10) - hd - 2)), c = Math.cos(h.rot), sn = Math.sin(h.rot);
      const W = (lx, lz) => { const x = h.x + lx * c + lz * sn, z = h.z - lx * sn + lz * c; return [x, world.terrainHeight(x, z) + 0.09, z]; };
      for (let k = 0; k < pl; k += 1) {
        const za = hd + 1 + k, zb = Math.min(hd + 1 + pl, za + 1);
        drive.quad(W(doorU - 0.6, za), W(doorU + 0.6, za), W(doorU + 0.6, zb), W(doorU - 0.6, zb), [[0, k * 0.6], [0.5, k * 0.6], [0.5, k * 0.6 + 0.6], [0, k * 0.6 + 0.6]]);
      }
    }
    gb.transformFrom(start, h.rot, h.x, h.y, h.z);
    if (h.garage) {
      const g = h.garage, s0 = gb.count;
      const gw2 = g.w / 2, gd2 = g.d / 2, T = 0.24, GH = 2.95;
      // walls with thickness (open at the front), concrete floor, lintel over the door, roof
      gb.box(-gw2 + T / 2, 0, T / 2, gd2, -1.0, GH, 1, 1, false, wall);
      gb.box(gw2 - T / 2, 0, T / 2, gd2, -1.0, GH, 1, 1, false, wall);
      gb.box(0, -gd2 + T / 2, gw2, T / 2, -1.0, GH, 1, 1, false, wall);
      for (const sd of [-1, 1]) gb.box(sd * (gw2 - 0.3), gd2 - 0.15, 0.3, 0.15, -1.0, GH, 1, 1, false, wall); // door jambs
      gb.box(0, gd2 - 0.15, gw2, 0.15, 2.6, GH, 1, 1, false, wall); // lintel
      gb.top(-gw2, -gd2, gw2, gd2, 0.06, 1 / 3, lin(0x8f8a82)); // floor
      gb.quad([-gw2 + 0.1, 2.9, gd2 - 0.1], [gw2 - 0.1, 2.9, gd2 - 0.1], [gw2 - 0.1, 2.9, -gd2 + 0.1], [-gw2 + 0.1, 2.9, -gd2 + 0.1], null, lin(0xd8d2c4)); // ceiling
      gb.quad([-gw2 - 0.3, GH - 0.05, gd2 + 0.3], [gw2 + 0.3, GH - 0.05, gd2 + 0.3], [gw2 + 0.3, GH + 0.55, -gd2 - 0.3], [-gw2 - 0.3, GH + 0.55, -gd2 - 0.3], null, roof);
      gb.box(0, gd2 + 0.15, gw2 + 0.3, 0.12, GH - 0.25, GH, 1, 1, false, trim); // fascia
      gb.box(0, 2.85, 0.25, 0.12, 2.7, 2.88, 1, 1, true, lin(0xfff6dc)); // strip light
      // garage sits at its own ground height: offset from the house's base height
      gb.transformFrom(s0, h.rot, 0, 0, 0);
      const dy = g.y - h.y;
      for (let k = s0; k < gb.count; k++) { gb.p[k * 3] += g.x; gb.p[k * 3 + 1] += g.y; gb.p[k * 3 + 2] += g.z; }
      void dy;
      // gravel driveway strips following the ground
      // a fine grid hugging the ground, so no terrain bump pokes through it
      const n = Math.max(2, Math.round((h.drive.z1 - h.drive.z0) / 1.0)), nc = 4;
      const c = Math.cos(h.rot), sn = Math.sin(h.rot);
      const W = (lx, lz) => { const x = h.x + lx * c + lz * sn, z = h.z - lx * sn + lz * c; return [x, world.terrainHeight(x, z) + 0.1, z]; };
      const uvs = (a, b, k) => [[a, k], [b, k], [b, k + 1], [a, k + 1]].map(([u, v]) => [u * 0.8, v * 0.6]);
      for (let k = 0; k < n; k++) {
        const za = h.drive.z0 + (h.drive.z1 - h.drive.z0) * (k / n), zb = h.drive.z0 + (h.drive.z1 - h.drive.z0) * ((k + 1) / n);
        for (let q = 0; q < nc; q++) {
          const xa = h.drive.lx - 1.7 + (3.4 * q) / nc, xb = h.drive.lx - 1.7 + (3.4 * (q + 1)) / nc;
          drive.quad(W(xa, za), W(xb, za), W(xb, zb), W(xa, zb), uvs(q, q + 1, k));
        }
        // kerb edging either side
        for (const ex of [-1.75, 1.75]) edge.quad(W(h.drive.lx + ex - 0.12, za), W(h.drive.lx + ex + 0.12, za), W(h.drive.lx + ex + 0.12, zb), W(h.drive.lx + ex - 0.12, zb));
      }
    }
    wl.transformFrom(ws, h.rot, h.x, h.y, h.z);
    wd.transformFrom(wds, h.rot, h.x, h.y, h.z);
  }
  const houseMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, side: THREE.DoubleSide });
  const driveMesh = new THREE.Mesh(drive.geometry(), new THREE.MeshStandardMaterial({ color: 0xc9bfa8, map: TX.sidewalkTexture(), roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  driveMesh.receiveShadow = true;
  group.add(driveMesh);
  const edgeMesh = new THREE.Mesh(edge.geometry(), new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  edgeMesh.receiveShadow = true;
  group.add(edgeMesh);
  mats.winLit = new THREE.MeshStandardMaterial({ color: 0x2a3440, emissive: 0xffc37a, emissiveIntensity: 0, roughness: 0.2, metalness: 0.2 });
  mats.winDark = new THREE.MeshStandardMaterial({ color: 0x27303a, roughness: 0.15, metalness: 0.3 });
  for (const k in houseB) {
    const m = new THREE.Mesh(houseB[k].geometry(), houseMat);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  for (const k in winLitB) group.add(new THREE.Mesh(winLitB[k].geometry(), mats.winLit));
  for (const k in winDarkB) group.add(new THREE.Mesh(winDarkB[k].geometry(), mats.winDark));

  // ---------------- bridges ----------------
  const bb = new GeoBuilder();
  const deckTop = new GeoBuilder();
  const railB = new GeoBuilder();
  for (const br of world.bridges) {
    if (br.custom) { buildCustomDeck(world, br, bb, deckTop, railB); continue; }
    const P = br.pts, be = world.edges[br.edge];
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const pa = P[Math.max(0, i - 2)], pb = P[Math.min(P.length - 1, i + 3)];
      const L = Math.hypot(pb.x - pa.x, pb.z - pa.z);
      if (L < 0.05) continue;
      const tx = (pb.x - pa.x) / L, tz = (pb.z - pa.z) / L, rx = -tz, rz = tx;
      if (be && be.ramp) { const rd = world.rampDeckDist(be, (a.x + b.x) / 2, (a.z + b.z) / 2); if (rd.d < rd.hw - 3) continue; }
      const w = br.halfW + 0.7;
      const corner = (p, s, y) => [p.x + rx * w * s, y, p.z + rz * w * s];
      // underside
      bb.quad(corner(a, 1, a.y - 1.1), corner(b, 1, b.y - 1.1), corner(b, -1, b.y - 1.1), corner(a, -1, a.y - 1.1));
      // sides
      // (no side wall where another deck joins alongside: the two surfaces meet flush)
      if (!(br.gap && br.gap.has(i * 2 + 1))) bb.quad(corner(a, 1, a.y - 1.1), corner(a, 1, a.y + 0.04), corner(b, 1, b.y + 0.04), corner(b, 1, b.y - 1.1));
      if (!(br.gap && br.gap.has(i * 2))) bb.quad(corner(b, -1, b.y - 1.1), corner(b, -1, b.y + 0.04), corner(a, -1, a.y + 0.04), corner(a, -1, a.y - 1.1));
      // barriers
      for (const s of [-1, 1]) {
        if (br.gap && br.gap.has(i * 2 + (s > 0 ? 1 : 0))) continue; // open where a ramp merges
        const o0 = br.halfW + 0.15, o1 = br.halfW + 0.65;
        const p = (pt, o, y) => [pt.x + rx * o * s, y, pt.z + rz * o * s];
        const ya = a.y + 0.04, yb = b.y + 0.04;
        // inner face
        if (s > 0) bb.quad(p(a, o0, ya), p(b, o0, yb), p(b, o0, yb + 1.0), p(a, o0, ya + 1.0));
        else bb.quad(p(b, o0, yb), p(a, o0, ya), p(a, o0, ya + 1.0), p(b, o0, yb + 1.0));
        // top
        if (s > 0) bb.quad(p(a, o0, ya + 1.0), p(b, o0, yb + 1.0), p(b, o1, yb + 1.0), p(a, o1, ya + 1.0));
        else bb.quad(p(b, o0, yb + 1.0), p(a, o0, ya + 1.0), p(a, o1, ya + 1.0), p(b, o1, yb + 1.0));
      }
      if (i % 5 === 2) {
        const th = world.terrainHeight(a.x, a.z);
        const onStreet = world.inCityRect(a.x, a.z, 0) && !world.cityBlockAt(a.x, a.z); // never plant a pier in a city street
        if (th < a.y - 2 && !onStreet) {
          // and never through a road deck below
          const clear = (cx, cz) => { const lo = world.bridgeAt(cx, cz, a.y - 2.5); return lo === null || lo < th + 0.5; };
          for (const s of [-0.6, 0.6]) {
            const cx = a.x + rx * br.halfW * s, cz = a.z + rz * br.halfW * s;
            if (!clear(cx, cz)) continue;
            bb.box(cx, cz, 0.7, 0.7, th - 2, a.y - 1.0, 1, 1, false);
          }
        }
      }
    }
  }
  const bridgeMesh = new THREE.Mesh(bb.geometry(), new THREE.MeshStandardMaterial({ color: 0x9a958c, roughness: 0.85, side: THREE.DoubleSide }));
  bridgeMesh.castShadow = true; bridgeMesh.receiveShadow = true;
  group.add(bridgeMesh);
  // breakable metal railings, one piece per collider segment
  for (const pc of world.railPieces) {
    pc.v0 = railB.count;
    const L = Math.hypot(pc.bx - pc.ax, pc.bz - pc.az) || 1;
    const n = Math.max(1, Math.round(L / 1.6));
    let prev = null;
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = pc.ax + (pc.bx - pc.ax) * t, z = pc.az + (pc.bz - pc.az) * t;
      const y = world.deckHeight(pc.br, x, z);
      railB.box(x, z, 0.04, 0.04, y, y + 1.1, 1, 1, false);
      if (prev) for (const h of [0.55, 1.08]) {
        railB.quad([prev.x, prev.y + h - 0.03, prev.z], [x, y + h - 0.03, z], [x, y + h + 0.03, z], [prev.x, prev.y + h + 0.03, prev.z]);
      }
      prev = { x, y, z };
    }
    pc.v1 = railB.count;
  }
  // garage façade screens: perforated steel slats from the railing up to the deck above, one per railing piece
  const screenB = new GeoBuilder();
  for (const pc of world.railPieces) {
    if (pc.br.kind !== 'garage') continue;
    const g = world.garages.find((q) => pc.ax >= q.X0 - 1 && pc.ax <= q.X1 + 1 && pc.az >= q.Z0 - 1 && pc.az <= q.Z1 + 1);
    if (!g) continue;
    const ya = world.deckHeight(pc.br, pc.ax, pc.az), yb = world.deckHeight(pc.br, pc.bx, pc.bz);
    if (Math.min(ya, yb) > g.gy + g.NL * g.FH - 0.5) continue; // open roof deck: railing only
    const L = Math.hypot(pc.bx - pc.ax, pc.bz - pc.az);
    pc.s0 = screenB.count;
    screenB.quad([pc.ax, ya + 1.12, pc.az], [pc.bx, yb + 1.12, pc.bz], [pc.bx, yb + g.FH - 0.92, pc.bz], [pc.ax, ya + g.FH - 0.92, pc.az],
      [[0, 0], [L / 2.4, 0], [L / 2.4, 1], [0, 1]]);
    pc.s1 = screenB.count;
  }
  const slat = document.createElement('canvas'); slat.width = 128; slat.height = 128;
  const sg = slat.getContext('2d');
  sg.clearRect(0, 0, 128, 128);
  sg.fillStyle = '#4a4e53';
  for (let k = 0; k < 8; k++) sg.fillRect(k * 16, 0, 9, 128); // vertical slats with gaps
  sg.fillStyle = '#3a3d41'; sg.fillRect(0, 0, 128, 6); sg.fillRect(0, 122, 128, 6);
  const slatTex = new THREE.CanvasTexture(slat); slatTex.wrapS = THREE.RepeatWrapping; slatTex.colorSpace = THREE.SRGBColorSpace;
  const screenMesh = new THREE.Mesh(screenB.geometry(), new THREE.MeshStandardMaterial({ map: slatTex, alphaTest: 0.5, transparent: false, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide }));
  screenMesh.castShadow = true;
  group.add(screenMesh);
  const scrPos = screenMesh.geometry.attributes.position;
  const deckMesh = new THREE.Mesh(deckTop.geometry(), new THREE.MeshStandardMaterial({ map: walkTex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 }));
  deckMesh.receiveShadow = true;
  group.add(deckMesh);
  const railMesh = new THREE.Mesh(railB.geometry(), new THREE.MeshStandardMaterial({ color: 0x3b4046, roughness: 0.45, metalness: 0.6, side: THREE.DoubleSide }));
  railMesh.castShadow = true;
  group.add(railMesh);
  const railPos = railMesh.geometry.attributes.position;
  railPos.setUsage(THREE.DynamicDrawUsage);
  const railOrig = railPos.array.slice();
  const rails = {
    // collapse a railing piece's vertices so it disappears; restore() puts it back
    breakPiece(pc) {
      const a = railPos.array;
      for (let i = pc.v0; i < pc.v1; i++) { a[i * 3] = a[pc.v0 * 3]; a[i * 3 + 1] = -100; a[i * 3 + 2] = a[pc.v0 * 3 + 2]; }
      railPos.needsUpdate = true;
      if (pc.s1 > pc.s0) { for (let i = pc.s0; i < pc.s1; i++) scrPos.array[i * 3 + 1] = -100; scrPos.needsUpdate = true; } // its screen panel goes too
    },
    restore(pc) {
      railPos.array.set(railOrig.subarray(pc.v0 * 3, pc.v1 * 3), pc.v0 * 3);
      railPos.needsUpdate = true;
    },
  };

  // ---------------- tunnels ----------------
  const tunnelLamps = [];
  if (world.tunnels && world.tunnels.length) {
    const tb = new GeoBuilder(), lb = new GeoBuilder(), pb = new GeoBuilder();
    for (const tn of world.tunnels) {
      const P = tn.pts, wo = tn.halfW + 0.8, wi = tn.halfW * 0.45, H1 = 4.6, H2 = 6.2;
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1];
        const L = Math.hypot(b.x - a.x, b.z - a.z) || 1, rx = -(b.z - a.z) / L, rz = (b.x - a.x) / L;
        const at = (p, o, h) => [p.x + rx * o, p.y + h, p.z + rz * o];
        // walls, haunches and a flat crown
        tb.quad(at(a, -wo, 0), at(b, -wo, 0), at(b, -wo, H1), at(a, -wo, H1));
        tb.quad(at(b, wo, 0), at(a, wo, 0), at(a, wo, H1), at(b, wo, H1));
        tb.quad(at(a, -wo, H1), at(b, -wo, H1), at(b, -wi, H2), at(a, -wi, H2));
        tb.quad(at(b, wo, H1), at(a, wo, H1), at(a, wi, H2), at(b, wi, H2));
        tb.quad(at(a, -wi, H2), at(b, -wi, H2), at(b, wi, H2), at(a, wi, H2));
        // sparse sodium lamps, alternating sides, with long dark stretches between
        if (i % 9 === 4) { const sd = (i / 9) % 2 < 1 ? -1 : 1; const p = at(a, sd * (wi + 0.4), H2 - 0.15); lb.box(p[0], p[2], 0.35, 0.35, p[1] - 0.12, p[1], 1, 1, true); tunnelLamps.push({ x: p[0], y: p[1] - 0.4, z: p[2], flicker: Math.random() < 0.15 }); }
      }
      // portal block at each end: apron, headwall with an arch ring, roof slab, and wing walls into the cutting
      for (const [p, q] of [[P[0], P[1]], [P[P.length - 1], P[P.length - 2]]]) {
        const L = Math.hypot(q.x - p.x, q.z - p.z) || 1, tx = (p.x - q.x) / L, tz = (p.z - q.z) / L, rx = -tz, rz = tx;
        // f > 0 is outside (towards the cutting), f < 0 into the hill
        const at = (o, h, f = 0) => [p.x + rx * o + tx * f, p.y + h, p.z + rz * o + tz * f];
        const open = (o) => { const a = Math.abs(o); return a <= wi ? H2 : a <= wo ? H1 + (H2 - H1) * (wo - a) / (wo - wi) : -2; };
        const ground = (o, f) => world.terrainHeight(p.x + rx * o + tx * f, p.z + rz * o + tz * f) - p.y;
        const BW = wo + 4.6, BD = 7.6;
        let top = H2 + 1.6;
        for (let o = -BW; o <= BW; o += 1.5) top = Math.max(top, ground(o, -BD - 0.5) + 0.3);
        top = Math.min(top, H2 + 9);
        // apron over the cut-out ground in front
        pb.quad(at(-BW, -0.06, 6.6), at(BW, -0.06, 6.6), at(BW, -0.06, 0), at(-BW, -0.06, 0), [[0, 0], [BW / 2, 0], [BW / 2, 1.6], [0, 1.6]]);
        // headwall face around the opening
        const n = 16;
        for (let k = 0; k < n; k++) {
          const o0 = -BW + (2 * BW * k) / n, o1 = -BW + (2 * BW * (k + 1)) / n;
          pb.quad(at(o0, open(o0)), at(o1, open(o1)), at(o1, top), at(o0, top), [[o0 / 4, open(o0) / 4], [o1 / 4, open(o1) / 4], [o1 / 4, top / 4], [o0 / 4, top / 4]]);
        }
        // roof slab and sides of the block, sunk into the hill
        pb.quad(at(-BW, top), at(BW, top), at(BW, top, -BD), at(-BW, top, -BD));
        for (const sd of [-1, 1]) pb.quad(at(sd * BW, -1), at(sd * BW, -1, -BD), at(sd * BW, top, -BD), at(sd * BW, top));
        // parapet / coping along the top edge
        pb.quad(at(-BW, top, 0.25), at(BW, top, 0.25), at(BW, top + 0.6, 0.25), at(-BW, top + 0.6, 0.25));
        pb.quad(at(-BW, top + 0.6, 0.25), at(BW, top + 0.6, 0.25), at(BW, top + 0.6, -0.4), at(-BW, top + 0.6, -0.4));
        // arch ring standing proud of the face
        for (let k = 0; k < 14; k++) {
          const a0 = -wo + (2 * wo * k) / 14, a1 = -wo + (2 * wo * (k + 1)) / 14;
          pb.quad(at(a0, open(a0), 0.3), at(a1, open(a1), 0.3), at(a1, open(a1) + 0.8, 0.3), at(a0, open(a0) + 0.8, 0.3));
        }
        // wing walls stepping down along the cutting on both sides
        for (const sd of [-1, 1]) {
          for (let f = 0; f < 10; f += 1) {
            const h0 = Math.max(0.6, Math.min(top, ground(sd * BW, f + 0.5) + 0.4)), h1 = Math.max(0.6, Math.min(top, ground(sd * BW, f + 1.5) + 0.4));
            pb.quad(at(sd * BW, -1, f), at(sd * BW, -1, f + 1), at(sd * BW, h1, f + 1), at(sd * BW, h0, f));
            pb.quad(at(sd * BW, h0, f), at(sd * BW, h1, f + 1), at(sd * (BW + 0.6), h1, f + 1), at(sd * (BW + 0.6), h0, f));
          }
        }
      }
    }
    const pm = new THREE.Mesh(pb.geometry(), new THREE.MeshStandardMaterial({ color: 0xd8d2c8, map: TX.stoneBlockTexture(), roughness: 0.92, side: THREE.DoubleSide }));
    pm.castShadow = true; pm.receiveShadow = true;
    group.add(pm);
    const tm = new THREE.Mesh(tb.geometry(), new THREE.MeshStandardMaterial({ color: 0x4a4844, roughness: 0.92, side: THREE.DoubleSide }));
    tm.castShadow = true; tm.receiveShadow = true;
    group.add(tm);
    mats.tunnelLight = new THREE.MeshStandardMaterial({ color: 0x553311, emissive: 0xffa040, emissiveIntensity: 3 });
    group.add(new THREE.Mesh(lb.geometry(), mats.tunnelLight));
  }

  // ---------------- covered streets (city tunnels) ----------------
  if (world.covers && world.covers.length) {
    const cb = new GeoBuilder(), lb = new GeoBuilder(), facB = {};
    const US2 = 1 / 32, VS2 = 1 / 27.2;
    for (const c of world.covers) {
      const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, hx = (c.x1 - c.x0) / 2, hz = (c.z1 - c.z0) / 2;
      const k = c.fac % mats.facades.length;
      const fb = facB[k] || (facB[k] = new GeoBuilder());
      fb.box(cx, cz, hx, hz, c.y0 + 1.2, c.y1, US2, VS2, false, undefined, 0.3);
      cb.box(cx, cz, hx, hz, c.y0, c.y0 + 1.2, 1 / 6, 1 / 6, false); // concrete beam band
      cb.top(c.x0, c.z0, c.x1, c.z1, c.y1, 1 / 10);
      // soffit (facing down), stained and dark
      cb.quad([c.x0, c.y0, c.z0], [c.x1, c.y0, c.z0], [c.x1, c.y0, c.z1], [c.x0, c.y0, c.z1], [[0, 0], [hx / 3, 0], [hx / 3, hz / 3], [0, hz / 3]]);
      for (const [px, pz] of c.piers) cb.box(px, pz, 0.45, 0.45, CITY.at(px, pz) - 0.2, c.y0, 1 / 4, 1 / 4, false);
      // a few caged lamps down the middle, long gloomy gaps between
      const L = c.alongX ? hx * 2 : hz * 2;
      for (let t = 9; t < L - 5; t += 17) {
        const x = c.alongX ? c.x0 + t : cx, z = c.alongX ? cz : c.z0 + t;
        lb.box(x, z, 0.3, 0.3, c.y0 - 0.25, c.y0 - 0.02, 1, 1, true);
        tunnelLamps.push({ x, y: c.y0 - 0.6, z, flicker: Math.random() < 0.25 });
      }
    }
    for (const k in facB) { const fm = new THREE.Mesh(facB[k].geometry(), mats.facades[k]); fm.castShadow = fm.receiveShadow = true; group.add(fm); }
    const cm = new THREE.Mesh(cb.geometry(), new THREE.MeshStandardMaterial({ color: 0x55524d, roughness: 0.95 }));
    cm.castShadow = cm.receiveShadow = true;
    group.add(cm);
    if (!mats.tunnelLight) mats.tunnelLight = new THREE.MeshStandardMaterial({ color: 0x553311, emissive: 0xffa040, emissiveIntensity: 3 });
    group.add(new THREE.Mesh(lb.geometry(), mats.tunnelLight));
  }

  // ---------------- trees ----------------
  const treeGeos = [makeBroadleafs(), makeConifers(), makeBushes()];
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
  const treeTiles = {};
  const pickW = (u, W) => { let a = 0; for (let i = 0; i < W.length; i++) { a += W[i]; if (u < a) return i; } return W.length - 1; };
  for (const t of world.trees) {
    // species chosen from the spot: stable between runs, spruce/fir higher up, birches by the water
    const u = Math.abs(Math.sin(t.x * 12.9898 + t.z * 78.233) * 43758.5453) % 1;
    if (t.type === 0) t.v = world.sampleGrid(world.waterDist, t.x, t.z) < 60 && u < 0.45 ? 2 : pickW(u, BROADLEAF_WEIGHTS);
    else if (t.type === 1) t.v = t.y > 120 ? (u < 0.6 ? 0 : 2) : Math.floor(u * 3);
    else t.v = u < 0.7 ? 0 : u < 0.85 ? 1 : 2;
    const k = tileKey(t.x, t.z) + '|' + t.type + '|' + t.v;
    (treeTiles[k] || (treeTiles[k] = [])).push(t);
  }
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = new THREE.Vector3(), p4 = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  for (const k in treeTiles) {
    const list = treeTiles[k];
    const [, type, variant] = k.split('|').map(Number);
    const im = new THREE.InstancedMesh(treeGeos[type][variant], treeMat, list.length);
    list.forEach((t, i) => {
      q4.setFromAxisAngle(yAxis, t.rot);
      s4.set(t.s, t.s * (0.9 + t.tint * 0.25), t.s);
      p4.set(t.x, t.y - 0.2, t.z);
      m4.compose(p4, q4, s4);
      im.setMatrixAt(i, m4);
      t.im = im; t.ii = i;
      tint.setHSL(0.2 + (t.tint - 0.5) * 0.1, 0.1 + t.tint * 0.12, 0.55 + (t.tint - 0.5) * 0.14);
      tint.multiplyScalar(1.3);
      im.setColorAt(i, tint);
    });
    im.castShadow = true; im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
  }
  // rocks
  if (world.rocks.length) {
    const rg = new THREE.DodecahedronGeometry(1, 1);
    const rp = rg.attributes.position;
    const rr = mulberry32(17);
    for (let q = 0; q < rp.count; q++) rp.setXYZ(q, rp.getX(q) * (0.8 + rr() * 0.4), rp.getY(q) * (0.6 + rr() * 0.3), rp.getZ(q) * (0.8 + rr() * 0.4));
    rg.computeVertexNormals();
    const rim = new THREE.InstancedMesh(rg, new THREE.MeshStandardMaterial({ color: 0x8a857c, roughness: 0.95, flatShading: true }), world.rocks.length);
    world.rocks.forEach((r, i) => {
      q4.setFromAxisAngle(yAxis, r.rot);
      s4.set(r.s, r.s, r.s);
      p4.set(r.x, r.y + r.s * 0.2, r.z);
      m4.compose(p4, q4, s4);
      rim.setMatrixAt(i, m4);
    });
    rim.castShadow = true; rim.receiveShadow = true;
    group.add(rim);
  }

  // ---------------- street lamps ----------------
  const lamps = buildLamps(world, group, mats);
  const signals = buildTrafficLights(world, group, mats);

  // trees can be knocked over: tilt about the base toward (dx, dz); tilt 0 = standing
  const tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), tAx = new THREE.Vector3(), tp = new THREE.Vector3(), ts = new THREE.Vector3(), tm = new THREE.Matrix4();
  const trees = {
    pose(t, tilt, dx = 0, dz = 1) {
      tq.setFromAxisAngle(yAxis, t.rot);
      if (tilt) { tAx.set(dz, 0, -dx).normalize(); tq2.setFromAxisAngle(tAx, tilt); tq.premultiply(tq2); }
      ts.set(t.s, t.s * (0.9 + t.tint * 0.25), t.s);
      tm.compose(tp.set(t.x, t.y - 0.2, t.z), tq, ts);
      t.im.setMatrixAt(t.ii, tm);
      t.im.instanceMatrix.needsUpdate = true;
    },
  };
  return { group, mats, lamps, signals, rails, trees, tunnelLamps };
}

// footbridges, viaducts and kickers: deck surface, solid ramp body, railings, pillars
function buildCustomDeck(world, br, bb, top, railB) {
  const P = br.pts, hw = br.halfW;
  const groundAt = (x, z) => world.groundAt(x, z, -1e9).h - 0.02; // terrain/sidewalk, ignoring decks
  const ground = groundAt(P[0].x, P[0].z);
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
    if (L < 1e-3) continue;
    const rx = -dz / L, rz = dx / L;
    const c = (p, s, y) => [p.x + rx * hw * s, y, p.z + rz * hw * s];
    const s = 1 / 4;
    top.quad(c(a, -1, a.y + 0.07), c(a, 1, a.y + 0.07), c(b, 1, b.y + 0.07), c(b, -1, b.y + 0.07),
      [[a.x * s, a.z * s], [a.x * s + hw * s, a.z * s], [b.x * s + hw * s, b.z * s], [b.x * s, b.z * s]]);
    const solid = br.solid[i] || br.kind === 'jump';
    const ua = solid ? groundAt(a.x, a.z) : a.y - 0.9, ub = solid ? groundAt(b.x, b.z) : b.y - 0.9;
    const yb = solid ? ua : null;
    // sides (down to the ground where the ramp is solid) and underside
    bb.quad(c(a, 1, ua), c(a, 1, a.y + 0.07), c(b, 1, b.y + 0.07), c(b, 1, ub));
    bb.quad(c(b, -1, ub), c(b, -1, b.y + 0.07), c(a, -1, a.y + 0.07), c(a, -1, ua));
    if (yb === null) bb.quad(c(a, 1, ua), c(b, 1, ub), c(b, -1, ub), c(a, -1, ua));
  }
  // square landings at corners
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], p = P[i], b = P[i + 1];
    const d1 = Math.atan2(p.z - a.z, p.x - a.x), d2 = Math.atan2(b.z - p.z, b.x - p.x);
    let d = Math.abs(d2 - d1); if (d > Math.PI) d = 2 * Math.PI - d;
    if (d < 0.5) continue;
    const y = p.y + 0.07;
    top.quad([p.x - hw, y, p.z + hw], [p.x + hw, y, p.z + hw], [p.x + hw, y, p.z - hw], [p.x - hw, y, p.z - hw]);
    bb.box(p.x, p.z, hw, hw, p.y - 0.9, p.y + 0.05, 1, 1, false);
  }
  // ends of a solid ramp
  const end = P[P.length - 1];
  if (['kicker', 'dock', 'jump', 'skate', 'stairs', 'ledge'].includes(br.kind)) {
    const a = P[P.length - 2];
    const L = Math.hypot(end.x - a.x, end.z - a.z), rx = -(end.z - a.z) / L, rz = (end.x - a.x) / L;
    const ge = groundAt(end.x, end.z);
    bb.quad([end.x - rx * hw, ge, end.z - rz * hw], [end.x + rx * hw, ge, end.z + rz * hw], [end.x + rx * hw, end.y + 0.07, end.z + rz * hw], [end.x - rx * hw, end.y + 0.07, end.z - rz * hw]);
  }
  for (const pl of br.pillars) bb.box(pl.x, pl.z, 0.4, 0.4, ground - 0.1, pl.y - 0.85, 1, 1, false);
}

function autoRails(br) {
  const P = br.pts, o = br.halfW + 0.25, out = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const rx = -(b.z - a.z) / L, rz = (b.x - a.x) / L;
      out.push([a.x + rx * o * s, a.z + rz * o * s, b.x + rx * o * s, b.z + rz * o * s]);
    }
  }
  return out;
}

// ---- trees: several species per type, foliage shaded with soft "canopy" normals ----
function trunkGeo(r0, r1, h, col, bend = 0, seed = 1) {
  const g = new THREE.CylinderGeometry(r1, r0, h, 7, 4);
  const p = g.attributes.position, r = mulberry32(seed);
  for (let q = 0; q < p.count; q++) {
    const y = p.getY(q) + h / 2, k = y / h;
    p.setXYZ(q, p.getX(q) * (0.9 + r() * 0.2) + bend * k * k, y, p.getZ(q) * (0.9 + r() * 0.2) + bend * 0.4 * k * k);
  }
  paint(g, col);
  return g;
}
function branch(x0, y0, z0, x1, y1, z1, rad, col) {
  const L = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  const g = new THREE.CylinderGeometry(rad * 0.55, rad, L, 5);
  g.translate(0, L / 2, 0);
  const dir = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  g.translate(x0, y0, z0);
  paint(g, col);
  return g;
}
// a clump of leafy lumps; colours run dark underneath to sunlit on top, with per-lump variation
function foliage(blobs, lo, hi, seed, squash = 0.85, detail = 1) {
  const r = mulberry32(seed), parts = [];
  let cy = 0, cx = 0, cz = 0;
  for (const [x, y, z] of blobs) { cx += x; cy += y; cz += z; }
  cx /= blobs.length; cy /= blobs.length; cz /= blobs.length;
  let y0 = 1e9, y1 = -1e9;
  for (const [, y, , s] of blobs) { y0 = Math.min(y0, y - s); y1 = Math.max(y1, y + s); }
  const A = new THREE.Color(lo), B = new THREE.Color(hi), c = new THREE.Color();
  for (const [x, y, z, s] of blobs) {
    const g = new THREE.IcosahedronGeometry(s, detail);
    const p = g.attributes.position;
    for (let q = 0; q < p.count; q++) { const f = 0.78 + r() * 0.42; p.setXYZ(q, p.getX(q) * f, p.getY(q) * f * squash, p.getZ(q) * f); }
    g.translate(x, y, z);
    const shade = 0.85 + r() * 0.3, arr = new Float32Array(p.count * 3);
    for (let q = 0; q < p.count; q++) {
      const t = clamp((p.getY(q) - y0) / (y1 - y0), 0, 1);
      // outer leaves catch light, the inside of the crown is dark
      const out = Math.hypot(p.getX(q) - cx, p.getZ(q) - cz) / (s + 1.5);
      c.copy(A).lerp(B, clamp(t * 0.8 + out * 0.3, 0, 1)).multiplyScalar(shade * (0.92 + r() * 0.16));
      arr[q * 3] = c.r; arr[q * 3 + 1] = c.g; arr[q * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.userData.canopy = [cx, cy, cz];
    parts.push(g);
  }
  return parts;
}
function finishTree(parts) {
  const m = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  m.computeVertexNormals();
  // soften foliage: bend normals outward from the crown centre so the canopy shades like a volume
  let off = 0;
  const n = m.attributes.normal, p = m.attributes.position, v = new THREE.Vector3();
  for (const g of parts) {
    const cnt = (g.index ? g.toNonIndexed() : g).attributes.position.count;
    const C = g.userData.canopy;
    if (C) for (let q = off; q < off + cnt; q++) {
      v.set(p.getX(q) - C[0], (p.getY(q) - C[1]) * 1.3, p.getZ(q) - C[2]).normalize();
      v.multiplyScalar(0.75).add(new THREE.Vector3(n.getX(q), n.getY(q), n.getZ(q)).multiplyScalar(0.25)).normalize();
      n.setXYZ(q, v.x, v.y, v.z);
    }
    off += cnt;
  }
  return m;
}
function blobRing(r, cx, cy, cz, n, rad, sz, jit = 0.4) {
  const o = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.6;
    o.push([cx + Math.cos(a) * rad * (1 - jit / 2 + r() * jit), cy + (r() - 0.5) * sz * 0.6, cz + Math.sin(a) * rad * (1 - jit / 2 + r() * jit), sz * (0.75 + r() * 0.5)]);
  }
  return o;
}

// broadleaf species: round, oak, birch, poplar, copper beech, autumn maple
function makeBroadleafs() {
  const out = [];
  { // round crown with visible limbs
    const r = mulberry32(5), bark = 0x4a3828;
    const parts = [trunkGeo(0.32, 0.2, 3.6, bark, 0.15, 3), branch(0, 2.8, 0, 1.1, 4.2, 0.3, 0.12, bark), branch(0, 3.0, 0, -0.9, 4.4, -0.5, 0.11, bark)];
    parts.push(...foliage([[0, 5.0, 0, 2.2], [0.2, 6.1, 0.1, 1.5], ...blobRing(r, 0, 4.5, 0, 6, 1.6, 1.3)], 0x1f3812, 0x5f7f2a, 11));
    out.push(finishTree(parts));
  }
  { // oak: thick, gnarled, wide low crown
    const r = mulberry32(21), bark = 0x3d3226;
    const parts = [trunkGeo(0.48, 0.3, 3.0, bark, 0.3, 7)];
    for (const [x, z] of [[1.8, 0.4], [-1.5, 0.9], [0.3, -1.7], [-0.6, -1.2]]) parts.push(branch(0, 2.4, 0, x, 3.9 + r() * 0.6, z, 0.16, bark));
    parts.push(...foliage([[0, 5.0, 0, 2.0], ...blobRing(r, 0, 4.4, 0, 8, 2.3, 1.45), ...blobRing(r, 0, 5.4, 0, 4, 1.2, 1.3)], 0x1c3010, 0x4f6e24, 23, 0.75));
    out.push(finishTree(parts));
  }
  { // birch: slim white trunk with dark marks, airy pale crown
    const r = mulberry32(31);
    const tr = trunkGeo(0.16, 0.09, 6.2, 0xe6e2d8, 0.25, 9);
    const p = tr.attributes.position, col = tr.attributes.color;
    for (let q = 0; q < p.count; q++) if (Math.sin(p.getY(q) * 9.1 + p.getX(q) * 20) > 0.75) col.setXYZ(q, 0.12, 0.11, 0.1);
    const parts = [tr];
    const bl = [];
    for (let k = 0; k < 9; k++) bl.push([(r() - 0.5) * 1.8, 3.8 + k * 0.38, (r() - 0.5) * 1.8, 0.75 + r() * 0.45]);
    parts.push(...foliage(bl, 0x3a5a1c, 0x9ab84a, 33, 0.9));
    out.push(finishTree(parts));
  }
  { // lombardy poplar: tall narrow column
    const r = mulberry32(41);
    const parts = [trunkGeo(0.24, 0.12, 4.0, 0x50402e, 0, 4)];
    const bl = [];
    for (let k = 0; k < 8; k++) bl.push([(r() - 0.5) * 0.6, 2.8 + k * 0.85, (r() - 0.5) * 0.6, 1.15 - Math.abs(k - 3) * 0.1]);
    parts.push(...foliage(bl, 0x22401a, 0x5c8a30, 43, 1.25));
    out.push(finishTree(parts));
  }
  { // copper beech: dark purple-red crown
    const r = mulberry32(51), bark = 0x5a5650;
    const parts = [trunkGeo(0.34, 0.22, 3.4, bark, 0.1, 5)];
    parts.push(...foliage([[0, 5.0, 0, 2.3], ...blobRing(r, 0, 4.6, 0, 7, 1.9, 1.35)], 0x2a1414, 0x6e3428, 53));
    out.push(finishTree(parts));
  }
  { // maple turning: orange and gold
    const r = mulberry32(61), bark = 0x46362a;
    const parts = [trunkGeo(0.3, 0.2, 3.4, bark, 0.2, 6)];
    parts.push(...foliage([[0, 5.0, 0, 2.1], [0.3, 6.0, 0, 1.4], ...blobRing(r, 0, 4.6, 0, 6, 1.7, 1.3)], 0x6a2a0e, 0xe8a030, 63));
    out.push(finishTree(parts));
  }
  return out;
}
const BROADLEAF_WEIGHTS = [0.3, 0.22, 0.2, 0.13, 0.08, 0.07];

function makeBushes() {
  const out = [];
  for (const [lo, hi, seed, flowers] of [[0x1e3612, 0x5a7c2a, 9, 0], [0x24401a, 0x6f8f3a, 19, 0xf2f0ea], [0x2a3a14, 0x7a7a3a, 29, 0xd86a9a]]) {
    const r = mulberry32(seed);
    const bl = [[0, 0.75, 0, 1.0], ...blobRing(r, 0, 0.55, 0, 5, 0.75, 0.75)];
    const parts = foliage(bl, lo, hi, seed, 0.75);
    if (flowers) for (let k = 0; k < 26; k++) {
      const a = r() * Math.PI * 2, e = r() * 1.1;
      const g = new THREE.IcosahedronGeometry(0.09, 0).translate(Math.cos(a) * (0.6 + r() * 0.6), 0.5 + e, Math.sin(a) * (0.6 + r() * 0.6));
      paint(g, flowers);
      parts.push(g);
    }
    out.push(finishTree(parts));
  }
  return out;
}

// conifers: spruce (many drooping tiers), scots pine (tall bare trunk, flat crown), fir
function makeConifers() {
  const out = [];
  { // spruce
    const parts = [trunkGeo(0.24, 0.1, 3, 0x3f2f22, 0, 2)];
    const r = mulberry32(71);
    for (let k = 0; k < 8; k++) {
      const y = 1.3 + k * 0.78, rad = 2.3 * (1 - k / 8.5) + 0.25, h = 1.5;
      const g = new THREE.ConeGeometry(rad, h, 10, 1, true).toNonIndexed();
      const p = g.attributes.position;
      for (let q = 0; q < p.count; q++) if (p.getY(q) < 0) { const f = 0.8 + r() * 0.4; p.setXYZ(q, p.getX(q) * f, p.getY(q) - r() * 0.3, p.getZ(q) * f); }
      g.translate(0, y + h / 2, 0);
      paintGradient(g, 0x142a18, 0x2f5230, y, y + h);
      parts.push(g);
    }
    parts.push(new THREE.ConeGeometry(0.4, 1.2, 6).translate(0, 8.0, 0));
    paint(parts[parts.length - 1], 0x2f5230);
    out.push(finishTree(parts));
  }
  { // scots pine
    const r = mulberry32(81), bark = 0x8a5a38;
    const parts = [trunkGeo(0.26, 0.14, 6.8, bark, 0.35, 8), branch(0.2, 5.6, 0, 1.4, 6.6, 0.4, 0.09, bark), branch(0.2, 5.9, 0, -1.2, 6.8, -0.3, 0.09, bark)];
    parts.push(...foliage([[0.3, 7.1, 0, 1.3], [1.5, 6.8, 0.4, 0.95], [-1.1, 7.0, -0.3, 1.0], [0.2, 7.8, 0.3, 0.9], [0.6, 6.6, -0.9, 0.8]], 0x1a2e18, 0x3e5a30, 83, 0.55));
    out.push(finishTree(parts));
  }
  { // fir: classic layered cones, jagged edges
    const parts = [trunkGeo(0.2, 0.12, 3, 0x3f2f22, 0, 3)];
    const r = mulberry32(91);
    for (const [y, rad, h] of [[1.8, 2.5, 2.8], [3.2, 2.0, 2.6], [4.5, 1.55, 2.3], [5.7, 1.05, 2.0], [6.8, 0.55, 1.6]]) {
      const g = new THREE.ConeGeometry(rad, h, 9, 2).toNonIndexed();
      const p = g.attributes.position;
      for (let q = 0; q < p.count; q++) { const f = 0.85 + r() * 0.3; p.setXYZ(q, p.getX(q) * f, p.getY(q), p.getZ(q) * f); }
      g.translate(0, y + h / 2 - 0.3, 0);
      paintGradient(g, 0x18301c, 0x3a5c36, y, y + h);
      parts.push(g);
    }
    out.push(finishTree(parts));
  }
  return out;
}

function paint(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
}

function paintGradient(g, lo, hi, y0, y1) {
  const a = new THREE.Color(lo), b = new THREE.Color(hi), c = new THREE.Color();
  const p = g.attributes.position;
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    c.copy(a).lerp(b, clamp((p.getY(i) - y0) / (y1 - y0), 0, 1));
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

function buildLamps(world, group, mats) {
  const n = world.lamps.length;
  const poleG = mergeGeometries([
    new THREE.CylinderGeometry(0.09, 0.14, 7.5, 6).translate(0, 3.75, 0),
    new THREE.BoxGeometry(0.08, 0.08, 2.0).translate(0, 7.4, 1.0),
  ]);
  const headG = new THREE.BoxGeometry(0.45, 0.18, 0.8).translate(0, 7.3, 1.9);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3b3e42, roughness: 0.6, metalness: 0.5 });
  mats.lampHead = new THREE.MeshStandardMaterial({ color: 0x777777, emissive: 0xffc27a, emissiveIntensity: 0 });
  const poles = new THREE.InstancedMesh(poleG, poleMat, n);
  const heads = new THREE.InstancedMesh(headG, mats.lampHead, n);
  const poolTex = TX.radialTexture('rgba(255,200,130,0.75)', 'rgba(255,170,90,0)', 128);
  mats.lampPool = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4 });
  const poolG = new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(poolG, mats.lampPool, n);
  const m4 = new THREE.Matrix4();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), ax = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const lp = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const lampMatrix = (l, out) => {
    qa.setFromAxisAngle(up, l.rot);
    if (l.tilt) {
      ax.set(l.fdz, 0, -l.fdx).normalize();
      qb.setFromAxisAngle(ax, l.tilt);
      qa.premultiply(qb);
    }
    out.compose(lp.set(l.x, l.y, l.z), qa, one);
    return out;
  };
  world.lamps.forEach((l, i) => {
    lampMatrix(l, m4);
    poles.setMatrixAt(i, m4);
    heads.setMatrixAt(i, m4);
    const fx = Math.sin(l.rot) * 1.9, fz = Math.cos(l.rot) * 1.9;
    m4.makeTranslation(l.x + fx, l.y + 0.06, l.z + fz);
    pools.setMatrixAt(i, m4);
  });
  poles.castShadow = true;
  pools.renderOrder = 3;
  group.add(poles, heads, pools);
  return {
    poles, heads, pools,
    update(l) {
      lampMatrix(l, m4);
      poles.setMatrixAt(l.idx, m4);
      heads.setMatrixAt(l.idx, m4);
      poles.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
      if (l.broken) {
        m4.makeScale(0, 0, 0);
        pools.setMatrixAt(l.idx, m4);
        heads.setMatrixAt(l.idx, m4);
        pools.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

function buildTrafficLights(world, group, mats) {
  const list = world.trafficLights;
  const n = list.length;
  const poleG = mergeGeometries([
    new THREE.CylinderGeometry(0.1, 0.13, 5.6, 6).translate(0, 2.8, 0),
    new THREE.BoxGeometry(0.1, 0.1, 5.0).translate(0, 5.5, 2.5),
    new THREE.BoxGeometry(0.45, 1.3, 0.4).translate(0, 4.9, 4.6),
  ]);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.5, metalness: 0.6 });
  const poles = new THREE.InstancedMesh(poleG, poleMat, n);
  const lampG = new THREE.SphereGeometry(0.16, 8, 6);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const bulbs = [0, 1, 2].map(() => new THREE.InstancedMesh(lampG, lampMat, n * 2));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), yA = new THREE.Vector3(0, 1, 0);
  list.forEach((tl, i) => {
    // NW pole (sx=-1) shows the NS axis, its arm points +x. SE pole shows EW, arm points -z.
    tl.axis = tl.sx < 0 ? 0 : 1;
    tl.rot = tl.sx < 0 ? Math.PI / 2 : Math.PI;
    q.setFromAxisAngle(yA, tl.rot);
    m4.compose(v.set(tl.x, tl.y, tl.z), q, one);
    poles.setMatrixAt(i, m4);
    const fx = Math.sin(tl.rot), fz = Math.cos(tl.rot);
    // perpendicular (the head faces traffic on the arm's road)
    const px = fz, pz = -fx;
    for (let k = 0; k < 3; k++) {
      for (let side = 0; side < 2; side++) {
        const s = side ? 1 : -1;
        m4.makeTranslation(tl.x + fx * 4.6 + px * 0.22 * s, tl.y + 5.3 - k * 0.4, tl.z + fz * 4.6 + pz * 0.22 * s);
        bulbs[k].setMatrixAt(i * 2 + side, m4);
      }
    }
  });
  poles.castShadow = true;
  group.add(poles, ...bulbs);
  const cR = new THREE.Color(3, 0.15, 0.08), cY = new THREE.Color(3, 1.6, 0.1), cG = new THREE.Color(0.2, 3, 0.6), off = new THREE.Color(0.06, 0.06, 0.06);
  return {
    update(time) {
      list.forEach((tl, i) => {
        const nd = world.nodes[tl.node];
        const s = tl.broken ? 'X' : world.lightState(nd, tl.axis, time);
        const blink = tl.broken && Math.floor(time * 2) % 2 === 0;
        for (let side = 0; side < 2; side++) {
          bulbs[0].setColorAt(i * 2 + side, s === 'R' ? cR : off);
          bulbs[1].setColorAt(i * 2 + side, s === 'Y' || blink ? cY : off);
          bulbs[2].setColorAt(i * 2 + side, s === 'G' ? cG : off);
        }
      });
      for (const b of bulbs) b.instanceColor.needsUpdate = true;
    },
    knock(tl) {
      tl.broken = true;
      const i = list.indexOf(tl);
      q.setFromEuler(new THREE.Euler(1.2, tl.rot, 0.3, 'YXZ'));
      m4.compose(v.set(tl.x, tl.y, tl.z), q, one);
      poles.setMatrixAt(i, m4);
      poles.instanceMatrix.needsUpdate = true;
      m4.makeScale(0, 0, 0);
      for (const b of bulbs) { b.setMatrixAt(i * 2, m4); b.setMatrixAt(i * 2 + 1, m4); b.instanceMatrix.needsUpdate = true; }
    },
  };
}
