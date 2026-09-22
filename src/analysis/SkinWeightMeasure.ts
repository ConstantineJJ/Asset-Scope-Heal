import * as THREE from 'three';

export interface SkinWeightMeasurement {
  supported: boolean;
  reasonKey?: string;
  vertexCount: number;
  invalidSumCount: number;
  zeroWeightCount: number;
  redundantInfluenceVertexCount: number;
  sampleInvalidIndices: number[];
  sampleZeroIndices: number[];
  sampleRedundantIndices: number[];
}

export function measureSkinWeights(
  mesh: THREE.Mesh,
  sampleLimit = 8
): SkinWeightMeasurement {
  if (!(mesh as THREE.SkinnedMesh).isSkinnedMesh) {
    return {
      supported: false,
      reasonKey: 'heal.errors.skinWeightsNeedsSkinnedMesh',
      vertexCount: 0,
      invalidSumCount: 0,
      zeroWeightCount: 0,
      redundantInfluenceVertexCount: 0,
      sampleInvalidIndices: [],
      sampleZeroIndices: [],
      sampleRedundantIndices: [],
    };
  }

  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  const skinIndex = geometry.getAttribute('skinIndex');
  const skinWeight = geometry.getAttribute('skinWeight');

  if (!position || !skinIndex || !skinWeight) {
    return {
      supported: false,
      reasonKey: 'heal.errors.skinWeightsMissingAttributes',
      vertexCount: position?.count ?? 0,
      invalidSumCount: 0,
      zeroWeightCount: 0,
      redundantInfluenceVertexCount: 0,
      sampleInvalidIndices: [],
      sampleZeroIndices: [],
      sampleRedundantIndices: [],
    };
  }

  if (
    geometry.getAttribute('skinIndex1') ||
    geometry.getAttribute('skinWeight1') ||
    skinIndex.itemSize !== 4 ||
    skinWeight.itemSize !== 4 ||
    skinIndex.count !== position.count ||
    skinWeight.count !== position.count
  ) {
    return {
      supported: false,
      reasonKey: 'heal.errors.skinWeightsUnsupportedLayout',
      vertexCount: position.count,
      invalidSumCount: 0,
      zeroWeightCount: 0,
      redundantInfluenceVertexCount: 0,
      sampleInvalidIndices: [],
      sampleZeroIndices: [],
      sampleRedundantIndices: [],
    };
  }

  let invalidSumCount = 0;
  let zeroWeightCount = 0;
  let redundantInfluenceVertexCount = 0;
  const sampleInvalidIndices: number[] = [];
  const sampleZeroIndices: number[] = [];
  const sampleRedundantIndices: number[] = [];

  for (let vertex = 0; vertex < skinWeight.count; vertex++) {
    let sum = 0;
    let active = 0;
    let invalidValue = false;
    let hasRedundantActiveInfluence = false;
    const activeBoneIndices = new Set<number>();

    for (let component = 0; component < 4; component++) {
      const weight = skinWeight.getComponent(vertex, component);
      const boneIndex = skinIndex.getComponent(vertex, component);
      if (
        !Number.isFinite(weight) ||
        weight < 0 ||
        !Number.isFinite(boneIndex) ||
        boneIndex < 0 ||
        !Number.isInteger(boneIndex)
      ) {
        invalidValue = true;
        break;
      }
      sum += weight;
      if (weight > 0.001) {
        active++;
        if (activeBoneIndices.has(boneIndex)) hasRedundantActiveInfluence = true;
        activeBoneIndices.add(boneIndex);
      }
    }

    if (invalidValue) {
      invalidSumCount++;
      if (sampleInvalidIndices.length < sampleLimit) sampleInvalidIndices.push(vertex);
      continue;
    }

    if (hasRedundantActiveInfluence) {
      redundantInfluenceVertexCount++;
      if (sampleRedundantIndices.length < sampleLimit) sampleRedundantIndices.push(vertex);
    }

    if (active === 0 || sum < 0.001) {
      zeroWeightCount++;
      if (sampleZeroIndices.length < sampleLimit) sampleZeroIndices.push(vertex);
      continue;
    }

    if (Math.abs(sum - 1) > 0.05) {
      invalidSumCount++;
      if (sampleInvalidIndices.length < sampleLimit) sampleInvalidIndices.push(vertex);
    }
  }

  return {
    supported: true,
    vertexCount: position.count,
    invalidSumCount,
    zeroWeightCount,
    redundantInfluenceVertexCount,
    sampleInvalidIndices,
    sampleZeroIndices,
    sampleRedundantIndices,
  };
}

export function skinnedVertexWorldPosition(
  mesh: THREE.Mesh,
  vertexIndex: number
): [number, number, number] {
  const position = mesh.geometry.getAttribute('position');
  const point = new THREE.Vector3();

  if (!position || vertexIndex < 0 || vertexIndex >= position.count) {
    mesh.geometry.computeBoundingBox();
    mesh.geometry.boundingBox?.getCenter(point);
  } else {
    point.set(
      position.getX(vertexIndex),
      position.getY(vertexIndex),
      position.getZ(vertexIndex)
    );
  }

  mesh.localToWorld(point);
  return [point.x, point.y, point.z];
}
