// HUD：照準、シールド・船体・砲身温度のゲージ、目標枠、画面外の敵の方向、スコア
import * as THREE from 'three';

const GREEN = 'rgba(140,255,200,0.9)';
const GREEN_DIM = 'rgba(140,255,200,0.35)';
const RED = 'rgba(255,90,70,0.95)';
const AMBER = 'rgba(255,200,90,0.95)';
const CYAN = 'rgba(110,210,255,0.95)';

export class Hud {
  constructor(g, canvas) {
    this.g = g;
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.v = new THREE.Vector3();
    this.inset = { t: 0, r: 0, b: 0, l: 0 };
    this.mslEl = document.getElementById('msl-count');
    this.mslBtn = document.getElementById('btn-missile');
    this.fireBtn = document.getElementById('btn-fire');
    this.lastMsl = -1;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.c.width = Math.round(this.w * dpr);
    this.c.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(document.documentElement);
    const px = (n) => parseFloat(cs.getPropertyValue(n)) || 0;
    this.inset = { t: px('--sat'), r: px('--sar'), b: px('--sab'), l: px('--sal') };
  }

  // ワールド座標 → 画面座標（後ろ側なら behind=true）
  toScreen(pos, out) {
    const cam = this.g.camera;
    const v = this.v.copy(pos).applyMatrix4(cam.matrixWorldInverse);
    out.behind = v.z > 0;
    v.applyMatrix4(cam.projectionMatrix);
    out.x = (v.x * 0.5 + 0.5) * this.w;
    out.y = (-v.y * 0.5 + 0.5) * this.h;
    return out;
  }

  draw() {
    const g = this.g;
    const x = this.ctx;
    x.clearRect(0, 0, this.w, this.h);
    this.updateButtons();
    if (g.state !== 'playing' && g.state !== 'paused') return;
    const p = g.player;
    if (p.dead) return;
    const w = this.w, h = this.h;
    const cx = w / 2, cy = h / 2;
    const S = Math.min(w, h) / 400;
    x.lineCap = 'round';
    x.font = `600 ${Math.round(12 * S)}px -apple-system, monospace`;

    // 照準
    x.strokeStyle = GREEN;
    x.lineWidth = 1.5;
    x.shadowColor = 'rgba(80,255,170,0.8)';
    x.shadowBlur = 6;
    const r = 22 * S;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.stroke();
    x.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      x.moveTo(cx + dx * r * 1.3, cy + dy * r * 1.3);
      x.lineTo(cx + dx * r * 1.9, cy + dy * r * 1.9);
    }
    x.stroke();
    x.fillStyle = GREEN;
    x.beginPath();
    x.arc(cx, cy, 1.8, 0, Math.PI * 2);
    x.fill();

    // 左右の円弧ゲージ：シールド（左）と船体（右）
    const R = 62 * S;
    const arc = (a0, a1, v, col, ccw) => {
      x.strokeStyle = GREEN_DIM;
      x.lineWidth = 3 * S;
      x.beginPath();
      x.arc(cx, cy, R, a0, a1, ccw);
      x.stroke();
      x.strokeStyle = col;
      x.lineWidth = 3.2 * S;
      x.beginPath();
      const span = ccw ? a0 - a1 : a1 - a0;
      const end = ccw ? a0 - span * v : a0 + span * v;
      x.arc(cx, cy, R, a0, end, ccw);
      x.stroke();
    };
    const D = Math.PI / 180;
    arc(130 * D, 230 * D, p.shield / 100, CYAN, false);
    const hullCol = p.hull < 30 ? (Math.sin(g.time * 10) > 0 ? RED : AMBER) : GREEN;
    arc(50 * D, -50 * D, p.hull / 100, hullCol, true);
    x.shadowBlur = 0;
    x.fillStyle = GREEN_DIM;
    x.textAlign = 'right';
    x.fillText('SHLD', cx - R - 8 * S, cy + 4 * S);
    x.textAlign = 'left';
    x.fillText('HULL', cx + R + 8 * S, cy + 4 * S);

