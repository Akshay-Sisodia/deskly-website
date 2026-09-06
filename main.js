import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const canvas = document.getElementById('stage');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = matchMedia('(max-width: 768px)').matches;
const HI = !isMobile && !reduceMotion; // full cinematic quality?
let progress = 0, smooth = 0, time = 0, firstFrame = false, lastDoorP = -1, leakCur = 0;
let TIER = isMobile ? 1 : 0, autoQ = true, fAcc = 0, fN = 0, fChecks = 0, lastGOpen = -1;

/* ================= renderer / scene ================= */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = !isMobile;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // baked once, re-baked only when the door moves

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0908);
scene.fog = new THREE.FogExp2(0x0b0908, 0.024);

// Image-based lighting: the single biggest realism upgrade for PBR interiors
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(isMobile ? 66 : 56, innerWidth / innerHeight, 0.1, 220);

/* ================= procedural textures ================= */
function canvasTex(draw, w = 512, h = 512, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const oakTex = canvasTex((g, w, h) => { // warm oak planks
  g.fillStyle = '#5d3f26'; g.fillRect(0, 0, w, h);
  for (let p = 0; p < 6; p++) {
    const y = p * h / 6, tone = 88 + Math.random() * 22;
    g.fillStyle = `rgb(${tone + 22},${tone - 12},${tone - 44})`; g.fillRect(0, y + 2, w, h / 6 - 4);
    for (let i = 0; i < 46; i++) {
      g.strokeStyle = `rgba(46,28,14,${.12 + Math.random() * .25})`; g.lineWidth = .8 + Math.random() * 1.6;
      g.beginPath(); const gy = y + 4 + Math.random() * (h / 6 - 8); g.moveTo(0, gy);
      g.bezierCurveTo(w * .3, gy + 5, w * .6, gy - 5, w, gy); g.stroke();
    }
    g.fillStyle = 'rgba(20,12,6,.8)'; g.fillRect(0, y, w, 2);
  }
}, 1024, 1024);
const linenTex = canvasTex((g, w, h) => {
  g.fillStyle = '#4a423a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(255,238,214,${Math.random() * .07})`; g.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4); }
  for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(0,0,0,.12)'; g.beginPath(); const y = Math.random() * h; g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
});
const rugTex = canvasTex((g, w, h) => {
  g.fillStyle = '#33291d'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 16000; i++) { g.fillStyle = `rgba(${200 + Math.random() * 40},${170 + Math.random() * 30},${130 + Math.random() * 20},${Math.random() * .06})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.strokeStyle = 'rgba(194,166,122,.5)'; g.lineWidth = 10; g.strokeRect(26, 26, w - 52, h - 52);
  g.strokeStyle = 'rgba(194,166,122,.25)'; g.lineWidth = 3; g.strokeRect(52, 52, w - 104, h - 104);
});
const skyTex = canvasTex((g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#2c3a5e'); gr.addColorStop(.42, '#8a5a48'); gr.addColorStop(.58, '#f7b978');
  gr.addColorStop(.68, '#7a5a48'); gr.addColorStop(.8, '#241a14'); gr.addColorStop(1, '#100c09');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const sx = w * .52, sy = h * .6;
  const glow = g.createRadialGradient(sx, sy, 4, sx, sy, 150);
  glow.addColorStop(0, 'rgba(255,236,200,1)'); glow.addColorStop(.25, 'rgba(255,200,140,.55)'); glow.addColorStop(1, 'rgba(255,180,110,0)');
  g.fillStyle = glow; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff3da'; g.beginPath(); g.arc(sx, sy, 22, 0, 7); g.fill();
}, 1024, 512);
const winTex = canvasTex((g, w, h) => { // lit office windows for towers
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let y = 8; y < h; y += 18) for (let x = 8; x < w; x += 14) {
    if (Math.random() > .42) continue;
    g.fillStyle = Math.random() > .25 ? `rgba(255,${190 + Math.random() * 40},${130 + Math.random() * 40},.95)` : 'rgba(170,210,230,.9)';
    g.fillRect(x, y, 8, 10);
  }
}, 256, 512);
const artTex = canvasTex((g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, '#3a2c1e'); gr.addColorStop(.5, '#8a5f36'); gr.addColorStop(.75, '#c2a67a'); gr.addColorStop(1, '#241a12');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(20,12,8,.7)'; g.lineWidth = 14;
  g.beginPath(); g.arc(w * .6, h * .42, 90, 0, 7); g.stroke();
  g.fillStyle = 'rgba(242,235,224,.85)'; g.beginPath(); g.arc(w * .34, h * .62, 34, 0, 7); g.fill();
}, 512, 640);
const boardTex = canvasTex((g, w, h) => {
  g.fillStyle = '#ece7db'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(60,70,90,.55)'; g.lineWidth = 3;
  g.strokeRect(40, 40, w - 80, h - 80);
  // hand-drawn planning
  g.strokeStyle = 'rgba(180,60,50,.8)'; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(60, h - 100); g.quadraticCurveTo(w * .3, h - 180, w * .5, h - 80); g.stroke();
  g.beginPath(); g.moveTo(w * .5, h - 80); g.quadraticCurveTo(w * .7, h - 140, w - 80, h - 200); g.stroke();
  g.fillStyle = 'rgba(40,60,90,.9)'; g.font = '600 40px sans-serif';
  g.fillText('Q3 PLAN', 70, 110);
  g.fillStyle = 'rgba(60,120,60,.9)'; g.font = '30px sans-serif';
  g.fillText('✓  brand refresh', 70, 170);
  g.fillText('✓  design system', 70, 220);
  g.fillText('→  campaign assets', 70, 270);
  g.fillText('→  launch deck', 70, 320);
  g.fillStyle = 'rgba(180,60,50,.8)'; g.font = '30px sans-serif';
  g.fillText('DEADLINE: FRI 17:00', 70, 380);
}, 512, 480);
const screenTex = canvasTex((g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#1c2f3a'); gr.addColorStop(1, '#0c1418');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  // title bar
  g.fillStyle = 'rgba(194,166,122,.95)'; g.fillRect(0, 0, w, 54);
  g.fillStyle = '#12100c'; g.font = '600 48px sans-serif'; g.fillText('Deskly · Design review', 40, 38);
  // toolbar
  g.fillStyle = 'rgba(255,238,214,.12)'; g.fillRect(0, 54, w, 42);
  g.fillStyle = 'rgba(242,235,224,.7)'; g.font = '300 28px sans-serif';
  g.fillText('File  Edit  View  Layer  Type  Select  Filter  3D  Window  Help', 40, 84);
  // canvas area
  g.fillStyle = 'rgba(18,22,28,.9)'; g.fillRect(20, 120, w - 40, h - 160);
  g.fillStyle = 'rgba(194,166,122,.14)'; g.fillRect(w / 2 - 130, 138, 260, 48);
  g.fillStyle = 'rgba(194,166,122,.95)'; g.font = '600 25px sans-serif'; g.textAlign = 'center';
  g.fillText('D E S K L Y', w / 2, 169); g.textAlign = 'left';
  // side panels
  g.fillStyle = 'rgba(24,28,34,.9)'; g.fillRect(20, 120, 260, h - 160);
  g.fillStyle = 'rgba(24,28,34,.9)'; g.fillRect(w - 300, 120, 280, h - 160);
  // layers list
  g.fillStyle = 'rgba(242,235,224,.85)'; g.font = '26px sans-serif';
  const layers = ['● bg-plate', '● furniture', '● lighting', '● camera', '○ grading', '○ export'];
  layers.forEach((l, i) => g.fillText(l, 50, 165 + i * 42));
  // properties panel
  g.fillStyle = 'rgba(194,166,122,.9)'; g.font = '600 26px sans-serif'; g.fillText('Properties', w - 260, 165);
  g.fillStyle = 'rgba(242,235,224,.65)'; g.font = '24px sans-serif';
  const props = ['Camera: 56mm  f/2.0', 'Focus: 4.2 m', 'Aperture: 2.8', 'ISO: 100', 'WB: 4200 K', 'LUT: Kodak 2383'];
  props.forEach((l, i) => g.fillText(l, w - 280, 210 + i * 40));
  // timeline
  g.fillStyle = 'rgba(194,166,122,.85)'; g.fillRect(40, h - 50, w - 80, 4);
  g.fillStyle = 'rgba(194,166,122,1)'; g.fillRect(40, h - 50, 220, 4);
  g.fillStyle = 'rgba(242,235,224,.6)'; g.font = '22px sans-serif'; g.fillText('0:00', 50, h - 20); g.fillText('2:14', w - 80, h - 20);
  // status bar
  g.fillStyle = 'rgba(12,10,8,.95)'; g.fillRect(0, h - 30, w, 30);
  g.fillStyle = 'rgba(242,235,224,.55)'; g.font = '22px sans-serif'; g.fillText('10:24 AM  ·  2.4K  ·  24 fps  ·  Proxy 1/4', 40, h - 8);
}, 1024, 640);
const glowTex = canvasTex((g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,215,160,1)'); gr.addColorStop(.4, 'rgba(255,190,120,.35)'); gr.addColorStop(1, 'rgba(255,180,110,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}, 128, 128);
const shadowTex = canvasTex((g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(0,0,0,.62)'); gr.addColorStop(.7, 'rgba(0,0,0,.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}, 256, 256, false);
const plaqueTex = canvasTex((g, w, h) => {
  g.fillStyle = '#2a2118'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#c2a67a'; g.font = '600 38px sans-serif'; g.textAlign = 'center';
  g.fillText('E X E C U T I V E', w / 2, h / 2 + 15);
}, 512, 128);

/* ================= materials ================= */
const std = (o) => new THREE.MeshStandardMaterial(o);
const phys = (o) => new THREE.MeshPhysicalMaterial(o);
const MAT = {
  wall: std({ map: linenTex, bumpMap: linenTex, bumpScale: .01, roughness: .94, envMapIntensity: .25 }),
  darkWall: std({ color: 0x211a14, roughness: .96, envMapIntensity: .15 }),
  floorA: std({ map: oakTex, bumpMap: oakTex, bumpScale: .02, roughness: .38, metalness: .06, envMapIntensity: .9 }),
  floorB: std({ map: oakTex, bumpMap: oakTex, bumpScale: .02, color: 0xcfc4b4, roughness: .42, metalness: .06, envMapIntensity: .8 }),
  oak: phys({ map: oakTex, bumpMap: oakTex, bumpScale: .015, roughness: .32, clearcoat: 1, clearcoatRoughness: .22, envMapIntensity: 1 }),
  oakDark: std({ color: 0x2e2013, roughness: .5, envMapIntensity: .5 }),
  slat: std({ color: 0x5d4128, roughness: .6 }),
  fabric: phys({ color: 0x6a5c4c, roughness: .9, sheen: .6, sheenColor: 0xffd9a8, sheenRoughness: .7, envMapIntensity: .4 }),
  fabricDark: phys({ color: 0x3f3830, roughness: .92, sheen: .5, sheenColor: 0xc2a67a, sheenRoughness: .8, envMapIntensity: .35 }),
  brass: std({ color: 0xc2a67a, roughness: .28, metalness: 1, envMapIntensity: 1.4 }),
  black: std({ color: 0x12100d, roughness: .6, metalness: .3 }),
  glass: phys({ color: 0xfff1dc, transparent: true, opacity: .1, roughness: .04, metalness: 0, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }),
  crystal: phys({ color: 0xdfeaf2, roughness: .06, transparent: true, opacity: .32, envMapIntensity: 1.6, depthWrite: false }),
  paper: std({ color: 0xe9e2d4, roughness: .85 }),
  leaf: std({ color: 0x33482c, roughness: 1 }),
  tower: std({ color: 0x191410, roughness: 1, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 1.1 }),
};

/* ================= helpers ================= */
function box(w, h, d, mat, x, y, z, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m;
}
function rbox(w, h, d, r, mat, x, y, z) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true; scene.add(m); return m;
}
function contactShadow(x, z, sx, sz, op = .55) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: op, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, .025, z); scene.add(m); return m;
}
function lightPool(x, z, sx, sz, color = 0xffbe78, op = .16) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz),
    new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, .034, z); scene.add(m); return m;
}

/* ================= lights ================= */
scene.add(new THREE.HemisphereLight(0x8a7a63, 0x1e130c, .45));
const doorSpot = new THREE.SpotLight(0xffb46b, 0, 22, .65, .55, 1.2);
doorSpot.position.set(0, 1.4, 10.2); doorSpot.target.position.set(0, 1, 16.5);
scene.add(doorSpot, doorSpot.target);

const keyA = new THREE.SpotLight(0xffd9a8, 40, 26, .95, .8, 1.4);
keyA.position.set(0, 3.1, 7); keyA.target.position.set(0, .8, 7);
keyA.castShadow = !isMobile; keyA.shadow.mapSize.set(1024, 1024); keyA.shadow.bias = -0.0002; keyA.shadow.normalBias = .03;
scene.add(keyA, keyA.target);

const keyB = new THREE.SpotLight(0xffd9a8, 55, 32, 1, .8, 1.4);
keyB.position.set(0, 3.4, -5); keyB.target.position.set(0, .8, -5);
keyB.castShadow = !isMobile; keyB.shadow.mapSize.set(1024, 1024); keyB.shadow.bias = -0.0002; keyB.shadow.normalBias = .03;
scene.add(keyB, keyB.target);
const screenGlow = new THREE.SpotLight(0xffd9a8, 0, 14, .75, 1, 1.4);
screenGlow.position.set(-3.2, 2.1, -4.6); screenGlow.target.position.set(-5.9, 1.5, -5);
scene.add(screenGlow, screenGlow.target);

// Window daylight — single cheap spot wash (replaces RectAreaLight)
const daylight = new THREE.SpotLight(0xffe2b8, 18, 30, .85, .9, 1.3);
daylight.position.set(0, 2.4, -11.4); daylight.target.position.set(0, .7, -3);
scene.add(daylight, daylight.target);
const sun = new THREE.DirectionalLight(0xffc98a, 1.6);
sun.position.set(5, 5.5, -28); sun.target.position.set(0, 1, -6);
if (!isMobile) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0002; sun.shadow.normalBias = .04; sun.shadow.camera.left = -8; sun.shadow.camera.right = 8; sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8; }
scene.add(sun, sun.target);

// pendant warmth is carried by emissive bulbs + halos (no point-light cost)

/* ================= corridor + doorway ================= */
box(4.6, .2, 8.45, MAT.darkWall, 0, -.1, 16.275); // ends at 12.05 — meets room floor, no overlap
box(.25, 3.4, 9.8, MAT.darkWall, -2.3, 1.6, 15.9);
box(.25, 3.4, 9.8, MAT.darkWall, 2.3, 1.6, 15.9);
box(4.8, .25, 9, MAT.black, 0, 3.3, 16);
// end wall with a REAL opening — camera flies through, never through solid slab
box(1.45, 3.4, .3, MAT.darkWall, -1.675, 1.6, 11.9);
box(1.45, 3.4, .3, MAT.darkWall, 1.675, 1.6, 11.9);
box(1.9, .8, .3, MAT.darkWall, 0, 2.9, 11.9);
box(.2, 2.6, .5, MAT.oakDark, -.9, 1.2, 12);
box(.2, 2.6, .5, MAT.oakDark, .9, 1.2, 12);
box(2, .2, .5, MAT.oakDark, 0, 2.55, 12);
// skirting glow strips in corridor (bloom catches these)
for (const sx of [-2.12, 2.12]) {
  const s = box(.03, .05, 8.6, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1, .5) }), sx, .12, 16, false);
  s.material.toneMapped = true;
}
// door panel on hinge
const doorPivot = new THREE.Group(); doorPivot.position.set(-.8, 0, 12); scene.add(doorPivot);
const doorPanel = new THREE.Mesh(new RoundedBoxGeometry(1.6, 2.44, .1, 3, .02),
  phys({ color: 0x4f3620, roughness: .42, clearcoat: .6, clearcoatRoughness: .4, envMapIntensity: .8 }));
doorPanel.position.set(.8, 1.26, 0); doorPanel.castShadow = true; doorPivot.add(doorPanel);
for (const py of [.75, 1.75]) { // recessed panel moulds
  const mould = new THREE.Mesh(new THREE.BoxGeometry(1.1, .8, .03), MAT.oakDark);
  mould.position.set(.8, py, .055); doorPivot.add(mould);
}
// handle set, both faces: rose + plate + lever + tip. Sits proud of the panel.
const roseF = new THREE.Mesh(new THREE.CylinderGeometry(.032, .032, .02, 20), MAT.brass);
roseF.rotation.x = Math.PI / 2; roseF.position.set(1.42, 1.05, .058); doorPivot.add(roseF);
const leverF = new THREE.Group(); leverF.position.set(1.42, 1.05, .062); doorPivot.add(leverF);
const plateF = new THREE.Mesh(new THREE.BoxGeometry(.05, .24, .018), MAT.brass); leverF.add(plateF);
const armF = new THREE.Group(); armF.position.set(0, .07, .025); leverF.add(armF);
const rodF = new THREE.Mesh(new THREE.CylinderGeometry(.014, .014, .15, 12), MAT.brass);
rodF.rotation.z = Math.PI / 2; rodF.position.set(-.075, 0, 0); rodF.castShadow = true; armF.add(rodF);
const tipF = new THREE.Mesh(new THREE.SphereGeometry(.02, 12, 12), MAT.brass);
tipF.position.set(-.15, 0, 0); armF.add(tipF);
const leverB = leverF.clone(); leverB.position.z = -.062; leverB.rotation.y = Math.PI; doorPivot.add(leverB);
const armB = leverB.children[1];
// warm blade of light beneath the door
const gapLight = new THREE.Mesh(new THREE.PlaneGeometry(1.62, .06),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.2, 1), transparent: true, opacity: .95 }));
gapLight.rotation.x = -Math.PI / 2; gapLight.position.set(0, .032, 12.4); scene.add(gapLight);
// brass plaque
const plaque = new THREE.Mesh(new THREE.PlaneGeometry(.7, .175),
  std({ map: plaqueTex, roughness: .35, metalness: .6 }));
plaque.position.set(1.45, 1.7, 12.06); scene.add(plaque); // faces +z (corridor) by default

/* ================= Room A — the atelier ================= */
const floorA = box(10, .2, 9.8, MAT.floorA, 0, -.1, 7.15); floorA.receiveShadow = true; // ends 2.25 — no overlap with Room B floor
box(10, .25, 10.5, MAT.darkWall, 0, 3.35, 6.8);
box(.25, 3.5, 10.5, MAT.wall, -5, 1.65, 6.8);
box(.25, 3.5, 10.5, MAT.wall, 5, 1.65, 6.8);
// room-side wall, same real opening (raw edges hide inside the oak posts)
box(4.05, 3.5, .25, MAT.wall, -2.975, 1.65, 11.9);
box(4.05, 3.5, .25, MAT.wall, 2.975, 1.65, 11.9);
box(1.9, .9, .25, MAT.wall, 0, 2.95, 11.9);
box(10, .14, .3, MAT.oakDark, 0, .07, 11.72); // baseboard
box(.06, .08, 10.2, MAT.oakDark, 4.84, 1.1, 6.8, false); box(.06, .1, 10.2, MAT.oakDark, 4.84, 2.9, 6.8, false);
// wood-slat feature wall (instanced — one draw call)
{
  const slatGeo = new THREE.BoxGeometry(.1, 3.1, .14);
  const n = 42, inst = new THREE.InstancedMesh(slatGeo, MAT.slat, n);
  const d = new THREE.Object3D();
  for (let i = 0; i < n; i++) { d.position.set(-4.7, 1.6, 2.6 + i * .215); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); }
  inst.castShadow = true; inst.receiveShadow = true; scene.add(inst);
}
// cove light strips (HDR — bloom glow lines)
const coveMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.35, .62) });
const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(.85, .5, .22) });
box(9.6, .05, .08, coveMat, 0, 3.18, 2.35, false);
box(.08, .05, 9.4, coveMat, -4.8, 3.18, 6.8, false);
box(.08, .05, 9.4, coveMat, 4.8, 3.18, 6.8, false);
box(11.6, .05, .08, coveMat, 0, 3.3, 1.9, false);
box(11.6, .05, .08, coveMat, 0, 3.3, -11.9, false);
// rug + contact shadows + warm light pools
const rug = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), std({ map: rugTex, roughness: 1 }));
rug.rotation.x = -Math.PI / 2; rug.position.set(0, .012, 7); rug.receiveShadow = true; scene.add(rug);
contactShadow(0, 7, 5.8, 3.2, .6); lightPool(0, 7, 6.6, 3.8);
// table with brass inlay
rbox(4.6, .11, 1.6, .04, MAT.oak, 0, .8, 7);
box(.5, .115, .04, MAT.brass, 0, .8, 7, false);
box(1.7, .68, .09, MAT.oakDark, -1.5, .37, 7); box(1.7, .68, .09, MAT.oakDark, 1.5, .37, 7);
box(3.2, .05, .3, MAT.brass, 0, .05, 7, false);
box(4.3, .03, .03, stripMat, 0, .72, 7.72, false); box(4.3, .03, .03, stripMat, 0, .72, 6.28, false);
// laptop with glowing screen
{
  const base = rbox(.46, .025, .32, .008, MAT.black, -1.1, .885, 7.15); base.rotation.y = .3;
  const scr = new THREE.Mesh(new RoundedBoxGeometry(.46, .3, .015, 2, .005),
    std({ color: 0x0a0e12, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 1.4, roughness: .35 }));
  scr.position.set(-1.17, 1, 7.28); scr.rotation.set(-.28, .3, 0); scr.castShadow = true; scene.add(scr);
}
// notebooks + cups + carafe (human traces)
rbox(.42, .035, .3, .008, MAT.paper, 1.2, .885, 6.85);
rbox(.38, .03, .28, .008, std({ color: 0x8a3b2e, roughness: .7 }), 1.21, .918, 6.84);
for (const [cx, cz] of [[1.8, 7.25], [-.2, 6.8], [.4, 7.35], [-1.5, 6.9]]) {
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(.045, .036, .095, 20), MAT.paper);
  cup.position.set(cx, .955, cz); cup.castShadow = true; scene.add(cup);
  const cof = new THREE.Mesh(new THREE.CircleGeometry(.04, 20), std({ color: 0x2a1608, roughness: .3 }));
  cof.rotation.x = -Math.PI / 2; cof.position.set(cx, 1.0, cz); scene.add(cof);
}
{
  const carafe = new THREE.Mesh(new THREE.CylinderGeometry(.07, .09, .26, 24), MAT.crystal);
  carafe.position.set(-.5, 1.0, 7.35); carafe.castShadow = true; scene.add(carafe);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(.062, .08, .12, 24),
    phys({ color: 0xbfe0ea, roughness: .05, transparent: true, opacity: .55 }));
  water.position.set(-.5, .95, 7.35); scene.add(water);
}
// chairs
function chair(x, z, ry, mat, cushion = false) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
  const seat = new THREE.Mesh(new RoundedBoxGeometry(.56, .09, .56, 3, .035), mat);
  seat.position.y = .49; seat.castShadow = true;
  const back = new THREE.Mesh(new RoundedBoxGeometry(.5, .64, .08, 3, .035), mat);
  back.position.set(0, .88, -.28); back.rotation.x = -.12; back.castShadow = true;
  g.add(seat, back);
  if (cushion) {
    const pad = new THREE.Mesh(new RoundedBoxGeometry(.5, .06, .5, 2, .025), MAT.paper);
    pad.position.y = .56; pad.castShadow = true; g.add(pad);
  }
  for (const [lx, lz] of [[-.24, -.24], [.24, -.24], [-.24, .24], [.24, .24]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.022, .018, .49, 10), MAT.black);
    leg.position.set(lx * 1.08, .245, lz * 1.08); leg.castShadow = true; g.add(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(.02, 8, 8), MAT.brass);
    foot.position.set(lx * 1.1, .02, lz * 1.1); g.add(foot);
  }
  scene.add(g); return g;
}
for (let i = 0; i < 5; i++) { chair(-1.8 + i * .9, 6.05, 0, MAT.fabric, true); chair(-1.8 + i * .9, 7.95, Math.PI, MAT.fabric, true); }
chair(-2.55, 7, Math.PI / 2, MAT.fabric, true); chair(2.55, 7, -Math.PI / 2, MAT.fabric, true);
// pendant domes (lathe) + glow cones
function pendant(x, y, z, r = .24, ceil = 3.24) {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI * .52; pts.push(new THREE.Vector2(Math.sin(a) * r, Math.cos(a) * r * .8)); }
  const shade = new THREE.Mesh(new THREE.LatheGeometry(pts, 28),
    std({ color: 0x191410, roughness: .45, metalness: .6, side: THREE.DoubleSide }));
  shade.position.set(x, y + .16, z); shade.castShadow = true; scene.add(shade);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(r * .96, .012, 8, 32), MAT.brass);
  trim.rotation.x = Math.PI / 2; trim.position.set(x, y + .03, z); scene.add(trim);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.045, 12, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 2.6, 1.2) }));
  bulb.position.set(x, y, z); scene.add(bulb);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(.01, .01, Math.max(.2, ceil - y - .1), 8), MAT.black);
  cord.position.set(x, (ceil + y + .06) / 2, z); scene.add(cord);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(.7, 1.1, 24, 1, true),
    new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffbe78, transparent: true, opacity: .1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  cone.position.set(x, y - .6, z); scene.add(cone);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffcf96, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.set(.9, .9, 1); halo.position.set(x, y, z); scene.add(halo);
}
pendant(-.75, 2.1, 7); pendant(0, 2.0, 7); pendant(.75, 2.1, 7);
// plant
{
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(.24, .19, .38, 20), std({ color: 0x7a5a3c, roughness: .8 }));
  pot.position.set(4.3, .19, 10.5); pot.castShadow = true; scene.add(pot);
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(.3, 8, 6), MAT.leaf);
    leaf.scale.set(.5, 1.4, .5);
    leaf.position.set(4.3 + (Math.random() - .5) * .5, .8 + Math.random() * .6, 10.5 + (Math.random() - .5) * .5);
    leaf.rotation.set(Math.random() * .5, Math.random() * 3, Math.random() * .4);
    leaf.castShadow = true; scene.add(leaf);
  }
  contactShadow(4.3, 10.5, 1.2, 1.2, .5);
}

/* ================= glass transition wall ================= */
const glassWallMat = MAT.glass;
const glassL = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 3.2), glassWallMat);
glassL.position.set(-2.75, 1.6, 2); scene.add(glassL);
const glassR = glassL.clone(); glassR.position.x = 2.75; scene.add(glassR);
for (const x of [-5, -3, -1, 1, 3, 5]) box(.1, 3.2, .12, MAT.black, x, 1.6, 2); // center kept clear — camera passes at x=0
box(10, .1, .12, MAT.black, 0, 3.15, 2);
box(4.45, .1, .12, MAT.black, -2.775, .06, 2); box(4.45, .1, .12, MAT.black, 2.775, .06, 2);
box(10, .025, .09, MAT.brass, 0, .008, 2.25, false); // threshold strip hides the floor seam
// glass door on hinge — opens ahead of you, closes behind you
box(.09, 2.62, .14, MAT.black, -.55, 1.36, 2);
box(.09, 2.62, .14, MAT.black, .55, 1.36, 2);
const glassPivot = new THREE.Group(); glassPivot.position.set(-.5, 0, 2); scene.add(glassPivot);
const glassPanel = new THREE.Mesh(new THREE.BoxGeometry(1, 2.5, .04), MAT.glass.clone());
glassPanel.position.set(.5, 1.31, 0); glassPanel.castShadow = true; glassPivot.add(glassPanel);
const railT = new THREE.Mesh(new THREE.BoxGeometry(1, .09, .07), MAT.black);
railT.position.set(.5, 2.52, 0); glassPivot.add(railT);
const railB = railT.clone(); railB.position.y = .1; glassPivot.add(railB);
const pullSt1 = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .05, 8), MAT.brass);
pullSt1.rotation.x = Math.PI / 2; pullSt1.position.set(.82, 1.7, .045); glassPivot.add(pullSt1);
const pullSt2 = pullSt1.clone(); pullSt2.position.y = 1.1; glassPivot.add(pullSt2);
const pullBar = new THREE.Mesh(new THREE.CylinderGeometry(.016, .016, .68, 12), MAT.brass);
pullBar.position.set(.82, 1.4, .075); pullBar.castShadow = true; glassPivot.add(pullBar);

/* ================= Room B — large conference ================= */
box(12, .2, 14.5, MAT.floorB, 0, -.1, -5);
box(12, .25, 14.5, MAT.darkWall, 0, 3.5, -5);
box(.25, 3.7, 14.5, MAT.wall, -6, 1.75, -5);
box(.25, 3.7, 14.5, MAT.wall, 6, 1.75, -5);
// acoustic baffle fins
{
  const geo = new THREE.BoxGeometry(.12, .3, 12);
  const inst = new THREE.InstancedMesh(geo, MAT.oakDark, 22);
  const d = new THREE.Object3D();
  for (let i = 0; i < 22; i++) { d.position.set(-5.2 + i * .5, 3.28, -5); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); }
  scene.add(inst);
}
// long table
rbox(6, .13, 1.9, .045, MAT.oak, 0, .82, -5);
box(1.4, .135, .05, MAT.brass, 0, .82, -5, false);
for (const dx of [-2.5, 0, 2.5]) box(.16, .75, 1.5, MAT.oakDark, dx, .38, -5);
box(5.7, .03, .03, stripMat, 0, .73, -4.12, false); box(5.7, .03, .03, stripMat, 0, .73, -5.88, false);
box(.05, .06, .05, MAT.black, .8, .9, -5, false); // cable grommet
contactShadow(0, -5, 7.4, 3.4, .6); lightPool(0, -5, 7, 3.2, 0xffbe78, .13);
// notepads down the table + water glasses (recurring craft detail)
for (let i = 0; i < 8; i++) {
  rbox(.34, .025, .26, .006, MAT.paper, -2.6 + i * .75, .9, -4.6 + (i % 2) * .12);
  const gl = new THREE.Mesh(new THREE.CylinderGeometry(.035, .03, .11, 16), MAT.crystal);
  gl.position.set(-2.6 + i * .75 + .3, .945, -5.35); scene.add(gl);
}
for (let i = 0; i < 8; i++) { chair(-2.8 + i * .8, -3.7, Math.PI, MAT.fabricDark); chair(-2.8 + i * .8, -6.3, 0, MAT.fabricDark); }
for (let i = 0; i < 5; i++) pendant(-2.5 + i * 1.25, 2.3, -5, .27, 3.38);
// display + whiteboard + art + credenza
let logoMat = null, finMat = null;
{
  const d = box(.14, 1.3, 2.8, std({ color: 0x05070a, roughness: .35 }), -5.9, 1.85, -5, false);
  const img = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.15),
    std({ color: 0x000000, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: .9, roughness: .4 }));
  img.rotation.y = Math.PI / 2; img.position.set(-5.82, 1.85, -5); scene.add(img); d.castShadow = false;
const logoTex = canvasTex((g, w, h) => {
  g.fillStyle = '#12100c'; g.fillRect(0, 0, w, h);
  const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, 300);
  gr.addColorStop(0, 'rgba(255,190,120,.22)'); gr.addColorStop(1, 'rgba(255,190,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = '#c2a67a'; g.font = '600 48px Inter, sans-serif'; g.textAlign = 'center'; g.letterSpacing = '0.3em';
  g.fillText('D E S K L Y', w / 2, h / 2 - 20);
  g.fillStyle = 'rgba(242,235,224,.85)'; g.font = 'italic 34px Georgia, serif'; g.letterSpacing = '0.05em';
  g.fillText('Ideas deserve a better space.', w / 2, h / 2 + 40);
}, 1024, 512);
  logoMat = new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, opacity: 0, fog: false });
  const logoPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), logoMat);
  logoPlane.rotation.y = Math.PI / 2; logoPlane.position.set(-5.81, 1.85, -5); scene.add(logoPlane);
  const finTex = canvasTex((g, w, h) => {
    g.fillStyle = '#100e0b'; g.fillRect(0, 0, w, h);
    const gr = g.createRadialGradient(w / 2, h * .42, 10, w / 2, h * .42, 420);
    gr.addColorStop(0, 'rgba(255,190,120,.2)'); gr.addColorStop(1, 'rgba(255,190,120,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.textAlign = 'center';
    g.fillStyle = '#c2a67a'; g.font = '600 30px Inter, sans-serif';
    g.fillText('P L A Y B A C K', w / 2, 66);
    g.fillStyle = '#f2ebe0'; g.font = '500 84px Georgia, serif';
    g.fillText('The room', w / 2, 180);
    g.fillStyle = '#ffd9a8'; g.font = 'italic 500 84px Georgia, serif';
    g.fillText('signs its work.', w / 2, 272);
    g.fillStyle = 'rgba(194,166,122,.6)'; g.fillRect(w / 2 - 130, 306, 260, 2);
    g.fillStyle = 'rgba(242,235,224,.92)'; g.font = '500 36px Inter, sans-serif';
    g.fillText('Executive · 12  —  ₹900/hr', w / 2, 362);
    g.fillText('Conference · 16  —  ₹1,200/hr', w / 2, 408);
    g.fillStyle = 'rgba(242,235,224,.6)'; g.font = '28px Inter, sans-serif';
    g.fillText('Min 2 hrs  ·  Half day −15%  ·  Full day −25%', w / 2, 462);
  }, 1024, 512);
  finMat = new THREE.MeshBasicMaterial({ map: finTex, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const finPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), finMat);
  finPlane.rotation.y = Math.PI / 2; finPlane.position.set(-5.8, 1.85, -5); scene.add(finPlane);
  box(.05, .5, .3, MAT.brass, -5.85, 1, -5, false);
  const wb = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.5), std({ map: boardTex, roughness: .25, envMapIntensity: .8 }));
  wb.rotation.y = -Math.PI / 2; wb.position.set(5.84, 1.85, -5); scene.add(wb); // 1cm off the backing — never coplanar
  box(.1, 1.7, 2.9, MAT.black, 5.9, 1.85, -5, false);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.4), std({ map: artTex, roughness: .8 }));
  art.rotation.y = -Math.PI / 2; art.position.set(5.85, 1.9, -8.6); scene.add(art);
  box(.08, 1.55, 1.25, MAT.brass, 5.9, 1.9, -8.6, false);
  rbox(2.4, .55, .5, .03, MAT.oakDark, -4.2, .28, -10.8);
  for (let i = 0; i < 9; i++) box(.12, .3 + (i % 3) * .09, .3, std({ color: new THREE.Color().setHSL(.07 + i * .03, .35, .3 + (i % 2) * .12), roughness: .8 }), -5.1 + i * .2, .56 + (.3 + (i % 3) * .09) / 2, -10.8, false);
}

/* ================= arrival corner — lounge vignette by the glass ================= */
{
  const rug2 = new THREE.Mesh(new THREE.CircleGeometry(1.15, 36), std({ map: rugTex, roughness: 1 }));
  rug2.rotation.x = -Math.PI / 2; rug2.position.set(3.7, .012, -10.2); rug2.receiveShadow = true; scene.add(rug2);
  const lg = new THREE.Group(); lg.position.set(3.7, 0, -10.2); lg.rotation.y = -.5; scene.add(lg);
  const seat = new THREE.Mesh(new RoundedBoxGeometry(.78, .14, .74, 3, .05), MAT.fabric, true);
  seat.position.y = .4; seat.castShadow = true; lg.add(seat);
  const cushion = new THREE.Mesh(new RoundedBoxGeometry(.66, .1, .6, 3, .045), std({ color: 0xb08c5a, roughness: .9 }));
  cushion.position.set(0, .5, .02); cushion.castShadow = true; lg.add(cushion);
  const throwB = new THREE.Mesh(new RoundedBoxGeometry(.42, .05, .5, 2, .02), std({ color: 0x9a4a30, roughness: .95 }));
  throwB.position.set(.05, .57, .05); throwB.rotation.y = .3; throwB.castShadow = true; lg.add(throwB);
  const back = new THREE.Mesh(new RoundedBoxGeometry(.74, .8, .12, 3, .05), MAT.fabric, true);
  back.position.set(0, .82, -.4); back.rotation.x = -.28; back.castShadow = true; lg.add(back);
  for (const [lx, lz] of [[-.32, -.3], [.32, -.3], [-.32, .3], [.32, .3]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.02, .016, .34, 10), MAT.oakDark);
    leg.position.set(lx, .17, lz); leg.castShadow = true; lg.add(leg);
  }
  const tt = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .045, 28), MAT.oak);
  tt.position.set(2.75, .56, -9.6); tt.castShadow = true; scene.add(tt);
  const tl = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .54, 12), MAT.brass);
  tl.position.set(2.75, .28, -9.6); scene.add(tl);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(.045, .036, .095, 20), MAT.paper);
  cup.position.set(2.7, .63, -9.55); cup.castShadow = true; scene.add(cup);
  pendant(4.5, 1.7, -10.4, .2, 3.38);
  contactShadow(3.7, -10.2, 2.6, 2.2, .5); lightPool(3.7, -10.2, 3, 2.6, 0xffbe78, .14);
}

/* ================= window + golden hour ================= */
const winGlass = new THREE.Mesh(new THREE.PlaneGeometry(12, 3.3), MAT.glass.clone());
winGlass.position.set(0, 1.72, -12); scene.add(winGlass);
for (const x of [-6, -3.6, -1.2, 1.2, 3.6, 6]) box(.14, 3.5, .14, MAT.black, x, 1.72, -12); // center kept clear
box(12, .14, .14, MAT.black, 0, 3.42, -12); box(12, .14, .14, MAT.black, 0, .08, -12);
box(12, .1, .5, MAT.oakDark, 0, .12, -11.8); // sill
box(.14, 3.3, .5, MAT.oakDark, -5.9, 1.72, -11.85, false); box(.14, 3.3, .5, MAT.oakDark, 5.9, 1.72, -11.85, false);
lightPool(0, -10, 10, 3.4, 0xff9a50, .2); // sunset spilling in
// sheer curtain panel drifting at the side
{
  const cur = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.2, 12, 1),
    phys({ color: 0xf2e6d4, transparent: true, opacity: .35, roughness: .9, side: THREE.DoubleSide }));
  const pos = cur.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 4) * .09);
  cur.geometry.computeVertexNormals();
  cur.position.set(-5, 1.75, -11.7); scene.add(cur);
}
const sky = new THREE.Mesh(new THREE.PlaneGeometry(190, 80), new THREE.MeshBasicMaterial({ map: skyTex, fog: false }));
sky.position.set(0, 14, -70); scene.add(sky);
{ // golden-hour horizon: layered treeline + haze + low sun (no blocky towers)
  const treeTex = canvasTex((g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(26,24,16,1)';
    for (let x = 0; x < w; x += 8) {
      const th = 40 + Math.sin(x * .05) * 22 + Math.random() * 26;
      g.beginPath(); g.arc(x, h - th + 22, 26 + Math.random() * 22, 0, 7); g.fill();
      if (Math.random() > .82) { g.fillRect(x - 3, h - th - 46, 6, 60); g.beginPath(); g.arc(x, h - th - 52, 30, 0, 7); g.fill(); }
    }
    g.fillRect(0, h - 24, w, 24);
  }, 1024, 256);
  treeTex.repeat.set(2, 1);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(170, 13),
    new THREE.MeshBasicMaterial({ map: treeTex, color: 0x8a5a3c, transparent: true, opacity: .8, fog: false }));
  far.position.set(0, 1.2, -46); scene.add(far);
  const near = new THREE.Mesh(new THREE.PlaneGeometry(150, 10),
    new THREE.MeshBasicMaterial({ map: treeTex, color: 0x241c12, transparent: true, opacity: .95, fog: false }));
  near.position.set(0, .2, -33); scene.add(near);
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(150, 20),
    new THREE.MeshBasicMaterial({ map: glowTex, color: 0xe09a55, transparent: true, opacity: .38, depthWrite: false }));
  haze.position.set(0, 3.5, -30); scene.add(haze);
  const sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd9a0, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sunSpr.scale.set(34, 34, 1); sunSpr.position.set(5, 7.5, -68); scene.add(sunSpr);
}
// drifting birds
const birds = [];
{
  const birdTex = canvasTex((g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(30,22,16,1)'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(8, h * .6); g.quadraticCurveTo(w * .3, h * .25, w * .5, h * .55);
    g.quadraticCurveTo(w * .7, h * .25, w - 8, h * .6); g.stroke();
  }, 128, 64);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: birdTex, transparent: true, opacity: .8, fog: false, depthWrite: false }));
    const s = .9 + Math.random() * .9; b.scale.set(s * 1.6, s * .8, 1);
    b.position.set(-30 + Math.random() * 50, 8 + Math.random() * 6, -38 - Math.random() * 8);
    b.userData.v = .35 + Math.random() * .4; scene.add(b); birds.push(b);
  }
}

/* ================= dust + shafts ================= */
let dust = null;
if (HI || isMobile) {
  const n = HI ? 200 : 80, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * 10; pos[i * 3 + 1] = Math.random() * 3.1; pos[i * 3 + 2] = -11 + Math.random() * 24; }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dust = new THREE.Points(dg, new THREE.PointsMaterial({ map: glowTex, color: 0xffd9a8, size: .045, transparent: true, opacity: .4, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(dust);
}
// window light shaft
{
  const shaft = new THREE.Mesh(new THREE.PlaneGeometry(10, 7),
    new THREE.MeshBasicMaterial({ map: glowTex, color: 0xff9a50, transparent: true, opacity: .1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  shaft.position.set(0, 1.6, -9.5); shaft.rotation.x = -.5; scene.add(shaft);
}

/* ================= post: bloom + warm grade ================= */
let composer = null, gradePass = null;
if (HI) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), .36, .55, .8);
  composer.addPass(bloom);
  gradePass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uVig: { value: .5 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uVig; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        c.rgb += vec3(0.030, 0.010, -0.014) * (1.0 - c.rgb); // warm shadow lift
        c.rgb *= vec3(1.028, 1.0, 0.962);                    // honey highlights
        float d = distance(vUv, vec2(0.5, 0.46));
        c.rgb *= 1.0 - uVig * smoothstep(0.32, 0.92, d);     // vignette
        gl_FragColor = c;
      }`
  });
  composer.addPass(gradePass);
  composer.addPass(new OutputPass());
}

