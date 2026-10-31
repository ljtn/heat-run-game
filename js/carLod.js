// Far-away cars are drawn as one merged, vertex-coloured mesh instead of ~100 separate parts.
import * as THREE from 'three';
import { mergeGeometries } from '../lib/addons/utils/BufferGeometryUtils.js';

const cache = new Map();
const lodMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 });
const _inv = new THREE.Matrix4(), _m = new THREE.Matrix4(), _c = new THREE.Color();

export function carLodGeometry(v) {
  const key = v.type + '|' + v.scheme + '|' + v.car.paintHex;
  if (cache.has(key)) return cache.get(key);
  const root = v.root;
  root.updateWorldMatrix(true, true);
  _inv.copy(root.matrixWorld).invert();
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.visible || o === v.lod) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!mat || mat.transparent && mat.opacity < 0.3) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    const keep = new THREE.BufferGeometry();
    keep.setAttribute('position', g.attributes.position);
    if (g.attributes.normal) keep.setAttribute('normal', g.attributes.normal); else keep.computeVertexNormals();
    _m.multiplyMatrices(_inv, o.matrixWorld);
    keep.applyMatrix4(_m);
    // bake the material colour (and any glow) into vertex colours
    _c.copy(mat.color || _c.set(1, 1, 1));
    if (mat.emissive && mat.emissiveIntensity > 0.5) _c.add(mat.emissive.clone().multiplyScalar(0.4));
    const n = keep.attributes.position.count, col = new Float32Array(n * 3), src = g.attributes.color;
    for (let i = 0; i < n; i++) {
      const r = src ? src.getX(i) : 1, gg = src ? src.getY(i) : 1, b = src ? src.getZ(i) : 1;
      col[i * 3] = _c.r * r; col[i * 3 + 1] = _c.g * gg; col[i * 3 + 2] = _c.b * b;
    }
    keep.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(keep);
  });
  const geo = mergeGeometries(parts);
  cache.set(key, geo);
  return geo;
}

// swap between the detailed model and the single-mesh stand-in
export function setCarLod(v, far) {
  if (!!v.lodOn === far) return;
  if (far && !v.lod) {
    v.lod = new THREE.Mesh(carLodGeometry(v), lodMat);
    v.root.add(v.lod);
  }
  for (const ch of v.root.children) ch.visible = ch === v.lod ? far : !far;
  v.lodOn = far;
}
