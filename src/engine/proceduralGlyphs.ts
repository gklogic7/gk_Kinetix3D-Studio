import * as THREE from 'three';
import { LayerMaterialConfig, Text3DConfig } from '../types/studio';

/**
 * Zero-dependency procedural vector glyph engine.
 * Each glyph is defined on a 5x7 normalized grid using crisp geometric strokes
 * and converted into extruded 3D bevel meshes with metallic side trim.
 */
const GLYPH_BITMAPS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10011', '10101', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['10010', '10010', '10010', '11111', '00010', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00010', '00100', '00100', '00000', '00100'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '/': ['00001', '00010', '00100', '00100', '01000', '10000', '00000'],
  '&': ['01100', '10010', '01100', '01010', '10010', '10001', '01110'],
};

/**
 * Merges adjacent horizontal cells on each row of the 5x7 glyph bitmap into
 * smooth beveled rectangular ExtrudeGeometry bars so each character is a crisp,
 * composite 3D typographic sculpture with front face, beveled sides, and backplate.
 */
function buildCharacterGroup(
  char: string,
  textConfig: Text3DConfig,
  faceMat: THREE.MeshPhysicalMaterial,
  sideMat: THREE.MeshPhysicalMaterial,
  trimMat: THREE.MeshStandardMaterial
): THREE.Group {
  const charGroup = new THREE.Group();
  const upper = char.toUpperCase();
  const rows = GLYPH_BITMAPS[upper];
  if (!rows) {
    return charGroup;
  }

  const cellSize = textConfig.size / 7;
  const depth = Math.max(0.05, textConfig.depth);
  const bevel = Math.min(cellSize * 0.26, Math.max(0.008, textConfig.bevelThickness));

  // Merge horizontal runs per row for clean geometry and low draw calls
  for (let r = 0; r < 7; r++) {
    const rowStr = rows[r];
    let c = 0;
    while (c < 5) {
      if (rowStr[c] === '1') {
        let endC = c;
        while (endC + 1 < 5 && rowStr[endC + 1] === '1') {
          endC++;
        }
        const runLen = endC - c + 1;
        const w = runLen * cellSize * 0.96;
        const h = cellSize * 0.96;
        const xCenter = (c + (runLen - 1) * 0.5 - 2) * cellSize;
        const yCenter = (3 - r) * cellSize;

        const shape = new THREE.Shape();
        const hw = w * 0.5;
        const hh = h * 0.5;
        shape.moveTo(-hw, -hh);
        shape.lineTo(hw, -hh);
        shape.lineTo(hw, hh);
        shape.lineTo(-hw, hh);
        shape.closePath();

        const geo = new THREE.ExtrudeGeometry(shape, {
          steps: 1,
          depth,
          bevelEnabled: true,
          bevelThickness: bevel,
          bevelSize: bevel * 0.85,
          bevelSegments: 2,
        });
        geo.translate(xCenter, yCenter, -depth * 0.5);

        const barMesh = new THREE.Mesh(geo, [faceMat, sideMat]);
        barMesh.castShadow = true;
        barMesh.receiveShadow = true;
        charGroup.add(barMesh);

        c = endC + 1;
      } else {
        c++;
      }
    }
  }

  // Secondary detail: sleek metallic spine/pedestal bar under each glyph
  const spineGeo = new THREE.BoxGeometry(textConfig.size * 0.65, cellSize * 0.28, depth * 0.55);
  const spineMesh = new THREE.Mesh(spineGeo, trimMat);
  spineMesh.position.set(0, -textConfig.size * 0.56, 0);
  spineMesh.castShadow = true;
  spineMesh.receiveShadow = true;
  charGroup.add(spineMesh);

  return charGroup;
}

