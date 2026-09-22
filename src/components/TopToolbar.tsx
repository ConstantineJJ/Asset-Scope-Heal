import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Camera,
  CheckCircle2,
  ChevronDown,
  Eye,
  Grid,
  Layers,
  Maximize2,
  Menu,
  Orbit,
  Palette,
  Play,
  RotateCcw,
  Sliders,
  Sun,
  TestTube2,
  Upload,
  Download,
  Zap,
  Languages,
} from 'lucide-react';
import type { LightingPreset, RenderMode } from '../types';
import { useI18n } from '../i18n';

interface TopToolbarProps {
  onOpenFile: (file: File) => void;
  onExport: () => void;
  canExport: boolean;
  exportBusy: boolean;
  onSelectSample: (sampleId: string) => void;
  renderMode: RenderMode;
  onSetRenderMode: (mode: RenderMode) => void;
  lightingPreset: LightingPreset;
  onSetLightingPreset: (preset: LightingPreset) => void;
  onFrameAll: () => void;
  onFocusSelected: () => void;
  onFrameRawBounds?: () => void;
  onResetCamera: (preset: 'perspective' | 'front' | 'top' | 'right') => void;
  toggles: {
    grid: boolean;
    axes: boolean;
    bbox: boolean;
    skeleton: boolean;
    origin: boolean;
  };
  onToggleHelper: (helper: 'grid' | 'axes' | 'bbox' | 'skeleton' | 'origin') => void;
  explodedAmount: number;
  onSetExplodedAmount: (amount: number) => void;
  onOpenUnitTests: () => void;
  triangleCount: number;
  fps: number;
  isAnalyzing: boolean;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
  onOpenFile,
  onExport,
  canExport,
  exportBusy,
  onSelectSample,
  renderMode,
  onSetRenderMode,
  lightingPreset,
  onSetLightingPreset,
  onFrameAll,
  onFocusSelected,
  onFrameRawBounds,
  onResetCamera,
  toggles,
  onToggleHelper,
  explodedAmount,
  onSetExplodedAmount,
  onOpenUnitTests,
  triangleCount,
  fps,
  isAnalyzing,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sampleMenuRef = useRef<HTMLDivElement>(null);
  const [sampleMenuOpen, setSampleMenuOpen] = useState(false);
  const { language, setLanguage, t } = useI18n();

