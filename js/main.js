import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const LOOK = {
  exposure0: 0.76,
  exposure1: 0.38,
  bloom0: 0.16,
  bloom1: 0.42,
  bloomThreshold: 0.74,
  bloomRadius: 0.58,
  moon: 1.55,
  moonSpill: 8,
  key: 2.8,
  heart: 32,
  fire: 26,
  star: 16,
  starGlow: 1.85,
  bulbLight: 8.5,
  hemi: 0.46,
};

const LINES = [
  '今晚把灯留到最后',
  '雪是慢慢落下来的',
  '杯子还热着',
  '有人会推门进来',
  '坐近一点，光够分',
  '窗上已经有薄霜了',
  '礼物不必急着拆',
  '就这样亮着，也很好',
  '外套可以先搭在椅背上',
  '这一年，也点到头了',
  '炉火比话更暖',
  '你来的时候，灯是亮的',
];

const TIERS = [
  { y: 0.7, h: 1.16, r: 2.38 },
  { y: 1.58, h: 1.08, r: 2.02 },
  { y: 2.42, h: 1.0, r: 1.66 },
  { y: 3.2, h: 0.92, r: 1.3 },
  { y: 3.94, h: 0.84, r: 0.96 },
  { y: 4.62, h: 0.76, r: 0.66 },
  { y: 5.24, h: 0.68, r: 0.4 },
];

const N = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23,
  G4: 392, A4: 440, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46,
};

const MELODY = [
  [N.G4, 1.5], [N.A4, 0.5], [N.G4, 1], [N.E4, 2],
  [N.G4, 1.5], [N.A4, 0.5], [N.G4, 1], [N.E4, 2],
  [N.D5, 2], [N.D5, 1], [N.B4, 3],
  [N.C5, 2], [N.C5, 1], [N.G4, 3],
  [N.A4, 2], [N.A4, 1], [N.C5, 1.5], [N.B4, 0.5], [N.A4, 1], [N.G4, 1.5], [N.A4, 0.5], [N.G4, 1], [N.E4, 2],
  [N.A4, 2], [N.A4, 1], [N.C5, 1.5], [N.B4, 0.5], [N.A4, 1], [N.G4, 1.5], [N.A4, 0.5], [N.G4, 1], [N.E4, 2],
  [N.D5, 2], [N.D5, 1], [N.F5, 1.5], [N.D5, 0.5], [N.B4, 1], [N.C5, 2], [N.E5, 2],
  [N.C5, 1.5], [N.G4, 0.5], [N.E4, 1], [N.G4, 1.5], [N.F4, 0.5], [N.D4, 1], [N.C4, 3],
  [0, 3],
];

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = Math.min(window.innerWidth, window.innerHeight) < 760;
const NEEDLES = mobile ? 5600 : 11800;
const PUFFS = mobile ? 1100 : 2600;
const BULBS = mobile ? 46 : 72;
const BEADS = mobile ? 100 : 156;

const canvas = document.getElementById('view');
const seal = document.getElementById('ignite');
const noteEl = document.getElementById('note');
const noteText = document.getElementById('note-text');

const state = {
  ignite: 0,
  prevIgnite: 0,
  started: false,
  snow: 1,
  snowTarget: 1,
  fire: true,
  fireMix: 0.35,
  starChimed: false,
};

const tween = { from: 0, to: 0, start: performance.now(), dur: 1000, next: null };

let renderer;
let scene;
let camera;
let composer;
let controls;
let bloom;
let fxaa;
let heart;
let keyLight;
let moon;
let moonSpill;
let fillLight;
let fireLight;
let starLight;
let starMat;
let star;
let starGlow;
let fireMat;
let aoMat;
let ornamentRoot;
let emberPoints;
let steamMat;
let ready = false;
let queued = false;
let noteTimer = 0;
let idle = 0;
let paintAcc = 0;
let audio = null;

const bulbs = [];
const innerLights = [];
const flames = [];
const snowSystems = [];
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dummy = new THREE.Object3D();
const up = new THREE.Vector3(0, 1, 0);
const tierWeights = TIERS.map((tier) => tier.r * tier.r * tier.h);
const tierWeightSum = tierWeights.reduce((sum, value) => sum + value, 0);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20261112);

function radialTexture(stops, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) grd.addColorStop(offset, color);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function canvasTexture(canvas, repeat) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  if (repeat) tex.repeat.set(repeat[0], repeat[1]);
  return tex;
}

function makeWood() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#6a4632';
  g.fillRect(0, 0, 1024, 1024);
  const plank = 128;
  for (let y = 0; y < 1024; y += plank) {
    const shade = 78 + Math.random() * 36;
    g.fillStyle = `rgb(${shade + 38}, ${Math.floor(shade * 0.62)}, ${Math.floor(shade * 0.38)})`;
    g.fillRect(0, y + 1, 1024, plank - 3);
    g.strokeStyle = 'rgba(40, 18, 8, 0.28)';
    g.lineWidth = 1;
    for (let i = 0; i < 7; i += 1) {
      g.beginPath();
      const yy = y + 8 + Math.random() * (plank - 16);
      g.moveTo(0, yy);
      g.bezierCurveTo(280, yy + Math.random() * 10 - 5, 700, yy + Math.random() * 10 - 5, 1024, yy + Math.random() * 6 - 3);
      g.stroke();
    }
    g.fillStyle = 'rgba(255, 220, 180, 0.04)';
    g.fillRect(0, y + 1, 1024, 2);
  }
  return canvasTexture(c, [3, 3]);
}

function makePlaster() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#5c5148';
  g.fillRect(0, 0, 256, 256);
  const img = g.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    img.data[i] += n;
    img.data[i + 1] += n * 0.9;
    img.data[i + 2] += n * 0.7;
  }
  g.putImageData(img, 0, 0);
  return canvasTexture(c, [2.5, 2]);
}

function makeBark() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#4a3120';
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 36; i += 1) {
    g.strokeStyle = `rgba(28, 14, 8, ${0.18 + Math.random() * 0.4})`;
    g.lineWidth = 1 + Math.random() * 2.2;
    const x = Math.random() * 128;
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + 10, 70, x - 12, 150, x + 4, 256);
    g.stroke();
  }
  return canvasTexture(c);
}

function makeRug() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#4e2b30';
  g.beginPath();
  g.arc(256, 256, 250, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(226, 196, 140, 0.7)';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(256, 256, 214, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(226, 196, 140, 0.35)';
  g.beginPath();
  g.arc(256, 256, 150, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(226, 196, 140, 0.8)';
  g.beginPath();
  g.arc(256, 256, 8, 0, Math.PI * 2);
  g.fill();
  return canvasTexture(c);
}

function makeOrange() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const cx = 128;
  const cy = 128;
  const r = 120;
  g.fillStyle = '#e07a2f';
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f3b56a';
  g.beginPath();
  g.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(150, 62, 18, 0.55)';
  g.lineWidth = 2;
  for (let i = 0; i < 11; i += 1) {
    const a = (i / 11) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78);
    g.stroke();
  }
  g.fillStyle = '#f7d7a4';
  g.beginPath();
  g.arc(cx, cy, 18, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.arc(cx, cy, r * 0.86, 0, Math.PI * 2, true);
  g.fillStyle = '#c4511e';
  g.fill('evenodd');
  return canvasTexture(c);
}