export function createProceduralText3DGroup(
  textConfig: Text3DConfig,
  materialConfig: LayerMaterialConfig
): THREE.Group {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'Text3DRoot';

  const faceMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(materialConfig.color),
    metalness: materialConfig.metalness,
    roughness: materialConfig.roughness,
    clearcoat: materialConfig.clearcoat,
    clearcoatRoughness: 0.15,
  });

  const sideMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(materialConfig.accentColor),
    metalness: Math.min(1, materialConfig.metalness + 0.35),
    roughness: Math.max(0.1, materialConfig.roughness - 0.25),
    clearcoat: 0.6,
  });

  const trimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#27272A'),
    metalness: 0.85,
    roughness: 0.22,
  });

  const rawText = (textConfig.content || 'TEXT').slice(0, 18);
  const charAdvance = textConfig.size * 0.78 + textConfig.letterSpacing;
  const totalWidth = Math.max(0, (rawText.length - 1) * charAdvance);
  const startX = -totalWidth * 0.5;

  const charsContainer = new THREE.Group();
  charsContainer.name = 'CharsContainer';

  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i];
    const charWrapper = new THREE.Group();
    const baseX = startX + i * charAdvance;
    charWrapper.position.set(baseX, 0, 0);
    charWrapper.userData = {
      charIndex: i,
      totalChars: rawText.length,
      baseX,
      baseY: 0,
      baseZ: 0,
    };

    if (ch !== ' ') {
      const glyphMeshGroup = buildCharacterGroup(ch, textConfig, faceMat, sideMat, trimMat);
      charWrapper.add(glyphMeshGroup);
    }
    charsContainer.add(charWrapper);
  }

  rootGroup.add(charsContainer);
  return rootGroup;
}

/**
 * Applies AE-style per-character 3D Text Animator transformations on every frame
 * without allocating new vectors or geometries.
 */
export function applyTextAnimatorToGroup(
  rootGroup: THREE.Group,
  textConfig: Text3DConfig,
  effectPercent: number,
  frame: number
): void {
  const charsContainer = rootGroup.getObjectByName('CharsContainer');
  if (!charsContainer) return;

  const intensity = (effectPercent / 100) * textConfig.effectAmplitude;
  const freq = textConfig.effectFrequency;
  const phase = (frame / 30) * Math.PI * 2 * (freq * 0.5);

  const children = charsContainer.children;
  const count = children.length;

  for (let i = 0; i < count; i++) {
    const charNode = children[i];
    const { baseX = 0, baseY = 0, baseZ = 0 } = charNode.userData;
    const normIdx = count > 1 ? i / (count - 1) : 0;
    const charPhase = phase - i * 0.55;

    charNode.position.set(baseX, baseY, baseZ);
    charNode.rotation.set(0, 0, 0);
    charNode.scale.setScalar(1);

    switch (textConfig.effectType) {
      case 'wave': {
        charNode.position.y = baseY + Math.sin(charPhase) * intensity * 0.85;
        charNode.position.z = baseZ + Math.cos(charPhase) * intensity * 0.4;
        charNode.rotation.z = Math.cos(charPhase) * intensity * 0.35;
        break;
      }
      case 'cascade': {
        const wave = Math.sin(charPhase);
        charNode.position.y = baseY + Math.max(0, wave) * intensity * 1.1;
        charNode.rotation.x = wave * intensity * 0.9;
        const s = 1 + Math.max(0, wave) * (intensity * 0.35);
        charNode.scale.setScalar(s);
        break;
      }
      case 'flip3d': {
        charNode.rotation.y = Math.sin(charPhase * 0.8) * (effectPercent / 100) * Math.PI;
        charNode.position.z = baseZ + Math.sin(charPhase) * intensity * 0.6;
        break;
      }
      case 'orbit': {
        const angle = (normIdx - 0.5) * Math.PI * 0.85 * (effectPercent / 100);
        const radius = 2.2;
        charNode.position.x = baseX * (1 - (effectPercent / 100) * 0.3) + Math.sin(angle + phase * 0.25) * intensity * 1.4;
        charNode.position.z = baseZ + (1 - Math.cos(angle)) * radius * (effectPercent / 100);
        charNode.rotation.y = -angle;
        break;
      }
      case 'elastic': {
        const bounce = Math.abs(Math.sin(charPhase * 1.2));
        charNode.position.y = baseY + bounce * intensity * 1.25;
        charNode.scale.set(
          1 - bounce * intensity * 0.18,
          1 + bounce * intensity * 0.28,
          1
        );
        break;
      }
    }
  }
}
