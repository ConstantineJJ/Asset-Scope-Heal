import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { analyzeGeometry } from '../analysis/GeometryAnalyzer';
import { analyzeMeshTopology } from '../analysis/TopologyAnalyzer';
import { meshTopologyData } from '../analysis/MeshTopologyData';
import { GLBLoaderService } from '../loaders/GLBLoaderService';
import { createAssetDoctorTestPatient } from '../loaders/SampleModels';
import type {
  ExportVerificationReport,
  HealOperationReport,
} from '../types';
import { getRepairOperation } from '../heal/framework/RepairRegistry';
import { copyGeometryData } from '../heal/GeometryRemap';

export type ExportSampleId = 'test-patient';

export type ExportSourceDescriptor =
  | { kind: 'buffer'; fileName: string; buffer: ArrayBuffer }
  | { kind: 'sample'; sampleId: ExportSampleId };

export interface RepairedExportRequest {
  source: ExportSourceDescriptor;
  currentRoot: THREE.Group;
  assetName: string;
  healReport: HealOperationReport;
}

export interface RepairedExportResult {
  fileName: string;
  buffer: ArrayBuffer;
  report: ExportVerificationReport;
}

interface FreshAsset {
  root: THREE.Group;
  animations: THREE.AnimationClip[];
}

