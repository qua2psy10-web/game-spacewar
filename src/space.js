// 宇宙空間：星雲（起動時に1回だけ計算して焼き込む）、星、惑星、太陽、宇宙塵、小惑星
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { NOISE_GLSL, jnoise } from './noise.js';

export const SUN_DIR = new THREE.Vector3(-0.78, 0.5, 0.22).normalize();
const PLANET_DIR = new THREE.Vector3(0.62, -0.42, -1).normalize();
const PLANET_DIST = 2350;
const PLANET_R = 640;
const SUN_DIST = 2700;
const STAR_R = 2900;

const nebulaMaterial = () =>
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uSunDir;
      ${NOISE_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        // 天の川のような帯
        vec3 bandN = normalize(vec3(0.25, 1.0, 0.35));
        float bd = dot(d, bandN);
        float band = exp(-bd * bd * 12.0);
        vec3 q = d * 2.2;
        float w = fbm(q + vec3(fbm(q * 2.0 + 3.1), fbm(q * 2.0 + 7.3), fbm(q * 2.0 + 1.7)) * 1.6);
        float fine = fbm(d * 9.0);
        float dust = fbm(d * 5.0 + 11.0);
        vec3 col = vec3(0.0);
        vec3 bandCol = mix(vec3(0.55, 0.50, 0.45), vec3(0.35, 0.42, 0.60), fbm4(d * 3.0 + 4.0));
        col += bandCol * band * pow(fine, 2.2) * 0.42;
        // 星雲のガス
        float neb = smoothstep(0.38, 0.85, w);
        vec3 nebA = vec3(0.60, 0.13, 0.32);
        vec3 nebB = vec3(0.10, 0.30, 0.60);
        vec3 nebC = vec3(0.65, 0.38, 0.16);
        vec3 nc = mix(nebA, nebB, smoothstep(0.38, 0.62, fbm4(d * 1.6 + 20.0)));
        nc = mix(nc, nebC, smoothstep(0.55, 0.75, fbm4(d * 2.4 + 40.0)) * 0.55);
        col += nc * neb * neb * 0.20 * (0.45 + band);
        col += nc * pow(smoothstep(0.62, 0.95, w), 3.0) * 0.55;
        // 暗黒星雲（塵の帯）
        float lanes = smoothstep(0.47, 0.68, dust) * (0.35 + band);
        col *= 1.0 - clamp(lanes, 0.0, 0.85);
        // 細かな背景の星
        vec3 cell = floor(d * 720.0);
        float h = hash(cell);
        float star = smoothstep(0.9982, 1.0, h);
        vec3 sc = mix(vec3(1.0, 0.82, 0.66), vec3(0.72, 0.84, 1.0), hash(cell + 3.7));
        col += sc * star * (0.12 + 0.8 * band) * (0.3 + hash(cell + 1.3));
        // 太陽方向の淡い散乱光（環境反射用に効く）
        float sd = max(dot(d, uSunDir), 0.0);
        col += vec3(1.0, 0.85, 0.65) * (pow(sd, 24.0) * 0.35 + pow(sd, 400.0) * 6.0);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    uniforms: { uSunDir: { value: SUN_DIR.clone() } },
  });

