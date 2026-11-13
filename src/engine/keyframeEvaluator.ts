import {
  AnimatableProperty,
  EasingType,
  Keyframe,
  LayerTransform,
  SceneLayer,
  StudioProjectState,
} from '../types/studio';

export const ANIMATABLE_PROPERTIES: {
  key: AnimatableProperty;
  label: string;
  shortLabel: string;
  unit: string;
  step: number;
  min?: number;
  max?: number;
  textOnly?: boolean;
}[] = [
  { key: 'position.x', label: 'Position X', shortLabel: 'Pos X', unit: 'm', step: 0.1 },
  { key: 'position.y', label: 'Position Y', shortLabel: 'Pos Y', unit: 'm', step: 0.1 },
  { key: 'position.z', label: 'Position Z', shortLabel: 'Pos Z', unit: 'm', step: 0.1 },
  { key: 'rotation.x', label: 'Rotation X', shortLabel: 'Rot X', unit: '°', step: 5 },
  { key: 'rotation.y', label: 'Rotation Y', shortLabel: 'Rot Y', unit: '°', step: 5 },
  { key: 'rotation.z', label: 'Rotation Z', shortLabel: 'Rot Z', unit: '°', step: 5 },
  { key: 'scale', label: 'Uniform Scale', shortLabel: 'Scale', unit: '×', step: 0.05, min: 0.05, max: 5 },
  { key: 'opacity', label: 'Material Opacity', shortLabel: 'Opacity', unit: '%', step: 5, min: 0, max: 100 },
  {
    key: 'textEffect',
    label: 'Text Animator',
    shortLabel: 'Animator',
    unit: '%',
    step: 5,
    min: 0,
    max: 100,
    textOnly: true,
  },
];

export function evaluateEasing(t: number, easing: EasingType): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (easing) {
    case 'linear':
      return clamped;
    case 'easeInOut':
      return clamped < 0.5
        ? 4 * clamped * clamped * clamped
        : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
    case 'spring': {
      const c4 = (2 * Math.PI) / 3;
      return clamped === 0
        ? 0
        : clamped === 1
        ? 1
        : Math.pow(2, -8 * clamped) * Math.sin((clamped * 6 - 0.75) * c4) + 1;
    }
    case 'step':
      return clamped < 1 ? 0 : 1;
    default:
      return clamped;
  }
}

export function getBasePropertyValue(transform: LayerTransform, prop: AnimatableProperty): number {
  switch (prop) {
    case 'position.x':
      return transform.position[0];
    case 'position.y':
      return transform.position[1];
    case 'position.z':
      return transform.position[2];
    case 'rotation.x':
      return transform.rotation[0];
    case 'rotation.y':
      return transform.rotation[1];
    case 'rotation.z':
      return transform.rotation[2];
    case 'scale':
      return transform.scale;
    case 'opacity':
      return transform.opacity;
    case 'textEffect':
      return transform.textEffect;
  }
}

export function setBasePropertyValue(
  transform: LayerTransform,
  prop: AnimatableProperty,
  value: number
): LayerTransform {
  const next: LayerTransform = {
    position: [...transform.position] as [number, number, number],
    rotation: [...transform.rotation] as [number, number, number],
    scale: transform.scale,
    opacity: transform.opacity,
    textEffect: transform.textEffect,
  };
  switch (prop) {
    case 'position.x':
      next.position[0] = value;
      break;
    case 'position.y':
      next.position[1] = value;
      break;
    case 'position.z':
      next.position[2] = value;
      break;
    case 'rotation.x':
      next.rotation[0] = value;
      break;
    case 'rotation.y':
      next.rotation[1] = value;
      break;
    case 'rotation.z':
      next.rotation[2] = value;
      break;
    case 'scale':
      next.scale = Math.max(0.05, value);
      break;
    case 'opacity':
      next.opacity = Math.max(0, Math.min(100, value));
      break;
    case 'textEffect':
      next.textEffect = Math.max(0, Math.min(100, value));
      break;
  }
  return next;
}

export function evaluateTrackAtFrame(
  keyframes: Keyframe[] | undefined,
  frame: number,
  fallbackValue: number
): number {
  if (!keyframes || keyframes.length === 0) {
    return fallbackValue;
  }
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);
  if (frame <= sorted[0].frame) {
    return sorted[0].value;
  }
  if (frame >= sorted[sorted.length - 1].frame) {
    return sorted[sorted.length - 1].value;
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const k0 = sorted[i];
    const k1 = sorted[i + 1];
    if (frame >= k0.frame && frame <= k1.frame) {
      const span = k1.frame - k0.frame;
      if (span <= 0) return k1.value;
      const rawT = (frame - k0.frame) / span;
      const easedT = evaluateEasing(rawT, k0.easing);
      return k0.value + (k1.value - k0.value) * easedT;
    }
  }
  return fallbackValue;
}

