import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createCinematicLoader, nextFrame } from './js/loader.js';
import { createTextures, createMaterials } from './js/textures.js';

const canvas = document.getElementById('stage');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = matchMedia('(max-width: 768px)').matches;
const HI = !isMobile && !reduceMotion;
let progress = 0, smooth = 0, time = 0, lastDoorP = -1, leakCur = 0;
let TIER = isMobile ? 2 : 1, autoQ = true, fAcc = 0, fN = 0, fChecks = 0, lastGOpen = -1;
const load = createCinematicLoader();
await load.fonts();

/* ================= renderer / scene ================= */
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, powerPreference: 'high-performance',
  stencil: false, depth: true, alpha: false,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 2 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = !isMobile;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0908);
scene.fog = new THREE.FogExp2(0x0b0908, 0.024);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.12, 120);

const TEX = await createTextures(HI);
const MAT = createMaterials(TEX);
const { rug: rugTex, sky: skyTex, glow: glowTex, shadow: shadowTex } = TEX;
const phys = (o) => new THREE.MeshPhysicalMaterial(o);
const std = (o) => new THREE.MeshStandardMaterial(o);

/* ================= helpers ================= */
function softR(w, h, d, r = 0.018) {
  return Math.min(r, Math.min(w, h, d) * 0.42);
}
function box(w, h, d, mat, x, y, z, shadow = false) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, softR(w, h, d)), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m;
}
function rbox(w, h, d, r, mat, x, y, z) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, softR(w, h, d, r)), mat);
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

const cupGeo = new THREE.CylinderGeometry(.042, .034, .09, 12);
const cofGeo = new THREE.CircleGeometry(.036, 12);
const penGeo = new THREE.CylinderGeometry(.004, .004, .11, 5);
const canGeo = new THREE.CylinderGeometry(.065, .065, .025, 10);
const canMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.1, 1.25, .62) });
function placeCup(x, y, z) {
  const cup = new THREE.Mesh(cupGeo, MAT.paper);
  cup.position.set(x, y, z); scene.add(cup);
  const cof = new THREE.Mesh(cofGeo, std({ color: 0x2a1608, roughness: .35 }));
  cof.rotation.x = -Math.PI / 2; cof.position.set(x, y + .046, z); scene.add(cof);
}
function placePen(x, y, z, ry = 0) {
  const pen = new THREE.Mesh(penGeo, MAT.black);
  pen.position.set(x, y, z); pen.rotation.z = Math.PI / 2; pen.rotation.y = ry; scene.add(pen);
}
function placeCans(spots, y = 3.22) {
  const inst = new THREE.InstancedMesh(canGeo, canMat, spots.length);
  const d = new THREE.Object3D();
  spots.map(([x, z], i) => {
    d.position.set(x, y, z); d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
  });
  scene.add(inst);
}
function wallSign(map, w, h, x, y, z, ry = 0) {
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std({ map, roughness: .38, metalness: .25 }));
  plate.position.set(x, y, z); plate.rotation.y = ry; scene.add(plate);
}

/* ================= lights ================= */
/* Cool sky bounce against warm ground bounce. Without the cool side every
   surface lands on the same hue and the rooms read flat. Held near zero in the
   windowless corridor, where cool skylight would be a lie, and ramped up on
   entering the daylit rooms. */
const bounce = new THREE.HemisphereLight(0x6d7c8c, 0x241608, .08);
scene.add(bounce);
const doorSpot = new THREE.SpotLight(0xffb46b, 0, 22, .65, .55, 1.2);
doorSpot.position.set(0, 1.4, 10.2); doorSpot.target.position.set(0, 1, 16.5);
scene.add(doorSpot, doorSpot.target);

const keyA = new THREE.SpotLight(0xffd9a8, 40, 26, .95, .8, 1.4);
keyA.position.set(0, 3.1, 7); keyA.target.position.set(0, .8, 7);
scene.add(keyA, keyA.target);

const keyB = new THREE.SpotLight(0xffd9a8, 55, 32, 1, .8, 1.4);
keyB.position.set(0, 3.4, -5); keyB.target.position.set(0, .8, -5);
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
if (!isMobile) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = .04;
  sun.shadow.camera.left = -8; sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8;
}
scene.add(sun, sun.target);

// pendant warmth is carried by emissive bulbs + halos (no point-light cost)

/* ================= corridor + doorway ================= */
box(4.6, .2, 8.45, MAT.darkWall, 0, -.1, 16.275); // ends at 12.05 — meets room floor, no overlap
box(.25, 3.4, 9.8, MAT.darkWall, -2.3, 1.6, 15.9);
box(.25, 3.4, 9.8, MAT.darkWall, 2.3, 1.6, 15.9);
box(4.8, .25, 9, MAT.felt, 0, 3.3, 16);
// end wall with a REAL opening — camera flies through, never through solid slab
box(1.45, 3.4, .3, MAT.darkWall, -1.675, 1.6, 11.9);
box(1.45, 3.4, .3, MAT.darkWall, 1.675, 1.6, 11.9);
box(1.9, .8, .3, MAT.darkWall, 0, 2.9, 11.9);
box(.2, 2.6, .5, MAT.oakDark, -.9, 1.2, 12);
box(.2, 2.6, .5, MAT.oakDark, .9, 1.2, 12);
box(2, .2, .5, MAT.oakDark, 0, 2.55, 12);
// skirting glow strips in corridor (bloom catches these)
[-2.12, 2.12].map((sx) =>
  box(.03, .05, 8.6, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1, .5) }), sx, .12, 16, false));
