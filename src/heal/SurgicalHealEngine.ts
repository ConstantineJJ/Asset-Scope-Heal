import * as THREE from 'three';
import type { HealApplyResult, HealPreview, HealUndoState } from '../types';

type SupportedIndexArray = Uint8Array | Uint16Array | Uint32Array;

interface PendingHeal {
  preview: HealPreview;
  geometryUuid: string;
  originalIndex: THREE.BufferAttribute;
  replacementIndex: THREE.BufferAttribute;
}

interface UndoHeal {
  operation: HealPreview['operation'];
  meshUuid: string;
  meshName: string;
  geometryUuid: string;
  previousIndex: THREE.BufferAttribute;
  affectedTriangles: number;
}

/**
 * Surgical Heal v0.1
 *
 * Intentionally narrow:
 * - in-memory only
 * - indexed geometry only
 * - no geometry groups
 * - no shared geometry
 * - no custom draw ranges
 *
 * The first operation removes deterministically degenerate triangles by rewriting
 * only the geometry index buffer. Vertex attributes, skinning, UVs and materials
 * are left untouched.
 */
export class SurgicalHealEngine {
  private pending: PendingHeal | null = null;
  private undoStack: UndoHeal[] = [];

  public clear() {
    this.pending = null;
    this.undoStack = [];
  }

  public cancelPreview() {
    this.pending = null;
  }

  public getUndoState(): HealUndoState {
    const last = this.undoStack[this.undoStack.length - 1];
    if (!last) return { available: false };

    return {
      available: true,
      operation: last.operation,
      meshName: last.meshName,
      affectedTriangles: last.affectedTriangles,
    };
  }

  public previewRemoveDegenerateTriangles(root: THREE.Object3D, meshUuid: string): HealPreview {
    this.pending = null;

    const obj = root.getObjectByProperty('uuid', meshUuid);
    if (!obj || !(obj as THREE.Mesh).isMesh) {
      return this.blocked(meshUuid, 'Unknown mesh', 'Target mesh is no longer available.');
    }

    const mesh = obj as THREE.Mesh;
    const geometry = mesh.geometry;
    const index = geometry?.index;
    const position = geometry?.attributes?.position;

    if (!geometry || !position) {
      return this.blocked(mesh.uuid, mesh.name || `Mesh_${mesh.id}`, 'Mesh has no position geometry.');
    }

    if (!index) {
      return this.blocked(
        mesh.uuid,
        mesh.name || `Mesh_${mesh.id}`,
        'Surgical Heal v0.1 only repairs indexed geometry. Non-indexed geometry remains diagnostic-only.'
      );
    }

    if (geometry.groups.length > 0) {
      return this.blocked(
        mesh.uuid,
        mesh.name || `Mesh_${mesh.id}`,
        'Geometry uses material groups. Automatic index rewriting is blocked until group-preserving repair is implemented.'
      );
    }

    if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) {
      return this.blocked(
        mesh.uuid,
        mesh.name || `Mesh_${mesh.id}`,
        'Geometry uses a custom draw range. Automatic repair is blocked to avoid changing rendered semantics.'
      );
    }

    let sharedUsers = 0;
    root.traverse((candidate) => {
      if ((candidate as THREE.Mesh).isMesh && (candidate as THREE.Mesh).geometry === geometry) {
        sharedUsers++;
      }
    });
    if (sharedUsers > 1) {
      return this.blocked(
        mesh.uuid,
        mesh.name || `Mesh_${mesh.id}`,
        `Geometry is shared by ${sharedUsers} meshes. Repair is blocked to avoid modifying multiple objects at once.`
      );
    }

    const sourceArray = index.array;
    if (
      !(sourceArray instanceof Uint8Array) &&
      !(sourceArray instanceof Uint16Array) &&
      !(sourceArray instanceof Uint32Array)
    ) {
      return this.blocked(
        mesh.uuid,
        mesh.name || `Mesh_${mesh.id}`,
        'Unsupported index buffer type.'
      );
    }

    geometry.computeBoundingBox();
    const localDiagonal = geometry.boundingBox?.getSize(new THREE.Vector3()).length() ?? 1;
    const areaEpsilon = Math.max(1e-9, Math.pow(Math.max(localDiagonal, 1e-9) * 1e-6, 2));

    const triangleCount = Math.floor(index.count / 3);
    const degenerate = new Set<number>();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const cross = new THREE.Vector3();

    for (let triangle = 0; triangle < triangleCount; triangle++) {
      const base = triangle * 3;
      const ia = index.getX(base);
      const ib = index.getX(base + 1);
      const ic = index.getX(base + 2);

      a.fromBufferAttribute(position as THREE.BufferAttribute, ia);
      b.fromBufferAttribute(position as THREE.BufferAttribute, ib);
      c.fromBufferAttribute(position as THREE.BufferAttribute, ic);

      ab.subVectors(b, a);
      ac.subVectors(c, a);
      cross.crossVectors(ab, ac);
      const area = 0.5 * cross.length();

      if (area <= areaEpsilon) {
        degenerate.add(triangle);
      }
    }

    const keptIndices: number[] = [];
    for (let triangle = 0; triangle < triangleCount; triangle++) {
      if (degenerate.has(triangle)) continue;
      const base = triangle * 3;
      keptIndices.push(index.getX(base), index.getX(base + 1), index.getX(base + 2));
    }

    const beforeEdges = this.countEdgeState(index);
    const replacementArray = this.makeIndexArray(sourceArray, keptIndices);
    const replacement = new THREE.BufferAttribute(replacementArray, 1, index.normalized);
    const afterEdges = this.countEdgeState(replacement);

