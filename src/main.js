import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x16181c);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
camera.position.set(4, 3, 6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const pivot = new THREE.Group(); // carries the correction; its matrix is what gets exported
scene.add(pivot);
const helpers = new THREE.Group();
scene.add(helpers);

const loader = new GLTFLoader()
  .setDRACOLoader(new DRACOLoader().setDecoderPath('/draco/'))
  .setKTX2Loader(new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer))
  .setMeshoptDecoder(MeshoptDecoder);

// ---------- state ----------
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = {
  '+z': new THREE.Vector3(0, 0, 1),
  '-z': new THREE.Vector3(0, 0, -1),
  '+x': new THREE.Vector3(1, 0, 0),
  '-x': new THREE.Vector3(-1, 0, 0),
};
const fresh = () => ({
  snap: new THREE.Quaternion(),
  turn: 0, tip: 0, roll: 0, // fine angles, degrees
  scale: 1,
  center: true, ground: true,
  offset: new THREE.Vector3(),
});
let state = fresh();
let file = null;
let model = null; // what is on screen
let original = null; // the file as loaded
let optimized = null; // { scene, key } from the last preview
let size = new THREE.Vector3(1, 1, 1);
let helperSize = 0;

const forward = () => FORWARD[$('forward').value];
/** Axes the rotate buttons act on, relative to the chosen forward direction. */
const axes = () => {
  const f = forward();
  return { turn: UP, tip: new THREE.Vector3().crossVectors(UP, f), roll: f };
};

// ---------- apply state to the preview ----------
let queued = false;
function update() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    apply();
  });
}

function apply() {
  if (!model) return;
  const ax = axes();
  const rad = THREE.MathUtils.degToRad;
  const q = new THREE.Quaternion()
    .setFromAxisAngle(ax.turn, rad(state.turn))
    .multiply(new THREE.Quaternion().setFromAxisAngle(ax.tip, rad(state.tip)))
    .multiply(new THREE.Quaternion().setFromAxisAngle(ax.roll, rad(state.roll)))
    .multiply(state.snap);

  pivot.position.set(0, 0, 0);
  pivot.quaternion.copy(q);
  pivot.scale.setScalar(state.scale);
  pivot.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(pivot, true);
  const c = box.getCenter(new THREE.Vector3());
  box.getSize(size);
  pivot.position.copy(state.offset);
  if (state.center) { pivot.position.x -= c.x; pivot.position.z -= c.z; }
  if (state.ground) pivot.position.y -= box.min.y;
  pivot.updateMatrix();
  pivot.updateMatrixWorld(true);

  const d = dims();
  $('dims').textContent =
    `L ${fmt(d.length)}  W ${fmt(d.width)}  H ${fmt(d.height)}  m`;
  buildHelpers();
}

function dims() {
  const alongX = Math.abs(forward().x) > 0.5;
  return { length: alongX ? size.x : size.z, width: alongX ? size.z : size.x, height: size.y };
}
const fmt = (v) => (v >= 100 ? v.toFixed(1) : v >= 1 ? v.toFixed(3) : v.toPrecision(3));

// ---------- grid, axes, forward arrow ----------
function buildHelpers(force = false) {
  const max = Math.max(size.x, size.y, size.z) || 1;
  const key = max + $('forward').value;
  if (!force && key === helperSize) return;
  helperSize = key;
  helpers.clear();

  const cell = Math.pow(10, Math.floor(Math.log10(max / 2)));
  const extent = Math.ceil((max * 3) / cell / 2) * 2 * cell;
  const grid = new THREE.GridHelper(extent, extent / cell, 0x4a5160, 0x2b3038);
  helpers.add(grid);

  const line = (a, b, color) => {
    const g = new THREE.BufferGeometry().setFromPoints([a, b]);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, depthTest: false }));
    l.renderOrder = 2;
    return l;
  };
  const h = extent / 2;
  helpers.add(line(new THREE.Vector3(-h, 0, 0), new THREE.Vector3(h, 0, 0), 0x9b3b3b));
  helpers.add(line(new THREE.Vector3(0, 0, -h), new THREE.Vector3(0, 0, h), 0x3b5f9b));

  const f = forward();
  const len = max * 0.85;
  const arrow = new THREE.ArrowHelper(f, new THREE.Vector3(0, 0, 0), len, 0xff8a3d, len * 0.14, len * 0.07);
  arrow.line.material.depthTest = false;
  arrow.cone.material.depthTest = false;
  arrow.renderOrder = 3;
  helpers.add(arrow);

  const label = textSprite('FRONT');
  label.scale.setScalar(max * 0.18);
  label.position.copy(f).multiplyScalar(len * 1.12).setY(max * 0.04);
  helpers.add(label);
}