function makeFlame() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 86, 2, 32, 80, 52);
  grd.addColorStop(0, 'rgba(255,252,236,1)');
  grd.addColorStop(0.35, 'rgba(255,196,90,0.95)');
  grd.addColorStop(0.72, 'rgba(255,120,30,0.28)');
  grd.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.ellipse(32, 80, 18, 42, 0, 0, Math.PI * 2);
  g.fill();
  return canvasTexture(c);
}

function sampleTier(t) {
  const x = THREE.MathUtils.clamp(t, 0, 0.999);
  const scaled = x * TIERS.length;
  const idx = Math.min(TIERS.length - 1, Math.floor(scaled));
  const local = scaled - idx;
  const tier = TIERS[idx];
  return {
    y: tier.y + local * tier.h * 0.82,
    rad: tier.r * (1 - local * 0.32),
    idx,
    local,
  };
}

function installGrain() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 96 + Math.random() * 110;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  document.querySelector('.grain').style.backgroundImage = `url(${c.toDataURL('image/png')})`;
}

function makePainter(width, height, draw) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return {
    tex,
    update(time) {
      draw(ctx, width, height, time);
      tex.needsUpdate = true;
    },
  };
}

function createWindowArt() {
  const stars = Array.from({ length: 42 }, () => ({
    x: Math.random() * 512,
    y: Math.random() * 420,
    s: Math.random() * 1.6 + 0.4,
    sp: 0.6 + Math.random() * 1.6,
    ph: Math.random() * Math.PI * 2,
  }));
  const flakes = Array.from({ length: 70 }, () => ({
    x: Math.random() * 512,
    y: Math.random() * 680,
    r: Math.random() * 1.6 + 0.4,
    v: 0.35 + Math.random() * 0.8,
    a: 0.25 + Math.random() * 0.6,
    ph: Math.random() * 6,
  }));
  return makePainter(512, 680, (ctx, w, h, time) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#07101c');
    sky.addColorStop(0.42, '#1c3a62');
    sky.addColorStop(1, '#0d1c33');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const mx = w * 0.73;
    const my = h * 0.2;
    const halo = ctx.createRadialGradient(mx, my, 6, mx, my, 110);
    halo.addColorStop(0, 'rgba(255, 248, 232, 0.95)');
    halo.addColorStop(0.25, 'rgba(214, 224, 240, 0.35)');
    halo.addColorStop(1, 'rgba(214, 224, 240, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(mx, my, 110, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f6f2e8';
    ctx.beginPath();
    ctx.arc(mx, my, 34, 0, Math.PI * 2);
    ctx.fill();

    for (const star of stars) {
      ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * star.sp + star.ph));
      ctx.fillStyle = '#fff';
      ctx.fillRect(star.x, star.y, star.s, star.s);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#10192c';
    ctx.fillRect(78, h - 168, 86, 96);
    ctx.fillStyle = '#ffb15a';
    ctx.globalAlpha = 0.75 + Math.sin(time * 2.2) * 0.12;
    ctx.fillRect(94, h - 146, 14, 20);
    ctx.fillRect(126, h - 124, 14, 18);
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#fff';
    for (const flake of flakes) {
      flake.y += flake.v;
      if (flake.y > h) flake.y = -4;
      flake.x += Math.sin(time + flake.ph) * 0.25;
      ctx.globalAlpha = flake.a;
      ctx.beginPath();
      ctx.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const frost = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.72);
    frost.addColorStop(0, 'rgba(255,255,255,0)');
    frost.addColorStop(1, 'rgba(226, 236, 244, 0.2)');
    ctx.fillStyle = frost;
    ctx.fillRect(0, 0, w, h);
  });
}

function createFireArt() {
  return makePainter(256, 256, (ctx, w, h, time) => {
    ctx.fillStyle = '#160804';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2c140c';
    ctx.save();
    ctx.translate(70, 196);
    ctx.rotate(-0.18);
    ctx.fillRect(0, 0, 130, 16);
    ctx.restore();
    ctx.save();
    ctx.translate(78, 180);
    ctx.rotate(0.22);
    ctx.fillRect(0, 0, 118, 14);
    ctx.restore();
    for (let i = 0; i < 5; i += 1) {
      const x = 78 + i * 24 + Math.sin(time * 3 + i) * 6;
      const fh = 86 + Math.sin(time * 5 + i * 1.7) * 22;
      const grad = ctx.createLinearGradient(x, 200, x, 200 - fh);
      grad.addColorStop(0, 'rgba(255, 150, 40, 0)');
      grad.addColorStop(0.25, 'rgba(255, 110, 24, 0.8)');
      grad.addColorStop(0.7, 'rgba(255, 214, 140, 0.5)');
      grad.addColorStop(1, 'rgba(255, 248, 220, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(x, 198 - fh * 0.42, 14 + Math.sin(time * 4 + i) * 3, fh * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const core = ctx.createRadialGradient(128, 188, 4, 128, 188, 78);
    core.addColorStop(0, 'rgba(255, 240, 210, 0.95)');
    core.addColorStop(0.35, 'rgba(255, 150, 50, 0.55)');
    core.addColorStop(1, 'rgba(255, 80, 0, 0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(128, 188, 78, 0, Math.PI * 2);
    ctx.fill();
  });
}

function addFlame(parent, x, y, z, w, h, hearth) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flameMap,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: '#ffc27a',
  }));
  sprite.position.set(x, y, z);
  sprite.scale.set(w, h, 1);
  parent.add(sprite);
  flames.push({
    sprite,
    w,
    h,
    hearth,
    sp: 6 + Math.random() * 4,
    ph: Math.random() * Math.PI * 2,
  });
}

let flameMap;

