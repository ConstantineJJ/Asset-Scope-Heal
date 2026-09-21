import * as THREE from 'three';
import type { BoneInfo, DiagnosticLocation } from '../types';
import { skinnedVertexWorldPosition } from './SkinWeightMeasure';

export interface SkinningStats {
  skinnedMeshCount: number;
  skeletonCount: number;
  totalBones: number;
  rootBoneNames: string[];
  maxInfluencesPerVertex: number;
  zeroWeightVertices: number;
  invalidWeightSumVertices: number;
  unusedBonesCount: number;
  bones: BoneInfo[];
  invalidWeightLocations?: DiagnosticLocation[];
  zeroWeightLocations?: DiagnosticLocation[];
}

export function analyzeSkeletonAndSkinning(root: THREE.Object3D): SkinningStats {
  root.updateMatrixWorld(true);
  const bonesMap = new Map<string, THREE.Bone>();
  const skeletonsSet = new Set<THREE.Skeleton>();
  const skinnedMeshes: THREE.SkinnedMesh[] = [];

  root.traverse((obj) => {
    if (obj.name?.startsWith('__ascope_internal_')) return;
    if ((obj as THREE.Bone).isBone) {
      bonesMap.set(obj.uuid, obj as THREE.Bone);
    }
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
      const sm = obj as THREE.SkinnedMesh;
      skinnedMeshes.push(sm);
      if (sm.skeleton) skeletonsSet.add(sm.skeleton);
    }
  });

  const rootBones: string[] = [];
  const referencedBones = new Set<string>();

  // Bone info list
  const bones: BoneInfo[] = [];
  for (const bone of bonesMap.values()) {
    const parent = bone.parent;
    const isRoot = !parent || !(parent as THREE.Bone).isBone;
    if (isRoot) {
      rootBones.push(bone.name || bone.uuid.slice(0, 8));
    }

    const childrenNames: string[] = [];
    for (const child of bone.children) {
      if ((child as THREE.Bone).isBone) {
        childrenNames.push(child.name || child.uuid.slice(0, 8));
      }
    }

    bones.push({
      uuid: bone.uuid,
      name: bone.name || `Bone_${bone.id}`,
      parentName: parent && (parent as THREE.Bone).isBone ? parent.name : undefined,
      childrenNames,
      position: [bone.position.x, bone.position.y, bone.position.z],
      rotation: [bone.rotation.x, bone.rotation.y, bone.rotation.z],
      scale: [bone.scale.x, bone.scale.y, bone.scale.z],
    });
  }

  let maxInfluences = 0;
  let zeroWeightVertices = 0;
  let invalidWeightSumVertices = 0;
  const zeroWeightLocations: DiagnosticLocation[] = [];
  const invalidWeightLocations: DiagnosticLocation[] = [];

  for (const sm of skinnedMeshes) {
    const geom = sm.geometry;
    if (!geom) continue;

    const skinIndex = geom.attributes.skinIndex;
    const skinWeight = geom.attributes.skinWeight;

    if (skinIndex && skinWeight) {
      const vCount = skinWeight.count;
      const itemSize = skinWeight.itemSize; // typically 4

      for (let i = 0; i < vCount; i++) {
        let weightSum = 0;
        let activeInfluences = 0;

        for (let j = 0; j < itemSize; j++) {
          const w = skinWeight.getComponent(i, j);
          const bIdx = skinIndex.getComponent(i, j);
          if (w > 0.001) {
            activeInfluences++;
            weightSum += w;
            if (sm.skeleton && sm.skeleton.bones[bIdx]) {
              referencedBones.add(sm.skeleton.bones[bIdx].uuid);
            }
          }
        }

        if (activeInfluences > maxInfluences) {
          maxInfluences = activeInfluences;
        }

        if (activeInfluences === 0 || weightSum < 0.001) {
          zeroWeightVertices++;
          if (zeroWeightLocations.length < 16) {
            zeroWeightLocations.push({
              meshUuid: sm.uuid,
              meshName: sm.name || `SkinnedMesh_${sm.id}`,
              affectedElement: 'vertex',
              affectedIndices: [i],
              focusPosition: skinnedVertexWorldPosition(sm, i),
            });
          }
        } else if (Math.abs(weightSum - 1.0) > 0.05) {
          invalidWeightSumVertices++;
          if (invalidWeightLocations.length < 16) {
            invalidWeightLocations.push({
              meshUuid: sm.uuid,
              meshName: sm.name || `SkinnedMesh_${sm.id}`,
              affectedElement: 'vertex',
              affectedIndices: [i],
              focusPosition: skinnedVertexWorldPosition(sm, i),
            });
          }
        }
      }
    }
  }

  let unusedBonesCount = 0;
  if (skinnedMeshes.length > 0) {
    for (const boneUuid of bonesMap.keys()) {
      if (!referencedBones.has(boneUuid)) {
        unusedBonesCount++;
      }
    }
  }

  return {
    skinnedMeshCount: skinnedMeshes.length,
    skeletonCount: skeletonsSet.size,
    totalBones: bonesMap.size,
    rootBoneNames: rootBones,
    maxInfluencesPerVertex: maxInfluences,
    zeroWeightVertices,
    invalidWeightSumVertices,
    unusedBonesCount,
    bones,
    invalidWeightLocations,
    zeroWeightLocations,
  };
}

export const analyzeSkeleton = analyzeSkeletonAndSkinning;
