import * as THREE from 'three';
import { LayerMaterialConfig } from '../types/studio';

/**
 * Generates a soft radial contact shadow CanvasTexture (100% procedural, zero 404s)
 * with SRGBColorSpace.
 */
export function createRadialContactShadowTexture(maxAnisotropy = 1): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 120);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  grad.addColorStop(0.45, 'rgba(0, 0, 0, 0.36)');
  grad.addColorStop(0.8, 'rgba(0, 0, 0, 0.08)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

/**
 * Generates a subtle procedural micro-grain bump/roughness map for studio surfaces.
 */
export function createStudioMicroGrainTexture(maxAnisotropy = 1): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 128;
    const y = Math.random() * 128;
    const v = 115 + Math.floor(Math.random() * 30);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * 1. Studio Cube Assembly (7-part composite model inspired by the bisected Blender cube in the reference image)
 * Pivoted at bottom-center (y = 0) so it sits flush on the ground plane.
 */
export function createStudioCubeAssembly(materialConfig: LayerMaterialConfig): THREE.Group {
  const group = new THREE.Group();
  group.name = 'StudioCubeAssembly';

  // Primary matte/satin clay-metal body material
  const primaryMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(materialConfig.color),
    metalness: materialConfig.metalness,
    roughness: materialConfig.roughness,
    clearcoat: materialConfig.clearcoat,
    clearcoatRoughness: 0.2,
  });

  // Secondary dark metallic recessed seam & chassis material (roughness delta >= 0.25)
  const coreMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#27272A'),
    metalness: Math.min(1, materialConfig.metalness + 0.55),
    roughness: Math.max(0.1, materialConfig.roughness - 0.28),
  });

  // Accent anodized trim material
  const accentMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(materialConfig.accentColor),
    metalness: 0.75,
    roughness: 0.18,
    clearcoat: 0.8,
  });

  const makeBeveledSlab = (w: number, d: number, h: number, bevel: number) => {
    const shape = new THREE.Shape();
    const hw = w * 0.5;
    const hd = d * 0.5;
    shape.moveTo(-hw, -hd);
    shape.lineTo(hw, -hd);
    shape.lineTo(hw, hd);
    shape.lineTo(-hw, hd);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      steps: 1,
      depth: h,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
    });
    geo.rotateX(-Math.PI / 2);
    return geo;
  };

  // Part 1: Grounded Base Plinth (flush at y = 0)
  const plinthGeo = makeBeveledSlab(1.54, 1.54, 0.08, 0.02);
  const plinth = new THREE.Mesh(plinthGeo, coreMat);
  plinth.position.y = 0.02;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  // Part 2: Lower Main Cube Tier (matches lower half of bisected cube in reference)
  const lowerTierGeo = makeBeveledSlab(1.62, 1.62, 0.72, 0.035);
  const lowerTier = new THREE.Mesh(lowerTierGeo, primaryMat);
  lowerTier.position.y = 0.1;
  lowerTier.castShadow = true;
  lowerTier.receiveShadow = true;
  group.add(lowerTier);

  // Part 3: Recessed Equatorial Seam Band (creates the crisp mid-height division line in reference)
  const seamGeo = new THREE.BoxGeometry(1.56, 0.06, 1.56);
  const seamBand = new THREE.Mesh(seamGeo, coreMat);
  seamBand.position.y = 0.86;
  seamBand.castShadow = true;
  seamBand.receiveShadow = true;
  group.add(seamBand);

  // Part 4: Equatorial Accent Trim Line
  const accentBandGeo = new THREE.BoxGeometry(1.66, 0.018, 1.66);
  const accentBand = new THREE.Mesh(accentBandGeo, accentMat);
  accentBand.position.y = 0.86;
  group.add(accentBand);

  // Part 5: Upper Main Cube Tier (matches upper half of bisected cube in reference)
  const upperTierGeo = makeBeveledSlab(1.62, 1.62, 0.72, 0.035);
  const upperTier = new THREE.Mesh(upperTierGeo, primaryMat);
  upperTier.position.y = 0.9;
  upperTier.castShadow = true;
  upperTier.receiveShadow = true;
  group.add(upperTier);

  // Part 6: Top Recessed Calibration Ring (LatheGeometry)
  const lathePoints = [
    new THREE.Vector2(0.22, 0),
    new THREE.Vector2(0.42, 0),
    new THREE.Vector2(0.38, 0.045),
    new THREE.Vector2(0.22, 0.045),
  ];
  const ringGeo = new THREE.LatheGeometry(lathePoints, 32);
  const topRing = new THREE.Mesh(ringGeo, coreMat);
  topRing.position.y = 1.65;
  topRing.castShadow = true;
  topRing.receiveShadow = true;
  group.add(topRing);

  // Part 7: Subtle Edge Wireframe Accent (Blender active object feel)
  const edgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.69, 1.64, 1.69));
  const edgesMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.16,
  });
  const edgeLines = new THREE.LineSegments(edgesGeo, edgesMat);
  edgeLines.position.y = 0.85;
  group.add(edgeLines);

  return group;
}