function textSprite(text) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.font = '600 56px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ff8a3d';
  ctx.fillText(text, 128, 64);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(1, 0.5, 1);
  const holder = new THREE.Group();
  holder.add(s);
  holder.renderOrder = 4;
  return holder;
}

// ---------- camera ----------
function setView(name) {
  const max = Math.max(size.x, size.y, size.z) || 1;
  const dist = max * 2.6;
  const target = new THREE.Vector3(0, state.ground ? size.y / 2 : 0, 0).add(
    state.center ? new THREE.Vector3() : new THREE.Box3().setFromObject(pivot).getCenter(new THREE.Vector3()).setY(0),
  );
  const f = forward();
  const right = new THREE.Vector3().crossVectors(UP, f);
  const dir = {
    persp: f.clone().multiplyScalar(0.75).addScaledVector(right, 0.6).addScaledVector(UP, 0.45),
    top: UP.clone().addScaledVector(f, -0.0005), // forward points up the screen
    front: f.clone(),
    side: right.clone(),
  }[name].normalize();
  camera.position.copy(target).addScaledVector(dir, dist);
  camera.near = max / 500;
  camera.far = max * 200;
  camera.updateProjectionMatrix();
  controls.target.copy(target);
  controls.update();
}

// ---------- load ----------
async function load(f) {
  if (!f) return;
  setStatus('Loading…');
  try {
    const gltf = await loader.parseAsync(await f.arrayBuffer(), '');
    original = gltf.scene;
    optimized = null;
    show(original);
    file = f;
    $('stats').textContent = '';
    state = fresh();
    syncInputs();
    $('filename').textContent = `${f.name} · ${(f.size / 1048576).toFixed(2)} MB`;
    $('controls').disabled = false;
    document.body.classList.add('loaded');
    apply();
    buildHelpers(true);
    setView('persp');
    setStatus('');
  } catch (err) {
    console.error(err);
    setStatus(`Could not load: ${err.message}`);
  }
}

function show(obj) {
  pivot.clear();
  pivot.add(obj);
  model = obj;
  $('showOriginal').hidden = obj === original;
  $('showOriginal').textContent = 'Show original';
}

// ---------- size reduction ----------
function optimizeOptions() {
  const o = { compression: $('compression').value };
  if ($('simplify').checked) o.simplify = { ratio: +$('ratio').value / 100, error: +$('error').value / 100 };
  const maxSize = +$('texSize').value || null;
  if (maxSize || $('webp').checked) o.textures = { maxSize, webp: $('webp').checked };
  return o;
}

async function process(matrix, bake) {
  const res = await fetch('/api/realign', {
    method: 'POST',
    headers: {
      'x-matrix': JSON.stringify(matrix),
      'x-bake': bake ? '1' : '0',
      'x-optimize': JSON.stringify(optimizeOptions()),
    },
    body: file,
  });
  if (!res.ok) throw new Error(await res.text());
  const stats = JSON.parse(res.headers.get('x-stats') || 'null');
  if (stats) showStats(stats);
  return { blob: await res.blob(), skipped: res.headers.get('x-bake-skipped') };
}

const mb = (b) => (b / 1048576 >= 0.1 ? (b / 1048576).toFixed(2) + ' MB' : (b / 1024).toFixed(1) + ' KB');
const pct = (a, b) => (b ? ` (${a <= b ? '−' : '+'}${Math.abs(Math.round((1 - a / b) * 100))}%)` : '');
function showStats(s) {
  $('stats').textContent =
    `Triangles ${s.trianglesBefore.toLocaleString()} → ${s.trianglesAfter.toLocaleString()}${pct(s.trianglesAfter, s.trianglesBefore)}\n` +
    `Size      ${mb(s.bytesBefore)} → ${mb(s.bytesAfter)}${pct(s.bytesAfter, s.bytesBefore)}`;
}

/** Runs the reduction (without the alignment) and swaps the result into the viewer. */
async function preview() {
  if (!file) return;
  $('preview').disabled = true;
  setStatus('Reducing…');
  try {
    const { blob } = await process(new THREE.Matrix4().toArray(), false);
    const gltf = await loader.parseAsync(await blob.arrayBuffer(), '');
    optimized = gltf.scene;
    show(optimized);
    update();
    setStatus('Showing the reduced model. Orbit in close to check it.');
  } catch (err) {
    console.error(err);
    setStatus(`Preview failed: ${err.message}`);
  } finally {
    $('preview').disabled = false;
  }
}

