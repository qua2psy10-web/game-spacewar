// 画像ファイルを使わず、Canvas で質感テクスチャを作る
import * as THREE from 'three';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function addNoise(ctx, w, h, amount) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// 機体外板：パネルの継ぎ目、リベット、汚れ
function makeHull(size = 512) {
  const c = makeCanvas(size, size);
  const x = c.getContext('2d');
  const b = makeCanvas(size, size);
  const y = b.getContext('2d');
  x.fillStyle = '#8a8e94';
  x.fillRect(0, 0, size, size);
  y.fillStyle = '#9a9a9a';
  y.fillRect(0, 0, size, size);

  const rects = [];
  const split = (px, py, w, h, d) => {
    if (d > 4 || (d > 1 && Math.random() < 0.22) || w < 48 || h < 48) {
      rects.push([px, py, w, h]);
      return;
    }
    const vertical = w > h ? Math.random() < 0.8 : Math.random() < 0.2;
    if (vertical) {
      const s = Math.round(w * (0.3 + Math.random() * 0.4));
      split(px, py, s, h, d + 1);
      split(px + s, py, w - s, h, d + 1);
    } else {
      const s = Math.round(h * (0.3 + Math.random() * 0.4));
      split(px, py, w, s, d + 1);
      split(px, py + s, w, h - s, d + 1);
    }
  };
  split(0, 0, size, size, 0);

  for (const [px, py, w, h] of rects) {
    const t = 128 + (Math.random() - 0.5) * 34;
    x.fillStyle = `rgb(${t | 0},${(t + 2) | 0},${(t + 7) | 0})`;
    x.fillRect(px + 1, py + 1, w - 2, h - 2);
    const bt = 150 + Math.random() * 30;
    y.fillStyle = `rgb(${bt | 0},${bt | 0},${bt | 0})`;
    y.fillRect(px + 2, py + 2, w - 4, h - 4);
  }
  for (const [px, py, w, h] of rects) {
    x.strokeStyle = 'rgba(18,20,24,0.85)';
    x.lineWidth = 2;
    x.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
    x.strokeStyle = 'rgba(255,255,255,0.12)';
    x.lineWidth = 1;
    x.strokeRect(px + 2, py + 2, w - 4, h - 4);
    y.strokeStyle = '#1a1a1a';
    y.lineWidth = 3;
    y.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
    if (Math.random() < 0.5) {
      // リベット列
      x.fillStyle = 'rgba(40,42,48,0.7)';
      y.fillStyle = '#505050';
      const edge = Math.random() < 0.5;
      const n = Math.floor((edge ? w : h) / 10);
      for (let i = 1; i < n; i++) {
        const rx = edge ? px + i * 10 : px + 6;
        const ry = edge ? py + 6 : py + i * 10;
        x.beginPath(); x.arc(rx, ry, 1.3, 0, Math.PI * 2); x.fill();
        y.beginPath(); y.arc(rx, ry, 1.3, 0, Math.PI * 2); y.fill();
      }
    }
    if (Math.random() < 0.08) {
      // 注意表示のような小さな帯
      x.fillStyle = 'rgba(160,40,30,0.55)';
      x.fillRect(px + 6, py + h - 14, Math.min(w - 12, 40), 6);
    }
  }
  // 汚れの筋
  for (let i = 0; i < 260; i++) {
    const gx = Math.random() * size;
    const gy = Math.random() * size;
    const gh = 10 + Math.random() * 60;
    const grad = x.createLinearGradient(gx, gy, gx, gy + gh);
    grad.addColorStop(0, 'rgba(25,22,18,0.10)');
    grad.addColorStop(1, 'rgba(25,22,18,0)');
    x.fillStyle = grad;
    x.fillRect(gx, gy, 1 + Math.random() * 4, gh);
  }
  addNoise(x, size, size, 14);
  addNoise(y, size, size, 10);

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  const bump = new THREE.CanvasTexture(b);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  return { map, bump };
}

// 岩肌：小惑星用
function makeRock(size = 256) {
  const c = makeCanvas(size, size);
  const x = c.getContext('2d');
  x.fillStyle = '#6d655c';
  x.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const t = 70 + Math.random() * 70;
    x.fillStyle = `rgba(${t | 0},${(t * 0.93) | 0},${(t * 0.85) | 0},0.25)`;
    x.beginPath();
    x.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 8, 0, Math.PI * 2);
    x.fill();
  }
  for (let i = 0; i < 40; i++) {
    const cx = Math.random() * size, cy = Math.random() * size, r = 3 + Math.random() * 14;
    const g = x.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    g.addColorStop(0, 'rgba(20,18,16,0.6)');
    g.addColorStop(0.8, 'rgba(40,36,32,0.3)');
    g.addColorStop(1, 'rgba(160,150,140,0.25)');
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  }
  addNoise(x, size, size, 30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 柔らかい光の玉（エンジン噴射・星・光源用）
function makeGlow(size = 128) {
  const c = makeCanvas(size, size);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.18)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.04)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  return t;
}

// 炎・煙：まだらな塊を重ねて丸く切り抜く
function makeBlob(size, blobs, core) {
  const c = makeCanvas(size, size);
  const x = c.getContext('2d');
  const h = size / 2;
  for (let i = 0; i < blobs; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * size * 0.28;
    const bx = h + Math.cos(a) * r, by = h + Math.sin(a) * r;
    const br = size * (0.08 + Math.random() * 0.18);
    const g = x.createRadialGradient(bx, by, 0, bx, by, br);
    g.addColorStop(0, `rgba(255,255,255,${core})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
  }
  x.globalCompositeOperation = 'destination-in';
  const m = x.createRadialGradient(h, h, 0, h, h, h);
  m.addColorStop(0, 'rgba(0,0,0,1)');
  m.addColorStop(0.6, 'rgba(0,0,0,0.8)');
  m.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = m;
  x.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

export function makeTextures() {
  return {
    hull: makeHull(512),
    rock: makeRock(256),
    glow: makeGlow(128),
    fire: makeBlob(128, 34, 0.5),
    smoke: makeBlob(128, 24, 0.35),
  };
}
