import * as THREE from 'three';

/** Cheap seeded noise — deterministic, no loops. */
const R = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function canvasTex(draw, w = 512, h = 512, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h, c);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  else t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function paintNoise(g, w, h, amt = 18, seed = 1) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const step = 2;
  const cols = Math.ceil(w / step);
  const rows = Math.ceil(h / step);
  [...Array(cols * rows)].map((_, i) => {
    const x = (i % cols) * step;
    const y = Math.floor(i / cols) * step;
    const o = (y * w + x) * 4;
    const v = (R(i * 0.37 + seed) - 0.5) * amt;
    d[o] = Math.min(255, Math.max(0, d[o] + v));
    d[o + 1] = Math.min(255, Math.max(0, d[o + 1] + v * 0.92));
    d[o + 2] = Math.min(255, Math.max(0, d[o + 2] + v * 0.78));
  });
  g.putImageData(img, 0, 0);
}

async function imageToTexture(url, w, h, { crisp = false } = {}) {
  const img = new Image();
  img.decoding = 'async';
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error(`Failed to load ${url}`));
      img.src = url;
    });
  } catch {
    return canvasTex((g) => {
      g.fillStyle = '#1a1410';
      g.fillRect(0, 0, w, h);
    }, w, h);
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (crisp) {
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
  }
  g.drawImage(img, 0, 0, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = crisp ? 16 : 8;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  if (crisp) {
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
  }
  t.needsUpdate = true;
  return t;
}

/** Wide-plank white oak — boards, pores, knots, soft wear. */
function oak(w, h) {
  return canvasTex((g) => {
    const boards = 5;
    const bh = h / boards;
    [...Array(boards)].map((_, p) => {
      const y0 = p * bh;
      const base = 92 + R(p * 3.1) * 28;
      const g0 = g.createLinearGradient(0, y0, 0, y0 + bh);
      g0.addColorStop(0, `rgb(${base + 18},${base - 8},${base - 42})`);
      g0.addColorStop(0.5, `rgb(${base + 8},${base - 14},${base - 48})`);
      g0.addColorStop(1, `rgb(${base - 6},${base - 22},${base - 52})`);
      g.fillStyle = g0;
      g.fillRect(0, y0, w, bh);

      [...Array(28)].map((__, i) => {
        const gy = y0 + 6 + R(p * 40 + i) * (bh - 12);
        const amp = 2 + R(i + p) * 5;
        g.strokeStyle = `rgba(${40 + R(i) * 20},${22},${10},${0.12 + R(i * 2) * 0.18})`;
        g.lineWidth = 0.6 + R(i * 3) * 1.4;
        g.beginPath();
        g.moveTo(0, gy);
        g.bezierCurveTo(w * 0.25, gy + amp, w * 0.55, gy - amp, w, gy + amp * 0.4);
        g.stroke();
      });

      // pores
      [...Array(90)].map((__, i) => {
        const px = R(p * 90 + i) * w;
        const py = y0 + 4 + R(p * 91 + i + 2) * (bh - 8);
        g.fillStyle = `rgba(30,16,8,${0.08 + R(i) * 0.12})`;
        g.fillRect(px, py, 1.2, 2.4);
      });

      // knot
      if (R(p + 9) > 0.55) {
        const kx = w * (0.15 + R(p + 1) * 0.7);
        const ky = y0 + bh * (0.3 + R(p + 2) * 0.4);
        const kr = 6 + R(p + 3) * 10;
        const kg = g.createRadialGradient(kx, ky, 1, kx, ky, kr);
        kg.addColorStop(0, 'rgba(48,28,14,.85)');
        kg.addColorStop(0.55, 'rgba(70,42,22,.35)');
        kg.addColorStop(1, 'rgba(70,42,22,0)');
        g.fillStyle = kg;
        g.beginPath();
        g.ellipse(kx, ky, kr * 1.2, kr * 0.75, R(p) * 2, 0, 7);
        g.fill();
      }

      // seam
      g.fillStyle = 'rgba(22,12,6,.78)';
      g.fillRect(0, y0, w, 1.5);
      g.fillStyle = 'rgba(180,140,90,.08)';
      g.fillRect(0, y0 + 1.5, w, 1);
    });
    paintNoise(g, w, h, 10, 2.2);
  }, w, h);
}

function oakRough(w, h) {
  return canvasTex((g) => {
    g.fillStyle = '#b0b0b0';
    g.fillRect(0, 0, w, h);
    const boards = 5;
    const bh = h / boards;
    [...Array(boards)].map((_, p) => {
      g.fillStyle = `rgb(${140 + R(p) * 40},${140 + R(p) * 40},${140 + R(p) * 40})`;
      g.fillRect(0, p * bh, w, bh - 2);
      g.fillStyle = '#6a6a6a';
      g.fillRect(0, p * bh, w, 2);
    });
    paintNoise(g, w, h, 40, 4);
  }, w, h, false);
}

/** Warm plaster — roller stipple, soft mottling. */
function plaster(w, h) {
  return canvasTex((g) => {
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#cfc6b8');
    bg.addColorStop(0.45, '#c4baab');
    bg.addColorStop(1, '#b9ae9e');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    [...Array(180)].map((_, i) => {
      const x = R(i * 1.7) * w;
      const y = R(i * 2.3 + 1) * h;
      const r = 8 + R(i + 4) * 28;
      g.fillStyle = `rgba(${200 + R(i) * 30},${190 + R(i) * 20},${170},${0.03 + R(i + 2) * 0.05})`;
      g.beginPath();
      g.arc(x, y, r, 0, 7);
      g.fill();
    });
    // roller dots
    [...Array(2200)].map((_, i) => {
      const x = R(i * 0.9 + 3) * w;
      const y = R(i * 1.1 + 7) * h;
      g.fillStyle = `rgba(90,70,50,${0.015 + R(i) * 0.03})`;
      g.fillRect(x, y, 1.5, 1.5);
    });
    // hairline
    g.strokeStyle = 'rgba(80,60,40,.06)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(w * 0.1, h * 0.2);
    g.bezierCurveTo(w * 0.4, h * 0.35, w * 0.6, h * 0.55, w * 0.9, h * 0.48);
    g.stroke();
    paintNoise(g, w, h, 8, 1.4);
  }, w, h);
}

function plasterRough(w, h) {
  return canvasTex((g) => {
    g.fillStyle = '#d8d8d8';
    g.fillRect(0, 0, w, h);
    [...Array(800)].map((_, i) => {
      g.fillStyle = `rgb(${180 + R(i) * 50},${180 + R(i) * 50},${180 + R(i) * 50})`;
      g.fillRect(R(i) * w, R(i + 1) * h, 2, 2);
    });
  }, w, h, false);
}

/** Wool herringbone for seating. */
function wool(w, h, { fill = '#5a4e42', step = 8, seed = 8, diagonal = true } = {}) {
  return canvasTex((g) => {
    g.fillStyle = fill;
    g.fillRect(0, 0, w, h);
    [...Array(Math.ceil(w / step))].map((_, ix) => {
      [...Array(Math.ceil(h / step))].map((__, iy) => {
        const x = ix * step;
        const y = iy * step;
        const flip = (ix + iy) % 2 === 0;
        g.strokeStyle = flip ? 'rgba(255,230,200,.07)' : 'rgba(20,14,8,.14)';
        g.lineWidth = 1.2;
        g.beginPath();
        if (diagonal && flip) {
          g.moveTo(x, y + step);
          g.lineTo(x + step, y);
        } else {
          g.moveTo(x, y);
          g.lineTo(x + step, y + step);
        }
        g.stroke();
      });
    });
    paintNoise(g, w, h, 14, seed);
  }, w, h);
}

/** Leather blotter / pads. */
function leather(w, h) {
  return canvasTex((g) => {
    const gr = g.createRadialGradient(w * 0.4, h * 0.35, 10, w / 2, h / 2, w * 0.7);
    gr.addColorStop(0, '#6a4a36');
    gr.addColorStop(1, '#3e2a1e');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    [...Array(900)].map((_, i) => {
      g.fillStyle = `rgba(255,210,160,${0.015 + R(i) * 0.04})`;
      g.fillRect(R(i) * w, R(i + 4) * h, 1.5, 1.5);
    });
    g.strokeStyle = 'rgba(20,10,5,.25)';
    g.lineWidth = 6;
    g.strokeRect(10, 10, w - 20, h - 20);
    paintNoise(g, w, h, 16, 11);
  }, w, h);
}

/** Low-pile rug with border weave. */
function rug(w, h) {
  return canvasTex((g) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.55);
    gr.addColorStop(0, '#4a3c30');
    gr.addColorStop(0.7, '#32281f');
    gr.addColorStop(1, '#241c14');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    [...Array(Math.ceil(w / 3))].map((_, i) => {
      g.fillStyle = i % 2 ? 'rgba(255,220,180,.03)' : 'rgba(0,0,0,.04)';
      g.fillRect(i * 3, 0, 1, h);
    });
    [...Array(Math.ceil(h / 3))].map((_, i) => {
      g.fillStyle = 'rgba(0,0,0,.03)';
      g.fillRect(0, i * 3, w, 1);
    });
    g.strokeStyle = 'rgba(194,166,122,.55)';
    g.lineWidth = 14;
    g.strokeRect(18, 18, w - 36, h - 36);
    g.strokeStyle = 'rgba(194,166,122,.22)';
    g.lineWidth = 3;
    g.strokeRect(36, 36, w - 72, h - 72);
    // corner motifs
    [[40, 40], [w - 40, 40], [40, h - 40], [w - 40, h - 40]].map(([cx, cy], i) => {
      g.strokeStyle = 'rgba(194,166,122,.35)';
      g.beginPath();
      g.arc(cx, cy, 12 + i, 0, 7);
      g.stroke();
    });
    paintNoise(g, w, h, 12, 12);
  }, w, h);
}

