import type { AssetSummary, DiagnosticProfileId, HealthIssue, TextureInfo } from '../types';
import { getDiagnosticProfile } from '../health/DiagnosticProfiles';

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
  trackCount: number,
  profileId: DiagnosticProfileId = 'general'
): { stats: PerformanceStats; issues: HealthIssue[] } {
  const profile = getDiagnosticProfile(profileId);
  let vramTotal = 0;
  let largeTextureCount = 0;
  let ultraLargeTextureCount = 0;

  for (const t of textures) {
    vramTotal += t.uncompressedBytesEstimate;
    if (t.width > profile.textureDimensionWarning || t.height > profile.textureDimensionWarning) {
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

  if (estimatedDrawCalls > profile.drawCallWarning) {
    issues.push({
      id: 'perf-draw-calls-high',
      category: 'Performance',
      severity: 'WARNING',
      title: 'High draw call count',
      description: `Estimated ${estimatedDrawCalls} draw calls exceed the ${profile.label} reference threshold of ${profile.drawCallWarning}. This is a target-fit warning, not a structural defect.`,
      count: estimatedDrawCalls,
      technicalDetails: `Mesh primitives: ${summary.primitiveCount}`,
    });
  } else {
    issues.push({
      id: 'perf-draw-calls-ok',
      category: 'Performance',
      severity: 'OK',
      title: 'Draw call budget optimal',
      description: `Asset requires ~${estimatedDrawCalls} draw call(s), within the ${profile.label} reference threshold (${profile.drawCallWarning}).`,
      count: estimatedDrawCalls,
    });
  }

  if (ultraLargeTextureCount > 0) {
    issues.push({
      id: 'perf-ultra-large-textures',
      category: 'Textures',
      severity: 'WARNING',
      title: `Textures exceeding ${profile.textureDimensionWarning}px detected`,
      description: `${ultraLargeTextureCount} texture(s) exceed the ${profile.label} reference texture dimension of ${profile.textureDimensionWarning}px.`,
      count: ultraLargeTextureCount,
    });
  }

  if (largeTextureCount > 0 && ultraLargeTextureCount === 0) {
    issues.push({
      id: 'perf-large-textures-info',
      category: 'Textures',
      severity: 'INFO',
      title: 'Textures above 2048px detected',
      description: `${largeTextureCount} texture(s) exceed 2048px but remain within the ${profile.label} reference limit of ${profile.textureDimensionWarning}px.`,
      count: largeTextureCount,
    });
  }

  if (summary.triangleCount > profile.triangleWarning) {
    issues.push({
      id: 'perf-triangle-high',
      category: 'Performance',
      severity: 'WARNING',
      title: 'High triangle count for real-time delivery',
      description: `Asset contains ${summary.triangleCount.toLocaleString()} triangles, above the ${profile.label} reference threshold of ${profile.triangleWarning.toLocaleString()}. This does not mean the mesh is unhealthy.`,
      count: summary.triangleCount,
    });
  }

  return { stats, issues };
}
