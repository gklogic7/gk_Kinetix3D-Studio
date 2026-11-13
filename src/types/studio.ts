export type ViewportTool =
  | 'select'
  | 'cursor'
  | 'move'
  | 'rotate'
  | 'scale'
  | 'transform'
  | 'annotate'
  | 'measure'
  | 'add';

export type AspectRatioPreset = '16:9' | '9:16' | '1:1' | '4:5';

export type ViewportLayoutMode = 'dual' | 'user' | 'camera';

export type ShadingMode = 'wireframe' | 'solid' | 'material' | 'rendered';

export type EasingType = 'linear' | 'easeInOut' | 'spring' | 'step';

export type AnimatableProperty =
  | 'position.x'
  | 'position.y'
  | 'position.z'
  | 'rotation.x'
  | 'rotation.y'
  | 'rotation.z'
  | 'scale'
  | 'opacity'
  | 'textEffect';

export interface Keyframe {
  id: string;
  frame: number;
  value: number;
  easing: EasingType;
}

export type LayerType = 'text3d' | 'cube_assembly' | 'kinetic_rings' | 'pedestal';

export type TextEffectType = 'wave' | 'cascade' | 'flip3d' | 'orbit' | 'elastic';

export interface LayerMaterialConfig {
  color: string;
  accentColor: string;
  metalness: number;
  roughness: number;
  clearcoat: number;
}

export interface Text3DConfig {
  content: string;
  size: number;
  depth: number;
  bevelThickness: number;
  letterSpacing: number;
  effectType: TextEffectType;
  effectAmplitude: number;
  effectFrequency: number;
}

export interface LayerTransform {
  position: [number, number, number];
  rotation: [number, number, number]; // degrees for UI friendliness
  scale: number;
  opacity: number;
  textEffect: number; // 0 to 100% animator progress/intensity
}

export interface SceneLayer {
  id: string;
  name: string;
  type: LayerType;
  colorTag: string;
  visible: boolean;
  locked: boolean;
  expanded: boolean;
  inPoint: number;
  outPoint: number;
  baseTransform: LayerTransform;
  materialConfig: LayerMaterialConfig;
  textConfig?: Text3DConfig;
  tracks: Record<AnimatableProperty, Keyframe[]>;
}

export interface GroundShadowConfig {
  enabled: boolean;
  shadowType: 'pcf_soft' | 'contact_radial' | 'both';
  opacity: number;
  blur: number;
  showGrid: boolean;
  showAxes: boolean;
  show3DCursor: boolean;
  showCameraGuides: boolean;
  floorTone: number;
  envIntensity: number;
  keyLightWarmth: number;
  passepartout: number;
}

export interface TimelineMarker {
  id: string;
  frame: number;
  label: string;
}

export interface TimelineState {
  currentFrame: number;
  startFrame: number;
  endFrame: number;
  fps: number;
  isPlaying: boolean;
  playDirection: 1 | -1;
  loop: boolean;
  autoKey: boolean;
  markers: TimelineMarker[];
}

export interface AnnotationStroke {
  id: string;
  viewport: 'user' | 'camera';
  points: { x: number; y: number }[];
  color: string;
}

export interface MeasureSegment {
  id: string;
  start: [number, number, number];
  end: [number, number, number];
}

export interface StudioProjectState {
  projectName: string;
  aspectRatio: AspectRatioPreset;
  viewportLayout: ViewportLayoutMode;
  userShading: ShadingMode;
  cameraShading: ShadingMode;
  activeTool: ViewportTool;
  selectedLayerId: string | null;
  cursor3DPosition: [number, number, number];
  layers: SceneLayer[];
  groundShadow: GroundShadowConfig;
  timeline: TimelineState;
}
