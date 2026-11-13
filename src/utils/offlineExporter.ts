import threeCoreRaw from '../../node_modules/three/build/three.core.js?raw';
import threeModuleRaw from '../../node_modules/three/build/three.module.js?raw';
import { StudioProjectState } from '../types/studio';

/**
 * Bundles three.core.js and three.module.js into a single self-contained
 * browser script that assigns `window.THREE` with zero external network imports.
 */
function buildInlineThreeBundle(): string {
  // 1. Convert three.core.js final `export { ... };` into `return { ... };`
  const coreTransformed = threeCoreRaw.replace(
    /export\s*\{([^}]+)\}\s*;\s*$/,
    'return {$1};'
  );

  // 2. Convert three.module.js `./three.core.js` import/export and final `export { ... };`
  const moduleTransformed = threeModuleRaw
    .replace(
      /import\s*\{([^}]+)\}\s*from\s*['"]\.\/three\.core\.js['"]\s*;/,
      'const {$1} = __THREE_CORE__;'
    )
    .replace(
      /export\s*\{([^}]+)\}\s*from\s*['"]\.\/three\.core\.js['"]\s*;/,
      ''
    )
    .replace(
      /export\s*\{([^}]+)\}\s*;\s*$/,
      'return Object.assign({}, __THREE_CORE__, {$1});'
    );

  const combined = `
window.THREE = (function() {
  const __THREE_CORE__ = (function() {
${coreTransformed}
  })();
  return (function() {
${moduleTransformed}
  })();
})();
`;

  // Escape any accidental closing script tags inside strings/comments
  return combined.replace(/<\/script>/gi, '<\\/script>');
}

/**
 * Generates and downloads a 100% standalone, offline-capable HTML file containing:
 * - The embedded Three.js WebGL engine
 * - Dual User Perspective & Camera Perspective viewports
 * - Aspect Ratio selector (16:9, 9:16, 1:1, 4:5)
 * - Ground Shadow options & 3D Text Animator
 * - Interactive AE-style Layer & Keyframe Timeline preloaded with current project state
 */
