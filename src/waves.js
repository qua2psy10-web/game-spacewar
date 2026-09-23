// ウェーブ：敵の出現スケジュールと難易度の上昇
export class Waves {
  constructor(g) {
    this.g = g;
    this.n = 0;
    this.queue = [];
    this.t = 0;
    this.state = 'idle';
    this.inter = 0;
    this.diff = 1;
  }

  start() {
    this.begin(1);
  }

  stop() {
    this.state = 'idle';
    this.queue = [];
  }

  begin(n) {
    const g = this.g;
    this.n = n;
    this.t = 0;
    this.diff = 1 + (n - 1) * 0.09;
    this.queue = this.build(n);
    this.state = 'active';
    g.showBanner(`WAVE ${n}`, n === 1 ? '迎撃開始' : n % 3 === 0 ? '大型艦 接近中' : '', 2.4);
    g.audio.waveStart();
  }

  build(n) {
    const q = [];
    // 偵察機の小隊
    const scouts = Math.min(6 + n * 2, 26);
    let t = 2.5;
    for (let i = 0; i < scouts; ) {
      const c = Math.min(scouts - i, 2 + ((Math.random() * 2) | 0) + (n > 3 ? 1 : 0));
      q.push({ t, type: 'scouts', count: c });
      i += c;
      t += Math.max(1.5, 3.8 - n * 0.18) + Math.random() * 1.4;
    }
    // 戦闘機の編隊（2面から）
    if (n >= 2) {
      const groups = Math.min(1 + Math.floor((n - 1) / 2), 5);
      const size = 3 + (n >= 5 ? 1 : 0) + (n >= 8 ? 1 : 0);
      for (let k = 0; k < groups; k++) q.push({ t: 5 + k * Math.max(4, 8 - n * 0.4) + Math.random() * 2, type: 'fighters', count: size });
    }
    // 重爆撃機（3面ごと）
    if (n % 3 === 0) {
      q.push({ t: 4, type: 'bomber' });
      if (n >= 9) q.push({ t: 22, type: 'bomber' });
    }
    q.sort((a, b) => a.t - b.t);
    return q;
  }

  spawn(ev) {
    const g = this.g;
    const E = g.enemies;
    const p = g.player.pos;
    const d = this.diff;
    if (ev.type === 'scouts') {
      const cx = p.x + (Math.random() - 0.5) * 140;
      const cy = p.y + (Math.random() - 0.5) * 70;
      const z = -1050 - Math.random() * 150;
      for (let i = 0; i < ev.count; i++) {
        E.spawn('scout', cx + (i - (ev.count - 1) / 2) * 16, cy + (Math.random() - 0.5) * 8, z - i * 30, { diff: d });
      }
    } else if (ev.type === 'fighters') {
      const cx = p.x + (Math.random() - 0.5) * 120;
      const cy = p.y + (Math.random() - 0.5) * 50;
      const z = -1100 - Math.random() * 100;
      for (let i = 0; i < ev.count; i++) {
        // V字編隊
        const k = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
        E.spawn('fighter', cx + k * 16, cy + Math.abs(k) * 2, z - Math.abs(k) * 22, { diff: d, ox: k * 18, oy: (Math.random() - 0.5) * 16 });
      }
    } else if (ev.type === 'bomber') {
      E.spawn('bomber', (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 30, -1350, { diff: d });
      for (const s of [-1, 1]) E.spawn('fighter', s * 40, 10, -1200, { diff: d, ox: s * 25, oy: 8 });
    }
  }

  update(dt) {
    const g = this.g;
    if (this.state === 'active') {
      this.t += dt;
      while (this.queue.length && this.queue[0].t <= this.t) this.spawn(this.queue.shift());
      if (!this.queue.length && g.enemies.count() === 0) {
        this.state = 'clear';
        this.inter = 4.5;
        const bonus = 500 * this.n;
        g.score += bonus;
        const p = g.player;
        p.hull = Math.min(100, p.hull + 15);
        p.missiles = Math.min(6, p.missiles + 2);
        g.showBanner('WAVE CLEAR', `ボーナス +${bonus}　船体修理 +15　ミサイル補給`, 3.5);
        g.audio.waveClear();
      }
    } else if (this.state === 'clear') {
      this.inter -= dt;
      if (this.inter <= 0) this.begin(this.n + 1);
    }
  }
}