/* ================= camera: one continuous shot ================= */
const posCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 1.62, 19), new THREE.Vector3(0, 1.62, 15.5),
  new THREE.Vector3(0, 1.6, 12.9), new THREE.Vector3(0.4, 1.55, 10.4),
  new THREE.Vector3(2.9, 2, 8.8), new THREE.Vector3(2.7, 1.95, 7.3),
  new THREE.Vector3(0, 1.55, 4.2), new THREE.Vector3(0, 1.55, 1),
  new THREE.Vector3(-1.6, 1.64, -2.6), new THREE.Vector3(-1.7, 1.6, -4.3),
  new THREE.Vector3(-0.6, 1.58, -6.6), new THREE.Vector3(-2, 1.64, -5.6), new THREE.Vector3(-2.9, 1.68, -4.4),
]);
const lookCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 1.35, 12), new THREE.Vector3(0, 1.3, 12),
  new THREE.Vector3(0, 1.25, 7), new THREE.Vector3(0.2, 1.05, 6.5),
  new THREE.Vector3(0.5, 1.0, 6.8), new THREE.Vector3(0.3, 1.0, 6.2),
  new THREE.Vector3(0, 1.2, -1), new THREE.Vector3(0, 1.2, -6),
  new THREE.Vector3(-0.6, 1.05, -5.2), new THREE.Vector3(-1.6, 1.3, -5.6),
  new THREE.Vector3(-4.2, 1.6, -5.2), new THREE.Vector3(-5.9, 1.8, -5), new THREE.Vector3(-5.9, 1.8, -5),
]);
/* ---- even pacing: equal scroll per chapter, dwell at each beat ---- */
const PACE_S = [0, .09, .2, .32, .41, .49, .57, .65, .76, .85, 1];
let PACE_U = null;
function buildPace() {
  const N = 600, pts = posCurve.getSpacedPoints(N);
  const A = [
    new THREE.Vector3(0, 1.62, 19), new THREE.Vector3(0, 1.6, 12.9),
    new THREE.Vector3(1.3, 1.6, 9.5), new THREE.Vector3(2.9, 2, 8.8),
    new THREE.Vector3(2.7, 1.95, 7.3), new THREE.Vector3(0, 1.55, 4.2),
    new THREE.Vector3(0, 1.55, 2), new THREE.Vector3(-1.6, 1.64, -2.6),
    new THREE.Vector3(-1, 1.58, -6.2), new THREE.Vector3(-2.2, 1.65, -5.4),
    new THREE.Vector3(-2.9, 1.68, -4.4),
  ];
  PACE_U = A.map(a => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i <= N; i++) { const d = pts[i].distanceToSquared(a); if (d < bd) { bd = d; bi = i; } }
    return bi / N;
  });
  PACE_U[0] = 0; PACE_U[PACE_U.length - 1] = 1;
}
buildPace();
function remapU(s) {
  const S = PACE_S, U = PACE_U;
  if (s <= 0) return 0; if (s >= 1) return 1;
  for (let j = 0; j < S.length - 1; j++) {
    if (s <= S[j + 1]) {
      const f = (s - S[j]) / (S[j + 1] - S[j]); // linear: constant velocity, no lurch
      return U[j] + (U[j + 1] - U[j]) * f;
    }
  }
  return 1;
}
const clamp01 = v => Math.min(1, Math.max(0, v));

