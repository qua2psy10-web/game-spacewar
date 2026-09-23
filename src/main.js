// 起動、ゲームループ、画面の切り替え（タイトル／プレイ／一時停止／ゲームオーバー）
import * as THREE from 'three';
import { Renderer } from './renderer.js';
import { Space, SUN_DIR } from './space.js';
import { Cockpit } from './cockpit.js';
import { Player } from './player.js';
import { Enemies } from './enemies.js';
import { Weapons } from './weapons.js';
import { Effects } from './effects.js';
import { Waves } from './waves.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { Hud } from './hud.js';
import { makeTextures } from './textures.js';
import { loadSettings, saveSettings, loadHiScore, saveHiScore } from './settings.js';

const $ = (id) => document.getElementById(id);

class Game {
  constructor() {
    this.settings = loadSettings();
    this.hiScore = loadHiScore();
    this.state = 'loading';
    this.S = 90; // 前進速度（m/秒）
    this.time = 0;
    this.shake = 0;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.kills = 0;
    this.missileWarning = false;
    this.post = { damage: 0, shieldHit: 0, flash: 0 };
    this.shakeOff = new THREE.Vector3();
    this._sun = new THREE.Vector3();

    this.renderer = new Renderer($('gl'), this.settings.quality);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 3200);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.tex = makeTextures();

    this.player = new Player(this);
    this.space = new Space(this, this.renderer.preset);
    this.renderer.setup(this.scene, this.camera);
    this.cockpit = new Cockpit(this);
    this.effects = new Effects(this);
    this.weapons = new Weapons(this);
    this.enemies = new Enemies(this);
    this.waves = new Waves(this);
    this.input = new Input(this);
    this.audio = new Sfx(this);
    this.hud = new Hud(this, $('hud'));