export function evaluateLayerTransformAtFrame(
  layer: SceneLayer,
  frame: number
): LayerTransform {
  const posX = evaluateTrackAtFrame(
    layer.tracks['position.x'],
    frame,
    layer.baseTransform.position[0]
  );
  const posY = evaluateTrackAtFrame(
    layer.tracks['position.y'],
    frame,
    layer.baseTransform.position[1]
  );
  const posZ = evaluateTrackAtFrame(
    layer.tracks['position.z'],
    frame,
    layer.baseTransform.position[2]
  );
  const rotX = evaluateTrackAtFrame(
    layer.tracks['rotation.x'],
    frame,
    layer.baseTransform.rotation[0]
  );
  const rotY = evaluateTrackAtFrame(
    layer.tracks['rotation.y'],
    frame,
    layer.baseTransform.rotation[1]
  );
  const rotZ = evaluateTrackAtFrame(
    layer.tracks['rotation.z'],
    frame,
    layer.baseTransform.rotation[2]
  );
  const scale = evaluateTrackAtFrame(
    layer.tracks['scale'],
    frame,
    layer.baseTransform.scale
  );
  const opacity = evaluateTrackAtFrame(
    layer.tracks['opacity'],
    frame,
    layer.baseTransform.opacity
  );
  const textEffect = evaluateTrackAtFrame(
    layer.tracks['textEffect'],
    frame,
    layer.baseTransform.textEffect
  );

  return {
    position: [posX, posY, posZ],
    rotation: [rotX, rotY, rotZ],
    scale,
    opacity,
    textEffect,
  };
}

export function upsertKeyframeInLayer(
  layer: SceneLayer,
  prop: AnimatableProperty,
  frame: number,
  value: number,
  easing: EasingType = 'easeInOut'
): SceneLayer {
  const roundedFrame = Math.round(frame);
  const existingTrack = layer.tracks[prop] || [];
  const idx = existingTrack.findIndex((k) => k.frame === roundedFrame);
  let nextTrack: Keyframe[];
  if (idx >= 0) {
    nextTrack = existingTrack.map((k, i) =>
      i === idx ? { ...k, value: Number(value.toFixed(3)) } : k
    );
  } else {
    nextTrack = [
      ...existingTrack,
      {
        id: `kf_${prop}_${roundedFrame}_${Math.random().toString(36).slice(2, 6)}`,
        frame: roundedFrame,
        value: Number(value.toFixed(3)),
        easing,
      },
    ].sort((a, b) => a.frame - b.frame);
  }

  return {
    ...layer,
    baseTransform: setBasePropertyValue(layer.baseTransform, prop, value),
    tracks: {
      ...layer.tracks,
      [prop]: nextTrack,
    },
  };
}

export function removeKeyframeFromLayer(
  layer: SceneLayer,
  prop: AnimatableProperty,
  frame: number
): SceneLayer {
  const roundedFrame = Math.round(frame);
  const existingTrack = layer.tracks[prop] || [];
  return {
    ...layer,
    tracks: {
      ...layer.tracks,
      [prop]: existingTrack.filter((k) => k.frame !== roundedFrame),
    },
  };
}

export function getAllKeyframeFrames(layers: SceneLayer[]): number[] {
  const set = new Set<number>();
  for (const layer of layers) {
    Object.values(layer.tracks).forEach((track) => {
      track.forEach((kf) => set.add(kf.frame));
    });
  }
  return Array.from(set).sort((a, b) => a - b);
}

