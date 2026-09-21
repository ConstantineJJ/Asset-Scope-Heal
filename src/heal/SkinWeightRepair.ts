import * as THREE from 'three';
import { measureSkinWeights } from '../analysis/SkinWeightMeasure';

export interface SkinWeightRepairPlan {
  replacement: THREE.BufferGeometry;
  invalidBefore: number;
  invalidAfter: number;
  zeroWeightVertices: number;
  vertexCount: number;
}

export interface SkinWeightRepairBlocked {
  reasonKey: string;
}

export function planNormalizeSkinWeights(
  mesh: THREE.Mesh
): SkinWeightRepairPlan | SkinWeightRepairBlocked {
  const measurement = measureSkinWeights(mesh);
  if (!measurement.supported) {
    return { reasonKey: measurement.reasonKey ?? 'heal.errors.skinWeightsUnsupportedLayout' };
  }

  if (measurement.invalidSumCount === 0) {
    return { reasonKey: 'heal.errors.skinWeightsAlreadyNormalized' };
  }

  const source = mesh.geometry.getAttribute('skinWeight');
  if (
    !source ||
    source.itemSize !== 4 ||
    source.normalized ||
    !(source.array instanceof Float32Array)
  ) {
    return { reasonKey: 'heal.errors.skinWeightsUnsupportedStorage' };
  }

  const replacement = mesh.geometry.clone();
  const weights = replacement.getAttribute('skinWeight');

  for (let vertex = 0; vertex < weights.count; vertex++) {
    const values = [
      weights.getX(vertex),
      weights.getY(vertex),
      weights.getZ(vertex),
      weights.getW(vertex),
    ];

    if (values.some((value) => !Number.isFinite(value) || value < 0)) {
      replacement.dispose();
      return { reasonKey: 'heal.errors.skinWeightsInvalidValues' };
    }

    const sum = values.reduce((total, value) => total + value, 0);
    if (sum < 0.001) continue; // Zero-weight vertices require an authored influence, never a guess.
    if (Math.abs(sum - 1) <= 0.05) continue;

    weights.setXYZW(
      vertex,
      values[0] / sum,
      values[1] / sum,
      values[2] / sum,
      values[3] / sum
    );
  }

  weights.needsUpdate = true;

  const probe = new THREE.SkinnedMesh(
    replacement,
    (mesh as THREE.SkinnedMesh).material
  );
  const sourceSkinned = mesh as THREE.SkinnedMesh;
  probe.skeleton = sourceSkinned.skeleton;
  const after = measureSkinWeights(probe);

  if (!after.supported || after.invalidSumCount !== 0) {
    replacement.dispose();
    return { reasonKey: 'heal.errors.skinWeightsNormalizationFailed' };
  }

  return {
    replacement,
    invalidBefore: measurement.invalidSumCount,
    invalidAfter: after.invalidSumCount,
    zeroWeightVertices: after.zeroWeightCount,
    vertexCount: measurement.vertexCount,
  };
}