// ---------- export ----------
async function exportGlb() {
  if (!file) return;
  apply();
  $('export').disabled = true;
  setStatus('Writing…');
  try {
    const { blob, skipped } = await process(pivot.matrix.toArray(), $('bake').checked);
    const name = file.name.replace(/\.glb$/i, '') + '_aligned.glb';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setStatus(`Saved ${name} to Downloads` + (skipped ? ` (not baked: ${skipped}; used a root node)` : ''));
  } catch (err) {
    console.error(err);
    setStatus(`Export failed: ${err.message}`);
  } finally {
    $('export').disabled = false;
  }
}

const setStatus = (t) => ($('status').textContent = t);

// ---------- inputs ----------
const FINE = { turn: ['yaw', 'yawN'], tip: ['pitch', 'pitchN'], roll: ['roll', 'rollN'] };

function syncInputs() {
  for (const [k, ids] of Object.entries(FINE)) ids.forEach((id) => ($(id).value = state[k]));
  $('scale').value = +state.scale.toPrecision(6);
  $('center').checked = state.center;
  $('ground').checked = state.ground;
  $('ox').value = state.offset.x;
  $('oy').value = state.offset.y;
  $('oz').value = state.offset.z;
}

function snap(kind, deg) {
  const q = new THREE.Quaternion().setFromAxisAngle(axes()[kind], THREE.MathUtils.degToRad(deg));
  state.snap.premultiply(q).normalize();
  update();
}

document.querySelectorAll('[data-snap]').forEach((b) => {
  const [kind, deg] = b.dataset.snap.split(',');
  b.addEventListener('click', () => snap(kind, +deg));
});
for (const [k, ids] of Object.entries(FINE)) {
  ids.forEach((id) =>
    $(id).addEventListener('input', (e) => {
      state[k] = +e.target.value || 0;
      ids.forEach((o) => o !== id && ($(o).value = state[k]));
      update();
    }),
  );
}
$('center').addEventListener('change', (e) => { state.center = e.target.checked; update(); });
$('ground').addEventListener('change', (e) => { state.ground = e.target.checked; update(); });
[['ox', 'x'], ['oy', 'y'], ['oz', 'z']].forEach(([id, a]) =>
  $(id).addEventListener('input', (e) => { state.offset[a] = +e.target.value || 0; update(); }),
);
$('scale').addEventListener('input', (e) => {
  const v = +e.target.value;
  if (v > 0) { state.scale = v; update(); }
});
$('fit').addEventListener('click', () => {
  const want = +$('fitVal').value;
  const have = dims()[$('fitDim').value];
  if (!(want > 0) || !(have > 0)) return;
  state.scale *= want / have;
  $('scale').value = +state.scale.toPrecision(6);
  update();
});
$('forward').addEventListener('change', () => { apply(); buildHelpers(true); });
$('reset').addEventListener('click', () => { state = fresh(); syncInputs(); update(); });
$('export').addEventListener('click', exportGlb);
$('preview').addEventListener('click', preview);
$('showOriginal').addEventListener('click', () => {
  if (!optimized) return;
  const toOriginal = model !== original;
  show(toOriginal ? original : optimized);
  $('showOriginal').hidden = false;
  $('showOriginal').textContent = toOriginal ? 'Show reduced' : 'Show original';
  update();
});
[['ratio', 'ratioN'], ['error', 'errorN']].forEach((pair) =>
  pair.forEach((id) =>
    $(id).addEventListener('input', (e) => pair.forEach((o) => o !== id && ($(o).value = e.target.value))),
  ),
);
// Any change to the reduction settings makes the preview stale: go back to the original.
$('optimize').addEventListener('input', () => {
  if (!optimized) return;
  optimized = null;
  show(original);
  $('stats').textContent = '';
  setStatus('');
  update();
});
$('open').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', (e) => { load(e.target.files[0]); e.target.value = ''; });
document.querySelectorAll('[data-view]').forEach((b) =>
  b.addEventListener('click', () => model && setView(b.dataset.view)),
);

const KEYS = { q: ['turn', 90], e: ['turn', -90], w: ['tip', 90], s: ['tip', -90], a: ['roll', -90], d: ['roll', 90] };
window.addEventListener('keydown', (e) => {
  if (!model || e.metaKey || e.ctrlKey || e.altKey) return;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  const k = KEYS[e.key.toLowerCase()];
  if (k) snap(...k);
});

// drag & drop
let depth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; document.body.classList.add('dragging'); });
window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; document.body.classList.remove('dragging'); } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  depth = 0;
  document.body.classList.remove('dragging');
  const f = [...e.dataTransfer.files].find((x) => /\.glb$/i.test(x.name));
  if (f) load(f);
  else setStatus('Only .glb files are supported');
});

// ---------- loop ----------
function resize() {
  const { clientWidth: w, clientHeight: h } = stage;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
