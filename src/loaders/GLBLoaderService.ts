import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import {
  estimateObjectGeometryBytes,
  nowMs,
  performanceCore,
} from '../performance/PerformanceProfiler';

export interface LoadedModelResult {
  fileName: string;
  fileSizeBytes?: number;
  root: THREE.Group;
  animations: THREE.AnimationClip[];
  sourceBuffer?: ArrayBuffer;
}

export class GLBLoaderService {
  private gltfLoader: GLTFLoader;
  private dracoLoader: DRACOLoader | null = null;

  constructor() {
    this.gltfLoader = new GLTFLoader();

    // Configure DRACO loader with standard Google/Three.js CDN decoder path as fallback
    try {
      this.dracoLoader = new DRACOLoader();
      this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
      this.gltfLoader.setDRACOLoader(this.dracoLoader);
    } catch (e) {
      console.warn('DRACOLoader initialization notice:', e);
    }
  }

  public async loadFromFile(file: File): Promise<LoadedModelResult> {
    const startedAt = nowMs();
    const arrayBuffer = await file.arrayBuffer();
    const result = await this.loadFromArrayBuffer(arrayBuffer, file.name, file.size);

    performanceCore.resetForAsset(
      arrayBuffer.byteLength,
      estimateObjectGeometryBytes(result.root)
    );
    performanceCore.record('initialLoad', nowMs() - startedAt);

    // GLTFLoader.parse does not mutate the source ArrayBuffer. Keep the original
    // buffer as the pristine export source instead of retaining an unnecessary
    // full-size copy beside it (important for multi-hundred-MB assets).
    return { ...result, sourceBuffer: arrayBuffer };
  }

  public async loadFromArrayBuffer(
    buffer: ArrayBuffer,
    fileName: string = 'model.glb',
    fileSizeBytes?: number
  ): Promise<LoadedModelResult> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.parse(
        buffer,
        '',
        (gltf) => {
          const root = gltf.scene || new THREE.Group();
          if (!root.name) {
            root.name = fileName.replace(/\.[^/.]+$/, '');
          }
          resolve({
            fileName,
            fileSizeBytes: fileSizeBytes ?? buffer.byteLength,
            root,
            animations: gltf.animations || [],
          });
        },
        (error) => {
          reject(new Error(`Failed to parse GLB model: ${error}`));
        }
      );
    });
  }

  public async loadFromUrl(url: string, fileName?: string): Promise<LoadedModelResult> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        url,
        (gltf) => {
          const name = fileName || url.split('/').pop() || 'model.glb';
          const root = gltf.scene || new THREE.Group();
          resolve({
            fileName: name,
            root,
            animations: gltf.animations || [],
          });
        },
        undefined,
        (err) => {
          reject(new Error(`Failed to load GLB from URL: ${err}`));
        }
      );
    });
  }

  public dispose() {
    if (this.dracoLoader) {
      this.dracoLoader.dispose();
      this.dracoLoader = null;
    }
  }
}
