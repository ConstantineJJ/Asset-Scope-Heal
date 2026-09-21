import * as THREE from 'three';
import { measureGeometryNormals } from '../analysis/NormalsMeasure';

export interface NormalRepairPlan {
  replacement: THREE.BufferGeometry;
  invalidBefore: number;
  invalidAfter: number;
  vertexCount: number;
}

export interface NormalRepairBlocked {
  reasonKey: string;
}

export function planRecalculateNormals(
  geometry: THREE.BufferGeometry
): NormalRepairPlan | NormalRepairBlocked {
  const position = geometry.getAttribute('position');
  if (!position || position.itemSize !== 3 || position.count === 0) {
    return { reasonKey: 'heal.errors.invalidGeometry' };
  }

  // Recomputing base normals while preserving a tangent stream would make the
  // tangent basis stale. Until tangent regeneration is part of the same
  // transaction, refuse instead of silently degrading shading.
  if (geometry.getAttribute('tangent')) {
    return { reasonKey: 'heal.errors.normalsTangentsUnsupported' };
  }

  // Morph target normals encode deformation-specific normal deltas. Replacing
  // only the base normal stream would create an inconsistent morph result.
  if ((geometry.morphAttributes.normal?.length ?? 0) > 0) {
    return { reasonKey: 'heal.errors.morphNormalsUnsupported' };
  }

  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return { reasonKey: 'heal.errors.invalidGeometry' };
    }
  }

  if (geometry.index) {
    if (geometry.index.count === 0 || geometry.index.count % 3 !== 0) {
      return { reasonKey: 'heal.errors.invalidGeometry' };
    }
    for (let i = 0; i < geometry.index.count; i++) {
      const value = geometry.index.getX(i);
      if (!Number.isInteger(value) || value < 0 || value >= position.count) {
        return { reasonKey: 'heal.errors.invalidGeometry' };
      }
    }
  } else if (position.count % 3 !== 0) {
    return { reasonKey: 'heal.errors.invalidGeometry' };
  }

  const before = measureGeometryNormals(geometry);
  if (!before.missing && !before.malformed && before.invalidCount === 0) {
    return { reasonKey: 'heal.errors.normalsAlreadyValid' };
  }

  const replacement = geometry.clone();
  replacement.deleteAttribute('normal');
  replacement.computeVertexNormals();

  const normal = replacement.getAttribute('normal');
  if (normal) normal.needsUpdate = true;
  replacement.computeBoundingBox();
  replacement.computeBoundingSphere();

  const after = measureGeometryNormals(replacement);
  if (after.missing || after.malformed || after.invalidCount > 0) {
    replacement.dispose();
    return { reasonKey: 'heal.errors.normalsRecalculationFailed' };
  }

  return {
    replacement,
    invalidBefore: Math.max(before.invalidCount, before.missing ? before.vertexCount : 0),
    invalidAfter: after.invalidCount,
    vertexCount: position.count,
  };
}