/* ================= scroll = time (single RAF loop) ================= */
gsap.registerPlugin(ScrollTrigger);
let lenis = null;
if (window.Lenis && !reduceMotion) {
  lenis = new Lenis({ lerp: .09, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);      // official sync
  gsap.ticker.add((t) => lenis.raf(t * 1000));   // one shared loop
  gsap.ticker.lagSmoothing(0);
}
ScrollTrigger.create({ trigger: '#track', start: 'top top', end: 'bottom bottom', onUpdate: s => { progress = s.progress; } });

function scrollToProgress(t) {
  const y = t * (document.getElementById('track').offsetHeight - innerHeight);
  if (lenis) lenis.scrollTo(y, { duration: 2.4 }); else scrollTo({ top: y, behavior: 'smooth' });
}
document.querySelectorAll('[data-scroll-to]').forEach(a =>
  a.addEventListener('click', e => { e.preventDefault(); scrollToProgress(parseFloat(a.dataset.scrollTo)); }));
document.querySelectorAll('#chapters button').forEach(b =>
  b.addEventListener('click', () => scrollToProgress(parseFloat(b.dataset.goto))));

/* ================= text: scrubbed character reveals ================= */
function splitAll() {
  if (!window.SplitText) return;
  try {
    document.querySelectorAll('.split').forEach(el => {
      if (el._split) el._split.revert();
      el._split = new SplitText(el, { type: 'chars', charsClass: 'ch' });
    });
  } catch (e) { /* fall back to line reveals */ }
}
splitAll();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { splitAll(); ScrollTrigger.refresh(); });
/* ---- single text stage: every statement cycles through one fixed place ---- */
const slates = [...document.querySelectorAll('.moment:not(.m-book)')];
const SLATE_AT = [0, .06, .16, .28, .38, .46, .54, .62, .70];
let slateIdx = -2, slateLive = false;
gsap.set(slates, { autoAlpha: 0 });
function setSlate(i) {
  if (i === slateIdx) return;
  slateIdx = i;
  // bulletproof: exactly one slate exists at a time — hard-hide the rest, then reveal
  slates.forEach(s => { gsap.killTweensOf(s); gsap.killTweensOf(s.querySelectorAll('.ch')); });
  gsap.set(slates, { autoAlpha: 0, y: 0 });
  const s = slates[i];
  if (!s) return;
  if (reduceMotion) { gsap.set(s, { autoAlpha: 1 }); return; }
  gsap.fromTo(s, { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: .65, ease: 'power3.out', overwrite: 'auto' });
  const ch = s.querySelectorAll('.ch');
  if (ch.length) gsap.fromTo(ch, { yPercent: 112 }, { yPercent: 0, duration: .85, ease: 'power3.out', stagger: .012, overwrite: 'auto' });
  const f = s.querySelectorAll('.fade-line, .kicker');
  if (f.length) gsap.fromTo(f, { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .55, stagger: .07, overwrite: 'auto', delay: .1 });
}
/* booking card keeps its own in-flow reveal */
{
  const bookEl = document.getElementById('book');
  const bChars = bookEl.querySelectorAll('.ch');
  const bFades = bookEl.querySelectorAll('.fade-line, .kicker');
  const btl = gsap.timeline({ defaults: { ease: 'power3.out' },
    scrollTrigger: { trigger: bookEl, start: 'top 88%', end: 'top 38%', scrub: true } });
  if (bChars.length) btl.from(bChars, { yPercent: 112, duration: 1, stagger: .01 }, 0);
  if (bFades.length) btl.from(bFades, { y: 24, autoAlpha: 0, duration: .7, stagger: .08 }, .15);
}

