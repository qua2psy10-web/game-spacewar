// 敵：偵察機・戦闘機・重爆撃機・誘導ミサイル。形はすべてコードで組み立てる
import * as THREE from 'three';

// scale は見やすさのための拡大率（当たり判定の radius は拡大後の大きさ）
export const TYPES = {
  scout: { hp: 1, radius: 6.3, scale: 1.4, score: 100, name: 'SCOUT' },
  fighter: { hp: 3, radius: 9.2, scale: 1.45, score: 250, name: 'FIGHTER' },
  bomber: { hp: 40, radius: 30, scale: 1.45, score: 2000, name: 'BOMBER' },
  missile: { hp: 1, radius: 3.3, scale: 1.2, score: 50, name: 'MISSILE' },
};

const ZERO = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// ---------- 形状づくり ----------
function extrudeXZ(points, thickness) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateX(Math.PI / 2); // 形の y を機首方向（+Z）へ
  return geo;
}

function glowSprite(tex, r, g, b, scale, kind) {
  const m = new THREE.SpriteMaterial({
    map: tex,
    color: new THREE.Color(r, g, b),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(scale);
  s.userData.kind = kind;
  s.userData.base = scale;
  return s;
}

function at(obj, x, y, z) {
  obj.position.set(x, y, z);
  return obj;
}

function buildModels(g) {
  const hull = g.tex.hull;
  const glow = g.tex.glow;
  const M = {
    hull: new THREE.MeshStandardMaterial({ color: 0xa3a9b1, metalness: 0.35, roughness: 0.45, map: hull.map, bumpMap: hull.bump, bumpScale: 0.8 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x4a4f57, metalness: 0.3, roughness: 0.5, map: hull.map, bumpMap: hull.bump, bumpScale: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x06080c, metalness: 0.95, roughness: 0.06 }),
    red: new THREE.MeshStandardMaterial({ color: 0x8e2018, metalness: 0.4, roughness: 0.5, map: hull.map }),
    nozzle: new THREE.MeshStandardMaterial({
      color: 0x15171a, metalness: 0.9, roughness: 0.3, emissive: new THREE.Color(0.25, 0.4, 1.0), emissiveIntensity: 1.2, side: THREE.DoubleSide,
    }),
    nozzleHot: new THREE.MeshStandardMaterial({
      color: 0x15171a, metalness: 0.9, roughness: 0.3, emissive: new THREE.Color(1.0, 0.45, 0.15), emissiveIntensity: 1.6, side: THREE.DoubleSide,
    }),
  };
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  };
  const cyl = (rt, rb, len, seg = 10, open = false) => {
    const c = new THREE.CylinderGeometry(rt, rb, len, seg, 1, open);
    c.rotateX(Math.PI / 2); // 上面（rt）が +Z
    return c;
  };
  const blink = new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(8, 0.4, 0.25), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const strobe = new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(8, 8, 9), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const light = (mat, scale, x, y, z) => {
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(scale);
    s.position.set(x, y, z);
    return s;
  };

  // 偵察機：細身の矢じり形
  const scout = new THREE.Group();
  scout.add(mesh(cyl(0.22, 0.95, 7.5, 10), M.hull));
  const scWing = extrudeXZ([[0.2, 1.2], [4.3, -2.6], [3.9, -3.3], [0.2, -3.3]], 0.16);
  for (const sx of [-1, 1]) {
    const w = mesh(scWing, M.dark, 0, -0.1, 0);
    w.scale.x = sx;
    w.rotation.z = sx * -0.32;
    scout.add(w);
  }
  const scFin = mesh(new THREE.BoxGeometry(0.12, 1.5, 2.0), M.hull, 0, 0.85, -2.5);
  scFin.rotation.x = -0.35;
  scout.add(scFin);
  const scCan = mesh(new THREE.SphereGeometry(0.55, 16, 10), M.glass, 0, 0.42, 0.9);
  scCan.scale.set(0.75, 0.6, 1.9);
  scout.add(scCan);
  scout.add(mesh(extrudeXZ([[3.0, -2.3], [3.8, -3.2], [2.6, -3.2]], 0.2), M.red, 0, -0.05, 0));
  scout.add(mesh(extrudeXZ([[-3.0, -2.3], [-3.8, -3.2], [-2.6, -3.2]], 0.2), M.red, 0, -0.05, 0));
  scout.add(mesh(cyl(0.72, 0.85, 0.9, 12, true), M.nozzle, 0, 0, -3.9));
  scout.add(at(glowSprite(glow, 1.6, 2.4, 6.5, 3.4, 'engine'), 0, 0, -4.4));
  scout.add(at(glowSprite(glow, 5, 6, 9, 1.3, 'engine'), 0, 0, -4.2));
  scout.add(light(blink, 0.9, 3.8, -1.3, -2.9), light(blink, 0.9, -3.8, -1.3, -2.9));
  scout.add(at(glowSprite(glow, 7, 0.9, 0.35, 1.1, 'eye'), 0, 0, 3.85));

  // 戦闘機：前進翼と翼端の砲
  const fighter = new THREE.Group();
  fighter.add(mesh(cyl(0.45, 1.3, 9.5, 8), M.hull));
  fighter.add(mesh(new THREE.BoxGeometry(2.8, 1.1, 5), M.dark, 0, 0, -2.2));
  const wing = extrudeXZ([[0.9, 1.2], [6.4, 2.6], [6.4, 1.0], [0.9, -2.8]], 0.22);
  const tip = new THREE.Vector3();
  for (const sx of [-1, 1]) {
    for (const up of [-1, 1]) {
      const wg = new THREE.Group();
      wg.rotation.z = sx * up * 0.42;
      const w = mesh(wing, M.dark);
      w.scale.set(sx, 1, 1);
      wg.add(w);
      wg.add(mesh(cyl(0.3, 0.34, 3.6, 10), M.hull, sx * 6.4, 0, 1.4));
      wg.add(mesh(cyl(0.1, 0.1, 1.6, 6), M.dark, sx * 6.4, 0, 3.9));
      wg.add(mesh(new THREE.BoxGeometry(1.8, 0.06, 0.7), M.red, sx * 3.6, 0.14 * up, 0.4));
      fighter.add(wg);
      if (up === 1) tip.set(sx * 6.4, 0, 4.8).applyEuler(wg.rotation);
    }
    fighter.add(mesh(cyl(0.55, 0.65, 0.7, 12, true), M.nozzle, sx * 0.75, 0, -4.9));
    fighter.add(at(glowSprite(glow, 1.6, 2.4, 6.5, 3.0, 'engine'), sx * 0.75, 0, -5.4));
    fighter.add(light(blink, 0.9, tip.x, tip.y + 0.5, -0.4));
  }
  fighter.add(at(glowSprite(glow, 7, 0.9, 0.35, 1.3, 'eye'), 0, 0.1, 4.85));
  const fCan = mesh(new THREE.SphereGeometry(0.7, 16, 10), M.glass, 0, 0.72, 1.7);
  fCan.scale.set(0.8, 0.6, 1.8);
  fighter.add(fCan);
  const fFin = mesh(new THREE.BoxGeometry(0.14, 1.8, 2.2), M.hull, 0, 1.1, -3.4);
  fFin.rotation.x = -0.4;
  fighter.add(fFin);

  // 重爆撃機：大きな船体、4基のエンジン、後方を守る砲塔
  const bomber = new THREE.Group();
  const hex = new THREE.Shape();
  [[-7.5, 0], [-5, 3.6], [5, 3.6], [7.5, 0], [5, -3.2], [-5, -3.2]].forEach((p, i) => (i ? hex.lineTo(p[0], p[1]) : hex.moveTo(p[0], p[1])));
  hex.closePath();
  const hullGeo = new THREE.ExtrudeGeometry(hex, { depth: 40, bevelEnabled: true, bevelSize: 0.4, bevelThickness: 0.4, bevelSegments: 1, steps: 8 });
  hullGeo.translate(0, 0, -20);
  const hp = hullGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const z = hp.getZ(i);
    if (z > 6) {
      const k = 1 - ((z - 6) / 15) * 0.6;
      hp.setX(i, hp.getX(i) * k);
      hp.setY(i, hp.getY(i) * (0.4 + 0.6 * k));
    }
  }
  hullGeo.computeVertexNormals();
  bomber.add(mesh(hullGeo, M.hull));
  const bw = extrudeXZ([[6, 6], [22, -11], [22, -16], [6, -16]], 0.8);
  const bwl = mesh(bw, M.dark);
  const bwr = mesh(bw, M.dark);
  bwr.scale.x = -1;
  bomber.add(bwl, bwr);
  bomber.add(mesh(new THREE.BoxGeometry(5, 3.4, 8), M.dark, 0, 5.2, -7));
  bomber.add(mesh(new THREE.BoxGeometry(3.2, 1.2, 2.2), M.glass, 0, 6.1, -2.8));
  bomber.add(mesh(cyl(0.08, 0.08, 6, 4), M.dark, 1.5, 7.4, -9));
  const ant = mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 4), M.dark, -1.2, 8.4, -8);
  bomber.add(ant);
  const rng = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const greeble = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 46; i++) {
    const w = 0.5 + rng() * 2.5, h = 0.3 + rng() * 1.2, d = 0.5 + rng() * 3;
    const b = mesh(greeble, rng() < 0.6 ? M.dark : M.hull, (rng() - 0.5) * 9, 3.6 + h / 2, (rng() - 0.5) * 22 - 6);
    b.scale.set(w, h, d);
    bomber.add(b);
  }
  for (const sx of [-1, 1]) {
    bomber.add(mesh(new THREE.BoxGeometry(2.4, 0.1, 10), M.red, sx * 14, 0.45, -9));
    for (const ex of [3.2, 9.5]) {
      bomber.add(mesh(cyl(1.5, 1.6, 7, 14), M.dark, sx * ex, ex > 5 ? 0 : -0.5, -18));
      bomber.add(mesh(cyl(1.35, 1.6, 1.2, 14, true), M.nozzleHot, sx * ex, ex > 5 ? 0 : -0.5, -21.8));
      bomber.add(at(glowSprite(glow, 4, 1.8, 0.7, 3.4, 'engine'), sx * ex, ex > 5 ? 0 : -0.5, -22.8));
      bomber.add(at(glowSprite(glow, 7, 5.5, 4, 1.9, 'engine'), sx * ex, ex > 5 ? 0 : -0.5, -22.4));
    }
    const tur = mesh(new THREE.SphereGeometry(1.2, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.hull, sx * 4, 3.8, -13);
    bomber.add(tur);
    bomber.add(mesh(cyl(0.18, 0.18, 3, 6), M.dark, sx * 4, 4.4, -15));
    // 尾翼
    const fin = mesh(extrudeXZ([[0, 0], [0, -9], [8.5, -13], [8.5, -9]], 0.5), M.hull, sx * 6, 2, -6);
    fin.rotation.z = Math.PI / 2 - sx * 0.25; // 外側へ少し開いたV字尾翼
    bomber.add(fin);
    bomber.add(light(blink, 1.8, sx * 8.2, 10.2, -19));
    bomber.add(light(blink, 2.2, sx * 22, 0.4, -14));
  }
  bomber.add(light(strobe, 2.4, 0, 7.2, -10));
  // 窓の明かり：大きさの手がかりになり、暗い宇宙でも輪郭が分かる
  const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.4) });
  const winGeo = new THREE.BoxGeometry(1, 1, 1);
  const win = (x, y, z, sx, sy, sz) => {
    const m = mesh(winGeo, winMat, x, y, z);
    m.scale.set(sx, sy, sz);
    bomber.add(m);
  };
  for (let i = 0; i < 9; i++) {
    const z = -18 + i * 2.4;
    for (const sx of [-1, 1]) {
      win(sx * 7.05, 1.3, z, 0.12, 0.28, 1.1);
      if (i % 2 === 0) win(sx * 6.2, 2.4, z + 0.6, 0.12, 0.22, 0.9);
    }
  }
  for (let i = 0; i < 6; i++) {
    win(-3.75 + i * 1.5, 2.6, -20.45, 0.8, 0.25, 0.1);
    if (i > 0 && i < 5) win(-3.75 + i * 1.5, -2.1, -20.45, 0.8, 0.2, 0.1);
  }
  win(0, 5.6, -11.05, 3.6, 0.3, 0.1);

  // 誘導ミサイル
  const missile = new THREE.Group();
  missile.add(mesh(cyl(0.24, 0.24, 2.8, 10), M.dark));
  missile.add(mesh(new THREE.ConeGeometry(0.24, 0.7, 10).rotateX(Math.PI / 2), M.red, 0, 0, 1.75));
  missile.add(mesh(new THREE.BoxGeometry(1.2, 0.05, 0.5), M.hull, 0, 0, -1.2));
  missile.add(mesh(new THREE.BoxGeometry(0.05, 1.2, 0.5), M.hull, 0, 0, -1.2));
  missile.add(at(glowSprite(glow, 7, 3.4, 1.2, 2.6, 'engine'), 0, 0, -1.8));
  missile.add(light(blink, 1.5, 0, 0, 0.3));

  return { models: { scout, fighter, bomber, missile }, blink, strobe };
}