const starMaterial = (pr) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uPR: { value: pr } },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec3 color;
      uniform float uPR;
      varying vec3 vColor;
      void main() {
        vColor = color;
        gl_PointSize = size * uPR;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float r = length(p) * 2.0;
        float a = exp(-r * r * 5.0) + exp(-r * 12.0) * 0.6;
        gl_FragColor = vec4(vColor * a, 1.0);
      }
    `,
  });

const planetMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uSunDir: { value: SUN_DIR.clone() }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vObjN;
      varying vec3 vWorld;
      void main() {
        vObjN = normal;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform float uTime;
      varying vec3 vN;
      varying vec3 vObjN;
      varying vec3 vWorld;
      ${NOISE_GLSL}
      void main() {
        vec3 on = normalize(vObjN);
        float h = fbm(on * 2.4 + vec3(4.0));
        float landMask = smoothstep(0.50, 0.53, h);
        vec3 ocean = mix(vec3(0.004, 0.018, 0.055), vec3(0.01, 0.05, 0.11), smoothstep(0.30, 0.51, h));
        vec3 land = mix(vec3(0.06, 0.075, 0.035), vec3(0.19, 0.15, 0.09), smoothstep(0.54, 0.68, h));
        land = mix(land, vec3(0.30, 0.26, 0.20), smoothstep(0.66, 0.75, h));
        vec3 base = mix(ocean, land, landMask);
        float pole = smoothstep(0.78, 0.9, abs(on.y) + (h - 0.5) * 0.3);
        base = mix(base, vec3(0.65), pole);
        // 雲（ゆっくり流れる）
        float ca = uTime * 0.004;
        vec3 cp = vec3(on.x * cos(ca) - on.z * sin(ca), on.y, on.x * sin(ca) + on.z * cos(ca));
        float cl = smoothstep(0.48, 0.78, fbm4(cp * 3.2 + fbm4(cp * 6.0) * 0.8));

        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        float ndl = dot(N, uSunDir);
        float diff = max(ndl, 0.0);
        float day = smoothstep(-0.12, 0.2, ndl);
        vec3 col = base * diff * 1.4;
        // 海面の反射
        vec3 H = normalize(uSunDir + V);
        float spec = pow(max(dot(N, H), 0.0), 70.0) * (1.0 - landMask) * (1.0 - cl);
        col += vec3(1.0, 0.88, 0.7) * spec * diff * 1.4;
        col = mix(col, vec3(0.85) * (diff * 0.8 + 0.004), cl * 0.85);
        // 夜側の都市の明かり
        float city = smoothstep(0.72, 0.9, noise(on * 90.0)) * landMask * (1.0 - cl) * (1.0 - day) * (1.0 - pole);
        col += vec3(1.0, 0.62, 0.28) * city * 0.35;
        // 大気の縁
        float fres = pow(1.0 - max(dot(N, V), 0.0), 2.6);
        float lit = smoothstep(-0.25, 0.45, ndl);
        col += vec3(0.25, 0.55, 1.0) * fres * lit * 1.4;
        col = mix(col, col + vec3(0.9, 0.45, 0.2) * 0.25, fres * smoothstep(0.25, 0.0, abs(ndl)));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

const haloMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    uniforms: { uSunDir: { value: SUN_DIR.clone() }, uR: { value: PLANET_R }, uRa: { value: PLANET_R * 1.07 } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vCenter;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform float uR, uRa;
      varying vec3 vWorld;
      varying vec3 vCenter;
      void main() {
        vec3 rd = normalize(vWorld - cameraPosition);
        vec3 oc = vCenter - cameraPosition;
        float tc = dot(oc, rd);
        vec3 closest = cameraPosition + rd * tc;
        float b = length(closest - vCenter);
        float t = clamp((b - uR) / (uRa - uR), 0.0, 1.0);
        float glow = exp(-t * 5.0) * (1.0 - t);
        vec3 p = normalize(closest - vCenter);
        float lit = smoothstep(-0.35, 0.6, dot(p, uSunDir));
        vec3 col = mix(vec3(0.20, 0.45, 1.0), vec3(0.55, 0.75, 1.0), lit) * glow * lit * 1.3;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

export class Space {
  constructor(g, preset) {
    this.g = g;
    this.scene = g.scene;
    this.sky = new THREE.Group();
    this.scene.add(this.sky);
    this.bakeNebula(g.renderer.renderer, preset.nebula);
    this.makeStars(preset.stars);
    this.makePlanet();
    this.makeSun();
    this.makeLights();
    this.makeDust(preset.dust);
    this.makeAsteroids();
  }

  bakeNebula(renderer, size) {
    const rt = new THREE.WebGLCubeRenderTarget(size, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    const cam = new THREE.CubeCamera(1, 100, rt);
    const bakeScene = new THREE.Scene();
    const mat = nebulaMaterial();
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(50, 96, 48), mat);
    bakeScene.add(sphere);
    cam.update(renderer, bakeScene);
    sphere.geometry.dispose();
    mat.dispose();
    this.scene.background = rt.texture;
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromCubemap(rt.texture).texture;
    this.scene.environmentIntensity = 1.2;
    pmrem.dispose();
  }

  makeStars(n) {
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const bandN = new THREE.Vector3(0.25, 1.0, 0.35).normalize();
    const v = new THREE.Vector3();
    const palette = [
      [0.62, 0.74, 1.0], [0.8, 0.87, 1.0], [1.0, 1.0, 1.0], [1.0, 0.94, 0.82], [1.0, 0.82, 0.6], [1.0, 0.66, 0.45],
    ];
    for (let i = 0; i < n; i++) {
      // 半分は天の川の帯に集める
      do {
        v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
      } while (v.lengthSq() > 1 || v.lengthSq() < 0.01);
      v.normalize();
      if (i % 2 === 0) {
        const d = v.dot(bandN);
        v.addScaledVector(bandN, -d * 0.8).normalize();
      }
      v.multiplyScalar(STAR_R);
      pos.set([v.x, v.y, v.z], i * 3);
      const p = palette[(Math.random() * palette.length) | 0];
      // 明るさは指数分布：ほとんど暗く、ごく一部だけ強く光る
      const r = Math.random();
      const b = 0.1 + Math.pow(r, 6) * 1.7;
      col.set([p[0] * b, p[1] * b, p[2] * b], i * 3);
      size[i] = 1.1 + Math.pow(r, 4) * 3.2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    this.starMat = starMaterial(this.g.renderer.pr);
    const stars = new THREE.Points(geo, this.starMat);
    stars.renderOrder = -10;
    stars.frustumCulled = false;
    this.sky.add(stars);
  }

  makePlanet() {
    this.planetMat = planetMaterial();
    const planet = new THREE.Mesh(new THREE.SphereGeometry(PLANET_R, 96, 64), this.planetMat);
    planet.position.copy(PLANET_DIR).multiplyScalar(PLANET_DIST);
    planet.rotation.set(0.35, 1.2, 0.2);
    planet.renderOrder = -7;
    planet.frustumCulled = false;
    const halo = new THREE.Mesh(new THREE.SphereGeometry(PLANET_R * 1.07, 64, 48), haloMaterial());
    halo.position.copy(planet.position);
    halo.renderOrder = -8;
    halo.frustumCulled = false;
    this.planet = planet;
    this.sky.add(halo, planet);
  }

  makeSun() {
    const tex = this.g.tex.glow;
    const mk = (scale, r, g, b, order) => {
      const m = new THREE.SpriteMaterial({
        map: tex,
        color: new THREE.Color(r, g, b),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      });
      const s = new THREE.Sprite(m);
      s.scale.setScalar(scale);
      s.position.copy(SUN_DIR).multiplyScalar(SUN_DIST);
      s.renderOrder = order;
      s.frustumCulled = false;
      this.sky.add(s);
      return s;
    };
    mk(1300, 0.28, 0.22, 0.16, -6);
    mk(260, 3.0, 2.6, 2.1, -5);
    mk(70, 40, 36, 30, -4);
  }

  makeLights() {
    const sun = new THREE.DirectionalLight(0xfff0dc, 3.4);
    sun.position.copy(SUN_DIR).multiplyScalar(100);
    // 惑星からの照り返しと、影側が真っ黒にならない程度の補助光
    const planetFill = new THREE.DirectionalLight(0x6688cc, 0.9);
    planetFill.position.copy(PLANET_DIR).multiplyScalar(100);
    const hemi = new THREE.HemisphereLight(0x6b7fa8, 0x1c1612, 0.9);
    this.scene.add(sun, sun.target, planetFill, planetFill.target, hemi);
  }

  makeDust(n) {
    this.dustN = n;
    this.dustP = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.resetDust(i, true);
    const geo = new THREE.BufferGeometry();
    this.dustPos = new Float32Array(n * 6);
    this.dustCol = new Float32Array(n * 6);
    geo.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.dustCol, 3));
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.LineSegments(geo, mat);
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 1;
    this.scene.add(this.dust);
  }

  resetDust(i, anyZ) {
    const p = this.g.player ? this.g.player.pos : { x: 0, y: 0 };
    const d = this.dustP;
    d[i * 3] = p.x + (Math.random() * 2 - 1) * 80;
    d[i * 3 + 1] = p.y + (Math.random() * 2 - 1) * 50;
    d[i * 3 + 2] = anyZ ? -Math.random() * 420 + 20 : -400 - Math.random() * 20;
  }

  makeAsteroids() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8a8075,
      roughness: 0.95,
      metalness: 0.0,
      map: this.g.tex.rock,
      bumpMap: this.g.tex.rock,
      bumpScale: 2.5,
    });
    this.asteroids = [];
    for (let k = 0; k < 6; k++) {
      let geo = new THREE.IcosahedronGeometry(1, 4);
      geo.deleteAttribute('normal');
      geo.deleteAttribute('uv');
      geo = mergeVertices(geo);
      const p = geo.attributes.position;
      const o = k * 13.7;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        let s = 1 + 0.42 * (jnoise(x * 1.4 + o, y * 1.4, z * 1.4) - 0.5) + 0.14 * (jnoise(x * 4 + o, y * 4, z * 4) - 0.5);
        s += 0.05 * (jnoise(x * 9 + o, y * 9, z * 9) - 0.5);
        p.setXYZ(i, x * s, y * s * 0.8, z * s);
      }
      // 球面投影でUVを付ける
      const uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        uv[i * 2] = Math.atan2(z, x) / (Math.PI * 2) + 0.5;
        uv[i * 2 + 1] = Math.asin(Math.max(-1, Math.min(1, y / Math.hypot(x, y, z)))) / Math.PI + 0.5;
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      this.scene.add(m);
      this.asteroids.push({ mesh: m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), wait: k * 4 + Math.random() * 3 });
    }
  }

  spawnAsteroid(a) {
    const p = this.g.player.pos;
    const s = 6 + Math.random() * 36;
    const side = Math.random() < 0.5 ? -1 : 1;
    const m = a.mesh;
    m.scale.set(s, s * (0.7 + Math.random() * 0.5), s * (0.8 + Math.random() * 0.4));
    m.position.set(p.x + side * (110 + s + Math.random() * 260), p.y + (Math.random() * 2 - 1) * 160, -1500 - Math.random() * 400);
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    a.vel.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    a.spin.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3);
    m.visible = true;
  }

  update(dt) {
    const g = this.g;
    const cam = g.camera;
    const S = g.S;
    this.sky.position.copy(cam.position);
    this.planetMat.uniforms.uTime.value = g.time;
    this.planet.rotation.y += dt * 0.004;
    this.starMat.uniforms.uPR.value = g.renderer.pr;

    // 宇宙塵：速度に応じて線状に伸ばす
    const d = this.dustP, P = this.dustPos, C = this.dustCol;
    const px = g.player.pos.x, py = g.player.pos.y;
    const len = S * 0.045;
    for (let i = 0; i < this.dustN; i++) {
      const j = i * 3;
      d[j + 2] += S * dt;
      if (d[j + 2] > 20) this.resetDust(i, false);
      if (d[j] - px > 80) d[j] -= 160; else if (d[j] - px < -80) d[j] += 160;
      if (d[j + 1] - py > 50) d[j + 1] -= 100; else if (d[j + 1] - py < -50) d[j + 1] += 100;
      const z = d[j + 2];
      const k = i * 6;
      P[k] = d[j]; P[k + 1] = d[j + 1]; P[k + 2] = z;
      P[k + 3] = d[j]; P[k + 4] = d[j + 1]; P[k + 5] = z - len;
      const fade = Math.min(1, (z + 420) / 120) * Math.min(1, (20 - z) / 30);
      const b = 0.55 * fade;
      C[k] = b * 0.8; C[k + 1] = b * 0.88; C[k + 2] = b;
      C[k + 3] = 0; C[k + 4] = 0; C[k + 5] = 0;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
    this.dust.geometry.attributes.color.needsUpdate = true;

    // 小惑星：たまに遠くを通り過ぎる
    for (const a of this.asteroids) {
      const m = a.mesh;
      if (!m.visible) {
        a.wait -= dt;
        if (a.wait <= 0) this.spawnAsteroid(a);
        continue;
      }
      m.position.x += a.vel.x * dt;
      m.position.y += a.vel.y * dt;
      m.position.z += (S + a.vel.z) * dt;
      m.rotation.x += a.spin.x * dt;
      m.rotation.y += a.spin.y * dt;
      m.rotation.z += a.spin.z * dt;
      if (m.position.z > 80) {
        m.visible = false;
        a.wait = 3 + Math.random() * 10;
      }
    }
  }
}
