import * as THREE from 'three';
import type { HealApplyResult, HealOperationReport, HealPreview, HealUndoState } from '../types';
import { analyzeMeshTopology } from '../analysis/TopologyAnalyzer';
import { meshTopologyData } from '../analysis/MeshTopologyData';
import { captureAttribute, captureGeometry, geometryMatches, type GeometrySnapshot } from './GeometrySnapshot';
import { healMetrics, verifyHealOperation } from './HealVerification';
import {
  geometryDataEquivalent,
  planRemoveUnreferencedVertices,
} from './GeometryRemap';

type SupportedIndexArray = Uint8Array | Uint16Array | Uint32Array;

type PendingHeal =
  | {
      mutation: 'index-only';
      preview: HealPreview;
      geometryUuid: string;
      replacementIndex: THREE.BufferAttribute;
      snapshot: GeometrySnapshot;
    }
  | {
      mutation: 'geometry';
      preview: HealPreview;
      geometryUuid: string;
      replacementGeometry: THREE.BufferGeometry;
      snapshot: GeometrySnapshot;
    };

type UndoRestore =
  | { mutation: 'index-only'; previousIndex: THREE.BufferAttribute }
  | { mutation: 'geometry'; previousGeometry: THREE.BufferGeometry };

interface UndoHeal {
  operation: HealPreview['operation'];
  meshUuid: string;
  meshName: string;
  geometryUuid: string;
  restore: UndoRestore;
  affectedTriangles: number;
  affectedVertices: number;
  affectedCount: number;
  appliedSnapshot: GeometrySnapshot;
  report: HealOperationReport;
}

