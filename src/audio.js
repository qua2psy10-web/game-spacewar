// 効果音：音声ファイルは使わず Web Audio で合成する
export class Sfx {
  constructor(g) {
    this.g = g;
    this.ctx = null;
    this.enabled = g.settings.sound;
    this.alarmT = 0;
    this.lastHit = 0;
  }

  // iOS は画面に触れたタイミングでないと音を鳴らせないので、最初のタップで準備する
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        // 消音スイッチがオンでも鳴らす（iOS 17 以降）
        if (navigator.audioSession) navigator.audioSession.type = 'playback';
      } catch { /* 対応していなければ無視 */ }
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain();
      this.master.gain.value = this.enabled ? 0.8 : 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.master.connect(comp);
      comp.connect(ctx.destination);
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.buildEngine();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }

  buildEngine() {
    const c = this.ctx;
    const o1 = c.createOscillator();
    const o2 = c.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'sawtooth';
    o1.frequency.value = 46;
    o2.frequency.value = 46.6;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 380;
    bp.Q.value = 0.6;
    const ng = c.createGain();
    ng.gain.value = 0.35;
    this.engineGain = c.createGain();
    this.engineGain.gain.value = 0;
    o1.connect(lp);
    o2.connect(lp);
    n.connect(bp).connect(ng).connect(lp);
    lp.connect(this.engineGain).connect(this.master);
    o1.start();
    o2.start();
    n.start();
    this.engineFilter = lp;
    this.engineOsc = [o1, o2];
  }

  get t() {
    return this.ctx.currentTime;
  }

  env(node, t, peak, attack, decay) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  noiseSrc(rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = rate;
    s.loop = true;
    return s;
  }

  ok() {
    return this.ctx && this.enabled && this.ctx.state === 'running';
  }

  laser(pan = 0) {
    if (!this.ok()) return;
    const c = this.ctx, t = this.t;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(1700, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.13);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 3200;
    const gn = c.createGain();
    this.env(gn, t, 0.09, 0.004, 0.14);
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    o.connect(f).connect(gn);
    if (p) {
      p.pan.value = pan;
      gn.connect(p).connect(this.master);
    } else gn.connect(this.master);
    o.start(t);
    o.stop(t + 0.2);
  }

  enemyLaser(dist) {
    if (!this.ok()) return;
    const c = this.ctx, t = this.t;
    const vol = Math.max(0.01, Math.min(0.08, 40 / (dist + 60)));
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.18);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    const gn = c.createGain();
    this.env(gn, t, vol, 0.005, 0.2);
    o.connect(f).connect(gn).connect(this.master);
    o.start(t);
    o.stop(t + 0.25);
  }

  explosion(size = 1, dist = 100) {
    if (!this.ok()) return;
    const c = this.ctx, t = this.t;
    const vol = Math.max(0.04, Math.min(1, (1.3 * size * 70) / (dist + 70)));
    const dur = 0.9 + size * 0.6;
    const n = this.noiseSrc(0.55 + Math.random() * 0.2);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2600 * Math.min(1.5, size), t);
    f.frequency.exponentialRampToValueAtTime(90, t + dur);
    const gn = c.createGain();
    this.env(gn, t, vol * 0.9, 0.01, dur);
    n.connect(f).connect(gn).connect(this.master);
    n.start(t);
    n.stop(t + dur + 0.1);
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.6);
    const og = c.createGain();
    this.env(og, t, vol * 0.8, 0.01, 0.6);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 0.7);
  }

  hitTick() {
    if (!this.ok()) return;
    const c = this.ctx, t = this.t;
    if (t - this.lastHit < 0.03) return;
    this.lastHit = t;
    const n = this.noiseSrc(1.5);
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 2500;
    const gn = c.createGain();
    this.env(gn, t, 0.12, 0.002, 0.06);
    n.connect(f).connect(gn).connect(this.master);
    n.start(t);
    n.stop(t + 0.1);
  }

  shieldHit() {
    if (!this.ok()) return;
    const c = this.ctx, t = this.t;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.35);
    const lfo = c.createOscillator();
    lfo.frequency.value = 38;
    const lg = c.createGain();
    lg.gain.value = 60;
    lfo.connect(lg).connect(o.frequency);
    const gn = c.createGain();
    this.env(gn, t, 0.22, 0.005, 0.38);
    o.connect(gn).connect(this.master);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.45);
    lfo.stop(t + 0.45);
  }

  hullHit() {
    if (!this.ok()) return;
    const c = this.ctx, t = this.t;
    const n = this.noiseSrc(0.7);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const gn = c.createGain();
    this.env(gn, t, 0.6, 0.003, 0.35);
    n.connect(f).connect(gn).connect(this.master);
    n.start(t);
    n.stop(t + 0.4);
    // 金属のきしみ
    for (const fr of [173, 262, 431]) {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = fr * (0.97 + Math.random() * 0.06);
      const og = c.createGain();
      this.env(og, t, 0.07, 0.005, 0.9);
      o.connect(og).connect(this.master);
      o.start(t);
      o.stop(t + 1);
    }
  }

  missileLaunch(vol = 1) {
    if (!this.ok()) return;
    const c = this.ctx, t = this.t;
    const n = this.noiseSrc(1);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(350, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.5);
    const gn = c.createGain();
    this.env(gn, t, 0.35 * vol, 0.03, 0.7);
    n.connect(f).connect(gn).connect(this.master);
    n.start(t);
    n.stop(t + 0.8);
  }

  beep(freq, dur, vol = 0.06, type = 'sine') {
    if (!this.ok()) return;
    const c = this.ctx, t = this.t;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const gn = c.createGain();
    this.env(gn, t, vol, 0.004, dur);
    o.connect(gn).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  lockTick() { this.beep(1100, 0.04, 0.04); }
  lockOn() { this.beep(1760, 0.18, 0.07, 'square'); }
  denied() { this.beep(220, 0.12, 0.06, 'square'); }
  ui() { this.beep(1320, 0.05, 0.05); }

  overheat() {
    if (!this.ok()) return;
    const c = this.ctx, t = this.t;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.5);
    const gn = c.createGain();
    this.env(gn, t, 0.08, 0.01, 0.5);
    o.connect(gn).connect(this.master);
    o.start(t);
    o.stop(t + 0.6);
  }

  waveStart() {
    this.beep(660, 0.12, 0.05);
    setTimeout(() => this.beep(990, 0.2, 0.05), 140);
  }

  waveClear() {
    this.beep(880, 0.12, 0.05);
    setTimeout(() => this.beep(1100, 0.12, 0.05), 130);
    setTimeout(() => this.beep(1320, 0.3, 0.05), 260);
  }

  update(dt) {
    if (!this.ctx) return;
    const g = this.g;
    const t = this.t;
    const playing = g.state === 'playing' && !g.player.dead;
    const sp = g.player.vel.length() / 50;
    const target = g.state === 'paused' ? 0 : playing ? 0.12 + sp * 0.05 : 0.05;
    this.engineGain.gain.setTargetAtTime(target, t, 0.3);
    this.engineFilter.frequency.setTargetAtTime(170 + sp * 140, t, 0.2);
    // 警報：ミサイル接近、船体の損傷
    if (!playing) return;
    this.alarmT -= dt;
    if (this.alarmT <= 0) {
      if (g.missileWarning) {
        this.beep(1250, 0.07, 0.05, 'square');
        this.alarmT = 0.22;
      } else if (g.player.hull < 30) {
        this.beep(620, 0.18, 0.045, 'triangle');
        this.alarmT = 0.9;
      }
    }
  }
}
