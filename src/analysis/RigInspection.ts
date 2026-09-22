import * as THREE from 'three';
import type { SkinInfluenceSummary } from '../types';

export function inspectSkinInfluence(
  root: THREE.Object3D,
  targetUuid: string | null
): SkinInfluenceSummary | null {
  if (!targetUuid) return null;
  const target = root.getObjectByProperty('uuid', targetUuid);
  if (!target) return null;

  const isBone = (target as THREE.Bone).isBone;
  const isSkinnedMesh = (target as THREE.SkinnedMesh).isSkinnedMesh;
  if (!isBone && !isSkinnedMesh) return null;

  if (isSkinnedMesh) {
    const mesh = target as THREE.SkinnedMesh;
    const skinIndex = mesh.geometry.getAttribute('skinIndex');
    const skinWeight = mesh.geometry.getAttribute('skinWeight');
    const position = mesh.geometry.getAttribute('position');
    const vertexCount = position?.count ?? 0;

    if (!skinIndex || !skinWeight) {
      return {
        targetUuid,
        targetName: mesh.name || `SkinnedMesh_${mesh.id}`,
        targetType: 'SkinnedMesh',
        skinnedMeshCount: 1,
        vertexCount,
        influencedVertices: 0,
        zeroWeightVertices: vertexCount,
        averageInfluencesPerVertex: 0,
        maxInfluencesPerVertex: 0,
      };
    }

    let influencedVertices = 0;
    let zeroWeightVertices = 0;
    let totalInfluences = 0;
    let maxInfluences = 0;

    for (let i = 0; i < skinWeight.count; i++) {
      let active = 0;
      for (let c = 0; c < skinWeight.itemSize; c++) {
        if (skinWeight.getComponent(i, c) > 0.001) active++;
      }
      if (active > 0) influencedVertices++;
      else zeroWeightVertices++;
      totalInfluences += active;
      maxInfluences = Math.max(maxInfluences, active);
    }

    return {
      targetUuid,
      targetName: mesh.name || `SkinnedMesh_${mesh.id}`,
      targetType: 'SkinnedMesh',
      skinnedMeshCount: 1,
      vertexCount,
      influencedVertices,
      zeroWeightVertices,
      averageInfluencesPerVertex: vertexCount > 0 ? totalInfluences / vertexCount : 0,
      maxInfluencesPerVertex: maxInfluences,
    };
  }

  const bone = target as THREE.Bone;
  let skinnedMeshCount = 0;
  let vertexCount = 0;
  let influencedVertices = 0;
  let totalInfluences = 0;
  let totalWeight = 0;
  let maxWeight = 0;

  root.traverse((object) => {
    if (!(object as THREE.SkinnedMesh).isSkinnedMesh) return;
    const mesh = object as THREE.SkinnedMesh;
    const boneIndex = mesh.skeleton?.bones.findIndex((candidate) => candidate.uuid === bone.uuid) ?? -1;
    if (boneIndex < 0) return;

    skinnedMeshCount++;
    const skinIndex = mesh.geometry.getAttribute('skinIndex');
    const skinWeight = mesh.geometry.getAttribute('skinWeight');
    const position = mesh.geometry.getAttribute('position');
    vertexCount += position?.count ?? 0;
    if (!skinIndex || !skinWeight) return;

    for (let i = 0; i < skinWeight.count; i++) {
      let vertexUsesBone = false;
      for (let c = 0; c < skinWeight.itemSize; c++) {
        if (skinIndex.getComponent(i, c) !== boneIndex) continue;
        const weight = skinWeight.getComponent(i, c);
        if (weight <= 0.001) continue;
        vertexUsesBone = true;
        totalInfluences++;
        totalWeight += weight;
        maxWeight = Math.max(maxWeight, weight);
      }
      if (vertexUsesBone) influencedVertices++;
    }
  });

  return {
    targetUuid,
    targetName: bone.name || `Bone_${bone.id}`,
    targetType: 'Bone',
    skinnedMeshCount,
    vertexCount,
    influencedVertices,
    zeroWeightVertices: 0,
    averageInfluencesPerVertex: influencedVertices > 0 ? totalInfluences / influencedVertices : 0,
    maxInfluencesPerVertex: influencedVertices > 0 ? 1 : 0,
    averageWeight: totalInfluences > 0 ? totalWeight / totalInfluences : 0,
    maxWeight,
  };
}
