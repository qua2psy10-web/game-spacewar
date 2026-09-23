// 武器：自機のレーザー（左右交互）、ロックオンと追尾ミサイル、敵のレーザー
import * as THREE from 'three';

const P_BOLTS = 70;
const E_BOLTS = 100;
const P_MISSILES = 8;
const FIRE_RATE = 10;
const HEAT_PER_SHOT = 0.06;
const LOCK_TIME = 0.65;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// 線分と球の当たり判定（高速な弾のすり抜けを防ぐ）
function segHitsSphere(a, b, c, r, out) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
  const ab2 = abx * abx + aby * aby + abz * abz;
  let t = ab2 > 0 ? (acx * abx + acy * aby + acz * abz) / ab2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + abx * t, py = a.y + aby * t, pz = a.z + abz * t;
  const dx = c.x - px, dy = c.y - py, dz = c.z - pz;
  if (dx * dx + dy * dy + dz * dz <= r * r) {
    if (out) out.set(px, py, pz);
    return true;
  }
  return false;
}

export class Weapons {
  constructor(g) {
    this.g = g;
    const scene = g.scene;
    const pGeo = new THREE.CylinderGeometry(0.09, 0.09, 8, 6, 1, true).rotateX(Math.PI / 2);
    const pMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(10, 1.6, 0.6) });
    const pGlowGeo = new THREE.CylinderGeometry(0.28, 0.28, 9, 8, 1, true).rotateX(Math.PI / 2);
    const pGlowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.6, 0.2, 0.08),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.pBolts = [];
    for (let i = 0; i < P_BOLTS; i++) {
      const m = new THREE.Mesh(pGeo, pMat);
      m.add(new THREE.Mesh(pGlowGeo, pGlowMat));
      m.visible = false;
      scene.add(m);
      this.pBolts.push({ m, vel: new THREE.Vector3(), prev: new THREE.Vector3(), life: 0 });
    }
    const eGeo = new THREE.CylinderGeometry(0.17, 0.17, 6, 6, 1, true).rotateX(Math.PI / 2);
    const eMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 8, 1.8) });
    const eGlowGeo = new THREE.CylinderGeometry(0.45, 0.45, 7, 8, 1, true).rotateX(Math.PI / 2);
    const eGlowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.1, 1.3, 0.3),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.eBolts = [];
    for (let i = 0; i < E_BOLTS; i++) {
      const m = new THREE.Mesh(eGeo, eMat);
      m.add(new THREE.Mesh(eGlowGeo, eGlowMat));
      m.visible = false;
      scene.add(m);
      this.eBolts.push({ m, vel: new THREE.Vector3(), prev: new THREE.Vector3(), life: 0 });
    }

    // 自機のミサイル
    const hull = g.tex.hull;
    const body = new THREE.MeshStandardMaterial({ color: 0xd8dce0, metalness: 0.3, roughness: 0.4, map: hull.map });
    const bodyGeo = new THREE.CylinderGeometry(0.2, 0.2, 2.4, 10).rotateX(Math.PI / 2);
    const noseGeo = new THREE.ConeGeometry(0.2, 0.6, 10).rotateX(Math.PI / 2).translate(0, 0, 1.5);
    const finGeo = new THREE.BoxGeometry(1.0, 0.04, 0.45).translate(0, 0, -1.0);
    const exMat = new THREE.SpriteMaterial({
      map: g.tex.glow,
      color: new THREE.Color(8, 6, 3.5),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.pMissiles = [];
    for (let i = 0; i < P_MISSILES; i++) {
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(bodyGeo, body), new THREE.Mesh(noseGeo, body), new THREE.Mesh(finGeo, body));
      const fin2 = new THREE.Mesh(finGeo, body);
      fin2.rotation.z = Math.PI / 2;
      grp.add(fin2);
      const ex = new THREE.Sprite(exMat);
      ex.position.z = -1.5;
      ex.scale.setScalar(2.2);
      grp.add(ex);
      grp.visible = false;
      scene.add(grp);
      this.pMissiles.push({ grp, ex, vel: new THREE.Vector3(), target: null, life: 0, speed: 0, puffT: 0 });
    }

    this.cooldown = 0;
    this.gun = 1;
    this.lockTarget = null;
    this.lockProgress = 0;
    this.locked = false;
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._c = new THREE.Vector3();
    this._hit = new THREE.Vector3();
    this._ndc = new THREE.Vector3();
  }

  clear() {
    for (const b of this.pBolts) { b.life = 0; b.m.visible = false; }
    for (const b of this.eBolts) { b.life = 0; b.m.visible = false; }
    for (const m of this.pMissiles) { m.life = 0; m.grp.visible = false; }
    this.lockTarget = null;
    this.lockProgress = 0;
    this.locked = false;
  }

  firePlayer() {
    const g = this.g;
    const cam = g.camera;
    const b = this.pBolts.find((x) => x.life <= 0);
    if (!b) return;
    this.gun = -this.gun;
    const muzzle = cam.localToWorld(this._a.set(this.gun * 1.7, -1.15, -2.6));
    const conv = cam.localToWorld(this._b.set(0, 0, -380));
    const dir = this._c.subVectors(conv, muzzle).normalize();
    b.m.position.copy(muzzle).addScaledVector(dir, 4);
    b.prev.copy(muzzle);
    b.vel.copy(dir).multiplyScalar(950);
    b.m.quaternion.setFromUnitVectors(Z_AXIS, dir);
    b.life = 1.2;
    b.m.visible = true;
    g.effects.flash(muzzle.addScaledVector(dir, 0.5), 1.6, 9, 3, 1.5, 0.05);
    g.cockpit.flashMuzzle();
    g.audio.laser(this.gun * 0.5);
  }

  spawnEnemyBolt(pos, vel) {
    const b = this.eBolts.find((x) => x.life <= 0);
    if (!b) return;
    b.m.position.copy(pos);
    b.prev.copy(pos);
    b.vel.copy(vel);
    this._c.copy(vel).normalize();
    b.m.quaternion.setFromUnitVectors(Z_AXIS, this._c);
    b.life = 5;
    b.m.visible = true;
  }

  fireMissile() {
    const g = this.g;
    const p = g.player;
    if (p.missiles <= 0 || !this.locked || !this.lockTarget || this.lockTarget.removed) {
      g.audio.denied();
      return;
    }
    const m = this.pMissiles.find((x) => x.life <= 0);
    if (!m) return;
    const cam = g.camera;
    p.missiles--;
    const start = cam.localToWorld(this._a.set(0, -1.6, -2.5));
    const fwd = cam.getWorldDirection(this._b);
    m.grp.position.copy(start);
    m.speed = 110;
    m.vel.copy(fwd).multiplyScalar(m.speed);
    m.vel.y -= 12;
    m.target = this.lockTarget;
    m.life = 6;
    m.puffT = 0;
    m.grp.visible = true;
    g.audio.missileLaunch(1);
  }

  // 照準の近くにいる敵を捕捉し、一定時間重ねるとロックオン
  updateLock(dt) {
    const g = this.g;
    const cam = g.camera;
    const aspect = cam.aspect;
    const scoreOf = (e) => {
      if (e.removed || !e.mesh.visible || e.type === 'missile') return Infinity;
      const dist = e.pos.distanceTo(cam.position);
      if (dist > 1100 || e.pos.z > cam.position.z - 15) return Infinity;
      const n = this._ndc.copy(e.pos).project(cam);
      if (n.z > 1) return Infinity;
      return Math.hypot(n.x * aspect, n.y);
    };
    let keep = false;
    if (this.lockTarget && !this.lockTarget.removed) {
      const d = scoreOf(this.lockTarget);
      keep = this.locked ? d < 0.55 : d < 0.28;
    }
    if (!keep) {
      let best = null, bestD = 0.24;
      for (const e of g.enemies.list) {
        const d = scoreOf(e);
        if (d < bestD) { bestD = d; best = e; }
      }
      if (best !== this.lockTarget) {
        this.lockTarget = best;
        this.lockProgress = 0;
        this.locked = false;
      }
    }
    if (this.lockTarget) {
      const before = this.lockProgress;
      this.lockProgress = Math.min(1, this.lockProgress + dt / LOCK_TIME);
      if (!this.locked && this.lockProgress >= 1) {
        this.locked = true;
        g.audio.lockOn();
      } else if (!this.locked && Math.floor(before * 5) !== Math.floor(this.lockProgress * 5)) {
        g.audio.lockTick();
      }
    } else {
      this.locked = false;
      this.lockProgress = 0;
    }
  }

  update(dt) {
    const g = this.g;
    const p = g.player;
    if (dt <= 0) return;
    this.cooldown -= dt;
    const active = g.state === 'playing' && !p.dead;
    if (active) {
      if (g.input.fireHeld && !p.overheated && this.cooldown <= 0) {
        this.firePlayer();
        this.cooldown = 1 / FIRE_RATE;
        p.heat += HEAT_PER_SHOT;
        if (p.heat >= 1) {
          p.heat = 1;
          p.overheated = true;
          g.audio.overheat();
        }
      }
      this.updateLock(dt);
      if (g.input.consumeMissile()) this.fireMissile();
    } else {
      g.input.consumeMissile();
      this.locked = false;
      this.lockTarget = null;
    }

    const enemies = g.enemies.list;
    for (const b of this.pBolts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.prev.copy(b.m.position);
      b.m.position.addScaledVector(b.vel, dt);
      if (b.life <= 0) {
        b.m.visible = false;
        continue;
      }
      for (const e of enemies) {
        if (e.removed || !e.mesh.visible) continue;
        if (segHitsSphere(b.prev, b.m.position, e.pos, e.def.radius * 1.12, this._hit)) {
          g.enemies.damage(e, 1, this._hit);
          b.life = 0;
          b.m.visible = false;
          break;
        }
      }
    }

    for (const b of this.eBolts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.prev.copy(b.m.position);
      b.m.position.addScaledVector(b.vel, dt);
      if (b.life <= 0 || b.m.position.z > 40) {
        b.life = 0;
        b.m.visible = false;
        continue;
      }
      if (!p.dead && g.state === 'playing' && segHitsSphere(b.prev, b.m.position, p.pos, 2.1, this._hit)) {
        b.life = 0;
        b.m.visible = false;
        g.effects.hitSpark(this._hit.lerp(g.camera.position, 0.3));
        p.damage(11);
      }
    }

    for (const m of this.pMissiles) {
      if (m.life <= 0) continue;
      m.life -= dt;
      const pos = m.grp.position;
      const t = m.target;
      m.speed = Math.min(430, m.speed + 520 * dt);
      const dir = this._a.copy(m.vel).normalize();
      if (t && !t.removed) {
        const want = this._b.copy(t.pos).addScaledVector(t.vel, 0.15).sub(pos).normalize();
        dir.lerp(want, Math.min(1, 5 * dt)).normalize();
      }
      m.vel.copy(dir).multiplyScalar(m.speed);
      this._c.copy(pos);
      pos.addScaledVector(m.vel, dt);
      m.grp.quaternion.setFromUnitVectors(Z_AXIS, dir);
      m.ex.scale.setScalar(2 + Math.random() * 0.8);
      m.puffT -= dt;
      if (m.puffT <= 0) {
        m.puffT = 0.025;
        g.effects.puff(this._b.copy(dir).multiplyScalar(-1.6).add(pos), this._hit.set(0, 0, g.S * 0.5), 1.0, 1.3);
      }
      let hit = false;
      if (t && !t.removed && segHitsSphere(this._c, pos, t.pos, t.def.radius, this._hit)) {
        g.enemies.damage(t, 12, this._hit);
        if (!t.removed) g.effects.explosion(this._hit, t.vel, 0.6);
        hit = true;
      }
      if (hit || m.life <= 0) {
        if (!hit) g.effects.explosion(pos, m.vel.multiplyScalar(0.2), 0.5);
        m.life = 0;
        m.grp.visible = false;
      }
    }
  }
}