// door panel on hinge
const doorPivot = new THREE.Group(); doorPivot.position.set(-.8, 0, 12); scene.add(doorPivot);
const doorPanel = new THREE.Mesh(new RoundedBoxGeometry(1.6, 2.44, .1, 4, .03),
  phys({ color: 0x4f3620, roughness: .42, clearcoat: .6, clearcoatRoughness: .4, envMapIntensity: .8 }));
doorPanel.position.set(.8, 1.26, 0); doorPanel.castShadow = true; doorPivot.add(doorPanel);
[.75, 1.75].map((py) => {
  const mould = new THREE.Mesh(new RoundedBoxGeometry(1.1, .8, .03, 3, .012), MAT.oakDark);
  mould.position.set(.8, py, .055);
  doorPivot.add(mould);
  return mould;
});
// handle set, both faces: rose + plate + lever + tip. Sits proud of the panel.
const roseF = new THREE.Mesh(new THREE.CylinderGeometry(.032, .032, .02, 20), MAT.brass);
roseF.rotation.x = Math.PI / 2; roseF.position.set(1.42, 1.05, .058); doorPivot.add(roseF);
const leverF = new THREE.Group(); leverF.position.set(1.42, 1.05, .062); doorPivot.add(leverF);
const plateF = new THREE.Mesh(new RoundedBoxGeometry(.05, .24, .018, 3, .006), MAT.brass); leverF.add(plateF);
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
  std({ map: TEX.plaque, roughness: .35, metalness: .6 }));
plaque.position.set(1.45, 1.7, 12.06); scene.add(plaque);
const kick = new THREE.Mesh(new RoundedBoxGeometry(1.52, .18, .02, 3, .008), MAT.brass);
kick.position.set(.8, .12, .056); doorPivot.add(kick);
[[.42, .55], [.42, 1.26], [.42, 1.95]].map(([hx, hy]) => {
  const hinge = new THREE.Mesh(new RoundedBoxGeometry(.04, .12, .03, 2, .006), MAT.brass);
  hinge.position.set(hx, hy, .06); doorPivot.add(hinge);
  return hinge;
});
[[-2.05, 14.2], [2.05, 14.2], [-2.05, 17.4], [2.05, 17.4]].map(([sx, sz]) => {
  const arm = box(.04, .18, .08, MAT.brass, sx, 2.05, sz, false);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3.6, 2.1, 1.1) }));
  bulb.position.set(sx + (sx > 0 ? -.06 : .06), 1.92, sz); scene.add(bulb);
  return arm;
});
box(.08, .12, .02, MAT.black, -2.08, 1.15, 12.35, false);
box(.03, .05, .015, MAT.brass, -2.06, 1.15, 12.36, false);
placeCans([[0, 17.6], [0, 15.2], [0, 13.4]]);

