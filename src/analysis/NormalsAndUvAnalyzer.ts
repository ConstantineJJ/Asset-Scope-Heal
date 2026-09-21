import * as THREE from 'three';
import type { DiagnosticLocation, HealthIssue } from '../types';
import { measureGeometryNormals, vertexWorldPosition } from './NormalsMeasure';

export function analyzeNormalsAndUvs(root: THREE.Object3D): HealthIssue[] {
  const issues: HealthIssue[] = [];
  let missingNormalsCount = 0;
  let invalidNormalsCount = 0;
  let missingUv0Count = 0;
  let hasUv1Count = 0;

  const missingLocations: DiagnosticLocation[] = [];
  const invalidLocations: DiagnosticLocation[] = [];

  root.updateMatrixWorld(true);

  root.traverse((obj) => {
    if (obj.name?.startsWith('__ascope_internal_')) return;
    if (!(obj as THREE.Mesh).isMesh) return;

    const mesh = obj as THREE.Mesh;
    const geom = mesh.geometry;
    if (!geom) return;

    const measurement = measureGeometryNormals(geom);

    if (measurement.missing) {
      missingNormalsCount++;
      missingLocations.push({
        meshUuid: mesh.uuid,
        meshName: mesh.name || `Mesh_${mesh.id}`,
        affectedElement: 'vertex',
        affectedIndices: measurement.sampleIndices,
        focusPosition: vertexWorldPosition(mesh, measurement.sampleIndices[0] ?? 0),
      });
    } else if (measurement.invalidCount > 0 || measurement.malformed) {
      invalidNormalsCount += Math.max(measurement.invalidCount, 1);
      invalidLocations.push({
        meshUuid: mesh.uuid,
        meshName: mesh.name || `Mesh_${mesh.id}`,
        affectedElement: 'vertex',
        affectedIndices: measurement.sampleIndices,
        focusPosition: vertexWorldPosition(mesh, measurement.sampleIndices[0] ?? 0),
      });
    }

    const uvAttr = geom.attributes.uv;
    if (!uvAttr) missingUv0Count++;

    const uv1Attr = geom.attributes.uv1 || geom.attributes.uv2;
    if (uv1Attr) hasUv1Count++;
  });

  if (missingNormalsCount > 0) {
    const first = missingLocations[0];
    issues.push({
      id: 'normals-missing',
      category: 'Normals',
      severity: 'WARNING',
      layer: 'Health',
      title: 'Missing vertex normals',
      description: `${missingNormalsCount} mesh(es) lack explicit vertex normal vectors. Shading will depend on runtime-generated or fallback normals.`,
      count: missingNormalsCount,
      repairability: 'CONDITIONAL',
      evidence: `Meshes without normal attributes: ${missingNormalsCount}`,
      suggestedAction: 'Preview deterministic normal recalculation for the affected mesh.',
      ...(first
        ? {
            meshUuid: first.meshUuid,
            meshName: first.meshName,
            affectedElement: first.affectedElement,
            affectedIndices: first.affectedIndices,
            focusPosition: first.focusPosition,
            locations: missingLocations,
          }
        : {}),
    });
  } else {
    issues.push({
      id: 'normals-ok',
      category: 'Normals',
      severity: 'OK',
      title: 'Vertex normals intact',
      description: 'All meshes contain explicit vertex normal attributes.',
    });
  }

  if (invalidNormalsCount > 0) {
    const first = invalidLocations[0];
    issues.push({
      id: 'normals-zero',
      category: 'Normals',
      severity: 'WARNING',
      layer: 'Health',
      title: 'Invalid normal vectors detected',
      description: `${invalidNormalsCount} vertex normal(s) are zero-length, non-finite, malformed, or substantially unnormalized. This can cause black, unstable, or inconsistent shading.`,
      count: invalidNormalsCount,
      repairability: 'CONDITIONAL',
      evidence: `Invalid normal vectors: ${invalidNormalsCount}`,
      suggestedAction: 'Preview deterministic normal recalculation for the affected mesh.',
      ...(first
        ? {
            meshUuid: first.meshUuid,
            meshName: first.meshName,
            affectedElement: first.affectedElement,
            affectedIndices: first.affectedIndices,
            focusPosition: first.focusPosition,
            locations: invalidLocations,
          }
        : {}),
    });
  }

  if (missingUv0Count > 0) {
    issues.push({
      id: 'uv-missing-uv0',
      category: 'UV',
      severity: 'INFO',
      title: 'Meshes without primary UV0',
      description: `${missingUv0Count} mesh(es) do not have UV0 coordinates. Texture maps cannot be mapped without projection.`,
      count: missingUv0Count,
    });
  } else {
    issues.push({
      id: 'uv0-ok',
      category: 'UV',
      severity: 'OK',
      title: 'Primary UV set (UV0) present',
      description: 'All meshes have primary texture coordinates mapped.',
    });
  }

  if (hasUv1Count > 0) {
    issues.push({
      id: 'uv-secondary-uv1',
      category: 'UV',
      severity: 'INFO',
      title: 'Secondary UV set (UV1/Lightmap) detected',
      description: `${hasUv1Count} mesh(es) include secondary UV channels, suitable for baked lighting or detail texturing.`,
      count: hasUv1Count,
    });
  }

  return issues;
}

export const analyzeNormalsAndUv = analyzeNormalsAndUvs;