    this.bindUI();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 300));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === 'playing') this.pause();
        this.audio.suspend();
      }
    });

    if (new URLSearchParams(location.search).has('fps')) {
      this.fpsEl = document.createElement('div');
      this.fpsEl.id = 'fps';
      document.body.appendChild(this.fpsEl);
      this.fpsAcc = 0;
      this.fpsN = 0;
    }

    this.last = performance.now();
    this.loop = this.loop.bind(this);
    // シェーダーを先にまとめて準備しておき、最初の爆発などでのカクつきを減らす
    this.renderer.renderer.compile(this.scene, this.camera);
    this.toTitle();
    $('loading').style.display = 'none';
    requestAnimationFrame(this.loop);
  }

  // ---------- 画面とUI ----------
  bindUI() {
    const tap = (id, fn) => $(id).addEventListener('click', (e) => {
      e.preventDefault();
      this.audio.unlock();
      this.audio.ui();
      fn();
    });
    tap('btn-start', () => this.startGame());
    tap('btn-retry', () => this.startGame());
    tap('btn-totitle', () => this.toTitle());
    tap('btn-quit', () => this.toTitle());
    tap('btn-resume', () => this.resume());
    $('btn-pause').addEventListener('click', (e) => {
      e.preventDefault();
      if (this.state === 'playing') this.pause();
    });

    for (const seg of document.querySelectorAll('.seg')) {
      const key = seg.dataset.key;
      const refresh = () => {
        for (const b of seg.querySelectorAll('button')) b.classList.toggle('on', String(this.settings[key]) === b.dataset.v);
      };
      refresh();
      seg.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        this.audio.unlock();
        let v = b.dataset.v;
        if (v === 'true') v = true;
        else if (v === 'false') v = false;
        if (key === 'control' && v === 'gyro') {
          const ok = await this.input.enableGyro();
          if (!ok) {
            this.showBanner('傾きセンサーを使えません', '設定で許可するか、スティック操作を使ってください', 3);
            v = 'stick';
          }
        }
        this.settings[key] = v;
        saveSettings(this.settings);
        refresh();
        if (key === 'quality') this.renderer.setQuality(v);
        if (key === 'sound') this.audio.setEnabled(v);
        this.audio.ui();
      });
    }
  }

  showBanner(main, sub = '', dur = 2.5) {
    $('banner-main').textContent = main;
    $('banner-sub').textContent = sub;
    const b = $('banner');
    b.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.remove('show'), dur * 1000);
  }

  setOverlay(id) {
    for (const o of ['title', 'pause', 'gameover']) $(o).classList.toggle('hidden', o !== id);
    document.body.classList.toggle('playing', id === null && this.state === 'playing');
  }

  toTitle() {
    this.state = 'title';
    this.enemies.clear();
    this.weapons.clear();
    this.effects.clear();
    this.waves.stop();
    this.player.reset();
    this.cockpit.clearCracks();
    this.input.releaseAll();
    $('title-hi').textContent = this.hiScore;
    this.setOverlay('title');
    $('banner').classList.remove('show');
  }

  startGame() {
    this.enemies.clear();
    this.weapons.clear();
    this.effects.clear();
    this.player.reset();
    this.cockpit.clearCracks();
    this.input.releaseAll();
    this.input.calibrate();
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.kills = 0;
    this.post.damage = this.post.shieldHit = this.post.flash = 0;
    this.state = 'playing';
    this.setOverlay(null);
    this.waves.start();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.releaseAll();
    this.setOverlay('pause');
  }

  resume() {
    this.state = 'playing';
    this.input.calibrate();
    this.setOverlay(null);
  }

  gameOver() {
    if (this.state !== 'playing') return;
    const p = this.player;
    p.dead = true;
    this.state = 'gameover';
    this.input.releaseAll();
    document.body.classList.remove('playing');
    this.waves.stop();
    // 自機の最期
    const cam = this.camera;
    const at = cam.localToWorld(new THREE.Vector3(0, -3, -6));
    this.effects.explosion(at, new THREE.Vector3(0, 0, 10), 2.2);
    this.post.flash = 1;
    this.shake = 1.3;
    for (let i = 0; i < 4; i++) this.cockpit.addCrack();
    const newHi = this.score > this.hiScore;
    if (newHi) {
      this.hiScore = this.score;
      saveHiScore(this.score);
    }
    $('go-score').textContent = this.score;
    $('go-wave').textContent = this.waves.n;
    $('go-kills').textContent = this.kills;
    $('go-newhi').classList.toggle('hidden', !newHi);
    setTimeout(() => {
      if (this.state === 'gameover') this.setOverlay('gameover');
    }, 2600);
  }

  multiplier() {
    return Math.min(3, 1 + 0.1 * (this.combo - 1));
  }

  addKill(e) {
    this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
    this.comboTimer = 3;
    this.kills++;
    this.score += Math.round(e.def.score * this.multiplier());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const aspect = w / h;
    // 横長の画面でも縦長寄りの画面でも見える範囲が極端にならないよう視野角を決める
    const hfov = THREE.MathUtils.degToRad(100);
    const vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / aspect));
    this.camera.fov = Math.max(55, Math.min(75, vfov));
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.resize();
    this.cockpit.layout(aspect, this.camera.fov);
    this.hud.resize();
    if (h > w && this.state === 'playing') this.pause();
  }

  // ---------- 毎フレームの処理 ----------
  loop(now) {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.frame(dt);
    if (this.fpsEl) {
      this.fpsAcc += dt;
      this.fpsN++;
      if (this.fpsAcc > 0.5) {
        this.fpsEl.textContent = `${Math.round(this.fpsN / this.fpsAcc)} fps  pr ${this.renderer.pr.toFixed(2)}`;
        this.fpsAcc = 0;
        this.fpsN = 0;
      }
    }
  }

  frame(dt) {
    const sim = this.state === 'paused' ? 0 : dt;
    this.time += sim;
    this.input.update(sim);
    if (this.state === 'playing') {
      this.player.update(sim);
      this.comboTimer = Math.max(0, this.comboTimer - sim);
      if (this.comboTimer <= 0) this.combo = 0;
    } else if (this.state === 'title') {
      this.player.attract(sim);
    } else if (this.state === 'gameover') {
      this.player.update(sim);
    }
    this.applyCamera(sim);
    this.weapons.update(sim);
    this.enemies.update(sim);
    if (this.state === 'playing') this.waves.update(sim);
    this.effects.update(sim);
    this.space.update(sim);
    this.cockpit.update(sim);
    this.audio.update(sim);
    this.updatePost(sim);
    this.renderer.render(dt);
    this.hud.draw();
  }

  applyCamera(dt) {
    const p = this.player;
    const cam = this.camera;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake;
    const r = () => Math.random() - 0.5;
    if (dt > 0) this.shakeOff.set(r() * s * 0.7, r() * s * 0.7, 0);
    cam.position.copy(p.pos).add(this.shakeOff);
    cam.rotation.set(p.pitch + r() * s * 0.012, p.yaw + r() * s * 0.012, p.roll + r() * s * 0.02);
    cam.updateMatrixWorld();
    // 頭だけが揺れて、機体（コクピット）は少し遅れて見えるように逆方向へずらす
    this.cockpit.group.position.set(-this.shakeOff.x * 0.03, -this.shakeOff.y * 0.03, 0);
  }

  updatePost(dt) {
    const po = this.post;
    po.damage = Math.max(0, po.damage - dt * 2.2);
    po.shieldHit = Math.max(0, po.shieldHit - dt * 3);
    po.flash = Math.max(0, po.flash - dt * 1.5);
    const u = this.renderer.finalPass.uniforms;
    u.uDamage.value = po.damage;
    u.uShieldHit.value = po.shieldHit;
    u.uFlash.value = po.flash * po.flash;
    const p = this.player;
    u.uLowHull.value = this.state === 'playing' && p.hull < 30 ? (0.5 + 0.5 * Math.sin(this.time * 6)) * (1 - p.hull / 30) : 0;
    // 太陽の画面上の位置（レンズフレア用）
    const cam = this.camera;
    const sp = this._sun.copy(SUN_DIR).multiplyScalar(2700).add(cam.position);
    sp.project(cam);
    const inFront = sp.z < 1;
    const edge = Math.min(1 - Math.abs(sp.x), 1 - Math.abs(sp.y));
    u.uSunVis.value = inFront ? Math.max(0, Math.min(1, edge * 6)) : 0;
    u.uSunPos.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
  }
}

function boot() {
  try {
    const g = new Game();
    window.__game = g; // 動作確認用
  } catch (err) {
    console.error(err);
    $('loading-text').textContent = 'この端末では起動できませんでした（WebGL2 が必要です）。' + (err && err.message ? ` (${err.message})` : '');
  }
}

boot();