// ---------- 敵の管理 ----------
export class Enemies {
  constructor(g) {
    this.g = g;
    const b = buildModels(g);
    this.models = b.models;
    this.blinkMat = b.blink;
    this.strobeMat = b.strobe;
    this.list = [];
    this.pool = { scout: [], fighter: [], bomber: [], missile: [] };
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._x = new THREE.Vector3();
    this.muzzles = {
      fighter: [new THREE.Vector3(6.4 * Math.cos(0.42), 6.4 * Math.sin(0.42), 4.8), new THREE.Vector3(-6.4 * Math.cos(0.42), 6.4 * Math.sin(0.42), 4.8)],
      bomber: [new THREE.Vector3(4, 4.4, -16.5), new THREE.Vector3(-4, 4.4, -16.5)],
      bay: [new THREE.Vector3(9, -1.5, -12), new THREE.Vector3(-9, -1.5, -12)],
      scout: [new THREE.Vector3(0, -0.3, 3.8)],
    };
  }

  count() {
    let n = 0;
    for (const e of this.list) if (!e.removed) n++;
    return n;
  }

  clear() {
    for (const e of this.list) this.release(e);
    this.list.length = 0;
  }

  release(e) {
    e.mesh.visible = false;
    this.pool[e.type].push(e);
  }

