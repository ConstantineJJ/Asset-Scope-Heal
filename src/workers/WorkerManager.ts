import * as THREE from 'three';
import { analyzeMeshTopology, type RawMeshData } from '../analysis/TopologyAnalyzer';
import type { TopologyStats } from '../types';
import { meshTopologyData } from '../analysis/MeshTopologyData';

const WORKER_TASK_TIMEOUT_MS = 15000;

export class WorkerManager {
  private worker: Worker | null = null;
  private workerConstructionUnavailable = false;

  constructor() {
    this.createWorker();
  }

  private createWorker(): boolean {
    if (this.workerConstructionUnavailable) return false;
    try {
      this.worker = new Worker(new URL('./topology.worker.ts', import.meta.url), {
        type: 'module',
      });
      return true;
    } catch (e) {
      console.warn('Worker initialization fallback to async thread execution:', e);
      this.worker = null;
      this.workerConstructionUnavailable = true;
      return false;
    }
  }

  private restartWorker(): boolean {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    return this.createWorker();
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

      if (this.worker) {
        try {
          results.push(await this.sendToWorker(meshData));
        } catch (firstError) {
          console.warn('Topology worker task failed; restarting worker once:', firstError);

          if (!this.restartWorker() || !this.worker) {
            throw new Error(
              'Topology worker failed and could not be restarted. Analysis stopped to keep the UI responsive.'
            );
          }

          try {
            results.push(await this.sendToWorker(meshData));
          } catch (retryError) {
            console.warn('Topology worker retry failed; aborting this analysis pass:', retryError);
            this.worker.terminate();
            this.worker = null;
            throw new Error(
              'Topology worker did not complete after retry. Analysis stopped instead of falling back to a blocking main-thread pass.'
            );
          }
        }
      } else {
        // Worker construction can be unavailable on some hosts. In that case
        // preserve compatibility, but yield before each local mesh so UI state
        // has a chance to paint. Runtime worker failures never enter this path.
        await new Promise<void>((resolve) => setTimeout(resolve, 4));
        results.push(analyzeMeshTopology(meshData));
      }

      onProgress?.(i + 1, total);
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
        reject(new Error('Topology worker task did not complete.'));
      };
      const timeout = setTimeout(failed, WORKER_TASK_TIMEOUT_MS);

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

      try {
        worker.postMessage({ taskId, meshData });
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