/** Acoustic ceiling panel — light, with a fine darker speckle. */
function felt(w, h) {
  return canvasTex((g) => {
    g.fillStyle = '#ded7c9';
    g.fillRect(0, 0, w, h);
    [...Array(2400)].map((_, i) => {
      g.fillStyle = `rgba(96,86,70,${0.03 + R(i) * 0.06})`;
      g.fillRect(R(i) * w, R(i + 8) * h, 1, 1);
    });
    paintNoise(g, w, h, 8, 3);
  }, w, h);
}

function glow() {
  return canvasTex((g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,215,160,1)');
    gr.addColorStop(0.4, 'rgba(255,190,120,.35)');
    gr.addColorStop(1, 'rgba(255,180,110,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }, 64, 64);
}

function shadow() {
  return canvasTex((g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,.55)');
    gr.addColorStop(0.7, 'rgba(0,0,0,.22)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }, 128, 128, false);
}

export function createMaterials(tex) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  return {
    wall: std({
      map: tex.plaster, roughnessMap: tex.plasterRough, roughness: 0.9,
      envMapIntensity: 0.5,
    }),
    darkWall: std({
      map: tex.plaster, roughnessMap: tex.plasterRough, color: 0xded4c3,
      roughness: 0.94, envMapIntensity: 0.34,
    }),
    floorA: std({
      map: tex.oak, roughnessMap: tex.oakRough, roughness: 0.42, metalness: 0.04,
      envMapIntensity: 0.75,
    }),
    floorB: std({
      map: tex.oak, color: 0xd2c8b8, roughnessMap: tex.oakRough, roughness: 0.46,
      metalness: 0.04, envMapIntensity: 0.7,
    }),
    oak: std({
      map: tex.oak, roughnessMap: tex.oakRough, roughness: 0.36, metalness: 0.06,
      envMapIntensity: 0.9,
    }),
    oakDark: std({
      map: tex.oak, color: 0x5a4030, roughnessMap: tex.oakRough, roughness: 0.55,
      envMapIntensity: 0.45,
    }),
    slat: std({
      map: tex.oak, color: 0x8a6a48, roughness: 0.62, envMapIntensity: 0.35,
    }),
    fabric: std({ map: tex.wool, roughness: 0.95, envMapIntensity: 0.2 }),
    fabricDark: std({ map: tex.woolDark, roughness: 0.96, envMapIntensity: 0.18 }),
    leather: std({ map: tex.leather, roughness: 0.72, envMapIntensity: 0.35 }),
    felt: std({ map: tex.felt, roughness: 1, envMapIntensity: 0.35 }),
    brass: std({ color: 0xc2a67a, roughness: 0.32, metalness: 1, envMapIntensity: 1.15 }),
    black: std({ color: 0x12100d, roughness: 0.65, metalness: 0.25 }),
    glass: phys({
      color: 0xfff1dc, transparent: true, opacity: 0.1, roughness: 0.06, metalness: 0,
      envMapIntensity: 1.2, side: THREE.DoubleSide, depthWrite: false,
    }),
    paper: std({ color: 0xe9e2d4, roughness: 0.85 }),
    leaf: std({ color: 0x33482c, roughness: 1 }),
  };
}

export async function createTextures(hi) {
  const size = hi ? 512 : 384;
  const plates = hi
    ? { sky: [2048, 1152], screen: [1920, 1080], board: [768, 432], art: [384, 480], plaque: [512, 128] }
    : { sky: [1280, 720], screen: [1280, 720], board: [512, 288], art: [256, 320], plaque: [384, 96] };

  const oakTex = oak(size, size);
  const oakRoughTex = oakRough(size, size);
  oakTex.repeat.set(3.2, 3.2);
  oakRoughTex.repeat.set(3.2, 3.2);

  const plasterTex = plaster(size, size);
  const plasterRoughTex = plasterRough(256, 256);
  plasterTex.repeat.set(2.4, 2.4);
  plasterRoughTex.repeat.set(2.4, 2.4);

  const woolTex = wool(256, 256);
  const woolDarkTex = wool(256, 256, { fill: '#3a342e', step: 7, seed: 9, diagonal: false });
  woolTex.repeat.set(2, 2);
  woolDarkTex.repeat.set(2, 2);
  const feltTex = felt(256, 256);
  feltTex.repeat.set(3, 3);

  const plated = await loadPlates(plates);
  return {
    oak: oakTex,
    oakRough: oakRoughTex,
    plaster: plasterTex,
    plasterRough: plasterRoughTex,
    wool: woolTex,
    woolDark: woolDarkTex,
    leather: leather(256, 256),
    felt: feltTex,
    rug: rug(512, 512),
    glow: glow(),
    shadow: shadow(),
    ...plated,
  };
}

async function loadPlates(plates) {
  const sky = await imageToTexture('./assets/img/city.jpg', plates.sky[0], plates.sky[1]);
  const art = await imageToTexture('./assets/plates/art.svg', plates.art[0], plates.art[1]);
  const board = await imageToTexture('./assets/plates/whiteboard.svg', plates.board[0], plates.board[1]);
  const plaque = await imageToTexture('./assets/plates/plaque.svg', plates.plaque[0], plates.plaque[1]);
  const plaqueB = await imageToTexture('./assets/plates/plaque-b.svg', plates.plaque[0], plates.plaque[1]);
  const clock = await imageToTexture('./assets/plates/clock.svg', 256, 256);
  const notepad = await imageToTexture('./assets/plates/notepad.svg', 512, 384);
  const screen = await imageToTexture('./assets/plates/screen-work.svg', plates.screen[0], plates.screen[1], { crisp: true });
  return { sky, art, board, plaque, plaqueB, clock, notepad, screen };
}
