import React, { useEffect, useRef, useState } from 'react';
import { Box, FileUp, Loader2, Maximize2, Orbit } from 'lucide-react';
import type { RenderMode } from '../types';

interface ViewportProps {
  onCanvasMount: (container: HTMLElement) => void | (() => void);
  onFileDrop: (file: File) => void;
  isLoading: boolean;
  fileName?: string;
  renderMode: RenderMode;
  triangleCount: number;
}

export const Viewport: React.FC<ViewportProps> = ({
  onCanvasMount,
  onFileDrop,
  isLoading,
  fileName,
  renderMode,
  triangleCount,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    return onCanvasMount(containerRef.current);
  }, [onCanvasMount]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (
        file.name.toLowerCase().endsWith('.glb') ||
        file.name.toLowerCase().endsWith('.gltf')
      ) {
        onFileDrop(file);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex-1 h-full bg-[#131518] overflow-hidden focus:outline-none select-none"
    >
      {/* Top Left HUD Overlay */}
      {fileName && (
        <div className="absolute top-3 left-3 z-10 flex items-center space-x-2 bg-[#191b21]/80 backdrop-blur-xs border border-[#2d313b] px-2.5 py-1 rounded text-xs text-gray-200 pointer-events-none shadow-md">
          <Box className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-semibold">{fileName}</span>
          <span className="text-[#4b5563]">•</span>
          <span className="font-mono text-gray-400">
            {triangleCount.toLocaleString()} triangles
          </span>
          <span className="text-[#4b5563]">•</span>
          <span className="uppercase text-[10px] text-blue-400 font-mono">
            {renderMode}
          </span>
        </div>
      )}

      {/* Bottom Left Navigation Hints */}
      <div className="absolute bottom-3 left-3 z-10 hidden md:flex items-center space-x-1.5 pointer-events-none text-[10px] text-gray-400 font-mono">
        <span className="bg-[#181a20]/80 backdrop-blur-xs px-2 py-0.5 rounded border border-[#2c303a]">
          L-Click: Orbit
        </span>
        <span className="bg-[#181a20]/80 backdrop-blur-xs px-2 py-0.5 rounded border border-[#2c303a]">
          R-Click: Pan
        </span>
        <span className="bg-[#181a20]/80 backdrop-blur-xs px-2 py-0.5 rounded border border-[#2c303a]">
          Scroll: Zoom
        </span>
        <span className="bg-[#181a20]/80 backdrop-blur-xs px-2 py-0.5 rounded border border-[#2c303a]">
          Click Mesh: Select
        </span>
      </div>

      {/* Drag & Drop Overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-40 bg-blue-950/70 backdrop-blur-xs border-4 border-dashed border-cyan-400 flex flex-col items-center justify-center text-white pointer-events-none transition-all">
          <FileUp className="w-12 h-12 text-cyan-400 mb-2 animate-bounce" />
          <h3 className="text-lg font-bold">Drop GLB / GLTF Asset Here</h3>
          <p className="text-xs text-cyan-200 mt-1">
            Immediate parsing, viewport framing, and background diagnostics
          </p>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-30 bg-[#131518]/80 backdrop-blur-xs flex flex-col items-center justify-center text-gray-200 pointer-events-none">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mb-2" />
          <span className="text-xs font-medium">Parsing 3D Asset Buffers...</span>
        </div>
      )}
    </div>
  );
};