    // 砲身温度（照準の下）
    const hw = 70 * S;
    const hy = cy + R + 14 * S;
    x.fillStyle = 'rgba(140,255,200,0.15)';
    x.fillRect(cx - hw / 2, hy, hw, 4 * S);
    x.fillStyle = p.overheated ? RED : p.heat > 0.7 ? AMBER : GREEN;
    x.fillRect(cx - hw / 2, hy, hw * p.heat, 4 * S);
    if (p.overheated && Math.sin(g.time * 14) > 0) {
      x.textAlign = 'center';
      x.fillStyle = RED;
      x.fillText('OVERHEAT', cx, hy + 18 * S);
    }

    // 目標枠と画面外の方向表示
    const pt = { x: 0, y: 0, behind: false };
    const W = g.weapons;
    let missileNear = false;
    for (const e of g.enemies.list) {
      if (e.removed || !e.mesh.visible) continue;
      const isM = e.type === 'missile';
      if (isM && e.pos.distanceTo(p.pos) < 500) missileNear = true;
      this.toScreen(e.pos, pt);
      const margin = 24 * S;
      const onScreen = !pt.behind && pt.x > margin && pt.x < w - margin && pt.y > margin && pt.y < h - margin;
      if (onScreen) {
        const dist = e.pos.distanceTo(g.camera.position);
        const size = Math.max(9 * S, Math.min(80 * S, ((e.def.radius * h) / Math.max(1, dist)) * 0.9));
        const isTarget = W.lockTarget === e;
        x.strokeStyle = isM ? RED : isTarget && W.locked ? RED : e.type === 'bomber' ? AMBER : GREEN;
        x.lineWidth = isTarget ? 2 : 1.3;
        if (isM) {
          x.beginPath();
          x.moveTo(pt.x, pt.y - size);
          x.lineTo(pt.x + size, pt.y + size * 0.8);
          x.lineTo(pt.x - size, pt.y + size * 0.8);
          x.closePath();
          x.stroke();
          x.fillStyle = RED;
          x.textAlign = 'center';
          x.fillText('MSL', pt.x, pt.y + size + 13 * S);
          continue;
        }
        const c = size * 0.35;
        x.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const bx = pt.x + sx * size, by = pt.y + sy * size;
          x.moveTo(bx, by - sy * c);
          x.lineTo(bx, by);
          x.lineTo(bx - sx * c, by);
        }
        x.stroke();
        if (e.type === 'bomber' || isTarget) {
          // 耐久ゲージ
          x.fillStyle = GREEN_DIM;
          x.fillRect(pt.x - size, pt.y + size + 4, size * 2, 3);
          x.fillStyle = AMBER;
          x.fillRect(pt.x - size, pt.y + size + 4, size * 2 * Math.max(0, e.hp / e.def.hp), 3);
        }
        if (isTarget) {
          if (W.locked) {
            const a = g.time * 3;
            const rr = size * 1.45;
            x.strokeStyle = RED;
            x.lineWidth = 2;
            x.beginPath();
            for (let k = 0; k < 4; k++) {
              const ang = a + (k * Math.PI) / 2;
              const px = pt.x + Math.cos(ang) * rr, py = pt.y + Math.sin(ang) * rr;
              k ? x.lineTo(px, py) : x.moveTo(px, py);
            }
            x.closePath();
            x.stroke();
            x.fillStyle = RED;
            x.textAlign = 'center';
            x.fillText('LOCK', pt.x, pt.y - rr - 6 * S);
          } else {
            x.strokeStyle = AMBER;
            x.beginPath();
            x.arc(pt.x, pt.y, size * (2.4 - 1.2 * W.lockProgress), 0, Math.PI * 2 * W.lockProgress);
            x.stroke();
          }
          x.fillStyle = GREEN;
          x.textAlign = 'left';
          x.fillText(`${Math.round(dist)}`, pt.x + size + 5 * S, pt.y - size + 10 * S);
        }
      } else {
        // 画面の縁に矢印
        let dx = pt.x - cx, dy = pt.y - cy;
        if (pt.behind) { dx = -dx; dy = -dy; }
        const ang = Math.atan2(dy, dx);
        const ex = w / 2 - 34 * S, ey = h / 2 - 34 * S;
        const k = 1 / Math.max(Math.abs(Math.cos(ang)) / ex, Math.abs(Math.sin(ang)) / ey);
        const ax = cx + Math.cos(ang) * k, ay = cy + Math.sin(ang) * k;
        x.fillStyle = isM ? RED : e.type === 'bomber' ? AMBER : 'rgba(140,255,200,0.7)';
        x.save();
        x.translate(ax, ay);
        x.rotate(ang);
        x.beginPath();
        const s = (isM ? 11 : 8) * S;
        x.moveTo(s, 0);
        x.lineTo(-s * 0.7, s * 0.7);
        x.lineTo(-s * 0.3, 0);
        x.lineTo(-s * 0.7, -s * 0.7);
        x.closePath();
        x.fill();
        x.restore();
      }
    }
    g.missileWarning = missileNear;
    if (missileNear && Math.sin(g.time * 12) > -0.2) {
      x.textAlign = 'center';
      x.fillStyle = RED;
      x.font = `700 ${Math.round(15 * S)}px -apple-system, monospace`;
      x.fillText('⚠ MISSILE', cx, cy - R - 16 * S);
      x.font = `600 ${Math.round(12 * S)}px -apple-system, monospace`;
    }

    // 上部の文字情報
    const top = this.inset.t + 14 * S + 8;
    const left = this.inset.l + 16;
    x.textAlign = 'left';
    x.fillStyle = GREEN;
    x.shadowColor = 'rgba(80,255,170,0.7)';
    x.shadowBlur = 4;
    x.font = `700 ${Math.round(17 * S)}px -apple-system, monospace`;
    x.fillText(String(g.score).padStart(7, '0'), left, top);
    x.font = `600 ${Math.round(11 * S)}px -apple-system, monospace`;
    x.fillStyle = GREEN_DIM;
    x.fillText('SCORE', left, top + 14 * S);
    if (g.combo > 1 && g.comboTimer > 0) {
      x.fillStyle = AMBER;
      x.fillText(`×${g.multiplier().toFixed(1)}  ${g.combo} CHAIN`, left + 62 * S, top + 14 * S);
    }
    x.textAlign = 'center';
    x.fillStyle = GREEN;
    x.font = `700 ${Math.round(14 * S)}px -apple-system, monospace`;
    x.fillText(`WAVE ${g.waves.n}`, cx, top);
    x.textAlign = 'right';
    x.fillStyle = GREEN_DIM;
    x.font = `600 ${Math.round(11 * S)}px -apple-system, monospace`;
    x.fillText(`HI ${String(Math.max(g.hiScore, g.score)).padStart(7, '0')}`, w - this.inset.r - 70, top);
    x.shadowBlur = 0;
  }

  updateButtons() {
    const g = this.g;
    const p = g.player;
    if (p.missiles !== this.lastMsl) {
      this.lastMsl = p.missiles;
      this.mslEl.textContent = p.missiles;
      this.mslBtn.classList.toggle('empty', p.missiles <= 0);
    }
    const locked = g.weapons.locked && p.missiles > 0;
    if (locked !== this._locked) {
      this._locked = locked;
      this.mslBtn.classList.toggle('locked', locked);
    }
    const hot = p.overheated || p.heat > 0.8;
    if (hot !== this._hot) {
      this._hot = hot;
      this.fireBtn.classList.toggle('hot', hot);
    }
  }
}
