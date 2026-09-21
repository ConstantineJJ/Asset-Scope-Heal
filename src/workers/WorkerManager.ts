import * as THREE from 'three';
import { analyzeMeshTopology, type RawMeshData } from '../analysis/TopologyAnalyzer';
import type { TopologyStats } from '../types';

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

    const overallBox = new THREE.Box3().setFromObject(root);
    const overallDiag = overallBox.isEmpty()
      ? 1
      : overallBox.getSize(new THREE.Vector3()).length();

    root.updateMatrixWorld(true);

    root.traverse((obj) => {
      if (obj.name?.startsWith('__ascope_internal_')) return;
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const geom = mesh.geometry;
        if (!geom || !geom.attributes.position) return;

        const posAttr = geom.attributes.position;
        const posArray = new Float32Array(posAttr.array);

        let indexArray: Uint16Array | Uint32Array | null = null;
        if (geom.index) {
          if (geom.index.array instanceof Uint32Array) {
            indexArray = new Uint32Array(geom.index.array);
          } else {
            indexArray = new Uint16Array(geom.index.array);
          }
        }

        rawMeshes.push({
          uuid: mesh.uuid,
          name: mesh.name || `Mesh_${mesh.id}`,
          positions: posArray,
          indices: indexArray,
          boundingBoxDiagonal: overallDiag,
          worldMatrix: Array.from(mesh.matrixWorld.elements),
        });
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

      const handler = (e: MessageEvent) => {
        if (e.data && e.data.taskId === taskId) {
          this.worker?.removeEventListener('message', handler);
          if (e.data.success) {
            resolve(e.data.stats);
          } else {
            reject(new Error(e.data.error || 'Worker task failed'));
          }
        }
      };

      this.worker.addEventListener('message', handler);

      // Pass transferable buffers where feasible
      try {
        this.worker.postMessage({ taskId, meshData });
      } catch (err) {
        this.worker.removeEventListener('message', handler);
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
