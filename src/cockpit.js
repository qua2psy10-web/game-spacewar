// コクピット：キャノピーの枠、計器盤、画面、キャノピーガラス（汚れ・太陽の映り込み・ひび）
import * as THREE from 'three';
import { NOISE_GLSL } from './noise.js';
import { SUN_DIR } from './space.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const SCREEN_W = 384;
const SCREEN_H = 128;

const glassMaterial = (crackTex) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uSunDir: { value: SUN_DIR.clone() },
      uCrack: { value: crackTex },
      uHit: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vDir;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vDir = wp.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform sampler2D uCrack;
      uniform float uHit;
      varying vec2 vUv;
      varying vec3 vDir;
      ${NOISE_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        float s = max(dot(d, uSunDir), 0.0);
        // 汚れ・くもり
        float dirt = fbm2(vUv * vec2(7.0, 3.5));
        dirt = smoothstep(0.42, 0.85, dirt) + smoothstep(0.6, 0.9, fbm2(vUv * vec2(26.0, 13.0) + 5.0)) * 0.4;
        float glare = pow(s, 6.0) * 0.14 + pow(s, 30.0) * 0.5 + pow(s, 300.0) * 1.5;
        vec3 col = vec3(1.0, 0.94, 0.84) * (dirt * 0.5 + 0.03) * glare;
        // 下側に計器の光がうっすら映り込む
        col += vec3(0.12, 0.45, 0.5) * 0.02 * smoothstep(0.32, 0.0, vUv.y);
        vec4 cr = texture2D(uCrack, vUv);
        col += cr.rgb * (0.11 + glare * 1.6 + uHit * 0.3);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

export class Cockpit {
  constructor(g) {
    this.g = g;
    this.group = new THREE.Group();
    g.camera.add(this.group);
    const hull = g.tex.hull;
    this.frameMat = new THREE.MeshStandardMaterial({
      color: 0x2e3238,
      metalness: 0.45,
      roughness: 0.55,
      map: hull.map,
      bumpMap: hull.bump,
      bumpScale: 0.5,
    });
    this.dashMat = new THREE.MeshStandardMaterial({
      color: 0x1d2024,
      metalness: 0.3,
      roughness: 0.78,
      map: hull.map,
      bumpMap: hull.bump,
      bumpScale: 0.4,
    });
    this.rubberMat = new THREE.MeshStandardMaterial({ color: 0x050506, metalness: 0.05, roughness: 0.95 });

    const box = new THREE.BoxGeometry(1, 1, 1);
    const strut = (mat) => {
      const m = new THREE.Mesh(box, mat);
      this.group.add(m);
      return m;
    };
    this.pillarL = strut(this.frameMat);
    this.pillarR = strut(this.frameMat);
    this.sealL = strut(this.rubberMat);
    this.sealR = strut(this.rubberMat);
    this.topBar = strut(this.frameMat);
    this.hood = strut(this.rubberMat);

    this.dashGeo = new THREE.BufferGeometry();
    this.dashGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    this.dashGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 1, 2.2, 1, 0, 0, 2.2, 0]), 2));
    this.dashGeo.setIndex([0, 2, 1, 2, 3, 1]);
    this.dash = new THREE.Mesh(this.dashGeo, this.dashMat);
    this.group.add(this.dash);

    // 計器画面
    this.screens = [];
    for (let i = 0; i < 3; i++) {
      const c = document.createElement('canvas');
      c.width = SCREEN_W;
      c.height = SCREEN_H;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
      );
      const bezel = new THREE.Mesh(box, this.rubberMat);
      this.group.add(m, bezel);
      this.screens.push({ canvas: c, ctx: c.getContext('2d'), tex, mesh: m, bezel });
    }

    // 表示灯
    this.leds = [];
    const ledGeo = new THREE.BoxGeometry(1, 1, 1);
    const ledColors = [
      [1.6, 0.14, 0.08], [0.12, 1.6, 0.32], [1.6, 0.9, 0.12], [0.12, 1.6, 0.32], [0.16, 0.56, 2], [1.6, 0.14, 0.08],
    ];
    for (let i = 0; i < 12; i++) {
      const c = ledColors[i % ledColors.length];
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0], c[1], c[2]) });
      const m = new THREE.Mesh(ledGeo, mat);
      this.group.add(m);
      this.leds.push({ mesh: m, base: new THREE.Color(c[0], c[1], c[2]), rate: 0.5 + Math.random() * 2.5, phase: Math.random() * 10, blink: Math.random() < 0.5 });
    }

    // キャノピーガラス
    this.crackCanvas = document.createElement('canvas');
    this.crackCanvas.width = 1024;
    this.crackCanvas.height = 512;
    this.crackCtx = this.crackCanvas.getContext('2d');
    this.crackTex = new THREE.CanvasTexture(this.crackCanvas);
    this.glassMat = glassMaterial(this.crackTex);
    this.glass = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.glassMat);
    this.glass.renderOrder = 100;
    this.glass.frustumCulled = false;
    this.group.add(this.glass);

    // 室内灯と、射撃時に枠を照らす光
    this.cabinLight = new THREE.PointLight(0x66ddff, 0.05, 2.5, 2);
    this.cabinLight.position.set(0, -0.2, -0.3);
    this.muzzleLight = new THREE.PointLight(0xff7a50, 0, 8, 2);
    this.muzzleLight.position.set(0, -0.6, -1.6);
    this.group.add(this.cabinLight, this.muzzleLight);

    this.glitch = 0;
    this.screenT = 0;
    this.layout(g.camera.aspect, g.camera.fov);
  }

  // 画面の縦横比に合わせて枠と計器盤を配置し直す
  layout(aspect, fov) {
    const th = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const tw = th * aspect;
    const P = (xn, yn, z) => new THREE.Vector3(xn * tw * -z, yn * th * -z, z);
    const place = (mesh, a, b, w, d) => {
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      dir.normalize();
      mesh.position.addVectors(a, b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(Y_AXIS, dir);
      mesh.scale.set(w, len, d);
    };
    place(this.pillarL, P(-1.02, -0.62, -0.5), P(-0.78, 1.1, -0.82), 0.04, 0.045);
    place(this.pillarR, P(1.02, -0.62, -0.5), P(0.78, 1.1, -0.82), 0.04, 0.045);
    place(this.sealL, P(-0.985, -0.62, -0.52), P(-0.75, 1.1, -0.84), 0.01, 0.035);
    place(this.sealR, P(0.985, -0.62, -0.52), P(0.75, 1.1, -0.84), 0.01, 0.035);
    place(this.topBar, P(-0.85, 0.975, -0.84), P(0.85, 0.975, -0.84), 0.05, 0.06);
    place(this.hood, P(-0.66, -0.535, -0.63), P(0.66, -0.535, -0.63), 0.03, 0.1);

    const TL = P(-1.45, -0.56, -0.62), TR = P(1.45, -0.56, -0.62);
    const BL = P(-1.45, -1.6, -0.36), BR = P(1.45, -1.6, -0.36);
    const pa = this.dashGeo.attributes.position;
    [TL, TR, BL, BR].forEach((v, i) => pa.setXYZ(i, v.x, v.y, v.z));
    pa.needsUpdate = true;
    this.dashGeo.computeVertexNormals();
    this.dashGeo.computeBoundingSphere();

    const right = new THREE.Vector3().subVectors(TR, TL);
    const W = right.length();
    right.normalize();
    const midTop = new THREE.Vector3().addVectors(TL, TR).multiplyScalar(0.5);
    const midBot = new THREE.Vector3().addVectors(BL, BR).multiplyScalar(0.5);
    const down = new THREE.Vector3().subVectors(midBot, midTop);
    const H = down.length();
    down.normalize();
    const normal = new THREE.Vector3().crossVectors(down, right).normalize();
    const up = down.clone().negate();
    const basis = new THREE.Matrix4().makeBasis(right, up, normal);
    const q = new THREE.Quaternion().setFromRotationMatrix(basis);
    const onPanel = (u, v, lift) =>
      midTop.clone().addScaledVector(right, (u - 0.5) * W * (1 - v * (1 - BL.distanceTo(BR) / W))).addScaledVector(down, v * H).addScaledVector(normal, lift);

    const sw = W * 0.125;
    const sh = Math.min(H * 0.26, sw / 2.4);
    const us = [0.33, 0.5, 0.67];
    this.screens.forEach((s, i) => {
      s.mesh.position.copy(onPanel(us[i], 0.27, 0.007));
      s.mesh.quaternion.copy(q);
      s.mesh.scale.set(sw, sh, 1);
      s.bezel.position.copy(onPanel(us[i], 0.27, 0.002));
      s.bezel.quaternion.copy(q);
      s.bezel.scale.set(sw * 1.08, sh * 1.16, 0.004);
    });
    this.leds.forEach((l, i) => {
      const side = i < 6 ? -1 : 1;
      const k = i % 6;
      const u = 0.5 + side * (0.25 + (k % 3) * 0.022);
      const v = 0.12 + Math.floor(k / 3) * 0.08;
      l.mesh.position.copy(onPanel(u, v, 0.003));
      l.mesh.quaternion.copy(q);
      l.mesh.scale.set(0.009, 0.006, 0.004);
    });

    const gz = 0.3;
    this.glass.position.set(0, 0, -gz);
    this.glass.scale.set(2 * tw * gz * 1.04, 2 * th * gz * 1.04, 1);
  }

  flashMuzzle() {
    this.muzzleLight.intensity = 1.6;
  }

  clearCracks() {
    this.crackCtx.clearRect(0, 0, 1024, 512);
    this.crackTex.needsUpdate = true;
  }

  // ガラスのひび：衝撃点から放射状に伸びる割れ目と、それをつなぐ同心円状の割れ目
  addCrack(u = Math.random(), v = 0.25 + Math.random() * 0.6) {
    const x = this.crackCtx;
    const cx = u * 1024, cy = (1 - v) * 512;
    x.strokeStyle = 'rgba(215,232,255,0.55)';
    x.lineWidth = 1.3;
    x.lineCap = 'round';
    const n = 6 + ((Math.random() * 5) | 0);
    const ends = [];
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      let px = cx, py = cy;
      const L = 50 + Math.random() * 190;
      const pts = [];
      x.beginPath();
      x.moveTo(px, py);
      for (let s = 0; s < L; s += 10 + Math.random() * 12) {
        a += (Math.random() - 0.5) * 0.5;
        px += Math.cos(a) * 12;
        py += Math.sin(a) * 12 * 0.6;
        x.lineTo(px, py);
        pts.push([px, py]);
      }
      x.stroke();
      ends.push(pts);
    }
    x.strokeStyle = 'rgba(215,232,255,0.35)';
    x.lineWidth = 1;
    for (const ring of [2, 5]) {
      x.beginPath();
      ends.forEach((pts, i) => {
        const p = pts[Math.min(ring, pts.length - 1)];
        if (i === 0) x.moveTo(p[0], p[1]);
        else x.lineTo(p[0] + (Math.random() - 0.5) * 6, p[1] + (Math.random() - 0.5) * 6);
      });
      x.closePath();
      x.stroke();
    }
    const gr = x.createRadialGradient(cx, cy, 0, cx, cy, 14);
    gr.addColorStop(0, 'rgba(230,240,255,0.7)');
    gr.addColorStop(1, 'rgba(230,240,255,0)');
    x.fillStyle = gr;
    x.fillRect(cx - 14, cy - 14, 28, 28);
    this.crackTex.needsUpdate = true;
  }

  update(dt) {
    const g = this.g;
    this.muzzleLight.intensity *= Math.exp(-dt * 22);
    this.glitch = Math.max(0, this.glitch - dt);
    this.glassMat.uniforms.uHit.value = Math.max(0, this.glassMat.uniforms.uHit.value - dt * 3);
    const t = g.time;
    for (const l of this.leds) {
      const on = !l.blink || Math.sin(t * l.rate * 6 + l.phase) > -0.2;
      const k = on ? 1 : 0.05;
      l.mesh.material.color.setRGB(l.base.r * k, l.base.g * k, l.base.b * k);
    }
    this.screenT += dt;
    if (this.screenT > 1 / 12) {
      this.screenT = 0;
      this.drawScreens();
    }
  }

  drawScreens() {
    const g = this.g;
    const p = g.player;
    const [radar, sys, tgt] = this.screens.map((s) => s.ctx);
    const W = SCREEN_W, H = SCREEN_H;
    const green = '#7dffc0', dim = 'rgba(125,255,192,0.25)', red = '#ff5a48', amber = '#ffc050';
    const bg = (x) => {
      x.fillStyle = '#021410';
      x.fillRect(0, 0, W, H);
      x.strokeStyle = 'rgba(125,255,192,0.08)';
      x.lineWidth = 1;
      for (let y = 0; y < H; y += 3) {
        x.beginPath(); x.moveTo(0, y + 0.5); x.lineTo(W, y + 0.5); x.stroke();
      }
    };

    // 左：レーダー（上から見た敵の位置）
    bg(radar);
    radar.save();
    radar.translate(W / 2, H - 8);
    radar.strokeStyle = dim;
    radar.lineWidth = 1.5;
    for (const r of [40, 80, 118]) {
      radar.beginPath(); radar.arc(0, 0, r, Math.PI, 0); radar.stroke();
    }
    radar.beginPath(); radar.moveTo(0, 0); radar.lineTo(0, -118); radar.stroke();
    const sweep = (g.time * 2) % Math.PI;
    radar.strokeStyle = 'rgba(125,255,192,0.5)';
    radar.beginPath(); radar.moveTo(0, 0); radar.lineTo(-Math.cos(sweep) * 118, -Math.sin(sweep) * 118); radar.stroke();
    for (const e of g.enemies.list) {
      if (e.removed || !e.mesh.visible) continue;
      const rx = (e.pos.x - p.pos.x) / 1100 * 118 * 1.9;
      const rz = (-e.pos.z) / 1100 * 118;
      if (rz < -4 || rz > 122 || Math.abs(rx) > W / 2) continue;
      radar.fillStyle = e.type === 'missile' ? red : e.type === 'bomber' ? amber : green;
      const s = e.type === 'bomber' ? 5 : 3;
      radar.fillRect(rx - s / 2, -rz - s / 2, s, s);
    }
    radar.fillStyle = green;
    radar.beginPath(); radar.moveTo(0, -6); radar.lineTo(5, 4); radar.lineTo(-5, 4); radar.closePath(); radar.fill();
    radar.restore();
    radar.fillStyle = green;
    radar.font = 'bold 16px monospace';
    radar.fillText('RADAR', 10, 22);

    // 中央：機体の状態
    bg(sys);
    sys.font = 'bold 17px monospace';
    const bar = (x, y, w, v, col, label) => {
      sys.fillStyle = green;
      sys.fillText(label, x, y + 13);
      sys.strokeStyle = dim;
      sys.strokeRect(x + 62, y, w, 16);
      sys.fillStyle = col;
      sys.fillRect(x + 64, y + 2, (w - 4) * Math.max(0, Math.min(1, v)), 12);
    };
    bar(12, 14, 290, p.shield / 100, '#5ad8ff', 'SHLD');
    bar(12, 40, 290, p.hull / 100, p.hull < 30 ? red : green, 'HULL');
    bar(12, 66, 290, p.heat, p.overheated ? red : amber, 'HEAT');
    sys.fillStyle = green;
    sys.fillText(`MSL ${p.missiles}`, 12, 112);
    sys.fillText(`WAVE ${g.waves.n}`, 130, 112);
    if (p.overheated && Math.sin(g.time * 14) > 0) {
      sys.fillStyle = red;
      sys.fillText('OVERHEAT', 262, 112);
    }

    // 右：目標情報
    bg(tgt);
    const w = g.weapons;
    const e = w.lockTarget;
    tgt.font = 'bold 17px monospace';
    if (e && !e.removed) {
      const names = { scout: 'SCOUT', fighter: 'FIGHTER', bomber: 'BOMBER' };
      tgt.fillStyle = w.locked ? red : green;
      tgt.fillText(w.locked ? 'LOCKED' : 'TRACKING', 12, 26);
      tgt.fillStyle = green;
      tgt.fillText(names[e.type] || '', 12, 56);
      tgt.fillText(`${Math.round(e.pos.distanceTo(p.pos))} m`, 200, 56);
      tgt.strokeStyle = dim;
      tgt.strokeRect(12, 78, 340, 16);
      tgt.fillStyle = amber;
      tgt.fillRect(14, 80, 336 * Math.max(0, e.hp / e.def.hp), 12);
    } else {
      tgt.fillStyle = dim;
      tgt.fillText('NO TARGET', 12, 26);
      tgt.fillStyle = 'rgba(125,255,192,0.12)';
      for (let i = 0; i < 30; i++) tgt.fillRect(Math.random() * W, 40 + Math.random() * 80, 20 + Math.random() * 60, 2);
    }

    // 被弾直後は画面が乱れる
    if (this.glitch > 0) {
      for (const s of this.screens) {
        const x = s.ctx;
        for (let i = 0; i < 6; i++) {
          const y = Math.random() * H, h = 4 + Math.random() * 14;
          x.drawImage(s.canvas, 0, y, W, h, (Math.random() - 0.5) * 60, y, W, h);
        }
        x.fillStyle = `rgba(255,80,60,${0.25 * this.glitch})`;
        x.fillRect(0, 0, W, H);
      }
    }
    for (const s of this.screens) s.tex.needsUpdate = true;
  }
}