/**
 * 2. Kinetic Gyro Sculpture (6-part composite gimbal assembly)
 * Pivoted at bottom-center (y = 0).
 */
export function createKineticRingsAssembly(materialConfig: LayerMaterialConfig): THREE.Group {
  const group = new THREE.Group();
  group.name = 'KineticRingsAssembly';

  const primaryMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(materialConfig.color),
    metalness: materialConfig.metalness,
    roughness: materialConfig.roughness,
    clearcoat: materialConfig.clearcoat,
  });

  const accentMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(materialConfig.accentColor),
    metalness: Math.min(1, materialConfig.metalness + 0.25),
    roughness: Math.max(0.08, materialConfig.roughness - 0.25),
    clearcoat: 0.9,
  });

  const baseMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#232326'),
    metalness: 0.85,
    roughness: 0.35,
  });

  // Part 1: Stepped Lathe Base
  const basePoints = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.85, 0),
    new THREE.Vector2(0.75, 0.12),
    new THREE.Vector2(0.45, 0.18),
    new THREE.Vector2(0.2, 0.32),
    new THREE.Vector2(0, 0.32),
  ];
  const baseGeo = new THREE.LatheGeometry(basePoints, 36);
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  group.add(baseMesh);

  // Part 2: Vertical Cradle Strut
  const strutGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.45, 20);
  const strutMesh = new THREE.Mesh(strutGeo, baseMat);
  strutMesh.position.y = 0.42;
  strutMesh.castShadow = true;
  group.add(strutMesh);

  // Part 3: Outer Gimbal Ring
  const outerRingGeo = new THREE.TorusGeometry(1.05, 0.075, 20, 64);
  const outerRing = new THREE.Mesh(outerRingGeo, primaryMat);
  outerRing.position.y = 1.45;
  outerRing.castShadow = true;
  outerRing.receiveShadow = true;
  outerRing.name = 'OuterGimbal';
  group.add(outerRing);

  // Part 4: Middle Pitched Ring
  const midRingGeo = new THREE.TorusGeometry(0.78, 0.06, 20, 56);
  const midRing = new THREE.Mesh(midRingGeo, accentMat);
  midRing.position.y = 1.45;
  midRing.rotation.set(Math.PI / 5, Math.PI / 4, 0);
  midRing.castShadow = true;
  midRing.receiveShadow = true;
  midRing.name = 'MiddleGimbal';
  group.add(midRing);

  // Part 5: Inner Precision Ring
  const innerRingGeo = new THREE.TorusGeometry(0.52, 0.045, 16, 48);
  const innerRing = new THREE.Mesh(innerRingGeo, primaryMat);
  innerRing.position.y = 1.45;
  innerRing.rotation.set(-Math.PI / 3, 0, Math.PI / 6);
  innerRing.castShadow = true;
  innerRing.name = 'InnerGimbal';
  group.add(innerRing);

  // Part 6: Suspended Faceted Core Crystal
  const coreGeo = new THREE.OctahedronGeometry(0.28, 0);
  const coreMesh = new THREE.Mesh(coreGeo, accentMat);
  coreMesh.position.y = 1.45;
  coreMesh.castShadow = true;
  coreMesh.name = 'CoreCrystal';
  group.add(coreMesh);

  return group;
}