export function createInitialStudioState(): StudioProjectState {
  return {
    projectName: 'Collection | Camera Motion Scene',
    aspectRatio: '16:9',
    viewportLayout: 'dual',
    userShading: 'solid',
    cameraShading: 'rendered',
    activeTool: 'select',
    selectedLayerId: 'layer_cube_hero',
    cursor3DPosition: [0, 0.85, 0],
    groundShadow: {
      enabled: true,
      shadowType: 'both',
      opacity: 0.62,
      blur: 2.2,
      showGrid: true,
      showAxes: true,
      show3DCursor: true,
      showCameraGuides: true,
      floorTone: 0.22,
      envIntensity: 1.05,
      keyLightWarmth: 0.55,
      passepartout: 0.58,
    },
    timeline: {
      currentFrame: 1,
      startFrame: 1,
      endFrame: 250,
      fps: 30,
      isPlaying: false,
      playDirection: 1,
      loop: true,
      autoKey: true,
      markers: [
        { id: 'm1', frame: 1, label: 'Intro Pose' },
        { id: 'm2', frame: 60, label: 'Title Reveal' },
        { id: 'm3', frame: 140, label: 'Apex Spin' },
        { id: 'm4', frame: 220, label: 'Outro Settle' },
      ],
    },
    layers: [
      {
        id: 'layer_cube_hero',
        name: 'Cube.001 (Beveled Studio Core)',
        type: 'cube_assembly',
        colorTag: '#4772B3',
        visible: true,
        locked: false,
        expanded: true,
        inPoint: 1,
        outPoint: 250,
        baseTransform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: 1,
          opacity: 100,
          textEffect: 0,
        },
        materialConfig: {
          color: '#A3A8B0',
          accentColor: '#3B82F6',
          metalness: 0.22,
          roughness: 0.42,
          clearcoat: 0.35,
        },
        tracks: {
          'position.x': [],
          'position.y': [
            { id: 'c_py_1', frame: 1, value: 0, easing: 'easeInOut' },
            { id: 'c_py_2', frame: 90, value: 0.45, easing: 'easeInOut' },
            { id: 'c_py_3', frame: 180, value: 0, easing: 'spring' },
          ],
          'position.z': [],
          'rotation.x': [],
          'rotation.y': [
            { id: 'c_ry_1', frame: 1, value: 0, easing: 'easeInOut' },
            { id: 'c_ry_2', frame: 120, value: 180, easing: 'easeInOut' },
            { id: 'c_ry_3', frame: 250, value: 360, easing: 'easeInOut' },
          ],
          'rotation.z': [],
          scale: [
            { id: 'c_sc_1', frame: 1, value: 1, easing: 'easeInOut' },
            { id: 'c_sc_2', frame: 90, value: 1.08, easing: 'easeInOut' },
            { id: 'c_sc_3', frame: 180, value: 1, easing: 'easeInOut' },
          ],
          opacity: [],
          textEffect: [],
        },
      },
      {
        id: 'layer_text_hero',
        name: '3D Text — MOTION STUDIO',
        type: 'text3d',
        colorTag: '#E5A00D',
        visible: true,
        locked: false,
        expanded: true,
        inPoint: 1,
        outPoint: 250,
        baseTransform: {
          position: [0, 2.25, -0.35],
          rotation: [0, 0, 0],
          scale: 0.9,
          opacity: 100,
          textEffect: 65,
        },
        materialConfig: {
          color: '#F3F4F6',
          accentColor: '#F59E0B',
          metalness: 0.48,
          roughness: 0.24,
          clearcoat: 0.7,
        },
        textConfig: {
          content: 'BLEND 3D',
          size: 0.68,
          depth: 0.22,
          bevelThickness: 0.035,
          letterSpacing: 0.14,
          effectType: 'wave',
          effectAmplitude: 0.35,
          effectFrequency: 2.2,
        },
        tracks: {
          'position.x': [],
          'position.y': [
            { id: 't_py_1', frame: 1, value: 2.25, easing: 'easeInOut' },
            { id: 't_py_2', frame: 60, value: 2.55, easing: 'spring' },
            { id: 't_py_3', frame: 180, value: 2.25, easing: 'easeInOut' },
          ],
          'position.z': [],
          'rotation.x': [],
          'rotation.y': [
            { id: 't_ry_1', frame: 1, value: -12, easing: 'easeInOut' },
            { id: 't_ry_2', frame: 125, value: 12, easing: 'easeInOut' },
            { id: 't_ry_3', frame: 250, value: -12, easing: 'easeInOut' },
          ],
          'rotation.z': [],
          scale: [],
          opacity: [],
          textEffect: [
            { id: 't_ef_1', frame: 1, value: 25, easing: 'easeInOut' },
            { id: 't_ef_2', frame: 60, value: 100, easing: 'spring' },
            { id: 't_ef_3', frame: 190, value: 50, easing: 'easeInOut' },
            { id: 't_ef_4', frame: 250, value: 25, easing: 'easeInOut' },
          ],
        },
      },
      {
        id: 'layer_gyro_rings',
        name: 'Kinetic.Gyro.Rig',
        type: 'kinetic_rings',
        colorTag: '#10B981',
        visible: false,
        locked: false,
        expanded: false,
        inPoint: 1,
        outPoint: 250,
        baseTransform: {
          position: [-2.4, 0, -1.2],
          rotation: [0, 25, 0],
          scale: 0.85,
          opacity: 100,
          textEffect: 0,
        },
        materialConfig: {
          color: '#D1D5DB',
          accentColor: '#10B981',
          metalness: 0.78,
          roughness: 0.2,
          clearcoat: 0.5,
        },
        tracks: {
          'position.x': [],
          'position.y': [],
          'position.z': [],
          'rotation.x': [],
          'rotation.y': [
            { id: 'g_ry_1', frame: 1, value: 0, easing: 'linear' },
            { id: 'g_ry_2', frame: 250, value: 360, easing: 'linear' },
          ],
          'rotation.z': [],
          scale: [],
          opacity: [],
          textEffect: [],
        },
      },
    ],
  };
}
