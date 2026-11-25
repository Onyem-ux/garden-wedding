import * as THREE from 'three';
import {Sky} from 'three/examples/jsm/objects/Sky.js';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ---------- settings (edit these) ---------- */
const ZE = 50;               // distance from start to the gazebo centre (metres)
const S_START = 1.2;         // where the walk begins
let finalS = ZE - 2.2;       // where the camera stops, in front of the invitation (set in resize)
const DUR = 42000;           // floating journey (~42 seconds)
const MUSIC_SRC = '/music.mp3'; // put your audio file in the public folder
const CAM_H = 1.62;          // eye height
const COARSE = matchMedia('(pointer:coarse)').matches;
const Q = COARSE ? 0.55 : 1; // density multiplier for phones/tablets
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const HOLD = 10;             // seconds the camera rests at each easel in the gazebo
const MOVE = 3.6;            // seconds it takes to glide from one easel to the next
const SKIP_RATE = 7;         // how fast "Skip" fast-forwards the walk (eases in and out)
// Invitation image: drop your invitation card image in the public folder as /invitation.jpg.
const INVITE_IMG = '/invitation.jpg';
// Gallery photos: drop your 20 images in the public folder as /gallery/1.jpg .. /gallery/20.jpg (the first one is shown on the easel).
// Any file that is missing falls back to a drawn placeholder photo.
const GALLERY = Array.from({length: 20}, (_, i) => `/gallery/${i + 1}.jpg`);
// The couple's story. The easel shows the opening; "Read Full Story" opens the full letter.
const STORY = [
  "It began on an ordinary October evening when the sky opened without warning, and two strangers found themselves sharing the narrow shelter of a doorway while the city washed clean around them. Reks had a crooked umbrella he could barely wrestle open; Praise had warm laughter that made the rain feel like a blessing rather than an interruption. What should have been a five-minute wait turned into an hour of easy conversation, and by the time the clouds broke, neither of them quite knew how to say goodbye.",
  "In the years that followed, love did not arrive all at once in grand gestures—it wove itself quietly into the fabric of everyday life. It lived in early-morning mugs of tea left beside sleepy hands, in late-night voice notes across busy weeks, in learning the rhythm of each other’s silences, and in discovering that home is never a place on a map, but the person who softens the edges of your hardest days.",
  "There were seasons that tested our patience and seasons that overflowed with joy, and through every single one we chose each other—sometimes effortlessly, sometimes deliberately, always faithfully. On a quiet golden afternoon beneath the mango tree in her grandmother’s garden, with the breeze carrying the scent of rain and blossoms, Reks knelt and asked a question our hearts had already been answering for years.",
  "Today, as we stand in this garden above the sea, we carry with us every prayer, every kindness, and every person who helped shape the lives we now join together. Thank you for walking alongside us, for loving us into who we are, and for witnessing the very first pages of our forever."
];

/* ---------- helpers ---------- */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const sm = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const R = rng(5), rr = (a, b) => a + (b - a) * R();
const hash = (a, b) => { const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h); };
const pick = a => a[Math.floor(R() * a.length)];
function pathX(s) { const k = 1 - sm((s - (ZE - 30)) / 20); return k * (3.2 * Math.sin(s * .13) + 1.3 * Math.sin(s * .31 + 1.3)); }
const dX = s => (pathX(s + .05) - pathX(s - .05)) / .1;
function lat(s, off) { const d = dX(s), n = Math.hypot(1, d); return [pathX(s) + off / n, -s + off * d / n]; }
const bad = (x, z) =>
  (Math.abs(x) < 3.4 && Math.abs(z + ZE) < 3.7) ||
  (Math.abs(x) < 6.4 && z < -(ZE - 14) && z > -(ZE - 4)) ||
  (x < -3.0 && x > -10.8 && z <= -(ZE - 7.5) && z >= -(ZE + 6.5));
function canvasTex(w, h, draw, rep, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ---------- renderer, sky, light ---------- */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({canvas, antialias: false, powerPreference: 'high-performance'});
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .58;
const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0xe6b184, .0115);
const camera = new THREE.PerspectiveCamera(50, 1, .1, 3000);
const sunDir = new THREE.Vector3(.28, .14, -.95).normalize();   // low evening sun, about 8 degrees above the sea
const sun = new THREE.DirectionalLight(0xff9650, 4.4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 170});
sun.shadow.bias = -.0004; sun.shadow.normalBias = .04; scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xe6b48e, 0x6a4a30, 1.15));
const sky = new Sky(); sky.scale.setScalar(2500); scene.add(sky);
const su = sky.material.uniforms; su.turbidity.value = 9; su.rayleigh.value = 3; su.mieCoefficient.value = .006; su.mieDirectionalG.value = .94; su.sunPosition.value.copy(sunDir);
const puff = canvasTex(256, 256, (c, w, h) => { for (let i = 0; i < 26; i++) { const x = rr(60, 196), y = rr(100, 156), r = rr(30, 60), g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); } }, [1, 1]);
for (let i = 0; i < 9; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: puff, fog: false, depthWrite: false, opacity: rr(.5, .85)})); sp.material.color.set(2.6, 1.55, 1.05); sp.position.set(rr(-900, 900), rr(180, 330), rr(-1000, -500)); sp.scale.set(rr(300, 520), rr(110, 200), 1); scene.add(sp); }

