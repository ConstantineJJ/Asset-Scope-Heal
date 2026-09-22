import * as THREE from 'three';
import type { DiagnosticLocation, HealthIssue } from '../types';
import { measureGeometryNormals, vertexWorldPosition } from './NormalsMeasure';

const UV_AREA_EPSILON = 1e-12;
const MAX_LOCATION_SAMPLES = 16;

function isUvChannelName(name: string): boolean {
  return name === 'uv' || /^uv\d+$/.test(name);
}

export function analyzeNormalsAndUvs(root: THREE.Object3D): HealthIssue[] {
  const issues: HealthIssue[] = [];
  let missingNormalsCount = 0;
  let invalidNormalsCount = 0;
  let missingUv0Count = 0;
  let hasUv1Count = 0;

  let malformedUvAttributes = 0;
  let nonFiniteUvVertices = 0;
  let zeroAreaUvTriangles = 0;
  let outsideUnitRangeVertices = 0;
  let evaluatedMeshCount = 0;
  let evaluatedUvVertices = 0;
  let evaluatedUvTriangles = 0;

  const missingLocations: DiagnosticLocation[] = [];
  const invalidLocations: DiagnosticLocation[] = [];
  const malformedUvLocations: DiagnosticLocation[] = [];
  const nonFiniteUvLocations: DiagnosticLocation[] = [];
  const zeroAreaUvLocations: DiagnosticLocation[] = [];
  const outsideRangeLocations: DiagnosticLocation[] = [];
  const uvInventory = new Map<string, number>();

  root.updateMatrixWorld(true);

  root.traverse((obj) => {
    if (obj.name?.startsWith('__ascope_internal_')) return;
    if (!(obj as THREE.Mesh).isMesh) return;

    const mesh = obj as THREE.Mesh;
    const geom = mesh.geometry;
    if (!geom) return;
    evaluatedMeshCount++;

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

    const position = geom.getAttribute('position');
    const uvAttr = geom.getAttribute('uv');

    for (const [attributeName] of Object.entries(geom.attributes)) {
      if (!isUvChannelName(attributeName)) continue;
      uvInventory.set(attributeName, (uvInventory.get(attributeName) ?? 0) + 1);
    }

    if (!uvAttr) {
      missingUv0Count++;
    } else {
      evaluatedUvVertices += uvAttr.count;
      const malformed =
        uvAttr.itemSize < 2 ||
        !position ||
        uvAttr.count !== position.count;

      if (malformed) {
        malformedUvAttributes++;
        if (malformedUvLocations.length < MAX_LOCATION_SAMPLES) {
          malformedUvLocations.push({
            meshUuid: mesh.uuid,
            meshName: mesh.name || `Mesh_${mesh.id}`,
            affectedElement: 'vertex',
            affectedIndices: [0],
            focusPosition: vertexWorldPosition(mesh, 0),
          });
        }
      }

      for (let i = 0; i < uvAttr.count; i++) {
        const u = uvAttr.getX(i);
        const v = uvAttr.getY(i);

        if (!Number.isFinite(u) || !Number.isFinite(v)) {
          nonFiniteUvVertices++;
          if (nonFiniteUvLocations.length < MAX_LOCATION_SAMPLES && position && i < position.count) {
            nonFiniteUvLocations.push({
              meshUuid: mesh.uuid,
              meshName: mesh.name || `Mesh_${mesh.id}`,
              affectedElement: 'vertex',
              affectedIndices: [i],
              focusPosition: vertexWorldPosition(mesh, i),
            });
          }
          continue;
        }

        if (u < 0 || u > 1 || v < 0 || v > 1) {
          outsideUnitRangeVertices++;
          if (outsideRangeLocations.length < MAX_LOCATION_SAMPLES && position && i < position.count) {
            outsideRangeLocations.push({
              meshUuid: mesh.uuid,
              meshName: mesh.name || `Mesh_${mesh.id}`,
              affectedElement: 'vertex',
              affectedIndices: [i],
              focusPosition: vertexWorldPosition(mesh, i),
            });
          }
        }
      }

      if (!malformed && position) {
        const index = geom.index;
        const triangleCount = index
          ? Math.floor(index.count / 3)
          : Math.floor(position.count / 3);
        evaluatedUvTriangles += triangleCount;

        for (let triangle = 0; triangle < triangleCount; triangle++) {
          const base = triangle * 3;
          const ia = index ? index.getX(base) : base;
          const ib = index ? index.getX(base + 1) : base + 1;
          const ic = index ? index.getX(base + 2) : base + 2;

          if (
            ia < 0 || ib < 0 || ic < 0 ||
            ia >= uvAttr.count || ib >= uvAttr.count || ic >= uvAttr.count
          ) {
            continue;
          }

          const au = uvAttr.getX(ia);
          const av = uvAttr.getY(ia);
          const bu = uvAttr.getX(ib);
          const bv = uvAttr.getY(ib);
          const cu = uvAttr.getX(ic);
          const cv = uvAttr.getY(ic);

          if (![au, av, bu, bv, cu, cv].every(Number.isFinite)) continue;

          const doubledArea = Math.abs((bu - au) * (cv - av) - (bv - av) * (cu - au));
          if (doubledArea <= UV_AREA_EPSILON * 2) {
            zeroAreaUvTriangles++;
            if (zeroAreaUvLocations.length < MAX_LOCATION_SAMPLES) {
              zeroAreaUvLocations.push({
                meshUuid: mesh.uuid,
                meshName: mesh.name || `Mesh_${mesh.id}`,
                affectedElement: 'triangle',
                affectedIndices: [triangle],
                focusPosition: vertexWorldPosition(mesh, ia),
              });
            }
          }
        }
      }
    }

    const uv1Attr = geom.getAttribute('uv1') || geom.getAttribute('uv2');
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
      ratio:
        evaluatedMeshCount > 0
          ? `${((missingNormalsCount / evaluatedMeshCount) * 100).toFixed(1)}% (${missingNormalsCount}/${evaluatedMeshCount} meshes)`
          : undefined,
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
      layer: 'Health',
      title: 'Meshes without primary UV0',
      description: `${missingUv0Count} mesh(es) do not have UV0 coordinates. Texture maps that require UV0 cannot be sampled normally.`,
      count: missingUv0Count,
      ratio:
        evaluatedMeshCount > 0
          ? `${((missingUv0Count / evaluatedMeshCount) * 100).toFixed(1)}% (${missingUv0Count}/${evaluatedMeshCount} meshes)`
          : undefined,
      repairability: 'MANUAL',
      suggestedAction: 'Manual repair recommended only if UV mapping is required for the intended material workflow.',
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

  if (uvInventory.size > 0) {
    const inventoryText = [...uvInventory.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, meshCount]) => `${name}: ${meshCount} mesh(es)`)
      .join(', ');

    issues.push({
      id: 'uv-channel-inventory',
      category: 'UV',
      severity: 'INFO',
      layer: 'Health',
      title: 'UV channel inventory',
      description: inventoryText,
      count: uvInventory.size,
      evidence: inventoryText,
      repairability: 'NONE',
      suggestedAction: 'No action required. Use this inventory to confirm channel expectations.',
    });
  }

  if (malformedUvAttributes > 0) {
    const first = malformedUvLocations[0];
    issues.push({
      id: 'uv-malformed-attributes',
      category: 'UV',
      severity: 'ERROR',
      layer: 'Integrity',
      title: 'Malformed UV attribute sizes',
      description: `${malformedUvAttributes} mesh(es) have UV0 item size/count that does not match the vertex domain.`,
      count: malformedUvAttributes,
      ratio:
        evaluatedMeshCount > 0
          ? `${((malformedUvAttributes / evaluatedMeshCount) * 100).toFixed(1)}% (${malformedUvAttributes}/${evaluatedMeshCount} meshes)`
          : undefined,
      evidence: 'UV0 must provide at least two components per vertex and align with POSITION count.',
      whyItMatters: 'Malformed UV arrays cannot be mapped deterministically to mesh vertices.',
      suggestedAction: 'Repair or re-export the UV attribute in a modeling tool.',
      repairability: 'MANUAL',
      ...(first
        ? {
            meshUuid: first.meshUuid,
            meshName: first.meshName,
            affectedElement: first.affectedElement,
            affectedIndices: first.affectedIndices,
            focusPosition: first.focusPosition,
            locations: malformedUvLocations,
          }
        : {}),
    });
  }

  if (nonFiniteUvVertices > 0) {
    const first = nonFiniteUvLocations[0];
    issues.push({
      id: 'uv-nonfinite-values',
      category: 'UV',
      severity: 'ERROR',
      layer: 'Integrity',
      title: 'NaN / Infinity found in UV coordinates',
      description: `${nonFiniteUvVertices} UV vertex/vertices contain non-finite U or V values.`,
      count: nonFiniteUvVertices,
      ratio:
        evaluatedUvVertices > 0
          ? `${((nonFiniteUvVertices / evaluatedUvVertices) * 100).toFixed(3)}% (${nonFiniteUvVertices}/${evaluatedUvVertices} UV vertices)`
          : undefined,
      whyItMatters: 'Non-finite UVs can produce undefined texture sampling and invalidate UV diagnostics.',
      suggestedAction: 'Correct the UV data explicitly in the source asset.',
      repairability: 'MANUAL',
      ...(first
        ? {
            meshUuid: first.meshUuid,
            meshName: first.meshName,
            affectedElement: first.affectedElement,
            affectedIndices: first.affectedIndices,
            focusPosition: first.focusPosition,
            locations: nonFiniteUvLocations,
          }
        : {}),
    });
  }

  if (zeroAreaUvTriangles > 0) {
    const first = zeroAreaUvLocations[0];
    issues.push({
      id: 'uv-zero-area-triangles',
      category: 'UV',
      severity: 'WARNING',
      layer: 'Health',
      title: 'Zero-area UV triangles detected',
      description: `${zeroAreaUvTriangles} triangle(s) collapse to zero or near-zero area in UV0.`,
      count: zeroAreaUvTriangles,
      ratio:
        evaluatedUvTriangles > 0
          ? `${((zeroAreaUvTriangles / evaluatedUvTriangles) * 100).toFixed(2)}% (${zeroAreaUvTriangles}/${evaluatedUvTriangles} UV triangles)`
          : undefined,
      whyItMatters: 'Collapsed UV faces can create unstable baking, mip behavior or texture-space derivatives.',
      suggestedAction: 'Inspect the affected faces. Manual repair recommended when the collapse is not intentional.',
      repairability: 'MANUAL',
      ...(first
        ? {
            meshUuid: first.meshUuid,
            meshName: first.meshName,
            affectedElement: first.affectedElement,
            affectedIndices: first.affectedIndices,
            focusPosition: first.focusPosition,
            locations: zeroAreaUvLocations,
          }
        : {}),
    });
  }

  if (outsideUnitRangeVertices > 0) {
    const first = outsideRangeLocations[0];
    issues.push({
      id: 'uv-outside-unit-range',
      category: 'UV',
      severity: 'INFO',
      layer: 'Health',
      title: 'UV coordinates outside 0–1 detected',
      description: `${outsideUnitRangeVertices} UV vertex/vertices lie outside the 0–1 tile. This is informational; tiled and UDIM-like workflows may use such coordinates intentionally.`,
      count: outsideUnitRangeVertices,
      ratio:
        evaluatedUvVertices > 0
          ? `${((outsideUnitRangeVertices / evaluatedUvVertices) * 100).toFixed(2)}% (${outsideUnitRangeVertices}/${evaluatedUvVertices} UV vertices)`
          : undefined,
      whyItMatters: 'Out-of-range UVs are not inherently defective, but they affect wrapping and texture addressing.',
      suggestedAction: 'No automatic repair. Confirm that the material workflow expects tiled coordinates.',
      repairability: 'NONE',
      ...(first
        ? {
            meshUuid: first.meshUuid,
            meshName: first.meshName,
            affectedElement: first.affectedElement,
            affectedIndices: first.affectedIndices,
            focusPosition: first.focusPosition,
            locations: outsideRangeLocations,
          }
        : {}),
    });
  }

  return issues;
}

export const analyzeNormalsAndUv = analyzeNormalsAndUvs;