/**
 * 3. Architectural Motion Pedestal (5-part stepped stage podium)
 * Pivoted at bottom-center (y = 0).
 */
export function createStudioPedestalAssembly(materialConfig: LayerMaterialConfig): THREE.Group {
  const group = new THREE.Group();
  group.name = 'StudioPedestalAssembly';

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(materialConfig.color),
    metalness: materialConfig.metalness,
    roughness: materialConfig.roughness,
    clearcoat: materialConfig.clearcoat,
  });

  const trimMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(materialConfig.accentColor),
    metalness: 0.85,
    roughness: 0.15,
    clearcoat: 0.7,
  });

  const darkMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#1F2023'),
    metalness: 0.7,
    roughness: 0.45,
  });

  // Part 1: Lower Octagonal / Cylindrical Foundation
  const step1 = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.55, 0.16, 36), darkMat);
  step1.position.y = 0.08;
  step1.castShadow = true;
  step1.receiveShadow = true;
  group.add(step1);

  // Part 2: Recessed Metallic Collar Ring
  const collar1 = new THREE.Mesh(new THREE.CylinderGeometry(1.28, 1.28, 0.08, 36), trimMat);
  collar1.position.y = 0.2;
  collar1.castShadow = true;
  group.add(collar1);

  // Part 3: Main Pedestal Drum
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.24, 0.52, 36), bodyMat);
  drum.position.y = 0.5;
  drum.castShadow = true;
  drum.receiveShadow = true;
  group.add(drum);

  // Part 4: Upper Accent Bevel Ring
  const collar2 = new THREE.Mesh(new THREE.TorusGeometry(1.19, 0.025, 16, 48), trimMat);
  collar2.rotation.x = Math.PI / 2;
  collar2.position.y = 0.76;
  group.add(collar2);

  // Part 5: Top Display Stage Platen
  const platen = new THREE.Mesh(new THREE.CylinderGeometry(1.22, 1.18, 0.08, 36), darkMat);
  platen.position.y = 0.8;
  platen.castShadow = true;
  platen.receiveShadow = true;
  group.add(platen);

  return group;
}

/**
 * Builds the iconic Blender 3D Cursor (red/white dashed circle + dark crosshair ticks)
 * visible in both User and Camera Perspectives in the reference image.
 */
export function createBlender3DCursor(): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const cx = 64;
  const cy = 64;
  const r = 28;

  // White & Red alternating dashed circle segments
  const segments = 12;
  for (let i = 0; i < segments; i++) {
    const startAngle = (i / segments) * Math.PI * 2;
    const endAngle = ((i + 0.82) / segments) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.strokeStyle = i % 2 === 0 ? '#FFFFFF' : '#E03C31';
    ctx.lineWidth = 4.5;
    ctx.stroke();
  }

  // Black & White precision crosshair ticks
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 3;
  const ticks = [
    [cx - r - 12, cy, cx - r + 8, cy],
    [cx + r - 8, cy, cx + r + 12, cy],
    [cx, cy - r - 12, cx, cy - r + 8],
    [cx, cy + r - 8, cx, cy + r + 12],
  ];
  for (const [x1, y1, x2, y2] of ticks) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.55, 0.55, 0.55);
  sprite.renderOrder = 999;
  return sprite;
}

/**
 * Builds the Blender-style infinite-look dark floor grid + red X axis and green Z/Y axis lines
 * matching the reference screenshot.
 */
