import * as THREE from 'three';
import { CameraController } from './CameraController';
import { ExplodedViewController } from './ExplodedViewController';
import { LightingManager } from './LightingManager';
import { RenderModeManager } from './RenderModeManager';
import { BoundsCalculator, AccurateBoundsResult } from './BoundsCalculator';
import type { HealthIssue, LightingConfig, LightingPreset, RenderMode } from '../types';

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
  private issueOverlay: THREE.Object3D | null = null;
  private orientationWidget: HTMLDivElement | null = null;
  private orientationAxes: Record<'x' | 'y' | 'z', { line: SVGLineElement; label: SVGTextElement }> | null = null;
  private issueReturnView: {
    position: THREE.Vector3;
    target: THREE.Vector3;
    near: number;
    far: number;
  } | null = null;

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
    this.initOrientationWidget();

    this.cameraController = new CameraController(this.camera, this.renderer.domElement);
    this.lightingManager = new LightingManager(this.scene);
    this.renderModeManager = new RenderModeManager(this.scene);
    this.explodedViewController = new ExplodedViewController();

    this.initHelpers();
    this.bindEvents();
    this.startRenderLoop();
  }

  private initOrientationWidget() {
    const host = document.createElement('div');
    host.setAttribute('aria-label', 'Viewport orientation gizmo');
    Object.assign(host.style, {
      position: 'absolute',
      right: '10px',
      bottom: '10px',
      width: '66px',
      height: '66px',
      pointerEvents: 'none',
      zIndex: '12',
      opacity: '0.85',
      background: 'rgba(19, 21, 24, 0.58)',
      border: '1px solid rgba(75, 85, 99, 0.45)',
      borderRadius: '50%',
      backdropFilter: 'blur(2px)',
    });

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('width', '64');
    svg.setAttribute('height', '64');

    const makeAxis = (key: 'x' | 'y' | 'z', color: string, labelText: string) => {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', '32');
      line.setAttribute('y1', '32');
      line.setAttribute('x2', '32');
      line.setAttribute('y2', '12');
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-linecap', 'round');

      const label = document.createElementNS(ns, 'text');
      label.textContent = labelText;
      label.setAttribute('x', '32');
      label.setAttribute('y', '9');
      label.setAttribute('fill', color);
      label.setAttribute('font-size', '9');
      label.setAttribute('font-family', 'monospace');
      label.setAttribute('font-weight', '700');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');

      svg.appendChild(line);
      svg.appendChild(label);
      return { line, label };
    };

    this.orientationAxes = {
      x: makeAxis('x', '#ef4444', 'X'),
      y: makeAxis('y', '#22c55e', 'Y'),
      z: makeAxis('z', '#3b82f6', 'Z'),
    };

    host.appendChild(svg);
    this.container.appendChild(host);
    this.orientationWidget = host;
  }

  private updateOrientationWidget() {
    if (!this.orientationAxes) return;

    const inverseCamera = this.camera.quaternion.clone().invert();
    const axes: Array<['x' | 'y' | 'z', THREE.Vector3]> = [
      ['x', new THREE.Vector3(1, 0, 0)],
      ['y', new THREE.Vector3(0, 1, 0)],
      ['z', new THREE.Vector3(0, 0, 1)],
    ];

    for (const [key, direction] of axes) {
      direction.applyQuaternion(inverseCamera);
      const x = 32 + direction.x * 22;
      const y = 32 - direction.y * 22;
      const opacity = String(0.45 + Math.max(0, direction.z + 1) * 0.275);
      const parts = this.orientationAxes[key];
      parts.line.setAttribute('x2', x.toFixed(2));
      parts.line.setAttribute('y2', y.toFixed(2));
      parts.line.setAttribute('opacity', opacity);
      parts.label.setAttribute('x', x.toFixed(2));
      parts.label.setAttribute('y', y.toFixed(2));
      parts.label.setAttribute('opacity', opacity);
    }
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

  public lastMeshDiagnostics: Array<Record<string, any>> = [];
  public lastWholeModelInspection: Record<string, any> = {};

  public setAsset(assetRoot: THREE.Group, clips: THREE.AnimationClip[] = []) {
    // 1. Cleanly dispose previous asset
    this.disposeCurrentAsset();
    this.clearIssueLocalization();

    this.currentAssetRoot = assetRoot;
    this.scene.add(this.currentAssetRoot);

    // Ensure root and children are visible, on default layer, with updated matrices
    assetRoot.visible = true;
    assetRoot.layers.set(0);
    assetRoot.frustumCulled = false;
    assetRoot.updateMatrixWorld(true);

    const meshDiagnostics: Array<Record<string, any>> = [];

    // Instrument and verify all loaded meshes & skinned meshes
    assetRoot.traverse((obj) => {
      // Diagnostic verification: ensure no parent or child is accidentally hidden or frustum-culled
      obj.visible = true;
      obj.layers.set(0);
      obj.frustumCulled = false;

      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.frustumCulled = false;
        const isSkinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh;

        // Ensure materials are visible, two-sided, non-zero opacity, and depth-writing
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (m) {
            m.visible = true;
            m.side = THREE.DoubleSide;
            if (m.opacity < 0.05) m.opacity = 1.0;
            m.depthWrite = true;
          }
        }

        // Ensure skeleton matrices are up-to-date
        if (isSkinned) {
          const sm = mesh as THREE.SkinnedMesh;
          sm.frustumCulled = false;
          if (sm.skeleton) {
            if (!sm.skeleton.boneInverses || sm.skeleton.boneInverses.length === 0) {
              sm.skeleton.calculateInverses();
            }
            sm.updateWorldMatrix(true, true);
            for (let i = 0; i < sm.skeleton.bones.length; i++) {
              if (sm.skeleton.bones[i]) {
                sm.skeleton.bones[i].updateWorldMatrix(true, false);
              }
            }
            sm.skeleton.update();
          }
          // Compute and fix bounding sphere for frustum culling
          const skinnedBox = BoundsCalculator.computeSkinnedMeshWorldBounds(sm);
          BoundsCalculator.fixSkinnedMeshFrustumSphere(sm, skinnedBox);
        } else {
          if (mesh.geometry) {
            mesh.geometry.computeBoundingBox();
            mesh.geometry.computeBoundingSphere();
          }
        }

        // Register with render mode manager
        this.renderModeManager.registerMesh(mesh);

        // Collect exact requested debug instrumentation
        const geom = mesh.geometry;
        const mat = mesh.material;
        const matArray = Array.isArray(mat) ? mat : [mat];

        meshDiagnostics.push({
          name: mesh.name || 'unnamed_mesh',
          type: mesh.type,
          visible: mesh.visible,
          matrixWorld: Array.from(mesh.matrixWorld.elements),
          position: [mesh.position.x, mesh.position.y, mesh.position.z],
          rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
          scale: [mesh.scale.x, mesh.scale.y, mesh.scale.z],
          geometryVertexCount: geom?.attributes.position ? geom.attributes.position.count : 0,
          materialExistence: Boolean(mat),
          materialVisible: matArray.every((m) => m && m.visible),
          frustumCulled: mesh.frustumCulled,
          boundingBox: geom?.boundingBox
            ? {
                min: [geom.boundingBox.min.x, geom.boundingBox.min.y, geom.boundingBox.min.z],
                max: [geom.boundingBox.max.x, geom.boundingBox.max.y, geom.boundingBox.max.z],
              }
            : null,
          boundingSphere: geom?.boundingSphere
            ? {
                center: [geom.boundingSphere.center.x, geom.boundingSphere.center.y, geom.boundingSphere.center.z],
                radius: geom.boundingSphere.radius,
              }
            : null,
        });
      }
    });

    this.lastMeshDiagnostics = meshDiagnostics;
    console.log('[AssetDoctor Loaded Meshes Instrumentation]', meshDiagnostics);

    // 2. Exploded view controller registration
    this.explodedViewController.registerAsset(assetRoot);

    // 3. Ground alignment: deterministic sequence:
    // load -> initialize matrices -> calculate bounds -> apply alignment -> update matrices -> recalculate bounds -> frame camera
    assetRoot.updateMatrixWorld(true);
    const initialBounds = BoundsCalculator.computeAccurateWorldBounds(assetRoot);

    if (initialBounds.isValid) {
      const minY = initialBounds.box.min.y;
      // Only align if base is offset from 0 and within sensible limits (< 50,000)
      if (Math.abs(minY) > 0.001 && Math.abs(minY) < 50000) {
        assetRoot.position.y -= minY;
      }
    } else {
      console.warn('[AssetDoctor GroundAlignment] Initial bounds invalid or extreme, skipping ground shift:', initialBounds.warning);
    }

    // Update matrices again after alignment
    assetRoot.updateMatrixWorld(true);
    assetRoot.traverse((obj) => {
      obj.frustumCulled = false;
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
        const sm = obj as THREE.SkinnedMesh;
        sm.frustumCulled = false;
        if (sm.skeleton) {
          sm.updateWorldMatrix(true, true);
          for (let i = 0; i < sm.skeleton.bones.length; i++) {
            if (sm.skeleton.bones[i]) sm.skeleton.bones[i].updateWorldMatrix(true, false);
          }
          sm.skeleton.update();
        }
      }
    });

    // Recalculate final bounds
    const finalBounds = BoundsCalculator.computeAccurateWorldBounds(assetRoot);

    // Recreate bounding box helper with final bounds
    if (!finalBounds.box.isEmpty()) {
      this.bboxHelper = new THREE.Box3Helper(finalBounds.box, new THREE.Color(0xf59e0b));
      this.bboxHelper.name = '__ascope_internal_bbox';
      this.bboxHelper.visible = this.isBboxVisible;
      this.bboxHelper.frustumCulled = false;
      this.scene.add(this.bboxHelper);

      if (this.gridHelper) {
        const size = finalBounds.box.getSize(new THREE.Vector3()).length();
        const gridScale = Math.max(1, Math.ceil(size / 15));
        this.gridHelper.scale.set(gridScale, 1, gridScale);
      }
    }

    // 4. Skeleton Helper
    this.skeletonHelper = new THREE.SkeletonHelper(assetRoot);
    this.skeletonHelper.name = '__ascope_internal_skeleton';
    this.skeletonHelper.visible = this.isSkeletonVisible;
    this.skeletonHelper.frustumCulled = false;
    this.scene.add(this.skeletonHelper);

    // 5. Animations setup
    this.animationClips = clips;
    if (clips.length > 0) {
      this.animationMixer = new THREE.AnimationMixer(assetRoot);
      this.playAnimationClip(0);
    }

    // 6. Camera auto-frame using FINAL bounds
    const frameResult = this.cameraController.frameObject(assetRoot, 1.4);

    // Reapply current render mode
    this.renderModeManager.applyMode(this.renderModeManager.getMode(), assetRoot);

    // Overall Asset Inspection Log
    const rootPos = assetRoot.position;
    const rootRot = assetRoot.rotation;
    const rootScale = assetRoot.scale;
    const center = frameResult.sphere.center;
    const camPos = this.camera.position;

    this.lastWholeModelInspection = {
      rootPosition: [rootPos.x, rootPos.y, rootPos.z],
      rootRotation: [rootRot.x, rootRot.y, rootRot.z],
      rootScale: [rootScale.x, rootScale.y, rootScale.z],
      calculatedWholeModelBox3Min: [finalBounds.box.min.x, finalBounds.box.min.y, finalBounds.box.min.z],
      calculatedWholeModelBox3Max: [finalBounds.box.max.x, finalBounds.box.max.y, finalBounds.box.max.z],
      boundingSphereCenter: [finalBounds.sphere.center.x, finalBounds.sphere.center.y, finalBounds.sphere.center.z],
      boundingSphereRadius: finalBounds.sphere.radius,
      cameraPosition: [camPos.x, camPos.y, camPos.z],
      cameraTarget: [this.cameraController.controls.target.x, this.cameraController.controls.target.y, this.cameraController.controls.target.z],
      cameraNear: this.camera.near,
      cameraFar: this.camera.far,
      distanceCameraToModelCenter: camPos.distanceTo(center),
      diagnostics: finalBounds.diagnostics,
    };

    console.log('[AssetDoctor Whole-Model Inspection]', this.lastWholeModelInspection);
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

    this.clearIssueLocalization();

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

  public clearIssueLocalization() {
    if (this.issueOverlay) {
      this.scene.remove(this.issueOverlay);
      this.issueOverlay.traverse((obj) => {
        const renderable = obj as THREE.LineSegments & {
          geometry?: THREE.BufferGeometry;
          material?: THREE.Material | THREE.Material[];
        };
        renderable.geometry?.dispose();
        if (Array.isArray(renderable.material)) {
          renderable.material.forEach((entry) => entry.dispose());
        } else {
          renderable.material?.dispose();
        }
      });
      this.issueOverlay = null;
    }
  }

  private getCurrentVertexWorld(mesh: THREE.Mesh, vertexIndex: number): THREE.Vector3 | null {
    const position = mesh.geometry?.attributes?.position;
    if (!position || vertexIndex < 0 || vertexIndex >= position.count) return null;

    const point = new THREE.Vector3();

    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
      const skinned = mesh as THREE.SkinnedMesh;
      skinned.updateMatrixWorld(true);
      skinned.skeleton?.update();
      skinned.getVertexPosition(vertexIndex, point);
    } else {
      point.fromBufferAttribute(position as THREE.BufferAttribute, vertexIndex);
    }

    return point.applyMatrix4(mesh.matrixWorld);
  }

  private getTriangleVertexIndices(mesh: THREE.Mesh, triangleIndex: number): [number, number, number] | null {
    const geometry = mesh.geometry;
    if (!geometry?.attributes?.position || triangleIndex < 0) return null;

    const base = triangleIndex * 3;
    if (geometry.index) {
      if (base + 2 >= geometry.index.count) return null;
      return [
        geometry.index.getX(base),
        geometry.index.getX(base + 1),
        geometry.index.getX(base + 2),
      ];
    }

    if (base + 2 >= geometry.attributes.position.count) return null;
    return [base, base + 1, base + 2];
  }

  private buildIssueOverlay(mesh: THREE.Mesh, issue: HealthIssue): THREE.Vector3 | null {
    const indices = issue.affectedIndices ?? [];
    if (indices.length === 0 || !issue.affectedElement) return null;

    const overlayGroup = new THREE.Group();
    overlayGroup.name = '__ascope_internal_issue_overlay';
    overlayGroup.renderOrder = 9999;

    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xffb020,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 1,
    });

    const pointsMaterial = new THREE.PointsMaterial({
      color: 0xffb020,
      size: 8,
      sizeAttenuation: false,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 1,
    });

    const faceMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb020,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
    });

    const regionMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb020,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
    });

    const currentPoints: THREE.Vector3[] = [];

    if (issue.affectedElement === 'triangle') {
      const triangle = this.getTriangleVertexIndices(mesh, indices[0]);
      if (triangle) {
        for (const vertexIndex of triangle) {
          const point = this.getCurrentVertexWorld(mesh, vertexIndex);
          if (point) currentPoints.push(point);
        }
        if (currentPoints.length === 3) {
          const [a, b, c] = currentPoints;

          const faceGeometry = new THREE.BufferGeometry().setFromPoints([a, b, c]);
          faceGeometry.setIndex([0, 1, 2]);
          const face = new THREE.Mesh(faceGeometry, faceMaterial);
          face.renderOrder = 9998;
          overlayGroup.add(face);

          const edgeGeometry = new THREE.BufferGeometry().setFromPoints([a, b, b, c, c, a]);
          const edgeOverlay = new THREE.LineSegments(edgeGeometry, lineMaterial);
          edgeOverlay.renderOrder = 9999;
          overlayGroup.add(edgeOverlay);
        }
      }
    } else if (issue.affectedElement === 'edge') {
      for (const vertexIndex of indices.slice(0, 2)) {
        const point = this.getCurrentVertexWorld(mesh, vertexIndex);
        if (point) currentPoints.push(point);
      }
      if (currentPoints.length === 2) {
        const geometry = new THREE.BufferGeometry().setFromPoints(currentPoints);
        const overlay = new THREE.LineSegments(geometry, lineMaterial);
        overlay.renderOrder = 9999;
        overlayGroup.add(overlay);
      }
    } else if (issue.affectedElement === 'component') {
      for (const vertexIndex of indices.slice(0, 64)) {
        const point = this.getCurrentVertexWorld(mesh, vertexIndex);
        if (point) currentPoints.push(point);
      }

      if (currentPoints.length > 0) {
        const pointGeometry = new THREE.BufferGeometry().setFromPoints(currentPoints);
        const points = new THREE.Points(pointGeometry, pointsMaterial);
        points.renderOrder = 9999;
        overlayGroup.add(points);

        const box = new THREE.Box3().setFromPoints(currentPoints);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const minThickness = Math.max(size.length() * 0.025, 0.002);
        size.set(
          Math.max(size.x, minThickness),
          Math.max(size.y, minThickness),
          Math.max(size.z, minThickness)
        );
        const zoneGeometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        const zone = new THREE.Mesh(zoneGeometry, regionMaterial);
        zone.position.copy(center);
        zone.renderOrder = 9997;
        overlayGroup.add(zone);
      }
    } else {
      // Vertex findings: render only the affected points, never an enclosing blob.
      for (const vertexIndex of indices.slice(0, 64)) {
        const point = this.getCurrentVertexWorld(mesh, vertexIndex);
        if (point) currentPoints.push(point);
      }
      if (currentPoints.length > 0) {
        const geometry = new THREE.BufferGeometry().setFromPoints(currentPoints);
        const overlay = new THREE.Points(geometry, pointsMaterial);
        overlay.renderOrder = 9999;
        overlayGroup.add(overlay);
      }
    }

    if (overlayGroup.children.length === 0) {
      lineMaterial.dispose();
      pointsMaterial.dispose();
      faceMaterial.dispose();
      regionMaterial.dispose();
      return null;
    }

    const hasLines = overlayGroup.children.some((child) => child instanceof THREE.LineSegments);
    const hasPoints = overlayGroup.children.some((child) => child instanceof THREE.Points);
    const hasFaces = overlayGroup.children.some(
      (child) => child instanceof THREE.Mesh && child.material === faceMaterial
    );
    const hasRegions = overlayGroup.children.some(
      (child) => child instanceof THREE.Mesh && child.material === regionMaterial
    );
    if (!hasLines) lineMaterial.dispose();
    if (!hasPoints) pointsMaterial.dispose();
    if (!hasFaces) faceMaterial.dispose();
    if (!hasRegions) regionMaterial.dispose();

    this.issueOverlay = overlayGroup;
    this.scene.add(overlayGroup);

    const center = new THREE.Vector3();
    currentPoints.forEach((point) => center.add(point));
    return currentPoints.length > 0 ? center.multiplyScalar(1 / currentPoints.length) : null;
  }

  private captureIssueReturnView() {
    if (this.issueReturnView) return;
    this.issueReturnView = {
      position: this.camera.position.clone(),
      target: this.cameraController.controls.target.clone(),
      near: this.camera.near,
      far: this.camera.far,
    };
  }

  public restoreIssueView() {
    if (!this.issueReturnView) {
      this.clearIssueLocalization();
      return;
    }

    this.clearIssueLocalization();
    this.camera.position.copy(this.issueReturnView.position);
    this.camera.near = this.issueReturnView.near;
    this.camera.far = this.issueReturnView.far;
    this.cameraController.controls.target.copy(this.issueReturnView.target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    this.cameraController.controls.update();
    this.issueReturnView = null;
  }

  public cancelIssueInspection() {
    this.clearIssueLocalization();
    this.issueReturnView = null;
  }

  public localizeIssue(issue: HealthIssue) {
    this.captureIssueReturnView();
    this.clearIssueLocalization();

    let targetObject: THREE.Object3D | null = null;
    if (issue.meshUuid && this.currentAssetRoot) {
      targetObject = this.currentAssetRoot.getObjectByProperty('uuid', issue.meshUuid) ?? null;
      if (targetObject) {
        this.selectObject(issue.meshUuid);
      }
    }

    const targetMesh = targetObject && (targetObject as THREE.Mesh).isMesh
      ? (targetObject as THREE.Mesh)
      : null;

    // Recalculate the location from the currently rendered mesh when possible.
    // This keeps localization useful for animated SkinnedMesh assets.
    const liveFocus = targetMesh ? this.buildIssueOverlay(targetMesh, issue) : null;
    const focusTuple: [number, number, number] | undefined = liveFocus
      ? [liveFocus.x, liveFocus.y, liveFocus.z]
      : issue.focusPosition;

    if (focusTuple) {
      let targetDistance: number | undefined;

      if (targetObject) {
        const bounds = BoundsCalculator.computeAccurateWorldBounds(targetObject);
        const size = bounds.box.getSize(new THREE.Vector3());
        const diag = Math.max(size.length(), 0.05);
        targetDistance = Math.max(0.25, diag * 2.2);
      }

      this.cameraController.focusPosition(focusTuple, targetDistance);
      return;
    }

    if (targetObject) {
      this.cameraController.focusSelectedObject(targetObject, 1.8);
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
      this.cameraController.focusSelectedObject(obj, 1.6);
    } else {
      console.warn(`[AssetDoctor Focus] Object with UUID ${this.selectedMeshUuid} not found in scene.`);
    }
  }

  public frameRawBounds() {
    if (this.currentAssetRoot) {
      this.cameraController.frameRawBounds(this.currentAssetRoot);
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
      this.updateOrientationWidget();

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
    this.clearIssueLocalization();
    this.issueReturnView = null;
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
    if (this.orientationWidget?.parentNode) {
      this.orientationWidget.parentNode.removeChild(this.orientationWidget);
    }
    this.orientationWidget = null;
    this.orientationAxes = null;
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
