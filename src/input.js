// 操作：左側の仮想スティック、射撃・ミサイルボタン、傾き操作（任意）、パソコン用キーボード
const $ = (id) => document.getElementById(id);
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export class Input {
  constructor(g) {
    this.g = g;
    this.move = { x: 0, y: 0 };
    this.fireHeld = false;
    this.fire = false;
    this.missileQueued = false;
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.keys = new Set();
    this.gyro = { on: false, base: null, x: 0, y: 0 };

    const zone = $('stick-zone');
    const base = $('stick');
    const knob = $('stick-knob');
    const radius = () => Math.max(46, Math.min(70, window.innerHeight * 0.15));

    zone.addEventListener('pointerdown', (e) => {
      if (this.stick.id !== null) return;
      e.preventDefault();
      this.stick.id = e.pointerId;
      try { zone.setPointerCapture(e.pointerId); } catch { /* 無視 */ }
      this.stick.ox = e.clientX;
      this.stick.oy = e.clientY;
      base.style.left = e.clientX + 'px';
      base.style.top = e.clientY + 'px';
      knob.style.transform = 'translate(0px,0px)';
      base.classList.add('on');
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stick.id) return;
      e.preventDefault();
      let dx = e.clientX - this.stick.ox;
      let dy = e.clientY - this.stick.oy;
      const R = radius();
      const len = Math.hypot(dx, dy);
      if (len > R) {
        // 指が大きく離れたらスティックの中心を引っ張ってくる
        const over = len - R;
        this.stick.ox += (dx / len) * over;
        this.stick.oy += (dy / len) * over;
        base.style.left = this.stick.ox + 'px';
        base.style.top = this.stick.oy + 'px';
        dx = (dx / len) * R;
        dy = (dy / len) * R;
      }
      this.stick.x = dx / R;
      this.stick.y = -dy / R;
      knob.style.transform = `translate(${dx}px,${dy}px)`;
    });
    const endStick = (e) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick.id = null;
      this.stick.x = 0;
      this.stick.y = 0;
      base.classList.remove('on');
    };
    zone.addEventListener('pointerup', endStick);
    zone.addEventListener('pointercancel', endStick);

    const fireBtn = $('btn-fire');
    const pressFire = (on) => (e) => {
      e.preventDefault();
      this.fire = on;
      fireBtn.classList.toggle('pressed', on);
      if (on) {
        try { fireBtn.setPointerCapture(e.pointerId); } catch { /* 無視 */ }
      }
    };
    fireBtn.addEventListener('pointerdown', pressFire(true));
    fireBtn.addEventListener('pointerup', pressFire(false));
    fireBtn.addEventListener('pointercancel', pressFire(false));

    const mslBtn = $('btn-missile');
    mslBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.missileQueued = true;
      mslBtn.classList.add('pressed');
    });
    const mslUp = () => mslBtn.classList.remove('pressed');
    mslBtn.addEventListener('pointerup', mslUp);
    mslBtn.addEventListener('pointercancel', mslUp);

    for (const el of [fireBtn, mslBtn, zone]) el.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyM' || e.code === 'ShiftLeft') this.missileQueued = true;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.fire = false;
    });

    this.onMotion = this.onMotion.bind(this);
  }

  update() {
    let x = this.stick.x;
    let y = this.stick.y;
    const k = this.keys;
    if (k.has('ArrowLeft') || k.has('KeyA')) x -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) x += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) y += 1;
    if (k.has('ArrowDown') || k.has('KeyS')) y -= 1;
    if (this.gyro.on && this.g.settings.control === 'gyro') {
      x += this.gyro.x;
      y += this.gyro.y;
    }
    if (this.g.settings.invertY) y = -y;
    const shape = (v) => {
      const a = Math.abs(v);
      if (a < 0.06) return 0;
      return Math.sign(v) * Math.min(1, Math.pow((a - 0.06) / 0.94, 1.25));
    };
    this.move.x = shape(Math.max(-1, Math.min(1, x)));
    this.move.y = shape(Math.max(-1, Math.min(1, y)));
    this.fireHeld = this.fire || k.has('Space');
  }

  consumeMissile() {
    const q = this.missileQueued;
    this.missileQueued = false;
    return q;
  }

  releaseAll() {
    this.fire = false;
    this.stick.id = null;
    this.stick.x = this.stick.y = 0;
    $('stick').classList.remove('on');
    $('btn-fire').classList.remove('pressed');
    this.missileQueued = false;
  }

  // iOS ではボタン操作の中で許可を求める必要がある
  async enableGyro() {
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const r = await DeviceMotionEvent.requestPermission();
        if (r !== 'granted') return false;
      }
    } catch {
      return false;
    }
    if (!this.gyro.on) window.addEventListener('devicemotion', this.onMotion);
    this.gyro.on = true;
    this.gyro.base = null;
    return true;
  }

  calibrate() {
    this.gyro.base = null;
  }

  onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    const ang = screen.orientation && typeof screen.orientation.angle === 'number' ? screen.orientation.angle : window.orientation || 0;
    const th = (ang * Math.PI) / 180;
    // 端末の座標から画面の座標へ変換
    const sx = a.x * Math.cos(th) - a.y * Math.sin(th);
    const sy = a.x * Math.sin(th) + a.y * Math.cos(th);
    if (!this.gyro.base) this.gyro.base = { x: sx, y: sy };
    const sign = IS_IOS ? 1 : -1;
    const K = 3.2;
    this.gyro.x = Math.max(-1, Math.min(1, (sign * (sx - this.gyro.base.x)) / K));
    this.gyro.y = Math.max(-1, Math.min(1, (-sign * (sy - this.gyro.base.y)) / K));
  }
}
