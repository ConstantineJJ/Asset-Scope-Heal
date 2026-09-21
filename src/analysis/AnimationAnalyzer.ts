import * as THREE from 'three';
import type { AnimationClipInfo } from '../types';

export function analyzeAnimations(
  clips: THREE.AnimationClip[],
  rootBoneNames: string[] = []
): AnimationClipInfo[] {
  const result: AnimationClipInfo[] = [];

  for (const clip of clips) {
    let maxDisplacement = 0;
    let maxAngleDelta = 0;
    let rootMotionFound = false;

    // Search for root track
    for (const track of clip.tracks) {
      const isPositionTrack = track.name.endsWith('.position');
      const isRotationTrack = track.name.endsWith('.quaternion');

      const isRootCandidate =
        rootBoneNames.some((r) => track.name.includes(r)) ||
        track.name.toLowerCase().includes('root') ||
        track.name.toLowerCase().includes('hip') ||
        track.name.toLowerCase().includes('pelvis');

      if (isPositionTrack && isRootCandidate && track.values.length >= 6) {
        const v = track.values;
        const startX = v[0];
        const startY = v[1];
        const startZ = v[2];

        const endX = v[v.length - 3];
        const endY = v[v.length - 2];
        const endZ = v[v.length - 1];

        const dx = endX - startX;
        const dy = endY - startY;
        const dz = endZ - startZ;
        const disp = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (disp > maxDisplacement) {
          maxDisplacement = disp;
        }

        if (disp > 0.05) {
          rootMotionFound = true;
        }
      }

      if (isRotationTrack && isRootCandidate && track.values.length >= 8) {
        const v = track.values;
        const qStart = new THREE.Quaternion(v[0], v[1], v[2], v[3]);
        const qEnd = new THREE.Quaternion(
          v[v.length - 4],
          v[v.length - 3],
          v[v.length - 2],
          v[v.length - 1]
        );
        const angle = qStart.angleTo(qEnd) * (180 / Math.PI);
        if (angle > maxAngleDelta) {
          maxAngleDelta = angle;
        }
      }
    }

    result.push({
      name: clip.name || 'Unnamed Clip',
      duration: clip.duration,
      trackCount: clip.tracks.length,
      rootMotionTranslation: maxDisplacement > 0 ? Number(maxDisplacement.toFixed(3)) : 0,
      rootMotionRotation: maxAngleDelta > 0 ? Number(maxAngleDelta.toFixed(1)) : 0,
      rootMotionDetected: rootMotionFound,
    });
  }

  return result;
}