/* ================= Room A — the atelier ================= */
const floorA = box(10, .2, 9.8, MAT.floorA, 0, -.1, 7.15); floorA.receiveShadow = true; // ends 2.25 — no overlap with Room B floor
box(10, .25, 10.5, MAT.felt, 0, 3.35, 6.8);
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
  const n = 20, inst = new THREE.InstancedMesh(slatGeo, MAT.slat, n);
  const d = new THREE.Object3D();
  [...Array(n)].map((_, i) => {
    d.position.set(-4.7, 1.6, 2.8 + i * .42);
    d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
  });
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
rbox(4.6, .11, 1.6, .05, MAT.oak, 0, .8, 7);
box(.5, .115, .04, MAT.brass, 0, .8, 7, false);
box(1.7, .68, .09, MAT.oakDark, -1.5, .37, 7); box(1.7, .68, .09, MAT.oakDark, 1.5, .37, 7);
box(3.2, .05, .3, MAT.brass, 0, .05, 7, false);
box(4.3, .03, .03, stripMat, 0, .72, 7.72, false); box(4.3, .03, .03, stripMat, 0, .72, 6.28, false);
{
  const blotter = new THREE.Mesh(new RoundedBoxGeometry(1.6, .012, .9, 3, .01), MAT.leather);
  blotter.position.set(0, .866, 7); scene.add(blotter);
}
// laptop with glowing screen
{
  const base = rbox(.46, .025, .32, .01, MAT.black, -1.1, .885, 7.15); base.rotation.y = .3;
  const scr = new THREE.Mesh(new RoundedBoxGeometry(.46, .3, .015, 3, .008),
    new THREE.MeshBasicMaterial({ map: TEX.screen, toneMapped: false }));
  scr.position.set(-1.17, 1, 7.28); scr.rotation.set(-.28, .3, 0); scr.castShadow = true; scene.add(scr);
}
// notebooks + cups + carafe (human traces)
rbox(.42, .035, .3, .008, MAT.paper, 1.2, .885, 6.85);
{
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(.38, .26), std({ map: TEX.notepad, roughness: .82 }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(1.2, .908, 6.85); scene.add(pad);
}
rbox(.38, .03, .28, .008, std({ color: 0x8a3b2e, roughness: .7 }), 1.21, .918, 6.84);
[[1.8, 7.25], [.4, 7.35]].map(([cx, cz]) => placeCup(cx, .95, cz));
placePen(1.05, .9, 6.72, .4);
placePen(-.15, .9, 7.22, -.6);
{
  const tray = rbox(.42, .02, .28, .01, MAT.brass, -.55, .89, 7.38);
  tray.castShadow = false;
  const carafe = new THREE.Mesh(new THREE.CylinderGeometry(.055, .07, .2, 12), MAT.paper);
  carafe.position.set(-.62, 1.0, 7.38); scene.add(carafe);
  const gl = new THREE.Mesh(new THREE.CylinderGeometry(.03, .026, .09, 10), MAT.paper);
  gl.position.set(-.42, .95, 7.32); scene.add(gl);
}
{
  const cards = new THREE.Mesh(new RoundedBoxGeometry(.12, .01, .08, 2, .004), MAT.paper);
  cards.position.set(.85, .89, 7.35); cards.rotation.y = .2; scene.add(cards);
}
wallSign(TEX.clock, .38, .38, 4.86, 2.15, 7.4, -Math.PI / 2);
{
  const print = new THREE.Mesh(new THREE.PlaneGeometry(.7, .9), std({ map: TEX.art, roughness: .8 }));
  print.position.set(4.86, 1.7, 4.6); print.rotation.y = -Math.PI / 2; scene.add(print);
  box(.04, 1.0, .8, MAT.brass, 4.9, 1.7, 4.6, false);
}
placeCans([[-2.2, 9.2], [2.2, 9.2], [-2.2, 5.2], [2.2, 5.2], [0, 7]], 3.28);
[[-4.7, 4.2], [-4.7, 8.8], [4.7, 5.0]].map(([x, z]) => {
  box(.08, .06, .12, MAT.black, x, .18, z, false);
});
const chairSeatGeo = new RoundedBoxGeometry(.56, .09, .56, 4, .03);
const chairBackGeo = new RoundedBoxGeometry(.5, .64, .08, 4, .025);
const chairLegGeo = new THREE.CylinderGeometry(.02, .016, .49, 6);
function chair(x, z, ry, mat) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
  const seat = new THREE.Mesh(chairSeatGeo, mat);
  seat.position.y = .49; seat.castShadow = true;
  const back = new THREE.Mesh(chairBackGeo, mat);
  back.position.set(0, .88, -.28); back.rotation.x = -.12; back.castShadow = true;
  g.add(seat, back);
  [[-.24, -.24], [.24, -.24], [-.24, .24], [.24, .24]].map(([lx, lz]) => {
    const leg = new THREE.Mesh(chairLegGeo, MAT.black);
    leg.position.set(lx * 1.08, .245, lz * 1.08); g.add(leg);
    return leg;
  });
  scene.add(g); return g;
}
[...Array(4)].map((_, i) => {
  chair(-1.5 + i * 1.0, 6.05, 0, MAT.fabric);
  chair(-1.5 + i * 1.0, 7.95, Math.PI, MAT.fabric);
});
const padGeo = new RoundedBoxGeometry(.46, .035, .46, 3, .012);
[-1.5, -.5, .5, 1.5].map((x) => {
  const a = new THREE.Mesh(padGeo, MAT.paper);
  a.position.set(x, .54, 6.05); scene.add(a);
  const b = new THREE.Mesh(padGeo, MAT.paper);
  b.position.set(x, .54, 7.95); scene.add(b);
  return a;
});
function pendant(x, y, z, r = .24, ceil = 3.24) {
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(r * .2, r, .22, 12, 1, true),
    std({ color: 0x191410, roughness: .5, metalness: .4, side: THREE.DoubleSide }));
  shade.position.set(x, y + .08, z); scene.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.04, 8, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 2.4, 1.1) }));
  bulb.position.set(x, y, z); scene.add(bulb);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, Math.max(.2, ceil - y - .1), 6), MAT.black);
  cord.position.set(x, (ceil + y + .06) / 2, z); scene.add(cord);
  if (HI) {
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffcf96, transparent: true, opacity: .4, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(.7, .7, 1); halo.position.set(x, y, z); scene.add(halo);
  }
}
pendant(-.75, 2.1, 7); pendant(.75, 2.1, 7);
// plant
{
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(.24, .19, .38, 20), std({ color: 0x7a5a3c, roughness: .8 }));
  pot.position.set(4.3, .19, 10.5); pot.castShadow = true; scene.add(pot);
  [...Array(3)].map((_, i) => {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(.28, 6, 5), MAT.leaf);
    leaf.scale.set(.5, 1.3, .5);
    leaf.position.set(4.3 + (i - 1) * .18, .85 + i * .12, 10.5);
    leaf.rotation.set(.2, i, .15);
    scene.add(leaf);
    return leaf;
  });
  contactShadow(4.3, 10.5, 1.2, 1.2, .5);
}

/* ================= glass transition wall ================= */
const glassL = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 3.2), MAT.glass);
glassL.position.set(-2.75, 1.6, 2); scene.add(glassL);
const glassR = glassL.clone(); glassR.position.x = 2.75; scene.add(glassR);
[-5, -3, -1, 1, 3, 5].map((x) => box(.1, 3.2, .12, MAT.black, x, 1.6, 2));
box(10, .1, .12, MAT.black, 0, 3.15, 2);
box(4.45, .1, .12, MAT.black, -2.775, .06, 2); box(4.45, .1, .12, MAT.black, 2.775, .06, 2);
box(10, .025, .09, MAT.brass, 0, .008, 2.25, false); // threshold strip hides the floor seam
/* Glass door on hinge — full height, jamb to head rail, so there's no stub of
   transom above it. Wall glass spans y 0..3.2 and the head rail sits at 3.10,
   so the leaf tops out just under that. */
