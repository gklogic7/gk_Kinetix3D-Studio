import React, { useRef, useState } from 'react';
import {
  AnimatableProperty,
  EasingType,
  LayerType,
  SceneLayer,
  TimelineState,
} from '../types/studio';
import {
  ANIMATABLE_PROPERTIES,
  evaluateLayerTransformAtFrame,
  getAllKeyframeFrames,
} from '../engine/keyframeEvaluator';
import {
  ChevronDown,
  ChevronRight,
  CircleDot,
  Copy,
  Diamond,
  Eye,
  EyeOff,
  Lock,
  Pause,
  Play,
  Plus,
  Repeat,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Trash2,
  Unlock,
} from 'lucide-react';

interface AETimelinePanelProps {
  layers: SceneLayer[];
  selectedLayerId: string | null;
  timeline: TimelineState;
  onSelectLayer: (id: string) => void;
  onToggleLayerExpand: (id: string) => void;
  onToggleLayerVisible: (id: string) => void;
  onToggleLayerLock: (id: string) => void;
  onAddLayer: (type: LayerType) => void;
  onDuplicateLayer: (id: string) => void;
  onDeleteLayer: (id: string) => void;
  onSetCurrentFrame: (frame: number) => void;
  onUpdateTimelineState: (partial: Partial<TimelineState>) => void;
  onPropertyScrub: (
    layerId: string,
    prop: AnimatableProperty,
    value: number
  ) => void;
  onToggleKeyframeAtCurrent: (layerId: string, prop: AnimatableProperty) => void;
  onChangeTrackEasing: (
    layerId: string,
    prop: AnimatableProperty,
    easing: EasingType
  ) => void;
}