  useEffect(() => {
    if (!sampleMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!sampleMenuRef.current?.contains(event.target as Node)) {
        setSampleMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSampleMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [sampleMenuOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onOpenFile(e.target.files[0]);
      e.target.value = '';
    }
  };

  return (
    <header className="h-12 bg-[#181a1e] border-b border-[#2a2d34] flex items-center justify-between px-3 text-xs text-gray-200 select-none z-30 shrink-0">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Left: App Logo & File Operations */}
      <div className="flex items-center space-x-2.5">
        <div className="flex items-center space-x-2 pr-3 border-r border-[#2d313a]">
          <img
            src="/asset-doctor-icon.jpg"
            alt="Asset Doctor"
            className="w-6 h-6 rounded object-cover shadow-sm"
          />
          <span className="font-bold tracking-tight text-gray-100 hidden sm:inline text-sm">
            Asset <span className="text-cyan-400 font-light">Doctor</span>
          </span>
        </div>

        {/* Open GLB Button */}
        <button
          id="btn-open-file"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded bg-[#252830] hover:bg-[#2e323c] border border-[#373b46] text-gray-100 font-medium transition cursor-pointer"
          title={t('toolbar.openFileTitle')}
        >
          <Upload className="w-3.5 h-3.5 text-cyan-400" />
          <span>{t('toolbar.openFile')}</span>
        </button>

        {/* Export Repaired GLB Button */}
        <button
          id="btn-export-file"
          onClick={onExport}
          disabled={!canExport || exportBusy}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded bg-[#252830] hover:bg-[#2e323c] border border-[#373b46] text-gray-100 font-medium transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          title={canExport ? t('toolbar.exportTitle') : t('toolbar.exportDisabledTitle')}
        >
          <Download className="w-3.5 h-3.5 text-emerald-400" />
          <span>{exportBusy ? t('toolbar.exporting') : t('toolbar.export')}</span>
        </button>

        {/* Sample Models Dropdown */}
        <div ref={sampleMenuRef} className="relative">
          <button
            id="btn-sample-models"
            type="button"
            aria-haspopup="menu"
            aria-expanded={sampleMenuOpen}
            onClick={() => setSampleMenuOpen((open) => !open)}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded bg-[#1f2228] hover:bg-[#272a32] border border-[#323642] text-gray-300 font-medium transition cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden md:inline">{t('toolbar.samples')}</span>
            <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${sampleMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {sampleMenuOpen && (
            <div
              role="menu"
              className="absolute left-0 top-full mt-1 w-72 bg-[#1e2127] border border-[#333742] rounded-md shadow-xl py-1 z-50"
            >
              <div className="px-3 py-1 text-[10px] uppercase font-semibold text-gray-400 border-b border-[#2d313a]">
                {t('toolbar.builtInModels')}
              </div>
              <button
                role="menuitem"
                onClick={() => {
                  onSelectSample('test-patient');
                  setSampleMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2.5 hover:bg-[#282c35] flex flex-col cursor-pointer"
              >
                <span className="font-medium text-amber-300">Asset Doctor Test Patient</span>
                <span className="text-[10px] leading-relaxed text-gray-400">
                  {t('toolbar.testPatientDescription')}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Unit Tests Button */}
        <button
          id="btn-topology-tests"
          onClick={onOpenUnitTests}
          className="hidden lg:flex items-center space-x-1.5 px-2 py-1.5 rounded bg-[#1f2228] hover:bg-[#272a32] border border-[#323642] text-emerald-400 hover:text-emerald-300 transition cursor-pointer"
          title={t('toolbar.topologyTestsTitle')}
        >
          <TestTube2 className="w-3.5 h-3.5" />
          <span>{t('toolbar.topologyTests')}</span>
        </button>
      </div>

      {/* Center: Render Mode & Lighting Controls */}
      <div className="flex items-center space-x-2">
        {/* Render Mode Select */}
        <div className="flex items-center space-x-1 bg-[#1e2127] px-2 py-1 rounded border border-[#2d313a]">
          <Palette className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-gray-400 text-[11px] hidden xl:inline">{t('toolbar.mode')}</span>
          <select
            id="select-render-mode"
            value={renderMode}
            onChange={(e) => onSetRenderMode(e.target.value as RenderMode)}
            className="bg-transparent text-gray-200 text-xs focus:outline-none cursor-pointer font-medium"
          >
            <option value="pbr" className="bg-[#1e2127]">PBR Realistic</option>
            <option value="unlit" className="bg-[#1e2127]">Unlit</option>
            <option value="wireframe" className="bg-[#1e2127]">Wireframe</option>
            <option value="wireframe-overlay" className="bg-[#1e2127]">Wireframe Overlay</option>
            <option value="base-color" className="bg-[#1e2127]">Base Color (Albedo)</option>
            <option value="normals" className="bg-[#1e2127]">Normals</option>
            <option value="roughness" className="bg-[#1e2127]">Roughness Map</option>
            <option value="metallic" className="bg-[#1e2127]">Metallic Map</option>
            <option value="ao" className="bg-[#1e2127]">Ambient Occlusion</option>
            <option value="emissive" className="bg-[#1e2127]">Emissive Only</option>
            <option value="uv-checker" className="bg-[#1e2127]">UV Checker Grid</option>
            <option value="topology-health" className="bg-[#1e2127]">Topology Diagnostic Mode</option>
            <option value="triangle-density" className="bg-[#1e2127]">Triangle Density Heatmap</option>
          </select>
        </div>

        {/* Lighting Preset Select */}
        <div className="hidden sm:flex items-center space-x-1 bg-[#1e2127] px-2 py-1 rounded border border-[#2d313a]">
          <Sun className="w-3.5 h-3.5 text-amber-400" />
          <select
            id="select-lighting-preset"
            value={lightingPreset}
            onChange={(e) => onSetLightingPreset(e.target.value as LightingPreset)}
            className="bg-transparent text-gray-200 text-xs focus:outline-none cursor-pointer font-medium"
          >
            <option value="neutral-studio" className="bg-[#1e2127]">Neutral Studio</option>
            <option value="soft-studio" className="bg-[#1e2127]">Soft Studio</option>
            <option value="hard-studio" className="bg-[#1e2127]">Hard Studio</option>
            <option value="outdoor" className="bg-[#1e2127]">Outdoor Daylight</option>
            <option value="sunset" className="bg-[#1e2127]">Sunset Warm</option>
            <option value="top-light" className="bg-[#1e2127]">Top Spotlight</option>
            <option value="rim-light" className="bg-[#1e2127]">Rim Light Silhouette</option>
            <option value="dark-studio" className="bg-[#1e2127]">Dark Studio</option>
          </select>
        </div>

        {/* Camera Views Quick Switch */}
        <div className="hidden md:flex items-center space-x-1 bg-[#1e2127] p-0.5 rounded border border-[#2d313a]">
          <button
            onClick={onFrameAll}
            className="px-1.5 py-1 rounded hover:bg-[#282c35] text-gray-300 hover:text-white transition"
            title="Frame Model (Fit to view)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onFocusSelected}
            className="px-1.5 py-1 rounded hover:bg-[#282c35] text-gray-300 hover:text-white transition"
            title="Focus Selected Part"
          >
            <Orbit className="w-3.5 h-3.5" />
          </button>
          {onFrameRawBounds && (
            <button
              onClick={onFrameRawBounds}
              className="px-1.5 py-0.5 text-[9px] uppercase font-mono tracking-wider text-amber-400 hover:text-amber-200 hover:bg-[#282c35] rounded border border-amber-500/30"
              title="Debug: Frame Raw (Unskinned) Bounds"
            >
              Raw
            </button>
          )}
          <div className="h-3 w-px bg-[#323642]" />
          <button
            onClick={() => onResetCamera('perspective')}
            className="px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-white hover:bg-[#282c35] rounded"
          >
            Persp
          </button>
          <button
            onClick={() => onResetCamera('top')}
            className="px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-white hover:bg-[#282c35] rounded"
          >
            Top
          </button>
          <button
            onClick={() => onResetCamera('front')}
            className="px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-white hover:bg-[#282c35] rounded"
          >
            Front
          </button>
        </div>
      </div>

      {/* Right: Language, Exploded View, Viewport Helpers, Metrics */}
      <div className="flex items-center space-x-2">
        <div className="hidden lg:flex items-center space-x-1 bg-[#1e2127] px-1.5 py-1 rounded border border-[#2d313a]">
          <Languages className="w-3.5 h-3.5 text-cyan-400" />
          <select
            aria-label={t('language.label')}
            value={language}
            onChange={(e) => setLanguage(e.target.value as 'en' | 'ru')}
            className="bg-transparent text-gray-300 text-[10px] font-mono focus:outline-none cursor-pointer"
          >
            <option value="en" className="bg-[#1e2127]">EN</option>
            <option value="ru" className="bg-[#1e2127]">RU</option>
          </select>
        </div>
        {/* Exploded View Slider */}
        <div className="hidden xl:flex items-center space-x-1.5 bg-[#1e2127] px-2.5 py-1 rounded border border-[#2d313a]">
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[11px] text-gray-300">{t('toolbar.explode')}</span>
          <input
            id="slider-explode"
            type="range"
            min="0"
            max="100"
            value={explodedAmount}
            onChange={(e) => onSetExplodedAmount(Number(e.target.value))}
            className="w-16 h-1 accent-cyan-400 cursor-pointer"
            title="Non-destructive exploded segmentation displacement"
          />
          <span className="font-mono text-[10px] text-gray-400 w-6 text-right">
            {explodedAmount}%
          </span>
        </div>

        {/* Viewport Overlay Toggles */}
        <div className="flex items-center bg-[#1e2127] p-0.5 rounded border border-[#2d313a]">
          <button
            onClick={() => onToggleHelper('grid')}
            className={`px-1.5 py-1 rounded transition ${
              toggles.grid ? 'bg-blue-600/30 text-blue-400 font-bold' : 'text-gray-400 hover:text-gray-200'
            }`}
            title="Toggle Ground Grid"
          >
            <Grid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onToggleHelper('bbox')}
            className={`px-1.5 py-1 rounded transition ${
              toggles.bbox ? 'bg-amber-600/30 text-amber-400 font-bold' : 'text-gray-400 hover:text-gray-200'
            }`}
            title="Toggle Bounding Box"
          >
            <Box className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onToggleHelper('skeleton')}
            className={`px-1.5 py-1 rounded transition ${
              toggles.skeleton ? 'bg-purple-600/30 text-purple-400 font-bold' : 'text-gray-400 hover:text-gray-200'
            }`}
            title="Toggle Skeletal Armature"
          >
            <Zap className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Performance & Analysis Status Badges */}
        <div className="flex items-center space-x-1.5 pl-1.5 border-l border-[#2d313a]">
          {isAnalyzing && (
            <div className="flex items-center space-x-1 px-2 py-0.5 rounded bg-blue-950/60 border border-blue-800 text-blue-400 text-[10px] animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
              <span>{t('toolbar.analyzing')}</span>
            </div>
          )}

          <div className="hidden sm:flex flex-col items-end text-[10px] font-mono leading-tight">
            <span className="text-gray-300">
              {triangleCount.toLocaleString()} <span className="text-gray-400">tri</span>
            </span>
            <span className="text-emerald-400">
              {fps} <span className="text-gray-400">fps</span>
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
