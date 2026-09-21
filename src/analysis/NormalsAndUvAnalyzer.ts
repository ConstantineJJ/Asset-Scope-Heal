import * as THREE from 'three';
import type { HealthIssue } from '../types';

export function analyzeNormalsAndUvs(root: THREE.Object3D): HealthIssue[] {
  const issues: HealthIssue[] = [];
  let missingNormalsCount = 0;
  let zeroNormalsCount = 0;
  let missingUv0Count = 0;
  let hasUv1Count = 0;
  let meshCount = 0;

  root.traverse((obj) => {
    if (obj.name?.startsWith('__ascope_internal_')) return;
    if ((obj as THREE.Mesh).isMesh) {
      meshCount++;
      const mesh = obj as THREE.Mesh;
      const geom = mesh.geometry;
      if (!geom) return;

      const normAttr = geom.attributes.normal;
      if (!normAttr) {
        missingNormalsCount++;
      } else {
        // Sample test for zero normals
        const count = Math.min(normAttr.count, 500);
        for (let i = 0; i < count; i++) {
          const nx = normAttr.getX(i);
          const ny = normAttr.getY(i);
          const nz = normAttr.getZ(i);
          const lenSq = nx * nx + ny * ny + nz * nz;
          if (lenSq < 0.0001) {
            zeroNormalsCount++;
            break;
          }
        }
      }

      const uvAttr = geom.attributes.uv;
      if (!uvAttr) {
        missingUv0Count++;
      }

      const uv1Attr = geom.attributes.uv1 || geom.attributes.uv2;
      if (uv1Attr) {
        hasUv1Count++;
      }
    }
  });

  // Normals issues
  if (missingNormalsCount > 0) {
    issues.push({
      id: 'normals-missing',
      category: 'Normals',
      severity: 'WARNING',
      layer: 'Health',
      title: 'Missing vertex normals',
      description: `${missingNormalsCount} mesh(es) lack explicit vertex normal vectors. Flat or computed shading will be required.`,
      count: missingNormalsCount,
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

  if (zeroNormalsCount > 0) {
    issues.push({
      id: 'normals-zero',
      category: 'Normals',
      severity: 'WARNING',
      layer: 'Health',
      title: 'Zero-length normal vectors detected',
      description: `${zeroNormalsCount} mesh(es) contain zero-length or unnormalized normal attributes, causing black shading artifacts.`,
      count: zeroNormalsCount,
    });
  }

  // UV issues
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