export function createBlenderFloorGridAndAxes(): {
  gridGroup: THREE.Group;
  axesGroup: THREE.Group;
} {
  const gridGroup = new THREE.Group();
  const axesGroup = new THREE.Group();

  // Sub-grid
  const subGrid = new THREE.GridHelper(28, 28, 0x4b4b4b, 0x3a3a3a);
  subGrid.position.y = 0.002;
  if (Array.isArray(subGrid.material)) {
    subGrid.material.forEach((m) => {
      m.transparent = true;
      m.opacity = 0.65;
      m.polygonOffset = true;
      m.polygonOffsetFactor = -1;
    });
  } else {
    subGrid.material.transparent = true;
    subGrid.material.opacity = 0.65;
  }
  gridGroup.add(subGrid);

  // Red X-axis line & Green Y/Z-axis line matching Blender's floor axes in the reference image
  const xPoints = [new THREE.Vector3(-14, 0.006, 0), new THREE.Vector3(14, 0.006, 0)];
  const xGeo = new THREE.BufferGeometry().setFromPoints(xPoints);
  const xMat = new THREE.LineBasicMaterial({ color: 0xd9434e, transparent: true, opacity: 0.9 });
  const xLine = new THREE.Line(xGeo, xMat);
  axesGroup.add(xLine);

  const zPoints = [new THREE.Vector3(0, 0.006, -14), new THREE.Vector3(0, 0.006, 14)];
  const zGeo = new THREE.BufferGeometry().setFromPoints(zPoints);
  const zMat = new THREE.LineBasicMaterial({ color: 0x67b128, transparent: true, opacity: 0.9 });
  const zLine = new THREE.Line(zGeo, zMat);
  axesGroup.add(zLine);

  return { gridGroup, axesGroup };
}

/**
 * Builds a clean 3D Transform Gizmo (X red, Y blue/up, Z green axes with arrow/ring/box handles)
 * for Move, Rotate, Scale, and Transform tools in the User Perspective viewport.
 */
export function createInteractiveTransformGizmo(): THREE.Group {
  const gizmo = new THREE.Group();
  gizmo.name = 'InteractiveTransformGizmo';

  const makeAxisHandle = (
    axis: 'x' | 'y' | 'z',
    colorHex: number,
    dir: THREE.Vector3
  ) => {
    const axisGroup = new THREE.Group();
    axisGroup.userData = { gizmoAxis: axis };

    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.95,
    });

    // Shaft
    const shaftGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.25, 12);
    shaftGeo.translate(0, 0.625, 0);
    const shaft = new THREE.Mesh(shaftGeo, mat);
    shaft.renderOrder = 950;
    shaft.userData = { gizmoAxis: axis };
    axisGroup.add(shaft);

    // Cone tip
    const coneGeo = new THREE.ConeGeometry(0.09, 0.26, 16);
    coneGeo.translate(0, 1.32, 0);
    const cone = new THREE.Mesh(coneGeo, mat);
    cone.renderOrder = 950;
    cone.userData = { gizmoAxis: axis };
    axisGroup.add(cone);

    // Invisible larger hit proxy for easy touch/tablet dragging
    const proxyGeo = new THREE.CylinderGeometry(0.16, 0.16, 1.5, 8);
    proxyGeo.translate(0, 0.75, 0);
    const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
    const proxy = new THREE.Mesh(proxyGeo, proxyMat);
    proxy.userData = { gizmoAxis: axis };
    axisGroup.add(proxy);

    if (axis === 'x') {
      axisGroup.rotation.z = -Math.PI / 2;
    } else if (axis === 'z') {
      axisGroup.rotation.x = Math.PI / 2;
    }
    void dir;
    return axisGroup;
  };

  gizmo.add(makeAxisHandle('x', 0xe03c31, new THREE.Vector3(1, 0, 0)));
  gizmo.add(makeAxisHandle('y', 0x2f80ed, new THREE.Vector3(0, 1, 0)));
  gizmo.add(makeAxisHandle('z', 0x6bbf23, new THREE.Vector3(0, 0, 1)));

  // Center pivot sphere
  const centerMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      depthWrite: false,
    })
  );
  centerMesh.renderOrder = 955;
  centerMesh.userData = { gizmoAxis: 'y' };
  gizmo.add(centerMesh);

  return gizmo;
}
