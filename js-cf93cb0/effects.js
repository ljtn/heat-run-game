// Particles (smoke, dust, sparks, splashes) and skid marks
import * as THREE from 'three';
import { smokeTexture, radialTexture } from './textures.js';
import { SURF, SURF_DUST } from './world.js';

const VERT = `
attribute float size;
attribute float alpha;
attribute vec3 tint;
varying float vAlpha;
varying vec3 vTint;
uniform float uScale;
#include <fog_pars_vertex>
void main() {
  vAlpha = alpha;
  vTint = tint;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.1, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = `
uniform sampler2D map;
uniform vec3 uLight;
varying float vAlpha;
varying vec3 vTint;
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vTint * uLight, t.a * vAlpha);
  #include <fog_fragment>
}`;

class ParticleSystem {
  constructor(scene, max, tex, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.tint = new Float32Array(max * 3);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: tex }, uScale: { value: 400 }, uLight: { value: new THREE.Color(1, 1, 1) } }]),
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mat.uniforms.map.value = tex;
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, size, grow, life, alpha, r, g, b, drag = 1.5, grav = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.size[i] = size; this.grow[i] = grow; this.life[i] = life; this.age[i] = 0;
    this.a0[i] = alpha; this.alpha[i] = alpha;
    this.tint[i * 3] = r; this.tint[i * 3 + 1] = g; this.tint[i * 3 + 2] = b;
    this.drag[i] = drag; this.grav[i] = grav;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.alpha[i] <= 0) continue;
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) { this.alpha[i] = 0; continue; }
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const fadeIn = Math.min(1, t * 8);
      this.alpha[i] = this.a0[i] * fadeIn * (1 - t) * (1 - t) + 1e-6;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
    g.attributes.tint.needsUpdate = true;
  }
}

class SkidMarks {
  constructor(scene, max = 4000) {
    this.max = max;
    this.pos = new Float32Array(max * 4 * 3);
    this.col = new Float32Array(max * 4 * 4);
    const idx = new Uint32Array(max * 6);
    for (let q = 0; q < max; q++) {
      idx[q * 6] = q * 4; idx[q * 6 + 1] = q * 4 + 2; idx[q * 6 + 2] = q * 4 + 1;
      idx[q * 6 + 3] = q * 4 + 1; idx[q * 6 + 4] = q * 4 + 2; idx[q * 6 + 5] = q * 4 + 3;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.next = 0;
    this.dirtyFrom = 0; this.dirty = false;
  }
  add(ax, ay, az, bx, by, bz, rx, rz, w, a0, a1, r, g, b) {
    const q = this.next;
    this.next = (this.next + 1) % this.max;
    const P = this.pos, k = q * 12;
    P[k] = ax - rx * w; P[k + 1] = ay; P[k + 2] = az - rz * w;
    P[k + 3] = ax + rx * w; P[k + 4] = ay; P[k + 5] = az + rz * w;
    P[k + 6] = bx - rx * w; P[k + 7] = by; P[k + 8] = bz - rz * w;
    P[k + 9] = bx + rx * w; P[k + 10] = by; P[k + 11] = bz + rz * w;
    const C = this.col, c = q * 16;
    for (let v = 0; v < 4; v++) {
      C[c + v * 4] = r; C[c + v * 4 + 1] = g; C[c + v * 4 + 2] = b; C[c + v * 4 + 3] = v < 2 ? a0 : a1;
    }
    this.dirty = true;
  }
  flush() {
    if (!this.dirty) return;
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
    this.dirty = false;
  }
}

const _v = new THREE.Vector3();

export class Effects {
  constructor(scene) {
    this.smoke = new ParticleSystem(scene, 2400, smokeTexture(), false);
    this.sparks = new ParticleSystem(scene, 600, radialTexture('rgba(255,255,255,1)', 'rgba(255,200,120,0)', 32, 0.2), true);
    this.skids = new SkidMarks(scene);
    this.trails = new WeakMap();
    this.light = 1;
  }

  setLight(c) {
    this.smoke.mat.uniforms.uLight.value.copy(c);
  }

  setScale(h) {
    this.smoke.mat.uniforms.uScale.value = h;
    this.sparks.mat.uniforms.uScale.value = h;
  }

  burstSparks(x, y, z, nx, nz, strength) {
    const n = Math.min(40, 4 + strength * 3);
    for (let i = 0; i < n; i++) {
      const s = 3 + Math.random() * 7 * Math.min(2, strength * 0.3 + 0.5);
      this.sparks.emit(x, y, z, nx * s * 0.6 + (Math.random() - 0.5) * s, Math.random() * s * 0.8, nz * s * 0.6 + (Math.random() - 0.5) * s,
        0.25 + Math.random() * 0.2, -0.2, 0.25 + Math.random() * 0.45, 1, 1.0, 0.65 + Math.random() * 0.3, 0.3, 0.8, 9.8);
    }
  }

  debris(x, y, z, r, g, b, n = 10) {
    for (let i = 0; i < n; i++) {
      this.smoke.emit(x + (Math.random() - 0.5), y + Math.random(), z + (Math.random() - 0.5), (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4,
        0.6 + Math.random(), 2.5, 1.2 + Math.random(), 0.5, r, g, b, 2.0, 0);
    }
  }

  splash(x, y, z, speed) {
    const n = Math.min(30, 4 + speed * 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * speed * 0.3;
      this.smoke.emit(x, y, z, Math.cos(a) * s, 2 + Math.random() * speed * 0.35, Math.sin(a) * s, 0.8 + Math.random(), 2.2, 0.9 + Math.random() * 0.6, 0.7, 0.85, 0.92, 1.0, 0.6, 9.8);
    }
  }

  // tyre smoke, dust and skid marks for one vehicle
  vehicle(v, dt, near) {
    let tr = this.trails.get(v);
    if (!tr) { tr = v.wheels.map(() => ({ x: 0, y: 0, z: 0, on: false, emitAcc: 0 })); this.trails.set(v, tr); }
    for (let i = 0; i < 4; i++) {
      const w = v.wheels[i], t = tr[i];
      if (!w.contact) { t.on = false; continue; }
      const cp = w.contactPos;
      const slip = w.slip;
      const paved = w.surface === SURF.ASPHALT || w.surface === SURF.CONCRETE;
      const speed = v.vel.length();
      const dust = SURF_DUST[w.surface];
      // skid marks
      const marking = paved ? slip > 3.2 : (speed > 2 && dust > 0);
      if (marking && near) {
        const y = cp.y + (paved ? 0.1 : 0.06);
        if (t.on) {
          const dx = cp.x - t.x, dz = cp.z - t.z;
          const d2 = dx * dx + dz * dz;
          if (d2 > 0.6 * 0.6) {
            const l = Math.sqrt(d2);
            const rx = -dz / l, rz = dx / l;
            const a = paved ? Math.min(0.65, (slip - 3) * 0.08) : Math.min(0.4, 0.1 + slip * 0.05);
            const col = paved ? [0.02, 0.02, 0.02] : w.surface === SURF.SAND ? [0.35, 0.3, 0.2] : w.surface === SURF.SNOW ? [0.55, 0.58, 0.62] : [0.12, 0.09, 0.05];
            if (d2 < 9) this.skids.add(t.x, t.y, t.z, cp.x, y, cp.z, rx, rz, v.spec.wheelW * 0.45, a, a, ...col);
            t.x = cp.x; t.y = y; t.z = cp.z;
          }
        } else { t.on = true; t.x = cp.x; t.y = y; t.z = cp.z; }
      } else t.on = false;
      // smoke / dust
      if (!near) continue;
      let rate = 0, r = 0.85, g = 0.85, b = 0.85, alpha = 0.35, size = 1.2;
      if (paved && slip > 4.5) { rate = Math.min(40, (slip - 4.5) * 5); alpha = Math.min(0.5, 0.12 + (slip - 4.5) * 0.03); }
      else if (!paved && dust > 0 && speed > 3) {
        rate = Math.min(30, (speed * 0.6 + slip * 2) * dust);
        r = 0.62; g = 0.53; b = 0.4; alpha = 0.28 * dust; size = 1.5;
        if (w.surface === SURF.GRASS) { r = 0.45; g = 0.42; b = 0.3; alpha *= 0.6; }
        else if (w.surface === SURF.SNOW) { r = 0.95; g = 0.97; b = 1.0; alpha = 0.45 * dust; }
      }
      t.emitAcc += rate * dt;
      while (t.emitAcc >= 1) {
        t.emitAcc -= 1;
        this.smoke.emit(cp.x + (Math.random() - 0.5) * 0.4, cp.y + 0.3, cp.z + (Math.random() - 0.5) * 0.4,
          v.vel.x * 0.15 + (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 1.2, v.vel.z * 0.15 + (Math.random() - 0.5) * 1.5,
          size, 2.6 + Math.random() * 1.5, 1.6 + Math.random() * 1.6, alpha, r, g, b, 1.2, -0.25);
      }
    }
    // fire under the hood when the car is nearly wrecked
    if (near && v.damage > 0.82) {
      v.forward(_v);
      tr.fire = (tr.fire || 0) + dt * (14 + (v.damage - 0.82) * 60);
      while (tr.fire >= 1) {
        tr.fire -= 1;
        this.sparks.emit(v.pos.x + _v.x * (v.hz * 0.6) + (Math.random() - 0.5) * 0.8, v.pos.y + 0.5, v.pos.z + _v.z * (v.hz * 0.6) + (Math.random() - 0.5) * 0.8,
          v.vel.x * 0.4 + (Math.random() - 0.5) * 0.6, 1.5 + Math.random() * 1.5, v.vel.z * 0.4 + (Math.random() - 0.5) * 0.6,
          0.7 + Math.random() * 0.5, -0.6, 0.35 + Math.random() * 0.3, 0.9, 1.0, 0.45 + Math.random() * 0.25, 0.1, 1.2, -1.5);
      }
    }
    // damage smoke from the engine bay
    if (near && v.damage > 0.45) {
      v.forward(_v);
      const k = (v.damage - 0.45) * 2;
      tr.eng = (tr.eng || 0) + dt * (4 + k * 18);
      while (tr.eng >= 1) {
        tr.eng -= 1;
        const dark = v.damage > 0.8 ? 0.15 : 0.6;
        this.smoke.emit(v.pos.x + _v.x * (v.hz * 0.7), v.pos.y + 0.6, v.pos.z + _v.z * (v.hz * 0.7),
          v.vel.x * 0.5 + (Math.random() - 0.5), 1.5 + Math.random(), v.vel.z * 0.5 + (Math.random() - 0.5),
          0.8, 2.2, 1.8, 0.45, dark, dark, dark, 1.5, -0.6);
      }
    }
  }

  update(dt) {
    this.smoke.update(dt);
    this.sparks.update(dt);
    this.skids.flush();
  }
}