export class RepairedExportService {
  public async exportAndVerify(request: RepairedExportRequest): Promise<RepairedExportResult> {
    const { currentRoot, healReport, assetName } = request;
    if (healReport.assetName !== assetName || healReport.undoneAt) {
      throw new Error('export.errors.reportAssetMismatch');
    }
    if (healReport.status !== 'VERIFIED' || healReport.pipeline !== 'complete' || !healReport.after) {
      throw new Error('export.errors.healNotVerified');
    }

    const currentMeshes = this.collectMeshes(currentRoot);
    const targetOrdinal = currentMeshes.findIndex((mesh) => mesh.uuid === healReport.meshUuid);
    if (targetOrdinal < 0) {
      throw new Error('export.errors.targetMissing');
    }

    const currentTargetStats = analyzeMeshTopology(meshTopologyData(currentMeshes[targetOrdinal]));
    if (
      currentTargetStats.triangleCount !== healReport.after.triangleCount ||
      currentTargetStats.vertexCount !== healReport.after.vertexCount ||
      currentTargetStats.degenerateTriangles !== healReport.after.degenerateTriangles ||
      currentTargetStats.isolatedVertices !== healReport.after.isolatedVertices
    ) {
      throw new Error('export.errors.geometryChanged');
    }

    const fresh = await this.createFreshAsset(request.source);
    let reopened: FreshAsset | null = null;

    try {
      const freshMeshes = this.collectMeshes(fresh.root);
      if (freshMeshes.length !== currentMeshes.length || targetOrdinal >= freshMeshes.length) {
        throw new Error('export.errors.structureMismatch');
      }

      const operation = getRepairOperation(healReport.operation);
      if (!operation) {
        throw new Error('export.errors.unsupportedRepair');
      }
      this.applyRepairPatch(
        currentMeshes[targetOrdinal],
        freshMeshes[targetOrdinal],
        operation.capabilities.exportPatch
      );

      // Expected structural values come from the pristine source, not the viewport.
      // Only triangle indices are allowed to differ.
      const pristineSummary = analyzeGeometry(fresh.root, assetName);
      const currentSummary = analyzeGeometry(currentRoot, assetName);
      const exportedName = this.makeExportName(assetName);

      const exporter = new GLTFExporter();
      const output = await exporter.parseAsync(fresh.root, {
        binary: true,
        onlyVisible: false,
        animations: fresh.animations,
      });
      if (!(output instanceof ArrayBuffer)) {
        throw new Error('export.errors.binaryExportFailed');
      }

      // Re-open with a separate loader. The source used to create the GLB is not
      // trusted as proof that the serialized file can be loaded again.
      const verificationLoader = new GLBLoaderService();
      try {
        const loaded = await verificationLoader.loadFromArrayBuffer(
          output.slice(0),
          exportedName,
          output.byteLength
        );
        reopened = { root: loaded.root, animations: loaded.animations };
      } finally {
        verificationLoader.dispose();
      }

      const reopenedMeshes = this.collectMeshes(reopened.root);
      const actualSummary = analyzeGeometry(reopened.root, exportedName, output.byteLength);
      const targetMesh = reopenedMeshes[targetOrdinal];
      const reasons: string[] = [];

      const expectedMeshSignature = this.meshSignature(freshMeshes);
      const actualMeshSignature = this.meshSignature(reopenedMeshes);
      const expectedMaterialSignature = this.materialSignature(fresh.root);
      const actualMaterialSignature = this.materialSignature(reopened.root);
      const expectedRigSignature = this.rigSignature(fresh.root);
      const actualRigSignature = this.rigSignature(reopened.root);
      const expectedAnimationSignature = this.animationSignature(fresh.animations);
      const actualAnimationSignature = this.animationSignature(reopened.animations);

      if (reopenedMeshes.length !== freshMeshes.length || !targetMesh) {
        reasons.push('meshComposition');
      }
      if (expectedMeshSignature !== actualMeshSignature) reasons.push('meshStructure');
      if (expectedMaterialSignature !== actualMaterialSignature) reasons.push('materialStructure');
      if (expectedRigSignature !== actualRigSignature) reasons.push('rigStructure');
      if (expectedAnimationSignature !== actualAnimationSignature) reasons.push('animationStructure');

      let targetTrianglesActual = -1;
      let targetDegeneratesActual = -1;
      let targetVerticesActual = -1;
      let targetUnreferencedActual = -1;
      if (targetMesh) {
        const targetStats = analyzeMeshTopology(meshTopologyData(targetMesh));
        targetTrianglesActual = targetStats.triangleCount;
        targetDegeneratesActual = targetStats.degenerateTriangles;
        targetVerticesActual = targetStats.vertexCount;
        targetUnreferencedActual = targetStats.isolatedVertices;
      }

      if (actualSummary.triangleCount !== currentSummary.triangleCount) reasons.push('triangleCount');
      if (targetTrianglesActual !== healReport.after.triangleCount) reasons.push('targetTriangles');
      if (targetDegeneratesActual !== healReport.after.degenerateTriangles) reasons.push('targetDegenerates');
      if (targetVerticesActual !== healReport.after.vertexCount) reasons.push('targetVertices');
      if (targetUnreferencedActual !== healReport.after.isolatedVertices) reasons.push('targetUnreferenced');
      if (actualSummary.meshCount !== pristineSummary.meshCount) reasons.push('meshCount');
      if (actualSummary.materialCount !== pristineSummary.materialCount) reasons.push('materialCount');
      if (actualSummary.textureCount !== pristineSummary.textureCount) reasons.push('textureCount');
      if (actualSummary.skinnedMeshCount !== pristineSummary.skinnedMeshCount) reasons.push('skinnedMeshCount');
      if (actualSummary.boneCount !== pristineSummary.boneCount) reasons.push('boneCount');
      if (reopened.animations.length !== fresh.animations.length) reasons.push('clipCount');

      const report: ExportVerificationReport = {
        version: 1,
        createdAt: new Date().toISOString(),
        assetName,
        exportedName,
        healOperationId: healReport.operationId,
        status: reasons.length === 0 ? 'VERIFIED' : 'REGRESSION',
        reasons,
        byteLength: output.byteLength,
        triangleCountExpected: currentSummary.triangleCount,
        triangleCountActual: actualSummary.triangleCount,
        targetTrianglesExpected: healReport.after.triangleCount,
        targetTrianglesActual,
        targetDegeneratesExpected: healReport.after.degenerateTriangles,
        targetDegeneratesActual,
        targetVerticesExpected: healReport.after.vertexCount,
        targetVerticesActual,
        targetUnreferencedExpected: healReport.after.isolatedVertices,
        targetUnreferencedActual,
        meshCountExpected: pristineSummary.meshCount,
        meshCountActual: actualSummary.meshCount,
        materialCountExpected: pristineSummary.materialCount,
        materialCountActual: actualSummary.materialCount,
        textureCountExpected: pristineSummary.textureCount,
        textureCountActual: actualSummary.textureCount,
        skinnedMeshCountExpected: pristineSummary.skinnedMeshCount,
        skinnedMeshCountActual: actualSummary.skinnedMeshCount,
        boneCountExpected: pristineSummary.boneCount,
        boneCountActual: actualSummary.boneCount,
        clipCountExpected: fresh.animations.length,
        clipCountActual: reopened.animations.length,
      };

      return { fileName: exportedName, buffer: output, report };
    } finally {
      this.disposeObject(fresh.root);
      if (reopened) this.disposeObject(reopened.root);
    }
  }

