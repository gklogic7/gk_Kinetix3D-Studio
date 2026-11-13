import React, { useState } from 'react';
import {
  GroundShadowConfig,
  LayerMaterialConfig,
  SceneLayer,
  Text3DConfig,
  TextEffectType,
} from '../types/studio';
import {
  ChevronDown,
  ChevronUp,
  Layers,
  Palette,
  Sparkles,
  SunMedium,
} from 'lucide-react';

interface InspectorDrawerProps {
  selectedLayer: SceneLayer | undefined;
  groundShadow: GroundShadowConfig;
  onUpdateLayerMaterial: (layerId: string, partial: Partial<LayerMaterialConfig>) => void;
  onUpdateLayerText: (layerId: string, partial: Partial<Text3DConfig>) => void;
  onUpdateLayerName: (layerId: string, name: string) => void;
  onUpdateGroundShadow: (partial: Partial<GroundShadowConfig>) => void;
}

const MATERIAL_PRESETS: {
  label: string;
  config: LayerMaterialConfig;
}[] = [
  {
    label: 'Blender Clay',
    config: {
      color: '#A3A8B0',
      accentColor: '#3B82F6',
      metalness: 0.2,
      roughness: 0.45,
      clearcoat: 0.3,
    },
  },
  {
    label: 'Brushed Titanium',
    config: {
      color: '#D4D8DF',
      accentColor: '#60A5FA',
      metalness: 0.88,
      roughness: 0.22,
      clearcoat: 0.5,
    },
  },
  {
    label: 'Anodized Gold',
    config: {
      color: '#F59E0B',
      accentColor: '#FDE68A',
      metalness: 0.92,
      roughness: 0.18,
      clearcoat: 0.75,
    },
  },
  {
    label: 'Studio Ceramic',
    config: {
      color: '#F9FAFB',
      accentColor: '#F59E0B',
      metalness: 0.1,
      roughness: 0.14,
      clearcoat: 0.95,
    },
  },
  {
    label: 'Obsidian Chrome',
    config: {
      color: '#27272A',
      accentColor: '#10B981',
      metalness: 0.95,
      roughness: 0.12,
      clearcoat: 0.85,
    },
  },
];

