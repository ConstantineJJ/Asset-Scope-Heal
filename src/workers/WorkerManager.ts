import * as THREE from 'three';
import { analyzeMeshTopology, type RawMeshData } from '../analysis/TopologyAnalyzer';
import type { TopologyStats } from '../types';
import { meshTopologyData } from '../analysis/MeshTopologyData';

export class WorkerManager {
  private worker: Worker | null = null;
  private workerFailed: boolean = false;

  constructor() {
    try {
      this.worker = new Worker(new URL('./topology.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch (e) {
      console.warn('Worker initialization fallback to async thread execution:', e);
      this.workerFailed = true;
    }
  }

  public async analyzeMeshes(
    root: THREE.Object3D,
    onProgress?: (completed: number, total: number) => void
  ): Promise<TopologyStats[]> {
    const rawMeshes: RawMeshData[] = [];

    root.updateMatrixWorld(true);

    root.traverse((obj) => {
      if (obj.name?.startsWith('__ascope_internal_')) return;
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const geom = mesh.geometry;
        if (!geom || !geom.attributes.position) return;

        rawMeshes.push(meshTopologyData(mesh));
      }
    });

    const results: TopologyStats[] = [];
    const total = rawMeshes.length;
    if (total === 0) return results;

    for (let i = 0; i < total; i++) {
      const meshData = rawMeshes[i];

      if (this.worker && !this.workerFailed) {
        try {
          const stats = await this.sendToWorker(meshData);
          results.push(stats);
        } catch (err) {
          console.warn('Worker task failed, falling back to local thread:', err);
          const stats = analyzeMeshTopology(meshData);
          results.push(stats);
        }
      } else {
        // Yield to allow UI frame rendering between meshes
        await new Promise((r) => setTimeout(r, 4));
        const stats = analyzeMeshTopology(meshData);
        results.push(stats);
      }

      if (onProgress) {
        onProgress(i + 1, total);
      }
    }

    return results;
  }

  private sendToWorker(meshData: RawMeshData): Promise<TopologyStats> {
    return new Promise((resolve, reject) => {
      if (!this.worker) return reject(new Error('Worker not available'));

      const taskId = `task_${Math.random().toString(36).slice(2, 9)}`;
      const worker = this.worker;
      const cleanup = () => {
        clearTimeout(timeout);
        worker.removeEventListener('message', handler);
        worker.removeEventListener('error', failed);
        worker.removeEventListener('messageerror', failed);
      };
      const failed = () => {
        cleanup();
        this.workerFailed = true;
        reject(new Error('Topology worker did not complete; retrying locally.'));
      };
      // A crashed worker must not leave post-heal verification pending forever.
      const timeout = setTimeout(failed, 15000);

      const handler = (e: MessageEvent) => {
        if (e.data && e.data.taskId === taskId) {
          cleanup();
          if (e.data.success) {
            resolve(e.data.stats);
          } else {
            reject(new Error(e.data.error || 'Worker task failed'));
          }
        }
      };

      worker.addEventListener('message', handler);
      worker.addEventListener('error', failed);
      worker.addEventListener('messageerror', failed);

      // Pass transferable buffers where feasible
      try {
        this.worker.postMessage({ taskId, meshData });
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }

  public dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