/* ---------- wind + material patching ---------- */
const U = {uTime: {value: 0}};
const skyNameUpdaters = [];
function patch(mat, mode) {
  mat.customProgramCacheKey = () => mode;
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime;
    let v = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;' + (mode === 'plant' ? '\nattribute float aKeep;' : ''));
    if (mode === 'plant') v = v.replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = mix(vColor.rgb, color.rgb, aKeep);');
    v = v.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec2 ip = instanceMatrix[3].xz; float ph = ip.x*.7 + ip.y*.5;
      float gust = .6 + .4*sin(uTime*.5 + ip.x*.1 + ip.y*.08);
      float w = (sin(uTime*1.7 + ph)*.6 + sin(uTime*2.9 + ph*1.7)*.25) * gust;
      ${mode === 'plant' ? 'float hh = max(position.y, 0.); transformed.x += w*hh*hh*.14; transformed.z += w*hh*hh*.07;' : 'transformed.x += w*.035; transformed.y += w*.012;'}`);
    sh.vertexShader = v;
  };
}
const dm = new THREE.Object3D();
function build(geo, mat, items, shadow = false) {
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => {
    dm.position.set(it.x, it.y || 0, it.z);
    if (it.q) dm.quaternion.copy(it.q); else dm.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
    const sx = it.sx ?? it.s, sy = it.sy ?? it.s; dm.scale.set(sx, sy, sx); dm.updateMatrix();
    m.setMatrixAt(i, dm.matrix); if (it.c) m.setColorAt(i, it.c);
  });
  m.instanceMatrix.needsUpdate = true; m.receiveShadow = true; m.castShadow = shadow; m.frustumCulled = false; scene.add(m); return m;
}

/* ---------- ground: a lawn on a mountain top that ends in a cliff above the sea ---------- */
const SEA_Y = -80;   // the ocean surface, far below the lawn
const edgeZ = x => -ZE - 9 + .0011 * x * x + 2.2 * Math.sin(x * .09) + 1.2 * Math.sin(x * .23 + 1);   // cliff edge (z) at any x: a headland that curves round toward us
const grassTex = canvasTex(512, 512, (c, w, h) => {
  c.fillStyle = '#5b8a3a'; c.fillRect(0, 0, w, h);
  const cols = ['#4a7a30', '#6a9a45', '#7aaa50', '#3f6b2b', '#88b35a', '#5f8f3a'];
  for (let i = 0; i < 26000; i++) { c.strokeStyle = pick(cols); c.globalAlpha = rr(.25, .6); c.lineWidth = rr(.8, 1.8); const x = rr(0, w), y = rr(0, h), a = rr(0, 6.28), l = rr(5, 13); c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
  c.globalAlpha = 1; for (let i = 0; i < 70; i++) { c.fillStyle = pick(['rgba(255,255,255,.85)', 'rgba(255,225,90,.8)']); c.beginPath(); c.arc(rr(0, w), rr(0, h), rr(.8, 1.6), 0, 7); c.fill(); }   // clover + dandelion flecks
}, [1, 1]);
grassTex.anisotropy = 16;
const rockTex = canvasTex(256, 256, (c, w, h) => {
  c.fillStyle = '#8c8070'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) { c.fillStyle = pick(['rgba(70,58,44,.28)', 'rgba(210,190,160,.22)', 'rgba(120,100,80,.25)']); c.fillRect(0, rr(0, h), w, rr(2, 12)); }
  for (let i = 0; i < 1400; i++) { c.fillStyle = pick(['rgba(40,30,20,.25)', 'rgba(255,240,210,.2)']); c.fillRect(rr(0, w), rr(0, h), rr(1, 3), rr(1, 3)); }
}, [1, 1]);
{
  const NX = 160, NZ = 44, ZF = 110, P = [], UV = [], C = [], I = [];
  for (let i = 0; i <= NX; i++) {
    const x = -200 + 400 * i / NX, ez = edgeZ(x);
    for (let j = 0; j <= NZ; j++) {
      const z = ez + (ZF - ez) * Math.pow(j / NZ, 1.8), t = clamp((z - ez) / 2.5), y = -(1 - t) * (1 - t) * .5;            // the lip rolls off gently
      const n = Math.sin(x * .07 + Math.sin(z * .05) * 2) * Math.cos(z * .06 + x * .02) * .5 + .5, v = .88 + n * .24, dry = 1 - sm((z - ez) / 7);   // patchy lawn, drier in the sea wind
      P.push(x, y, z); UV.push(x / 4.267, z / 4.267); C.push(v * (1 + .3 * dry), v * (1 + .08 * dry), v * (1 - .22 * dry));
      if (i < NX && j < NZ) { const a = i * (NZ + 1) + j; I.push(a, a + 1, a + NZ + 1, a + 1, a + NZ + 2, a + NZ + 1); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); g.computeVertexNormals();
  const lawn = new THREE.Mesh(g, new THREE.MeshStandardMaterial({map: grassTex, bumpMap: grassTex, bumpScale: 1.5, vertexColors: true, roughness: 1})); lawn.receiveShadow = true; scene.add(lawn);
  // the cliff face dropping to the sea
  const rows = [[0, -.5], [.8, -4], [3, -26], [9, -58], [18, SEA_Y - 12]], cP = [], cU = [], cI = [];
  for (let i = 0; i <= NX; i++) { const x = -200 + 400 * i / NX, ez = edgeZ(x); rows.forEach(([d, y]) => { cP.push(x, y, ez - d); cU.push(x / 6, -y / 6); }); if (i < NX) for (let j = 0; j < 4; j++) { const a = i * 5 + j; cI.push(a, a + 1, a + 5, a + 1, a + 6, a + 5); } }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cP, 3)); cg.setAttribute('uv', new THREE.Float32BufferAttribute(cU, 2)); cg.setIndex(cI); cg.computeVertexNormals();
  scene.add(new THREE.Mesh(cg, new THREE.MeshStandardMaterial({map: rockTex, color: 0xb0a490, roughness: 1, side: THREE.DoubleSide})));
  // boulders along the lip
  const rg = new THREE.IcosahedronGeometry(1, 1), pp = rg.attributes.position;
  for (let i = 0; i < pp.count; i++) { const k = 1 + .22 * Math.sin(pp.getX(i) * 5.1 + pp.getY(i) * 3.3) * Math.cos(pp.getZ(i) * 4.7); pp.setXYZ(i, pp.getX(i) * k, pp.getY(i) * k * .7, pp.getZ(i) * k); }
  rg.computeVertexNormals();
  const rocks = []; for (let i = 0; i < 80; i++) { const x = rr(-70, 70), sc = rr(.2, .75); rocks.push({x, y: -.15 + sc * .12, z: edgeZ(x) + rr(.2, 2.5), sx: sc * rr(.8, 1.6), sy: sc * rr(.6, 1), ry: rr(0, 6.28), c: new THREE.Color().setHSL(.09, rr(.05, .15), rr(.55, .8))}); }
  build(rg, new THREE.MeshStandardMaterial({map: rockTex, roughness: 1, flatShading: true}), rocks, true);
}

/* ---------- the ocean far below, distant headlands, sun glow, gulls ---------- */
const ocean = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, uniforms: {uTime: U.uTime, uSun: {value: sunDir}},
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `uniform float uTime; uniform vec3 uSun; varying vec3 vW;
    float hgt(vec2 p){ return sin(p.x*.9 + uTime*.8)*.5 + sin(p.y*1.3 - uTime*.6 + p.x*.4)*.35 + sin((p.x+p.y)*2.1 + uTime*1.3)*.2 + sin(p.x*3.7 - p.y*2.3 + uTime*1.9)*.1; }
    void main(){
      vec3 V = cameraPosition - vW; float dist = length(V); V /= dist;
      vec2 p = vW.xz * .045; float e = .02;
      vec2 sl = vec2(hgt(p + vec2(e, 0.)) - hgt(p - vec2(e, 0.)), hgt(p + vec2(0., e)) - hgt(p - vec2(0., e))) / (2. * e);
      vec3 N = normalize(vec3(-sl.x * .05, 1.0, -sl.y * .05));
      vec3 R = reflect(-V, N); R.y = abs(R.y);
      float fres = .04 + .96 * pow(1. - max(dot(N, V), 0.), 5.);
      float sunSide = pow(max(dot(normalize(R.xz + 1e-4), normalize(uSun.xz)), 0.), 3.);
      vec3 sky = mix(vec3(.42,.42,.60), vec3(1.0,.46,.18), sunSide * (1. - smoothstep(.0, .45, R.y)));
      sky = mix(sky, vec3(.16,.24,.50), smoothstep(.15, .7, R.y));
      vec3 deep = vec3(.02,.13,.26) + vec3(.0,.06,.05) * (hgt(p * .4) * .5 + .5);
      vec3 col = mix(deep, sky, clamp(fres * 1.6, 0., 1.));
      float sp = pow(max(dot(R, normalize(uSun)), 0.), 700.) * 4.5 + pow(max(dot(R, normalize(uSun)), 0.), 60.) * .5;
      col += vec3(1.0,.50,.18) * sp;
      col = mix(col, vec3(.95,.55,.30), smoothstep(400., 2200., dist) * .55);
      col = mix(col, vec3(.82,.48,.25), (1.0 - exp(-pow(.0115 * dist, 2.0))) * (1.0 - smoothstep(300., 900., dist)));   // mist near the plateau's far sides
      gl_FragColor = vec4(col, 1.0 - smoothstep(1700., 2800., dist)); }`
}));
ocean.position.set(0, SEA_Y, -ZE - 1400); ocean.renderOrder = 1; scene.add(ocean);
function ridge(cx, cz, w, hgt, seed, col) {
  const n = 60, P = [], A = [], I = [];
  for (let i = 0; i <= n; i++) { const t = i / n, hh = hgt * Math.pow(Math.sin(Math.PI * t), .9) * (.7 + .3 * Math.sin(t * 9 + seed) + .15 * Math.sin(t * 31 + seed * 2)), x = cx + (t - .5) * w; P.push(x, SEA_Y - 30, cz, x, SEA_Y + Math.max(hh, 1), cz); A.push(0, 1); if (i < n) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aA', new THREE.Float32BufferAttribute(A, 1)); g.setIndex(I);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: {uCol: {value: new THREE.Color(col)}},
    vertexShader: 'attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ gl_FragColor = vec4(uCol * (.9 + .25 * vA), smoothstep(.12, .45, vA) * .92); }'}));
  m.frustumCulled = false; m.renderOrder = 2; scene.add(m);
}
ridge(-950, -ZE - 2100, 1500, 150, 3, '#5d5873'); ridge(1250, -ZE - 2450, 1900, 220, 8, '#6c6580'); ridge(260, -ZE - 1750, 320, 42, 5, '#524f68');
const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({map: canvasTex(256, 256, (c, w, h) => { const g = c.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, 'rgba(255,176,96,1)'); g.addColorStop(.15, 'rgba(255,128,56,.5)'); g.addColorStop(.5, 'rgba(255,96,40,.1)'); g.addColorStop(1, 'rgba(255,96,40,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, [1, 1]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: .55}));
sunGlow.position.copy(sunDir).multiplyScalar(2200); sunGlow.scale.setScalar(1000); scene.add(sunGlow);
const SV = new THREE.Vector3(), SD = new THREE.Vector3();
const gulls = Array.from({length: 6}, (_, i) => {
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({color: 0x4a463f, side: THREE.DoubleSide, fog: false}), wing = s => { const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, .1, 0, 0, -.1, s * .6, 0, -.03], 3)); return new THREE.Mesh(wg, m); };
  const a = wing(1), b = wing(-1); g.add(a, b); g.userData = {a, b, i, cx: rr(-30, 30), cz: -ZE - rr(22, 70), y: rr(8, 30), r: rr(9, 24), sp: rr(.12, .22) * (i % 2 ? 1 : -1)}; scene.add(g); return g;
});
function updateGulls(t) {
  for (const g of gulls) { const d = g.userData, a = t * d.sp + d.i * 1.3, vx = -Math.sin(a) * Math.sign(d.sp), vz = Math.cos(a) * Math.sign(d.sp);
    g.position.set(d.cx + Math.cos(a) * d.r, d.y + Math.sin(t * .7 + d.i) * 1.2, d.cz + Math.sin(a) * d.r); g.rotation.y = Math.atan2(vx, vz);
    const f = Math.sin(t * (5 + d.i * .4) + d.i) * (Math.sin(t * .25 + d.i * 2) > .35 ? .08 : .5); d.a.rotation.z = f; d.b.rotation.z = -f; }
}

/* ---------- hyper-real patio: individually laid, bevelled pavers with PBR stone maps ---------- */
function vnoise(w, h, cell, seed) {            // smooth value noise, 0..1
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2, r = rng(seed), g = new Float32Array(gw * gh), out = new Float32Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = r();
  for (let y = 0; y < h; y++) { const fy = y / cell, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < w; x++) { const fx = x / cell, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), i = y0 * gw + x0;
      out[y * w + x] = (g[i] * (1 - sx) + g[i + 1] * sx) * (1 - sy) + (g[i + gw] * (1 - sx) + g[i + gw + 1] * sx) * sy; } }
  return out;
}
function fbm(w, h, seed, cells, wts) { const out = new Float32Array(w * h); cells.forEach((c, k) => { const n = vnoise(w, h, c, seed * 13 + k * 101 + 5); for (let i = 0; i < out.length; i++) out[i] += n[i] * wts[k]; }); return out; }
const mkTex = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); t.anisotropy = 16; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };

/* one stone face: albedo + normal + roughness, built from layered noise, strata, mineral flecks and pitting */
function stoneSet(seed, base) {
  const w = 768, h = 384, N = w * h, k = w / 512, r = rng(seed * 7 + 1);
  const low = fbm(w, h, seed, [110 * k, 44 * k], [.6, .4]), mid = fbm(w, h, seed + 1, [15 * k, 6 * k], [.55, .45]), fine = fbm(w, h, seed + 2, [2.4 * k, 1.2 * k], [.6, .4]), st = fbm(w, h, seed + 3, [170 * k], [1]);
  const pit = new Float32Array(N), fl = new Float32Array(N);
  for (let n = 0; n < 900; n++) { const px = r() * w, py = r() * h, pr = (1 + r() * r() * 5) * k, x0 = Math.max(0, Math.floor(px - pr)), x1 = Math.min(w - 1, Math.ceil(px + pr)), y0 = Math.max(0, Math.floor(py - pr)), y1 = Math.min(h - 1, Math.ceil(py + pr));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const d = Math.hypot(x - px, y - py) / pr; if (d < 1) pit[y * w + x] = Math.max(pit[y * w + x], Math.pow(1 - d, .7)); } }
  for (let n = 0; n < 1500; n++) fl[Math.floor(r() * N)] = r() < .5 ? -1 : 1;
  const A = new ImageData(w, h), Nm = new ImageData(w, h), Rg = new ImageData(w, h), H = new Float32Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = i * 4, ed = sm(Math.min(x, y, w - 1 - x, h - 1 - y) / (9 * k));
    let v = .8 + (low[i] - .5) * .36 + (mid[i] - .5) * .22 + (fine[i] - .5) * .24;
    v *= 1 - .5 * pit[i]; v *= .93 + .07 * Math.sin((y / h * 7 + st[i] * 6) * 3.1416); v *= .8 + .2 * ed; v *= 1 + fl[i] * .22;
    const warm = (low[i] - .5) * .1;
    A.data[o] = base[0] * v * (1 + warm); A.data[o + 1] = base[1] * v; A.data[o + 2] = base[2] * v * (1 - warm * 1.4); A.data[o + 3] = 255;
    H[i] = fine[i] * .55 + mid[i] * .3 + low[i] * .15 - pit[i] * .9 - (1 - ed) * .25;
    const rv = clamp(.78 + (fine[i] - .5) * .25 + pit[i] * .15 - (low[i] - .5) * .1, .55, .98) * 255;
    Rg.data[o] = Rg.data[o + 1] = Rg.data[o + 2] = rv; Rg.data[o + 3] = 255;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, xl = H[y * w + Math.max(0, x - 1)], xr = H[y * w + Math.min(w - 1, x + 1)], yu = H[Math.max(0, y - 1) * w + x], yd = H[Math.min(h - 1, y + 1) * w + x];
    const nx = -(xr - xl) * 3, ny = (yd - yu) * 3, l = Math.hypot(nx, ny, 1);
    Nm.data[o] = (nx / l * .5 + .5) * 255; Nm.data[o + 1] = (ny / l * .5 + .5) * 255; Nm.data[o + 2] = (1 / l * .5 + .5) * 255; Nm.data[o + 3] = 255;
  }
  const mk = d => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').putImageData(d, 0, 0); return cv; };
  return {a: mk(A), n: mk(Nm), r: mk(Rg)};
}
const stoneMats = [[198, 184, 158], [184, 176, 162], [201, 172, 140]].map((b, i) => { const S = stoneSet(40 + i * 17, b); return new THREE.MeshStandardMaterial({map: mkTex(S.a, true), normalMap: mkTex(S.n), normalScale: new THREE.Vector2(1, 1), roughnessMap: mkTex(S.r), roughness: 1, metalness: 0}); });

/* sand / joint bed with moss flecks (this is what shows in the gaps between pavers) */
const bedTex = (() => {
  const w = 512, h = 512, n = fbm(w, h, 901, [60, 18, 5, 1.6], [.3, .3, .25, .15]), id = new ImageData(w, h), cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  for (let i = 0; i < w * h; i++) { const v = .5 + n[i] * .7, o = i * 4; id.data[o] = 150 * v; id.data[o + 1] = 134 * v; id.data[o + 2] = 108 * v; id.data[o + 3] = 255; }
  const c = cv.getContext('2d'), r = rng(77); c.putImageData(id, 0, 0);
  for (let i = 0; i < 520; i++) { c.fillStyle = `rgba(${55 + r() * 30 | 0},${85 + r() * 40 | 0},${35 + r() * 20 | 0},${.2 + r() * .4})`; c.beginPath(); c.arc(r() * w, r() * h, .8 + r() * 2.2, 0, 7); c.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.anisotropy = 16; return t;
})();

/* lay rows by arc length so spacing stays even on the curves */
const AL = [0]; for (let s = .02; s <= ZE + 1; s += .02) AL.push(AL[AL.length - 1] + Math.hypot(1, dX(s - .01)) * .02);
const sAt = L => { let lo = 0, hi = AL.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (AL[m] <= L) lo = m; else hi = m; } return (lo + (L - AL[lo]) / (AL[hi] - AL[lo])) * .02; };
const PITCH = .3, ROWS = (() => { let n = 0; while (sAt((n + 1) * PITCH) <= ZE - 3) n++; return n; })();
{
  const gFull = new RoundedBoxGeometry(.613, .04, .288, 2, .005), gHalf = new RoundedBoxGeometry(.3005, .04, .288, 2, .005);
  const uv = gHalf.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * .5);
  const pr = rng(2024), pj = (a, b) => a + (b - a) * pr(), bins = stoneMats.map(() => ({f: [], h: []}));
  for (let i = 0; i < ROWS; i++) {
    const L0 = i * PITCH, sA = sAt(L0), sB = sAt(L0 + PITCH), cells = i % 2 ? [-1.09375, -.625, 0, .625, 1.09375] : [-.9375, -.3125, .3125, .9375];
    cells.forEach((off, j) => {
      const half = i % 2 && (j === 0 || j === 4), [ax, az] = lat(sA, off), [bx, bz] = lat(sB, off), len = Math.hypot(bx - ax, bz - az), kk = pj(.84, 1), c = new THREE.Color(kk * pj(.97, 1.03), kk, kk * pj(.95, 1.04));
      bins[Math.floor(pr() * 3)][half ? 'h' : 'f'].push({x: (ax + bx) / 2, y: .01 + pj(0, .0025), z: (az + bz) / 2, ry: Math.atan2(bx - ax, bz - az) + pj(-.01, .01) + (pr() < .5 ? Math.PI : 0), sz: (len - .012) / .288, c});
    });
  }
  const put = (geo, mat, items) => {
    if (!items.length) return; const m = new THREE.InstancedMesh(geo, mat, items.length), o = new THREE.Object3D();
    items.forEach((it, i) => { o.position.set(it.x, it.y, it.z); o.rotation.set(0, it.ry, 0); o.scale.set(1, 1, it.sz); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, it.c); });
    m.instanceMatrix.needsUpdate = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m);
  };
  bins.forEach((b, v) => { put(gFull, stoneMats[v], b.f); put(gHalf, stoneMats[v], b.h); });

  // sand bed under the pavers + soil edging along both sides
  const N = Math.floor((ZE - 3) / .5), ribbon = (o1, o2, y, mat, u1, u2) => {
    const P = [], U = [], I = [];
    for (let i = 0; i <= N; i++) { const s = i * .5, [x1, z1] = lat(s, o1), [x2, z2] = lat(s, o2); P.push(x1, y, z1, x2, y, z2); U.push(u1, s / 2.5, u2, s / 2.5); if (i < N) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m);
  };
  ribbon(-1.25, 1.25, .004, new THREE.MeshStandardMaterial({map: bedTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}), 0, 1);
  const soil = new THREE.MeshStandardMaterial({map: bedTex, color: 0x7a6650, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3});
  ribbon(-1.46, -1.25, .016, soil, 0, .1); ribbon(1.25, 1.46, .016, soil, 0, .1);

  // fallen petals and leaves resting on the stone
  const petalTex = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(32, 32, 28, 15, 0, 0, 7); c.fill(); c.strokeStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.moveTo(6, 32); c.lineTo(58, 32); c.stroke(); }, [1, 1]);
  const pg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), petals = [];
  for (let i = 0; i < 150 * Q; i++) { const [x, z] = lat(sAt(pj(0, AL[Math.round((ZE - 3.5) / .02)])), pj(-1.2, 1.2)), t = pr(); petals.push({x, y: .0345 + pj(0, .004), z, s: pj(.035, .065), ry: pj(0, 6.28), rx: pj(-.1, .1), rz: pj(-.1, .1), c: new THREE.Color(t < .45 ? '#f4a6c0' : t < .65 ? '#fff4f0' : t < .85 ? '#c9a56a' : '#7f9a4a')}); }
  build(pg, new THREE.MeshStandardMaterial({map: petalTex, alphaTest: .5, side: THREE.DoubleSide, roughness: .7}), petals);
}

/* ---------- plants ---------- */
function blade(w, l, curl, sw = 2, sl = 4) {
  const pos = [], idx = [];
  for (let i = 0; i <= sl; i++) {
    const v = i / sl, a = curl * v, wd = w * Math.pow(Math.sin(Math.PI * (.15 + .85 * v)), .55), cy = l * v * Math.cos(a * .5), cz = l * v * Math.sin(a * .5);
    for (let j = 0; j <= sw; j++) { const u = j / sw - .5; pos.push(u * wd, cy, cz + u * u * wd * 1.4); }
  }
  for (let i = 0; i < sl; i++) for (let j = 0; j < sw; j++) { const a = i * (sw + 1) + j, b = a + 1, c = a + sw + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function paint(g, c0, c1, keep) {
  const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3), kp = new Float32Array(n).fill(keep ? 1 : 0);
  g.computeBoundingBox(); const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y, a = new THREE.Color(c0), b = new THREE.Color(c1), t = new THREE.Color();
  for (let i = 0; i < n; i++) { t.lerpColors(a, b, (p.getY(i) - y0) / Math.max(1e-4, y1 - y0)); col[i * 3] = t.r; col[i * 3 + 1] = t.g; col[i * 3 + 2] = t.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aKeep', new THREE.BufferAttribute(kp, 1)); return g;
}
function flowerGeo(kind) {
  const P = [];
  const st = new THREE.CylinderGeometry(.007, .012, 1, 5, 4); st.deleteAttribute('uv'); st.translate(0, .5, 0); P.push(paint(st, '#3d6a2d', '#5f9a3f', 1));
  const lf = (ang, y, sz) => { const g = paint(blade(.07 * sz, .3 * sz, .7), '#386a2a', '#6aa545', 1); g.rotateX(.9); g.rotateY(ang); g.translate(0, y, 0); P.push(g); };
  lf(0, .12, 1); lf(2.6, .2, .85); if (kind !== 'spike') lf(4.4, .08, .9);
  const head = (n, w, l, tilt, curl, y, c0, c1, jit = .2, r0 = 0) => { for (let k = 0; k < n; k++) { const g = paint(blade(w, l, curl), c0, c1, 0); g.translate(0, 0, r0); g.rotateX(tilt + (R() - .5) * jit); g.rotateY(k * 6.2832 / n + (R() - .5) * .2); g.translate(0, y, 0); P.push(g); } };
  const disc = (r, y, c0, c1) => { const g = new THREE.CylinderGeometry(r, r * 1.05, .035, 12); g.deleteAttribute('uv'); g.translate(0, y, 0); P.push(paint(g, c0, c1, 1)); };
  if (kind === 'daisy') { head(12, .06, .17, 1.3, .6, 1, '#fff2a0', '#ffffff'); disc(.045, 1.012, '#c88a10', '#e8b020'); }
  else if (kind === 'sun') { head(20, .05, .2, 1.2, .5, 1, '#ffb300', '#ffe066'); disc(.11, 1.01, '#2e1b0c', '#4a2f17'); }
  else if (kind === 'rose') { head(5, .06, .12, .15, 1.2, .98, '#b0b0b0', '#ffffff'); head(6, .075, .14, .5, .9, .97, '#c0c0c0', '#ffffff'); head(8, .09, .16, .95, .7, .96, '#d0d0d0', '#ffffff'); }
  else if (kind === 'tulip') { head(6, .085, .2, .28, -.5, .88, '#cfcfcf', '#ffffff', .1, .01); head(3, .06, .17, .1, -.2, .88, '#bbbbbb', '#ffffff', .1); }
  else for (let i = 0; i < 26; i++) { const t = i / 25, y = .6 + .4 * t, sz = 1 - .55 * t; for (const a2 of [0, Math.PI]) { const g = paint(blade(.04 * sz, .075 * sz, .8, 2, 3), '#bbbbbb', '#ffffff', 0); g.rotateX(1); g.translate(0, 0, .012); g.rotateY(i * 2.4 + a2); g.translate(0, y, 0); P.push(g); } }
  return mergeGeometries(P);
}
const flowerMat = new THREE.MeshStandardMaterial({vertexColors: true, side: THREE.DoubleSide, roughness: .55}); patch(flowerMat, 'plant');
const KINDS = ['daisy', 'rose', 'tulip', 'spike', 'sun'];
const PAL = {daisy: ['#ffffff', '#fff3c4', '#ffd1e0'], rose: ['#f6a5c0', '#e8607a', '#ffc7a0', '#fff1f4', '#d8456a'], tulip: ['#e24a5f', '#ffd45a', '#ff9a5a', '#b27be0', '#f6a5c0'], spike: ['#8f6fdc', '#6d86ff', '#b49af0'], sun: ['#ffc928', '#ffb300']};
const HT = {daisy: [.35, .6], rose: [.4, .65], tulip: [.45, .7], spike: [.7, 1.2], sun: [1, 1.5]};
const lists = Object.fromEntries(KINDS.map(k => [k, []]));
const FL_END = ZE - 14;   // the flower beds finish at the last bend
for (let i = 0; i < 3300 * Q; i++) {
  const s = rr(1, FL_END + 5); if (R() > 1 - sm((s - FL_END) / 5)) continue;
  const [x, z] = lat(s, (1.7 + Math.pow(R(), 1.6) * 11) * (R() < .5 ? -1 : 1)); if (bad(x, z)) continue;
  const cell = hash(Math.floor(x / 2.4), Math.floor(z / 2.4)), kind = R() < .75 ? KINDS[Math.floor(cell * 5)] : pick(KINDS), pal = PAL[kind];
  const c = new THREE.Color(R() < .75 ? pal[Math.floor(hash(cell * 9.1, 3.3) * pal.length)] : pick(pal)); c.offsetHSL(rr(-.02, .02), rr(-.05, .05), rr(-.05, .05));
  lists[kind].push({x, z, s: rr(...HT[kind]), ry: rr(0, 6.28), rx: rr(-.1, .1), rz: rr(-.1, .1), c});
}
for (let i = 0; i < 700 * Q; i++) {   // wildflowers along the cliff edge, framing the sea
  const x = rr(-48, 48), z = edgeZ(x) + rr(.8, 7); if (bad(x, z)) continue;
  const kind = pick(['daisy', 'daisy', 'rose', 'tulip', 'spike']), pal = PAL[kind], c = new THREE.Color(pick(pal)); c.offsetHSL(rr(-.02, .02), rr(-.05, .05), rr(-.05, .05));
  lists[kind].push({x, z, s: rr(...HT[kind]), ry: rr(0, 6.28), rx: rr(-.1, .1), rz: rr(-.1, .1), c});
}
// Flower cluster moved further left away from the gazebo so the piano stays completely visible
for (let i = 0; i < 95 * Q; i++) {
  const x = rr(-14.5, -11.0), z = -ZE + rr(-4.5, 4.5);
  const kind = pick(['rose', 'tulip', 'daisy', 'spike']), pal = PAL[kind], c = new THREE.Color(pick(pal)); c.offsetHSL(rr(-.02, .02), rr(-.05, .05), rr(-.05, .05));
  lists[kind].push({x, z, s: rr(...HT[kind]), ry: rr(0, 6.28), rx: rr(-.1, .1), rz: rr(-.1, .1), c});
}
KINDS.forEach(k => build(flowerGeo(k), flowerMat, lists[k]));

/* ---------- trees and bushes (alpha-card foliage) ---------- */
const leafTex = canvasTex(256, 256, c => {
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < (pass ? 70 : 40); i++) {
    const l = rr(22, 38) * (pass ? 1 : 1.2); c.save(); c.translate(rr(0, 256), rr(0, 256)); c.rotate(rr(0, 6.28));
    c.fillStyle = pass ? pick(['#4f8236', '#628f3f', '#76a24a', '#5a8c3a']) : pick(['#2b4f1f', '#33591f']);
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(l * .5, -l * .3, l, 0); c.quadraticCurveTo(l * .5, l * .3, 0, 0); c.fill();
    c.strokeStyle = 'rgba(255,255,220,.25)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(l * .9, 0); c.stroke(); c.restore();
  }
}, [1, 1]);
const blosTex = canvasTex(256, 256, c => {
  for (let i = 0; i < 46; i++) {
    const x = rr(14, 242), y = rr(14, 242), r = rr(12, 19), a0 = rr(0, 6.28); c.fillStyle = 'rgba(120,90,100,.35)'; c.beginPath(); c.arc(x + 1, y + 2, r * 1.05, 0, 7); c.fill();
    for (let k = 0; k < 5; k++) { const a = a0 + k * 1.2566; c.fillStyle = pick(['#ffffff', '#fff3f6', '#fbe0e8']); c.beginPath(); c.ellipse(x + Math.cos(a) * r * .55, y + Math.sin(a) * r * .55, r * .55, r * .38, a, 0, 7); c.fill(); }
    c.fillStyle = '#d9577a'; c.beginPath(); c.arc(x, y, r * .2, 0, 7); c.fill();
  }
}, [1, 1]);
const cardGeo = new THREE.PlaneGeometry(1, 1);
const leafMat = new THREE.MeshStandardMaterial({map: leafTex, alphaTest: .5, side: THREE.DoubleSide, roughness: .8}); patch(leafMat, 'card');
const blosMat = new THREE.MeshStandardMaterial({map: blosTex, alphaTest: .5, side: THREE.DoubleSide, roughness: .8}); patch(blosMat, 'card');
const okT = (x, z) => z > edgeZ(x) + 5 && !(x < -2.5 && x > -12.4 && z <= -(ZE - 8) && z >= -(ZE + 8));
const leaves = [], blos = [], trunks = [], q = new THREE.Quaternion(), qr = new THREE.Quaternion(), V = new THREE.Vector3(), Zv = new THREE.Vector3(0, 0, 1);
const leafTint = () => new THREE.Color().setHSL(.24 + R() * .06, .4 + R() * .25, .32 + R() * .22);
const blosTint = () => new THREE.Color().setHSL(rr(.92, .99), rr(.3, .8), rr(.78, .93));
const whiteTint = () => new THREE.Color().setHSL(rr(.1, .6), rr(0, .25), rr(.9, 1));
function card(arr, cx, cy, cz, r0, sz, sq, tint, minY) {
  V.set(R() * 2 - 1, (R() * 2 - 1) * sq, R() * 2 - 1).normalize(); const r = r0 * (.55 + .45 * R()); let y = cy + V.y * r; if (y < minY) y = minY + R() * .2;
  q.setFromUnitVectors(Zv, V); qr.setFromAxisAngle(Zv, R() * 6.28); arr.push({x: cx + V.x * r, y, z: cz + V.z * r, s: sz * (.8 + .5 * R()), q: q.clone().multiply(qr), c: tint()});
}
function tree(x, z) {
  const H = rr(2.3, 3.4), Rr = rr(2.3, 3.3), cy = H + Rr * .5, bl = R() < .4, n = Math.floor(150 * Math.max(Q, .65));
  trunks.push({x, z, sx: rr(.8, 1.2), sy: cy, ry: 0});
  for (let i = 0; i < n; i++) { const isB = bl && i > n * .3; card(isB ? blos : leaves, x, cy, z, Rr, isB ? rr(.8, 1.2) : rr(1.1, 1.8), .8, isB ? blosTint : leafTint, 1.6); }
}
for (let s = 4; s < ZE + 14; s += rr(3.5, 6)) for (const sd of [-1, 1]) { const [x, z] = lat(s, sd * rr(7, 16)); if (!bad(x, z) && okT(x, z)) tree(x, z); }
for (let s = -8; s < ZE + 22; s += 4.5) for (const sd of [-1, 1]) { const [x, z] = lat(s, sd * rr(24, 36)); if (okT(x, z)) tree(x, z); }
for (let i = 0; i < 40; i++) {
  const s = rr(3, ZE), [x, z] = lat(s, (R() < .5 ? -1 : 1) * rr(2.4, 10)); if (bad(x, z) || !okT(x, z)) continue;
  const r0 = rr(.55, 1.0), fl = R() < .45;
  for (let k = 0; k < 30; k++) card(leaves, x, .55 * r0, z, r0, rr(.5, .9), .6, leafTint, .12);
  if (fl) { const t = R() < .5 ? whiteTint : blosTint; for (let k = 0; k < 20; k++) card(blos, x, .55 * r0, z, r0 * 1.05, rr(.35, .6), .6, t, .2); }
}
// Flowering bush moved further left outside the piano stage
{
  const bx = -12.6, bz = -ZE - .6, r0 = .95;
  for (let k = 0; k < 34; k++) card(leaves, bx, .55 * r0, bz, r0, rr(.55, .95), .6, leafTint, .12);
  for (let k = 0; k < 24; k++) card(blos, bx, .55 * r0, bz, r0 * 1.05, rr(.38, .62), .6, blosTint, .22);
}
for (let i = 0; i < 34; i++) {   // windswept shrubs along the cliff
  const x = rr(-55, 55), z = edgeZ(x) + rr(1, 4.5); if (bad(x, z)) continue;
  const r0 = rr(.5, 1.1); for (let k = 0; k < 26; k++) card(leaves, x, .5 * r0, z, r0, rr(.5, .9), .6, leafTint, .1);
  if (R() < .5) { const t = R() < .5 ? whiteTint : blosTint; for (let k = 0; k < 16; k++) card(blos, x, .5 * r0, z, r0 * 1.05, rr(.35, .6), .6, t, .2); }
}
build(cardGeo, leafMat, leaves); build(cardGeo, blosMat, blos);
const trunkGeo = new THREE.CylinderGeometry(.11, .2, 1, 8).translate(0, .5, 0);
build(trunkGeo, new THREE.MeshStandardMaterial({color: 0x6d5a45, roughness: 1}), trunks, true);

/* ---------- gazebo ---------- */
const plank = canvasTex(256, 256, (c, w, h) => { for (let i = 0; i < 16; i++) { c.fillStyle = pick(['#d8c4a0', '#cdb892', '#e0cfae', '#c8b38c']); c.fillRect(0, i * 16, w, 15); c.fillStyle = 'rgba(80,60,30,.35)'; c.fillRect(0, i * 16 + 15, w, 1); } for (let i = 0; i < 700; i++) { c.fillStyle = 'rgba(90,65,35,.12)'; c.fillRect(rr(0, w), rr(0, h), rr(6, 30), 1); } }, [2, 2]);
const shingle = canvasTex(256, 256, (c, w, h) => { for (let y = 0; y < 8; y++) for (let x = -1; x < 8; x++) { const ox = (y % 2) * 16; c.fillStyle = pick(['#ffffff', '#f0f0f0', '#e3e3e3', '#fafafa']); c.beginPath(); c.roundRect(x * 32 + ox, y * 32, 31, 36, [0, 0, 12, 12]); c.fill(); c.strokeStyle = 'rgba(0,0,0,.25)'; c.stroke(); } }, [6, 3]);
const gz = new THREE.Group(); gz.position.set(0, 0, -ZE); scene.add(gz);
const white = new THREE.MeshStandardMaterial({color: 0xfdfcf9, roughness: .5});
const woodM = new THREE.MeshStandardMaterial({map: plank, roughness: .75});
const roofM = new THREE.MeshStandardMaterial({map: shingle, color: 0xffffff, roughness: .6, side: THREE.DoubleSide});
const addM = (p, g, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; p.add(o); return o; };
addM(gz, new THREE.CylinderGeometry(3.05, 3.15, .3, 8), woodM, 0, .15, 0, Math.PI / 8);
addM(gz, new THREE.BoxGeometry(2.3, .15, .8), woodM, 0, .075, 3.5);
addM(gz, new THREE.CylinderGeometry(3.5, 3.5, .22, 8), white, 0, 3.15, 0, Math.PI / 8);
addM(gz, new THREE.ConeGeometry(3.55, 2.2, 8, 1, true), roofM, 0, 4.36, 0, Math.PI / 8);
addM(gz, new THREE.ConeGeometry(3.4, 2.1, 8, 1, true), white.clone(), 0, 4.3, 0, Math.PI / 8).material.side = THREE.BackSide;
addM(gz, new THREE.SphereGeometry(.13, 12, 8), white, 0, 5.5, 0); addM(gz, new THREE.ConeGeometry(.05, .5, 8), white, 0, 5.8, 0);
const rp = 2.65, posts = [];
for (let k = 0; k < 8; k++) { const th = Math.PI / 8 + k * Math.PI / 4, px = rp * Math.sin(th), pz = rp * Math.cos(th); posts.push([px, pz]);
  addM(gz, new THREE.CylinderGeometry(.085, .1, 2.85, 14), white, px, 1.725, pz); addM(gz, new THREE.BoxGeometry(.28, .2, .28), white, px, .4, pz, th); addM(gz, new THREE.BoxGeometry(.3, .12, .3), white, px, 3.05, pz, th); }
for (let k = 0; k < 7; k++) {
  const [x0, z0] = posts[k], [x1, z1] = posts[k + 1], len = Math.hypot(x1 - x0, z1 - z0), g = new THREE.Group();
  g.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); g.rotation.y = -Math.atan2(z1 - z0, x1 - x0); gz.add(g);
  addM(g, new THREE.BoxGeometry(len, .07, .08), white, 0, 1.15, 0); addM(g, new THREE.BoxGeometry(len, .06, .06), white, 0, .5, 0);
  for (let i = 0; i < 9; i++) addM(g, new THREE.BoxGeometry(.03, .65, .03), white, (i / 8 - .5) * len * .9, .825, 0);
}
const budGeo = new THREE.IcosahedronGeometry(1, 1), budMat = new THREE.MeshStandardMaterial({roughness: .5});
const buds = [], leafB = [], bc = ['#f6a5c0', '#ffffff', '#ffd45a', '#ff8d74', '#ab90e6', '#e8607a'];
const bud = (x, y, z, r) => { buds.push({x, y: y, z: z + -ZE, s: r, c: new THREE.Color(pick(bc))}); leafB.push({x: x + rr(-.04, .04), y: y - .03, z: z - ZE + rr(-.04, .04), sx: r * 1.8, sy: r * .9, c: new THREE.Color().setHSL(.27, .45, rr(.25, .4)), ry: rr(0, 6)}); };
for (let k = 0; k < 8; k++) { const [x0, z0] = posts[k], [x1, z1] = posts[(k + 1) % 8]; for (let i = 0; i <= 18; i++) { const t = i / 18; bud(x0 + (x1 - x0) * t, 2.95 - .38 * (1 - (2 * t - 1) ** 2) + rr(-.03, .03), z0 + (z1 - z0) * t, rr(.05, .085)); } for (let j = 0; j < 10; j++) bud(x0 + Math.sin(j * 1.7) * .11, .6 + j * .22, z0 + Math.cos(j * 1.7) * .11, rr(.045, .07)); }
for (let i = 0; i <= 44; i++) { const a = i / 44 * Math.PI; bud(Math.cos(a) * 1.0, 1.3 + Math.sin(a) * 1.0, -2.0, rr(.08, .13)); }
for (let j = 0; j < 12; j++) for (const sx of [-1, 1]) bud(sx * 1.0, .35 + j * .08, -2.0, rr(.08, .12));
build(budGeo, budMat, buds); build(budGeo, new THREE.MeshStandardMaterial({roughness: .8}), leafB);
addM(gz, new THREE.TorusGeometry(1, .035, 8, 28, Math.PI), white, 0, 1.3, -2.0); [-1, 1].forEach(sx => addM(gz, new THREE.CylinderGeometry(.035, .035, 1, 8), white, sx, .8, -2.0));
const lightMat = new THREE.MeshBasicMaterial({color: new THREE.Color(3, 2.3, 1.1), toneMapped: false}), lights = new THREE.InstancedMesh(new THREE.SphereGeometry(.035, 8, 6), lightMat, 64);
for (let i = 0; i < 64; i++) { const a = i / 64 * 6.2832; dm.position.set(Math.sin(a) * 3.45, 2.98 + Math.sin(a * 8) * .03, -ZE + Math.cos(a) * 3.45); dm.rotation.set(0, 0, 0); dm.scale.setScalar(1); dm.updateMatrix(); lights.setMatrixAt(i, dm.matrix); }
scene.add(lights);
const inLight = new THREE.PointLight(0xffd9a0, 6, 10, 2); inLight.position.set(0, 2.7, -ZE + 1.6); scene.add(inLight);

/* ---------- glittering couple names in the sky, just behind the gazebo roof ---------- */
{
  // Compact vertical stack (Praise / & / Reks) — intro-style warm name color + strong glow for sunset visibility
  const nameCanvas = document.createElement('canvas');
  nameCanvas.width = 512; nameCanvas.height = 640;
  const nc = nameCanvas.getContext('2d');
  function paintNames(sparkle) {
    nc.clearRect(0, 0, 512, 640);
    // Soft paper-warm halo (matches intro h1 glow)
    const bg = nc.createRadialGradient(256, 320, 10, 256, 320, 280);
    bg.addColorStop(0, 'rgba(255, 246, 230, 0.55)');
    bg.addColorStop(0.4, 'rgba(255, 230, 180, 0.22)');
    bg.addColorStop(1, 'rgba(255, 200, 120, 0)');
    nc.fillStyle = bg; nc.fillRect(0, 0, 512, 640);
    nc.textAlign = 'center'; nc.textBaseline = 'middle';
    // Fine glitter
    for (let i = 0; i < 70; i++) {
      const gx = 60 + (i * 97 + sparkle * 50) % 392;
      const gy = 40 + (i * 53 + sparkle * 30) % 560;
      const gr = 1.0 + (i % 3) * 0.6;
      const a = 0.4 + 0.5 * Math.sin(sparkle * 2.2 + i * 0.7);
      nc.fillStyle = `rgba(255, 248, 220, ${a})`;
      nc.beginPath(); nc.arc(gx, gy, gr, 0, 7); nc.fill();
    }
    // Intro-like name color (#74563c family) with heavy warm glow so it reads against the sun
    nc.shadowColor = 'rgba(255, 246, 230, 1)';
    nc.shadowBlur = 32;
    nc.fillStyle = '#6b4e32';
    nc.font = '120px "Pinyon Script", "Snell Roundhand", cursive';
    nc.fillText('Praise', 256, 200);
    // Second pass for extra glow density
    nc.shadowBlur = 16;
    nc.fillStyle = '#8a6540';
    nc.fillText('Praise', 256, 200);

    nc.shadowBlur = 18;
    nc.fillStyle = '#74563c';
    nc.font = 'italic 48px "Cormorant Garamond", Georgia, serif';
    nc.fillText('&', 256, 310);

    nc.shadowBlur = 32;
    nc.fillStyle = '#6b4e32';
    nc.font = '120px "Pinyon Script", "Snell Roundhand", cursive';
    nc.fillText('Reks', 256, 430);
    nc.shadowBlur = 16;
    nc.fillStyle = '#8a6540';
    nc.fillText('Reks', 256, 430);
    nc.shadowBlur = 0;
  }
  paintNames(0);
  const nameTex = new THREE.CanvasTexture(nameCanvas);
  nameTex.colorSpace = THREE.SRGBColorSpace;
  nameTex.anisotropy = 8;
  // Tighter plane to match compact text
  const nameMat = new THREE.MeshBasicMaterial({
    map: nameTex, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.NormalBlending, opacity: 0.98
  });
  const namePlane = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 6.5), nameMat);
  namePlane.position.set(0, 7.6, -ZE - 4.2);
  namePlane.renderOrder = 3;
  scene.add(namePlane);
  const nameBaseY = 7.6;
  const updateSkyNames = (t) => {
    paintNames(t);
    nameTex.needsUpdate = true;
    namePlane.position.y = nameBaseY + Math.sin(t * 0.35) * 0.1;
    nameMat.opacity = 0.92 + 0.06 * (0.5 + 0.5 * Math.sin(t * 1.05));
  };
  skyNameUpdaters.push(updateSkyNames);
}


/* ---------- grand piano & pianist outside to the left of the gazebo ---------- */
let pianistParts = null;
{
  const musGroup = new THREE.Group(); scene.add(musGroup);
  const addPart = (parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };
  const limb = (parent, r0, r1, len, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const g = new THREE.CylinderGeometry(r0, r1, len, 16); g.translate(0, -len / 2, 0);
    return addPart(parent, g, mat, x, y, z, rx, ry, rz);
  };
  const joint = (parent, r, mat, x, y, z) => addPart(parent, new THREE.SphereGeometry(r, 14, 12), mat, x, y, z);

  // --- Hyper-real Grand Piano ---
  const piano = new THREE.Group();
  piano.position.set(-5.55, 0, -ZE + 1.35);
  piano.rotation.y = 0.56 + Math.PI;
  musGroup.add(piano);

  // Materials: deep polished lacquer, spruce soundboard, warm brass, ivory/ebony keys
  const lacquer = new THREE.MeshStandardMaterial({color: 0x0a0a0e, roughness: .08, metalness: .42, envMapIntensity: 1.6});
  const lacquerEdge = new THREE.MeshStandardMaterial({color: 0x1a1a22, roughness: .14, metalness: .35});
  const spruce = new THREE.MeshStandardMaterial({color: 0xc89a56, roughness: .42, metalness: .06});
  const brass = new THREE.MeshStandardMaterial({color: 0xd4a84a, roughness: .18, metalness: .95, envMapIntensity: 1.5});
  const ivoryM = new THREE.MeshStandardMaterial({color: 0xfbf8ef, roughness: .28, metalness: .03});
  const ebonyM = new THREE.MeshStandardMaterial({color: 0x0c0c10, roughness: .18, metalness: .12});
  const feltM = new THREE.MeshStandardMaterial({color: 0x3a1a1a, roughness: .9, metalness: 0});

  // Classic grand outline (curved wing)
  const pianoShape = new THREE.Shape();
  pianoShape.moveTo(-.78, 0);
  pianoShape.lineTo(-.78, 1.38);
  pianoShape.bezierCurveTo(-.78, 1.95, -.04, 2.02, .18, 1.52);
  pianoShape.bezierCurveTo(.38, 1.12, .68, 1.00, .78, .52);
  pianoShape.lineTo(.78, 0);
  pianoShape.closePath();

  // Main rim / case (extruded with bevel for polished edge)
  const bodyGeo = new THREE.ExtrudeGeometry(pianoShape, {
    depth: .24, bevelEnabled: true, bevelThickness: .018, bevelSize: .016, bevelSegments: 3
  });
  bodyGeo.rotateX(-Math.PI / 2);
  addPart(piano, bodyGeo, lacquer, 0, .70, 0);

  // Inner rim edge highlight
  const rimGeo = new THREE.ExtrudeGeometry(pianoShape, {depth: .01, bevelEnabled: false});
  rimGeo.rotateX(-Math.PI / 2); rimGeo.scale(1.01, 1, 1.01);
  addPart(piano, rimGeo, lacquerEdge, 0, .82, 0);

  // Soundboard (golden spruce)
  const sbGeo = new THREE.ExtrudeGeometry(pianoShape, {depth: .018, bevelEnabled: false});
  sbGeo.rotateX(-Math.PI / 2); sbGeo.scale(.90, 1, .90);
  addPart(piano, sbGeo, spruce, 0, .91, -.02);

  // Cast-iron plate bars (brass-looking harp)
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    addPart(piano, new THREE.CylinderGeometry(.005, .005, 1.22 - t * .35, 6), brass,
      -.55 + i * .155, .935, -.82 + i * .08, Math.PI / 2, 0, -.22);
  }
  // Bridge ridge on soundboard
  addPart(piano, new THREE.BoxGeometry(1.05, .012, .04), spruce, -.05, .94, -.25, 0, .12, 0);

  // Lid (propped open on the long side)
  const lidGeo = new THREE.ExtrudeGeometry(pianoShape, {
    depth: .022, bevelEnabled: true, bevelThickness: .005, bevelSize: .005, bevelSegments: 2
  });
  lidGeo.rotateX(-Math.PI / 2); lidGeo.translate(.78, 0, 0);
  addPart(piano, lidGeo, lacquer, -.78, .93, 0, 0, 0, .48);
  // Lid underside (slightly lighter)
  const lidUnder = lacquer.clone(); lidUnder.color.set(0x2a2a32); lidUnder.roughness = .25;
  addPart(piano, lidGeo.clone(), lidUnder, -.78, .925, 0, 0, 0, .48);
  // Lid prop stick
  addPart(piano, new THREE.CylinderGeometry(.01, .01, .72, 8), brass, .42, 1.22, -.52, 0, 0, -.42);
  // Hinge strip
  addPart(piano, new THREE.BoxGeometry(.04, .02, 1.4), brass, -.76, .88, -.05);

  // Music desk / fallboard area
  addPart(piano, new THREE.BoxGeometry(1.52, .14, .32), lacquer, 0, .72, .16);
  // Fallboard (angled)
  addPart(piano, new THREE.BoxGeometry(.78, .24, .022), lacquer, 0, 1.06, -.04, -.32, 0, 0);
  // Music stand
  addPart(piano, new THREE.BoxGeometry(.48, .28, .01), lacquer, 0, 1.12, -.05, -.35, 0, 0);
  addPart(piano, new THREE.BoxGeometry(.50, .02, .04), brass, 0, 1.00, -.02);

  // Keybed
  addPart(piano, new THREE.BoxGeometry(1.40, .028, .18), ivoryM, 0, .79, .20);
  // White keys (individual for realism)
  for (let i = 0; i < 26; i++) {
    const kx = -0.62 + i * 0.048;
    addPart(piano, new THREE.BoxGeometry(.044, .014, .155), ivoryM, kx, .805, .195);
  }
  // Black keys
  const blackOffsets = [0, 1, 3, 4, 5, 7, 8, 10, 11, 12, 14, 15, 17, 18, 19, 21, 22, 24];
  blackOffsets.forEach(i => {
    const kx = -0.62 + i * 0.048 + 0.024;
    addPart(piano, new THREE.BoxGeometry(.028, .016, .095), ebonyM, kx, .818, .175);
  });
  // Key front felt strip
  addPart(piano, new THREE.BoxGeometry(1.38, .006, .012), feltM, 0, .792, .275);

  // Legs — tapered, fluted feel
  const legPositions = [[-.62, -.12], [.62, -.12], [0, .55]];
  legPositions.forEach(([lx, lz]) => {
    addPart(piano, new THREE.CylinderGeometry(.022, .016, .68, 10), lacquer, lx, .34, lz);
    // Brass caster cups
    addPart(piano, new THREE.CylinderGeometry(.028, .028, .02, 10), brass, lx, .02, lz);
    addPart(piano, new THREE.SphereGeometry(.018, 8, 6), brass, lx, .01, lz);
  });
  // Pedal lyre
  addPart(piano, new THREE.BoxGeometry(.40, .05, .10), lacquer, 0, .06, -.02);
  addPart(piano, new THREE.BoxGeometry(.08, .18, .04), lacquer, 0, .16, -.02);
  [-.10, 0, .10].forEach(px => {
    addPart(piano, new THREE.BoxGeometry(.028, .012, .08), brass, px, .055, .04);
  });

  // Bench — matching lacquer
  addPart(piano, new RoundedBoxGeometry(.88, .055, .36, 2, .012), lacquer, 0, .47, .70);
  addPart(piano, new RoundedBoxGeometry(.84, .035, .32, 2, .014), ebonyM, 0, .51, .70);
  [[-.38, .55], [.38, .55], [-.38, .84], [.38, .84]].forEach(([bx, bz]) => {
    addPart(piano, new THREE.CylinderGeometry(.018, .014, .46, 8), lacquer, bx, .23, bz);
    addPart(piano, new THREE.CylinderGeometry(.022, .022, .015, 8), brass, bx, .01, bz);
  });

  // ---------- Pianist (kept anatomical) ----------
  const skinM = new THREE.MeshStandardMaterial({color: 0x9a6b4a, roughness: .48, metalness: .02});
  const skinDark = new THREE.MeshStandardMaterial({color: 0x7a4e35, roughness: .52, metalness: .02});
  const hairM = new THREE.MeshStandardMaterial({color: 0x1a120e, roughness: .72, metalness: .04});
  const suitM = new THREE.MeshStandardMaterial({color: 0x1a1e28, roughness: .55, metalness: .06});
  const shirtM = new THREE.MeshStandardMaterial({color: 0xf5f2ea, roughness: .62, metalness: .01});
  const shoeM = new THREE.MeshStandardMaterial({color: 0x151515, roughness: .35, metalness: .12});

  const pianist = new THREE.Group(); pianist.position.set(0, 0, .70); piano.add(pianist);
  addPart(pianist, new THREE.SphereGeometry(.11, 16, 12), suitM, 0, .52, -.02).scale.set(1.35, .7, 1.1);
  [-.11, .11].forEach(lx => {
    const thigh = new THREE.Group(); thigh.position.set(lx, .50, -.02); pianist.add(thigh);
    limb(thigh, .065, .055, .38, suitM, 0, 0, 0, Math.PI / 2 - .18, 0, 0);
    joint(thigh, .055, suitM, 0, 0, -.36);
    const calf = new THREE.Group(); calf.position.set(0, 0, -.38); thigh.add(calf);
    limb(calf, .048, .038, .42, suitM, 0, 0, 0, .22, 0, 0);
    addPart(calf, new RoundedBoxGeometry(.09, .055, .18, 2, .02), shoeM, 0, -.40, -.04, .15, 0, 0);
  });
  const pTorso = new THREE.Group(); pTorso.position.set(0, .52, 0); pianist.add(pTorso);
  addPart(pTorso, new THREE.CylinderGeometry(.13, .145, .22, 16), suitM, 0, .12, 0);
  addPart(pTorso, new THREE.CylinderGeometry(.155, .13, .32, 16), suitM, 0, .36, .01);
  addPart(pTorso, new THREE.SphereGeometry(.07, 12, 10), suitM, -.16, .48, .01).scale.set(1.1, .7, 1.0);
  addPart(pTorso, new THREE.SphereGeometry(.07, 12, 10), suitM,  .16, .48, .01).scale.set(1.1, .7, 1.0);
  addPart(pTorso, new THREE.CylinderGeometry(.05, .055, .06, 12), shirtM, 0, .50, -.02);
  addPart(pTorso, new THREE.BoxGeometry(.04, .22, .01), shirtM, -.06, .36, .14, 0, .35, .1);
  addPart(pTorso, new THREE.BoxGeometry(.04, .22, .01), shirtM,  .06, .36, .14, 0, -.35, -.1);
  addPart(pTorso, new THREE.CylinderGeometry(.038, .042, .09, 12), skinM, 0, .56, -.01);
  const pHead = new THREE.Group(); pHead.position.set(0, .66, -.01); pTorso.add(pHead);
  addPart(pHead, new THREE.SphereGeometry(.098, 22, 18), skinM, 0, .04, 0);
  addPart(pHead, new THREE.SphereGeometry(.078, 16, 12), skinM, 0, -.02, .02).scale.set(1.05, .85, 1.05);
  addPart(pHead, new THREE.SphereGeometry(.025, 10, 8), skinDark, -.095, .02, 0).scale.set(.6, 1.1, .7);
  addPart(pHead, new THREE.SphereGeometry(.025, 10, 8), skinDark,  .095, .02, 0).scale.set(.6, 1.1, .7);
  addPart(pHead, new THREE.SphereGeometry(.018, 8, 6), skinDark, 0, .01, .09).scale.set(.7, .9, 1.2);
  addPart(pHead, new THREE.SphereGeometry(.105, 18, 14, 0, Math.PI * 2, 0, Math.PI * .58), hairM, 0, .05, -.005, -.15, 0, 0);
  addPart(pHead, new THREE.BoxGeometry(.12, .02, .04), hairM, 0, .06, .07);
  const pArmL = new THREE.Group(); pArmL.position.set(-.18, .48, .02); pTorso.add(pArmL);
  limb(pArmL, .048, .042, .28, suitM, 0, 0, 0, .55, 0, .22);
  joint(pArmL, .042, suitM, 0, -.26, 0);
  const pForeL = new THREE.Group(); pForeL.position.set(0, -.28, 0); pArmL.add(pForeL);
  limb(pForeL, .038, .032, .26, suitM, 0, 0, 0, 1.15, 0, -.15);
  addPart(pForeL, new THREE.SphereGeometry(.032, 12, 10), skinM, 0, -.26, 0).scale.set(1.15, .7, 1.4);
  const pArmR = new THREE.Group(); pArmR.position.set(.18, .48, .02); pTorso.add(pArmR);
  limb(pArmR, .048, .042, .28, suitM, 0, 0, 0, .55, 0, -.22);
  joint(pArmR, .042, suitM, 0, -.26, 0);
  const pForeR = new THREE.Group(); pForeR.position.set(0, -.28, 0); pArmR.add(pForeR);
  limb(pForeR, .038, .032, .26, suitM, 0, 0, 0, 1.15, 0, .15);
  addPart(pForeR, new THREE.SphereGeometry(.032, 12, 10), skinM, 0, -.26, 0).scale.set(1.15, .7, 1.4);
  pianistParts = {pTorso, pHead, pArmL, pArmR};
}

/* ---------- floral arches along the walk ---------- */
{
  const archBuds = [], archLeaves = [], archBulbs = [];
  [10, 19, 28, 35].forEach(s => {
    const x0 = pathX(s), ry = -Math.atan(dX(s)), cs = Math.cos(ry), sn = Math.sin(ry), g = new THREE.Group(); g.position.set(x0, 0, -s); g.rotation.y = ry; scene.add(g);
    const tor = new THREE.Mesh(new THREE.TorusGeometry(1.6, .035, 8, 40, Math.PI), white); tor.position.y = 1.15; tor.castShadow = true; g.add(tor);
    [-1, 1].forEach(sd => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 1.15, 8), white); p.position.set(sd * 1.6, .575, 0); p.castShadow = true; g.add(p); });
    const W = (lx, ly, lz) => ({x: x0 + lx * cs + lz * sn, y: ly, z: -s - lx * sn + lz * cs});
    const add = (lx, ly, lz, r) => { const w = W(lx, ly, lz); archBuds.push({...w, s: r, c: new THREE.Color(pick(bc))}); archLeaves.push({...w, y: ly - .03, sx: r * 1.8, sy: r * .9, c: new THREE.Color().setHSL(.27, .45, rr(.25, .4)), ry: rr(0, 6)}); };
    for (let i = 0; i <= 52; i++) { const a = i / 52 * Math.PI; add(Math.cos(a) * 1.6 + rr(-.04, .04), 1.15 + Math.sin(a) * 1.6 + rr(-.04, .04), rr(-.07, .07), rr(.06, .115)); }
    for (const sd of [-1, 1]) for (let j = 0; j < 9; j++) add(sd * 1.6 + Math.sin(j * 1.9) * .06, .12 + j * .13, Math.cos(j * 1.9) * .06, rr(.05, .09));
    for (let i = 0; i <= 26; i++) { const a = (i + .5) / 27 * Math.PI, w = W(Math.cos(a) * 1.6, 1.15 + Math.sin(a) * 1.6 - .09, .09); archBulbs.push({x: w.x, y: w.y, z: w.z, s: 1}); }
  });
  build(budGeo, budMat, archBuds); build(budGeo, new THREE.MeshStandardMaterial({roughness: .8}), archLeaves); build(new THREE.SphereGeometry(.03, 8, 6), lightMat, archBulbs);
}

/* ---------- modern wedding chairs arranged in a V-shape along the aisle ---------- */
const CH_COLS = 5, CH_ROWS = 5, CH_S0 = ZE - 11.4, CH_ANG = .30;
const {chairFrameGeo, chairCushionGeo} = (() => {
  const F = [], up = new THREE.Vector3(0, 1, 0);
  // Tapered splayed legs
  const leg = (x0, z0, x1, z1) => {
    const A = new THREE.Vector3(x0, 0, z0), B = new THREE.Vector3(x1, .44, z1), d = B.clone().sub(A);
    const g = new THREE.CylinderGeometry(.014, .01, d.length(), 8);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d.normalize()));
    g.translate((x0 + x1) * .5, .22, (z0 + z1) * .5);
    F.push(g);
  };
  leg(-.19, -.20, -.17, -.17); leg(.19, -.20, .17, -.17);
  leg(-.19, .21, -.17, .17);  leg(.19, .21, .17, .17);
  // Sleek rounded seat frame + upholstered linen cushion
  const apron = new RoundedBoxGeometry(.39, .024, .39, 2, .008); apron.translate(0, .435, 0); F.push(apron);
  const cush = new RoundedBoxGeometry(.37, .044, .37, 3, .018); cush.translate(0, .465, 0);
  // Modern arched hoop backrest + slender cross-back bars
  const hoop = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.17, .44, .17),
    new THREE.Vector3(-.18, .70, .205),
    new THREE.Vector3(-.11, .89, .225),
    new THREE.Vector3(0, .92, .235),
    new THREE.Vector3(.11, .89, .225),
    new THREE.Vector3(.18, .70, .205),
    new THREE.Vector3(.17, .44, .17)
  ]), 24, .014, 8, false);
  F.push(hoop);
  const cross = (a, b) => F.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(...a),
    new THREE.Vector3((a[0] + b[0]) * .5, (a[1] + b[1]) * .5, (a[2] + b[2]) * .5 + .012),
    new THREE.Vector3(...b)
  ]), 10, .009, 6, false));
  cross([-.155, .47, .175], [.145, .86, .22]);
  cross([.155, .47, .175], [-.145, .86, .22]);
  const norm = g => { const ng = g.index ? g.toNonIndexed() : g; ng.deleteAttribute('uv'); return ng; };
  return {chairFrameGeo: mergeGeometries(F.map(norm)), chairCushionGeo: cush};
})();
{
  const chairs = [], posies = [], posyLeaves = [];
  for (const sd of [-1, 1]) {
    // Flipped V pointing at the gazebo: left arm (/), right arm (\), wider toward the entrance
    const armAng = sd * CH_ANG, cs = Math.cos(armAng), sn = Math.sin(armAng);
    for (let r = 0; r < CH_ROWS; r++) for (let c = 0; c < CH_COLS; c++) {
      // r=0 is furthest from gazebo (entrance end) → largest offset; closer rows tighter
      const sRow = CH_S0 + r * .96, offRow = sd * (1.85 + (CH_ROWS - 1 - r) * .46), [rx0, rz0] = lat(sRow, offRow);
      // Face the gazebo (-Z along the path). armAng angles each side of the flipped V inward.
      const ry = -Math.atan(dX(sRow)) + armAng;
      const step = c * .55;
      const x = rx0 + sd * cs * step, z = rz0 - sn * sd * step;
      chairs.push({x, y: 0, z, s: 1, ry: ry + rr(-.015, .015)});
      if (c === 0) {
        const px = x - sd * Math.cos(ry) * .21 + Math.sin(ry) * .18;
        const pz = z + sd * Math.sin(ry) * .21 + Math.cos(ry) * .18;
        for (let k = 0; k < 6; k++) {
          const o = {x: px + rr(-.045, .045), y: .88 + rr(-.04, .05), z: pz + rr(-.03, .03)};
          posies.push({...o, s: rr(.035, .055), c: new THREE.Color(pick(bc))});
          posyLeaves.push({...o, y: o.y - .03, sx: .08, sy: .04, c: new THREE.Color().setHSL(.27, .45, rr(.25, .4)), ry: rr(0, 6)});
        }
      }
    }
  }
  build(chairFrameGeo, new THREE.MeshStandardMaterial({color: 0xebe3d5, roughness: .45}), chairs, true);
  build(chairCushionGeo, new THREE.MeshStandardMaterial({color: 0xfcfaf5, roughness: .85}), chairs, true);
  build(budGeo, budMat, posies); build(budGeo, new THREE.MeshStandardMaterial({roughness: .8}), posyLeaves);
}

/* ---------- easels + artboards ---------- */
const SER = '"Cormorant Garamond",Georgia,serif', SCR = '"Pinyon Script","Snell Roundhand","Apple Chancery",cursive';
const EARTH = {ink: '#4a3b28', moss: '#5c6b34', gold: '#b08d4a', cream: '#f3e6c8'};
const mkBoard = () => { const cv = document.createElement('canvas'); cv.width = 900; cv.height = 1200; const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; return {t, c: cv.getContext('2d')}; };
const BI = mkBoard(), BG = mkBoard(), BS = mkBoard();     // invitation / gallery / story artboards (drawn on a 600 x 800 grid)

function bloom(c, x, y, r, col) { c.fillStyle = col; for (let i = 0; i < 8; i++) { const a = i * .785; c.beginPath(); c.ellipse(x + Math.cos(a) * r * .55, y + Math.sin(a) * r * .55, r * .5, r * .28, a, 0, 7); c.fill(); } c.fillStyle = '#e9a825'; c.beginPath(); c.arc(x, y, r * .3, 0, 7); c.fill(); }
function cluster2(c, x, y, rot) { c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = '#8fb08a'; for (let i = 0; i < 7; i++) { c.save(); c.rotate(-.2 + i * .32); c.beginPath(); c.ellipse(70 + i * 8, 0, 46, 11, 0, 0, 7); c.fill(); c.restore(); }
  [[40, 10, 26, '#f4a6c0'], [85, -40, 20, '#fffdf5'], [100, 30, 22, '#ffd45a'], [60, 60, 17, '#ab90e6'], [130, -5, 15, '#ff8d74'], [22, 52, 14, '#fffdf5']].forEach(a => bloom(c, a[0], a[1], a[2], a[3])); c.restore(); }
function wrap(c, text, maxW) { const out = []; let line = ''; for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; }

/* loaded images for gallery & invitation (fall back to drawn cards until files exist) */
let galleryImg = null, inviteImg = null;
function photoPlaceholder(c, x, y, w, h, seed = 1) {
  const r = rng(seed * 131 + 7), ra = (a, b) => a + (b - a) * r();
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#f1d6a4'); g.addColorStop(.42, '#ebb98a'); g.addColorStop(.58, '#b7a872'); g.addColorStop(1, '#4f6a33'); c.fillStyle = g; c.fillRect(x, y, w, h);
  const sg = c.createRadialGradient(x + w * .68, y + h * .36, 0, x + w * .68, y + h * .36, w * .7); sg.addColorStop(0, 'rgba(255,246,222,.95)'); sg.addColorStop(1, 'rgba(255,246,222,0)'); c.fillStyle = sg; c.fillRect(x, y, w, h);
  [[.57, '#8ea163', .5], [.62, '#5f7a40', .8], [.7, '#3f5a2c', 1]].forEach(([hy, col, al], li) => {
    c.fillStyle = col; c.globalAlpha = al; c.beginPath(); c.moveTo(x, y + h);
    for (let i = 0; i <= 24; i++) c.lineTo(x + w * i / 24, y + h * hy - Math.abs(Math.sin(i * (1.3 + li) + seed)) * h * .045 * (li + 1) - ra(0, h * .01));
    c.lineTo(x + w, y + h); c.fill();
  });
  c.globalAlpha = 1; c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 46; i++) { const bx = x + ra(0, w), by = y + ra(h * .1, h * .85), br = ra(10, 38), bg = c.createRadialGradient(bx, by, 0, bx, by, br); bg.addColorStop(0, `rgba(255,236,190,${ra(.1, .3)})`); bg.addColorStop(1, 'rgba(255,236,190,0)'); c.fillStyle = bg; c.beginPath(); c.arc(bx, by, br, 0, 7); c.fill(); }
  c.restore();
}
function placeholderURL(i) { const cv = document.createElement('canvas'); cv.width = 450; cv.height = 600; photoPlaceholder(cv.getContext('2d'), 0, 0, 450, 600, i + 1); return cv.toDataURL('image/jpeg', .85); }
function drawPhoto(c, x, y, w, h, img = galleryImg) {
  if (!img) return photoPlaceholder(c, x, y, w, h, 1);
  const k = Math.max(w / img.width, h / img.height), iw = img.width * k, ih = img.height * k;
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); c.restore();
}

function paintInvite() {
  const c = BI.c; c.setTransform(1.5, 0, 0, 1.5, 0, 0); c.clearRect(0, 0, 600, 800);
  if (inviteImg) {
    c.fillStyle = '#fffcf3'; c.fillRect(0, 0, 600, 800);
    const k = Math.min(600 / inviteImg.width, 800 / inviteImg.height), iw = inviteImg.width * k, ih = inviteImg.height * k;
    c.drawImage(inviteImg, (600 - iw) / 2, (800 - ih) / 2, iw, ih);
    BI.t.needsUpdate = true; return;
  }
  const g = c.createLinearGradient(0, 0, 600, 800); g.addColorStop(0, '#fffcf3'); g.addColorStop(1, '#f7edd8'); c.fillStyle = g; c.fillRect(0, 0, 600, 800);
  c.strokeStyle = EARTH.gold; c.lineWidth = 2; c.strokeRect(22, 22, 556, 756); c.lineWidth = 1; c.strokeRect(32, 32, 536, 736);
  cluster2(c, 26, 26, 0); cluster2(c, 574, 774, Math.PI); c.textAlign = 'center';
  const L = (t, y, f, sp) => { c.font = f; try { c.letterSpacing = sp || '0px'; } catch (e) {} c.fillText(t, 300, y); };
  c.fillStyle = EARTH.ink; L('together with their families', 182, `italic 500 25px ${SER}`, '1px');
  c.fillStyle = EARTH.moss; L('Praise', 290, `94px ${SCR}`);
  c.fillStyle = EARTH.ink; L('and', 345, `italic 500 34px ${SER}`);
  c.fillStyle = EARTH.moss; L('Reks', 438, `94px ${SCR}`);
  c.fillStyle = EARTH.ink; L('invite you to celebrate their wedding', 500, `italic 500 25px ${SER}`);
  c.strokeStyle = EARTH.gold; c.beginPath(); c.moveTo(190, 548); c.lineTo(275, 548); c.moveTo(325, 548); c.lineTo(410, 548); c.stroke(); bloom(c, 300, 548, 11, '#f4a6c0');
  c.fillStyle = EARTH.ink; L('Saturday, 14 June 2027', 612, `600 31px ${SER}`, '1.5px'); L('at four o’clock in the afternoon', 652, `italic 500 24px ${SER}`); L('The Garden Pavilion', 700, `600 26px ${SER}`, '1px');
  BI.t.needsUpdate = true;
}
function paintGallery() {
  const c = BG.c; c.setTransform(1.5, 0, 0, 1.5, 0, 0); c.clearRect(0, 0, 600, 800);
  c.fillStyle = '#f6eedb'; c.fillRect(0, 0, 600, 800);                       // cream mat around the single picture
  c.save(); c.beginPath(); c.roundRect(24, 24, 552, 752, 6); c.clip();
  drawPhoto(c, 24, 24, 552, 752);
  c.restore();
  BG.t.needsUpdate = true;
}
function paintStory() {
  const c = BS.c; c.setTransform(1.5, 0, 0, 1.5, 0, 0); c.clearRect(0, 0, 600, 800);
  // Clean paper background (no photo) — matches the letter opened by "Read Full Story"
  const g = c.createLinearGradient(0, 0, 600, 800); g.addColorStop(0, '#fffcf3'); g.addColorStop(1, '#f7edd8');
  c.fillStyle = g; c.fillRect(0, 0, 600, 800);
  c.strokeStyle = EARTH.gold; c.lineWidth = 2; c.strokeRect(22, 22, 556, 756);
  c.lineWidth = 1; c.strokeRect(32, 32, 536, 736);
  c.textAlign = 'center'; try { c.letterSpacing = '0px'; } catch (e) {}
  c.fillStyle = EARTH.ink; c.font = `94px ${SCR}`; c.fillText('Our Story', 300, 118);
  c.strokeStyle = 'rgba(176,141,74,.85)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(190, 148); c.lineTo(275, 148); c.moveTo(325, 148); c.lineTo(410, 148); c.stroke();
  bloom(c, 300, 148, 9, '#e8c9a0');
  // Opening of the same letter shown in the modal
  c.fillStyle = EARTH.moss; c.font = `italic 600 26px ${SER}`; c.fillText('To everyone we love,', 300, 200);
  c.fillStyle = EARTH.ink; c.font = `italic 500 24px ${SER}`;
  const body = STORY[0] + ' ' + STORY[1];
  const MAXL = 14, lines = wrap(c, body, 460);
  if (lines.length > MAXL) {
    lines.length = MAXL;
    let l = lines[MAXL - 1];
    while (c.measureText(l + '…').width > 460) l = l.slice(0, -1);
    lines[MAXL - 1] = l.replace(/[\s,.;:]+$/, '') + '…';
  }
  lines.forEach((l, i) => c.fillText(l, 300, 248 + i * 34));
  c.fillStyle = EARTH.moss; c.font = `italic 500 22px ${SER}`;
  c.fillText('— Praise & Reks', 300, 248 + lines.length * 34 + 36);
  BS.t.needsUpdate = true;
}
function paintAll() { paintInvite(); paintGallery(); paintStory(); }
paintAll();
Promise.all(['94px "Pinyon Script"', 'italic 500 28px "Cormorant Garamond"', '600 31px "Cormorant Garamond"'].map(f => document.fonts.load(f))).then(paintAll).catch(() => {});
{ const im = new Image(); im.onload = () => { galleryImg = im; paintAll(); }; im.src = GALLERY[0]; }
{ const im = new Image(); im.onload = () => { inviteImg = im; paintInvite(); }; im.src = INVITE_IMG; }

/* three easels inside the gazebo: story (left), gallery (centre), invitation (right) */
const ES = .86;   // easel + artboard scale, so the board sits at eye level
const EASELS = {G: {x: 0, z: .3, ry: 0, glow: .2}, S: {x: -1.55, z: -.9, ry: .3, glow: .4}, I: {x: 1.55, z: -.9, ry: -.3, glow: .4}};   // gallery forward; story + invitation set further back
function easel(E, tex) {
  const e = new THREE.Group(); e.position.set(E.x, .3, -ZE + E.z); e.rotation.y = E.ry; e.scale.setScalar(ES); scene.add(e);
  const wd = new THREE.MeshStandardMaterial({color: 0x8d6b46, roughness: .75}), up = new THREE.Vector3(0, 1, 0);
  const leg = (a, b, r) => { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), wd); m.position.copy(A).add(B).multiplyScalar(.5); m.quaternion.setFromUnitVectors(up, d.normalize()); m.castShadow = true; e.add(m); };
  leg([-.7, 0, .22], [-.12, 2.4, -.08], .03); leg([.7, 0, .22], [.12, 2.4, -.08], .03); leg([0, 0, -.9], [0, 2.3, -.12], .03);
  addM(e, new THREE.BoxGeometry(1.7, .06, .08), wd, 0, .52, .10);
  addM(e, new THREE.BoxGeometry(1.0, .05, .06), wd, 0, 2.3, -.06);
  addM(e, new THREE.BoxGeometry(1.26, 1.66, .03), new THREE.MeshStandardMaterial({color: 0xfbf7ee, roughness: .8}), 0, 1.38, -0.02);
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), new THREE.MeshStandardMaterial({map: tex, roughness: .85, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: E.glow}));
  pl.position.set(0, 1.40, 0.14); pl.rotation.x = -0.18; pl.receiveShadow = true; e.add(pl);
  return pl;
}
easel(EASELS.G, BG.t); easel(EASELS.S, BS.t); easel(EASELS.I, BI.t);

/* camera poses in front of each easel */
const POSE = {G: {pos: new THREE.Vector3(), look: new THREE.Vector3()}, S: {pos: new THREE.Vector3(), look: new THREE.Vector3()}, I: {pos: new THREE.Vector3(), look: new THREE.Vector3()}};
function computePoses() {
  const D = innerWidth / innerHeight < .9 ? 2.7 : 2.15;
  for (const k in EASELS) { const E = EASELS[k], sn = Math.sin(E.ry), cs = Math.cos(E.ry), bx = E.x + .14 * ES * sn, bz = -ZE + E.z + .14 * ES * cs; POSE[k].look.set(bx, .3 + 1.4 * ES, bz); POSE[k].pos.set(bx + sn * D, CAM_H, bz + cs * D); }
  finalS = -POSE.G.pos.z;   // the walk ends exactly at the gallery pose
}

/* hanging call-to-action anchors, a little above each artboard */
const CTAS = [{el: document.getElementById('cta-gallery'), key: 'G', p: new THREE.Vector3()}, {el: document.getElementById('cta-story'), key: 'S', p: new THREE.Vector3()}];
CTAS.forEach(c => { const E = EASELS[c.key]; c.p.set(E.x + .2 * ES * Math.sin(E.ry), .3 + 2.2 * ES + .1, -ZE + E.z + .2 * ES * Math.cos(E.ry)); });

/* ---------- life: dust, butterflies ---------- */
const dn = 260, dp = new Float32Array(dn * 3), dg = new THREE.BufferGeometry();
const dot = canvasTex(64, 64, (c, w, h) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, [1, 1]);
for (let i = 0; i < dn; i++) { dp[i * 3] = rr(-10, 10); dp[i * 3 + 1] = rr(.2, 4); dp[i * 3 + 2] = rr(-20, 4); }
dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
const dust = new THREE.Points(dg, new THREE.PointsMaterial({map: dot, size: .06, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd09a})); dust.frustumCulled = false; scene.add(dust);
const bfs = ['#ffd45a', '#ff9db8', '#ffffff', '#9fc0ff', '#ffb27a'].map((c, i) => {
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({color: c, side: THREE.DoubleSide}), wg = new THREE.CircleGeometry(.05, 12); wg.scale(1, .8, 1); wg.rotateX(-Math.PI / 2);
  const a = new THREE.Mesh(wg.clone().translate(.05, 0, 0), m), b = new THREE.Mesh(wg.clone().translate(-.05, 0, 0), m); g.add(a, b); g.userData = {a, b, i}; scene.add(g); return g;
});

/* ---------- post-processing ---------- */
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 4}));
composer.addPass(new RenderPass(scene, camera));
// sun rays: bright areas smear toward the sun, so light streams past the gazebo, trees and arches
const raysPass = new ShaderPass({
  uniforms: {tDiffuse: {value: null}, uSun: {value: new THREE.Vector2(.5, .5)}, uAmt: {value: 0}},
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uAmt; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      if (uAmt < .001) { gl_FragColor = base; return; }
      #define N ${COARSE ? 24 : 40}
      vec2 d = uSun - vUv, st = d / float(N) * .95, uv = vUv + st * rnd(vUv * 91.7);
      float w = 1.0; vec3 acc = vec3(0.0);
      for (int i = 0; i < N; i++) { uv += st; vec3 c = min(texture2D(tDiffuse, uv).rgb, vec3(4.0)); acc += c * smoothstep(1.1, 3.0, dot(c, vec3(.2126, .7152, .0722))) * w; w *= .955; }
      acc /= float(N);
      float fall = 1.0 - smoothstep(.0, 1.1, length(d));
      gl_FragColor = vec4(base.rgb + acc * vec3(1.0, .50, .20) * uAmt * 1.0 * fall, base.a); }`
});
composer.addPass(raysPass);
composer.addPass(new UnrealBloomPass(new THREE.Vector2(4, 4), .26, .7, 1.1));
// warm late-afternoon colour grade
composer.addPass(new ShaderPass({
  uniforms: {tDiffuse: {value: null}},
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 col = c.rgb;
      float l = dot(col, vec3(.2126, .7152, .0722));
      col *= vec3(1.12, .97, .76);
      col = mix(vec3(l), col, 1.12);
      col += vec3(.012, .005, -.004) * (1.0 - smoothstep(0.0, .4, l));
      col = mix(col, col * vec3(1.08, .94, .8), smoothstep(.5, 2.5, l));
      vec2 d = vUv - .5; col *= 1.0 - dot(d, d) * .85;
      gl_FragColor = vec4(col, c.a); }`
}));
composer.addPass(new OutputPass());
function resize() {
  const W = innerWidth, H = innerHeight, pr = Math.min(devicePixelRatio || 1, COARSE ? 1.5 : 1.75);
  renderer.setPixelRatio(pr); renderer.setSize(W, H, false); composer.setPixelRatio(pr); composer.setSize(W, H);
  camera.aspect = W / H; camera.fov = W / H < .9 ? 68 : 50; camera.updateProjectionMatrix(); computePoses();
}
addEventListener('resize', resize); resize();

/* ---------- music ---------- */
const audio = new Audio(MUSIC_SRC); audio.loop = true; audio.volume = 0; audio.preload = 'auto';
let musicOn = false, muted = false;
const playMusic = () => { musicOn = true; audio.play().catch(() => {}); };
document.addEventListener('visibilitychange', () => { if (document.hidden) audio.pause(); else if (musicOn) audio.play().catch(() => {}); });
addEventListener('pagehide', () => audio.pause());

/* ---------- camera ride ---------- */
const $ = id => document.getElementById(id);
const intro = $('intro'), endEl = $('end'), hintEl = $('hint'), sndBtn = $('snd'), skipBtn = $('skip'), invBtn = $('seeinv'), storyM = $('story'), galM = $('gallery');
// speed profile: gentle start, steady walk, long ease-out as we reach the gallery easel
const NT = 2000, TAB = (() => { const t = [0]; let a = 0; for (let i = 1; i <= NT; i++) { const u = i / NT; a += sm(u / .1) * Math.pow(1 - sm((u - .55) / .45), 1.15); t.push(a); } return t.map(v => v / a); })();
function prog(u) { const x = clamp(u) * NT, i = Math.min(NT - 1, Math.floor(x)); return [TAB[i] + (TAB[i + 1] - TAB[i]) * (x - i), (TAB[i + 1] - TAB[i]) * NT]; }
// states: idle -> walk -> tour (gallery <-> story loop) <-> invite
const TOUR = ['G', 'S', 'I'];   // gallery -> story -> invitation -> gallery ...
let bulge = 0, state = 'idle', wClock = 0, rate = 1, rateT = 1, s0 = S_START, s = S_START, first = true, toKey = 'G', mt = 1, mdur = MOVE, hold = 0, modalOpen = false;
const lookT = new THREE.Vector3(), des = new THREE.Vector3(), fwd = new THREE.Vector3(), clock = new THREE.Clock();
const cur = {pos: new THREE.Vector3(), look: new THREE.Vector3()}, from = {pos: new THREE.Vector3(), look: new THREE.Vector3()};
const AX = new THREE.Vector3(0, 1, 0), qY = new THREE.Quaternion();
const sX = new THREE.Vector3().crossVectors(AX, sunDir).normalize(), sY = new THREE.Vector3().crossVectors(sunDir, sX);
function snap(v) { const a = v.dot(sX), b = v.dot(sY), tx = 60 / 2048; v.addScaledVector(sX, Math.round(a / tx) * tx - a).addScaledVector(sY, Math.round(b / tx) * tx - b); }
function goTo(k, dur = MOVE) { bulge = (toKey === 'S' && k === 'I') || (toKey === 'I' && k === 'S') ? .6 : 0; from.pos.copy(cur.pos); from.look.copy(cur.look); toKey = k; mt = 0; mdur = dur; }
const touring = () => state === 'tour' || state === 'invite';
addEventListener('resize', () => { if (touring() && mt >= 1) { cur.pos.copy(POSE[toKey].pos); cur.look.copy(POSE[toKey].look); } });

/* modals: full story letter + 20-photo bento gallery */
{
  const sal = document.createElement('p'); sal.className = 'salutation'; sal.textContent = 'To everyone we love,'; $('storytext').appendChild(sal);
  STORY.forEach(p => { const el = document.createElement('p'); el.textContent = p; $('storytext').appendChild(el); });
  const sig = document.createElement('p'); sig.className = 'signature'; sig.innerHTML = 'With all our love,<br><span>Praise &amp; Reks</span>'; $('storytext').appendChild(sig);
}
GALLERY.forEach((src, i) => { const im = new Image(); im.alt = `Wedding photo ${i + 1}`; im.onerror = () => { im.onerror = null; im.src = placeholderURL(i); }; im.src = src; $('galgrid').appendChild(im); });
function openModal(m) { m.querySelector('.body').scrollTop = 0; m.classList.add('show'); modalOpen = true; m.querySelector('.close').focus(); }
function closeModals() { storyM.classList.remove('show'); galM.classList.remove('show'); modalOpen = false; }
[storyM, galM].forEach(m => m.addEventListener('click', e => { if (e.target === m || e.target.closest('.close')) closeModals(); }));
addEventListener('keydown', e => { if (e.key === 'Escape' && modalOpen) closeModals(); });

/* drag to look around */
let drag = false, lx = 0, ly = 0, ty = 0, tp = 0, uy = 0, up = 0;
canvas.addEventListener('pointerdown', e => { drag = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); canvas.classList.add('grab'); });
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  const k = camera.fov * Math.PI / 180 / innerHeight * 1.15; ty = clamp(ty + (e.clientX - lx) * k, -2.6, 2.6); tp = clamp(tp + (e.clientY - ly) * k, -.9, .9); lx = e.clientX; ly = e.clientY;
});
const endDrag = () => { drag = false; canvas.classList.remove('grab'); };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

$('cta-gallery').addEventListener('click', () => openModal(galM));
$('cta-story').addEventListener('click', () => openModal(storyM));
$('go').addEventListener('click', () => {
  intro.classList.add('hide'); s0 = s; wClock = -400; rate = rateT = 1; state = 'walk'; playMusic(); sndBtn.classList.add('show'); skipBtn.classList.add('show');
  // Look-around instruction appears after a beat and stays for the whole experience
  setTimeout(() => { hintEl.classList.add('show'); hintEl.setAttribute('aria-hidden', 'false'); }, 1200);
});
skipBtn.addEventListener('click', () => { rateT = SKIP_RATE; skipBtn.classList.remove('show'); });   // keep the look-around hint
invBtn.addEventListener('click', () => {
  if (state === 'tour') { state = 'invite'; if (toKey !== 'I') goTo('I'); invBtn.textContent = 'Back to the garden'; }
  else if (state === 'invite') { state = 'tour'; goTo('G'); invBtn.textContent = 'See invitation'; }
});
$('again').addEventListener('click', () => {
  endEl.classList.remove('show'); invBtn.textContent = 'See invitation'; s0 = S_START; s = S_START; ty = tp = 0; first = true;
  wClock = -200; rate = rateT = 1; state = 'walk'; skipBtn.classList.add('show');
  hintEl.classList.remove('at-end'); hintEl.classList.add('show');
});
sndBtn.addEventListener('click', () => { muted = !muted; audio.muted = muted; sndBtn.classList.toggle('off', muted); sndBtn.setAttribute('aria-pressed', muted); });

const PV3 = new THREE.Vector3();
function placeCtas(t) {
  const approach = state === 'walk' ? sm((s - (ZE - 14)) / 3.5) : 0;
  const active = touring() ? 1 : approach;
  for (const c of CTAS) {
    let op = 0, sx = 0, sy = 0, sc = 1;
    if (active > .01 && !modalOpen) {
      op = active;
      PV3.copy(c.p); PV3.y += Math.sin(t * 1.3 + (c.key === 'S' ? 1.7 : 0)) * .015;   // gentle hanging bob
      const dist = camera.position.distanceTo(PV3); PV3.project(camera);
      if (PV3.z > 1 || Math.abs(PV3.x) > 1.15) op = 0;
      sx = (PV3.x * .5 + .5) * innerWidth; sy = (-PV3.y * .5 + .5) * innerHeight; sc = clamp(2.6 / dist, .76, 1.12);
    }
    c.el.style.opacity = op.toFixed(3); c.el.style.visibility = op > .02 ? 'visible' : 'hidden'; c.el.style.pointerEvents = op > .5 ? 'auto' : 'none';
    if (op > .02) c.el.style.transform = `translate(${sx}px,${sy}px) translate(-50%,-100%) scale(${sc})`;
  }
}
function tick() {
  const dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime; U.uTime.value = t * (RM ? .35 : 1);
  let walkEnd = false;
  if (state === 'walk') {
    const u0 = clamp(wClock / DUR), tgt = rateT > 1 ? 1 + (rateT - 1) * (1 - .8 * sm((u0 - .8) / .2)) : 1;   // slow back down near the easel
    rate += (tgt - rate) * (1 - Math.exp(-dt * 3.5)); wClock += dt * 1000 * rate;
    const u = clamp(wClock / DUR), [f] = prog(u); s = s0 + (finalS - s0) * f; walkEnd = u >= 1;
  } else if (state === 'idle') s = S_START + Math.sin(t * .35) * .12;

  if (touring()) {
    if (!modalOpen) {
      if (mt < 1) { mt = Math.min(1, mt + dt / mdur); const e = mt * mt * mt * (mt * (mt * 6 - 15) + 10); cur.pos.lerpVectors(from.pos, POSE[toKey].pos, e); cur.look.lerpVectors(from.look, POSE[toKey].look, e); cur.pos.z += bulge * Math.sin(Math.PI * e); if (mt >= 1) hold = 0; }
      else if (state === 'tour') { hold += dt; if (hold >= HOLD) goTo(TOUR[(TOUR.indexOf(toKey) + 1) % TOUR.length]); }
    }
    camera.position.set(cur.pos.x, cur.pos.y + Math.sin(t * .22) * .006, cur.pos.z); lookT.copy(cur.look);
  } else {
    const lookIn = sm((s - (ZE - 22)) / (finalS - (ZE - 22)));
    camera.position.set(pathX(s), CAM_H + Math.sin(t * .22) * .006, -s);
    des.set(pathX(s + 7), 1.35, -(s + 7)).lerp(POSE.G.look, lookIn);
    if (first) { lookT.copy(des); first = false; } lookT.lerp(des, 1 - Math.exp(-dt * 2.2 * Math.sqrt(rate)));
    if (walkEnd) { state = 'tour'; cur.pos.copy(camera.position); cur.look.copy(lookT); goTo('G', .8); skipBtn.classList.remove('show'); endEl.classList.add('show'); hintEl.classList.add('show', 'at-end'); hintEl.setAttribute('aria-hidden', 'false'); }
  }
  const rst = state === 'walk' ? sm((s - (ZE - 24)) / 14) : 0;
  if (!drag) { const k = rst > 0 ? .4 + rst * 3 : touring() ? .3 : 0; if (k) { const d = Math.exp(-dt * k); ty *= d; tp *= d; } }
  uy += (ty - uy) * (1 - Math.exp(-dt * 9)); up += (tp - up) * (1 - Math.exp(-dt * 9));
  camera.lookAt(lookT);
  camera.quaternion.premultiply(qY.setFromAxisAngle(AX, uy));
  camera.rotateX(up); camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  placeCtas(t);
  fwd.copy(lookT).sub(camera.position).normalize();
  sun.target.position.copy(camera.position).addScaledVector(fwd, 18); snap(sun.target.position); sun.position.copy(sun.target.position).addScaledVector(sunDir, 80);
  const vt = musicOn && !muted ? .7 : 0; audio.volume = clamp(audio.volume + (vt - audio.volume) * (1 - Math.exp(-dt * 1.2)));
  const c = camera.position;
  for (let i = 0; i < dn; i++) { const k = i * 3; dp[k] += (Math.sin(t * .3 + i) * .05 + .05) * dt; dp[k + 1] += Math.sin(t * .5 + i * 2) * .03 * dt; dp[k + 2] += Math.cos(t * .25 + i) * .04 * dt;
    if (dp[k] - c.x > 10) dp[k] -= 20; else if (dp[k] - c.x < -10) dp[k] += 20; if (dp[k + 1] > 4) dp[k + 1] = .2; if (dp[k + 2] - c.z > 6) dp[k + 2] -= 26; else if (dp[k + 2] - c.z < -20) dp[k + 2] += 26; }
  dg.attributes.position.needsUpdate = true;
  for (const b of bfs) { const i = b.userData.i, bs = s + 5 + i * 5 + Math.sin(t * .3 + i) * 2, f = Math.sin(t * 26 + i * 2) * .9 + .3; if (bs > ZE - 3) { b.visible = false; continue; } b.visible = true;
    b.position.set(pathX(bs) + Math.sin(t * .5 + i * 2) * 2.5, .6 + (Math.sin(t * .9 + i * 1.3) + 1) * .35, -bs); b.rotation.y = Math.sin(t * .5 + i * 2) * 1.2; b.userData.a.rotation.z = f; b.userData.b.rotation.z = -f; }
  if (pianistParts) {
    const p = RM ? t * .35 : t;
    pianistParts.pTorso.rotation.x = .08 + Math.sin(p * 1.6) * .04;
    pianistParts.pTorso.rotation.z = Math.sin(p * .9) * .05;
    pianistParts.pHead.rotation.x = .12 + Math.sin(p * 2.2) * .05;
    pianistParts.pArmL.rotation.x = Math.sin(p * 7.2) * .08;
    pianistParts.pArmR.rotation.x = Math.cos(p * 8.4) * .08;
  }
  updateGulls(t);
  { const sp = SV.copy(camera.position).addScaledVector(sunDir, 1000).project(camera); camera.getWorldDirection(SD); raysPass.uniforms.uSun.value.set(sp.x * .5 + .5, sp.y * .5 + .5); raysPass.uniforms.uAmt.value = RM ? 0 : sm((SD.dot(sunDir) + .1) / .6); }
  for (const fn of skyNameUpdaters) fn(t);
  composer.render(); requestAnimationFrame(tick);
}
tick();