  make(type) {
    const mesh = this.models[type].clone(true);
    mesh.visible = false;
    mesh.scale.setScalar(TYPES[type].scale);
    this.g.scene.add(mesh);
    const engines = [];
    mesh.traverse((o) => { if (o.userData.kind === 'engine') engines.push(o); });
    return { type, def: TYPES[type], mesh, pos: mesh.position, prev: new THREE.Vector3(), vel: new THREE.Vector3(), mvel: new THREE.Vector3(), base: new THREE.Vector3(), engines };
  }

  spawn(type, x, y, z, opts = {}) {
    const e = this.pool[type].pop() || this.make(type);
    const diff = opts.diff || 1;
    e.def = TYPES[type];
    e.hp = e.def.hp;
    e.removed = false;
    e.t = 0;
    e.state = 'approach';
    e.passes = 0;
    e.bank = 0;
    e.diff = diff;
    e.pos.set(x, y, z);
    e.prev.copy(e.pos);
    e.base.set(x, y, z);
    e.vel.set(0, 0, 0);
    e.phase = Math.random() * Math.PI * 2;
    e.fireT = 1 + Math.random() * 2.5;
    e.missileT = 3 + Math.random() * 2;
    e.gun = 0;
    e.hitFlash = 0;
    e.ox = opts.ox || 0;
    e.oy = opts.oy || 0;
    if (type === 'scout') {
      e.speed = (190 + Math.random() * 40) * (0.9 + diff * 0.1);
      e.amp = 10 + Math.random() * 16;
      e.freq = 1.2 + Math.random() * 1.2;
    } else if (type === 'fighter') {
      e.speed = 140 * (0.92 + diff * 0.08);
    } else if (type === 'bomber') {
      e.speed = 55;
      e.hold = 48;
    } else if (type === 'missile') {
      e.speedCur = 40;
      e.speedMax = 125 * Math.min(1.35, 0.9 + diff * 0.1);
      e.life = 11;
      e.mvel.copy(opts.vel || ZERO);
      e.puffT = 0;
    }
    // 向きを最初から進行方向にそろえておく
    this.orient(e, 1, type === 'bomber' ? this._v.set(0, 0, -1) : this._v.set(0, 0, 1));
    e.mesh.visible = true;
    this.list.push(e);
    return e;
  }

