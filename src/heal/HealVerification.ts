import type { HealMetrics, HealVerificationStatus, TopologyStats } from '../types';

export const healMetricKeys = [
  'triangleCount', 'vertexCount', 'degenerateTriangles', 'boundaryEdges',
  'nonManifoldEdges', 'isolatedVertices', 'componentsCount', 'thinTriangles',
  'tinyComponentsCount', 'potentialDuplicatePositions',
] as const;

export function healMetrics(stats: TopologyStats): HealMetrics {
  return Object.fromEntries(healMetricKeys.map(key => [key, stats[key]])) as unknown as HealMetrics;
}

export function verifyHeal(before: HealMetrics, after: HealMetrics | null, expectedRemoved: number,
  buffersMatch: boolean): { status: HealVerificationStatus; reasons: string[] } {
  if (!after || healMetricKeys.some(key => !Number.isFinite(after[key]))) {
    return buffersMatch ? { status: 'PARTIAL', reasons: ['measurementUnavailable'] }
      : { status: 'REGRESSION', reasons: ['unexpectedGeometry', 'measurementUnavailable'] };
  }
  const reasons: string[] = [];
  if (!buffersMatch || before.vertexCount !== after.vertexCount ||
      before.triangleCount - after.triangleCount !== expectedRemoved) reasons.push('unexpectedGeometry');
  for (const key of ['boundaryEdges', 'nonManifoldEdges', 'componentsCount', 'thinTriangles', 'tinyComponentsCount', 'potentialDuplicatePositions'] as const) {
    if (after[key] > before[key]) reasons.push(key);
  }
  if (after.degenerateTriangles > before.degenerateTriangles) reasons.push('degenerateTriangles');
  if (after.triangleCount === 0) reasons.push('emptyMesh');
  if (reasons.length) return { status: 'REGRESSION', reasons };
  // Index-only removal deliberately retains vertex attributes, including newly unreferenced vertices.
  if (after.isolatedVertices > before.isolatedVertices) reasons.push('retainedVertices');
  if (after.degenerateTriangles !== 0 || before.degenerateTriangles === 0) {
    return { status: 'PARTIAL', reasons: [...reasons, 'targetRemaining'] };
  }
  return { status: 'VERIFIED', reasons };
}
