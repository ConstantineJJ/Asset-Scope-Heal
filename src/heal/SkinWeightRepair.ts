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


export interface DuplicateSkinInfluenceRepairPlan {
  replacement: THREE.BufferGeometry;
  redundantBefore: number;
  redundantAfter: number;
  invalidWeightSumsBefore: number;
  invalidWeightSumsAfter: number;
  zeroWeightVerticesBefore: number;
  zeroWeightVerticesAfter: number;
  vertexCount: number;
}

export function planConsolidateDuplicateSkinInfluences(
  mesh: THREE.Mesh
): DuplicateSkinInfluenceRepairPlan | SkinWeightRepairBlocked {
  const measurement = measureSkinWeights(mesh);
  if (!measurement.supported) {
    return { reasonKey: measurement.reasonKey ?? 'heal.errors.skinWeightsUnsupportedLayout' };
  }

  if (measurement.redundantInfluenceVertexCount === 0) {
    return { reasonKey: 'heal.errors.noRedundantSkinInfluences' };
  }

  const geometry = mesh.geometry;
  const skinIndex = geometry.getAttribute('skinIndex');
  const skinWeight = geometry.getAttribute('skinWeight');
  if (
    !skinIndex ||
    !skinWeight ||
    skinIndex.itemSize !== 4 ||
    skinWeight.itemSize !== 4 ||
    skinIndex.normalized ||
    skinWeight.normalized ||
    !(
      skinIndex.array instanceof Uint8Array ||
      skinIndex.array instanceof Uint16Array ||
      skinIndex.array instanceof Uint32Array
    ) ||
    !(skinWeight.array instanceof Float32Array)
  ) {
    return { reasonKey: 'heal.errors.skinInfluenceStorageUnsupported' };
  }

  const skinned = mesh as THREE.SkinnedMesh;
  if (!skinned.skeleton) {
    return { reasonKey: 'heal.errors.skinWeightsNeedsSkinnedMesh' };
  }

  const replacement = geometry.clone();
  const indices = replacement.getAttribute('skinIndex');
  const weights = replacement.getAttribute('skinWeight');

  for (let vertex = 0; vertex < weights.count; vertex++) {
    const firstSlotByBone = new Map<number, number>();
    const slotIndices = [
      indices.getX(vertex),
      indices.getY(vertex),
      indices.getZ(vertex),
      indices.getW(vertex),
    ];
    const slotWeights = [
      weights.getX(vertex),
      weights.getY(vertex),
      weights.getZ(vertex),
      weights.getW(vertex),
    ];

    for (let slot = 0; slot < 4; slot++) {
      const boneIndex = slotIndices[slot];
      const weight = slotWeights[slot];

      if (
        !Number.isFinite(boneIndex) ||
        !Number.isInteger(boneIndex) ||
        boneIndex < 0 ||
        boneIndex >= skinned.skeleton.bones.length ||
        !Number.isFinite(weight) ||
        weight < 0
      ) {
        replacement.dispose();
        return { reasonKey: 'heal.errors.skinInfluenceInvalidValues' };
      }

      if (weight <= 0.001) continue;

      const firstSlot = firstSlotByBone.get(boneIndex);
      if (firstSlot === undefined) {
        firstSlotByBone.set(boneIndex, slot);
        continue;
      }

      slotWeights[firstSlot] += weight;
      slotWeights[slot] = 0;
      slotIndices[slot] = 0;
    }

    indices.setXYZW(
      vertex,
      slotIndices[0],
      slotIndices[1],
      slotIndices[2],
      slotIndices[3]
    );
    weights.setXYZW(
      vertex,
      slotWeights[0],
      slotWeights[1],
      slotWeights[2],
      slotWeights[3]
    );
  }

  indices.needsUpdate = true;
  weights.needsUpdate = true;

  const probe = new THREE.SkinnedMesh(replacement, skinned.material);
  probe.skeleton = skinned.skeleton;
  const after = measureSkinWeights(probe);

  if (!after.supported || after.redundantInfluenceVertexCount !== 0) {
    replacement.dispose();
    return { reasonKey: 'heal.errors.skinInfluenceConsolidationFailed' };
  }

  if (
    after.invalidSumCount !== measurement.invalidSumCount ||
    after.zeroWeightCount !== measurement.zeroWeightCount
  ) {
    replacement.dispose();
    return { reasonKey: 'heal.errors.skinInfluenceChangesWeights' };
  }

  return {
    replacement,
    redundantBefore: measurement.redundantInfluenceVertexCount,
    redundantAfter: after.redundantInfluenceVertexCount,
    invalidWeightSumsBefore: measurement.invalidSumCount,
    invalidWeightSumsAfter: after.invalidSumCount,
    zeroWeightVerticesBefore: measurement.zeroWeightCount,
    zeroWeightVerticesAfter: after.zeroWeightCount,
    vertexCount: measurement.vertexCount,
  };
}