/* ================= HUD ================= */
const sceneName = document.getElementById('sceneName'), timecode = document.getElementById('timecode');
const bar = document.getElementById('progressBar'), hint = document.getElementById('scrollHint'), leak = document.getElementById('lightLeak');
const chapBtns = [...document.querySelectorAll('#chapters button')];
const chapAt = [0, .09, .2, .57, .64, .82, 1];
const names = [[.02, 'Darkness'], [.1, 'The doorway'], [.22, 'Entering'], [.36, 'The room'], [.55, 'The other side'], [.62, 'The big room'], [.70, 'Details'], [.82, 'The screen'], [.95, 'Book a room']];

/* (silent film — ambient sound removed) */

/* ================= booking: real inquiry ================= */
document.getElementById('bookForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const subject = encodeURIComponent(`Room inquiry — ${f.get('room')} — ${f.get('date')} ${f.get('time')}`);
  const body = encodeURIComponent(`Hi Deskly,\n\nRoom: ${f.get('room')}\nDate: ${f.get('date')}\nTime: ${f.get('time')}\nDuration: ${f.get('dur')}\nEmail: ${f.get('email')}\n\nPlease confirm availability.`);
  document.getElementById('bookFine').textContent = 'Opening your email client — we confirm within two working hours.';
  location.href = `mailto:info@deskly.in?subject=${subject}&body=${body}`;
});
const dateInput = document.querySelector('input[type=date]');
if (dateInput) dateInput.min = new Date().toISOString().slice(0, 10);

