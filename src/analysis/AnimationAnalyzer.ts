import * as THREE from 'three';
import type { AnimationClipInfo } from '../types';

export interface RootMotionMeasurement {
  detected: boolean;
  translation: number;
  rotation: number;
  delta: [number, number, number];
  translationTrackName?: string;
}

function isRootCandidate(trackName: string, rootBoneNames: string[]): boolean {
  const lower = trackName.toLowerCase();
  return (
    rootBoneNames.some((name) => name && trackName.includes(name)) ||
    lower.includes('root') ||
    lower.includes('hip') ||
    lower.includes('pelvis')
  );
}

export function measureRootMotion(
  clip: THREE.AnimationClip,
  rootBoneNames: string[] = []
): RootMotionMeasurement {
  let maxDisplacement = 0;
  let maxAngleDelta = 0;
  let bestDelta: [number, number, number] = [0, 0, 0];
  let translationTrackName: string | undefined;

  for (const track of clip.tracks) {
    const isPositionTrack = track.name.endsWith('.position');
    const isRotationTrack = track.name.endsWith('.quaternion');
    if (!isRootCandidate(track.name, rootBoneNames)) continue;

    if (isPositionTrack && track.values.length >= 6) {
      const values = track.values;
      const startX = values[0];
      const startY = values[1];
      const startZ = values[2];
      const endX = values[values.length - 3];
      const endY = values[values.length - 2];
      const endZ = values[values.length - 1];

      if (![startX, startY, startZ, endX, endY, endZ].every(Number.isFinite)) continue;

      const dx = endX - startX;
      const dy = endY - startY;
      const dz = endZ - startZ;
      const displacement = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (displacement > maxDisplacement) {
        maxDisplacement = displacement;
        bestDelta = [dx, dy, dz];
        translationTrackName = track.name;
      }
    }

    if (isRotationTrack && track.values.length >= 8) {
      const values = track.values;
      const qStart = new THREE.Quaternion(values[0], values[1], values[2], values[3]);
      const qEnd = new THREE.Quaternion(
        values[values.length - 4],
        values[values.length - 3],
        values[values.length - 2],
        values[values.length - 1]
      );

      if (
        ![
          qStart.x, qStart.y, qStart.z, qStart.w,
          qEnd.x, qEnd.y, qEnd.z, qEnd.w,
        ].every(Number.isFinite)
      ) {
        continue;
      }

      const angle = qStart.angleTo(qEnd) * (180 / Math.PI);
      if (angle > maxAngleDelta) maxAngleDelta = angle;
    }
  }

  return {
    detected: maxDisplacement > 0.05,
    translation: maxDisplacement > 0 ? Number(maxDisplacement.toFixed(3)) : 0,
    rotation: maxAngleDelta > 0 ? Number(maxAngleDelta.toFixed(1)) : 0,
    delta: bestDelta.map((value) => Number(value.toFixed(6))) as [number, number, number],
    translationTrackName,
  };
}

export function analyzeAnimations(
  clips: THREE.AnimationClip[],
  rootBoneNames: string[] = []
): AnimationClipInfo[] {
  return clips.map((clip) => {
    const rootMotion = measureRootMotion(clip, rootBoneNames);

    return {
      name: clip.name || 'Unnamed Clip',
      duration: clip.duration,
      trackCount: clip.tracks.length,
      rootMotionTranslation: rootMotion.translation,
      rootMotionRotation: rootMotion.rotation,
      rootMotionDetected: rootMotion.detected,
      rootMotionDelta: rootMotion.delta,
      rootMotionTrackName: rootMotion.translationTrackName,
    };
  });
}
