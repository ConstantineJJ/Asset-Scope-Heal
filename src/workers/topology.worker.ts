import { analyzeMeshTopology, type RawMeshData } from '../analysis/TopologyAnalyzer';

// Web Worker context for background topology processing
self.onmessage = (e: MessageEvent<{ taskId: string; meshData: RawMeshData }>) => {
  const { taskId, meshData } = e.data;
  try {
    const stats = analyzeMeshTopology(meshData);
    self.postMessage({ taskId, success: true, stats });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ taskId, success: false, error: message });
  }
};
