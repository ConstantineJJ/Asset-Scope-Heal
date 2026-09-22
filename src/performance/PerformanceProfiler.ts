import * as THREE from 'three';
import type {
  PerformanceCoreProfile,
  PerformanceMemoryStats,
  PerformanceStageId,
  PerformanceTimingSample,
  TopologyPerformanceStats,
} from '../types';

export interface BrowserMemoryInfo {
  usedJSHeapSize?: number;
  jsHeapSizeLimit?: number;
}

export function createEmptyPerformanceProfile(): PerformanceCoreProfile {
  return {
    timings: {},
    topology: {
      meshCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      extractionMs: 0,
      workerMs: 0,
      transferredBytes: 0,
    },
    memory: {
      sourceGlbBytes: 0,
      liveGeometryBytes: 0,
      undoSnapshotsBytes: 0,
      repairPreviewBytes: 0,
      exportBufferBytes: 0,
      pristineExportGeometryBytes: 0,
      reopenedVerificationGeometryBytes: 0,
    },
    cancelledAnalyses: 0,
  };
}

export function addTimingSample(
  profile: PerformanceCoreProfile,
  stage: PerformanceStageId,
  durationMs: number
): PerformanceCoreProfile {
  if (!Number.isFinite(durationMs) || durationMs < 0) return profile;
  const previous = profile.timings[stage];
  const next: PerformanceTimingSample = previous
    ? {
        lastMs: durationMs,
        bestMs: Math.min(previous.bestMs, durationMs),
        worstMs: Math.max(previous.worstMs, durationMs),
        averageMs: (previous.averageMs * previous.samples + durationMs) / (previous.samples + 1),
        samples: previous.samples + 1,
      }
    : {
        lastMs: durationMs,
        bestMs: durationMs,
        worstMs: durationMs,
        averageMs: durationMs,
        samples: 1,
      };

  return {
    ...profile,
    timings: { ...profile.timings, [stage]: next },
  };
}

export function replaceTopologyPerformance(
  profile: PerformanceCoreProfile,
  topology: TopologyPerformanceStats
): PerformanceCoreProfile {
  return { ...profile, topology };
}

export function updateMemoryStats(
  profile: PerformanceCoreProfile,
  memory: Partial<PerformanceMemoryStats>
): PerformanceCoreProfile {
  return {
    ...profile,
    memory: { ...profile.memory, ...memory },
  };
}

export function estimateGeometryBytes(geometry: THREE.BufferGeometry): number {
  const seen = new Set<ArrayBufferLike>();
  let bytes = 0;
  const addAttribute = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
    const array = attribute.array;
    if (!seen.has(array.buffer)) {
      seen.add(array.buffer);
      bytes += array.byteLength;
    }
  };

  Object.values(geometry.attributes).forEach(addAttribute);
  Object.values(geometry.morphAttributes).forEach((attributes) => attributes.forEach(addAttribute));
  if (geometry.index) addAttribute(geometry.index);
  return bytes;
}

export function estimateObjectGeometryBytes(root: THREE.Object3D | null): number {
  if (!root) return 0;
  const seen = new Set<THREE.BufferGeometry>();
  let bytes = 0;
  root.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const geometry = (object as THREE.Mesh).geometry;
    if (!geometry || seen.has(geometry)) return;
    seen.add(geometry);
    bytes += estimateGeometryBytes(geometry);
  });
  return bytes;
}

export function readBrowserHeap(): BrowserMemoryInfo {
  const perf = performance as Performance & { memory?: BrowserMemoryInfo };
  return {
    usedJSHeapSize: perf.memory?.usedJSHeapSize,
    jsHeapSizeLimit: perf.memory?.jsHeapSizeLimit,
  };
}

export function nowMs(): number {
  return performance.now();
}
