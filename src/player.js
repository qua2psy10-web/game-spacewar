// 自機：慣性のある上下左右移動、機体の傾き、シールドと船体、砲身の熱
import * as THREE from 'three';

const MAX_SPEED = 78;
const BOUND_X = 60;
const BOUND_Y = 34;

export class Player {
  constructor(g) {
    this.g = g;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.pos.set(0, 0, 0);
    this.vel.set(0, 0, 0);
    this.roll = 0;
    this.pitch = 0;
    this.yaw = 0;
    this.shield = 100;
    this.hull = 100;
    this.heat = 0;
    this.overheated = false;
    this.missiles = 4;
    this.lastDamage = -99;
    this.dead = false;
  }

  steer(dt, tx, ty) {
    const k = 1 - Math.exp(-dt * 5.5);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.y += (ty - this.vel.y) * k;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    if (Math.abs(this.pos.x) > BOUND_X) {
      this.pos.x = Math.sign(this.pos.x) * BOUND_X;
      this.vel.x *= -0.2;
    }
    if (Math.abs(this.pos.y) > BOUND_Y) {
      this.pos.y = Math.sign(this.pos.y) * BOUND_Y;
      this.vel.y *= -0.2;
    }
    const k2 = 1 - Math.exp(-dt * 4);
    this.roll += ((-this.vel.x / MAX_SPEED) * 0.42 - this.roll) * k2;
    this.pitch += ((this.vel.y / MAX_SPEED) * 0.09 - this.pitch) * k2;
    this.yaw += ((-this.vel.x / MAX_SPEED) * 0.05 - this.yaw) * k2;
  }

  update(dt) {
    const g = this.g;
    if (this.dead) {
      this.steer(dt, 0, -6);
      this.roll += dt * 0.6;
      return;
    }
    const m = g.input.move;
    this.steer(dt, m.x * MAX_SPEED, m.y * MAX_SPEED * 0.85);
    if (g.time - this.lastDamage > 3) this.shield = Math.min(100, this.shield + 9 * dt);
    this.heat = Math.max(0, this.heat - 0.34 * dt);
    if (this.overheated && this.heat < 0.35) this.overheated = false;
  }

  // タイトル画面ではゆっくり漂う
  attract(dt) {
    const t = this.g.time;
    this.steer(dt, Math.sin(t * 0.21) * 14, Math.sin(t * 0.13 + 1) * 6);
  }

  damage(amount) {
    const g = this.g;
    if (this.dead) return;
    this.lastDamage = g.time;
    let a = amount;
    if (this.shield > 0) {
      const absorb = Math.min(this.shield, a);
      this.shield -= absorb;
      a -= absorb;
      g.post.shieldHit = 1;
      g.audio.shieldHit();
    }
    if (a > 0) {
      this.hull -= a;
      g.post.damage = 1;
      g.audio.hullHit();
      g.cockpit.glitch = 0.7;
      g.cockpit.glassMat.uniforms.uHit.value = 1;
      if (a >= 8) g.cockpit.addCrack();
      g.shake = Math.min(1.3, g.shake + 0.9);
    } else {
      g.shake = Math.min(1.3, g.shake + 0.35);
    }
    if (this.hull <= 0) {
      this.hull = 0;
      g.gameOver();
    }
  }
}
