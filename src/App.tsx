/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  AnimatableProperty,
  AspectRatioPreset,
  EasingType,
  GroundShadowConfig,
  LayerMaterialConfig,
  LayerTransform,
  LayerType,
  StudioProjectState,
  Text3DConfig,
  TimelineState,
  ViewportLayoutMode,
  ViewportTool,
} from './types/studio';
import {
  createInitialStudioState,
  evaluateLayerTransformAtFrame,
  getBasePropertyValue,
  removeKeyframeFromLayer,
  setBasePropertyValue,
  upsertKeyframeInLayer,
} from './engine/keyframeEvaluator';
import { DualViewportCanvas } from './components/DualViewportCanvas';
import { InspectorDrawer } from './components/InspectorDrawer';
import { AETimelinePanel } from './components/AETimelinePanel';
import { exportStandaloneOfflineHTML } from './utils/offlineExporter';
import {
  Columns,
  Download,
  Eye,
  Film,
  Maximize,
  Monitor,
  RotateCcw,
  Smartphone,
  Square,
  Sun,
} from 'lucide-react';

const LAYER_COLORS = ['#4772B3', '#E5A00D', '#10B981', '#EC4899', '#8B5CF6', '#06B6D4'];

export default function App() {
  const [studio, setStudio] = useState<StudioProjectState>(() =>
    createInitialStudioState()
  );
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [showRefModal, setShowRefModal] = useState(false);

  // Timeline playback animation loop
  useEffect(() => {
    if (!studio.timeline.isPlaying) return;
    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      setStudio((prev) => {
        if (!prev.timeline.isPlaying) return prev;
        const deltaFrames = dt * prev.timeline.fps * prev.timeline.playDirection;
        let nextFrame = prev.timeline.currentFrame + deltaFrames;

        if (nextFrame > prev.timeline.endFrame) {
          if (prev.timeline.loop) {
            nextFrame = prev.timeline.startFrame;
          } else {
            return {
              ...prev,
              timeline: {
                ...prev.timeline,
                currentFrame: prev.timeline.endFrame,
                isPlaying: false,
              },
            };
          }
        } else if (nextFrame < prev.timeline.startFrame) {
          if (prev.timeline.loop) {
            nextFrame = prev.timeline.endFrame;
          } else {
            return {
              ...prev,
              timeline: {
                ...prev.timeline,
                currentFrame: prev.timeline.startFrame,
                isPlaying: false,
              },
            };
          }
        }

        return {
          ...prev,
          timeline: {
            ...prev.timeline,
            currentFrame: nextFrame,
          },
        };
      });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [studio.timeline.isPlaying, studio.timeline.fps, studio.timeline.playDirection]);

  // Global Studio Keyboard Shortcuts (Space: Play/Pause, W/G/R/S: Tools, I: Keyframe)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        setStudio((prev) => ({
          ...prev,
          timeline: {
            ...prev.timeline,
            isPlaying: !prev.timeline.isPlaying,
          },
        }));
      } else if (e.key.toLowerCase() === 'w') {
        setStudio((prev) => ({ ...prev, activeTool: 'select' }));
      } else if (e.key.toLowerCase() === 'g') {
        setStudio((prev) => ({ ...prev, activeTool: 'move' }));
      } else if (e.key.toLowerCase() === 'r') {
        setStudio((prev) => ({ ...prev, activeTool: 'rotate' }));
      } else if (e.key.toLowerCase() === 's') {
        setStudio((prev) => ({ ...prev, activeTool: 'scale' }));
      } else if (e.key.toLowerCase() === 'i') {
        setStudio((prev) => {
          if (!prev.selectedLayerId) return prev;
          return {
            ...prev,
            layers: prev.layers.map((layer) => {
              if (layer.id !== prev.selectedLayerId) return layer;
              const evalTr = evaluateLayerTransformAtFrame(
                layer,
                prev.timeline.currentFrame
              );
              let updated = upsertKeyframeInLayer(
                layer,
                'position.y',
                prev.timeline.currentFrame,
                evalTr.position[1]
              );
              updated = upsertKeyframeInLayer(
                updated,
                'rotation.y',
                prev.timeline.currentFrame,
                evalTr.rotation[1]
              );
              return updated;
            }),
          };
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSelectLayer = useCallback((id: string | null) => {
    setStudio((prev) => ({ ...prev, selectedLayerId: id }));
  }, []);

  const handleSelectTool = useCallback((tool: ViewportTool) => {
    setStudio((prev) => ({ ...prev, activeTool: tool }));
  }, []);

  const handleUpdateCursor3D = useCallback((pos: [number, number, number]) => {
    setStudio((prev) => ({ ...prev, cursor3DPosition: pos }));
  }, []);

  const handleUpdateGroundShadow = useCallback(
    (partial: Partial<GroundShadowConfig>) => {
      setStudio((prev) => ({
        ...prev,
        groundShadow: { ...prev.groundShadow, ...partial },
      }));
    },
    []
  );

  const handleUpdateTimelineState = useCallback(
    (partial: Partial<TimelineState>) => {
      setStudio((prev) => ({
        ...prev,
        timeline: { ...prev.timeline, ...partial },
      }));
    },
    []
  );

  const handleSetCurrentFrame = useCallback((frame: number) => {
    setStudio((prev) => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        currentFrame: Math.max(
          prev.timeline.startFrame,
          Math.min(prev.timeline.endFrame, frame)
        ),
      },
    }));
  }, []);

  const handleTransformSelectedLayer = useCallback(
    (layerId: string, nextTransform: LayerTransform, recordKeyframe: boolean) => {
      setStudio((prev) => {
        const frame = Math.round(prev.timeline.currentFrame);
        return {
          ...prev,
          layers: prev.layers.map((layer) => {
            if (layer.id !== layerId) return layer;
            let updated: typeof layer = {
              ...layer,
              baseTransform: nextTransform,
            };

            const shouldKey = prev.timeline.autoKey || recordKeyframe;
            if (shouldKey) {
              const propsToCheck: AnimatableProperty[] = [
                'position.x',
                'position.y',
                'position.z',
                'rotation.x',
                'rotation.y',
                'rotation.z',
                'scale',
              ];
              for (const p of propsToCheck) {
                const track = updated.tracks[p];
                if (track && track.length > 0) {
                  updated = upsertKeyframeInLayer(
                    updated,
                    p,
                    frame,
                    getBasePropertyValue(nextTransform, p)
                  );
                }
              }
            }
            return updated;
          }),
        };
      });
    },
    []
  );

  const handlePropertyScrub = useCallback(
    (layerId: string, prop: AnimatableProperty, value: number) => {
      setStudio((prev) => {
        const frame = Math.round(prev.timeline.currentFrame);
        return {
          ...prev,
          layers: prev.layers.map((layer) => {
            if (layer.id !== layerId) return layer;
            const nextBase = setBasePropertyValue(layer.baseTransform, prop, value);
            const hasTrack = (layer.tracks[prop]?.length || 0) > 0;
            if (hasTrack || prev.timeline.autoKey) {
              return upsertKeyframeInLayer(layer, prop, frame, value);
            }
            return {
              ...layer,
              baseTransform: nextBase,
            };
          }),
        };
      });
    },
    []
  );

  const handleToggleKeyframeAtCurrent = useCallback(
    (layerId: string, prop: AnimatableProperty) => {
      setStudio((prev) => {
        const frame = Math.round(prev.timeline.currentFrame);
        return {
          ...prev,
          layers: prev.layers.map((layer) => {
            if (layer.id !== layerId) return layer;
            const track = layer.tracks[prop] || [];
            const exists = track.some((k) => k.frame === frame);
            if (exists) {
              return removeKeyframeFromLayer(layer, prop, frame);
            }
            const evalTr = evaluateLayerTransformAtFrame(layer, frame);
            const val = getBasePropertyValue(evalTr, prop);
            return upsertKeyframeInLayer(layer, prop, frame, val);
          }),
        };
      });
    },
    []
  );

  const handleChangeTrackEasing = useCallback(
    (layerId: string, prop: AnimatableProperty, easing: EasingType) => {
      setStudio((prev) => ({
        ...prev,
        layers: prev.layers.map((layer) => {
          if (layer.id !== layerId) return layer;
          return {
            ...layer,
            tracks: {
              ...layer.tracks,
              [prop]: (layer.tracks[prop] || []).map((k) => ({ ...k, easing })),
            },
          };
        }),
      }));
    },
    []
  );

  const handleAddLayer = useCallback((type: LayerType) => {
    setStudio((prev) => {
      const idx = prev.layers.length + 1;
      const newId = `layer_${type}_${Date.now()}`;
      const colorTag = LAYER_COLORS[idx % LAYER_COLORS.length];
      const spawnPos: [number, number, number] = [
        prev.cursor3DPosition[0],
        type === 'text3d' ? Math.max(1.2, prev.cursor3DPosition[1] + 0.6) : 0,
        prev.cursor3DPosition[2],
      ];

      const nameMap: Record<LayerType, string> = {
        text3d: `3D Text.00${idx}`,
        cube_assembly: `Cube.00${idx}`,
        kinetic_rings: `Gyro.00${idx}`,
        pedestal: `Pedestal.00${idx}`,
      };

      const newLayer = {
        id: newId,
        name: nameMap[type],
        type,
        colorTag,
        visible: true,
        locked: false,
        expanded: true,
        inPoint: 1,
        outPoint: prev.timeline.endFrame,
        baseTransform: {
          position: spawnPos,
          rotation: [0, 0, 0] as [number, number, number],
          scale: 1,
          opacity: 100,
          textEffect: type === 'text3d' ? 60 : 0,
        },
        materialConfig: {
          color: type === 'text3d' ? '#FBBF24' : '#D1D5DB',
          accentColor: '#3B82F6',
          metalness: 0.45,
          roughness: 0.28,
          clearcoat: 0.6,
        },
        textConfig:
          type === 'text3d'
            ? {
                content: 'MOTION',
                size: 0.65,
                depth: 0.2,
                bevelThickness: 0.03,
                letterSpacing: 0.14,
                effectType: 'wave' as const,
                effectAmplitude: 0.35,
                effectFrequency: 2.0,
              }
            : undefined,
        tracks: {
          'position.x': [],
          'position.y': [],
          'position.z': [],
          'rotation.x': [],
          'rotation.y': [
            { id: `kf_${Date.now()}_1`, frame: 1, value: 0, easing: 'easeInOut' as const },
            {
              id: `kf_${Date.now()}_2`,
              frame: prev.timeline.endFrame,
              value: 360,
              easing: 'easeInOut' as const,
            },
          ],
          'rotation.z': [],
          scale: [],
          opacity: [],
          textEffect:
            type === 'text3d'
              ? [
                  {
                    id: `kf_te_${Date.now()}_1`,
                    frame: 1,
                    value: 30,
                    easing: 'easeInOut' as const,
                  },
                  {
                    id: `kf_te_${Date.now()}_2`,
                    frame: 120,
                    value: 100,
                    easing: 'spring' as const,
                  },
                ]
              : [],
        },
      };

      return {
        ...prev,
        selectedLayerId: newId,
        layers: [newLayer, ...prev.layers],
      };
    });
  }, []);

  const handleDuplicateLayer = useCallback((id: string) => {
    setStudio((prev) => {
      const target = prev.layers.find((l) => l.id === id);
      if (!target) return prev;
      const copyId = `${target.id}_copy_${Date.now().toString(36).slice(-4)}`;
      const copyLayer = {
        ... JSON.parse(JSON.stringify(target)),
        id: copyId,
        name: `${target.name} Copy`,
        baseTransform: {
          ...target.baseTransform,
          position: [
            target.baseTransform.position[0] + 0.6,
            target.baseTransform.position[1],
            target.baseTransform.position[2] + 0.4,
          ] as [number, number, number],
        },
      };
      return {
        ...prev,
        selectedLayerId: copyId,
        layers: [copyLayer, ...prev.layers],
      };
    });
  }, []);

  const handleDeleteLayer = useCallback((id: string) => {
    setStudio((prev) => {
      if (prev.layers.length <= 1) return prev;
      const remaining = prev.layers.filter((l) => l.id !== id);
      return {
        ...prev,
        selectedLayerId:
          prev.selectedLayerId === id ? remaining[0]?.id || null : prev.selectedLayerId,
        layers: remaining,
      };
    });
  }, []);

  const handleExportStandaloneHTML = () => {
    exportStandaloneOfflineHTML(studio);
    setExportToast(
      'Exported kinetix3d-offline-studio.html (Includes Three.js WebGL Engine + Current Layers & Keyframes)'
    );
    setTimeout(() => setExportToast(null), 4500);
  };

  const selectedLayer = studio.layers.find((l) => l.id === studio.selectedLayerId);

  return (
    <div className="w-screen h-screen flex flex-col bg-[#181818] text-neutral-100 overflow-hidden">
      {/* 1. TOP BAR CONTRACT: 3 Zones separated by gap-8 */}
      <header className="h-11 flex items-center justify-between gap-8 px-4 bg-[#202023] border-b border-[#121214] shrink-0">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#studio"
          onClick={(e) => e.preventDefault()}
          className="text-sm md:text-base font-display font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          Kinetix3D Studio
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-neutral-300">
          <a
            href="#layout"
            onClick={(e) => {
              e.preventDefault();
              setStudio((prev) => ({ ...prev, viewportLayout: 'dual' }));
            }}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Dual Workspace
          </a>
          <a
            href="#typography"
            onClick={(e) => {
              e.preventDefault();
              const textLayer = studio.layers.find((l) => l.type === 'text3d');
              if (textLayer) {
                setStudio((prev) => ({ ...prev, selectedLayerId: textLayer.id }));
              } else {
                handleAddLayer('text3d');
              }
            }}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            3D Typography
          </a>
          <a
            href="#reference"
            onClick={(e) => {
              e.preventDefault();
              setShowRefModal((v) => !v);
            }}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Reference View
          </a>
          <a
            href="#reset"
            onClick={(e) => {
              e.preventDefault();
              setStudio(createInitialStudioState());
            }}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Reset Scene
          </a>
        </nav>

        {/* Zone 3: 1 Primary Action Button */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleExportStandaloneHTML}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#4772B3] hover:bg-[#5683C7] rounded-md shadow-sm transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Offline HTML</span>
          </button>
        </div>
      </header>

      {/* 2. WORKSPACE SUB-TOOLBAR: Viewport Split Switcher, Aspect Ratio Selector (1:1, 9:16, 16:9), & Quick Ground Shadow Toggle */}
      <div className="h-9 bg-[#252528] border-b border-[#161618] px-3 flex items-center justify-between gap-2 overflow-x-auto shrink-0 text-xs">
        {/* Left: Viewport Mode Toggle (Fits Tablet & Desktop) */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[11px] text-neutral-400 mr-1 hidden sm:inline">
            Viewport:
          </span>
          {(
            [
              {
                id: 'dual',
                label: 'Dual Split',
                icon: <Columns className="w-3.5 h-3.5" />,
              },
              {
                id: 'user',
                label: 'User View',
                icon: <Maximize className="w-3.5 h-3.5" />,
              },
              {
                id: 'camera',
                label: 'Camera View',
                icon: <Film className="w-3.5 h-3.5" />,
              },
            ] as { id: ViewportLayoutMode; label: string; icon: React.ReactNode }[]
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() =>
                setStudio((prev) => ({ ...prev, viewportLayout: mode.id }))
              }
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                studio.viewportLayout === mode.id
                  ? 'bg-[#4772B3] text-white'
                  : 'bg-[#1D1D20] text-neutral-300 hover:bg-[#323236]'
              }`}
            >
              {mode.icon}
              <span>{mode.label}</span>
            </button>
          ))}
        </div>

        {/* Center: Camera Frame Aspect Ratio Selector (16:9, 9:16, 1:1, 4:5) */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[11px] text-neutral-400 mr-1 hidden sm:inline">
            Camera Ratio:
          </span>
          {(
            [
              {
                id: '16:9',
                label: '16:9 Wide',
                icon: <Monitor className="w-3.5 h-3.5" />,
              },
              {
                id: '9:16',
                label: '9:16 Vertical',
                icon: <Smartphone className="w-3.5 h-3.5" />,
              },
              {
                id: '1:1',
                label: '1:1 Square',
                icon: <Square className="w-3.5 h-3.5" />,
              },
              {
                id: '4:5',
                label: '4:5 Portrait',
                icon: <Square className="w-3.5 h-3.5" />,
              },
            ] as { id: AspectRatioPreset; label: string; icon: React.ReactNode }[]
          ).map((ar) => (
            <button
              key={ar.id}
              type="button"
              onClick={() =>
                setStudio((prev) => ({ ...prev, aspectRatio: ar.id }))
              }
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono-tabular font-medium transition-colors whitespace-nowrap shrink-0 ${
                studio.aspectRatio === ar.id
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/60'
                  : 'bg-[#1D1D20] text-neutral-300 hover:bg-[#323236] border border-transparent'
              }`}
            >
              {ar.icon}
              <span>{ar.label}</span>
            </button>
          ))}
        </div>

        {/* Right: Quick Ground Shadow Toggle & Reference Image Button */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() =>
              handleUpdateGroundShadow({ enabled: !studio.groundShadow.enabled })
            }
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              studio.groundShadow.enabled
                ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-600/50'
                : 'bg-[#1D1D20] text-neutral-400 border border-white/10'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            <span>
              Ground Shadow: {studio.groundShadow.enabled ? 'On' : 'Off'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowRefModal((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded bg-[#1D1D20] hover:bg-[#323236] text-neutral-300 border border-white/10 text-xs transition-colors whitespace-nowrap shrink-0"
            title="Compare with Reference Image"
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Ref Image</span>
          </button>

          <button
            type="button"
            onClick={() => setStudio(createInitialStudioState())}
            className="p-1 rounded bg-[#1D1D20] hover:bg-[#323236] text-neutral-300 border border-white/10"
            title="Reset Studio Scene"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3. DUAL 3D WEBGL VIEWPORT WORKSPACE */}
      <DualViewportCanvas
        layers={studio.layers}
        selectedLayerId={studio.selectedLayerId}
        currentFrame={studio.timeline.currentFrame}
        isPlaying={studio.timeline.isPlaying}
        aspectRatio={studio.aspectRatio}
        viewportLayout={studio.viewportLayout}
        userShading={studio.userShading}
        cameraShading={studio.cameraShading}
        activeTool={studio.activeTool}
        cursor3DPosition={studio.cursor3DPosition}
        groundShadow={studio.groundShadow}
        onSelectLayer={handleSelectLayer}
        onSelectTool={handleSelectTool}
        onUpdateCursor3D={handleUpdateCursor3D}
        onTransformSelectedLayer={handleTransformSelectedLayer}
        onAddLayerAtCursor={handleAddLayer}
        onChangeUserShading={(mode) =>
          setStudio((prev) => ({ ...prev, userShading: mode }))
        }
        onChangeCameraShading={(mode) =>
          setStudio((prev) => ({ ...prev, cameraShading: mode }))
        }
        onUpdateGroundShadow={handleUpdateGroundShadow}
      />

      {/* 4. COLLAPSIBLE STUDIO INSPECTOR STRIP */}
      <InspectorDrawer
        selectedLayer={selectedLayer}
        groundShadow={studio.groundShadow}
        onUpdateLayerMaterial={(
          layerId: string,
          partial: Partial<LayerMaterialConfig>
        ) =>
          setStudio((prev) => ({
            ...prev,
            layers: prev.layers.map((l) =>
              l.id === layerId
                ? { ...l, materialConfig: { ...l.materialConfig, ...partial } }
                : l
            ),
          }))
        }
        onUpdateLayerText={(layerId: string, partial: Partial<Text3DConfig>) =>
          setStudio((prev) => ({
            ...prev,
            layers: prev.layers.map((l) =>
              l.id === layerId && l.textConfig
                ? { ...l, textConfig: { ...l.textConfig, ...partial } }
                : l
            ),
          }))
        }
        onUpdateLayerName={(layerId: string, name: string) =>
          setStudio((prev) => ({
            ...prev,
            layers: prev.layers.map((l) =>
              l.id === layerId ? { ...l, name } : l
            ),
          }))
        }
        onUpdateGroundShadow={handleUpdateGroundShadow}
      />

      {/* 5. AE-STYLE LAYER & KEYFRAME TIMELINE DOCK */}
      <AETimelinePanel
        layers={studio.layers}
        selectedLayerId={studio.selectedLayerId}
        timeline={studio.timeline}
        onSelectLayer={(id) => handleSelectLayer(id)}
        onToggleLayerExpand={(id) =>
          setStudio((prev) => ({
            ...prev,
            layers: prev.layers.map((l) =>
              l.id === id ? { ...l, expanded: !l.expanded } : l
            ),
          }))
        }
        onToggleLayerVisible={(id) =>
          setStudio((prev) => ({
            ...prev,
            layers: prev.layers.map((l) =>
              l.id === id ? { ...l, visible: !l.visible } : l
            ),
          }))
        }
        onToggleLayerLock={(id) =>
          setStudio((prev) => ({
            ...prev,
            layers: prev.layers.map((l) =>
              l.id === id ? { ...l, locked: !l.locked } : l
            ),
          }))
        }
        onAddLayer={handleAddLayer}
        onDuplicateLayer={handleDuplicateLayer}
        onDeleteLayer={handleDeleteLayer}
        onSetCurrentFrame={handleSetCurrentFrame}
        onUpdateTimelineState={handleUpdateTimelineState}
        onPropertyScrub={handlePropertyScrub}
        onToggleKeyframeAtCurrent={handleToggleKeyframeAtCurrent}
        onChangeTrackEasing={handleChangeTrackEasing}
      />

      {/* Export Offline HTML Toast Notification */}
      {exportToast && (
        <div className="fixed bottom-4 right-4 z-50 bg-[#1E293B] border border-[#4772B3] text-white px-4 py-2.5 rounded-md shadow-2xl text-xs flex items-center gap-2">
          <Download className="w-4 h-4 text-blue-400 shrink-0" />
          <span>{exportToast}</span>
        </div>
      )}

      {/* Optional Reference Image Inspection Modal */}
      {showRefModal && (
        <div
          onClick={() => setShowRefModal(false)}
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#252528] border border-[#424246] rounded-lg max-w-3xl w-full p-4 shadow-2xl flex flex-col gap-3"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h3 className="text-sm font-semibold text-white">
                Blender Dual-Viewport Reference Layout
              </h3>
              <button
                type="button"
                onClick={() => setShowRefModal(false)}
                className="px-2.5 py-1 rounded bg-[#36363A] hover:bg-[#4772B3] text-xs text-white"
              >
                Close
              </button>
            </div>
            <div className="rounded overflow-hidden border border-black bg-[#181818]">
              <img
                src="/assets/aistudio/edited-image-crop__1__a31758bc.webp"
                alt="Blender Dual Viewport Reference"
                referrerPolicy="no-referrer"
                className="w-full h-auto object-contain max-h-[65vh]"
              />
            </div>
            <p className="text-xs text-neutral-400">
              Left: User Perspective with 3D Cursor, XYZ orientation gizmo, and 9-tool strip. Right: Camera Perspective with golden aspect ratio frame. Bottom: Transport & AE-style layer keyframe timeline.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
