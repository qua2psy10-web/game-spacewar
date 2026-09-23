// 描画まわり：HDR描画 → ブルーム → トーンマッピング → 仕上げ（レンズフレア・周辺減光・被弾演出）
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const QUALITY_PRESETS = {
  high: { maxPR: 2.0, samples: 4, stars: 9000, dust: 450, nebula: 1024 },
  medium: { maxPR: 1.5, samples: 2, stars: 6000, dust: 320, nebula: 768 },
  low: { maxPR: 1.0, samples: 0, stars: 3500, dust: 200, nebula: 512 },
};
const MIN_PR = 0.6;

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uAspect: { value: 1 },
    uSunPos: { value: new THREE.Vector2(0.5, 0.5) },
    uSunVis: { value: 0 },
    uDamage: { value: 0 },
    uShieldHit: { value: 0 },
    uLowHull: { value: 0 },
    uFlash: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAspect, uSunVis, uDamage, uShieldHit, uLowHull, uFlash;
    uniform vec2 uResolution, uSunPos;
    varying vec2 vUv;

    vec3 ghost(vec2 uv, vec2 sp, vec2 dir, float t, float r, vec3 c) {
      vec2 gp = sp + dir * t;
      float d = length((uv - gp) * vec2(uAspect, 1.0));
      return c * (smoothstep(r, r * 0.55, d) * 0.7 + smoothstep(r * 1.02, r, d) * smoothstep(r * 0.9, r, d) * 0.6);
    }

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0)) / (uAspect * uAspect * 0.25 + 0.25);

      // 色収差（画面端ほど強く、被弾時に増える）
      float ca = 0.0018 + uDamage * 0.008;
      vec3 col;
      col.r = texture2D(tDiffuse, uv - c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv + c * ca).b;

      // レンズフレア：太陽の位置の明るさで遮蔽を判定（コクピットの柱に隠れると消える）
      if (uSunVis > 0.001) {
        vec2 sp = uSunPos;
        vec2 px = 3.0 / uResolution;
        vec3 s = texture2D(tDiffuse, sp).rgb + texture2D(tDiffuse, sp + vec2(px.x, 0.0)).rgb
               + texture2D(tDiffuse, sp - vec2(px.x, 0.0)).rgb + texture2D(tDiffuse, sp + vec2(0.0, px.y)).rgb
               + texture2D(tDiffuse, sp - vec2(0.0, px.y)).rgb;
        float occ = smoothstep(2.5, 4.6, dot(s, vec3(0.3333)));
        float vis = uSunVis * occ;
        if (vis > 0.001) {
          vec2 dir = vec2(0.5) - sp;
          vec3 fl = vec3(0.0);
          fl += ghost(uv, sp, dir, 0.55, 0.035, vec3(0.30, 0.50, 1.00));
          fl += ghost(uv, sp, dir, 0.95, 0.018, vec3(0.90, 0.60, 0.25));
          fl += ghost(uv, sp, dir, 1.25, 0.070, vec3(0.20, 0.80, 0.50));
          fl += ghost(uv, sp, dir, 1.55, 0.028, vec3(0.70, 0.30, 0.90));
          fl += ghost(uv, sp, dir, 1.90, 0.110, vec3(0.25, 0.40, 0.90));
          fl *= 0.09;
          vec2 d2 = (uv - sp) * vec2(uAspect, 1.0);
          // 横に伸びる光条
          fl += vec3(0.45, 0.65, 1.0) * exp(-abs(d2.y) * 260.0) * exp(-abs(d2.x) * 2.2) * 0.55;
          // ハロー
          float hd = length(d2);
          fl += vec3(0.55, 0.60, 1.0) * exp(-pow((hd - 0.26) * 22.0, 2.0)) * 0.05;
          fl += vec3(1.0, 0.85, 0.65) * exp(-hd * 7.0) * 0.18;
          col += fl * vis;
        }
      }

      // 周辺減光
      float vig = smoothstep(1.25, 0.25, r2);
      col *= mix(0.55, 1.0, vig);

      // 被弾・シールド・船体危険の画面端演出
      float edge = smoothstep(0.12, 0.95, r2);
      col = mix(col, vec3(1.0, 0.08, 0.03), clamp(edge * uDamage * 0.8, 0.0, 1.0));
      col += vec3(0.25, 0.75, 1.0) * edge * uShieldHit * 0.45;
      col = mix(col, vec3(0.7, 0.0, 0.0), clamp(edge * uLowHull * 0.4, 0.0, 1.0));
      col += vec3(uFlash);

      // フィルムグレイン
      float n = fract(sin(dot(uv * uResolution + fract(uTime * 7.13) * 91.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * 0.03;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Renderer {
  constructor(canvas, setting) {
    this.setting = setting;
    this.preset = QUALITY_PRESETS[setting === 'auto' ? 'high' : setting] || QUALITY_PRESETS.high;
    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    }));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    // HDR（半精度浮動小数）の描画先が使えない端末では通常精度にする
    const ext = r.extensions;
    this.hdr = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.cap = Math.min(this.dpr, this.preset.maxPR);
    this.pr = this.cap;
    this.frameAvg = 16.7;
    this.slowTime = 0;
    this.fastTime = 0;
  }

  setup(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.buildComposer();
  }

  setQuality(setting) {
    this.setting = setting;
    this.preset = QUALITY_PRESETS[setting === 'auto' ? 'high' : setting] || QUALITY_PRESETS.high;
    this.cap = Math.min(this.dpr, this.preset.maxPR);
    this.pr = this.cap;
    this.buildComposer();
  }

  buildComposer() {
    const w = window.innerWidth, h = window.innerHeight;
    if (this.composer) {
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
      this.bloom.dispose();
      this.finalPass.dispose();
    }
    this.renderer.setPixelRatio(this.pr);
    this.renderer.setSize(w, h);
    const rt = new THREE.WebGLRenderTarget(1, 1, {
      type: this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
      samples: this.preset.samples,
    });
    const c = (this.composer = new EffectComposer(this.renderer, rt));
    c.addPass(new RenderPass(this.scene, this.camera));
    // 強さ, 広がり, しきい値（HDRで1を超える光だけがにじむ）
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.85, 0.6, this.hdr ? 0.92 : 0.75);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    this.finalPass = new ShaderPass(FinalShader);
    c.addPass(this.finalPass);
    c.setPixelRatio(this.pr);
    c.setSize(w, h);
    this.updateUniformSize();
  }

  updateUniformSize() {
    const w = window.innerWidth, h = window.innerHeight;
    const u = this.finalPass.uniforms;
    u.uResolution.value.set(w * this.pr, h * this.pr);
    u.uAspect.value = w / h;
  }

  setPR(pr) {
    this.pr = Math.max(MIN_PR, Math.min(this.cap, pr));
    this.renderer.setPixelRatio(this.pr);
    this.composer.setPixelRatio(this.pr);
    this.updateUniformSize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.updateUniformSize();
  }

  // 自動画質：処理が重いと感じたら解像度を下げ、余裕があれば戻す
  adapt(dt) {
    if (this.setting !== 'auto' || dt <= 0) return;
    const ms = dt * 1000;
    this.frameAvg += (ms - this.frameAvg) * 0.05;
    if (this.frameAvg > 21) {
      this.slowTime += dt;
      this.fastTime = 0;
    } else if (this.frameAvg < 17.6) {
      this.fastTime += dt;
      this.slowTime = 0;
    } else {
      this.slowTime = 0;
      this.fastTime = 0;
    }
    if (this.slowTime > 1.5 && this.pr > MIN_PR) {
      // 下げたあとは、失敗した解像度より少し下を上限にして行ったり来たりを防ぐ
      this.cap = Math.max(MIN_PR, this.pr - 0.05);
      this.setPR(this.pr - 0.15);
      this.slowTime = 0;
      this.frameAvg = 17;
    } else if (this.fastTime > 6 && this.pr < this.cap) {
      this.setPR(this.pr + 0.1);
      this.fastTime = 0;
    }
  }

  render(dt) {
    this.finalPass.uniforms.uTime.value += dt;
    this.composer.render(dt);
    this.adapt(dt);
  }
}