function buildRoom() {
  const plaster = makePlaster();
  const wallMat = new THREE.MeshStandardMaterial({
    map: plaster,
    roughness: 0.98,
    metalness: 0,
    side: THREE.BackSide,
  });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(24, 9.2, 32), wallMat);
  shell.position.set(0, 4.4, 3);
  shell.receiveShadow = true;
  scene.add(shell);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 32),
    new THREE.MeshPhysicalMaterial({
      map: makeWood(),
      roughness: 0.74,
      metalness: 0.04,
      clearcoat: 0.16,
      clearcoatRoughness: 0.58,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(2.35, 64),
    new THREE.MeshStandardMaterial({ map: makeRug(), roughness: 1, metalness: 0 }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.008;
  rug.receiveShadow = true;
  scene.add(rug);

  aoMat = new THREE.MeshBasicMaterial({
    color: '#000',
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  const ao = new THREE.Mesh(new THREE.CircleGeometry(2.05, 48), aoMat);
  ao.rotation.x = -Math.PI / 2;
  ao.position.y = 0.014;
  scene.add(ao);

  const windowArt = createWindowArt();
  const fireArt = createFireArt();
  windowPainter = windowArt;
  firePainter = fireArt;
  fireMat = new THREE.MeshBasicMaterial({ map: fireArt.tex, color: '#ffffff' });

  const win = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: '#3b2b22', roughness: 0.62 });
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(1.55, 2.15),
    new THREE.MeshBasicMaterial({ map: windowArt.tex }),
  );
  glass.position.z = -0.02;
  win.add(glass);
  const frameBits = [
    [1.86, 0.1, 0.14, 0, 1.12],
    [1.86, 0.1, 0.14, 0, -1.12],
    [0.1, 2.36, 0.14, -0.9, 0],
    [0.1, 2.36, 0.14, 0.9, 0],
    [0.055, 2.12, 0.08, 0, 0],
    [1.52, 0.055, 0.08, 0, 0],
  ];
  for (const [w, h, d, x, y] of frameBits) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
    bar.position.set(x, y, 0.05);
    win.add(bar);
  }
  const sill = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.08, 0.34), frameMat);
  sill.position.set(0, -1.22, 0.12);
  win.add(sill);
  const sillSnow = new THREE.MeshBasicMaterial({ color: '#f5f8fb' });
  for (let i = 0; i < 9; i += 1) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.016 + Math.random() * 0.02, 6, 6), sillSnow);
    puff.scale.y = 0.42;
    puff.position.set(-0.75 + Math.random() * 1.5, -1.16, 0.18);
    win.add(puff);
  }
  win.position.set(-5.15, 2.65, -6.5);
  win.rotation.y = 0.22;
  scene.add(win);

  const fp = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ map: plaster, color: '#b7a79c', roughness: 0.94 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.25, 1.5, 0.72), stone);
  body.position.y = 0.78;
  body.castShadow = true;
  body.receiveShadow = true;
  const opening = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.82, 0.28),
    new THREE.MeshBasicMaterial({ color: '#140804' }),
  );
  opening.position.set(0, 0.52, 0.24);
  const firePlane = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 0.68), fireMat);
  firePlane.position.set(0, 0.5, 0.4);
  const mantelMat = new THREE.MeshStandardMaterial({ color: '#4a3428', roughness: 0.55 });
  const mantel = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.12, 0.86), mantelMat);
  mantel.position.y = 1.58;
  mantel.castShadow = true;
  const logMat = new THREE.MeshStandardMaterial({ color: '#2a140e', roughness: 1 });
  const logA = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.72, 8), logMat);
  logA.rotation.z = Math.PI / 2;
  logA.rotation.y = 0.3;
  logA.position.set(0, 0.22, 0.42);
  const logB = logA.clone();
  logB.rotation.y = -0.5;
  logB.position.y = 0.32;
  fp.add(body, opening, firePlane, mantel, logA, logB);
  addFlame(fp, -0.55, 1.78, 0.16, 0.11, 0.18, true);
  addFlame(fp, 0.48, 1.78, 0.12, 0.1, 0.16, true);
  const wax = new THREE.MeshStandardMaterial({
    color: '#f4ecdf',
    roughness: 0.58,
    emissive: '#5a3a22',
    emissiveIntensity: 0.2,
  });
  for (const x of [-0.55, 0.48]) {
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.038, 0.16, 12), wax);
    candle.position.set(x, 1.72, 0.12);
    candle.castShadow = true;
    fp.add(candle);
  }
  fireLight = new THREE.PointLight('#ff8a3d', LOOK.fire * 0.35, 7.5, 2);
  fireLight.position.set(0, 0.55, 1.15);
  fp.add(fireLight);
  fp.position.set(4.35, 0, -3.35);
  fp.rotation.y = -0.85;
  fp.scale.setScalar(1.15);
  scene.add(fp);

  const emberCount = 40;
  const emberGeo = new THREE.BufferGeometry();
  const emberArr = new Float32Array(emberCount * 3);
  emberSpeeds = new Float32Array(emberCount);
  for (let i = 0; i < emberCount; i += 1) {
    emberArr[i * 3] = (Math.random() - 0.5) * 0.7;
    emberArr[i * 3 + 1] = 0.25 + Math.random() * 1.1;
    emberArr[i * 3 + 2] = 0.45 + Math.random() * 0.25;
    emberSpeeds[i] = 0.12 + Math.random() * 0.32;
  }
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberArr, 3));
  emberPoints = new THREE.Points(emberGeo, new THREE.PointsMaterial({
    color: '#ff9a4a',
    size: 0.04,
    map: glowMap,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.8,
  }));
  fp.add(emberPoints);

  moonSpill = new THREE.PointLight('#c5d4ef', LOOK.moonSpill, 8.5, 2);
  moonSpill.position.set(-2.8, 2.5, -3.3);
  scene.add(moonSpill);
  fillLight = new THREE.PointLight('#ffc7a2', 0, 14, 2);
  fillLight.position.set(-3.4, 3.5, 1.2);
  scene.add(fillLight);
}

let windowPainter;
let firePainter;
let emberSpeeds;
let glowMap;
let snowMap;