export const InspectorDrawer: React.FC<InspectorDrawerProps> = ({
  selectedLayer,
  groundShadow,
  onUpdateLayerMaterial,
  onUpdateLayerText,
  onUpdateLayerName,
  onUpdateGroundShadow,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'layer' | 'material' | 'shadow'>('layer');

  return (
    <div className="bg-[#232325] border-t border-[#141414] text-xs select-none shrink-0">
      {/* Header Strip with Tab Switcher & Collapse Toggle */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#2A2A2D] border-b border-[#18181A]">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              setActiveTab('layer');
              setCollapsed(false);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'layer' && !collapsed
                ? 'bg-[#4772B3] text-white'
                : 'text-neutral-300 hover:bg-[#36363A]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {selectedLayer?.type === 'text3d'
                ? '3D Text & Animator'
                : 'Layer Inspector'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('material');
              setCollapsed(false);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'material' && !collapsed
                ? 'bg-[#4772B3] text-white'
                : 'text-neutral-300 hover:bg-[#36363A]'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>PBR Material Finish</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('shadow');
              setCollapsed(false);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'shadow' && !collapsed
                ? 'bg-[#4772B3] text-white'
                : 'text-neutral-300 hover:bg-[#36363A]'
            }`}
          >
            <SunMedium className="w-3.5 h-3.5" />
            <span>Ground Shadow & Stage</span>
          </button>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {selectedLayer && (
            <span className="hidden md:inline text-[11px] text-neutral-400">
              Active: <strong className="text-neutral-200">{selectedLayer.name}</strong>
            </span>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#1E1E20] hover:bg-[#343438] text-neutral-300 border border-white/10 transition-colors whitespace-nowrap"
          >
            <span>{collapsed ? 'Expand Inspector' : 'Minimize'}</span>
            {collapsed ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Inspector Body */}
      {!collapsed && (
        <div className="px-3 py-2 bg-[#202022] flex flex-wrap items-center gap-x-5 gap-y-2 min-h-[48px]">
          {activeTab === 'layer' && (
            <>
              {!selectedLayer ? (
                <div className="text-neutral-400 py-1">
                  Select a layer in the viewport or timeline to inspect its 3D properties.
                </div>
              ) : (
                <>
                  {/* Layer Name */}
                  <div className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-neutral-400" />
                    <span className="text-neutral-400">Layer:</span>
                    <input
                      type="text"
                      value={selectedLayer.name}
                      onChange={(e) =>
                        onUpdateLayerName(selectedLayer.id, e.target.value)
                      }
                      className="bg-[#161618] border border-[#38383C] rounded px-2 py-1 text-xs text-neutral-100 w-40 focus:outline-none focus:border-[#4772B3]"
                    />
                  </div>

                  {selectedLayer.type === 'text3d' && selectedLayer.textConfig ? (
                    <>
                      {/* 3D Text Content */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-amber-400 font-medium">3D Text:</span>
                        <input
                          type="text"
                          maxLength={18}
                          value={selectedLayer.textConfig.content}
                          onChange={(e) =>
                            onUpdateLayerText(selectedLayer.id, {
                              content: e.target.value,
                            })
                          }
                          placeholder="Enter 3D text..."
                          className="bg-[#161618] border border-amber-500/40 rounded px-2.5 py-1 text-xs font-mono-tabular text-amber-200 w-36 focus:outline-none focus:border-amber-400"
                        />
                      </div>

                      {/* Text Animator Preset */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-neutral-400">AE Effector:</span>
                        <select
                          value={selectedLayer.textConfig.effectType}
                          onChange={(e) =>
                            onUpdateLayerText(selectedLayer.id, {
                              effectType: e.target.value as TextEffectType,
                            })
                          }
                          className="bg-[#161618] border border-[#38383C] rounded px-2 py-1 text-xs text-neutral-100 focus:outline-none focus:border-[#4772B3]"
                        >
                          <option value="wave">Cascade Sine Wave</option>
                          <option value="cascade">Staggered Step Cascade</option>
                          <option value="flip3d">Typewriter 3D Y-Flip</option>
                          <option value="orbit">Curved Orbital Arc</option>
                          <option value="elastic">Elastic Squash & Drop</option>
                        </select>
                      </div>

                      {/* Extrude Depth */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-neutral-400">Extrude:</span>
                        <input
                          type="range"
                          min="0.06"
                          max="0.6"
                          step="0.02"
                          value={selectedLayer.textConfig.depth}
                          onChange={(e) =>
                            onUpdateLayerText(selectedLayer.id, {
                              depth: parseFloat(e.target.value),
                            })
                          }
                          className="w-20 accent-[#4772B3]"
                        />
                        <span className="font-mono-tabular text-neutral-300 w-9">
                          {selectedLayer.textConfig.depth.toFixed(2)}
                        </span>
                      </div>

                      {/* Letter Spacing / Tracking */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-neutral-400">Tracking:</span>
                        <input
                          type="range"
                          min="0.02"
                          max="0.45"
                          step="0.02"
                          value={selectedLayer.textConfig.letterSpacing}
                          onChange={(e) =>
                            onUpdateLayerText(selectedLayer.id, {
                              letterSpacing: parseFloat(e.target.value),
                            })
                          }
                          className="w-20 accent-[#4772B3]"
                        />
                        <span className="font-mono-tabular text-neutral-300 w-9">
                          {selectedLayer.textConfig.letterSpacing.toFixed(2)}
                        </span>
                      </div>

                      {/* Animator Amplitude */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-neutral-400">Amplitude:</span>
                        <input
                          type="range"
                          min="0.05"
                          max="1.0"
                          step="0.05"
                          value={selectedLayer.textConfig.effectAmplitude}
                          onChange={(e) =>
                            onUpdateLayerText(selectedLayer.id, {
                              effectAmplitude: parseFloat(e.target.value),
                            })
                          }
                          className="w-20 accent-amber-500"
                        />
                        <span className="font-mono-tabular text-neutral-300 w-8">
                          {selectedLayer.textConfig.effectAmplitude.toFixed(2)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="text-neutral-400 flex items-center gap-3">
                      <span>
                        Composite 3D Mesh Assembly · Use timeline tracks below or viewport gizmos (Move/Rotate/Scale) to keyframe motion.
                      </span>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {activeTab === 'material' && (
            <>
              {!selectedLayer ? (
                <div className="text-neutral-400 py-1">
                  Select a 3D layer to customize its PBR surface finish.
                </div>
              ) : (
                <>
                  {/* Preset Swatches */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-neutral-400">Presets:</span>
                    <div className="flex items-center gap-1">
                      {MATERIAL_PRESETS.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() =>
                            onUpdateLayerMaterial(selectedLayer.id, p.config)
                          }
                          className="px-2 py-1 rounded bg-[#2C2C30] hover:bg-[#3A3A40] text-neutral-200 border border-white/10 text-[11px] transition-colors whitespace-nowrap"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Base & Accent Color Pickers */}
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <span className="text-neutral-400">Base:</span>
                      <input
                        type="color"
                        value={selectedLayer.materialConfig.color}
                        onChange={(e) =>
                          onUpdateLayerMaterial(selectedLayer.id, {
                            color: e.target.value,
                          })
                        }
                        className="w-6 h-5 rounded bg-transparent border border-white/20 cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <span className="text-neutral-400">Trim:</span>
                      <input
                        type="color"
                        value={selectedLayer.materialConfig.accentColor}
                        onChange={(e) =>
                          onUpdateLayerMaterial(selectedLayer.id, {
                            accentColor: e.target.value,
                          })
                        }
                        className="w-6 h-5 rounded bg-transparent border border-white/20 cursor-pointer"
                      />
                    </label>
                  </div>

                  {/* Metalness */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-neutral-400">Metalness:</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={selectedLayer.materialConfig.metalness}
                      onChange={(e) =>
                        onUpdateLayerMaterial(selectedLayer.id, {
                          metalness: parseFloat(e.target.value),
                        })
                      }
                      className="w-20 accent-[#4772B3]"
                    />
                    <span className="font-mono-tabular text-neutral-300 w-8">
                      {Math.round(selectedLayer.materialConfig.metalness * 100)}%
                    </span>
                  </div>

                  {/* Roughness */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-neutral-400">Roughness:</span>
                    <input
                      type="range"
                      min="0.05"
                      max="1"
                      step="0.05"
                      value={selectedLayer.materialConfig.roughness}
                      onChange={(e) =>
                        onUpdateLayerMaterial(selectedLayer.id, {
                          roughness: parseFloat(e.target.value),
                        })
                      }
                      className="w-20 accent-[#4772B3]"
                    />
                    <span className="font-mono-tabular text-neutral-300 w-8">
                      {Math.round(selectedLayer.materialConfig.roughness * 100)}%
                    </span>
                  </div>
                </>
              )}
            </>
          )}

          {activeTab === 'shadow' && (
            <>
              {/* Ground Shadow Master Toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={groundShadow.enabled}
                  onChange={(e) =>
                    onUpdateGroundShadow({ enabled: e.target.checked })
                  }
                  className="accent-[#4772B3]"
                />
                <span className="text-neutral-200 font-medium">Ground Shadow</span>
              </label>

              {/* Shadow Mode */}
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-400">Type:</span>
                <select
                  value={groundShadow.shadowType}
                  onChange={(e) =>
                    onUpdateGroundShadow({
                      shadowType: e.target.value as GroundShadowConfig['shadowType'],
                    })
                  }
                  className="bg-[#161618] border border-[#38383C] rounded px-2 py-1 text-xs text-neutral-100"
                >
                  <option value="both">Combined PCF + Contact Shadow</option>
                  <option value="pcf_soft">Directional PCF Soft Shadow</option>
                  <option value="contact_radial">Simple Radial Contact Shadow</option>
                </select>
              </div>

              {/* Shadow Opacity */}
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-400">Opacity:</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={groundShadow.opacity}
                  onChange={(e) =>
                    onUpdateGroundShadow({ opacity: parseFloat(e.target.value) })
                  }
                  className="w-20 accent-[#4772B3]"
                />
                <span className="font-mono-tabular text-neutral-300 w-8">
                  {Math.round(groundShadow.opacity * 100)}%
                </span>
              </div>

              {/* Shadow Softness / Blur */}
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-400">Softness:</span>
                <input
                  type="range"
                  min="0.5"
                  max="6"
                  step="0.5"
                  value={groundShadow.blur}
                  onChange={(e) =>
                    onUpdateGroundShadow({ blur: parseFloat(e.target.value) })
                  }
                  className="w-20 accent-[#4772B3]"
                />
                <span className="font-mono-tabular text-neutral-300 w-7">
                  {groundShadow.blur.toFixed(1)}
                </span>
              </div>

              {/* Camera Crop Passepartout Dimming */}
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-400">Crop Mask:</span>
                <input
                  type="range"
                  min="0.2"
                  max="0.9"
                  step="0.05"
                  value={groundShadow.passepartout}
                  onChange={(e) =>
                    onUpdateGroundShadow({
                      passepartout: parseFloat(e.target.value),
                    })
                  }
                  className="w-16 accent-amber-500"
                />
              </div>

              {/* Rule of Thirds Guides */}
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={groundShadow.showCameraGuides}
                  onChange={(e) =>
                    onUpdateGroundShadow({ showCameraGuides: e.target.checked })
                  }
                  className="accent-amber-500"
                />
                <span className="text-neutral-300">Safe Guides</span>
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
};
