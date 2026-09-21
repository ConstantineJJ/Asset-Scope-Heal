import * as THREE from 'three';
import type { HealthIssue } from '../types';

export function analyzeTransforms(root: THREE.Object3D): HealthIssue[] {
  const issues: HealthIssue[] = [];

  // Check root scale
  const sx = root.scale.x;
  const sy = root.scale.y;
  const sz = root.scale.z;

  if (Math.abs(sx - 1.0) > 0.001 || Math.abs(sy - 1.0) > 0.001 || Math.abs(sz - 1.0) > 0.001) {
    issues.push({
      id: 'transform-root-scale',
      category: 'Transforms',
      severity: 'WARNING',
      title: 'Root scale is not 1.0',
      description: `Root object scale is (${sx.toFixed(3)}, ${sy.toFixed(3)}, ${sz.toFixed(3)}). Non-uniform or unapplied scale can lead to physics and lighting discrepancies.`,
      technicalDetails: `Expected scale [1, 1, 1]. Found: [${sx}, ${sy}, ${sz}]`,
    });
  }

  // Check negative scales anywhere in hierarchy
  let negativeScaleCount = 0;
  let extremeScaleCount = 0;

  root.traverse((obj) => {
    if (obj.name?.startsWith('__ascope_internal_')) return;
    if (obj.scale.x < 0 || obj.scale.y < 0 || obj.scale.z < 0) {
      negativeScaleCount++;
    }
    const maxS = Math.max(Math.abs(obj.scale.x), Math.abs(obj.scale.y), Math.abs(obj.scale.z));
    const minS = Math.min(Math.abs(obj.scale.x), Math.abs(obj.scale.y), Math.abs(obj.scale.z));
    if (maxS > 1000 || (minS < 0.0001 && minS > 0)) {
      extremeScaleCount++;
    }
  });

  if (negativeScaleCount > 0) {
    issues.push({
      id: 'transform-negative-scale',
      category: 'Transforms',
      severity: 'WARNING',
      layer: 'Health',
      title: 'Negative scale detected',
      description: `${negativeScaleCount} object(s) have negative scale components, which inverts face winding and can invert normals.`,
      count: negativeScaleCount,
      technicalDetails: `Found ${negativeScaleCount} node(s) with scale < 0`,
    });
  }

  if (extremeScaleCount > 0) {
    issues.push({
      id: 'transform-extreme-scale',
      category: 'Transforms',
      severity: 'WARNING',
      title: 'Extreme scale values detected',
      description: `${extremeScaleCount} object(s) have scale magnitudes > 1000 or < 0.0001, which causes numerical precision degradation.`,
      count: extremeScaleCount,
    });
  }

  // Check model distance from origin
  const box = new THREE.Box3().setFromObject(root);
  if (!box.isEmpty()) {
    const center = new THREE.Vector3();
    box.getCenter(center);
    const distFromOrigin = center.length();
    const size = box.getSize(new THREE.Vector3()).length();

    if (distFromOrigin > Math.max(50, size * 5)) {
      issues.push({
        id: 'transform-far-origin',
        category: 'Transforms',
        severity: 'WARNING',
        title: 'Model center is far from origin',
        description: `Model center is ${distFromOrigin.toFixed(1)} units away from (0,0,0). Assets intended for standard engines should be centered near origin.`,
        technicalDetails: `Center: [${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}]`,
      });
    }
  }

  return issues;
}