  // 被弾処理
  damage(e, amount, point) {
    if (e.removed) return;
    e.hp -= amount;
    e.hitFlash = 0.08;
    this.g.effects.hitSpark(point || e.pos, e.vel);
    this.g.audio.hitTick();
    if (e.hp <= 0) this.kill(e, true);
  }

  kill(e, byPlayer) {
    if (e.removed) return;
    const g = this.g;
    e.removed = true;
    e.mesh.visible = false;
    const scale = { scout: 1.1, fighter: 1.5, bomber: 3.0, missile: 0.55 }[e.type];
    g.effects.explosion(e.pos, e.vel, scale);
    if (e.type === 'bomber') {
      g.effects.chain(e.pos, e.vel.clone().multiplyScalar(0.5), 1.8, 7, 30, 1.6);
    }
    if (byPlayer) g.addKill(e);
  }

  fire(e, local, speed, spread) {
    const g = this.g;
    const p = g.player;
    const w = this._w.copy(local).multiplyScalar(e.def.scale).applyQuaternion(e.mesh.quaternion).add(e.pos);
    const dist = w.distanceTo(p.pos);
    const tt = dist / speed;
    const t = this._t.copy(p.pos).addScaledVector(p.vel, tt * 0.85);
    t.x += (Math.random() - 0.5) * spread;
    t.y += (Math.random() - 0.5) * spread;
    const d = this._v.subVectors(t, w).normalize().multiplyScalar(speed);
    g.weapons.spawnEnemyBolt(w, d);
    g.effects.flash(w, 3, 1, 6, 1.5, 0.07);
    g.audio.enemyLaser(dist);
  }

