import * as THREE from 'three';
import { CameraController } from './CameraController';
import { ExplodedViewController } from './ExplodedViewController';
import { LightingManager } from './LightingManager';
import { RenderModeManager } from './RenderModeManager';
import type { LightingConfig, LightingPreset, RenderMode } from '../types';

export interface SceneManagerCallbacks {
  onMeshSelected?: (uuid: string | null) => void;
  onAnimationTimeUpdate?: (time: number, duration: number) => void;
}

export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public cameraController: CameraController;
  public lightingManager: LightingManager;
  public renderModeManager: RenderModeManager;
  public explodedViewController: ExplodedViewController;

  private container: HTMLElement;
  private currentAssetRoot: THREE.Group | null = null;
  private animationMixer: THREE.AnimationMixer | null = null;
  private activeAnimationAction: THREE.AnimationAction | null = null;
  private animationClips: THREE.AnimationClip[] = [];
  private clock: THREE.Clock;
  private isPlayingAnimation: boolean = false;
  private animationSpeed: number = 1.0;
  private animationLoop: boolean = true;

  // Helpers
  private gridHelper: THREE.GridHelper | null = null;
  private axesHelper: THREE.AxesHelper | null = null;
  private bboxHelper: THREE.Box3Helper | null = null;
  private originHelper: THREE.Group | null = null;
  private skeletonHelper: THREE.SkeletonHelper | null = null;
  private selectionBoxHelper: THREE.BoxHelper | null = null;

  private isGridVisible: boolean = true;
  private isAxesVisible: boolean = true;
  private isBboxVisible: boolean = false;
  private isSkeletonVisible: boolean = false;
  private isOriginVisible: boolean = true;

  private selectedMeshUuid: string | null = null;
  private callbacks: SceneManagerCallbacks = {};
  private animationFrameId: number | null = null;
  private raycaster: THREE.Raycaster;
  private mouseVector: THREE.Vector2;

  // Stats
  public fps: number = 60;
  private frameCount: number = 0;
  private lastFpsTime: number = performance.now();

  constructor(container: HTMLElement, callbacks: SceneManagerCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.mouseVector = new THREE.Vector2();

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x131518);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 2000);
    this.camera.position.set(3, 2.5, 4);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(this.renderer.domElement);

    this.cameraController = new CameraController(this.camera, this.renderer.domElement);
    this.lightingManager = new LightingManager(this.scene);
    this.renderModeManager = new RenderModeManager(this.scene);
    this.explodedViewController = new ExplodedViewController();

    this.initHelpers();
    this.bindEvents();
    this.startRenderLoop();
  }

  private initHelpers() {
    // Ground Grid (Blender dark style)
    this.gridHelper = new THREE.GridHelper(30, 60, 0x3b82f6, 0x272b32);
    this.gridHelper.position.y = 0;
    this.gridHelper.name = '__ascope_internal_grid';
    this.gridHelper.visible = this.isGridVisible;
    this.scene.add(this.gridHelper);

    // Axes
    this.axesHelper = new THREE.AxesHelper(2);
    this.axesHelper.name = '__ascope_internal_axes';
    this.axesHelper.visible = this.isAxesVisible;
    this.scene.add(this.axesHelper);

    // Origin Marker (small crosshair)
    this.originHelper = new THREE.Group();
    this.originHelper.name = '__ascope_internal_origin';
    const originSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true })
    );
    this.originHelper.add(originSphere);
    this.originHelper.visible = this.isOriginVisible;
    this.scene.add(this.originHelper);
  }

  private bindEvents() {
    this.onWindowResize = this.onWindowResize.bind(this);
    window.addEventListener('resize', this.onWindowResize);

    // Viewport click selection
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      // Only select on left click without heavy dragging
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startY = e.clientY;

      const onPointerUp = (upEvt: PointerEvent) => {
        window.removeEventListener('pointerup', onPointerUp);
        const dist = Math.hypot(upEvt.clientX - startX, upEvt.clientY - startY);
        if (dist < 4) {
          this.handleViewportClick(upEvt);
        }
      };
      window.addEventListener('pointerup', onPointerUp);
    });
  }

  private handleViewportClick(e: PointerEvent) {
    if (!this.currentAssetRoot) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouseVector.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseVector.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouseVector, this.camera);
    const intersects = this.raycaster.intersectObjects(this.currentAssetRoot.children, true);

    const validHit = intersects.find(
      (hit) => !hit.object.name?.startsWith('__ascope_internal_') && (hit.object as THREE.Mesh).isMesh
    );

    if (validHit) {
      this.selectObject(validHit.object.uuid);
    } else {
      this.selectObject(null);
    }
  }

  public setAsset(assetRoot: THREE.Group, clips: THREE.AnimationClip[] = []) {
    // 1. Cleanly dispose previous asset
    this.disposeCurrentAsset();

    this.currentAssetRoot = assetRoot;
    this.scene.add(this.currentAssetRoot);

    // Register meshes with render mode manager
    assetRoot.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        this.renderModeManager.registerMesh(obj as THREE.Mesh);
      }
    });

    // 2. Exploded view controller registration
    this.explodedViewController.registerAsset(assetRoot);

    // 3. Align model to ground & calculate bounds
    const box = new THREE.Box3().setFromObject(assetRoot);
    if (!box.isEmpty()) {
      // Offset so base sits on Y = 0 if not far off
      const minY = box.min.y;
      assetRoot.position.y -= minY;
      assetRoot.updateMatrixWorld(true);

      // Recreate bounding box helper
      const updatedBox = new THREE.Box3().setFromObject(assetRoot);
      this.bboxHelper = new THREE.Box3Helper(updatedBox, new THREE.Color(0xf59e0b));
      this.bboxHelper.name = '__ascope_internal_bbox';
      this.bboxHelper.visible = this.isBboxVisible;
      this.scene.add(this.bboxHelper);

      if (this.gridHelper) {
        const size = updatedBox.getSize(new THREE.Vector3()).length();
        const gridScale = Math.max(1, Math.ceil(size / 15));
        this.gridHelper.scale.set(gridScale, 1, gridScale);
      }
    }

    // 4. Skeleton Helper
    this.skeletonHelper = new THREE.SkeletonHelper(assetRoot);
    this.skeletonHelper.name = '__ascope_internal_skeleton';
    this.skeletonHelper.visible = this.isSkeletonVisible;
    this.scene.add(this.skeletonHelper);

    // 5. Animations setup
    this.animationClips = clips;
    if (clips.length > 0) {
      this.animationMixer = new THREE.AnimationMixer(assetRoot);
      this.playAnimationClip(0);
    }

    // 6. Camera auto-frame
    this.cameraController.frameObject(assetRoot, 1.4);

    // Reapply current render mode
    this.renderModeManager.applyMode(this.renderModeManager.getMode(), assetRoot);
  }

  public playAnimationClip(clipIndex: number) {
    if (!this.animationMixer || !this.animationClips[clipIndex]) return;

    if (this.activeAnimationAction) {
      this.activeAnimationAction.stop();
    }

    const clip = this.animationClips[clipIndex];
    this.activeAnimationAction = this.animationMixer.clipAction(clip);
    this.activeAnimationAction.setLoop(
      this.animationLoop ? THREE.LoopRepeat : THREE.LoopOnce,
      Infinity
    );
    this.activeAnimationAction.timeScale = this.animationSpeed;
    this.activeAnimationAction.play();
    this.isPlayingAnimation = true;
  }

  public toggleAnimationPlay(play?: boolean) {
    this.isPlayingAnimation = play !== undefined ? play : !this.isPlayingAnimation;
    if (this.activeAnimationAction) {
      this.activeAnimationAction.paused = !this.isPlayingAnimation;
    }
  }

  public stopAnimation() {
    this.isPlayingAnimation = false;
    if (this.activeAnimationAction) {
      this.activeAnimationAction.stop();
      this.activeAnimationAction.reset();
    }
    if (this.animationMixer) {
      this.animationMixer.setTime(0);
    }
  }

  public seekAnimation(normalizedTime: number) {
    if (!this.activeAnimationAction || !this.animationMixer) return;
    const duration = this.activeAnimationAction.getClip().duration;
    const targetTime = normalizedTime * duration;
    this.activeAnimationAction.time = targetTime;
    this.animationMixer.setTime(targetTime);
  }

  public stepAnimationFrame(stepSeconds: number = 1 / 30) {
    if (!this.activeAnimationAction || !this.animationMixer) return;
    this.isPlayingAnimation = false;
    this.activeAnimationAction.paused = true;
    const duration = this.activeAnimationAction.getClip().duration;
    let newTime = this.activeAnimationAction.time + stepSeconds;
    if (newTime > duration) newTime = 0;
    if (newTime < 0) newTime = duration;
    this.activeAnimationAction.time = newTime;
    this.animationMixer.setTime(newTime);
  }

  public setAnimationSpeed(speed: number) {
    this.animationSpeed = speed;
    if (this.activeAnimationAction) {
      this.activeAnimationAction.timeScale = speed;
    }
  }

  public setAnimationLoop(loop: boolean) {
    this.animationLoop = loop;
    if (this.activeAnimationAction) {
      this.activeAnimationAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    }
  }

  public selectObject(uuid: string | null) {
    this.selectedMeshUuid = uuid;

    if (this.selectionBoxHelper) {
      this.scene.remove(this.selectionBoxHelper);
      this.selectionBoxHelper.dispose();
      this.selectionBoxHelper = null;
    }

    if (uuid && this.currentAssetRoot) {
      const obj = this.currentAssetRoot.getObjectByProperty('uuid', uuid);
      if (obj) {
        this.selectionBoxHelper = new THREE.BoxHelper(obj, 0x00f0ff);
        this.selectionBoxHelper.name = '__ascope_internal_selection';
        this.scene.add(this.selectionBoxHelper);
      }
    }

    if (this.callbacks.onMeshSelected) {
      this.callbacks.onMeshSelected(uuid);
    }
  }

  public focusSelected() {
    if (!this.selectedMeshUuid || !this.currentAssetRoot) {
      if (this.currentAssetRoot) {
        this.cameraController.frameObject(this.currentAssetRoot);
      }
      return;
    }
    const obj = this.currentAssetRoot.getObjectByProperty('uuid', this.selectedMeshUuid);
    if (obj) {
      this.cameraController.frameObject(obj, 1.6);
    }
  }

  public isolateObject(uuid: string | null) {
    if (!this.currentAssetRoot) return;

    if (!uuid) {
      this.showAllObjects();
      return;
    }

    this.currentAssetRoot.traverse((obj) => {
      if (obj.name?.startsWith('__ascope_internal_')) return;
      if ((obj as THREE.Mesh).isMesh) {
        obj.visible = obj.uuid === uuid;
      }
    });
  }

  public showAllObjects() {
    if (!this.currentAssetRoot) return;
    this.currentAssetRoot.traverse((obj) => {
      if (obj.name?.startsWith('__ascope_internal_')) return;
      obj.visible = true;
    });
  }

  public toggleObjectVisibility(uuid: string) {
    if (!this.currentAssetRoot) return;
    const obj = this.currentAssetRoot.getObjectByProperty('uuid', uuid);
    if (obj) {
      obj.visible = !obj.visible;
    }
  }

  public setRenderMode(mode: RenderMode) {
    if (this.currentAssetRoot) {
      this.renderModeManager.applyMode(mode, this.currentAssetRoot);
    }
  }

  public setLightingPreset(preset: LightingPreset) {
    this.lightingManager.applyPreset(preset);
  }

  public updateLightingConfig(config: Partial<LightingConfig>) {
    this.lightingManager.updateManualIntensities(config);
    if (config.exposure !== undefined) {
      this.renderer.toneMappingExposure = config.exposure;
    }
  }

  public setExplodedAmount(amount: number) {
    this.explodedViewController.setExplodeAmount(amount);
  }

  // Toggles
  public toggleGrid(visible?: boolean) {
    this.isGridVisible = visible !== undefined ? visible : !this.isGridVisible;
    if (this.gridHelper) this.gridHelper.visible = this.isGridVisible;
  }

  public toggleAxes(visible?: boolean) {
    this.isAxesVisible = visible !== undefined ? visible : !this.isAxesVisible;
    if (this.axesHelper) this.axesHelper.visible = this.isAxesVisible;
  }

  public toggleBbox(visible?: boolean) {
    this.isBboxVisible = visible !== undefined ? visible : !this.isBboxVisible;
    if (this.bboxHelper) this.bboxHelper.visible = this.isBboxVisible;
  }

  public toggleSkeleton(visible?: boolean) {
    this.isSkeletonVisible = visible !== undefined ? visible : !this.isSkeletonVisible;
    if (this.skeletonHelper) this.skeletonHelper.visible = this.isSkeletonVisible;
  }

  public toggleOrigin(visible?: boolean) {
    this.isOriginVisible = visible !== undefined ? visible : !this.isOriginVisible;
    if (this.originHelper) this.originHelper.visible = this.isOriginVisible;
  }

  public getToggleStates() {
    return {
      grid: this.isGridVisible,
      axes: this.isAxesVisible,
      bbox: this.isBboxVisible,
      skeleton: this.isSkeletonVisible,
      origin: this.isOriginVisible,
    };
  }

  private onWindowResize() {
    if (!this.container) return;
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private startRenderLoop() {
    const loop = () => {
      this.animationFrameId = requestAnimationFrame(loop);

      const delta = this.clock.getDelta();

      if (this.animationMixer && this.isPlayingAnimation) {
        this.animationMixer.update(delta);

        if (this.activeAnimationAction && this.callbacks.onAnimationTimeUpdate) {
          this.callbacks.onAnimationTimeUpdate(
            this.activeAnimationAction.time,
            this.activeAnimationAction.getClip().duration
          );
        }
      }

      this.cameraController.update();

      if (this.selectionBoxHelper) {
        this.selectionBoxHelper.update();
      }

      this.renderer.render(this.scene, this.camera);

      // FPS tracking
      this.frameCount++;
      const now = performance.now();
      if (now - this.lastFpsTime >= 500) {
        this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime));
        this.frameCount = 0;
        this.lastFpsTime = now;
      }
    };
    loop();
  }

  public disposeCurrentAsset() {
    if (!this.currentAssetRoot) return;

    if (this.animationMixer) {
      this.animationMixer.stopAllAction();
      this.animationMixer.uncacheRoot(this.currentAssetRoot);
      this.animationMixer = null;
      this.activeAnimationAction = null;
    }

    if (this.bboxHelper) {
      this.scene.remove(this.bboxHelper);
      this.bboxHelper.dispose();
      this.bboxHelper = null;
    }

    if (this.skeletonHelper) {
      this.scene.remove(this.skeletonHelper);
      this.skeletonHelper.dispose();
      this.skeletonHelper = null;
    }

    if (this.selectionBoxHelper) {
      this.scene.remove(this.selectionBoxHelper);
      this.selectionBoxHelper.dispose();
      this.selectionBoxHelper = null;
    }

    this.explodedViewController.reset();
    this.renderModeManager.resetAll(this.currentAssetRoot);

    // Deep GPU resource disposal
    this.currentAssetRoot.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (m) {
            const std = m as THREE.MeshStandardMaterial;
            if (std.map) std.map.dispose();
            if (std.normalMap) std.normalMap.dispose();
            if (std.roughnessMap) std.roughnessMap.dispose();
            if (std.metalnessMap) std.metalnessMap.dispose();
            if (std.aoMap) std.aoMap.dispose();
            if (std.emissiveMap) std.emissiveMap.dispose();
            m.dispose();
          }
        }
      }
    });

    this.scene.remove(this.currentAssetRoot);
    this.currentAssetRoot.clear();
    this.currentAssetRoot = null;
    this.selectedMeshUuid = null;
  }

  public dispose() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.onWindowResize);

    this.disposeCurrentAsset();
    this.cameraController.dispose();
    this.lightingManager.dispose();
    this.renderModeManager.dispose();

    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
  }
}