  public download(result: RepairedExportResult) {
    const blob = new Blob([result.buffer], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private async createFreshAsset(source: ExportSourceDescriptor): Promise<FreshAsset> {
    if (source.kind === 'sample') {
      const sample = createAssetDoctorTestPatient();
      return { root: sample.root, animations: sample.animations };
    }

    const loader = new GLBLoaderService();
    try {
      const loaded = await loader.loadFromArrayBuffer(
        source.buffer.slice(0),
        source.fileName,
        source.buffer.byteLength
      );
      return { root: loaded.root, animations: loaded.animations };
    } finally {
      loader.dispose();
    }
  }

  private collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    root.traverse((obj) => {
      if (obj.name?.startsWith('__ascope_internal_')) return;
      if ((obj as THREE.Mesh).isMesh) meshes.push(obj as THREE.Mesh);
    });
    return meshes;
  }

  private applyRepairPatch(
    current: THREE.Mesh,
    fresh: THREE.Mesh,
    patchKind: 'index-only' | 'geometry'
  ) {
    const currentPosition = current.geometry?.attributes?.position;
    const freshPosition = fresh.geometry?.attributes?.position;

    if (!currentPosition || !freshPosition ||
        (current as THREE.SkinnedMesh).isSkinnedMesh !== (fresh as THREE.SkinnedMesh).isSkinnedMesh) {
      throw new Error('export.errors.structureMismatch');
    }

    if (patchKind === 'index-only') {
      if (currentPosition.count !== freshPosition.count ||
          Boolean(current.geometry.index) !== Boolean(fresh.geometry.index)) {
        throw new Error('export.errors.structureMismatch');
      }

      if (current.geometry.index && fresh.geometry.index) {
        fresh.geometry.setIndex(current.geometry.index.clone());
        fresh.geometry.index!.needsUpdate = true;
        fresh.geometry.computeBoundingBox();
        fresh.geometry.computeBoundingSphere();
      }
      return;
    }

    if (!current.geometry.index || !fresh.geometry.index) {
      throw new Error('export.errors.structureMismatch');
    }

    // Geometry repairs are copied into the pristine source at the geometry-data
    // level only. Materials, transforms, visibility, rig pose and viewport state
    // remain sourced from the clean asset.
    copyGeometryData(fresh.geometry, current.geometry);
  }

  private meshSignature(meshes: THREE.Mesh[]) {
    return JSON.stringify(meshes.map((mesh) => ({
      name: mesh.name,
      skinned: Boolean((mesh as THREE.SkinnedMesh).isSkinnedMesh),
      vertices: mesh.geometry?.attributes?.position?.count ?? 0,
      triangles: mesh.geometry?.index
        ? Math.floor(mesh.geometry.index.count / 3)
        : Math.floor((mesh.geometry?.attributes?.position?.count ?? 0) / 3),
    })));
  }

  private materialSignature(root: THREE.Object3D) {
    const values: string[] = [];
    const seen = new Set<string>();
    root.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const materialValue = (obj as THREE.Mesh).material;
      const mats: THREE.Material[] = Array.isArray(materialValue) ? materialValue : [materialValue];
      for (const material of mats) {
        if (!material || seen.has(material.uuid)) continue;
        seen.add(material.uuid);
        values.push(JSON.stringify([
          material.name,
          material.type,
          (material as THREE.MeshStandardMaterial).transparent,
          (material as THREE.MeshStandardMaterial).side,
        ]));
      }
    });
    return JSON.stringify(values.sort());
  }

  private rigSignature(root: THREE.Object3D) {
    const bones: string[] = [];
    let skinnedMeshes = 0;
    root.traverse((obj) => {
      if ((obj as THREE.Bone).isBone) bones.push(obj.name);
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh) skinnedMeshes++;
    });
    return JSON.stringify({ skinnedMeshes, bones: bones.sort() });
  }

  private animationSignature(clips: THREE.AnimationClip[]) {
    return JSON.stringify(clips.map((clip) => ({
      name: clip.name,
      duration: Number(clip.duration.toFixed(6)),
      tracks: clip.tracks.length,
    })));
  }

  private makeExportName(assetName: string) {
    const base = assetName.replace(/\.(glb|gltf)$/i, '') || 'asset';
    return `${base}_repaired.glb`;
  }

  private disposeObject(root: THREE.Object3D) {
    const textures = new Set<THREE.Texture>();
    const materials = new Set<THREE.Material>();
    const geometries = new Set<THREE.BufferGeometry>();

    root.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of mats) {
        if (!material || materials.has(material)) continue;
        materials.add(material);
        const candidate = material as THREE.MeshStandardMaterial;
        for (const texture of [
          candidate.map,
          candidate.normalMap,
          candidate.roughnessMap,
          candidate.metalnessMap,
          candidate.aoMap,
          candidate.emissiveMap,
        ]) {
          if (texture) textures.add(texture);
        }
      }
    });

    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
  }
}