box(.09, 3.05, .14, MAT.black, -.55, 1.575, 2);
box(.09, 3.05, .14, MAT.black, .55, 1.575, 2);
const glassPivot = new THREE.Group(); glassPivot.position.set(-.5, 0, 2); scene.add(glassPivot);
const glassPanel = new THREE.Mesh(new RoundedBoxGeometry(1, 3.02, .04, 3, .012), MAT.glass.clone());
glassPanel.position.set(.5, 1.57, 0); glassPanel.castShadow = true; glassPivot.add(glassPanel);
const railT = new THREE.Mesh(new RoundedBoxGeometry(1, .09, .07, 3, .014), MAT.black);
railT.position.set(.5, 3.035, 0); glassPivot.add(railT);
const railB = railT.clone(); railB.position.y = .1; glassPivot.add(railB);
const pullSt1 = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .05, 8), MAT.brass);
pullSt1.rotation.x = Math.PI / 2; pullSt1.position.set(.82, 1.7, .045); glassPivot.add(pullSt1);
const pullSt2 = pullSt1.clone(); pullSt2.position.y = 1.1; glassPivot.add(pullSt2);
const pullBar = new THREE.Mesh(new THREE.CylinderGeometry(.016, .016, .68, 12), MAT.brass);
pullBar.position.set(.82, 1.4, .075); pullBar.castShadow = true; glassPivot.add(pullBar);

/* ================= Room B — large conference ================= */
box(12, .2, 14.5, MAT.floorB, 0, -.1, -5);
box(12, .25, 14.5, MAT.felt, 0, 3.5, -5);
box(.25, 3.7, 14.5, MAT.wall, -6, 1.75, -5);
box(.25, 3.7, 14.5, MAT.wall, 6, 1.75, -5);
// acoustic baffle fins
{
  const geo = new THREE.BoxGeometry(.12, .3, 12);
  const inst = new THREE.InstancedMesh(geo, MAT.oakDark, 12);
  const d = new THREE.Object3D();
  [...Array(12)].map((_, i) => {
    d.position.set(-5.2 + i * .9, 3.28, -5);
    d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
  });
  scene.add(inst);
}
// long table
rbox(6, .13, 1.9, .055, MAT.oak, 0, .82, -5);
box(1.4, .135, .05, MAT.brass, 0, .82, -5, false);
[-2.5, 0, 2.5].map((dx) => box(.16, .75, 1.5, MAT.oakDark, dx, .38, -5));
box(5.7, .03, .03, stripMat, 0, .73, -4.12, false); box(5.7, .03, .03, stripMat, 0, .73, -5.88, false);
box(.05, .06, .05, MAT.black, .8, .9, -5, false);
{
  const phone = new THREE.Mesh(new RoundedBoxGeometry(.28, .04, .18, 3, .01), MAT.black);
  phone.position.set(0, .91, -5); scene.add(phone);
  const pad = new THREE.Mesh(new RoundedBoxGeometry(.16, .02, .1, 2, .006), MAT.brass);
  pad.position.set(0, .935, -5); scene.add(pad);
}
[-2.1, -.7, .7, 2.1].map((x) => {
  const tent = new THREE.Mesh(new RoundedBoxGeometry(.16, .09, .002, 2, .001), MAT.paper);
  tent.position.set(x, .94, -4.2); tent.rotation.x = -.4; scene.add(tent);
  return tent;
});
[-2.4, 0, 2.4].map((x) => placeCup(x, .95, -5.45));
placePen(-1.5, .91, -4.5, .3);
placePen(1.4, .91, -4.62, -.5);
wallSign(TEX.plaqueB, .72, .18, -5.86, 2.72, -2.4, Math.PI / 2);
wallSign(TEX.clock, .42, .42, 5.86, 2.35, -2.2, -Math.PI / 2);
placeCans([[-3.2, -2.2], [0, -2.2], [3.2, -2.2], [-3.2, -7.8], [0, -7.8], [3.2, -7.8]], 3.42);
box(11.6, .12, .28, MAT.oakDark, 0, .06, 1.85);
contactShadow(0, -5, 7.4, 3.4, .6); lightPool(0, -5, 7, 3.2, 0xffbe78, .13);
[...Array(4)].map((_, i) => {
  rbox(.34, .025, .26, .006, MAT.paper, -1.8 + i * 1.2, .9, -4.55);
  const lined = new THREE.Mesh(new THREE.PlaneGeometry(.3, .22), std({ map: TEX.notepad, roughness: .82 }));
  lined.rotation.x = -Math.PI / 2; lined.position.set(-1.8 + i * 1.2, .918, -4.55); scene.add(lined);
  return lined;
});
[...Array(5)].map((_, i) => {
  chair(-2.4 + i * 1.2, -3.7, Math.PI, MAT.fabricDark);
  chair(-2.4 + i * 1.2, -6.3, 0, MAT.fabricDark);
});
[...Array(3)].map((_, i) => pendant(-2 + i * 2, 2.3, -5, .26, 3.38));
// display + whiteboard + art + credenza
{
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(.12, 1.36, 2.9, 4, .04),
    std({ color: 0x0a0c10, roughness: .28, metalness: .35 }));
  bezel.position.set(-5.92, 1.85, -5); scene.add(bezel);
  const img = new THREE.Mesh(new THREE.PlaneGeometry(2.62, 1.12),
    new THREE.MeshBasicMaterial({ map: TEX.screen, toneMapped: false }));
  img.rotation.y = Math.PI / 2; img.position.set(-5.855, 1.85, -5); scene.add(img);
  box(.05, .5, .3, MAT.brass, -5.85, 1, -5, false);
  const wb = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.5), std({ map: TEX.board, roughness: .25, envMapIntensity: .8 }));
  wb.rotation.y = -Math.PI / 2; wb.position.set(5.84, 1.85, -5); scene.add(wb);
  box(.1, 1.7, 2.9, MAT.black, 5.9, 1.85, -5, false);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.4), std({ map: TEX.art, roughness: .8 }));
  art.rotation.y = -Math.PI / 2; art.position.set(5.85, 1.9, -8.6); scene.add(art);
  box(.08, 1.55, 1.25, MAT.brass, 5.9, 1.9, -8.6, false);
  rbox(2.4, .55, .5, .04, MAT.oakDark, -4.2, .28, -10.8);
  [...Array(5)].map((_, i) => box(.12, .3 + (i % 3) * .09, .3, std({ color: new THREE.Color().setHSL(.07 + i * .03, .35, .3 + (i % 2) * .12), roughness: .8 }), -4.7 + i * .28, .56 + (.3 + (i % 3) * .09) / 2, -10.8, false));
}