export function exportStandaloneOfflineHTML(state: StudioProjectState): void {
  const inlineThreeJS = buildInlineThreeBundle();
  const serializedState = JSON.stringify(state).replace(/<\/script>/gi, '<\\/script>');

  const htmlDocument = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>${state.projectName} — Kinetix3D Standalone Offline Studio</title>
  <style>
    :root {
      --bg-dark: #181818;
      --bg-panel: #232326;
      --bg-header: #28282b;
      --border: #36363a;
      --accent: #4772b3;
      --amber: #e5a00d;
      --text: #e5e7eb;
      --muted: #9ca3af;
    }
    * { box-sizing: border-box; user-select: none; -webkit-user-select: none; }
    input, select { user-select: text; -webkit-user-select: text; }
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden;
      background: var(--bg-dark); color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
    }
    .app-shell { display: flex; flex-direction: column; width: 100vw; height: 100vh; }
    .top-bar {
      height: 40px; background: var(--bg-header); border-bottom: 1px solid #111;
      display: flex; align-items: center; justify-content: space-between; padding: 0 14px; gap: 12px; flex-shrink: 0;
    }
    .brand { font-weight: 700; font-size: 14px; color: #fff; white-space: nowrap; }
    .nav-group { display: flex; align-items: center; gap: 6px; overflow-x: auto; }
    .btn {
      background: #1f1f22; color: var(--text); border: 1px solid var(--border);
      padding: 4px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; white-space: nowrap;
    }
    .btn:hover { background: #323236; }
    .btn.active { background: var(--accent); border-color: #6090d8; color: #fff; }
    .btn.amber { border-color: var(--amber); color: #fcd34d; }
    .viewport-stage { position: relative; flex: 1; display: flex; overflow: hidden; background: #181818; }
    #webgl-mount { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; }
    .pane-overlay { position: relative; z-index: 10; flex: 1; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; }
    .pane-overlay.left-border { border-right: 2px solid #121212; }
    .pane-header {
      height: 28px; background: rgba(40,40,43,0.9); border-bottom: 1px solid #151515;
      display: flex; align-items: center; justify-content: space-between; padding: 0 10px; pointer-events: auto;
    }
    .pane-label { position: absolute; left: 50px; top: 38px; color: #e5e7eb; line-height: 1.4; text-shadow: 0 1px 2px #000; }
    .tool-strip {
      position: absolute; left: 8px; top: 38px; display: flex; flex-direction: column; gap: 4px; pointer-events: auto;
    }
    .tool-btn {
      width: 30px; height: 30px; border-radius: 4px; background: rgba(40,40,40,0.92);
      border: 1px solid #3a3a3a; color: #d1d5db; display: flex; align-items: center; justify-content: center;
      cursor: pointer; font-weight: 600; font-size: 11px;
    }
    .tool-btn.active { background: var(--accent); border-color: #6090d8; color: #fff; }
    .crop-container { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; padding-left: 36px; }
    .golden-frame {
      border: 1.5px solid var(--amber); position: relative;
      box-shadow: 0 0 0 9999px rgba(12, 12, 12, 0.58);
      transition: width 0.15s, height 0.15s;
    }
    .inspector-bar {
      background: #202023; border-top: 1px solid #141414; padding: 6px 12px;
      display: flex; flex-wrap: wrap; align-items: center; gap: 14px; flex-shrink: 0;
    }
    .timeline-dock {
      height: 205px; background: #1d1d20; border-top: 1px solid #111; display: flex; flex-direction: column; flex-shrink: 0;
    }
    .transport-bar {
      height: 30px; background: var(--bg-header); border-bottom: 1px solid #141416;
      display: flex; align-items: center; justify-content: space-between; padding: 0 10px;
    }
    .timeline-body { flex: 1; display: flex; overflow: hidden; }
    .layer-col { width: 250px; border-right: 1px solid #141416; background: #212124; overflow-y: auto; flex-shrink: 0; }
    .track-col { position: relative; flex: 1; background: #18181b; display: flex; flex-direction: column; cursor: ew-resize; overflow: hidden; }
    .ruler { height: 22px; background: #232327; border-bottom: 1px solid #141416; position: relative; }
    .layer-row {
      height: 26px; padding: 0 8px; display: flex; align-items: center; justify-content: space-between;
      border-bottom: 1px solid #19191c; cursor: pointer;
    }
    .layer-row.selected { background: #2e3d52; color: #fff; }
    .track-lane { height: 26px; border-bottom: 1px solid #202024; position: relative; display: flex; align-items: center; }
    .kf-diamond {
      position: absolute; width: 8px; height: 8px; background: var(--amber); border: 1px solid #111;
      transform: translateX(-50%) rotate(45deg); z-index: 5;
    }
    .playhead { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--accent); pointer-events: none; z-index: 20; }
    .playhead-cap {
      position: absolute; top: 0; left: 50%; transform: translateX(-50%);
      background: var(--accent); color: #fff; padding: 1px 5px; border-radius: 2px; font-size: 10px; font-family: monospace;
    }
    input[type="text"], input[type="number"], select {
      background: #141416; color: #fff; border: 1px solid #38383c; border-radius: 3px; padding: 2px 6px; font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="app-shell">
    <!-- Top Bar -->
    <header class="top-bar">
      <div class="brand">Kinetix3D Offline Studio</div>
      <div class="nav-group">
        <span style="color:var(--muted)">View:</span>
        <button class="btn active" id="view-dual">Dual Split</button>
        <button class="btn" id="view-user">User Only</button>
        <button class="btn" id="view-cam">Camera Only</button>
        <span style="color:var(--muted); margin-left:8px;">Aspect Ratio:</span>
        <button class="btn" data-ratio="16:9">16:9</button>
        <button class="btn" data-ratio="9:16">9:16</button>
        <button class="btn" data-ratio="1:1">1:1</button>
        <button class="btn" data-ratio="4:5">4:5</button>
      </div>
      <div style="font-family:monospace; color:#9ca3af;">100% Offline WebGL Engine</div>
    </header>

    <!-- Dual Viewport Stage -->
    <div class="viewport-stage" id="workspace">
      <div id="webgl-mount"></div>
      <div class="pane-overlay left-border" id="user-pane">
        <div class="pane-header">
          <span>User Perspective (Orbit: Drag | Zoom: Wheel)</span>
          <label style="cursor:pointer;"><input type="checkbox" id="toggle-grid" checked /> Grid & Axes</label>
        </div>
        <div class="pane-label">
          <div><strong>User Perspective</strong></div>
          <div id="user-collection-label">(1) Collection | Camera</div>
        </div>
        <div class="tool-strip">
          <button class="tool-btn active" title="Select">W</button>
          <button class="tool-btn" id="reset-cam-btn" title="Reset Camera">C</button>
        </div>
      </div>

      <div class="pane-overlay" id="cam-pane">
        <div class="pane-header">
          <span>Camera Perspective</span>
          <span id="ratio-badge" style="color:var(--amber); font-family:monospace;">16:9</span>
        </div>
        <div class="pane-label">
          <div><strong>Camera Perspective</strong></div>
          <div id="cam-collection-label">(1) Collection | Camera</div>
        </div>
        <div class="crop-container" id="crop-container">
          <div class="golden-frame" id="golden-frame"></div>
        </div>
      </div>
    </div>

    <!-- Inspector Strip -->
    <div class="inspector-bar">
      <label>3D Text: <input type="text" id="text-input" maxlength="18" value="BLEND 3D" /></label>
      <label>Animator:
        <select id="effect-select">
          <option value="wave">Cascade Sine Wave</option>
          <option value="cascade">Staggered Step Cascade</option>
          <option value="flip3d">Typewriter 3D Flip</option>
          <option value="elastic">Elastic Drop</option>
        </select>
      </label>
      <label><input type="checkbox" id="shadow-toggle" checked /> Ground Shadow</label>
      <label>Shadow Opacity: <input type="range" id="shadow-opacity" min="0" max="1" step="0.05" value="0.62" style="width:80px; vertical-align:middle;" /></label>
      <label>Pos Y (Selected): <input type="range" id="pos-y-slider" min="0" max="3.5" step="0.05" value="0" style="width:80px; vertical-align:middle;" /></label>
      <label>Rot Y (Selected): <input type="range" id="rot-y-slider" min="-180" max="360" step="5" value="0" style="width:80px; vertical-align:middle;" /></label>
      <button class="btn amber" id="add-kf-btn">◆ Keyframe @ Frame</button>
    </div>

    <!-- AE Timeline Dock -->
    <div class="timeline-dock">
      <div class="transport-bar">
        <div style="display:flex; gap:6px; align-items:center;">
          <strong>AE Layer Timeline</strong>
        </div>
        <div style="display:flex; gap:4px; align-items:center;">
          <button class="btn" id="btn-start">|&lt;</button>
          <button class="btn active" id="btn-play">▶ Play / Pause</button>
          <button class="btn" id="btn-end">&gt;|</button>
        </div>
        <div style="font-family:monospace;">
          Frame: <input type="number" id="frame-input" value="1" min="1" max="250" style="width:52px;" /> / 250
        </div>
      </div>
      <div class="timeline-body">
        <div class="layer-col" id="layer-list"></div>
        <div class="track-col" id="track-area">
          <div class="ruler" id="ruler"></div>
          <div id="track-lanes" style="flex:1; overflow-y:auto;"></div>
          <div class="playhead" id="playhead"><div class="playhead-cap" id="playhead-cap">1</div></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Embedded Offline Three.js r187 Engine -->
  <script>${inlineThreeJS}</script>

  <!-- Embedded Project State & Runtime -->
  <script>
  (function() {
    const STATE = ${serializedState};

    const GLYPH_BITMAPS = {
      A: ['01110','10001','10001','11111','10001','10001','10001'],
      B: ['11110','10001','10001','11110','10001','10001','11110'],
      C: ['01111','10000','10000','10000','10000','10000','01111'],
      D: ['11110','10001','10001','10001','10001','10001','11110'],
      E: ['11111','10000','10000','11110','10000','10000','11111'],
      F: ['11111','10000','10000','11110','10000','10000','10000'],
      G: ['01111','10000','10000','10111','10001','10001','01110'],
      H: ['10001','10001','10001','11111','10001','10001','10001'],
      I: ['11111','00100','00100','00100','00100','00100','11111'],
      J: ['00111','00010','00010','00010','10010','10010','01100'],
      K: ['10001','10010','10100','11000','10100','10010','10001'],
      L: ['10000','10000','10000','10000','10000','10000','11111'],
      M: ['10001','11011','10101','10101','10001','10001','10001'],
      N: ['10001','11001','10101','10011','10001','10001','10001'],
      O: ['01110','10001','10001','10001','10001','10001','01110'],
      P: ['11110','10001','10001','11110','10000','10000','10000'],
      Q: ['01110','10001','10001','10001','10101','10010','01101'],
      R: ['11110','10001','10001','11110','10100','10010','10001'],
      S: ['01111','10000','10000','01110','00001','00001','11110'],
      T: ['11111','00100','00100','00100','00100','00100','00100'],
      U: ['10001','10001','10001','10001','10001','10001','01110'],
      V: ['10001','10001','10001','10001','10001','01010','00100'],
      W: ['10001','10001','10001','10101','10101','11011','10001'],
      X: ['10001','10001','01010','00100','01010','10001','10001'],
      Y: ['10001','10001','01010','00100','00100','00100','00100'],
      Z: ['11111','00001','00010','00100','01000','10000','11111'],
      '0': ['01110','10011','10101','10101','11001','10001','01110'],
      '1': ['00100','01100','00100','00100','00100','00100','01110'],
      '2': ['01110','10001','00001','00110','01000','10000','11111'],
      '3': ['11110','00001','00001','01110','00001','00001','11110'],
      '4': ['10010','10010','10010','11111','00010','00010','00010'],
      '5': ['11111','10000','10000','11110','00001','00001','11110'],
      '6': ['01110','10000','10000','11110','10001','10001','01110'],
      '7': ['11111','00001','00010','00100','01000','01000','01000'],
      '8': ['01110','10001','10001','01110','10001','10001','01110'],
      '9': ['01110','10001','10001','01111','00001','00001','01110'],
      '-': ['00000','00000','00000','11111','00000','00000','00000'],
    };

    function evalEasing(t, mode) {
      const c = Math.max(0, Math.min(1, t));
      if (mode === 'linear') return c;
      if (mode === 'spring') {
        const c4 = (2 * Math.PI) / 3;
        return c === 0 ? 0 : c === 1 ? 1 : Math.pow(2, -8 * c) * Math.sin((c * 6 - 0.75) * c4) + 1;
      }
      return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
    }

    function evalTrack(kfs, frame, fallback) {
      if (!kfs || !kfs.length) return fallback;
      const sorted = kfs.slice().sort((a,b) => a.frame - b.frame);
      if (frame <= sorted[0].frame) return sorted[0].value;
      if (frame >= sorted[sorted.length - 1].frame) return sorted[sorted.length - 1].value;
      for (let i = 0; i < sorted.length - 1; i++) {
        const k0 = sorted[i], k1 = sorted[i + 1];
        if (frame >= k0.frame && frame <= k1.frame) {
          const span = k1.frame - k0.frame;
          if (span <= 0) return k1.value;
          return k0.value + (k1.value - k0.value) * evalEasing((frame - k0.frame) / span, k0.easing);
        }
      }
      return fallback;
    }

    function evalLayer(layer, frame) {
      return {
        position: [
          evalTrack(layer.tracks['position.x'], frame, layer.baseTransform.position[0]),
          evalTrack(layer.tracks['position.y'], frame, layer.baseTransform.position[1]),
          evalTrack(layer.tracks['position.z'], frame, layer.baseTransform.position[2])
        ],
        rotation: [
          evalTrack(layer.tracks['rotation.x'], frame, layer.baseTransform.rotation[0]),
          evalTrack(layer.tracks['rotation.y'], frame, layer.baseTransform.rotation[1]),
          evalTrack(layer.tracks['rotation.z'], frame, layer.baseTransform.rotation[2])
        ],
        scale: evalTrack(layer.tracks['scale'], frame, layer.baseTransform.scale),
        opacity: evalTrack(layer.tracks['opacity'], frame, layer.baseTransform.opacity),
        textEffect: evalTrack(layer.tracks['textEffect'], frame, layer.baseTransform.textEffect)
      };
    }

    // Setup WebGL
    const mount = document.getElementById('webgl-mount');
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setScissorTest(true);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x303032);
    scene.fog = new THREE.FogExp2(0x303032, 0.025);

    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x27272a, 0.75);
    hemi.position.set(0, 20, 0);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.3);
    keyLight.position.set(5.5, 9.5, 6.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -6.5;
    keyLight.shadow.camera.right = 6.5;
    keyLight.shadow.camera.top = 6.5;
    keyLight.shadow.camera.bottom = -6.5;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 1.1);
    rimLight.position.set(-6, 5, -5.5);
    scene.add(rimLight);

    const floorGeo = new THREE.PlaneGeometry(36, 36);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.55, transparent: true });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const gridHelper = new THREE.GridHelper(28, 28, 0x525252, 0x3b3b3b);
    scene.add(gridHelper);

    const userCam = new THREE.PerspectiveCamera(45, 1, 0.1, 150);
    const renderCam = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
    renderCam.position.set(3.8, 2.75, 4.65);
    renderCam.lookAt(0, 0.92, 0);

    let camSpherical = { radius: 7.4, theta: 0.72, phi: 1.08 };
    const camTarget = new THREE.Vector3(0, 0.85, 0);
    function updateUserCam() {
      userCam.position.x = camTarget.x + camSpherical.radius * Math.sin(camSpherical.phi) * Math.sin(camSpherical.theta);
      userCam.position.y = camTarget.y + camSpherical.radius * Math.cos(camSpherical.phi);
      userCam.position.z = camTarget.z + camSpherical.radius * Math.sin(camSpherical.phi) * Math.cos(camSpherical.theta);
      userCam.lookAt(camTarget);
    }
    updateUserCam();

    let isDraggingOrbit = false, prevX = 0, prevY = 0;
    renderer.domElement.addEventListener('pointerdown', (e) => {
      isDraggingOrbit = true; prevX = e.clientX; prevY = e.clientY;
    });
    window.addEventListener('pointermove', (e) => {
      if (!isDraggingOrbit) return;
      const dx = (e.clientX - prevX) * 0.008;
      const dy = (e.clientY - prevY) * 0.008;
      prevX = e.clientX; prevY = e.clientY;
      camSpherical.theta -= dx;
      camSpherical.phi = Math.max(0.15, Math.min(Math.PI / 2 - 0.02, camSpherical.phi - dy));
      updateUserCam();
    });
    window.addEventListener('pointerup', () => { isDraggingOrbit = false; });
    renderer.domElement.addEventListener('wheel', (e) => {
      camSpherical.radius = Math.max(2, Math.min(25, camSpherical.radius + e.deltaY * 0.005));
      updateUserCam();
    });

    function buildCube(matCfg) {
      const g = new THREE.Group();
      const m1 = new THREE.MeshPhysicalMaterial({ color: matCfg.color, metalness: matCfg.metalness, roughness: matCfg.roughness, clearcoat: matCfg.clearcoat });
      const m2 = new THREE.MeshStandardMaterial({ color: '#27272A', metalness: 0.8, roughness: 0.2 });
      const lower = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.76, 1.62), m1);
      lower.position.y = 0.42; lower.castShadow = true; lower.receiveShadow = true; g.add(lower);
      const seam = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.06, 1.56), m2);
      seam.position.y = 0.83; g.add(seam);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.76, 1.62), m1);
      upper.position.y = 1.24; upper.castShadow = true; upper.receiveShadow = true; g.add(upper);
      return g;
    }

    function buildText3D(txtCfg, matCfg) {
      const root = new THREE.Group();
      const faceMat = new THREE.MeshPhysicalMaterial({ color: matCfg.color, metalness: matCfg.metalness, roughness: matCfg.roughness });
      const str = (txtCfg.content || 'BLEND 3D').toUpperCase().slice(0, 18);
      const cell = txtCfg.size / 7;
      const adv = txtCfg.size * 0.78 + txtCfg.letterSpacing;
      const startX = -((str.length - 1) * adv) * 0.5;
      const container = new THREE.Group();
      container.name = 'CharsContainer';
      for (let i = 0; i < str.length; i++) {
        const chWrap = new THREE.Group();
        const bx = startX + i * adv;
        chWrap.position.set(bx, 0, 0);
        chWrap.userData = { baseX: bx };
        const bmp = GLYPH_BITMAPS[str[i]];
        if (bmp) {
          for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 5; c++) {
              if (bmp[r][c] === '1') {
                const m = new THREE.Mesh(new THREE.BoxGeometry(cell * 0.95, cell * 0.95, txtCfg.depth), faceMat);
                m.position.set((c - 2) * cell, (3 - r) * cell, 0);
                m.castShadow = true;
                chWrap.add(m);
              }
            }
          }
        }
        container.add(chWrap);
      }
      root.add(container);
      return root;
    }

    const layersRoot = new THREE.Group();
    scene.add(layersRoot);
    const meshMap = new Map();

    function rebuildMeshes() {
      layersRoot.clear();
      meshMap.clear();
      STATE.layers.forEach((l) => {
        const g = l.type === 'text3d' ? buildText3D(l.textConfig, l.materialConfig) : buildCube(l.materialConfig);
        layersRoot.add(g);
        meshMap.set(l.id, g);
      });
    }
    rebuildMeshes();

    function updateCropBox() {
      const cont = document.getElementById('crop-container');
      const frame = document.getElementById('golden-frame');
      const rMap = { '16:9': 16/9, '9:16': 9/16, '1:1': 1, '4:5': 4/5 };
      const target = rMap[STATE.aspectRatio] || (16/9);
      const rect = cont.getBoundingClientRect();
      let w = Math.max(100, rect.width - 60);
      let h = w / target;
      if (h > rect.height - 40) { h = Math.max(80, rect.height - 40); w = h * target; }
      frame.style.width = Math.round(w) + 'px';
      frame.style.height = Math.round(h) + 'px';
      document.getElementById('ratio-badge').textContent = STATE.aspectRatio;
    }
    window.addEventListener('resize', updateCropBox);
    setTimeout(updateCropBox, 50);

    // UI Bindings
    document.querySelectorAll('[data-ratio]').forEach((btn) => {
      btn.addEventListener('click', () => {
        STATE.aspectRatio = btn.getAttribute('data-ratio');
        updateCropBox();
      });
    });

    const setLayout = (mode) => {
      STATE.viewportLayout = mode;
      document.getElementById('user-pane').style.display = mode === 'camera' ? 'none' : 'flex';
      document.getElementById('cam-pane').style.display = mode === 'user' ? 'none' : 'flex';
      document.getElementById('view-dual').classList.toggle('active', mode === 'dual');
      document.getElementById('view-user').classList.toggle('active', mode === 'user');
      document.getElementById('view-cam').classList.toggle('active', mode === 'camera');
      updateCropBox();
    };
    document.getElementById('view-dual').onclick = () => setLayout('dual');
    document.getElementById('view-user').onclick = () => setLayout('user');
    document.getElementById('view-cam').onclick = () => setLayout('camera');

    document.getElementById('toggle-grid').onchange = (e) => { gridHelper.visible = e.target.checked; };
    document.getElementById('shadow-toggle').onchange = (e) => { floorMesh.visible = e.target.checked; };
    document.getElementById('shadow-opacity').oninput = (e) => { floorMat.opacity = parseFloat(e.target.value) * 0.8; };

    document.getElementById('text-input').oninput = (e) => {
      const txtLayer = STATE.layers.find((l) => l.type === 'text3d');
      if (txtLayer && txtLayer.textConfig) {
        txtLayer.textConfig.content = e.target.value;
        rebuildMeshes();
      }
    };
    document.getElementById('effect-select').onchange = (e) => {
      const txtLayer = STATE.layers.find((l) => l.type === 'text3d');
      if (txtLayer && txtLayer.textConfig) txtLayer.textConfig.effectType = e.target.value;
    };

    function renderTimelineUI() {
      const listEl = document.getElementById('layer-list');
      const lanesEl = document.getElementById('track-lanes');
      listEl.innerHTML = '';
      lanesEl.innerHTML = '';
      STATE.layers.forEach((l) => {
        const row = document.createElement('div');
        row.className = 'layer-row' + (STATE.selectedLayerId === l.id ? ' selected' : '');
        row.textContent = l.name;
        row.onclick = () => { STATE.selectedLayerId = l.id; renderTimelineUI(); };
        listEl.appendChild(row);

        const lane = document.createElement('div');
        lane.className = 'track-lane';
        const kfs = Object.values(l.tracks).flat();
        kfs.forEach((k) => {
          const d = document.createElement('div');
          d.className = 'kf-diamond';
          d.style.left = ((k.frame - 1) / 249 * 100) + '%';
          lane.appendChild(d);
        });
        lanesEl.appendChild(lane);
      });
    }
    renderTimelineUI();

    const syncPlayheadUI = () => {
      const f = Math.round(STATE.timeline.currentFrame);
      const pct = ((f - 1) / 249) * 100;
      document.getElementById('playhead').style.left = pct + '%';
      document.getElementById('playhead-cap').textContent = f;
      document.getElementById('frame-input').value = f;
      document.getElementById('user-collection-label').textContent = '(' + f + ') Collection | Camera';
      document.getElementById('cam-collection-label').textContent = '(' + f + ') Collection | Camera';
    };

    document.getElementById('btn-play').onclick = () => {
      STATE.timeline.isPlaying = !STATE.timeline.isPlaying;
    };
    document.getElementById('btn-start').onclick = () => {
      STATE.timeline.isPlaying = false; STATE.timeline.currentFrame = 1; syncPlayheadUI();
    };
    document.getElementById('btn-end').onclick = () => {
      STATE.timeline.isPlaying = false; STATE.timeline.currentFrame = 250; syncPlayheadUI();
    };
    document.getElementById('frame-input').oninput = (e) => {
      STATE.timeline.currentFrame = Math.max(1, Math.min(250, Number(e.target.value) || 1));
      syncPlayheadUI();
    };
    document.getElementById('track-area').addEventListener('pointerdown', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const norm = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      STATE.timeline.currentFrame = Math.round(1 + norm * 249);
      syncPlayheadUI();
    });

    document.getElementById('add-kf-btn').onclick = () => {
      const sel = STATE.layers.find((l) => l.id === STATE.selectedLayerId) || STATE.layers[0];
      if (!sel) return;
      const f = Math.round(STATE.timeline.currentFrame);
      const py = parseFloat(document.getElementById('pos-y-slider').value) || 0;
      const ry = parseFloat(document.getElementById('rot-y-slider').value) || 0;
      sel.tracks['position.y'].push({ id: 'k_' + Date.now(), frame: f, value: py, easing: 'easeInOut' });
      sel.tracks['rotation.y'].push({ id: 'kr_' + Date.now(), frame: f, value: ry, easing: 'easeInOut' });
      renderTimelineUI();
    };

    let lastTime = performance.now();
    function animate(now) {
      requestAnimationFrame(animate);
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      if (STATE.timeline.isPlaying) {
        STATE.timeline.currentFrame += dt * STATE.timeline.fps;
        if (STATE.timeline.currentFrame > STATE.timeline.endFrame) {
          STATE.timeline.currentFrame = STATE.timeline.startFrame;
        }
        syncPlayheadUI();
      }

      STATE.layers.forEach((l) => {
        const g = meshMap.get(l.id);
        if (!g) return;
        const tr = evalLayer(l, STATE.timeline.currentFrame);
        g.visible = l.visible;
        g.position.set(tr.position[0], tr.position[1], tr.position[2]);
        g.rotation.set(
          THREE.MathUtils.degToRad(tr.rotation[0]),
          THREE.MathUtils.degToRad(tr.rotation[1]),
          THREE.MathUtils.degToRad(tr.rotation[2])
        );
        g.scale.setScalar(tr.scale);

        if (l.type === 'text3d' && l.textConfig) {
          const cont = g.getObjectByName('CharsContainer');
          if (cont) {
            const phase = (STATE.timeline.currentFrame / 30) * Math.PI * 2;
            const amp = (tr.textEffect / 100) * (l.textConfig.effectAmplitude || 0.35);
            cont.children.forEach((ch, idx) => {
              const cp = phase - idx * 0.55;
              ch.position.y = Math.sin(cp) * amp;
              ch.rotation.y = l.textConfig.effectType === 'flip3d' ? Math.sin(cp) * 1.2 : 0;
            });
          }
        }
      });

      const ws = document.getElementById('workspace').getBoundingClientRect();
      if (renderer.domElement.width !== ws.width || renderer.domElement.height !== ws.height) {
        renderer.setSize(ws.width, ws.height, false);
      }

      const uPane = document.getElementById('user-pane');
      if (uPane.style.display !== 'none') {
        const ur = uPane.getBoundingClientRect();
        renderer.setViewport(ur.left - ws.left, ws.bottom - ur.bottom, ur.width, ur.height);
        renderer.setScissor(ur.left - ws.left, ws.bottom - ur.bottom, ur.width, ur.height);
        userCam.aspect = ur.width / Math.max(1, ur.height);
        userCam.updateProjectionMatrix();
        renderer.render(scene, userCam);
      }

      const cPane = document.getElementById('cam-pane');
      if (cPane.style.display !== 'none') {
        const cr = cPane.getBoundingClientRect();
        renderer.setViewport(cr.left - ws.left, ws.bottom - cr.bottom, cr.width, cr.height);
        renderer.setScissor(cr.left - ws.left, ws.bottom - cr.bottom, cr.width, cr.height);
        renderCam.aspect = cr.width / Math.max(1, cr.height);
        renderCam.updateProjectionMatrix();
        renderer.render(scene, renderCam);
      }
    }
    requestAnimationFrame(animate);
  })();
  </script>
</body>
</html>`;

  const blob = new Blob([htmlDocument], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kinetix3d-offline-studio.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}
