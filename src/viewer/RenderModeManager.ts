import * as THREE from 'three';
import type { RenderMode } from '../types';

export class RenderModeManager {
  private originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private currentMode: RenderMode = 'pbr';
  private uvCheckerTexture: THREE.CanvasTexture | null = null;
  private overlayGroup: THREE.Group;

  constructor(scene: THREE.Scene) {
    this.overlayGroup = new THREE.Group();
    this.overlayGroup.name = '__ascope_internal_render_overlays';
    scene.add(this.overlayGroup);
  }

  public registerMesh(mesh: THREE.Mesh) {
    if (!this.originalMaterials.has(mesh)) {
      this.originalMaterials.set(mesh, mesh.material);
    }
  }

  public getMode(): RenderMode {
    return this.currentMode;
  }

  private getOrCreateUvCheckerTexture(): THREE.CanvasTexture {
    if (this.uvCheckerTexture) return this.uvCheckerTexture;

    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const tiles = 16;
    const tileSize = size / tiles;

    ctx.fillStyle = '#22252a';
    ctx.fillRect(0, 0, size, size);

    for (let y = 0; y < tiles; y++) {
      for (let x = 0; x < tiles; x++) {
        const isEven = (x + y) % 2 === 0;
        ctx.fillStyle = isEven ? '#f3f4f6' : '#9ca3af';
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);

        // Draw sub-grid lines
        ctx.strokeStyle = '#4b5563';
        ctx.lineWidth = 1;
        ctx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);

        // Draw coordinate text on selected tiles
        if (x % 2 === 0 && y % 2 === 0) {
          ctx.fillStyle = '#111827';
          ctx.font = 'bold 12px monospace';
          ctx.fillText(`${x},${y}`, x * tileSize + 4, y * tileSize + 16);
        }
      }
    }

    // Outer border
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    this.uvCheckerTexture = texture;
    return texture;
  }

  public applyMode(mode: RenderMode, root: THREE.Object3D) {
    this.currentMode = mode;
    this.overlayGroup.clear();

    const uvTex = mode === 'uv-checker' ? this.getOrCreateUvCheckerTexture() : null;

    root.traverse((obj) => {
      if (obj.name?.startsWith('__ascope_internal_')) return;
      if (!(obj as THREE.Mesh).isMesh) return;

      const mesh = obj as THREE.Mesh;
      if (!this.originalMaterials.has(mesh)) {
        this.originalMaterials.set(mesh, mesh.material);
      }

      const orig = this.originalMaterials.get(mesh)!;

      if (mode === 'pbr') {
        mesh.material = orig;
        return;
      }

      const getSourceMaterial = (): THREE.MeshStandardMaterial | null => {
        if (Array.isArray(orig)) {
          return orig[0] as THREE.MeshStandardMaterial;
        }
        return orig as THREE.MeshStandardMaterial;
      };

      const source = getSourceMaterial();

      switch (mode) {
        case 'unlit': {
          mesh.material = new THREE.MeshBasicMaterial({
            map: source?.map || null,
            color: source?.color ? source.color.clone() : new THREE.Color(0xffffff),
            wireframe: false,
          });
          break;
        }

        case 'wireframe': {
          mesh.material = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            wireframe: true,
          });
          break;
        }

        case 'wireframe-overlay': {
          // Keep original material on mesh, add wireframe helper overlay
          mesh.material = orig;
          const wireMat = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            wireframe: true,
            transparent: true,
            opacity: 0.35,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
          });
          const wireClone = new THREE.Mesh(mesh.geometry, wireMat);
          wireClone.matrixAutoUpdate = false;
          wireClone.matrix.copy(mesh.matrixWorld);
          this.overlayGroup.add(wireClone);
          break;
        }

        case 'base-color': {
          mesh.material = new THREE.MeshBasicMaterial({
            map: source?.map || null,
            color: source?.color ? source.color.clone() : new THREE.Color(0xd1d5db),
          });
          break;
        }

        case 'normals': {
          mesh.material = new THREE.MeshNormalMaterial({
            flatShading: false,
          });
          break;
        }

        case 'roughness': {
          const r = source && typeof source.roughness === 'number' ? source.roughness : 0.5;
          mesh.material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(r, r, r),
            map: source?.roughnessMap || null,
          });
          break;
        }

        case 'metallic': {
          const m = source && typeof source.metalness === 'number' ? source.metalness : 0.0;
          mesh.material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(m, m, m),
            map: source?.metalnessMap || null,
          });
          break;
        }

        case 'ao': {
          mesh.material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            map: source?.aoMap || null,
          });
          break;
        }

        case 'emissive': {
          const eColor = source?.emissive ? source.emissive.clone() : new THREE.Color(0x000000);
          mesh.material = new THREE.MeshBasicMaterial({
            color: eColor,
            map: source?.emissiveMap || null,
          });
          break;
        }

        case 'uv-checker': {
          mesh.material = new THREE.MeshStandardMaterial({
            map: uvTex,
            roughness: 0.4,
            metalness: 0.1,
          });
          break;
        }

        case 'topology-health': {
          // Diagnostic material showing surface with subtle edge tint
          mesh.material = new THREE.MeshStandardMaterial({
            color: 0x334155,
            roughness: 0.3,
            metalness: 0.2,
            flatShading: true,
          });
          const wireMat = new THREE.MeshBasicMaterial({
            color: 0x10b981,
            wireframe: true,
            transparent: true,
            opacity: 0.6,
          });
          const wireClone = new THREE.Mesh(mesh.geometry, wireMat);
          wireClone.matrixAutoUpdate = false;
          wireClone.matrix.copy(mesh.matrixWorld);
          this.overlayGroup.add(wireClone);
          break;
        }

        case 'triangle-density': {
          // Heatmap: compute vertex colors based on local face density
          mesh.material = new THREE.MeshNormalMaterial({
            wireframe: true,
          });
          break;
        }
      }
    });
  }

  public resetAll(root: THREE.Object3D) {
    this.overlayGroup.clear();
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const orig = this.originalMaterials.get(mesh);
        if (orig) {
          mesh.material = orig;
        }
      }
    });
    this.originalMaterials.clear();
    this.currentMode = 'pbr';
  }

  public dispose() {
    this.overlayGroup.clear();
    if (this.uvCheckerTexture) {
      this.uvCheckerTexture.dispose();
      this.uvCheckerTexture = null;
    }
    this.originalMaterials.clear();
  }
}