    const preview: HealPreview = {
      operationId: `heal_${mesh.uuid}_${index.count}_${degenerate.size}`,
      operation: 'remove-degenerate-triangles',
      issueId: 'topo-degenerate-triangles',
      meshUuid: mesh.uuid,
      meshName: mesh.name || `Mesh_${mesh.id}`,
      status: degenerate.size > 0 ? 'READY' : 'BLOCKED',
      risk: 'CONDITIONAL',
      reason: degenerate.size > 0 ? undefined : 'No degenerate triangles were found during repair-time validation.',
      trianglesBefore: triangleCount,
      trianglesAfter: triangleCount - degenerate.size,
      affectedTriangles: degenerate.size,
      boundaryEdgesBefore: beforeEdges.boundary,
      boundaryEdgesAfter: afterEdges.boundary,
      nonManifoldEdgesBefore: beforeEdges.nonManifold,
      nonManifoldEdgesAfter: afterEdges.nonManifold,
    };

    if (preview.status === 'READY') {
      this.pending = {
        preview,
        geometryUuid: geometry.uuid,
        originalIndex: index.clone(),
        replacementIndex: replacement,
      };
    }

    return preview;
  }

  public applyPending(root: THREE.Object3D): HealApplyResult {
    const pending = this.pending;
    if (!pending) {
      return { success: false, reason: 'No Surgical Heal preview is pending.' };
    }

    const obj = root.getObjectByProperty('uuid', pending.preview.meshUuid);
    if (!obj || !(obj as THREE.Mesh).isMesh) {
      this.pending = null;
      return { success: false, reason: 'Target mesh is no longer available.' };
    }

    const mesh = obj as THREE.Mesh;
    const geometry = mesh.geometry;
    if (geometry.uuid !== pending.geometryUuid || !geometry.index) {
      this.pending = null;
      return { success: false, reason: 'Geometry changed after preview. Preview must be regenerated.' };
    }

    if (geometry.index.count !== pending.originalIndex.count) {
      this.pending = null;
      return { success: false, reason: 'Index buffer changed after preview. Preview must be regenerated.' };
    }

    const previousIndex = geometry.index.clone();
    geometry.setIndex(pending.replacementIndex.clone());
    geometry.index!.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    this.undoStack.push({
      operation: pending.preview.operation,
      meshUuid: mesh.uuid,
      meshName: pending.preview.meshName,
      geometryUuid: geometry.uuid,
      previousIndex,
      affectedTriangles: pending.preview.affectedTriangles,
    });

    const result: HealApplyResult = {
      success: true,
      operation: pending.preview.operation,
      meshUuid: mesh.uuid,
      meshName: pending.preview.meshName,
      affectedTriangles: pending.preview.affectedTriangles,
      trianglesBefore: pending.preview.trianglesBefore,
      trianglesAfter: pending.preview.trianglesAfter,
    };

    this.pending = null;
    return result;
  }

  public undoLast(root: THREE.Object3D): HealApplyResult {
    const undo = this.undoStack.pop();
    if (!undo) {
      return { success: false, reason: 'No Surgical Heal operation is available to undo.' };
    }

    const obj = root.getObjectByProperty('uuid', undo.meshUuid);
    if (!obj || !(obj as THREE.Mesh).isMesh) {
      return { success: false, reason: 'Undo target mesh is no longer available.' };
    }

    const mesh = obj as THREE.Mesh;
    if (mesh.geometry.uuid !== undo.geometryUuid) {
      return { success: false, reason: 'Undo target geometry has changed.' };
    }

    const trianglesBeforeUndo = Math.floor((mesh.geometry.index?.count ?? 0) / 3);
    mesh.geometry.setIndex(undo.previousIndex.clone());
    mesh.geometry.index!.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();

    return {
      success: true,
      operation: undo.operation,
      meshUuid: mesh.uuid,
      meshName: undo.meshName,
      affectedTriangles: undo.affectedTriangles,
      trianglesBefore: trianglesBeforeUndo,
      trianglesAfter: Math.floor(undo.previousIndex.count / 3),
    };
  }

  private blocked(meshUuid: string, meshName: string, reason: string): HealPreview {
    return {
      operationId: `heal_blocked_${meshUuid}`,
      operation: 'remove-degenerate-triangles',
      issueId: 'topo-degenerate-triangles',
      meshUuid,
      meshName,
      status: 'BLOCKED',
      risk: 'CONDITIONAL',
      reason,
      trianglesBefore: 0,
      trianglesAfter: 0,
      affectedTriangles: 0,
      boundaryEdgesBefore: 0,
      boundaryEdgesAfter: 0,
      nonManifoldEdgesBefore: 0,
      nonManifoldEdgesAfter: 0,
    };
  }

  private makeIndexArray(source: SupportedIndexArray, values: number[]): SupportedIndexArray {
    if (source instanceof Uint32Array) return new Uint32Array(values);
    if (source instanceof Uint16Array) return new Uint16Array(values);
    return new Uint8Array(values);
  }

  private countEdgeState(index: THREE.BufferAttribute): { boundary: number; nonManifold: number } {
    const counts = new Map<string, number>();
    const triangles = Math.floor(index.count / 3);

    const addEdge = (u: number, v: number) => {
      const min = Math.min(u, v);
      const max = Math.max(u, v);
      const key = `${min}_${max}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    };

    for (let triangle = 0; triangle < triangles; triangle++) {
      const base = triangle * 3;
      const a = index.getX(base);
      const b = index.getX(base + 1);
      const c = index.getX(base + 2);
      addEdge(a, b);
      addEdge(b, c);
      addEdge(c, a);
    }

    let boundary = 0;
    let nonManifold = 0;
    for (const count of counts.values()) {
      if (count === 1) boundary++;
      if (count > 2) nonManifold++;
    }

    return { boundary, nonManifold };
  }
}