  // 進行方向（world速度）に機首を向け、横移動に応じて機体を傾ける
  orient(e, k, dirOverride) {
    const g = this.g;
    const v = this._v;
    if (dirOverride) v.copy(dirOverride);
    else if (e.type === 'missile') v.copy(e.mvel);
    else v.set(e.vel.x, e.vel.y, e.vel.z - g.S);
    if (v.lengthSq() < 1e-6) return;
    v.normalize();
    this._m.lookAt(v, ZERO, UP);
    this._q.setFromRotationMatrix(this._m);
    this._x.setFromMatrixColumn(this._m, 0);
    const lat = e.vel.x * this._x.x + e.vel.y * this._x.y;
    const targetBank = Math.max(-1.1, Math.min(1.1, -lat * 0.02));
    e.bank += (targetBank - e.bank) * Math.min(1, k * 0.6);
    this._q2.setFromAxisAngle(Z_AXIS, e.bank);
    this._q.multiply(this._q2);
    if (k >= 1) e.mesh.quaternion.copy(this._q);
    else e.mesh.quaternion.slerp(this._q, k);
  }

  update(dt) {
    const g = this.g;
    if (dt <= 0) return;
    const on = Math.sin(g.time * 7) > 0.3;
    this.blinkMat.color.setRGB(on ? 8 : 0.2, on ? 0.4 : 0.01, on ? 0.25 : 0.01);
    const st = g.time % 1.4 < 0.06 ? 10 : 0;
    this.strobeMat.color.setRGB(st, st, st * 1.1);

    const p = g.player;
    const alive = g.state === 'playing' && !p.dead;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (!e.removed) {
        e.prev.copy(e.pos);
        e.t += dt;
        if (e.type === 'scout') this.updScout(e, dt, alive);
        else if (e.type === 'fighter') this.updFighter(e, dt, alive);
        else if (e.type === 'bomber') this.updBomber(e, dt, alive);
        else this.updMissile(e, dt);
      }
      if (e.removed) {
        this.list.splice(i, 1);
        this.release(e);
        continue;
      }
      e.vel.subVectors(e.pos, e.prev).divideScalar(dt);
      this.orient(e, 1 - Math.exp(-dt * 5));
      for (const s of e.engines) s.scale.setScalar(s.userData.base * (0.85 + Math.random() * 0.3));

      if (alive && e.mesh.visible) {
        const hitR = e.def.radius * 0.75 + 1.8;
        if (e.pos.distanceToSquared(p.pos) < hitR * hitR) {
          p.damage(e.type === 'missile' ? 26 : e.type === 'bomber' ? 60 : 35);
          this.kill(e, false);
        }
      }
    }
  }

  updScout(e, dt, alive) {
    const p = this.g.player;
    e.pos.z += e.speed * dt;
    e.base.x += (p.pos.x - e.base.x) * 0.3 * dt;
    e.base.y += (p.pos.y - e.base.y) * 0.3 * dt;
    e.pos.x = e.base.x + Math.sin(e.t * e.freq + e.phase) * e.amp;
    e.pos.y = e.base.y + Math.sin(e.t * e.freq * 0.73 + e.phase * 1.3) * e.amp * 0.5;
    if (alive && e.diff > 1.25 && e.pos.z > -600 && e.pos.z < -150) {
      e.fireT -= dt;
      if (e.fireT <= 0) {
        e.fireT = 3 + Math.random() * 3;
        this.fire(e, this.muzzles.scout[0], 320, 8);
      }
    }
    if (e.pos.z > 40) e.removed = true;
  }

  updFighter(e, dt, alive) {
    const p = this.g.player;
    if (e.state === 'approach') {
      const tx = p.pos.x + e.ox + Math.sin(e.t * 0.9 + e.phase) * 14;
      const ty = p.pos.y + e.oy + Math.cos(e.t * 0.7 + e.phase) * 8;
      const k = 1 - Math.exp(-dt * 1.4);
      e.mvel.x += (Math.max(-45, Math.min(45, (tx - e.pos.x) * 0.9)) - e.mvel.x) * k;
      e.mvel.y += (Math.max(-30, Math.min(30, (ty - e.pos.y) * 0.9)) - e.mvel.y) * k;
      e.pos.x += e.mvel.x * dt;
      e.pos.y += e.mvel.y * dt;
      e.pos.z += e.speed * dt;
      if (alive && e.pos.z > -680 && e.pos.z < -90) {
        e.fireT -= dt;
        if (e.fireT <= 0) {
          e.fireT = (2.2 + Math.random() * 1.8) / Math.sqrt(e.diff);
          this.fire(e, this.muzzles.fighter[0], 330, 7);
          this.fire(e, this.muzzles.fighter[1], 330, 7);
        }
      }
      if (e.pos.z > -75) {
        // すれ違いざまに横へ離脱
        e.state = 'break';
        const side = e.pos.x > p.pos.x ? 1 : -1;
        e.mvel.set(side * (55 + Math.random() * 30), (Math.random() - 0.3) * 30, e.speed + 30);
      }
    } else if (e.state === 'break') {
      e.pos.addScaledVector(e.mvel, dt);
      if (e.pos.z > 60) {
        if (e.passes < 1) {
          // 大きく回り込んで、もう一度前方から来る
          e.state = 'return';
          e.returnT = 2.5 + Math.random() * 2;
          e.mesh.visible = false;
        } else {
          e.removed = true;
        }
      }
    } else if (e.state === 'return') {
      e.returnT -= dt;
      e.pos.z += 30 * dt;
      if (e.returnT <= 0) {
        e.passes++;
        e.state = 'approach';
        e.pos.set(p.pos.x + (Math.random() - 0.5) * 160, p.pos.y + (Math.random() - 0.5) * 80, -950 - Math.random() * 200);
        e.prev.copy(e.pos);
        e.mvel.set(0, 0, 0);
        e.fireT = 1.5 + Math.random() * 2;
        this.orient(e, 1, this._t.set(0, 0, 1));
        e.mesh.visible = true;
      }
    }
  }

  updBomber(e, dt, alive) {
    const g = this.g;
    const p = g.player;
    if (e.state === 'approach') {
      e.pos.z += e.speed * dt;
      e.pos.x += (p.pos.x * 0.5 - e.pos.x) * 0.2 * dt;
      e.pos.y += (p.pos.y * 0.4 - 16 - e.pos.y) * 0.2 * dt;
      if (e.pos.z > -270) e.state = 'hold';
    } else if (e.state === 'hold') {
      e.hold -= dt;
      e.pos.x += (p.pos.x * 0.6 + Math.sin(e.t * 0.25 + e.phase) * 30 - e.pos.x) * 0.35 * dt;
      e.pos.y += (p.pos.y * 0.4 - 16 + Math.sin(e.t * 0.19) * 8 - e.pos.y) * 0.35 * dt;
      e.pos.z += Math.sin(e.t * 0.3) * 6 * dt;
      if (e.hold <= 0) e.state = 'leave';
    } else {
      e.pos.z -= 45 * dt;
      if (e.pos.z < -1400) e.removed = true;
    }
    if (!alive || e.pos.z < -1000) return;
    e.fireT -= dt;
    if (e.fireT <= 0) {
      e.fireT = (1.3 + Math.random() * 0.8) / Math.sqrt(e.diff);
      this.fire(e, this.muzzles.bomber[e.gun++ % 2], 300, 10);
    }
    e.missileT -= dt;
    if (e.missileT <= 0 && e.pos.z > -700) {
      e.missileT = (6.5 + Math.random() * 2) / Math.sqrt(e.diff);
      let n = 0;
      for (const m of this.list) if (m.type === 'missile' && !m.removed) n++;
      if (n < 3) {
        const w = this._w.copy(this.muzzles.bay[e.gun % 2]).multiplyScalar(e.def.scale).applyQuaternion(e.mesh.quaternion).add(e.pos);
        this.spawn('missile', w.x, w.y, w.z, { diff: e.diff, vel: this._t.set((Math.random() - 0.5) * 30, 12, 40) });
        g.audio.missileLaunch(0.5);
      }
    }
  }

  updMissile(e, dt) {
    const g = this.g;
    const p = g.player;
    const toP = this._t.subVectors(p.pos, e.pos).normalize();
    const dir = this._w.copy(e.mvel);
    if (dir.lengthSq() < 1e-6) dir.copy(toP);
    dir.normalize();
    dir.lerp(toP, Math.min(1, 1.15 * dt)).normalize();
    e.speedCur = Math.min(e.speedMax, e.speedCur + 55 * dt);
    e.mvel.copy(dir).multiplyScalar(e.speedCur);
    e.pos.addScaledVector(e.mvel, dt);
    e.puffT -= dt;
    if (e.puffT <= 0) {
      e.puffT = 0.035;
      const back = this._v.copy(dir).multiplyScalar(-1.9).add(e.pos);
      g.effects.puff(back, this._x.set(0, 0, g.S * 0.4), 0.9, 1.1);
    }
    e.life -= dt;
    if (e.life <= 0 || e.pos.z > 8) this.kill(e, false);
  }
}
