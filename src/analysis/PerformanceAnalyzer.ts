import type { AssetSummary, HealthIssue, TextureInfo } from '../types';

export interface PerformanceStats {
  estimatedDrawCalls: number;
  totalTriangles: number;
  totalVertices: number;
  meshCount: number;
  materialCount: number;
  textureCount: number;
  totalTextureVramEstimate: number;
  boneCount: number;
  animationTrackCount: number;
}

export function analyzePerformance(
  summary: AssetSummary,
  textures: TextureInfo[],
  trackCount: number
): { stats: PerformanceStats; issues: HealthIssue[] } {
  let vramTotal = 0;
  let largeTextureCount = 0;
  let ultraLargeTextureCount = 0;

  for (const t of textures) {
    vramTotal += t.uncompressedBytesEstimate;
    if (t.width > 4096 || t.height > 4096) {
      ultraLargeTextureCount++;
    } else if (t.width > 2048 || t.height > 2048) {
      largeTextureCount++;
    }
  }

  // Draw call estimate: each mesh primitive requires at least 1 draw call, multi-materials require more
  const estimatedDrawCalls = summary.primitiveCount || summary.meshCount;

  const stats: PerformanceStats = {
    estimatedDrawCalls,
    totalTriangles: summary.triangleCount,
    totalVertices: summary.vertexCount,
    meshCount: summary.meshCount,
    materialCount: summary.materialCount,
    textureCount: textures.length,
    totalTextureVramEstimate: vramTotal,
    boneCount: summary.boneCount,
    animationTrackCount: trackCount,
  };

  const issues: HealthIssue[] = [];

  if (estimatedDrawCalls > 80) {
    issues.push({
      id: 'perf-draw-calls-high',
      category: 'Performance',
      severity: 'WARNING',
      title: 'High draw call count',
      description: `Estimated ${estimatedDrawCalls} draw calls. Consider batching or merging static geometries for real-time mobile/web performance.`,
      count: estimatedDrawCalls,
      technicalDetails: `Mesh primitives: ${summary.primitiveCount}`,
    });
  } else {
    issues.push({
      id: 'perf-draw-calls-ok',
      category: 'Performance',
      severity: 'OK',
      title: 'Draw call budget optimal',
      description: `Asset requires ~${estimatedDrawCalls} draw call(s), suitable for real-time rasterization.`,
      count: estimatedDrawCalls,
    });
  }

  if (ultraLargeTextureCount > 0) {
    issues.push({
      id: 'perf-ultra-large-textures',
      category: 'Textures',
      severity: 'WARNING',
      title: 'Textures exceeding 4096px detected',
      description: `${ultraLargeTextureCount} texture(s) have dimension > 4096 px. May exhaust mobile GPU memory limits.`,
      count: ultraLargeTextureCount,
    });
  }

  if (largeTextureCount > 0 && ultraLargeTextureCount === 0) {
    issues.push({
      id: 'perf-large-textures-info',
      category: 'Textures',
      severity: 'INFO',
      title: 'Textures above 2048px detected',
      description: `${largeTextureCount} texture(s) have 4K (4096px) resolution. Ensure target platforms have adequate VRAM.`,
      count: largeTextureCount,
    });
  }

  if (summary.triangleCount > 300000) {
    issues.push({
      id: 'perf-triangle-high',
      category: 'Performance',
      severity: 'WARNING',
      title: 'High triangle count for real-time delivery',
      description: `Asset contains ${summary.triangleCount.toLocaleString()} triangles. Recommend LOD generation for low-end devices.`,
      count: summary.triangleCount,
    });
  }

  return { stats, issues };
}