/* ================= arrival corner — lounge vignette by the glass ================= */
{
  const rug2 = new THREE.Mesh(new THREE.CircleGeometry(1.15, 36), std({ map: rugTex, roughness: 1 }));
  rug2.rotation.x = -Math.PI / 2; rug2.position.set(3.7, .012, -10.2); rug2.receiveShadow = true; scene.add(rug2);
  const lg = new THREE.Group(); lg.position.set(3.7, 0, -10.2); lg.rotation.y = -.5; scene.add(lg);
  const seat = new THREE.Mesh(new RoundedBoxGeometry(.78, .14, .74, 4, .04), MAT.fabric);
  seat.position.y = .4; seat.castShadow = true; lg.add(seat);
  const cushion = new THREE.Mesh(new RoundedBoxGeometry(.66, .1, .6, 4, .035), std({ color: 0xb08c5a, roughness: .9 }));
  cushion.position.set(0, .5, .02); lg.add(cushion);
  const back = new THREE.Mesh(new RoundedBoxGeometry(.74, .8, .12, 4, .035), MAT.fabric);
  back.position.set(0, .82, -.4); back.rotation.x = -.28; back.castShadow = true; lg.add(back);
  [[-.32, -.3], [.32, -.3], [-.32, .3], [.32, .3]].map(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.02, .016, .34, 10), MAT.oakDark);
    leg.position.set(lx, .17, lz); leg.castShadow = true; lg.add(leg);
    return leg;
  });
  const tt = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .045, 28), MAT.oak);
  tt.position.set(2.75, .56, -9.6); tt.castShadow = true; scene.add(tt);
  const tl = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .54, 12), MAT.brass);
  tl.position.set(2.75, .28, -9.6); scene.add(tl);
  const cup = new THREE.Mesh(cupGeo, MAT.paper);
  cup.position.set(2.7, .63, -9.55); scene.add(cup);
  const mag = new THREE.Mesh(new RoundedBoxGeometry(.16, .012, .22, 2, .004), std({ color: 0x7a3a2a, roughness: .7 }));
  mag.position.set(2.82, .59, -9.48); mag.rotation.y = .4; scene.add(mag);
  const book = new THREE.Mesh(new RoundedBoxGeometry(.14, .03, .2, 2, .006), std({ color: 0x2a3a44, roughness: .7 }));
  book.position.set(2.68, .585, -9.7); book.rotation.y = -.2; scene.add(book);
  pendant(4.5, 1.7, -10.4, .2, 3.38);
  contactShadow(3.7, -10.2, 2.6, 2.2, .5); lightPool(3.7, -10.2, 3, 2.6, 0xffbe78, .14);
}

/* ================= window + golden hour ================= */
const winGlass = new THREE.Mesh(new THREE.PlaneGeometry(12, 3.3), MAT.glass.clone());
winGlass.position.set(0, 1.72, -12); scene.add(winGlass);
[-6, -3.6, -1.2, 1.2, 3.6, 6].map((x) => box(.14, 3.5, .14, MAT.black, x, 1.72, -12));
box(12, .14, .14, MAT.black, 0, 3.42, -12); box(12, .14, .14, MAT.black, 0, .08, -12);
box(12, .1, .5, MAT.oakDark, 0, .12, -11.8); // sill
box(.14, 3.3, .5, MAT.oakDark, -5.9, 1.72, -11.85, false); box(.14, 3.3, .5, MAT.oakDark, 5.9, 1.72, -11.85, false);
box(12, .04, .08, MAT.brass, 0, 1.72, -11.92, false);
function sheerCurtain(x, phase = 0, opacity = .3) {
  const cur = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 3.2, 6, 1),
    std({ color: 0xf2e6d4, transparent: true, opacity, roughness: .9, side: THREE.DoubleSide, depthWrite: false }));
  const pos = cur.geometry.attributes.position;
  [...Array(pos.count)].map((_, i) => pos.setZ(i, Math.sin(pos.getX(i) * 4 + phase) * .085));
  cur.geometry.computeVertexNormals();
  cur.position.set(x, 1.75, -11.7); scene.add(cur);
}
sheerCurtain(5, 1, .28);
[-2.4, 0, 2.4].map((x) => {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(.07, .06, .1, 10), std({ color: 0x6a4a32, roughness: .8 }));
  pot.position.set(x, .22, -11.55); scene.add(pot);
  return pot;
});
lightPool(0, -10, 10, 3.4, 0xff9a50, .12);
sheerCurtain(-5, 0, .32);
{
  // Photoreal city plate fills the window — soft haze near glass, no cartoon treeline
  const city = new THREE.Mesh(new THREE.PlaneGeometry(42, 18),
    new THREE.MeshBasicMaterial({ map: skyTex, fog: false }));
  city.position.set(0, 3.6, -26); scene.add(city);
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(28, 10),
    new THREE.MeshBasicMaterial({ map: glowTex, color: 0xe09a55, transparent: true, opacity: .1, depthWrite: false }));
  haze.position.set(0, 2.4, -16); scene.add(haze);
  const sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffd9a0, transparent: true, opacity: .28,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  sunSpr.scale.set(11, 11, 1); sunSpr.position.set(6, 6.2, -26); scene.add(sunSpr);
}