/**
 * Surgical Heal v0.2: independently measured postconditions and guarded Undo.
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
  private lastOperation: HealOperationReport | null = null;

  public getLastOperation(): HealOperationReport | null {
    return this.lastOperation ? structuredClone(this.lastOperation) : null;
  }

  public completeVerification(operationId: string, pipelineComplete: boolean) {
    const report = this.lastOperation;
    if (!report || report.operationId !== operationId || report.undoneAt) return;
    report.pipeline = pipelineComplete ? 'complete' : 'failed';
    report.status = report.targetStatus === 'REGRESSION' ? 'REGRESSION'
      : pipelineComplete ? report.targetStatus : 'PARTIAL';
  }

  public validateCurrentVerifiedState(
    root: THREE.Object3D,
    report: HealOperationReport | null
  ): { ok: boolean; reasonKey?: string } {
    if (!report || report.undoneAt || report.status !== 'VERIFIED' || report.pipeline !== 'complete') {
      return { ok: false, reasonKey: 'export.errors.healNotVerified' };
    }

    if (!this.lastOperation || this.lastOperation.operationId !== report.operationId) {
      return { ok: false, reasonKey: 'export.errors.historicalReport' };
    }

    const undo = [...this.undoStack].reverse().find((entry) => entry.report.operationId === report.operationId);
    if (!undo) {
      return { ok: false, reasonKey: 'export.errors.historicalReport' };
    }

    const obj = root.getObjectByProperty('uuid', report.meshUuid);
    if (!obj || !(obj as THREE.Mesh).isMesh) {
      return { ok: false, reasonKey: 'export.errors.targetMissing' };
    }

    const mesh = obj as THREE.Mesh;
    if (mesh.geometry.uuid !== undo.geometryUuid || !geometryMatches(mesh.geometry, undo.appliedSnapshot)) {
      return { ok: false, reasonKey: 'export.errors.geometryChanged' };
    }

    return { ok: true };
  }

  public clear() {
    this.disposePending();
    for (const entry of this.undoStack) {
      if (entry.restore.mutation === 'geometry') {
        entry.restore.previousGeometry.dispose();
      }
    }
    this.undoStack = [];
    this.lastOperation = null;
  }

  public cancelPreview() {
    this.disposePending();
  }

  private disposePending() {
    if (this.pending?.mutation === 'geometry') {
      this.pending.replacementGeometry.dispose();
    }
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
      affectedVertices: last.affectedVertices,
      affectedCount: last.affectedCount,
    };
  }

  public previewRemoveDegenerateTriangles(root: THREE.Object3D, meshUuid: string): HealPreview {
    this.disposePending();

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

    if (index.itemSize !== 1 || index.normalized || index.count % 3 !== 0 || position.itemSize !== 3 ||
        Array.from(index.array).some(value => value >= position.count) ||
        Array.from({ length: position.count }, (_, i) => [position.getX(i), position.getY(i), position.getZ(i)])
          .some(point => point.some(value => !Number.isFinite(value)))) {
      return { ...this.blocked(mesh.uuid, mesh.name, ''), reasonKey: 'heal.errors.invalidGeometry' };
    }

    // Match the analyzer's base-position domain, including when morph targets extend bounds.
    const localBox = new THREE.Box3();
    const point = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) localBox.expandByPoint(point.fromBufferAttribute(position, i));
    const localDiagonal = localBox.getSize(point).length();
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
      operationId: THREE.MathUtils.generateUUID(),
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
      affectedCount: degenerate.size,
      metric: 'triangles',
      metricBefore: triangleCount,
      metricAfter: triangleCount - degenerate.size,
      verticesBefore: position.count,
      verticesAfter: position.count,
      affectedVertices: 0,
      boundaryEdgesBefore: beforeEdges.boundary,
      boundaryEdgesAfter: afterEdges.boundary,
      nonManifoldEdgesBefore: beforeEdges.nonManifold,
      nonManifoldEdgesAfter: afterEdges.nonManifold,
    };

    if (preview.status === 'READY') {
      this.disposePending();
      this.pending = {
        mutation: 'index-only',
        preview,
        geometryUuid: geometry.uuid,
        replacementIndex: replacement,
        snapshot: captureGeometry(geometry),
      };
    }

    return preview;
  }

  public previewRemoveUnreferencedVertices(root: THREE.Object3D, meshUuid: string): HealPreview {
    this.disposePending();

    const obj = root.getObjectByProperty('uuid', meshUuid);
    if (!obj || !(obj as THREE.Mesh).isMesh || (obj as THREE.InstancedMesh).isInstancedMesh) {
      return this.blockedUnreferenced(meshUuid, 'Unknown or unsupported mesh');
    }

    const mesh = obj as THREE.Mesh;
    const geometry = mesh.geometry;

    let sharedUsers = 0;
    root.traverse((candidate) => {
      if ((candidate as THREE.Mesh).isMesh && (candidate as THREE.Mesh).geometry === geometry) {
        sharedUsers++;
      }
    });
    if (sharedUsers !== 1) {
      return this.blockedUnreferenced(mesh.uuid, mesh.name || `Mesh_${mesh.id}`, 'heal.errors.sharedGeometry');
    }

    const planned = planRemoveUnreferencedVertices(geometry);
    if ('reasonKey' in planned) {
      return this.blockedUnreferenced(
        mesh.uuid,
        mesh.name || `Mesh_${mesh.id}`,
        planned.reasonKey
      );
    }

    let before;
    try {
      before = analyzeMeshTopology(meshTopologyData(mesh));
    } catch {
      planned.replacement.dispose();
      return this.blockedUnreferenced(
        mesh.uuid,
        mesh.name || `Mesh_${mesh.id}`,
        'heal.errors.beforeUnavailable'
      );
    }

    const preview: HealPreview = {
      operationId: THREE.MathUtils.generateUUID(),
      operation: 'remove-unreferenced-vertices',
      issueId: 'topo-isolated-vertices',
      meshUuid: mesh.uuid,
      meshName: mesh.name || `Mesh_${mesh.id}`,
      status: 'READY',
      risk: 'CONDITIONAL',
      trianglesBefore: before.triangleCount,
      trianglesAfter: before.triangleCount,
      affectedTriangles: 0,
      affectedCount: planned.removedVertices,
      metric: 'vertices',
      metricBefore: planned.verticesBefore,
      metricAfter: planned.verticesAfter,
      verticesBefore: planned.verticesBefore,
      verticesAfter: planned.verticesAfter,
      affectedVertices: planned.removedVertices,
      boundaryEdgesBefore: before.boundaryEdges,
      boundaryEdgesAfter: before.boundaryEdges,
      nonManifoldEdgesBefore: before.nonManifoldEdges,
      nonManifoldEdgesAfter: before.nonManifoldEdges,
    };

    this.pending = {
      mutation: 'geometry',
      preview,
      geometryUuid: geometry.uuid,
      replacementGeometry: planned.replacement,
      snapshot: captureGeometry(geometry),
    };

    return preview;
  }

  public applyPending(root: THREE.Object3D, assetName = ''): HealApplyResult {
    const pending = this.pending;
    if (!pending) {
      return { success: false, reason: 'No Surgical Heal preview is pending.' };
    }

    const obj = root.getObjectByProperty('uuid', pending.preview.meshUuid);
    if (!obj || !(obj as THREE.Mesh).isMesh || (obj as THREE.InstancedMesh).isInstancedMesh) {
      this.disposePending();
      return { success: false, reason: 'Target mesh is no longer available.' };
    }

    const mesh = obj as THREE.Mesh;
    const geometry = mesh.geometry;
    if (geometry.uuid !== pending.geometryUuid || !geometry.index) {
      this.disposePending();
      return { success: false, reason: 'Geometry changed after preview. Preview must be regenerated.' };
    }

    if (!geometryMatches(geometry, pending.snapshot)) {
      this.disposePending();
      return { success: false, reasonKey: 'heal.errors.stalePreview' };
    }

    let sharedUsers = 0;
    root.traverse(candidate => {
      if ((candidate as THREE.Mesh).isMesh && (candidate as THREE.Mesh).geometry === geometry) sharedUsers++;
    });
    if (sharedUsers !== 1) {
      this.disposePending();
      return { success: false, reasonKey: 'heal.errors.sharedGeometry' };
    }

    let before;
    try {
      before = healMetrics(analyzeMeshTopology(meshTopologyData(mesh)));
    } catch {
      this.disposePending();
      return { success: false, reasonKey: 'heal.errors.beforeUnavailable' };
    }

    let restore: UndoRestore;
    let buffersMatch = false;

    if (pending.mutation === 'index-only') {
      const expectedSnapshot = {
        ...pending.snapshot,
        entries: [
          ...pending.snapshot.entries.slice(0, -1),
          captureAttribute(pending.replacementIndex),
        ],
      };
      restore = { mutation: 'index-only', previousIndex: geometry.index.clone() };
      geometry.setIndex(pending.replacementIndex.clone());
      geometry.index!.needsUpdate = true;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      buffersMatch = geometryMatches(geometry, expectedSnapshot);
    } else {
      // Ownership of the current geometry moves to Undo; the planned replacement
      // becomes the mesh's live geometry. No viewport-only material/transform state is touched.
      restore = { mutation: 'geometry', previousGeometry: geometry };
      mesh.geometry = pending.replacementGeometry;
      buffersMatch = geometryDataEquivalent(mesh.geometry, pending.replacementGeometry);
    }

    const appliedGeometry = mesh.geometry;
    const appliedSnapshot = captureGeometry(appliedGeometry);

    let after = null;
    try {
      after = healMetrics(analyzeMeshTopology(meshTopologyData(mesh)));
    } catch {
      // An unavailable postcheck remains PARTIAL while Undo stays available.
    }

    const verified = verifyHealOperation(
      pending.preview.operation,
      before,
      after,
      pending.preview.affectedCount,
      buffersMatch
    );

    const report: HealOperationReport = {
      version: 2,
      operationId: pending.preview.operationId,
      operation: pending.preview.operation,
      assetName,
      meshUuid: mesh.uuid,
      meshName: pending.preview.meshName,
      appliedAt: new Date().toISOString(),
      expectedRemoved: pending.preview.affectedCount,
      before,
      after,
      targetStatus: verified.status,
      status: verified.status === 'REGRESSION' ? 'REGRESSION' : 'PARTIAL',
      pipeline: 'pending',
      reasons: verified.reasons,
    };

    this.lastOperation = report;
    this.undoStack.push({
      operation: pending.preview.operation,
      meshUuid: mesh.uuid,
      meshName: pending.preview.meshName,
      geometryUuid: appliedGeometry.uuid,
      restore,
      affectedTriangles: pending.preview.affectedTriangles,
      affectedVertices: pending.preview.affectedVertices ?? 0,
      affectedCount: pending.preview.affectedCount,
      appliedSnapshot,
      report,
    });

    const result: HealApplyResult = {
      success: true,
      report: this.getLastOperation()!,
      operation: pending.preview.operation,
      meshUuid: mesh.uuid,
      meshName: pending.preview.meshName,
      affectedTriangles: pending.preview.affectedTriangles,
      affectedVertices: pending.preview.affectedVertices,
      affectedCount: pending.preview.affectedCount,
      trianglesBefore: pending.preview.trianglesBefore,
      trianglesAfter: after?.triangleCount,
    };

    // For geometry mutation the replacement is now owned by the scene.
    this.pending = null;
    return result;
  }

  public undoLast(root: THREE.Object3D): HealApplyResult {
    const undo = this.undoStack[this.undoStack.length - 1];
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

    let sharedUsers = 0;
    root.traverse(candidate => {
      if ((candidate as THREE.Mesh).isMesh && (candidate as THREE.Mesh).geometry === mesh.geometry) sharedUsers++;
    });
    if (sharedUsers !== 1 || !geometryMatches(mesh.geometry, undo.appliedSnapshot)) {
      return { success: false, reasonKey: 'heal.errors.staleUndo' };
    }

    const trianglesBeforeUndo = Math.floor((mesh.geometry.index?.count ?? 0) / 3);

    if (undo.restore.mutation === 'index-only') {
      mesh.geometry.setIndex(undo.restore.previousIndex.clone());
      mesh.geometry.index!.needsUpdate = true;
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
    } else {
      const repairedGeometry = mesh.geometry;
      mesh.geometry = undo.restore.previousGeometry;
      repairedGeometry.dispose();
    }

    this.undoStack.pop();
    this.disposePending();
    undo.report.undoneAt = new Date().toISOString();
    this.lastOperation = undo.report;

    return {
      success: true,
      report: this.getLastOperation()!,
      operation: undo.operation,
      meshUuid: mesh.uuid,
      meshName: undo.meshName,
      affectedTriangles: undo.affectedTriangles,
      affectedVertices: undo.affectedVertices,
      affectedCount: undo.affectedCount,
      trianglesBefore: trianglesBeforeUndo,
      trianglesAfter: Math.floor((mesh.geometry.index?.count ?? 0) / 3),
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
      affectedCount: 0,
      metric: 'triangles',
      metricBefore: 0,
      metricAfter: 0,
      verticesBefore: 0,
      verticesAfter: 0,
      affectedVertices: 0,
      boundaryEdgesBefore: 0,
      boundaryEdgesAfter: 0,
      nonManifoldEdgesBefore: 0,
      nonManifoldEdgesAfter: 0,
    };
  }

  private blockedUnreferenced(
    meshUuid: string,
    meshName: string,
    reasonKeyOrReason: string
  ): HealPreview {
    const isKey = reasonKeyOrReason.startsWith('heal.');
    return {
      operationId: `heal_blocked_unreferenced_${meshUuid}`,
      operation: 'remove-unreferenced-vertices',
      issueId: 'topo-isolated-vertices',
      meshUuid,
      meshName,
      status: 'BLOCKED',
      risk: 'CONDITIONAL',
      reasonKey: isKey ? reasonKeyOrReason : undefined,
      reason: isKey ? undefined : reasonKeyOrReason,
      trianglesBefore: 0,
      trianglesAfter: 0,
      affectedTriangles: 0,
      affectedCount: 0,
      metric: 'vertices',
      metricBefore: 0,
      metricAfter: 0,
      verticesBefore: 0,
      verticesAfter: 0,
      affectedVertices: 0,
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