export const AETimelinePanel: React.FC<AETimelinePanelProps> = ({
  layers,
  selectedLayerId,
  timeline,
  onSelectLayer,
  onToggleLayerExpand,
  onToggleLayerVisible,
  onToggleLayerLock,
  onAddLayer,
  onDuplicateLayer,
  onDeleteLayer,
  onSetCurrentFrame,
  onUpdateTimelineState,
  onPropertyScrub,
  onToggleKeyframeAtCurrent,
  onChangeTrackEasing,
}) => {
  const rulerRef = useRef<HTMLDivElement>(null);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [showKeyingMenu, setShowKeyingMenu] = useState(false);

  const totalFrames = Math.max(10, timeline.endFrame - timeline.startFrame + 1);
  const frameToPercent = (frame: number) =>
    Math.max(
      0,
      Math.min(100, ((frame - timeline.startFrame) / (totalFrames - 1)) * 100)
    );

  const clientXToFrame = (clientX: number) => {
    const el = rulerRef.current;
    if (!el) return timeline.currentFrame;
    const rect = el.getBoundingClientRect();
    const norm = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(timeline.startFrame + norm * (totalFrames - 1));
  };

  const handleRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    onUpdateTimelineState({ isPlaying: false });
    onSetCurrentFrame(clientXToFrame(e.clientX));
  };

  const handleRulerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    onSetCurrentFrame(clientXToFrame(e.clientX));
  };

  const jumpToAdjacentKeyframe = (dir: -1 | 1) => {
    const allFrames = getAllKeyframeFrames(layers);
    if (allFrames.length === 0) return;
    const cur = Math.round(timeline.currentFrame);
    if (dir === -1) {
      const prev = [...allFrames].reverse().find((f) => f < cur);
      onSetCurrentFrame(prev !== undefined ? prev : allFrames[0]);
    } else {
      const next = allFrames.find((f) => f > cur);
      onSetCurrentFrame(
        next !== undefined ? next : allFrames[allFrames.length - 1]
      );
    }
  };

  // Frame ticks on ruler (every 20 frames)
  const ticks: number[] = [];
  for (let f = timeline.startFrame; f <= timeline.endFrame; f += 20) {
    ticks.push(f);
  }
  if (ticks[ticks.length - 1] !== timeline.endFrame) {
    ticks.push(timeline.endFrame);
  }

  return (
    <div className="h-56 md:h-64 bg-[#1D1D1F] border-t border-[#111111] flex flex-col select-none shrink-0">
      {/* TOP BAR: Authentic Blender Transport Bar + AE Layer Controls */}
      <div className="h-8 bg-[#28282B] border-b border-[#151517] px-2.5 flex items-center justify-between gap-2 text-xs shrink-0">
        {/* Left: Playback / Keying / View / Marker Menu Items matching reference image */}
        <div className="flex items-center gap-1 md:gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAddDropdown((v) => !v)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-[#3A3A3F] hover:bg-[#4772B3] text-neutral-100 font-medium transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Layer</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showAddDropdown && (
              <div className="absolute left-0 bottom-9 w-48 bg-[#252528] border border-[#424246] rounded-md shadow-xl p-1 z-50 flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    onAddLayer('text3d');
                    setShowAddDropdown(false);
                  }}
                  className="px-2.5 py-1.5 text-left text-xs text-amber-300 hover:bg-[#37373D] rounded"
                >
                  + 3D Animated Text Layer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onAddLayer('cube_assembly');
                    setShowAddDropdown(false);
                  }}
                  className="px-2.5 py-1.5 text-left text-xs text-neutral-200 hover:bg-[#37373D] rounded"
                >
                  + Studio Cube Assembly
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onAddLayer('kinetic_rings');
                    setShowAddDropdown(false);
                  }}
                  className="px-2.5 py-1.5 text-left text-xs text-neutral-200 hover:bg-[#37373D] rounded"
                >
                  + Kinetic Gyro Sculpture
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onAddLayer('pedestal');
                    setShowAddDropdown(false);
                  }}
                  className="px-2.5 py-1.5 text-left text-xs text-neutral-200 hover:bg-[#37373D] rounded"
                >
                  + Architectural Pedestal
                </button>
              </div>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-2 text-neutral-300 pl-1">
            <button
              type="button"
              onClick={() =>
                onUpdateTimelineState({ loop: !timeline.loop })
              }
              className={`px-1.5 py-0.5 rounded hover:bg-[#38383C] transition-colors ${
                timeline.loop ? 'text-blue-400' : 'text-neutral-400'
              }`}
            >
              Playback ▾
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowKeyingMenu((v) => !v)}
                className="px-1.5 py-0.5 rounded hover:bg-[#38383C] transition-colors"
              >
                Keying ▾
              </button>
              {showKeyingMenu && (
                <div className="absolute left-0 bottom-8 w-44 bg-[#252528] border border-[#424246] rounded shadow-xl p-2 z-50 flex flex-col gap-1.5">
                  <div className="text-[11px] text-neutral-400 border-b border-white/10 pb-1">
                    Active Keyframing
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedLayerId) {
                        onToggleKeyframeAtCurrent(selectedLayerId, 'position.y');
                        onToggleKeyframeAtCurrent(selectedLayerId, 'rotation.y');
                      }
                      setShowKeyingMenu(false);
                    }}
                    className="text-left px-2 py-1 rounded hover:bg-[#37373D] text-neutral-200"
                  >
                    Insert LocRot Keyframe (I)
                  </button>
                </div>
              )}
            </div>
            <span className="text-neutral-500 hidden lg:inline">View</span>
            <span className="text-neutral-500 hidden lg:inline">Marker</span>
          </div>
        </div>

        {/* Center: Blender Transport Controls matching bottom bar of reference screenshot */}
        <div className="flex items-center gap-1">
          {/* Auto-Keying Record Dot Button */}
          <button
            type="button"
            onClick={() =>
              onUpdateTimelineState({ autoKey: !timeline.autoKey })
            }
            title="Auto-Keying: Automatically record keyframes when transforming objects"
            className={`w-6 h-6 rounded flex items-center justify-center border transition-colors mr-1 ${
              timeline.autoKey
                ? 'bg-[#4772B3] border-[#6090D8] text-white'
                : 'bg-[#1E1E20] border-[#38383C] text-neutral-400 hover:text-white'
            }`}
          >
            <CircleDot className="w-3.5 h-3.5" />
          </button>

          {/* Jump to Start */}
          <button
            type="button"
            onClick={() => {
              onUpdateTimelineState({ isPlaying: false });
              onSetCurrentFrame(timeline.startFrame);
            }}
            title="Jump to Start Frame"
            className="w-6 h-6 rounded bg-[#1E1E20] hover:bg-[#35353A] border border-[#38383C] text-neutral-200 flex items-center justify-center"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>

          {/* Jump to Previous Keyframe */}
          <button
            type="button"
            onClick={() => jumpToAdjacentKeyframe(-1)}
            title="Jump to Previous Keyframe"
            className="w-6 h-6 rounded bg-[#1E1E20] hover:bg-[#35353A] border border-[#38383C] text-neutral-200 flex items-center justify-center"
          >
            <StepBack className="w-3.5 h-3.5" />
          </button>

          {/* Play Backwards */}
          <button
            type="button"
            onClick={() =>
              onUpdateTimelineState({
                isPlaying:
                  timeline.isPlaying && timeline.playDirection === -1
                    ? false
                    : true,
                playDirection: -1,
              })
            }
            title="Play Backwards"
            className={`w-6 h-6 rounded border flex items-center justify-center transition-colors ${
              timeline.isPlaying && timeline.playDirection === -1
                ? 'bg-[#4772B3] border-[#6090D8] text-white'
                : 'bg-[#1E1E20] hover:bg-[#35353A] border-[#38383C] text-neutral-200'
            }`}
          >
            <Play className="w-3.5 h-3.5 rotate-180" />
          </button>

          {/* Play Forwards */}
          <button
            type="button"
            onClick={() =>
              onUpdateTimelineState({
                isPlaying:
                  timeline.isPlaying && timeline.playDirection === 1
                    ? false
                    : true,
                playDirection: 1,
              })
            }
            title="Play / Pause Forwards (Space)"
            className={`w-7 h-6 rounded border flex items-center justify-center transition-colors ${
              timeline.isPlaying && timeline.playDirection === 1
                ? 'bg-[#4772B3] border-[#6090D8] text-white'
                : 'bg-[#1E1E20] hover:bg-[#35353A] border-[#38383C] text-neutral-200'
            }`}
          >
            {timeline.isPlaying && timeline.playDirection === 1 ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Jump to Next Keyframe */}
          <button
            type="button"
            onClick={() => jumpToAdjacentKeyframe(1)}
            title="Jump to Next Keyframe"
            className="w-6 h-6 rounded bg-[#1E1E20] hover:bg-[#35353A] border border-[#38383C] text-neutral-200 flex items-center justify-center"
          >
            <StepForward className="w-3.5 h-3.5" />
          </button>

          {/* Jump to End */}
          <button
            type="button"
            onClick={() => {
              onUpdateTimelineState({ isPlaying: false });
              onSetCurrentFrame(timeline.endFrame);
            }}
            title="Jump to End Frame"
            className="w-6 h-6 rounded bg-[#1E1E20] hover:bg-[#35353A] border border-[#38383C] text-neutral-200 flex items-center justify-center"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>

          {/* Loop Toggle */}
          <button
            type="button"
            onClick={() =>
              onUpdateTimelineState({ loop: !timeline.loop })
            }
            title="Toggle Loop Playback"
            className={`w-6 h-6 rounded border flex items-center justify-center ml-1 ${
              timeline.loop
                ? 'bg-[#2C3E58] border-[#4772B3] text-blue-300'
                : 'bg-[#1E1E20] border-[#38383C] text-neutral-500'
            }`}
          >
            <Repeat className="w-3 h-3" />
          </button>
        </div>

        {/* Right: Current Frame Counter + Start / End Frame Range matching reference image */}
        <div className="flex items-center gap-1.5 font-mono-tabular">
          <div className="flex items-center bg-[#18181A] border border-[#3A3A3E] rounded px-2 py-0.5">
            <span className="text-[10px] text-neutral-400 mr-1.5">Frame</span>
            <input
              type="number"
              min={timeline.startFrame}
              max={timeline.endFrame}
              value={Math.round(timeline.currentFrame)}
              onChange={(e) =>
                onSetCurrentFrame(
                  Math.max(
                    timeline.startFrame,
                    Math.min(timeline.endFrame, Number(e.target.value) || 1)
                  )
                )
              }
              className="w-10 bg-transparent text-right text-xs text-amber-400 font-semibold focus:outline-none"
            />
          </div>

          <div className="hidden md:flex items-center bg-[#18181A] border border-[#3A3A3E] rounded px-2 py-0.5">
            <span className="text-[10px] text-neutral-400 mr-1">Start</span>
            <input
              type="number"
              min={1}
              max={timeline.endFrame - 10}
              value={timeline.startFrame}
              onChange={(e) =>
                onUpdateTimelineState({
                  startFrame: Math.max(1, Number(e.target.value) || 1),
                })
              }
              className="w-9 bg-transparent text-right text-xs text-neutral-200 focus:outline-none"
            />
          </div>

          <div className="hidden md:flex items-center bg-[#18181A] border border-[#3A3A3E] rounded px-2 py-0.5">
            <span className="text-[10px] text-neutral-400 mr-1">End</span>
            <input
              type="number"
              min={timeline.startFrame + 10}
              max={999}
              value={timeline.endFrame}
              onChange={(e) =>
                onUpdateTimelineState({
                  endFrame: Math.max(
                    timeline.startFrame + 10,
                    Number(e.target.value) || 250
                  ),
                })
              }
              className="w-10 bg-transparent text-right text-xs text-neutral-200 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* MAIN AE LAYER & KEYFRAME WORKSPACE */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT COLUMN: Layer Hierarchy & Property Controls */}
        <div className="w-64 md:w-80 border-r border-[#141416] flex flex-col bg-[#212124] shrink-0">
          {/* Column Header */}
          <div className="h-6 bg-[#262629] border-b border-[#151517] px-2.5 flex items-center justify-between text-[11px] text-neutral-400 shrink-0">
            <span>AE Layer Stack / Track Properties</span>
            <span>Value / Curve</span>
          </div>

          {/* Scrollable Layer List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#19191C]">
            {layers.map((layer, index) => {
              const isSelected = layer.id === selectedLayerId;
              const evalTrans = evaluateLayerTransformAtFrame(
                layer,
                timeline.currentFrame
              );
              const propsList = ANIMATABLE_PROPERTIES.filter(
                (p) => !p.textOnly || layer.type === 'text3d'
              );

              return (
                <div key={layer.id} className="flex flex-col">
                  {/* Main Layer Row */}
                  <div
                    onClick={() => onSelectLayer(layer.id)}
                    className={`h-7 px-2 flex items-center justify-between gap-1.5 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#2E3D52] text-white'
                        : 'bg-[#232327] hover:bg-[#2A2A2F] text-neutral-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {/* Visibility Eye */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleLayerVisible(layer.id);
                        }}
                        className="text-neutral-400 hover:text-white"
                        title="Toggle Layer Visibility"
                      >
                        {layer.visible ? (
                          <Eye className="w-3.5 h-3.5 text-neutral-200" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5 text-neutral-600" />
                        )}
                      </button>

                      {/* Lock */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleLayerLock(layer.id);
                        }}
                        className="text-neutral-400 hover:text-white"
                        title="Lock / Unlock Layer"
                      >
                        {layer.locked ? (
                          <Lock className="w-3 h-3 text-amber-400" />
                        ) : (
                          <Unlock className="w-3 h-3 text-neutral-500" />
                        )}
                      </button>

                      {/* Expand Triangle */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleLayerExpand(layer.id);
                        }}
                        className="text-neutral-300 hover:text-white"
                      >
                        {layer.expanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* AE Color Label Swatch */}
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: layer.colorTag }}
                      />

                      <span className="text-[11px] font-mono-tabular text-neutral-400">
                        {index + 1}
                      </span>

                      <span className="text-xs font-medium truncate">
                        {layer.name}
                      </span>
                    </div>

                    {/* Duplicate & Delete Layer Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicateLayer(layer.id);
                        }}
                        title="Duplicate Layer"
                        className="p-0.5 text-neutral-400 hover:text-white rounded"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      {layers.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteLayer(layer.id);
                          }}
                          title="Delete Layer"
                          className="p-0.5 text-neutral-400 hover:text-red-400 rounded"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Property Tracks */}
                  {layer.expanded &&
                    propsList.map((propDef) => {
                      const track = layer.tracks[propDef.key] || [];
                      const curRound = Math.round(timeline.currentFrame);
                      const hasKfAtCur = track.some((k) => k.frame === curRound);
                      const activeEasing: EasingType =
                        track[0]?.easing || 'easeInOut';

                      let currentVal = 0;
                      switch (propDef.key) {
                        case 'position.x':
                          currentVal = evalTrans.position[0];
                          break;
                        case 'position.y':
                          currentVal = evalTrans.position[1];
                          break;
                        case 'position.z':
                          currentVal = evalTrans.position[2];
                          break;
                        case 'rotation.x':
                          currentVal = evalTrans.rotation[0];
                          break;
                        case 'rotation.y':
                          currentVal = evalTrans.rotation[1];
                          break;
                        case 'rotation.z':
                          currentVal = evalTrans.rotation[2];
                          break;
                        case 'scale':
                          currentVal = evalTrans.scale;
                          break;
                        case 'opacity':
                          currentVal = evalTrans.opacity;
                          break;
                        case 'textEffect':
                          currentVal = evalTrans.textEffect;
                          break;
                      }

                      return (
                        <div
                          key={propDef.key}
                          className="h-6 pl-7 pr-2 bg-[#1B1B1E] flex items-center justify-between gap-1 text-[11px] border-t border-[#222226]"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            {/* Keyframe Stopwatch / Diamond Toggle */}
                            <button
                              type="button"
                              onClick={() =>
                                onToggleKeyframeAtCurrent(layer.id, propDef.key)
                              }
                              title="Add or Remove Keyframe at Current Frame"
                              className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                                hasKfAtCur
                                  ? 'text-amber-400'
                                  : track.length > 0
                                  ? 'text-blue-400 hover:text-amber-300'
                                  : 'text-neutral-500 hover:text-neutral-200'
                              }`}
                            >
                              <Diamond
                                className="w-3 h-3"
                                fill={hasKfAtCur ? 'currentColor' : 'none'}
                              />
                            </button>

                            <span
                              className={`truncate ${
                                propDef.textOnly
                                  ? 'text-amber-300 font-medium'
                                  : 'text-neutral-300'
                              }`}
                            >
                              {propDef.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <input
                              type="number"
                              step={propDef.step}
                              min={propDef.min}
                              max={propDef.max}
                              disabled={layer.locked}
                              value={Number(currentVal.toFixed(2))}
                              onChange={(e) =>
                                onPropertyScrub(
                                  layer.id,
                                  propDef.key,
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-14 bg-[#141416] border border-[#323236] rounded px-1 py-0.2 text-right font-mono-tabular text-[11px] text-amber-300 focus:outline-none focus:border-[#4772B3]"
                            />
                            <select
                              value={activeEasing}
                              onChange={(e) =>
                                onChangeTrackEasing(
                                  layer.id,
                                  propDef.key,
                                  e.target.value as EasingType
                                )
                              }
                              className="bg-[#141416] border border-[#323236] rounded px-1 text-[10px] text-neutral-300 focus:outline-none"
                              title="Keyframe Interpolation Easing"
                            >
                              <option value="easeInOut">Ease</option>
                              <option value="linear">Lin</option>
                              <option value="spring">Spring</option>
                              <option value="step">Hold</option>
                            </select>
                          </div>
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Time Ruler, Keyframe Diamonds & Playhead */}
        <div
          ref={rulerRef}
          onPointerDown={handleRulerPointerDown}
          onPointerMove={handleRulerPointerMove}
          className="relative flex-1 flex flex-col bg-[#18181B] overflow-hidden cursor-ew-resize"
        >
          {/* Frame Ruler Header */}
          <div className="relative h-6 bg-[#232327] border-b border-[#141416] shrink-0">
            {ticks.map((f) => {
              const leftPct = frameToPercent(f);
              return (
                <div
                  key={f}
                  style={{ left: `${leftPct}%` }}
                  className="absolute top-0 bottom-0 flex flex-col justify-between items-center -translate-x-1/2 pointer-events-none"
                >
                  <span className="text-[10px] font-mono-tabular text-neutral-400 mt-0.5">
                    {f}
                  </span>
                  <div className="w-px h-1.5 bg-neutral-500" />
                </div>
              );
            })}

            {/* Scene Markers */}
            {timeline.markers.map((m) => (
              <div
                key={m.id}
                style={{ left: `${frameToPercent(m.frame)}%` }}
                className="absolute bottom-0 -translate-x-1/2 pointer-events-none hidden sm:flex items-center"
              >
                <span className="text-[9px] text-emerald-400/80 bg-[#142921] px-1 rounded-t border-t border-x border-emerald-500/30">
                  {m.label}
                </span>
              </div>
            ))}
          </div>

          {/* Track Lanes & Keyframe Diamonds */}
          <div className="relative flex-1 overflow-y-auto divide-y divide-[#202024]">
            {layers.map((layer) => {
              const propsList = ANIMATABLE_PROPERTIES.filter(
                (p) => !p.textOnly || layer.type === 'text3d'
              );
              const inPct = frameToPercent(layer.inPoint);
              const outPct = frameToPercent(layer.outPoint);

              // Collect summary keyframes across all tracks of this layer
              const summaryFrames = Array.from(
                new Set(
                  Object.values(layer.tracks).flatMap((t) =>
                    t.map((k) => k.frame)
                  )
                )
              );

              return (
                <div key={layer.id} className="flex flex-col">
                  {/* Layer Bar Row */}
                  <div className="relative h-7 bg-[#1E1E22] flex items-center">
                    {/* AE-Style Colored Layer Duration Bar */}
                    <div
                      style={{
                        left: `${inPct}%`,
                        width: `${Math.max(2, outPct - inPct)}%`,
                        backgroundColor: `${layer.colorTag}44`,
                        borderColor: layer.colorTag,
                      }}
                      className="absolute h-4 rounded-xs border-l-2 border-r-2 flex items-center"
                    />

                    {/* Summary Keyframe Dots on Collapsed Layer Bar */}
                    {summaryFrames.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          onSetCurrentFrame(f);
                        }}
                        style={{ left: `${frameToPercent(f)}%` }}
                        className="absolute -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-amber-400 border border-neutral-900 hover:scale-125 transition-transform z-10"
                        title={`Frame ${f}`}
                      />
                    ))}
                  </div>

                  {/* Expanded Property Keyframe Lanes */}
                  {layer.expanded &&
                    propsList.map((propDef) => {
                      const track = layer.tracks[propDef.key] || [];
                      return (
                        <div
                          key={propDef.key}
                          className="relative h-6 bg-[#161619] border-t border-[#1E1E22] flex items-center"
                        >
                          {/* Subtle connecting line between first and last keyframe */}
                          {track.length >= 2 && (
                            <div
                              style={{
                                left: `${frameToPercent(track[0].frame)}%`,
                                width: `${
                                  frameToPercent(track[track.length - 1].frame) -
                                  frameToPercent(track[0].frame)
                                }%`,
                              }}
                              className="absolute h-0.5 bg-[#4772B3]/40 pointer-events-none"
                            />
                          )}

                          {/* Individual Keyframe Diamonds */}
                          {track.map((kf) => {
                            const isAtPlayhead =
                              Math.round(timeline.currentFrame) === kf.frame;
                            return (
                              <button
                                key={kf.id}
                                type="button"
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                  onSetCurrentFrame(kf.frame);
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  onToggleKeyframeAtCurrent(
                                    layer.id,
                                    propDef.key
                                  );
                                }}
                                style={{ left: `${frameToPercent(kf.frame)}%` }}
                                title={`${propDef.label}: ${kf.value} @ Frame ${kf.frame} (Click to jump, Double-click to remove)`}
                                className={`absolute -translate-x-1/2 w-2.5 h-2.5 rotate-45 border transition-transform hover:scale-125 z-10 ${
                                  isAtPlayhead
                                    ? 'bg-amber-400 border-white scale-110'
                                    : 'bg-[#60A5FA] border-[#1E3A8A]'
                                }`}
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>

          {/* Vertical Playhead Line & Frame Scrub Cap */}
          <div
            style={{ left: `${frameToPercent(timeline.currentFrame)}%` }}
            className="absolute top-0 bottom-0 w-0.5 bg-[#4772B3] pointer-events-none z-30"
          >
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-xs bg-[#4772B3] text-[10px] font-mono-tabular font-bold text-white shadow">
              {Math.round(timeline.currentFrame)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