/* ================= dust + shafts ================= */
let dust = null;
if (HI) {
  const n = 60, pos = new Float32Array(n * 3);
  [...Array(n)].map((_, i) => {
    pos[i * 3] = (Math.random() - .5) * 10;
    pos[i * 3 + 1] = Math.random() * 3.1;
    pos[i * 3 + 2] = -11 + Math.random() * 24;
  });
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

/* ================= post: bloom only if the machine can hold it ================= */
let composer = null;
function enableBloom() {
  if (composer || !HI) return;
  // Composer bypasses the canvas's own MSAA, so the target has to multisample
  // itself or every brass edge in the set goes back to stair-steps.
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x, size.y, {
    samples: 4, type: THREE.HalfFloatType,
  }));
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), .18, .5, .92));
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uVig: { value: .42 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uVig; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        // The bloom pass leaves HDR values above 1.0 in the half-float target;
        // the S-curve below goes negative on those, so clamp before grading.
        c.rgb = clamp(c.rgb, 0.0, 1.0);
        // Filmic split-tone: warm highlights, cool shadows. The separation is
        // what reads as "graded" — a uniform warm push just reads as sepia.
        float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        c.rgb += vec3(-0.016, -0.004, 0.022) * (1.0 - smoothstep(0.0, 0.45, l));
        c.rgb += vec3( 0.026,  0.010, -0.020) * smoothstep(0.35, 1.0, l);
        // gentle S-curve for contrast without crushing either end
        c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.22);
        float d = distance(vUv, vec2(0.5, 0.46));
        c.rgb *= 1.0 - uVig * smoothstep(0.34, 0.94, d);
        gl_FragColor = c;
      }`
  }));
  composer.addPass(new OutputPass());
  composer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(renderer.getPixelRatio());
}

/* ================= camera: a walk with holds on the two money shots =========
   Even Z steps give constant speed, which is wrong for film — the reel has to
   slow where there's something to look at. Points cluster at the Executive
   table and again at the Conference wide, so getPointAt decelerates there.
*/
const PATH = [
  [0, 1.55, 18.5], [0, 1.55, 16.6], [0, 1.55, 14.6], [0, 1.55, 12.6],
  // approach and hold on the Executive table (z = 7)
  [0.15, 1.56, 10.8], [0.7, 1.61, 9.9], [1.2, 1.67, 9.15], [1.35, 1.69, 8.9],
  [1.0, 1.55, 6.6], [0.55, 1.55, 4.6], [0.15, 1.55, 2.8],
  // through the glass into Room B, settling into a wide
  [0.05, 1.55, 1.0], [-0.05, 1.56, -0.6], [-0.1, 1.58, -1.9],
  [-0.05, 1.6, -2.6], [0, 1.6, -2.95], [0, 1.6, -3.05],
].map(([x, y, z]) => new THREE.Vector3(x, y, z));

const LOOK = [
  [0, 1.4, 13.2], [0, 1.4, 11.5], [0, 1.4, 9.8], [0, 1.4, 8.5],
  [0.05, 1.38, 7.6], [-0.05, 1.33, 7.2], [-0.28, 1.28, 7.0], [-0.38, 1.26, 6.95],
  [-0.2, 1.4, 4.2], [0, 1.4, 1.5], [0, 1.4, -1.2],
  [0.08, 1.42, -2.8], [0.05, 1.4, -4.4], [0.02, 1.36, -5.6],
  [0, 1.34, -6.3], [0, 1.32, -6.7], [0, 1.32, -6.8],
].map(([x, y, z]) => new THREE.Vector3(x, y, z));

const posCurve = new THREE.CatmullRomCurve3(PATH, false, 'centripetal');
const lookCurve = new THREE.CatmullRomCurve3(LOOK, false, 'centripetal');
posCurve.updateArcLengths();
lookCurve.updateArcLengths();

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep01 = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

/* Lenis = only input smoother. Camera follows with one light damp. */
gsap.registerPlugin(ScrollTrigger);
let lenis = null;
if (window.Lenis && !reduceMotion) {
  lenis = new Lenis({
    lerp: isMobile ? 0.16 : 0.12,
    smoothWheel: true,
    wheelMultiplier: isMobile ? 0.95 : 0.85,
    touchMultiplier: isMobile ? 1.35 : 1,
    syncTouch: true,
    syncTouchLerp: isMobile ? 0.1 : 0.075,
  });
  lenis.on('scroll', ScrollTrigger.update);
  lenis.stop();
}

/* The film owns only the hero. Past it the canvas stops rendering and the
   document is a normal page. */
let filmLive = true;
ScrollTrigger.create({
  id: 'film',
  trigger: '#filmRun',
  start: 'top top',
  end: 'bottom bottom',
  onUpdate: (s) => { progress = s.progress; },
  onLeave: () => { filmLive = false; document.body.classList.add('past-film'); setSlate(-1); },
  onEnterBack: () => { filmLive = true; document.body.classList.remove('past-film'); },
});

/* ================= slates: one line at a time ================= */
const slates = [...document.querySelectorAll('.slate')];
/* Cut points sit on the beat each line describes, not on even slices. */
const SLATE_CUTS = [0, 0.27, 0.6];
const SLATE_END = 0.9;
const slateForProgress = (p) => {
  if (p >= SLATE_END) return -1;
  let i = 0;
  while (i + 1 < SLATE_CUTS.length && p >= SLATE_CUTS[i + 1]) i++;
  return i;
};

let slateIdx = -2, slateLive = false;
const SLATE_BITS = '.l, .eyebrow, .slate-sub';
slates.forEach((s) => gsap.set(s, { autoAlpha: 0 }));

/* Fades out rather than snapping, so slates cross-dissolve into each other and
   the last one dissolves into the film/content handoff. */
function hideSlate(el) {
  gsap.killTweensOf(el);
  gsap.killTweensOf(el.querySelectorAll(SLATE_BITS));
  gsap.to(el, {
    autoAlpha: 0, duration: reduceMotion ? 0 : .45, ease: 'power2.in', overwrite: true,
    onComplete: () => {
      // Only reset the lines if this slate hasn't been scrolled back into.
      if (slates[slateIdx] === el) return;
      gsap.set(el.querySelectorAll(SLATE_BITS), { clearProps: 'opacity,visibility,transform' });
    },
  });
}

function setSlate(i) {
  if (i === slateIdx) return;
  const prev = slates[slateIdx];
  slateIdx = i;
  if (prev) hideSlate(prev);
  const s = slates[i];
  if (!s) return;
  if (reduceMotion) { gsap.set(s, { autoAlpha: 1 }); return; }
  gsap.fromTo(s, { autoAlpha: 0 }, { autoAlpha: 1, duration: .7, ease: 'power2.out', overwrite: true });
  const bits = s.querySelectorAll(SLATE_BITS);
  gsap.fromTo(bits, { yPercent: 105, autoAlpha: 0 },
    { yPercent: 0, autoAlpha: 1, duration: .85, stagger: .07, ease: 'power3.out', overwrite: true });
}

/* The film hands off to the document: letterbox opens out, grade and canvas
   dissolve while the first section's gradient rises over them. Scrubbed, so it
   tracks the scroll instead of snapping at the boundary. */
if (!reduceMotion) {
  // Two stages. The frame releases while the film is still running...
  gsap.to('.letterbox', {
    scaleY: 0, ease: 'power1.inOut',
    scrollTrigger: { trigger: '#filmRun', start: 'bottom bottom+=70%', end: 'bottom bottom', scrub: true },
  });
  // ...then the image dissolves under the first section as it rises, so the two
  // overlap instead of leaving a gap of nothing between them.
  gsap.timeline({
    scrollTrigger: { trigger: '.lede-section', start: 'top bottom', end: 'top 30%', scrub: true },
  })
    .to('#stage', { opacity: 0, ease: 'power2.inOut' }, 0)
    .to('.hero-grade', { opacity: 0, ease: 'power2.inOut' }, 0)
    .to('.grain', { opacity: 0, ease: 'none' }, .3);
}

/* ================= page: reveals, nav state, smooth anchors ================= */
const hint = document.getElementById('scrollHint');
const leak = document.getElementById('lightLeak');

if (!reduceMotion) {
  const reveals = document.querySelectorAll(
    '.lede, .lede-facts, .sec-head, .room-img, .room-body, .included-img, .ticks, '
    + '.rates-table, .notes, .visit-addr, .visit-links, .visit-img, #bookForm, .foot-grid > *');
  reveals.forEach((el) => {
    gsap.fromTo(el, { autoAlpha: 0, y: 20 }, {
      autoAlpha: 1, y: 0, duration: .85, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });
}

/* Nav gets a backdrop once the film is behind us, and marks the section in view. */
ScrollTrigger.create({
  start: 'top -60',
  onUpdate: (s) => document.body.classList.toggle('scrolled', s.scroll() > 60),
});

const navLinks = [...document.querySelectorAll('.nav-links a')];
const sectionFor = new Map(
  navLinks.map((a) => [document.querySelector(a.hash), a]).filter(([s]) => s));
if (sectionFor.size) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      navLinks.forEach((a) => a.removeAttribute('aria-current'));
      sectionFor.get(e.target)?.setAttribute('aria-current', 'true');
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sectionFor.forEach((_, section) => io.observe(section));
}

/* Anchor clicks ride Lenis so they match the page's own scroll feel. */
document.querySelectorAll('a[href^="#"]:not(.skip)').forEach((a) => {
  a.addEventListener('click', (e) => {
    const target = a.hash === '#top' ? document.body : document.querySelector(a.hash);
    if (!target) return;
    e.preventDefault();
    const y = a.hash === '#top' ? 0 : target.getBoundingClientRect().top + scrollY - 72;
    if (lenis) lenis.scrollTo(y, { duration: 1.1, easing: (x) => 1 - Math.pow(1 - x, 3) });
    else scrollTo({ top: y, behavior: 'smooth' });
  });
});

/* ================= booking: a real inquiry, native controls ================= */
const form = document.getElementById('bookForm');
const roomSelect = document.getElementById('bookRoom');
const fine = document.getElementById('bookFine');
const dateInput = document.getElementById('bookDate');

dateInput.min = new Date().toISOString().slice(0, 10);

/* "Reserve the Executive" preselects that room before jumping to the form. */
document.querySelectorAll('[data-room]').forEach((a) => {
  a.addEventListener('click', () => {
    const i = a.dataset.room === 'executive' ? 0 : 1;
    roomSelect.selectedIndex = i;
  });
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const f = new FormData(form);
  const lines = [
    'Hi Deskly,', '',
    `Room: ${f.get('room')}`,
    `Date: ${f.get('date')}`,
    `Start: ${f.get('time')}`,
    `Duration: ${f.get('dur')}`,
    f.get('people') ? `People: ${f.get('people')}` : null,
    f.get('notes') ? `Notes: ${f.get('notes')}` : null,
    '', 'Please confirm availability.',
    `— ${f.get('email')}`,
  ].filter(Boolean);
  const subject = `Room inquiry — ${f.get('room')} — ${f.get('date')} ${f.get('time')}`;
  fine.textContent = 'Opening your email app — send the draft and we\'ll reply within two working hours.';
  fine.dataset.state = 'sent';
  location.href = `mailto:info@deskly.in?subject=${encodeURIComponent(subject)}`
    + `&body=${encodeURIComponent(lines.join('\n'))}`;
});

/* ================= frame loop — Lenis + camera + render on ONE rAF ========= */
let pageHidden = false;
document.addEventListener('visibilitychange', () => { pageHidden = document.hidden; });
const clock = new THREE.Clock();
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let lastLeak = -1;

function damp(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

function updateDoorAndLights(u, dt) {
  const doorP = smoothstep01((u - 0.05) / 0.1);
  const press = smoothstep01(doorP / 0.28);
  const swing = smoothstep01((doorP - 0.18) / 0.82);
  doorPivot.rotation.y = swing * 1.85;
  armF.rotation.z = press * .45; armB.rotation.z = press * .45;
  if (Math.abs(doorP - lastDoorP) > .004) {
    lastDoorP = doorP;
    if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
  }
  gapLight.material.opacity = .95 * (1 - doorP);
  doorSpot.intensity = doorP * 42 * (1 - u * .35);
  leakCur = damp(leakCur, doorP * (1 - doorP) * 3.0, 8, dt);
  if (Math.abs(leakCur - lastLeak) > 0.015) {
    lastLeak = leakCur;
    leak.style.opacity = leakCur.toFixed(3);
  }
  keyA.intensity = 8 + smoothstep01((u - 0.14) / 0.18) * 36;
  keyB.intensity = 6 + smoothstep01((u - 0.55) / 0.2) * 52;
  daylight.intensity = 18 + smoothstep01((u - 0.6) / 0.22) * 34;
  sun.intensity = .3 + smoothstep01((u - 0.72) / 0.18) * 1.7;
  bounce.intensity = .08 + smoothstep01((u - 0.12) / 0.24) * .46;
  scene.fog.density = .05 - u * .033;
}

function updateGlassAndScreens(u) {
  const cross = Math.exp(-Math.pow((u - 0.62) * 18, 2));
  glassL.material.opacity = .08 - cross * .075;
  glassL.visible = glassR.visible = cross < .85;
  const gOpen = smoothstep01((u - 0.54) / 0.08) * (1 - smoothstep01((u - 0.78) / 0.1));
  glassPivot.rotation.y = gOpen * 1.75;
  if (Math.abs(gOpen - lastGOpen) > .006) {
    lastGOpen = gOpen;
    if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
  }
  winGlass.material.opacity = .07 + smoothstep01((u - 0.78) / 0.14) * .05;
  screenGlow.intensity = smoothstep01((u - 0.78) / 0.16) * 18;
}

function probeQuality(p, dt) {
  if (!autoQ) return;
  if (p >= 0.03) { autoQ = false; return; }
  if (time <= 2) return;
  fAcc += dt; fN++;
  if (fN < 90) return;
  const fps = fN / Math.max(fAcc, 1e-3); fN = 0; fAcc = 0; fChecks++;
  if (fps > 54 && TIER === 1 && !isMobile) applyTier(0);
  else if (fps < 38 && TIER < 2) applyTier(TIER + 1);
  if (TIER === 2 || TIER === 0 || fChecks >= 3) autoQ = false;
}

function frame(now) {
  requestAnimationFrame(frame);
  if (lenis) lenis.raf(now || performance.now());
  if (pageHidden) return;

  const dt = Math.min(clock.getDelta(), .05);
  time += dt;
  smooth = damp(smooth, progress, reduceMotion ? 60 : 16, dt);

  // Past the hero the canvas is hidden — don't pay for frames nobody sees.
  if (!filmLive) return;

  const p = clamp01(smooth);
  posCurve.getPointAt(p, camPos);
  camera.position.copy(camPos);
  lookCurve.getPointAt(p, camLook);
  camera.lookAt(camLook);

  updateDoorAndLights(p, dt);
  updateGlassAndScreens(p);
  if (dust && TIER === 0) dust.rotation.y = time * .006;
  if (hint) hint.style.opacity = p > .04 ? 0 : 1;
  if (slateLive) setSlate(slateForProgress(p));
  probeQuality(p, dt);

  if (TIER === 0 && composer) composer.render(); else renderer.render(scene, camera);
}

function onResize() {
  const w = innerWidth;
  const h = visualViewport?.height || innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (composer) composer.setSize(w, h);
  ScrollTrigger.refresh();
}
addEventListener('resize', onResize);
visualViewport?.addEventListener('resize', onResize);

/* ---- adaptive quality: Cine / Smooth / Lite ---- */
const TIER_DPR = [2, 1.5, 1.15];
function applyTier(t) {
  TIER = t;
  const dpr = Math.min(devicePixelRatio, TIER_DPR[t]);
  renderer.setPixelRatio(dpr);
  if (t === 0) enableBloom();
  if (composer) composer.setPixelRatio(dpr);
  const wantShadows = t < 2 && !isMobile;
  if (renderer.shadowMap.enabled !== wantShadows) {
    renderer.shadowMap.enabled = wantShadows;
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    renderer.shadowMap.needsUpdate = true;
  }
  if (dust) dust.visible = t === 0;
  onResize();
}
applyTier(TIER);
renderer.shadowMap.needsUpdate = true;
requestAnimationFrame(frame);
await nextFrame();
await nextFrame();
await load.finish();
document.body.classList.add('entered');
lenis?.start();
slateLive = true;
setSlate(0);
ScrollTrigger.refresh();
addEventListener('load', () => ScrollTrigger.refresh());