/* ================= loader ================= */
{
  const count = document.getElementById('ldCount'), fill = document.getElementById('ldBar');
  const state = { v: 0 };
  gsap.to(state, {
    v: 100, duration: 1.8, ease: 'power2.inOut',
    onUpdate: () => {
      count.textContent = String(Math.round(state.v)).padStart(2, '0');
      fill.style.width = state.v + '%';
    },
    onComplete: () => {
      gsap.to('#loader', {
        autoAlpha: 0, duration: .9, ease: 'power2.inOut', delay: .15,
        onComplete: () => { document.getElementById('loader').style.display = 'none'; slateLive = true; ScrollTrigger.refresh(); }
      });
    }
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
  addEventListener('load', () => ScrollTrigger.refresh());
}

/* ================= frame loop ================= */
const clock = new THREE.Clock();
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), .05);
  time += dt;
  smooth += (progress - smooth) * (reduceMotion ? 1 : .09); // single smoothing stage (Lenis does the rest)
  const p = clamp01(smooth);
  const u = remapU(p); // arc-length pacing: every chapter costs the same scroll

  posCurve.getPointAt(u, camPos);
  if (!reduceMotion) {
    camPos.x += Math.sin(time * .45) * .03;
    camPos.y += Math.cos(time * .38) * .02;
  }
  camera.position.copy(camPos);
  lookCurve.getPointAt(u, camLook);
  camera.lookAt(camLook);
  const fov = 58 - THREE.MathUtils.smoothstep(p, .25, .9) * 14; // slow compression into the city
  if (Math.abs(camera.fov - fov) > .01) { camera.fov = fov; camera.updateProjectionMatrix(); }

  // door + light choreography
  const doorP = THREE.MathUtils.smoothstep(p, .04, .12);
  const press = THREE.MathUtils.smoothstep(doorP, 0, .22); // handle dips first…
  const swing = THREE.MathUtils.smoothstep(doorP, .18, 1); // …then the door follows
  doorPivot.rotation.y = swing * 1.85; // opens inward, ahead of you
  armF.rotation.z = press * .45; armB.rotation.z = press * .45; // tip swings DOWN, both faces
  if (Math.abs(doorP - lastDoorP) > .002) { // only moving actor: re-bake shadows
    lastDoorP = doorP;
    if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
  }
  gapLight.material.opacity = .95 * (1 - doorP);
  doorSpot.intensity = doorP * 42 * (1 - p * .35);
  leakCur += ((doorP * (1 - doorP) * 3.2) - leakCur) * .12; // damped: no scrub strobe
  leak.style.opacity = leakCur.toFixed(3);

  keyA.intensity = 8 + THREE.MathUtils.smoothstep(p, .12, .3) * 36;
  keyB.intensity = 6 + THREE.MathUtils.smoothstep(p, .5, .66) * 52;
  screenGlow.intensity = THREE.MathUtils.smoothstep(p, .78, .9) * 60;
  daylight.intensity = 18 + THREE.MathUtils.smoothstep(p, .6, .88) * 34;
  sun.intensity = .3 + THREE.MathUtils.smoothstep(p, .72, .9) * 1.7;
  scene.fog.density = .05 - p * .033;
  renderer.toneMappingExposure = 1.06 + THREE.MathUtils.smoothstep(p, .06, .2) * .18;

  const cross = Math.exp(-Math.pow((p - .57) * 26, 2)); // 1 only on the crossing frame
  glassWallMat.opacity = .08 - cross * .075; // thin out instead of flashing
  glassL.visible = glassR.visible = cross < .85;
  const gOpen = THREE.MathUtils.smoothstep(p, .5, .55) * (1 - THREE.MathUtils.smoothstep(p, .585, .64));
  glassPivot.rotation.y = gOpen * 1.75; // opens ahead, closes behind you
  if (Math.abs(gOpen - lastGOpen) > .004) { lastGOpen = gOpen; if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true; }
  winGlass.material.opacity = .07 + THREE.MathUtils.smoothstep(p, .8, .92) * .05;
  logoMat.opacity = THREE.MathUtils.smoothstep(p, .08, .18); // Deskly on screen from arrival — always
  finMat.opacity = THREE.MathUtils.smoothstep(p, .84, .9); // finale copy lives ON the screen

  if (dust) { dust.rotation.y = time * .008; dust.position.y = Math.sin(time * .3) * .05; }
  for (const b of birds) {
    b.position.x += dt * b.userData.v;
    b.position.y += Math.sin(time * 1.2 + b.position.z) * dt * .15;
    if (b.position.x > 42) b.position.x = -42;
  }

  // HUD
  document.body.classList.toggle('ending', p > .9);
  if (hint) hint.style.opacity = p > .03 ? 0 : 1;
  if (bar) bar.style.transform = `scaleX(${p})`;
  for (const [th, n] of names) if (p >= th) sceneName.textContent = n;
  const tc = Math.floor(p * 96);
  timecode.textContent = `${String(Math.floor(tc / 60)).padStart(2, '0')}:${String(tc % 60).padStart(2, '0')}`;
  let ci = 0; chapAt.forEach((t, i) => { if (p >= t - .02) ci = i; });
  chapBtns.forEach((b, i) => b.classList.toggle('on', i === ci));
  // single text stage driver
  if (slateLive) {
    let si = -1;
    if (p < .80) for (let i = 0; i < SLATE_AT.length; i++) if (p >= SLATE_AT[i]) si = i;
    setSlate(si);
  }

  // auto-tune: step down while struggling, then settle
  if (autoQ && time > 2.5) {
    fAcc += dt; fN++;
    if (fN >= 100) {
      const fps = fN / Math.max(fAcc, 1e-3); fN = 0; fAcc = 0; fChecks++;
      if (fps < 42 && TIER < 2) applyTier(TIER + 1);
      if (TIER === 2 || fChecks >= 3) autoQ = false;
    }
  }

  if (TIER === 0 && composer) composer.render(); else renderer.render(scene, camera);
  firstFrame = true;
}

function onResize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (composer) composer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);

/* ---- adaptive quality: Cine / Smooth / Lite ---- */
TIER = isMobile ? 1 : 0; autoQ = true; fAcc = 0; fN = 0; fChecks = 0;
const TIER_DPR = [1.5, 1.25, 1];
function applyTier(t) {
  TIER = t;
  const dpr = Math.min(devicePixelRatio, TIER_DPR[t]);
  renderer.setPixelRatio(dpr);
  if (composer) composer.setPixelRatio(dpr);
  const wantShadows = t === 0 || (t === 1 && !isMobile);
  if (renderer.shadowMap.enabled !== wantShadows) {
    renderer.shadowMap.enabled = wantShadows;
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    renderer.shadowMap.needsUpdate = true; // re-bake after toggle
  }
  if (dust) dust.visible = t < 2;
  onResize();
}
applyTier(TIER);
renderer.shadowMap.needsUpdate = true; // initial bake
frame(); // start only after everything above is initialized