function buildTree() {
  const tree = new THREE.Group();
  const bark = makeBark();
  const barkMat = new THREE.MeshStandardMaterial({ map: bark, roughness: 0.92, color: '#ffffff' });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 1.22, 16), barkMat);
  trunk.position.y = 0.61;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  tree.add(trunk);

  for (let i = 0; i < 8; i += 1) {
    const ang = (i / 8) * Math.PI * 2 + 0.35;
    const len = 1.15 + (i % 3) * 0.12;
    const dir = new THREE.Vector3(Math.cos(ang), -0.36, Math.sin(ang)).normalize();
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.04, len, 5), barkMat);
    branch.quaternion.setFromUnitVectors(up, dir);
    branch.position.copy(dir).multiplyScalar(len * 0.46);
    branch.position.y += 1.18;
    tree.add(branch);
  }

  const needleGeo = new THREE.ConeGeometry(0.048, 0.15, 5);
  needleGeo.translate(0, 0.075, 0);
  const needleMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.93,
    metalness: 0,
    emissive: '#07140d',
    emissiveIntensity: 0.5,
  });
  const needles = new THREE.InstancedMesh(needleGeo, needleMat, NEEDLES);
  needles.receiveShadow = true;
  needles.frustumCulled = false;
  const deep = new THREE.Color('#143624');
  const mid = new THREE.Color('#2c623c');
  const tip = new THREE.Color('#8aa56e');
  const frost = new THREE.Color('#e7eeea');
  const color = new THREE.Color();
  const dir = new THREE.Vector3();

  for (let i = 0; i < NEEDLES; i += 1) {
    let pick = rng() * tierWeightSum;
    let tierIndex = 0;
    for (let t = 0; t < TIERS.length; t += 1) {
      pick -= tierWeights[t];
      if (pick <= 0) {
        tierIndex = t;
        break;
      }
    }
    const tier = TIERS[tierIndex];
    const local = rng();
    const ang = rng() * Math.PI * 2;
    const radial = tier.r * (0.18 + 0.84 * Math.pow(rng(), 0.55)) * (rng() > 0.96 ? 1.06 : 1);
    const y = Math.max(0.48, tier.y + local * tier.h * 0.78 + (rng() - 0.5) * 0.06);
    const x = Math.cos(ang) * radial;
    const z = Math.sin(ang) * radial;
    dir.set(Math.cos(ang), -0.22 - local * 0.28, Math.sin(ang)).normalize();
    dummy.position.set(x, y, z);
    dummy.quaternion.setFromUnitVectors(up, dir);
    dummy.rotateY(rng() * Math.PI * 2);
    const s = 0.72 + rng() * 0.5;
    dummy.scale.set(s * (0.85 + rng() * 0.3), s * (0.75 + rng() * 0.35), s * (0.85 + rng() * 0.3));
    dummy.updateMatrix();
    needles.setMatrixAt(i, dummy.matrix);

    const outer = radial / tier.r;
    const shade = THREE.MathUtils.clamp(0.25 + outer * 0.6 + rng() * 0.2, 0, 1);
    color.copy(deep).lerp(mid, shade);
    if (outer > 0.72) color.lerp(tip, 0.18 + rng() * 0.2);
    const frosted = outer > 0.9 && rng() > 0.72;
    if (frosted) color.lerp(frost, 0.22 + rng() * 0.18);
    needles.setColorAt(i, color);
  }
  needles.instanceMatrix.needsUpdate = true;
  needles.instanceColor.needsUpdate = true;
  tree.add(needles);

  const puffGeo = new THREE.SphereGeometry(1, 7, 5);
  const puffMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.97,
    emissive: '#07140c',
    emissiveIntensity: 0.4,
  });
  const puffs = new THREE.InstancedMesh(puffGeo, puffMat, PUFFS);
  puffs.frustumCulled = false;
  puffs.receiveShadow = true;
  const puffDeep = new THREE.Color('#0e2418');
  const puffMid = new THREE.Color('#1c4a30');
  for (let i = 0; i < PUFFS; i += 1) {
    let pick = rng() * tierWeightSum;
    let tierIndex = 0;
    for (let t = 0; t < TIERS.length; t += 1) {
      pick -= tierWeights[t];
      if (pick <= 0) {
        tierIndex = t;
        break;
      }
    }
    const tier = TIERS[tierIndex];
    const local = rng();
    const ang = rng() * Math.PI * 2;
    const shell = rng() > 0.58;
    const radial = tier.r * (shell ? 0.62 + rng() * 0.28 : 0.06 + Math.pow(rng(), 0.72) * 0.62);
    const y = Math.max(0.55, tier.y + local * tier.h * 0.7);
    dummy.position.set(Math.cos(ang) * radial, y, Math.sin(ang) * radial);
    dummy.rotation.set(rng() * 0.4, rng() * Math.PI, rng() * 0.4);
    const s = shell ? 0.07 + rng() * 0.07 : 0.11 + rng() * 0.15;
    dummy.scale.set(s * (0.85 + rng() * 0.3), s * (0.7 + rng() * 0.35), s);
    dummy.updateMatrix();
    puffs.setMatrixAt(i, dummy.matrix);
    color.copy(puffDeep).lerp(puffMid, 0.25 + rng() * 0.7);
    if (shell && rng() > 0.7) color.lerp(tip, 0.2);
    puffs.setColorAt(i, color);
  }
  puffs.instanceMatrix.needsUpdate = true;
  puffs.instanceColor.needsUpdate = true;
  tree.add(puffs);

  const skirtGeo = new THREE.RingGeometry(0.18, 1.78, 80, 5);
  skirtGeo.rotateX(-Math.PI / 2);
  const skirtPos = skirtGeo.attributes.position;
  for (let i = 0; i < skirtPos.count; i += 1) {
    const x = skirtPos.getX(i);
    const z = skirtPos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 1.05) {
      const a = Math.atan2(z, x);
      skirtPos.setY(i, Math.sin(a * 6.0 + r) * 0.035 * ((r - 1.05) / 0.73));
    }
  }
  skirtGeo.computeVertexNormals();
  const skirt = new THREE.Mesh(skirtGeo, new THREE.MeshPhysicalMaterial({
    color: '#6e2432',
    roughness: 0.78,
    metalness: 0,
    sheen: 1,
    sheenColor: new THREE.Color('#e3b4b6'),
    sheenRoughness: 0.42,
  }));
  skirt.position.y = 0.03;
  skirt.receiveShadow = true;
  tree.add(skirt);

  const beadGeo = new THREE.SphereGeometry(0.036, 8, 8);
  const beadMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, metalness: 0.14 });
  const beads = new THREE.InstancedMesh(beadGeo, beadMat, BEADS);
  beads.frustumCulled = false;
  const woodBead = new THREE.Color('#e7d3b0');
  const goldBead = new THREE.Color('#c6a15b');
  for (let i = 0; i < BEADS; i += 1) {
    const t = i / BEADS;
    const spot = sampleTier(Math.pow(t, 0.96));
    const ang = t * Math.PI * 2 * 6.1 + 0.8;
    const r = spot.rad * 0.95;
    dummy.position.set(Math.cos(ang) * r, spot.y - 0.04, Math.sin(ang) * r);
    dummy.scale.setScalar(0.78 + (i % 5) * 0.07);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    beads.setMatrixAt(i, dummy.matrix);
    beads.setColorAt(i, i % 4 === 0 ? goldBead : woodBead);
  }
  beads.instanceMatrix.needsUpdate = true;
  beads.instanceColor.needsUpdate = true;
  tree.add(beads);

  const stringSpots = [];
  for (let i = 0; i < BULBS; i += 1) {
    const t = (i + 0.5) / BULBS;
    const spot = sampleTier(t * 0.98);
    const ang = t * Math.PI * 2 * 5.2 + 0.4;
    const r = spot.rad * 0.9;
    stringSpots.push({
      t,
      p: new THREE.Vector3(
        Math.cos(ang) * r + Math.sin(i * 2.2) * 0.035,
        spot.y + Math.sin(i * 1.6) * 0.025,
        Math.sin(ang) * r + Math.cos(i * 1.4) * 0.035,
      ),
    });
  }
  const wire = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stringSpots.map((spot) => spot.p)), BULBS * 3, 0.0055, 4, false),
    new THREE.MeshStandardMaterial({ color: '#1a120e', roughness: 1 }),
  );
  tree.add(wire);

  const bulbGeo = new THREE.SphereGeometry(1, 16, 12);
  const warmColors = ['#ffc27a', '#ffe1b5', '#ffb15e', '#ffd7aa', '#ffcf96'];
  for (let i = 0; i < stringSpots.length; i += 1) {
    const radius = 0.042 + (i % 5) * 0.006;
    const mat = new THREE.MeshStandardMaterial({
      color: '#24180f',
      roughness: 0.28,
      metalness: 0.08,
      emissive: new THREE.Color(warmColors[i % warmColors.length]),
      emissiveIntensity: 0,
    });
    const glowMat = new THREE.SpriteMaterial({
      map: glowMap,
      color: warmColors[i % warmColors.length],
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    const group = new THREE.Group();
    group.position.copy(stringSpots[i].p);
    const mesh = new THREE.Mesh(bulbGeo, mat);
    mesh.scale.setScalar(radius);
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(0.28, 0.28, 1);
    group.add(mesh, glow);
    tree.add(group);
    bulbs.push({
      mat,
      glow,
      glowMat,
      heightT: stringSpots[i].t,
      phase: i * 1.7,
      speed: 1.4 + (i % 7) * 0.45,
      amp: 0.05 + (i % 4) * 0.04,
      base: 0.26 + (i % 3) * 0.05,
    });
  }

  for (let i = 0; i < 5; i += 1) {
    const t = 0.14 + i * 0.15;
    const spot = sampleTier(t);
    const ang = i * 2.35 + 0.5;
    const light = new THREE.PointLight(warmColors[i % warmColors.length], 0, 3.3, 2);
    light.position.set(Math.cos(ang) * spot.rad * 0.36, spot.y, Math.sin(ang) * spot.rad * 0.36);
    tree.add(light);
    innerLights.push({ light, heightT: t, phase: i * 1.3, speed: 1.6 + i * 0.25 });
  }

  heart = new THREE.PointLight('#ffaa5c', 0, 8, 2);
  heart.position.set(0, 3.05, 0.12);
  tree.add(heart);

  ornamentRoot = new THREE.Group();
  const kinds = [
    ['gold', 0.18], ['wine', 0.16], ['cream', 0.15], ['gold', 0.13],
    ['mercury', 0.17], ['glass', 0.155], ['copper', 0.145], ['wine', 0.19],
    ['cream', 0.125], ['pine', 0.11], ['orange', 0.13], ['gold', 0.15],
    ['mercury', 0.135], ['wine', 0.15], ['glass', 0.145], ['copper', 0.16],
  ];
  const library = {
    gold: new THREE.MeshStandardMaterial({ color: '#e0b45a', metalness: 0.88, roughness: 0.24 }),
    wine: new THREE.MeshStandardMaterial({ color: '#7a2432', metalness: 0.38, roughness: 0.22 }),
    cream: new THREE.MeshStandardMaterial({ color: '#f1e4ce', metalness: 0.06, roughness: 0.42 }),
    mercury: new THREE.MeshStandardMaterial({ color: '#d5dbde', metalness: 0.92, roughness: 0.2 }),
    copper: new THREE.MeshStandardMaterial({ color: '#b87333', metalness: 0.82, roughness: 0.32 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: '#ffe4c8',
      metalness: 0,
      roughness: 0.08,
      transmission: 0.86,
      thickness: 0.45,
      ior: 1.45,
      transparent: true,
      attenuationColor: new THREE.Color('#ffd0a4'),
      attenuationDistance: 0.45,
    }),
    pine: new THREE.MeshStandardMaterial({ color: '#6a4a2c', roughness: 0.86, flatShading: true }),
    orange: new THREE.MeshStandardMaterial({
      map: orangeMap,
      roughness: 0.52,
      emissive: '#5a2a10',
      emissiveIntensity: 0.18,
    }),
  };
  const capMat = new THREE.MeshStandardMaterial({ color: '#d9c7a2', metalness: 0.72, roughness: 0.34 });
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < kinds.length; i += 1) {
    const [type, radius] = kinds[i];
    const t = 0.08 + (i / (kinds.length - 1)) * 0.84;
    const spot = sampleTier(t);
    const ang = i * golden;
    const r = spot.rad * 0.98;
    const mat = library[type].clone();
    mat.emissive = mat.emissive ? mat.emissive.clone() : new THREE.Color('#ffb15a');
    if (type !== 'orange') mat.emissive.set('#ffb15a');
    mat.emissiveIntensity = type === 'orange' ? 0.18 : 0;
    let mesh;
    if (type === 'pine') {
      mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), mat);
      mesh.scale.set(0.82, 1.32, 0.82);
    } else if (type === 'orange') {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.028, 24), mat);
    } else {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 28, 20), mat);
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.16, radius * 0.26, radius * 0.28, 8),
        capMat,
      );
      cap.position.y = radius * 0.92;
      mesh.add(cap);
    }
    mesh.position.set(Math.cos(ang) * r, spot.y, Math.sin(ang) * r);
    if (type === 'orange') {
      const out = new THREE.Vector3(mesh.position.x, 0.15, mesh.position.z).normalize();
      mesh.quaternion.setFromUnitVectors(up, out);
    }
    mesh.userData.line = LINES[i % LINES.length];
    mesh.userData.pulse = 0;
    mesh.userData.baseScale = mesh.scale.clone();
    mesh.userData.baseEmissive = mat.emissiveIntensity;
    ornamentRoot.add(mesh);
  }
  tree.add(ornamentRoot);

  const starShape = new THREE.Shape();
  const spikes = 5;
  for (let i = 0; i < spikes * 2; i += 1) {
    const radius = i % 2 === 0 ? 0.42 : 0.17;
    const a = (i / (spikes * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    if (i === 0) starShape.moveTo(x, y);
    else starShape.lineTo(x, y);
  }
  starShape.closePath();
  const starGeo = new THREE.ExtrudeGeometry(starShape, {
    depth: 0.07,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.014,
    bevelSegments: 2,
  });
  starGeo.center();
  starMat = new THREE.MeshStandardMaterial({
    color: '#f0d48a',
    metalness: 0.84,
    roughness: 0.26,
    emissive: '#ffb347',
    emissiveIntensity: 0,
  });
  star = new THREE.Group();
  const starA = new THREE.Mesh(starGeo, starMat);
  const starB = new THREE.Mesh(starGeo, starMat);
  starB.rotation.y = Math.PI / 2;
  starGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowMap,
    color: '#ffd7a1',
    transparent: true,
    depthWrite: false,
    opacity: 0,
  }));
  starGlow.scale.set(LOOK.starGlow, LOOK.starGlow, 1);
  starGlow.userData.punch = 0;
  star.add(starA, starB, starGlow);
  star.position.y = 5.92;
  tree.add(star);
  starLight = new THREE.PointLight('#ffd2a0', 0, 4.5, 2);
  starLight.position.y = 5.92;
  tree.add(starLight);

  scene.add(tree);
}

