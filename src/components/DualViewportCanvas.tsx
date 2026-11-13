import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  AnnotationStroke,
  AspectRatioPreset,
  GroundShadowConfig,
  LayerTransform,
  LayerType,
  MeasureSegment,
  SceneLayer,
  ShadingMode,
  ViewportLayoutMode,
  ViewportTool,
} from '../types/studio';
import { evaluateLayerTransformAtFrame } from '../engine/keyframeEvaluator';
import {
  applyTextAnimatorToGroup,
  createProceduralText3DGroup,
} from '../engine/proceduralGlyphs';
import {
  createBlender3DCursor,
  createBlenderFloorGridAndAxes,
  createInteractiveTransformGizmo,
  createKineticRingsAssembly,
  createRadialContactShadowTexture,
  createStudioCubeAssembly,
  createStudioPedestalAssembly,
} from '../engine/proceduralModels';
import {
  Box,
  Camera,
  ChevronDown,
  Crosshair,
  Grid,
  Hand,
  Maximize2,
  Move,
  PenTool,
  PlusSquare,
  RotateCw,
  Ruler,
  Scaling,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';

interface DualViewportCanvasProps {
  layers: SceneLayer[];
  selectedLayerId: string | null;
  currentFrame: number;
  isPlaying: boolean;
  aspectRatio: AspectRatioPreset;
  viewportLayout: ViewportLayoutMode;
  userShading: ShadingMode;
  cameraShading: ShadingMode;
  activeTool: ViewportTool;
  cursor3DPosition: [number, number, number];
  groundShadow: GroundShadowConfig;
  onSelectLayer: (id: string | null) => void;
  onSelectTool: (tool: ViewportTool) => void;
  onUpdateCursor3D: (pos: [number, number, number]) => void;
  onTransformSelectedLayer: (
    layerId: string,
    nextTransform: LayerTransform,
    recordKeyframe: boolean
  ) => void;
  onAddLayerAtCursor: (type: LayerType) => void;
  onChangeUserShading: (mode: ShadingMode) => void;
  onChangeCameraShading: (mode: ShadingMode) => void;
  onUpdateGroundShadow: (partial: Partial<GroundShadowConfig>) => void;
}

// Pre-allocated math helpers at module scope (zero GC in render loop)
const _vec2 = new THREE.Vector2();
const _vec3 = new THREE.Vector3();
const _planeIntersect = new THREE.Vector3();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _dragPlane = new THREE.Plane();
const _camTarget = new THREE.Vector3(0, 0.9, 0);

const ASPECT_NUMBERS: Record<AspectRatioPreset, { ratio: number; resLabel: string }> = {
  '16:9': { ratio: 16 / 9, resLabel: '1920 × 1080 (16:9)' },
  '9:16': { ratio: 9 / 16, resLabel: '1080 × 1920 (9:16)' },
  '1:1': { ratio: 1, resLabel: '1080 × 1080 (1:1)' },
  '4:5': { ratio: 4 / 5, resLabel: '1080 × 1350 (4:5)' },
};

export const DualViewportCanvas: React.FC<DualViewportCanvasProps> = ({
  layers,
  selectedLayerId,
  currentFrame,
  isPlaying,
  aspectRatio,
  viewportLayout,
  userShading,
  cameraShading,
  activeTool,
  cursor3DPosition,
  groundShadow,
  onSelectLayer,
  onSelectTool,
  onUpdateCursor3D,
  onTransformSelectedLayer,
  onAddLayerAtCursor,
  onChangeUserShading,
  onChangeCameraShading,
  onUpdateGroundShadow,
}) => {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const userPaneRef = useRef<HTMLDivElement>(null);
  const cameraPaneRef = useRef<HTMLDivElement>(null);

  const [showUserOptions, setShowUserOptions] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState<'user' | 'camera' | null>(null);
  const [isUserOrtho, setIsUserOrtho] = useState(false);
  const [panModeActive, setPanModeActive] = useState(false);
  const [annotations, setAnnotations] = useState<AnnotationStroke[]>([]);
  const [activeStroke, setActiveStroke] = useState<AnnotationStroke | null>(null);
  const [measureSegment, setMeasureSegment] = useState<MeasureSegment | null>(null);
  const [cameraCropRect, setCameraCropRect] = useState({ width: 320, height: 180 });

  // Store latest mutable props in a ref so the stable WebGL loop never tears down
  const stateRef = useRef({
    layers,
    selectedLayerId,
    currentFrame,
    isPlaying,
    aspectRatio,
    viewportLayout,
    userShading,
    cameraShading,
    activeTool,
    cursor3DPosition,
    groundShadow,
    isUserOrtho,
    panModeActive,
    onSelectLayer,
    onUpdateCursor3D,
    onTransformSelectedLayer,
  });

  useEffect(() => {
    stateRef.current = {
      layers,
      selectedLayerId,
      currentFrame,
      isPlaying,
      aspectRatio,
      viewportLayout,
      userShading,
      cameraShading,
      activeTool,
      cursor3DPosition,
      groundShadow,
      isUserOrtho,
      panModeActive,
      onSelectLayer,
      onUpdateCursor3D,
      onTransformSelectedLayer,
    };
    requestRenderRef.current?.();
  }, [
    layers,
    selectedLayerId,
    currentFrame,
    isPlaying,
    aspectRatio,
    viewportLayout,
    userShading,
    cameraShading,
    activeTool,
    cursor3DPosition,
    groundShadow,
    isUserOrtho,
    panModeActive,
    onSelectLayer,
    onUpdateCursor3D,
    onTransformSelectedLayer,
  ]);

  const requestRenderRef = useRef<(() => void) | null>(null);
  const cameraPresetTargetRef = useRef<{
    active: boolean;
    pos: THREE.Vector3;
    target: THREE.Vector3;
  }>({
    active: false,
    pos: new THREE.Vector3(4.6, 3.4, 5.2),
    target: new THREE.Vector3(0, 0.85, 0),
  });
  const orbitControlsRef = useRef<OrbitControls | null>(null);

  // Compute responsive golden camera crop frame inside Camera Perspective pane
  useEffect(() => {
    const updateCropSize = () => {
      const pane = cameraPaneRef.current;
      if (!pane) return;
      const rect = pane.getBoundingClientRect();
      const availW = Math.max(120, rect.width - 108);
      const availH = Math.max(100, rect.height - 96);
      const targetRatio = ASPECT_NUMBERS[aspectRatio].ratio;

      let w = availW;
      let h = w / targetRatio;
      if (h > availH) {
        h = availH;
        w = h * targetRatio;
      }
      setCameraCropRect({ width: Math.round(w), height: Math.round(h) });
    };

    updateCropSize();
    const ro = new ResizeObserver(updateCropSize);
    if (cameraPaneRef.current) ro.observe(cameraPaneRef.current);
    if (workspaceRef.current) ro.observe(workspaceRef.current);
    window.addEventListener('resize', updateCropSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateCropSize);
    };
  }, [aspectRatio, viewportLayout]);

  // Initialize stable Three.js WebGLRenderer & Scene once
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    const workspaceEl = workspaceRef.current;
    if (!mountEl || !workspaceEl) return;

    // 1. Software WebGL detection from GPU renderer string
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setScissorTest(true);

    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    mountEl.innerHTML = '';
    mountEl.appendChild(renderer.domElement);

    // 2. Scene, Fog & Studio Environment Reflection (RoomEnvironment)
    const scene = new THREE.Scene();
    const bgHex = 0x333333;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.028);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnvTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = roomEnvTexture;
    pmremGenerator.dispose();

    // 3. Cameras: User Perspective, User Ortho, and Render Camera (Camera Perspective)
    const userPerspCam = new THREE.PerspectiveCamera(45, 1, 0.1, 150);
    userPerspCam.position.set(4.5, 3.3, 5.1);
    userPerspCam.lookAt(0, 0.85, 0);

    const userOrthoCam = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 150);
    userOrthoCam.position.copy(userPerspCam.position);
    userOrthoCam.lookAt(0, 0.85, 0);

    const renderCam = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
    renderCam.position.set(3.8, 2.75, 4.65);
    renderCam.lookAt(0, 0.92, 0);

    // OrbitControls attached to User Perspective camera
    const controls = new OrbitControls(userPerspCam, renderer.domElement);
    controls.target.set(0, 0.85, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxDistance = 35;
    controls.minDistance = 1.2;
    orbitControlsRef.current = controls;

    controls.addEventListener('start', () => {
      cameraPresetTargetRef.current.active = false;
    });

    // 4. Balanced 3-Point Studio Lighting Rig + Hemisphere Fill
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x27272a, 0.65);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.2);
    keyLight.position.set(5.5, 9.5, 6.2);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = isSoftwareGl ? 512 : 1024;
    keyLight.shadow.mapSize.height = isSoftwareGl ? 512 : 1024;
    const d = 6.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 28;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    keyLight.shadow.radius = 2.5;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 1.05);
    rimLight.position.set(-6, 5, -5.5);
    scene.add(rimLight);

    // 5. Ground Shadow Receiver & Radial Contact Shadow Plane
    const shadowFloorGeo = new THREE.PlaneGeometry(36, 36);
    shadowFloorGeo.rotateX(-Math.PI / 2);
    const shadowFloorMat = new THREE.ShadowMaterial({
      opacity: 0.55,
      transparent: true,
    });
    const shadowFloorMesh = new THREE.Mesh(shadowFloorGeo, shadowFloorMat);
    shadowFloorMesh.position.y = 0.001;
    shadowFloorMesh.receiveShadow = true;
    scene.add(shadowFloorMesh);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const contactShadowTex = createRadialContactShadowTexture(maxAniso);

    // 6. Blender Grid, X/Z Axis Lines, 3D Cursor, Transform Gizmo
    const { gridGroup, axesGroup } = createBlenderFloorGridAndAxes();
    scene.add(gridGroup);
    scene.add(axesGroup);

    const cursor3DSprite = createBlender3DCursor();
    scene.add(cursor3DSprite);

    const transformGizmo = createInteractiveTransformGizmo();
    scene.add(transformGizmo);

    // 7. Dynamic Layer Object Pool
    const layersRoot = new THREE.Group();
    scene.add(layersRoot);

    const layerMeshMap = new Map<
      string,
      {
        signature: string;
        group: THREE.Group;
        contactShadow: THREE.Mesh;
        selectionBox: THREE.BoxHelper;
      }
    >();

    const syncSceneWithState = () => {
      const st = stateRef.current;

      // Update lighting & ground shadow options
      const gs = st.groundShadow;
      const warmColor = new THREE.Color().setHSL(0.09, gs.keyLightWarmth * 0.65, 0.95);
      keyLight.color.copy(warmColor);
      keyLight.intensity = 1.6 + gs.envIntensity * 0.65;
      keyLight.shadow.radius = gs.blur;

      const bgLum = 0.14 + gs.floorTone * 0.35;
      scene.background = new THREE.Color().setRGB(bgLum, bgLum, bgLum + 0.01);
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.copy(scene.background);
      }

      const usePCF =
        gs.enabled && (gs.shadowType === 'pcf_soft' || gs.shadowType === 'both');
      const useContact =
        gs.enabled && (gs.shadowType === 'contact_radial' || gs.shadowType === 'both');

      shadowFloorMesh.visible = usePCF;
      shadowFloorMat.opacity = gs.opacity * 0.78;

      gridGroup.visible = gs.showGrid;
      axesGroup.visible = gs.showAxes;
      cursor3DSprite.visible = gs.show3DCursor;
      cursor3DSprite.position.set(
        st.cursor3DPosition[0],
        st.cursor3DPosition[1],
        st.cursor3DPosition[2]
      );

      // Remove deleted layers
      const activeIds = new Set(st.layers.map((l) => l.id));
      for (const [id, entry] of layerMeshMap.entries()) {
        if (!activeIds.has(id)) {
          layersRoot.remove(entry.group);
          layersRoot.remove(entry.contactShadow);
          layersRoot.remove(entry.selectionBox);
          layerMeshMap.delete(id);
        }
      }

      // Create or update active layers
      for (const layer of st.layers) {
        const sig = JSON.stringify({
          type: layer.type,
          mat: layer.materialConfig,
          txt: layer.textConfig,
        });

        let entry = layerMeshMap.get(layer.id);
        if (!entry || entry.signature !== sig) {
          if (entry) {
            layersRoot.remove(entry.group);
            layersRoot.remove(entry.contactShadow);
            layersRoot.remove(entry.selectionBox);
          }

          let builtGroup: THREE.Group;
          if (layer.type === 'text3d' && layer.textConfig) {
            builtGroup = createProceduralText3DGroup(
              layer.textConfig,
              layer.materialConfig
            );
          } else if (layer.type === 'kinetic_rings') {
            builtGroup = createKineticRingsAssembly(layer.materialConfig);
          } else if (layer.type === 'pedestal') {
            builtGroup = createStudioPedestalAssembly(layer.materialConfig);
          } else {
            builtGroup = createStudioCubeAssembly(layer.materialConfig);
          }

          builtGroup.userData.layerId = layer.id;
          builtGroup.traverse((child) => {
            child.userData.layerId = layer.id;
          });

          const csPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(2.8, 2.8),
            new THREE.MeshBasicMaterial({
              map: contactShadowTex,
              transparent: true,
              depthWrite: false,
              opacity: gs.opacity * 0.68,
            })
          );
          csPlane.rotation.x = -Math.PI / 2;
          csPlane.position.y = 0.015;

          const boxHelper = new THREE.BoxHelper(builtGroup, 0xed9e21);
          boxHelper.visible = false;

          layersRoot.add(builtGroup);
          layersRoot.add(csPlane);
          layersRoot.add(boxHelper);

          entry = {
            signature: sig,
            group: builtGroup,
            contactShadow: csPlane,
            selectionBox: boxHelper,
          };
          layerMeshMap.set(layer.id, entry);
        }

        // Evaluate keyframed transform at currentFrame
        const evalTrans = evaluateLayerTransformAtFrame(layer, st.currentFrame);
        const inFrameRange =
          st.currentFrame >= layer.inPoint && st.currentFrame <= layer.outPoint;
        const isVisible = layer.visible && inFrameRange && evalTrans.opacity > 0.5;

        entry.group.visible = isVisible;
        entry.group.position.set(
          evalTrans.position[0],
          evalTrans.position[1],
          evalTrans.position[2]
        );
        entry.group.rotation.set(
          THREE.MathUtils.degToRad(evalTrans.rotation[0]),
          THREE.MathUtils.degToRad(evalTrans.rotation[1]),
          THREE.MathUtils.degToRad(evalTrans.rotation[2])
        );
        entry.group.scale.setScalar(evalTrans.scale);

        // Apply per-character 3D Text Animator if text3d layer
        if (layer.type === 'text3d' && layer.textConfig) {
          applyTextAnimatorToGroup(
            entry.group,
            layer.textConfig,
            evalTrans.textEffect,
            st.currentFrame
          );
        }

        // Subtle gimbal sub-rotation for kinetic_rings
        if (layer.type === 'kinetic_rings') {
          const midGimbal = entry.group.getObjectByName('MiddleGimbal');
          const innerGimbal = entry.group.getObjectByName('InnerGimbal');
          const coreCrystal = entry.group.getObjectByName('CoreCrystal');
          const tRad = (st.currentFrame / 30) * 1.4;
          if (midGimbal) midGimbal.rotation.y = tRad;
          if (innerGimbal) innerGimbal.rotation.x = -tRad * 1.3;
          if (coreCrystal) coreCrystal.rotation.y = -tRad * 2;
        }

        // Update radial contact shadow under object
        entry.contactShadow.visible = isVisible && useContact;
        entry.contactShadow.position.set(
          evalTrans.position[0],
          0.015,
          evalTrans.position[2]
        );
        const heightAtten = Math.max(0.2, 1 - Math.max(0, evalTrans.position[1]) * 0.22);
        const csMat = entry.contactShadow.material as THREE.MeshBasicMaterial;
        csMat.opacity = gs.opacity * 0.72 * heightAtten * (evalTrans.opacity / 100);
        entry.contactShadow.scale.setScalar(
          evalTrans.scale * (layer.type === 'text3d' ? 1.55 : 1.05)
        );

        // Selection box & transform gizmo placement
        const isSelected = st.selectedLayerId === layer.id && isVisible;
        entry.selectionBox.visible = isSelected && st.activeTool === 'select';
        if (entry.selectionBox.visible) {
          entry.selectionBox.update();
        }
      }

      // Position Transform Gizmo on selected layer when Move/Rotate/Scale/Transform active
      const selectedEntry = st.selectedLayerId
        ? layerMeshMap.get(st.selectedLayerId)
        : undefined;
      const showGizmo =
        Boolean(selectedEntry && selectedEntry.group.visible) &&
        ['move', 'rotate', 'scale', 'transform'].includes(st.activeTool);
      transformGizmo.visible = showGizmo;
      if (showGizmo && selectedEntry) {
        transformGizmo.position.copy(selectedEntry.group.position);
        if (selectedEntry.group.position.y < 0.2) {
          transformGizmo.position.y += 0.85;
        }
      }
    };

    const applyShadingOverride = (mode: ShadingMode) => {
      layersRoot.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && obj.userData.layerId) {
          const mesh = obj as THREE.Mesh;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            if ('wireframe' in m) {
              (m as THREE.MeshStandardMaterial).wireframe = mode === 'wireframe';
            }
          }
        }
      });
      scene.environment = mode === 'solid' || mode === 'wireframe' ? null : roomEnvTexture;
    };

    // Pre-warm shaders on hardware WebGL
    if (!isSoftwareGl) {
      renderer.compile(scene, userPerspCam);
    }

    // 8. Scissor Dual-Viewport Render Function & Software-WebGL Paced Loop
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function performDualRender() {
      const wsRect = workspaceEl!.getBoundingClientRect();
      if (wsRect.width <= 0 || wsRect.height <= 0) return;

      const needResize =
        renderer.domElement.clientWidth !== Math.round(wsRect.width) ||
        renderer.domElement.clientHeight !== Math.round(wsRect.height);
      if (needResize) {
        renderer.setSize(wsRect.width, wsRect.height, false);
      }

      const dt = Math.min(0.1, clock.getDelta());
      const st = stateRef.current;

      // Configure OrbitControls mouse/touch mapping for Pan toggle
      controls.mouseButtons = {
        LEFT: st.panModeActive ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      controls.touches = {
        ONE: st.panModeActive ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      };

      // Smooth exponential damping for camera orientation gizmo presets
      let cameraAnimating = false;
      if (cameraPresetTargetRef.current.active) {
        const alpha = 1 - Math.exp(-10 * (dt || 0.016));
        userPerspCam.position.lerp(cameraPresetTargetRef.current.pos, alpha);
        controls.target.lerp(cameraPresetTargetRef.current.target, alpha);
        if (
          userPerspCam.position.distanceTo(cameraPresetTargetRef.current.pos) < 0.02
        ) {
          userPerspCam.position.copy(cameraPresetTargetRef.current.pos);
          controls.target.copy(cameraPresetTargetRef.current.target);
          cameraPresetTargetRef.current.active = false;
        } else {
          cameraAnimating = true;
        }
      }

      controls.update();
      syncSceneWithState();

      // Render Pane 1: User Perspective (left or full)
      if (st.viewportLayout !== 'camera' && userPaneRef.current) {
        const uRect = userPaneRef.current.getBoundingClientRect();
        if (uRect.width > 4 && uRect.height > 4) {
          const left = uRect.left - wsRect.left;
          const bottom = wsRect.bottom - uRect.bottom;
          renderer.setViewport(left, bottom, uRect.width, uRect.height);
          renderer.setScissor(left, bottom, uRect.width, uRect.height);

          const aspect = uRect.width / uRect.height;
          let activeUserCam: THREE.Camera = userPerspCam;
          if (st.isUserOrtho) {
            const frustumH = userPerspCam.position.distanceTo(controls.target) * 0.78;
            userOrthoCam.left = (-frustumH * aspect) / 2;
            userOrthoCam.right = (frustumH * aspect) / 2;
            userOrthoCam.top = frustumH / 2;
            userOrthoCam.bottom = -frustumH / 2;
            userOrthoCam.position.copy(userPerspCam.position);
            userOrthoCam.quaternion.copy(userPerspCam.quaternion);
            userOrthoCam.updateProjectionMatrix();
            activeUserCam = userOrthoCam;
          } else {
            userPerspCam.aspect = aspect;
            userPerspCam.updateProjectionMatrix();
          }

          applyShadingOverride(st.userShading);
          renderer.render(scene, activeUserCam);
        }
      }

      // Render Pane 2: Camera Perspective (right or full)
      if (st.viewportLayout !== 'user' && cameraPaneRef.current) {
        const cRect = cameraPaneRef.current.getBoundingClientRect();
        if (cRect.width > 4 && cRect.height > 4) {
          const left = cRect.left - wsRect.left;
          const bottom = wsRect.bottom - cRect.bottom;
          renderer.setViewport(left, bottom, cRect.width, cRect.height);
          renderer.setScissor(left, bottom, cRect.width, cRect.height);

          renderCam.aspect = cRect.width / cRect.height;
          // Adjust FOV slightly for tall 9:16 framing so the hero subject fits inside the golden frame
          const targetAspect = ASPECT_NUMBERS[st.aspectRatio].ratio;
          renderCam.fov = targetAspect < 1 ? 46 : 38;
          renderCam.lookAt(_camTarget);
          renderCam.updateProjectionMatrix();

          // Hide editor gizmo in Camera Perspective so the render preview stays clean
          const prevGizmoVis = transformGizmo.visible;
          transformGizmo.visible = false;
          applyShadingOverride(st.cameraShading);
          renderer.render(scene, renderCam);
          transformGizmo.visible = prevGizmoVis;
        }
      }

      if (cameraAnimating) {
        requestRender();
      }
    }

    function requestRender() {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        renderDirty = false;
        performDualRender();
        const done = () => {
          renderBusy = false;
          if (renderDirty || stateRef.current.isPlaying) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    requestRenderRef.current = requestRender;
    controls.addEventListener('change', requestRender);
    window.addEventListener('resize', requestRender);

    // 9. Pointer Interaction (Raycasting for Layer Selection, Gizmo Dragging, 3D Cursor, Measure)
    const raycaster = new THREE.Raycaster();
    let draggingGizmoAxis: 'x' | 'y' | 'z' | null = null;
    const dragStartWorld = new THREE.Vector3();
    let dragInitialTransform: LayerTransform | null = null;

    const getPaneAndNDC = (clientX: number, clientY: number) => {
      const st = stateRef.current;
      if (st.viewportLayout !== 'camera' && userPaneRef.current) {
        const r = userPaneRef.current.getBoundingClientRect();
        if (
          clientX >= r.left &&
          clientX <= r.right &&
          clientY >= r.top &&
          clientY <= r.bottom
        ) {
          return {
            pane: 'user' as const,
            rect: r,
            cam: st.isUserOrtho ? userOrthoCam : userPerspCam,
            ndcX: ((clientX - r.left) / r.width) * 2 - 1,
            ndcY: -((clientY - r.top) / r.height) * 2 + 1,
          };
        }
      }
      if (st.viewportLayout !== 'user' && cameraPaneRef.current) {
        const r = cameraPaneRef.current.getBoundingClientRect();
        if (
          clientX >= r.left &&
          clientX <= r.right &&
          clientY >= r.top &&
          clientY <= r.bottom
        ) {
          return {
            pane: 'camera' as const,
            rect: r,
            cam: renderCam,
            ndcX: ((clientX - r.left) / r.width) * 2 - 1,
            ndcY: -((clientY - r.top) / r.height) * 2 + 1,
          };
        }
      }
      return null;
    };

    const handlePointerDown = (e: PointerEvent) => {
      const hitInfo = getPaneAndNDC(e.clientX, e.clientY);
      if (!hitInfo) return;
      const st = stateRef.current;

      // Disable OrbitControls if pointer started inside Camera Perspective pane or non-orbit tools
      if (hitInfo.pane === 'camera') {
        controls.enabled = false;
      } else {
        controls.enabled = !['annotate', 'measure'].includes(st.activeTool);
      }

      _vec2.set(hitInfo.ndcX, hitInfo.ndcY);
      raycaster.setFromCamera(_vec2, hitInfo.cam);

      // Tool: Annotate (2D grease-pencil stroke)
      if (st.activeTool === 'annotate') {
        controls.enabled = false;
        const relX = ((e.clientX - hitInfo.rect.left) / hitInfo.rect.width) * 100;
        const relY = ((e.clientY - hitInfo.rect.top) / hitInfo.rect.height) * 100;
        setActiveStroke({
          id: `stroke_${Date.now()}`,
          viewport: hitInfo.pane,
          points: [{ x: relX, y: relY }],
          color: '#38BDF8',
        });
        return;
      }

      // Tool: Measure (3D distance ruler on ground plane)
      if (st.activeTool === 'measure') {
        controls.enabled = false;
        if (raycaster.ray.intersectPlane(_groundPlane, _planeIntersect)) {
          const pt: [number, number, number] = [
            Number(_planeIntersect.x.toFixed(2)),
            0,
            Number(_planeIntersect.z.toFixed(2)),
          ];
          setMeasureSegment({
            id: `meas_${Date.now()}`,
            start: pt,
            end: pt,
          });
        }
        return;
      }

      // Tool: 3D Cursor placement
      if (st.activeTool === 'cursor') {
        const meshes: THREE.Object3D[] = [];
        layersRoot.traverse((o) => {
          if ((o as THREE.Mesh).isMesh && o.userData.layerId) meshes.push(o);
        });
        const hits = raycaster.intersectObjects(meshes, false);
        if (hits.length > 0) {
          const p = hits[0].point;
          st.onUpdateCursor3D([
            Number(p.x.toFixed(2)),
            Number(p.y.toFixed(2)),
            Number(p.z.toFixed(2)),
          ]);
        } else if (raycaster.ray.intersectPlane(_groundPlane, _planeIntersect)) {
          st.onUpdateCursor3D([
            Number(_planeIntersect.x.toFixed(2)),
            0,
            Number(_planeIntersect.z.toFixed(2)),
          ]);
        }
        return;
      }

      // Check Transform Gizmo handles first when Move/Rotate/Scale/Transform is active
      if (
        transformGizmo.visible &&
        ['move', 'rotate', 'scale', 'transform'].includes(st.activeTool)
      ) {
        const gizmoHits = raycaster.intersectObjects(transformGizmo.children, true);
        if (gizmoHits.length > 0) {
          const axis = gizmoHits[0].object.userData.gizmoAxis as
            | 'x'
            | 'y'
            | 'z'
            | undefined;
          const selLayer = st.layers.find((l) => l.id === st.selectedLayerId);
          if (axis && selLayer && !selLayer.locked) {
            draggingGizmoAxis = axis;
            controls.enabled = false;
            dragInitialTransform = evaluateLayerTransformAtFrame(
              selLayer,
              st.currentFrame
            );
            _vec3.copy(hitInfo.cam.position).sub(transformGizmo.position).normalize();
            _dragPlane.setFromNormalAndCoplanarPoint(_vec3, transformGizmo.position);
            raycaster.ray.intersectPlane(_dragPlane, dragStartWorld);
            return;
          }
        }
      }

      // Click-to-select 3D layer
      const selectableMeshes: THREE.Object3D[] = [];
      layersRoot.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.userData.layerId) {
          selectableMeshes.push(o);
        }
      });
      const intersects = raycaster.intersectObjects(selectableMeshes, false);
      if (intersects.length > 0) {
        const hitLayerId = intersects[0].object.userData.layerId as string;
        if (hitLayerId) {
          st.onSelectLayer(hitLayerId);
        }
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const st = stateRef.current;

      // Active grease-pencil annotation stroke
      setActiveStroke((prev) => {
        if (!prev) return null;
        const paneEl =
          prev.viewport === 'user' ? userPaneRef.current : cameraPaneRef.current;
        if (!paneEl) return prev;
        const r = paneEl.getBoundingClientRect();
        const relX = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
        const relY = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
        return {
          ...prev,
          points: [...prev.points, { x: relX, y: relY }],
        };
      });

      // Active Measure tool drag
      if (st.activeTool === 'measure' && e.buttons === 1) {
        const hitInfo = getPaneAndNDC(e.clientX, e.clientY);
        if (hitInfo) {
          _vec2.set(hitInfo.ndcX, hitInfo.ndcY);
          raycaster.setFromCamera(_vec2, hitInfo.cam);
          if (raycaster.ray.intersectPlane(_groundPlane, _planeIntersect)) {
            const endPt: [number, number, number] = [
              Number(_planeIntersect.x.toFixed(2)),
              0,
              Number(_planeIntersect.z.toFixed(2)),
            ];
            setMeasureSegment((prev) => (prev ? { ...prev, end: endPt } : null));
          }
        }
        return;
      }

      // Active 3D Transform Gizmo drag
      if (draggingGizmoAxis && dragInitialTransform && st.selectedLayerId) {
        const hitInfo = getPaneAndNDC(e.clientX, e.clientY);
        if (!hitInfo) return;
        _vec2.set(hitInfo.ndcX, hitInfo.ndcY);
        raycaster.setFromCamera(_vec2, hitInfo.cam);

        if (raycaster.ray.intersectPlane(_dragPlane, _planeIntersect)) {
          const deltaVec = _vec3.copy(_planeIntersect).sub(dragStartWorld);
          const next: LayerTransform = {
            position: [...dragInitialTransform.position] as [number, number, number],
            rotation: [...dragInitialTransform.rotation] as [number, number, number],
            scale: dragInitialTransform.scale,
            opacity: dragInitialTransform.opacity,
            textEffect: dragInitialTransform.textEffect,
          };

          const axisIdx =
            draggingGizmoAxis === 'x' ? 0 : draggingGizmoAxis === 'y' ? 1 : 2;
          const axisDelta =
            draggingGizmoAxis === 'x'
              ? deltaVec.x
              : draggingGizmoAxis === 'y'
              ? deltaVec.y
              : deltaVec.z;

          if (st.activeTool === 'move' || st.activeTool === 'transform') {
            next.position[axisIdx] = Number(
              (dragInitialTransform.position[axisIdx] + axisDelta).toFixed(2)
            );
          } else if (st.activeTool === 'rotate') {
            next.rotation[axisIdx] = Number(
              (dragInitialTransform.rotation[axisIdx] + axisDelta * 65).toFixed(1)
            );
          } else if (st.activeTool === 'scale') {
            next.scale = Number(
              Math.max(0.1, Math.min(5, dragInitialTransform.scale + axisDelta * 0.45)).toFixed(2)
            );
          }

          st.onTransformSelectedLayer(st.selectedLayerId, next, false);
        }
      }
    };

    const handlePointerUp = () => {
      const st = stateRef.current;
      if (draggingGizmoAxis && st.selectedLayerId) {
        const selLayer = st.layers.find((l) => l.id === st.selectedLayerId);
        if (selLayer) {
          const finalTrans = evaluateLayerTransformAtFrame(selLayer, st.currentFrame);
          st.onTransformSelectedLayer(st.selectedLayerId, finalTrans, true);
        }
      }
      draggingGizmoAxis = null;
      dragInitialTransform = null;
      controls.enabled = true;

      setActiveStroke((prev) => {
        if (prev && prev.points.length > 1) {
          setAnnotations((all) => [...all, prev]);
        }
        return null;
      });
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    requestRender();

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      domEl.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('resize', requestRender);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // Align User Perspective camera to X / Y / Z / Isometric preset with smooth damping
  const snapUserCameraAxis = (axis: 'x' | 'y' | 'z' | 'iso') => {
    const dist = 6.8;
    const target = new THREE.Vector3(0, 0.85, 0);
    const pos = new THREE.Vector3();
    if (axis === 'x') pos.set(dist, 0.85, 0.01);
    else if (axis === 'y') pos.set(0.01, 0.85, dist);
    else if (axis === 'z') pos.set(0.01, dist + 0.85, 0.01);
    else pos.set(4.5, 3.3, 5.1);

    cameraPresetTargetRef.current = {
      active: true,
      pos,
      target,
    };
    requestRenderRef.current?.();
  };

  const zoomUserCamera = (factor: number) => {
    const controls = orbitControlsRef.current;
    if (!controls) return;
    const cam = controls.object as THREE.PerspectiveCamera;
    const dir = new THREE.Vector3().subVectors(cam.position, controls.target);
    dir.multiplyScalar(factor);
    if (dir.length() > 1.5 && dir.length() < 30) {
      cam.position.copy(controls.target).add(dir);
      requestRenderRef.current?.();
    }
  };

  const selectedLayer = layers.find((l) => l.id === selectedLayerId);

  // Measure distance calculation
  const measuredDistance = measureSegment
    ? Math.hypot(
        measureSegment.end[0] - measureSegment.start[0],
        measureSegment.end[1] - measureSegment.start[1],
        measureSegment.end[2] - measureSegment.start[2]
      ).toFixed(2)
    : null;

  // Render the left tool strip matching the exact 9 Blender tools in the user's screenshot
  const renderBlenderToolStrip = (pane: 'user' | 'camera') => {
    const tools: {
      id: ViewportTool;
      label: string;
      shortcut: string;
      icon: React.ReactNode;
      accent?: string;
    }[] = [
      { id: 'select', label: 'Select Box', shortcut: 'W', icon: <Box className="w-4 h-4" /> },
      { id: 'cursor', label: '3D Cursor', shortcut: 'C', icon: <Crosshair className="w-4 h-4 text-red-400" /> },
      { id: 'move', label: 'Move', shortcut: 'G', icon: <Move className="w-4 h-4" /> },
      { id: 'rotate', label: 'Rotate', shortcut: 'R', icon: <RotateCw className="w-4 h-4" /> },
      { id: 'scale', label: 'Scale', shortcut: 'S', icon: <Scaling className="w-4 h-4" /> },
      { id: 'transform', label: 'Transform', shortcut: 'T', icon: <Maximize2 className="w-4 h-4" /> },
      { id: 'annotate', label: 'Annotate', shortcut: 'D', icon: <PenTool className="w-4 h-4 text-sky-400" /> },
      { id: 'measure', label: 'Measure', shortcut: 'M', icon: <Ruler className="w-4 h-4 text-emerald-400" /> },
    ];

    return (
      <div className="absolute left-2.5 top-11 z-20 flex flex-col gap-1 pointer-events-auto">
        {tools.map((t) => {
          const active = activeTool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTool(t.id)}
              title={`${t.label} (${t.shortcut})`}
              className={`w-8 h-8 md:w-9 md:h-9 rounded flex items-center justify-center border transition-colors ${
                active
                  ? 'bg-[#4772B3] border-[#6090D8] text-white shadow-sm'
                  : 'bg-[#282828]/90 border-[#3A3A3A] text-neutral-300 hover:bg-[#353535] hover:text-white'
              }`}
            >
              {t.icon}
            </button>
          );
        })}

        {/* Bottom Add Object / 3D Text Button matching the green wireframe cube in reference */}
        <div className="relative mt-0.5">
          <button
            type="button"
            onClick={() => setShowAddMenu((prev) => (prev === pane ? null : pane))}
            title="Add 3D Object or Extruded Text Layer"
            className={`w-8 h-8 md:w-9 md:h-9 rounded flex items-center justify-center border transition-colors ${
              showAddMenu === pane
                ? 'bg-emerald-600 border-emerald-400 text-white'
                : 'bg-[#282828]/90 border-[#3A3A3A] text-emerald-400 hover:bg-[#353535]'
            }`}
          >
            <PlusSquare className="w-4 h-4" />
          </button>

          {showAddMenu === pane && (
            <div className="absolute left-11 bottom-0 w-48 bg-[#252526] border border-[#424245] rounded-md shadow-xl p-1.5 z-40 flex flex-col gap-1">
              <div className="px-2 py-1 text-[11px] font-medium text-neutral-400 border-b border-white/10">
                Add Layer at 3D Cursor
              </div>
              <button
                type="button"
                onClick={() => {
                  onAddLayerAtCursor('text3d');
                  setShowAddMenu(null);
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-left text-amber-300 hover:bg-[#37373D] rounded transition-colors whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>3D Extruded Text</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddLayerAtCursor('cube_assembly');
                  setShowAddMenu(null);
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-left text-neutral-200 hover:bg-[#37373D] rounded transition-colors whitespace-nowrap"
              >
                <Box className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                <span>Studio Cube Assembly</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddLayerAtCursor('kinetic_rings');
                  setShowAddMenu(null);
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-left text-neutral-200 hover:bg-[#37373D] rounded transition-colors whitespace-nowrap"
              >
                <RotateCw className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                <span>Kinetic Gyro Rings</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddLayerAtCursor('pedestal');
                  setShowAddMenu(null);
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-left text-neutral-200 hover:bg-[#37373D] rounded transition-colors whitespace-nowrap"
              >
                <Grid className="w-3.5 h-3.5 shrink-0 text-purple-400" />
                <span>Stage Pedestal</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render shading mode selector spheres matching the top-left of Blender's viewport header
  const renderShadingHeader = (
    activeMode: ShadingMode,
    onChange: (mode: ShadingMode) => void,
    pane: 'user' | 'camera'
  ) => {
    const modes: { id: ShadingMode; label: string; style: string }[] = [
      {
        id: 'wireframe',
        label: 'Wireframe Shading',
        style: 'border border-neutral-300 bg-transparent',
      },
      {
        id: 'solid',
        label: 'Solid Studio Shading',
        style: 'bg-neutral-300 border border-neutral-200',
      },
      {
        id: 'material',
        label: 'Material Preview',
        style: 'bg-gradient-to-tr from-neutral-600 via-neutral-200 to-amber-300 border border-neutral-300',
      },
      {
        id: 'rendered',
        label: 'Rendered PBR & Shadows',
        style: 'bg-gradient-to-br from-amber-300 via-blue-400 to-neutral-900 border border-amber-300',
      },
    ];

    return (
      <div className="flex items-center justify-between px-2.5 py-1 bg-[#282828]/90 border-b border-[#1A1A1A] z-20 pointer-events-auto">
        <div className="flex items-center gap-1.5">
          {/* Shading spheres cluster */}
          <div className="flex items-center bg-[#1F1F1F] p-0.5 rounded border border-[#3A3A3A]">
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onChange(m.id)}
                title={m.label}
                className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                  activeMode === m.id ? 'bg-[#4772B3]' : 'hover:bg-[#323232]'
                }`}
              >
                <span className={`w-3 h-3 rounded-full ${m.style}`} />
              </button>
            ))}
          </div>

          <span className="text-[11px] text-neutral-400 hidden sm:inline">
            {pane === 'user' ? 'Viewport Shading' : `Frame ${ASPECT_NUMBERS[aspectRatio].resLabel}`}
          </span>
        </div>

        {/* Options dropdown button matching top-right of Left Viewport in reference */}
        {pane === 'user' ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowUserOptions((v) => !v)}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] bg-[#1F1F1F] hover:bg-[#343434] text-neutral-200 rounded border border-[#3E3E3E] transition-colors whitespace-nowrap"
            >
              <span>Options</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {showUserOptions && (
              <div className="absolute right-0 mt-1 w-48 bg-[#252526] border border-[#424245] rounded-md shadow-xl p-2 z-40 flex flex-col gap-1.5 text-xs">
                <label className="flex items-center justify-between text-neutral-200 cursor-pointer">
                  <span>Floor Grid</span>
                  <input
                    type="checkbox"
                    checked={groundShadow.showGrid}
                    onChange={(e) => onUpdateGroundShadow({ showGrid: e.target.checked })}
                    className="accent-[#4772B3]"
                  />
                </label>
                <label className="flex items-center justify-between text-neutral-200 cursor-pointer">
                  <span>X / Y Axis Lines</span>
                  <input
                    type="checkbox"
                    checked={groundShadow.showAxes}
                    onChange={(e) => onUpdateGroundShadow({ showAxes: e.target.checked })}
                    className="accent-[#4772B3]"
                  />
                </label>
                <label className="flex items-center justify-between text-neutral-200 cursor-pointer">
                  <span>3D Cursor</span>
                  <input
                    type="checkbox"
                    checked={groundShadow.show3DCursor}
                    onChange={(e) =>
                      onUpdateGroundShadow({ show3DCursor: e.target.checked })
                    }
                    className="accent-[#4772B3]"
                  />
                </label>
                <label className="flex items-center justify-between text-neutral-200 cursor-pointer">
                  <span>Ground Shadows</span>
                  <input
                    type="checkbox"
                    checked={groundShadow.enabled}
                    onChange={(e) => onUpdateGroundShadow({ enabled: e.target.checked })}
                    className="accent-[#4772B3]"
                  />
                </label>
                {(annotations.length > 0 || measureSegment) && (
                  <button
                    type="button"
                    onClick={() => {
                      setAnnotations([]);
                      setMeasureSegment(null);
                    }}
                    className="mt-1 flex items-center justify-center gap-1 py-1 px-2 bg-red-950/60 hover:bg-red-900/70 text-red-200 rounded border border-red-800/50 text-[11px]"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear Notes & Rulers</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[11px] text-amber-400/90 font-mono-tabular">
            <span>Ratio {aspectRatio}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={workspaceRef}
      className="relative flex-1 w-full h-full overflow-hidden bg-[#181818] select-none"
    >
      {/* Shared WebGL Canvas Container */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full z-0"
      />

      {/* Semantic Dual Viewport Overlay Grid */}
      <div className="relative z-10 w-full h-full flex pointer-events-none">
        {/* LEFT PANE: USER PERSPECTIVE */}
        {viewportLayout !== 'camera' && (
          <div
            ref={userPaneRef}
            className={`relative h-full flex flex-col justify-between ${
              viewportLayout === 'dual'
                ? 'w-1/2 border-r-2 border-[#141414]'
                : 'w-full'
            }`}
          >
            {renderShadingHeader(userShading, onChangeUserShading, 'user')}

            {/* Top-Left Blender Viewport Labels matching reference image */}
            <div className="absolute left-14 top-11 z-10 pointer-events-none flex flex-col gap-0.5 text-xs drop-shadow">
              <div className="font-medium text-neutral-100">
                User {isUserOrtho ? 'Orthographic' : 'Perspective'}
              </div>
              <div className="text-[11px] text-neutral-300 font-mono-tabular">
                ({ currentFrame }) Collection | {selectedLayer ? selectedLayer.name.split(' ')[0] : 'Camera'}
              </div>
              {measuredDistance && (
                <div className="mt-1 text-[11px] text-emerald-300 font-mono-tabular">
                  Measure: {measuredDistance} m
                </div>
              )}
            </div>

            {/* Left Tool Strip */}
            {renderBlenderToolStrip('user')}

            {/* Top-Right Interactive XYZ Orientation Gizmo & 4 Circular Nav Buttons matching reference */}
            <div className="absolute right-3 top-11 z-20 flex flex-col items-center gap-2.5 pointer-events-auto">
              {/* Interactive XYZ Axis Ball Widget */}
              <div
                className="relative w-16 h-16 rounded-full bg-[#242424]/75 border border-white/10 flex items-center justify-center shadow-md"
                title="Click X, Y, or Z to align User Camera"
              >
                {/* Axis lines */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 64 64">
                  <line x1="32" y1="32" x2="32" y2="12" stroke="#2F80ED" strokeWidth="2.2" />
                  <line x1="32" y1="32" x2="50" y2="40" stroke="#E03C31" strokeWidth="2.2" />
                  <line x1="32" y1="32" x2="15" y2="22" stroke="#6BBF23" strokeWidth="2.2" />
                </svg>

                {/* Z Top Ball (Blue) */}
                <button
                  type="button"
                  onClick={() => snapUserCameraAxis('z')}
                  className="absolute top-1.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-[#2F80ED] text-[10px] font-bold text-white flex items-center justify-center hover:scale-110 transition-transform"
                  title="Top View (Z Axis)"
                >
                  Z
                </button>
                {/* X Right Ball (Red) */}
                <button
                  type="button"
                  onClick={() => snapUserCameraAxis('x')}
                  className="absolute bottom-2.5 right-1.5 w-5 h-5 rounded-full bg-[#E03C31] text-[10px] font-bold text-white flex items-center justify-center hover:scale-110 transition-transform"
                  title="Side View (X Axis)"
                >
                  X
                </button>
                {/* Y Left Ball (Green) */}
                <button
                  type="button"
                  onClick={() => snapUserCameraAxis('y')}
                  className="absolute top-3 left-1.5 w-5 h-5 rounded-full bg-[#6BBF23] text-[10px] font-bold text-neutral-950 flex items-center justify-center hover:scale-110 transition-transform"
                  title="Front View (Y Axis)"
                >
                  Y
                </button>
                {/* Isometric Reset Center */}
                <button
                  type="button"
                  onClick={() => snapUserCameraAxis('iso')}
                  className="w-3 h-3 rounded-full bg-neutral-300/80 hover:bg-white transition-colors"
                  title="Reset User Perspective"
                />
              </div>

              {/* 4 Circular Navigation Buttons below Gizmo matching reference */}
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => zoomUserCamera(0.82)}
                  title="Zoom In Viewport"
                  className="w-7 h-7 rounded-full bg-[#262626]/90 hover:bg-[#383838] border border-white/10 text-neutral-200 flex items-center justify-center transition-colors"
                >
                  <Search className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPanModeActive((v) => !v)}
                  title="Toggle Pan Camera Mode"
                  className={`w-7 h-7 rounded-full border flex items-center justify-center transition-colors ${
                    panModeActive
                      ? 'bg-[#4772B3] border-[#6090D8] text-white'
                      : 'bg-[#262626]/90 hover:bg-[#383838] border-white/10 text-neutral-200'
                  }`}
                >
                  <Hand className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => snapUserCameraAxis('iso')}
                  title="Align User View to Default Studio Angle"
                  className="w-7 h-7 rounded-full bg-[#262626]/90 hover:bg-[#383838] border border-white/10 text-neutral-200 flex items-center justify-center transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsUserOrtho((v) => !v)}
                  title="Switch Perspective / Orthographic Projection"
                  className={`w-7 h-7 rounded-full border flex items-center justify-center transition-colors ${
                    isUserOrtho
                      ? 'bg-[#4772B3] border-[#6090D8] text-white'
                      : 'bg-[#262626]/90 hover:bg-[#383838] border-white/10 text-neutral-200'
                  }`}
                >
                  <Grid className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Grease Pencil SVG Overlay for User Viewport */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
              {annotations
                .filter((a) => a.viewport === 'user')
                .map((stroke) => (
                  <polyline
                    key={stroke.id}
                    fill="none"
                    stroke={stroke.color}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={stroke.points.map((p) => `${p.x}%,${p.y}%`).join(' ')}
                  />
                ))}
              {activeStroke?.viewport === 'user' && (
                <polyline
                  fill="none"
                  stroke={activeStroke.color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={activeStroke.points.map((p) => `${p.x}%,${p.y}%`).join(' ')}
                />
              )}
            </svg>
          </div>
        )}

        {/* RIGHT PANE: CAMERA PERSPECTIVE */}
        {viewportLayout !== 'user' && (
          <div
            ref={cameraPaneRef}
            className={`relative h-full flex flex-col justify-between ${
              viewportLayout === 'dual' ? 'w-1/2' : 'w-full'
            }`}
          >
            {renderShadingHeader(cameraShading, onChangeCameraShading, 'camera')}

            {/* Top-Left Blender Camera Perspective Labels matching reference image */}
            <div className="absolute left-14 top-11 z-20 pointer-events-none flex flex-col gap-0.5 text-xs drop-shadow">
              <div className="font-medium text-neutral-100">Camera Perspective</div>
              <div className="text-[11px] text-neutral-300 font-mono-tabular">
                ({currentFrame}) Collection | Camera
              </div>
            </div>

            {/* Left Tool Strip in Camera Perspective (matches reference screenshot!) */}
            {renderBlenderToolStrip('camera')}

            {/* Golden Aspect-Ratio Camera Crop Frame & Passepartout Mask */}
            <div className="relative flex-1 flex items-center justify-center overflow-hidden pointer-events-none pl-10 pr-2 py-4">
              <div
                style={{
                  width: `${cameraCropRect.width}px`,
                  height: `${cameraCropRect.height}px`,
                  boxShadow: `0 0 0 9999px rgba(14, 14, 14, ${groundShadow.passepartout})`,
                }}
                className="relative border border-[#E5A00D]/90 transition-all duration-150"
              >
                {/* Dotted inner Blender camera border accent */}
                <div className="absolute inset-0 border border-dashed border-[#423212]/60" />

                {/* Optional Rule-of-Thirds Safe Guides */}
                {groundShadow.showCameraGuides && (
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-25">
                    <div className="border-r border-b border-amber-200/50" />
                    <div className="border-r border-b border-amber-200/50" />
                    <div className="border-b border-amber-200/50" />
                    <div className="border-r border-b border-amber-200/50" />
                    <div className="border-r border-b border-amber-200/50" />
                    <div className="border-b border-amber-200/50" />
                    <div className="border-r border-amber-200/50" />
                    <div className="border-r border-amber-200/50" />
                    <div />
                  </div>
                )}

                {/* Aspect ratio & resolution label at bottom-right of camera crop frame */}
                <div className="absolute -bottom-5 right-0 text-[10px] font-mono-tabular text-amber-400/90">
                  {ASPECT_NUMBERS[aspectRatio].resLabel}
                </div>
              </div>
            </div>

            {/* Grease Pencil SVG Overlay for Camera Viewport */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
              {annotations
                .filter((a) => a.viewport === 'camera')
                .map((stroke) => (
                  <polyline
                    key={stroke.id}
                    fill="none"
                    stroke={stroke.color}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={stroke.points.map((p) => `${p.x}%,${p.y}%`).join(' ')}
                  />
                ))}
              {activeStroke?.viewport === 'camera' && (
                <polyline
                  fill="none"
                  stroke={activeStroke.color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={activeStroke.points.map((p) => `${p.x}%,${p.y}%`).join(' ')}
                />
              )}
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};
