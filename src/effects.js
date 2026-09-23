// 爆発・火花・破片・衝撃波・噴煙。すべて使い回し（プール）で、出し入れのたびにメモリを増やさない
import * as THREE from 'three';

const SPRITES = 110;
const SPARKS = 700;
const DEBRIS = 90;
const RINGS = 8;

export class Effects {
  constructor(g) {
    this.g = g;
    const scene = g.scene;
    const tex = g.tex;

    this.sprites = [];
    for (let i = 0; i < SPRITES; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex.fire, transparent: true, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      s.renderOrder = 2;
      scene.add(s);
      this.sprites.push({ s, mat, life: 0, max: 1, vel: new THREE.Vector3(), size: 1, grow: 1, kind: 'fire', spin: 0, delay: 0, tint: null });
    }
    this.spriteIdx = 0;

    // 火花（1つの点群でまとめて描く）
    this.sparkPos = new Float32Array(SPARKS * 3);
    this.sparkCol = new Float32Array(SPARKS * 3);
    this.sparkVel = new Float32Array(SPARKS * 3);
    this.sparkLife = new Float32Array(SPARKS);
    this.sparkMax = new Float32Array(SPARKS);
    this.sparkHue = new Float32Array(SPARKS);
    this.sparkIdx = 0;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3));
    this.sparks = new THREE.Points(
      sg,
      new THREE.PointsMaterial({
        size: 0.7,
        map: tex.glow,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 3;
    scene.add(this.sparks);

    // 破片
    const hull = g.tex.hull;
    this.debrisMat = new THREE.MeshStandardMaterial({ color: 0x7a7f86, metalness: 0.35, roughness: 0.5, map: hull.map });
    this.hotMat = new THREE.MeshStandardMaterial({
      color: 0x221510,
      emissive: new THREE.Color(1.0, 0.35, 0.08),
      emissiveIntensity: 3,
      roughness: 0.6,
    });
    const geos = [
      new THREE.TetrahedronGeometry(1),
      new THREE.BoxGeometry(1.6, 0.2, 0.9),
      new THREE.BoxGeometry(0.5, 0.5, 1.8),
      new THREE.OctahedronGeometry(0.8),
    ];
    this.debris = [];
    for (let i = 0; i < DEBRIS; i++) {
      const hot = i % 4 === 0;
      const m = new THREE.Mesh(geos[i % geos.length], hot ? this.hotMat : this.debrisMat);
      m.visible = false;
      scene.add(m);
      this.debris.push({ m, vel: new THREE.Vector3(), rot: new THREE.Vector3(), life: 0, max: 1, size: 1, hot });
    }
    this.debrisIdx = 0;

    // 衝撃波リング
    this.rings = [];
    const rg = new THREE.RingGeometry(0.82, 1, 64);
    for (let i = 0; i < RINGS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(rg, mat);
      m.visible = false;
      m.renderOrder = 2;
      scene.add(m);
      this.rings.push({ m, mat, life: 0, max: 1, size: 1, vel: new THREE.Vector3() });
    }
    this.ringIdx = 0;

    // 爆発の閃光で周囲を照らす光
    this.lights = [0, 1].map(() => {
      const l = new THREE.PointLight(0xffa060, 0, 400, 2);
      scene.add(l);
      return { l, peak: 0, life: 0, max: 1 };
    });
    this.lightIdx = 0;

    this.delayed = [];
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._zero = new THREE.Vector3();
  }

  clear() {
    for (const p of this.sprites) { p.life = 0; p.s.visible = false; }
    for (const d of this.debris) { d.life = 0; d.m.visible = false; }
    for (const r of this.rings) { r.life = 0; r.m.visible = false; }
    this.sparkLife.fill(0);
    this.sparkCol.fill(0);
    this.delayed.length = 0;
  }

  sprite(kind, pos, vel, size, grow, life, delay = 0) {
    const p = this.sprites[this.spriteIdx];
    this.spriteIdx = (this.spriteIdx + 1) % SPRITES;
    p.kind = kind;
    p.s.position.copy(pos);
    p.vel.copy(vel);
    p.size = size;
    p.grow = grow;
    p.life = p.max = life;
    p.delay = delay;
    p.spin = (Math.random() - 0.5) * 2;
    p.mat.rotation = Math.random() * Math.PI * 2;
    const tex = this.g.tex;
    if (kind === 'smoke') {
      p.mat.map = tex.smoke;
      p.mat.blending = THREE.NormalBlending;
    } else {
      p.mat.map = kind === 'fire' ? tex.fire : tex.glow;
      p.mat.blending = THREE.AdditiveBlending;
    }
    p.s.visible = delay <= 0;
    p.s.scale.setScalar(size * 0.3);
    return p;
  }

  flash(pos, size, r = 6, gg = 5, b = 4, life = 0.08) {
    const p = this.sprite('flash', pos, this._v.set(0, 0, 0), size, 0.3, life);
    p.tint = [r, gg, b];
    p.mat.color.setRGB(r, gg, b);
    return p;
  }

  puff(pos, vel, size, life = 0.8) {
    const p = this.sprite('smoke', pos, vel, size, 2.2, life);
    p.tint = null;
    return p;
  }

  sparkBurst(pos, baseVel, n, speed, life, hue = 0) {
    for (let i = 0; i < n; i++) {
      const k = this.sparkIdx;
      this.sparkIdx = (this.sparkIdx + 1) % SPARKS;
      const v = this._s.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
      if (v.lengthSq() > 1) v.normalize();
      const sp = speed * (0.3 + Math.random() * 0.9);
      this.sparkPos[k * 3] = pos.x;
      this.sparkPos[k * 3 + 1] = pos.y;
      this.sparkPos[k * 3 + 2] = pos.z;
      this.sparkVel[k * 3] = baseVel.x + v.x * sp;
      this.sparkVel[k * 3 + 1] = baseVel.y + v.y * sp;
      this.sparkVel[k * 3 + 2] = baseVel.z + v.z * sp;
      this.sparkLife[k] = this.sparkMax[k] = life * (0.4 + Math.random() * 0.8);
      this.sparkHue[k] = hue;
    }
  }

  hitSpark(pos, vel) {
    this.sparkBurst(pos, vel || this._zero, 14, 30, 0.45);
    this.flash(pos, 5, 8, 5, 3, 0.07);
  }

  explosion(pos, vel, scale = 1) {
    const g = this.g;
    const v0 = vel ? vel.clone().multiplyScalar(0.5) : new THREE.Vector3();
    const tmp = new THREE.Vector3();
    this.flash(pos, 16 * scale, 14, 12, 10, 0.18);
    const nFire = Math.round(6 + 4 * scale);
    for (let i = 0; i < nFire; i++) {
      tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2.5 * scale);
      const p = this.sprite(
        'fire',
        tmp.clone().add(pos),
        tmp.clone().multiplyScalar(2.2).add(v0),
        (5 + Math.random() * 4) * scale,
        2.6,
        0.7 + Math.random() * 0.6,
        i < 3 ? 0 : Math.random() * 0.25 * scale
      );
      p.tint = null;
    }
    for (let i = 0; i < Math.round(3 + 2 * scale); i++) {
      tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(3 * scale);
      this.sprite('smoke', tmp.clone().add(pos), tmp.clone().multiplyScalar(0.8).add(v0), 7 * scale, 2.4, 2.2 + Math.random(), 0.15);
    }
    this.sparkBurst(pos, v0, Math.min(160, Math.round(60 * scale)), 55 * Math.sqrt(scale), 1.4);
    const nDeb = Math.min(24, Math.round(5 + 5 * scale));
    for (let i = 0; i < nDeb; i++) {
      const d = this.debris[this.debrisIdx];
      this.debrisIdx = (this.debrisIdx + 1) % DEBRIS;
      d.m.position.copy(pos);
      d.vel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(60 * Math.sqrt(scale)).add(v0);
      d.rot.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(12);
      d.size = (0.3 + Math.random() * 0.9) * Math.sqrt(scale);
      d.m.scale.setScalar(d.size);
      d.life = d.max = 2 + Math.random() * 2;
      d.m.visible = true;
    }
    const r = this.rings[this.ringIdx];
    this.ringIdx = (this.ringIdx + 1) % RINGS;
    r.m.position.copy(pos);
    r.vel.copy(v0);
    r.size = 30 * scale;
    r.life = r.max = 0.7;
    r.m.visible = true;
    const L = this.lights[this.lightIdx];
    this.lightIdx = (this.lightIdx + 1) % this.lights.length;
    L.l.position.copy(pos);
    L.peak = 9000 * scale;
    L.life = L.max = 0.5;

    const dist = pos.distanceTo(g.camera.position);
    g.shake = Math.min(1.3, g.shake + Math.min(0.9, (scale * 45) / (dist + 20)));
    g.audio.explosion(scale, dist);
  }

  // 大型艦の最期は連鎖爆発
  chain(pos, vel, scale, count, spread, duration) {
    for (let i = 0; i < count; i++) {
      this.delayed.push({
        t: (i / count) * duration + Math.random() * 0.1,
        pos: pos.clone().add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(spread)),
        vel: vel.clone(),
        scale: scale * (0.6 + Math.random() * 0.6),
      });
    }
  }

  update(dt) {
    if (dt <= 0) return;
    const cam = this.g.camera;

    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const d = this.delayed[i];
      d.t -= dt;
      d.pos.addScaledVector(d.vel, dt);
      if (d.t <= 0) {
        this.delayed.splice(i, 1);
        this.explosion(d.pos, d.vel, d.scale);
      }
    }

    for (const p of this.sprites) {
      if (p.life <= 0) continue;
      if (p.delay > 0) {
        p.delay -= dt;
        p.s.position.addScaledVector(p.vel, dt);
        if (p.delay <= 0) p.s.visible = true;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        continue;
      }
      const t = 1 - p.life / p.max;
      p.s.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.exp(-dt * 1.2));
      p.mat.rotation += p.spin * dt;
      const e = 1 - Math.pow(1 - t, 3);
      p.s.scale.setScalar(p.size * (0.35 + p.grow * e));
      if (p.kind === 'fire') {
        // 白熱 → 橙 → 暗い赤へ
        const k = Math.pow(1 - t, 1.6);
        const r = 7 * k + 0.2 * (1 - t);
        const gg = (6 * Math.pow(1 - t, 3) + 1.3 * k) * 0.9;
        const b = 4 * Math.pow(1 - t, 6) + 0.1 * k;
        p.mat.color.setRGB(r, gg, b);
      } else if (p.kind === 'smoke') {
        p.mat.color.setRGB(0.09, 0.085, 0.08);
        p.mat.opacity = 0.55 * (1 - t) * Math.min(1, t * 6);
      } else {
        const k = 1 - t;
        const c = p.tint || [6, 5, 4];
        p.mat.color.setRGB(c[0] * k, c[1] * k, c[2] * k);
      }
      if (p.kind !== 'smoke') p.mat.opacity = 1;
    }

    const P = this.sparkPos, V = this.sparkVel, C = this.sparkCol, L = this.sparkLife, M = this.sparkMax;
    const drag = Math.exp(-dt * 1.5);
    for (let k = 0; k < SPARKS; k++) {
      if (L[k] <= 0) continue;
      L[k] -= dt;
      const j = k * 3;
      if (L[k] <= 0) {
        C[j] = C[j + 1] = C[j + 2] = 0;
        continue;
      }
      V[j] *= drag; V[j + 1] *= drag; V[j + 2] *= drag;
      P[j] += V[j] * dt; P[j + 1] += V[j + 1] * dt; P[j + 2] += V[j + 2] * dt;
      const t = L[k] / M[k];
      C[j] = 7 * t;
      C[j + 1] = 3.2 * t * t;
      C[j + 2] = 0.9 * t * t * t;
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
    this.sparks.geometry.attributes.color.needsUpdate = true;

    for (const d of this.debris) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.m.visible = false;
        continue;
      }
      d.m.position.addScaledVector(d.vel, dt);
      d.m.rotation.x += d.rot.x * dt;
      d.m.rotation.y += d.rot.y * dt;
      d.m.rotation.z += d.rot.z * dt;
      const fade = Math.min(1, d.life / 0.5);
      d.m.scale.setScalar(d.size * fade);
    }

    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.m.visible = false;
        continue;
      }
      const t = 1 - r.life / r.max;
      r.m.position.addScaledVector(r.vel, dt);
      r.m.quaternion.copy(cam.quaternion);
      r.m.scale.setScalar(r.size * (0.1 + (1 - Math.pow(1 - t, 2.5))));
      const k = Math.pow(1 - t, 2);
      r.mat.color.setRGB(2.2 * k, 1.8 * k, 1.5 * k);
    }

    this.hotMat.emissiveIntensity = 2.5 + Math.random() * 1.2;

    for (const Lt of this.lights) {
      if (Lt.life <= 0) {
        Lt.l.intensity = 0;
        continue;
      }
      Lt.life -= dt;
      const t = Math.max(0, Lt.life / Lt.max);
      Lt.l.intensity = Lt.peak * t * t;
    }
  }
}