let orangeMap;

function makeGift(w, h, d, paper, ribbon) {
  const group = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: paper, roughness: 0.72, metalness: 0.04 }),
  );
  box.castShadow = true;
  box.receiveShadow = true;
  const rib = new THREE.MeshStandardMaterial({ color: ribbon, roughness: 0.38, metalness: 0.45 });
  const bandA = new THREE.Mesh(new THREE.BoxGeometry(w * 0.14, h + 0.01, d + 0.012), rib);
  const bandB = new THREE.Mesh(new THREE.BoxGeometry(w + 0.012, h + 0.01, d * 0.14), rib);
  const bowGeo = new THREE.TorusGeometry(Math.min(w, d) * 0.16, Math.min(w, d) * 0.035, 8, 16, Math.PI * 1.15);
  const bowL = new THREE.Mesh(bowGeo, rib);
  const bowR = new THREE.Mesh(bowGeo, rib);
  bowL.rotation.set(0.35, 0.15, 0.7);
  bowR.rotation.set(0.35, -0.15, -0.7);
  bowL.position.set(-w * 0.08, h * 0.52, 0);
  bowR.position.set(w * 0.08, h * 0.52, 0);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(Math.min(w, d) * 0.055, 10, 10), rib);
  knot.position.y = h * 0.5;
  group.add(box, bandA, bandB, bowL, bowR, knot);
  return group;
}

function buildGifts() {
  const gifts = [
    { x: -1.22, z: 0.7, ry: 0.4, w: 0.58, h: 0.4, d: 0.46, paper: '#7c2f3a', ribbon: '#e3c27a' },
    { x: -0.58, z: 1.16, ry: -0.45, w: 0.4, h: 0.28, d: 0.36, paper: '#efe2d0', ribbon: '#7a2430' },
    { x: -1.42, z: -0.22, ry: 0.2, w: 0.48, h: 0.34, d: 0.34, paper: '#234233', ribbon: '#f0e2c8' },
    { x: 0.78, z: 0.92, ry: 0.75, w: 0.36, h: 0.24, d: 0.36, paper: '#c4a574', ribbon: '#6e2430' },
    { x: 0.2, z: -0.92, ry: 1.05, w: 0.42, h: 0.3, d: 0.32, paper: '#8d3a32', ribbon: '#e7d7a8' },
  ];
  for (const gift of gifts) {
    const mesh = makeGift(gift.w, gift.h, gift.d, gift.paper, gift.ribbon);
    mesh.position.set(gift.x, gift.h / 2 + 0.04, gift.z);
    mesh.rotation.y = gift.ry;
    scene.add(mesh);
  }
}

