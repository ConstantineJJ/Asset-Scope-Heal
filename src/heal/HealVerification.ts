import type {
  HealMetrics,
  HealOperationKind,
  HealVerificationStatus,
  TopologyStats,
} from '../types';

export const healMetricKeys = [
  'triangleCount', 'vertexCount', 'degenerateTriangles', 'boundaryEdges',
  'nonManifoldEdges', 'isolatedVertices', 'componentsCount', 'thinTriangles',
  'tinyComponentsCount', 'potentialDuplicatePositions',
] as const;

export function healMetrics(stats: TopologyStats): HealMetrics {
  return Object.fromEntries(healMetricKeys.map(key => [key, stats[key]])) as unknown as HealMetrics;
}

function measurementFailure(
  after: HealMetrics | null,
  buffersMatch: boolean
): { status: HealVerificationStatus; reasons: string[] } | null {
  if (!after || healMetricKeys.some(key => !Number.isFinite(after[key]))) {
    return buffersMatch
      ? { status: 'PARTIAL', reasons: ['measurementUnavailable'] }
      : { status: 'REGRESSION', reasons: ['unexpectedGeometry', 'measurementUnavailable'] };
  }
  return null;
}

function verifyDegenerateRemoval(
  before: HealMetrics,
  after: HealMetrics | null,
  expectedRemoved: number,
  buffersMatch: boolean
): { status: HealVerificationStatus; reasons: string[] } {
  const unavailable = measurementFailure(after, buffersMatch);
  if (unavailable) return unavailable;
  const measured = after!;

  const reasons: string[] = [];
  if (!buffersMatch || before.vertexCount !== measured.vertexCount ||
      before.triangleCount - measured.triangleCount !== expectedRemoved) {
    reasons.push('unexpectedGeometry');
  }

  for (const key of [
    'boundaryEdges',
    'nonManifoldEdges',
    'componentsCount',
    'thinTriangles',
    'tinyComponentsCount',
    'potentialDuplicatePositions',
  ] as const) {
    if (measured[key] > before[key]) reasons.push(key);
  }

  if (measured.degenerateTriangles > before.degenerateTriangles) reasons.push('degenerateTriangles');
  if (measured.triangleCount === 0) reasons.push('emptyMesh');
  if (reasons.length) return { status: 'REGRESSION', reasons };

  // Index-only removal deliberately retains vertex attributes, including newly unreferenced vertices.
  if (measured.isolatedVertices > before.isolatedVertices) reasons.push('retainedVertices');
  if (measured.degenerateTriangles !== 0 || before.degenerateTriangles === 0) {
    return { status: 'PARTIAL', reasons: [...reasons, 'targetRemaining'] };
  }

  return { status: 'VERIFIED', reasons };
}

function verifyUnreferencedVertexRemoval(
  before: HealMetrics,
  after: HealMetrics | null,
  expectedRemoved: number,
  buffersMatch: boolean
): { status: HealVerificationStatus; reasons: string[] } {
  const unavailable = measurementFailure(after, buffersMatch);
  if (unavailable) return unavailable;
  const measured = after!;

  const reasons: string[] = [];
  if (!buffersMatch ||
      before.triangleCount !== measured.triangleCount ||
      before.vertexCount - measured.vertexCount !== expectedRemoved) {
    reasons.push('unexpectedGeometry');
  }

  // Removing vertices that were not referenced by the index must not change
  // the topology of any rendered triangle.
  for (const key of [
    'degenerateTriangles',
    'boundaryEdges',
    'nonManifoldEdges',
    'componentsCount',
    'thinTriangles',
    'tinyComponentsCount',
  ] as const) {
    if (measured[key] !== before[key]) reasons.push(key);
  }

  // Coincident positions may decrease because an unreferenced duplicate was removed,
  // but they must never increase as a side effect of compaction.
  if (measured.potentialDuplicatePositions > before.potentialDuplicatePositions) {
    reasons.push('potentialDuplicatePositions');
  }

  if (measured.triangleCount === 0) reasons.push('emptyMesh');
  if (reasons.length) return { status: 'REGRESSION', reasons };

  if (before.isolatedVertices === 0 || measured.isolatedVertices !== 0) {
    return { status: 'PARTIAL', reasons: ['targetRemaining'] };
  }

  return { status: 'VERIFIED', reasons: [] };
}

export function verifyHealOperation(
  operation: HealOperationKind,
  before: HealMetrics,
  after: HealMetrics | null,
  expectedRemoved: number,
  buffersMatch: boolean
): { status: HealVerificationStatus; reasons: string[] } {
  switch (operation) {
    case 'remove-unreferenced-vertices':
      return verifyUnreferencedVertexRemoval(before, after, expectedRemoved, buffersMatch);
    case 'remove-degenerate-triangles':
    default:
      return verifyDegenerateRemoval(before, after, expectedRemoved, buffersMatch);
  }
}

/** Backward-compatible helper used by existing tests for the original operation. */
export function verifyHeal(
  before: HealMetrics,
  after: HealMetrics | null,
  expectedRemoved: number,
  buffersMatch: boolean
): { status: HealVerificationStatus; reasons: string[] } {
  return verifyHealOperation(
    'remove-degenerate-triangles',
    before,
    after,
    expectedRemoved,
    buffersMatch
  );
}