function buildStillLife() {
  const mug = new THREE.Group();
  const ceramic = new THREE.MeshStandardMaterial({ color: '#f4efe6', roughness: 0.48, metalness: 0.02 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.082, 0.2, 24), ceramic);
  body.position.y = 0.1;
  body.castShadow = true;
  const cocoa = new THREE.Mesh(
    new THREE.CircleGeometry(0.078, 20),
    new THREE.MeshStandardMaterial({ color: '#3a2418', roughness: 0.4 }),
  );
  cocoa.rotation.x = -Math.PI / 2;
  cocoa.position.y = 0.19;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.01, 8, 24), ceramic);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.2;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 8, 18), ceramic);
  handle.position.set(0.1, 0.1, 0);
  handle.rotation.z = Math.PI / 2;
  const marshmallow = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 12, 12),
    new THREE.MeshStandardMaterial({ color: '#fff8f3', roughness: 0.7 }),
  );
  marshmallow.scale.y = 0.72;
  marshmallow.position.set(0.02, 0.2, 0.015);
  mug.add(body, cocoa, rim, handle, marshmallow);
  mug.position.set(1.28, 0.04, 2.55);
  mug.rotation.y = -0.7;
  mug.scale.setScalar(1.5);
  scene.add(mug);

  const steamCount = 18;
  const steamGeo = new THREE.BufferGeometry();
  const steamPos = new Float32Array(steamCount * 3);
  const steamSeed = new Float32Array(steamCount);
  for (let i = 0; i < steamCount; i += 1) {
    steamPos[i * 3] = (Math.random() - 0.5) * 0.05;
    steamPos[i * 3 + 1] = 0;
    steamPos[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
    steamSeed[i] = Math.random();
  }
  steamGeo.setAttribute('position', new THREE.BufferAttribute(steamPos, 3));
  steamGeo.setAttribute('aSeed', new THREE.BufferAttribute(steamSeed, 1));
  steamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float aSeed;
      varying float vA;
      uniform float uTime;
      void main() {
        float cycle = fract(uTime * 0.16 + aSeed);
        vec3 p = position;
        p.y += cycle * 0.42;
        p.x += sin(uTime * 0.7 + aSeed * 18.0) * 0.025;
        vA = smoothstep(0.0, 0.18, cycle) * (1.0 - smoothstep(0.55, 1.0, cycle));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (70.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying float vA;
      void main() {
        float a = smoothstep(0.5, 0.08, length(gl_PointCoord - 0.5)) * vA * 0.45;
        gl_FragColor = vec4(vec3(0.96, 0.93, 0.88) * a, a);
      }
    `,
  });
  steamMat.premultipliedAlpha = true;
  const steam = new THREE.Points(steamGeo, steamMat);
  steam.position.set(1.28, 0.4, 2.55);
  scene.add(steam);

  const candle = new THREE.Group();
  const wax = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.052, 0.22, 16),
    new THREE.MeshStandardMaterial({
      color: '#f6efe2',
      roughness: 0.55,
      emissive: '#6a4528',
      emissiveIntensity: 0.22,
    }),
  );
  wax.position.y = 0.11;
  wax.castShadow = true;
  candle.add(wax);
  candle.position.set(0.72, 0.04, 2.85);
  candle.scale.setScalar(1.35);
  scene.add(candle);
  addFlame(candle, 0, 0.28, 0, 0.14, 0.22, false);

  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.22, 0.025, 24),
    new THREE.MeshStandardMaterial({ color: '#f3eee6', roughness: 0.42 }),
  );
  plate.position.set(2.08, 0.055, 1.62);
  plate.receiveShadow = true;
  scene.add(plate);
  const sliceMat = new THREE.MeshStandardMaterial({
    map: orangeMap,
    roughness: 0.55,
    emissive: '#5a2a10',
    emissiveIntensity: 0.12,
  });
  for (let i = 0; i < 3; i += 1) {
    const slice = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 20), sliceMat);
    slice.position.set(2.02 + i * 0.045, 0.08, 1.58 + (i - 1) * 0.03);
    slice.rotation.z = -0.4 + i * 0.35;
    slice.rotation.x = 0.4;
    scene.add(slice);
  }
  const stickMat = new THREE.MeshStandardMaterial({ color: '#6d4030', roughness: 0.8 });
  for (let i = 0; i < 2; i += 1) {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6), stickMat);
    stick.position.set(1.92 + i * 0.04, 0.09, 1.74);
    stick.rotation.z = Math.PI / 2.3;
    stick.rotation.y = 0.4 + i;
    scene.add(stick);
  }
}

function buildSnow() {
  const far = makeSnow(mobile ? 420 : 780, 0.045, 0.72, 8.2, 8.5, 7);
  const near = makeSnow(mobile ? 36 : 64, 0.15, 0.28, 6.2, 3.2, 3.4);
  snowSystems.push(far, near);
  scene.add(far.points, near.points);
}

function makeSnow(count, size, opacity, height, spread, depth) {
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    arr[i * 3] = (Math.random() - 0.5) * spread * 2;
    arr[i * 3 + 1] = Math.random() * height;
    arr[i * 3 + 2] = (Math.random() - 0.5) * depth * 2 + (depth < 5 ? 4.2 : 0);
    speeds[i] = 0.18 + Math.random() * 0.45;
    phase[i] = Math.random() * Math.PI * 2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.PointsMaterial({
    color: '#f4f7fb',
    size,
    map: snowMap,
    transparent: true,
    depthWrite: false,
    opacity,
    sizeAttenuation: true,
  });
  return {
    points: new THREE.Points(geo, mat),
    geo,
    mat,
    speeds,
    phase,
    count,
    height,
    spread,
    baseOpacity: opacity,
  };
}

function setupLights() {
  scene.add(new THREE.HemisphereLight('#c5d2ea', '#4a2e22', LOOK.hemi));
  moon = new THREE.DirectionalLight('#d5e0f4', LOOK.moon);
  moon.position.set(-7, 8, 5);
  scene.add(moon);
  keyLight = new THREE.DirectionalLight('#ffd0a4', 0);
  keyLight.position.set(3.2, 8.2, 7.4);
  keyLight.target.position.set(0, 2.2, 0);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 2;
  keyLight.shadow.camera.far = 26;
  keyLight.shadow.camera.left = -7;
  keyLight.shadow.camera.right = 7;
  keyLight.shadow.camera.top = 7;
  keyLight.shadow.camera.bottom = -7;
  keyLight.shadow.bias = -0.00045;
  keyLight.shadow.normalBias = 0.03;
  scene.add(keyLight, keyLight.target);
}

function findOrnament(object) {
  let current = object;
  while (current) {
    if (current.userData && current.userData.line) return current;
    current = current.parent;
  }
  return null;
}

function showNote(line) {
  noteText.textContent = `「${line}」`;
  noteEl.classList.add('show');
  noteEl.setAttribute('aria-hidden', 'false');
  clearTimeout(noteTimer);
  noteTimer = setTimeout(hideNote, 5600);
}

function hideNote() {
  noteEl.classList.remove('show');
  noteEl.setAttribute('aria-hidden', 'true');
}

function tweenTo(to, dur, next) {
  tween.from = state.ignite;
  tween.to = to;
  tween.start = performance.now();
  tween.dur = Math.max(1, dur);
  tween.next = next || null;
}

function beginLighting() {
  seal.querySelector('.seal-kicker').textContent = '亮起来了';
  seal.disabled = true;
  tweenTo(1, reduceMotion ? 1200 : 5600);
}

function replay() {
  state.starChimed = false;
  tweenTo(0, reduceMotion ? 400 : 800, { to: 1, dur: reduceMotion ? 1200 : 5400 });
}

function updateIgnite(now) {
  state.prevIgnite = state.ignite;
  const t = Math.min(1, (now - tween.start) / tween.dur);
  const eased = t * t * (3 - 2 * t);
  state.ignite = tween.from + (tween.to - tween.from) * eased;
  if (t >= 1 && tween.next) {
    const next = tween.next;
    tween.next = null;
    tweenTo(next.to, next.dur, next.next || null);
  }
  if (state.ignite > 0.45) document.body.classList.add('is-lit');
}

function updateLights(dt, time) {
  const k = state.ignite;
  state.fireMix = THREE.MathUtils.damp(state.fireMix, state.fire ? 0.36 + k * 0.64 : 0, 2.4, dt);
  state.snow = THREE.MathUtils.damp(state.snow, state.snowTarget, 2.4, dt);
  renderer.toneMappingExposure = LOOK.exposure0 + k * LOOK.exposure1;
  bloom.strength = LOOK.bloom0 + k * LOOK.bloom1;
  moon.intensity = LOOK.moon * (1 - k * 0.58);
  moonSpill.intensity = LOOK.moonSpill * (1 - k * 0.45);
  keyLight.intensity = LOOK.key * k;
  if (fillLight) fillLight.intensity = 12 * k;
  heart.intensity = LOOK.heart * k * (0.86 + Math.sin(time * 1.6) * 0.08);
  fireLight.intensity = LOOK.fire * state.fireMix * (0.86 + Math.sin(time * 6.5) * 0.07 + Math.sin(time * 14) * 0.04);
  if (fireMat) fireMat.color.setScalar(0.2 + state.fireMix * 0.95);
  if (aoMat) aoMat.opacity = 0.2 + k * 0.16;
  if (scene.environment) {
    scene.environmentIntensity = (0.07 + k * 0.18) * (0.4 + state.fireMix);
  }

  const starOn = THREE.MathUtils.smoothstep(k, 0.84, 1);
  starLight.intensity = LOOK.star * starOn * (0.9 + Math.sin(time * 2.2) * 0.08);
  starMat.emissiveIntensity = starOn * 1.2;
  starGlow.material.opacity = starOn * 0.82;
  starGlow.userData.punch = THREE.MathUtils.damp(starGlow.userData.punch || 0, 0, 2.4, dt);
  if (state.prevIgnite < 0.9 && k >= 0.9) starGlow.userData.punch = 0.9;
  const glowScale = LOOK.starGlow * (1 + starGlow.userData.punch);
  starGlow.scale.set(glowScale, glowScale, 1);
  star.rotation.y = Math.atan2(camera.position.x, camera.position.z);

  if (!state.starChimed && state.prevIgnite < 0.93 && k >= 0.93) {
    state.starChimed = true;
    playChord([N.C5, N.E5, N.G4 * 2, N.C5 * 2]);
  }
  if (k < 0.12) state.starChimed = false;

  for (const bulb of bulbs) {
    const on = THREE.MathUtils.smoothstep(k * 1.16 - 0.03, bulb.heightT, bulb.heightT + 0.12);
    const flick = 1 - bulb.amp * (0.5 - 0.5 * Math.sin(time * bulb.speed + bulb.phase));
    const lit = on * flick;
    bulb.mat.emissiveIntensity = lit * 3.2;
    bulb.mat.color.setRGB(0.1 + lit * 0.9, 0.07 + lit * 0.58, 0.04 + lit * 0.28);
    bulb.glowMat.opacity = lit * 0.78;
    const s = bulb.base * (0.55 + lit * 0.7);
    bulb.glow.scale.set(s, s, 1);
  }

  for (const item of innerLights) {
    const on = THREE.MathUtils.smoothstep(k * 1.16 - 0.03, item.heightT, item.heightT + 0.16);
    const flick = 0.84 + 0.16 * Math.sin(time * item.speed + item.phase);
    item.light.intensity = LOOK.bulbLight * on * flick;
  }
}

function updateSnow(dt, time) {
  for (const sys of snowSystems) {
    const arr = sys.geo.attributes.position.array;
    for (let i = 0; i < sys.count; i += 1) {
      arr[i * 3 + 1] -= sys.speeds[i] * dt;
      arr[i * 3] += Math.sin(time * 0.35 + sys.phase[i]) * dt * 0.18;
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = sys.height;
      if (arr[i * 3] > sys.spread) arr[i * 3] = -sys.spread;
      if (arr[i * 3] < -sys.spread) arr[i * 3] = sys.spread;
    }
    sys.geo.attributes.position.needsUpdate = true;
    sys.mat.opacity = sys.baseOpacity * state.snow;
  }
}

function updateEmbers(dt) {
  if (!emberPoints) return;
  const arr = emberPoints.geometry.attributes.position.array;
  for (let i = 0; i < emberSpeeds.length; i += 1) {
    arr[i * 3 + 1] += emberSpeeds[i] * dt;
    arr[i * 3] += Math.sin(arr[i * 3 + 1] * 6 + i) * dt * 0.05;
    if (arr[i * 3 + 1] > 1.55) {
      arr[i * 3 + 1] = 0.28;
      arr[i * 3] = (Math.random() - 0.5) * 0.7;
    }
  }
  emberPoints.geometry.attributes.position.needsUpdate = true;
  emberPoints.material.opacity = state.fireMix * 0.85;
}

function updateFlames(time) {
  for (const flame of flames) {
    const wobble = 0.9 + Math.sin(time * flame.sp + flame.ph) * 0.12;
    const rise = 0.88 + Math.sin(time * flame.sp * 1.3 + flame.ph) * 0.14;
    flame.sprite.scale.set(flame.w * wobble, flame.h * rise, 1);
    const strength = flame.hearth ? state.fireMix : 0.9;
    flame.sprite.material.opacity = (0.7 + Math.sin(time * 10 + flame.ph) * 0.2) * strength;
  }
}

function updateOrnaments(dt) {
  for (const child of ornamentRoot.children) {
    if (!child.userData.baseScale) continue;
    if (child.userData.pulse > 0) {
      child.userData.pulse = Math.max(0, child.userData.pulse - dt * 0.85);
    }
    const k = child.userData.pulse;
    const s = 1 + Math.sin(k * Math.PI) * 0.14;
    child.scale.copy(child.userData.baseScale).multiplyScalar(s);
    if (child.material && child.material.emissive) {
      const base = child.userData.baseEmissive ?? 0;
      child.material.emissiveIntensity = base + k * 0.7;
    }
  }
}

function ensureAudio() {
  if (audio) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1680;
  filter.Q.value = 0.35;
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.28;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.22;
  filter.connect(master);
  filter.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(master);
  master.connect(ctx.destination);
  audio = { ctx, master, filter, playing: false, index: 0, next: 0, beat: 0.52 };
}

function playNote(freq, time, dur) {
  const osc = audio.ctx.createOscillator();
  const overtone = audio.ctx.createOscillator();
  const gain = audio.ctx.createGain();
  const overtoneGain = audio.ctx.createGain();
  osc.type = 'sine';
  overtone.type = 'triangle';
  osc.frequency.value = freq;
  overtone.frequency.value = freq * 2.004;
  overtoneGain.gain.value = 0.16;
  osc.connect(gain);
  overtone.connect(overtoneGain);
  overtoneGain.connect(gain);
  gain.connect(audio.filter);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.22, time + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.start(time);
  overtone.start(time);
  osc.stop(time + dur + 0.03);
  overtone.stop(time + dur + 0.03);
}

function playChord(freqs) {
  if (!audio || !audio.playing) return;
  const start = audio.ctx.currentTime + 0.03;
  freqs.forEach((freq, index) => playNote(freq, start + index * 0.07, 1.35));
}

function scheduleMusic() {
  if (!audio || !audio.playing) return;
  const now = audio.ctx.currentTime;
  if (audio.next < now - 0.2) audio.next = now + 0.05;
  while (audio.next < now + 0.28) {
    const step = MELODY[audio.index];
    if (step[0] > 0) playNote(step[0], audio.next, Math.max(0.22, step[1] * audio.beat * 1.2));
    audio.next += step[1] * audio.beat;
    audio.index = (audio.index + 1) % MELODY.length;
  }
}

function resize() {
  const w = window.innerWidth;
  const h = Math.max(1, window.innerHeight);
  const pr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.6);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pr);
  composer.setSize(w, h);
  fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
}

function animate() {
  const dt = Math.min(0.05, clock.getDelta());
  const time = clock.elapsedTime;
  updateIgnite(performance.now());
  updateLights(dt, time);
  updateSnow(dt, time);
  updateEmbers(dt);
  updateFlames(time);
  updateOrnaments(dt);
  if (steamMat) steamMat.uniforms.uTime.value = time;
  paintAcc += dt;
  if (paintAcc > 0.05) {
    paintAcc = 0;
    windowPainter.update(time);
    firePainter.update(time);
  }
  if (!controls.autoRotate && !reduceMotion) {
    idle += dt;
    if (idle > 4.5) controls.autoRotate = true;
  }
  controls.update();
  scheduleMusic();
  composer.render();
  requestAnimationFrame(animate);
}

function bindUi() {
  seal.addEventListener('click', () => {
    if (state.started) return;
    if (!ready) {
      queued = true;
      return;
    }
    state.started = true;
    beginLighting();
  });

  document.getElementById('btn-snow').addEventListener('click', (event) => {
    const next = event.currentTarget.getAttribute('aria-pressed') !== 'true';
    event.currentTarget.setAttribute('aria-pressed', String(next));
    state.snowTarget = next ? 1 : 0;
  });

  document.getElementById('btn-fire').addEventListener('click', (event) => {
    const next = event.currentTarget.getAttribute('aria-pressed') !== 'true';
    event.currentTarget.setAttribute('aria-pressed', String(next));
    state.fire = next;
  });

  document.getElementById('btn-sound').addEventListener('click', async (event) => {
    ensureAudio();
    if (audio.ctx.state === 'suspended') await audio.ctx.resume();
    audio.playing = !audio.playing;
    event.currentTarget.setAttribute('aria-pressed', String(audio.playing));
    const now = audio.ctx.currentTime;
    audio.master.gain.cancelScheduledValues(now);
    audio.master.gain.setTargetAtTime(audio.playing ? 0.16 : 0.0001, now, audio.playing ? 0.05 : 0.08);
    if (audio.playing) audio.next = now + 0.06;
  });

  document.getElementById('btn-again').addEventListener('click', replay);

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (event.target && event.target.closest && event.target.closest('button')) return;
    if ((event.code === 'Enter' || event.code === 'Space') && ready && !state.started) {
      event.preventDefault();
      state.started = true;
      beginLighting();
    }
    if (event.key === 'Escape') hideNote();
  });

  let down = null;
  canvas.addEventListener('pointerdown', (event) => {
    down = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!down) return;
    const dx = event.clientX - down.x;
    const dy = event.clientY - down.y;
    down = null;
    if (dx * dx + dy * dy > 25) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(ornamentRoot, true);
    if (!hits.length) return;
    const ornament = findOrnament(hits[0].object);
    if (!ornament) return;
    showNote(ornament.userData.line);
    ornament.userData.pulse = 1;
  });
}

async function loadEnvironment() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  try {
    const hdr = await new RGBELoader().loadAsync('./assets/fireplace.hdr');
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    scene.environmentIntensity = 0.12;
    scene.environmentRotation.y = 0.85;
    document.getElementById('colophon').hidden = false;
  } catch (error) {
    console.warn(error);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.25;
  }
  pmrem.dispose();
}

function fail(error) {
  console.error(error);
  document.body.classList.add('is-failed');
}

async function init() {
  installGrain();
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = LOOK.exposure0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x1a1412, 1);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1412);
  scene.fog = new THREE.Fog(0x1a1412, 18, 38);

  camera = new THREE.PerspectiveCamera(40, 1, 0.08, 80);
  camera.position.set(-2.6, 2.28, 10.7);

  snowMap = radialTexture([
    [0, 'rgba(255,255,255,1)'],
    [0.45, 'rgba(255,255,255,0.55)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  glowMap = radialTexture([
    [0, 'rgba(255,246,230,1)'],
    [0.22, 'rgba(255,214,160,0.8)'],
    [0.55, 'rgba(255,176,96,0.22)'],
    [1, 'rgba(255,160,80,0)'],
  ]);
  flameMap = makeFlame();
  orangeMap = makeOrange();

  setupLights();
  buildRoom();
  buildTree();
  buildGifts();
  buildStillLife();
  buildSnow();
  windowPainter.update(0);
  firePainter.update(0);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), LOOK.bloom0, LOOK.bloomRadius, LOOK.bloomThreshold);
  composer.addPass(bloom);
  fxaa = new ShaderPass(FXAAShader);
  composer.addPass(fxaa);
  composer.addPass(new OutputPass());

  controls = new OrbitControls(camera, canvas);
  controls.target.set(0.72, 2.12, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.22;
  controls.minPolarAngle = 1.18;
  controls.maxPolarAngle = 1.46;
  controls.minAzimuthAngle = -0.7;
  controls.maxAzimuthAngle = 0.48;
  controls.minDistance = 8.2;
  controls.maxDistance = 14.2;
  controls.zoomSpeed = 0.55;
  controls.rotateSpeed = 0.45;
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    idle = 0;
  });
  controls.addEventListener('end', () => {
    idle = 0;
  });
  controls.update();

  bindUi();
  resize();
  window.addEventListener('resize', resize);
  animate();
  await loadEnvironment();
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
  document.body.classList.add('is-ready');
  ready = true;
  if (queued && !state.started) {
    state.started = true;
    beginLighting();
  }
}

init().catch(fail);
