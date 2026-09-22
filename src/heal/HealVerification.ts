import * as THREE from 'three';
import type {
  HealMetrics,
  HealOperationKind,
  HealVerificationStatus,
  TopologyStats,
} from '../types';
import { measureGeometryNormals } from '../analysis/NormalsMeasure';
import { measureSkinWeights } from '../analysis/SkinWeightMeasure';

export const healMetricKeys = [
  'triangleCount', 'vertexCount', 'degenerateTriangles', 'boundaryEdges',
  'nonManifoldEdges', 'isolatedVertices', 'componentsCount', 'thinTriangles',
  'tinyComponentsCount', 'potentialDuplicatePositions', 'duplicateTriangles',
] as const;

export function healMetrics(
  stats: TopologyStats,
  geometry?: THREE.BufferGeometry,
  mesh?: THREE.Mesh
): HealMetrics {
  const base = Object.fromEntries(
    healMetricKeys.map(key => [key, stats[key]])
  ) as unknown as HealMetrics;

  const result: HealMetrics = { ...base };

  if (geometry) {
    const normal = measureGeometryNormals(geometry);
    result.normalCount = normal.normalCount;
    result.invalidNormals = normal.invalidCount;
    result.missingNormals = normal.missing ? normal.vertexCount : 0;
  }

  if (mesh && (mesh as THREE.SkinnedMesh).isSkinnedMesh) {
    const skin = measureSkinWeights(mesh);
    if (skin.supported) {
      result.invalidSkinWeights = skin.invalidSumCount;
      result.zeroWeightVertices = skin.zeroWeightCount;
      result.redundantSkinInfluenceVertices = skin.redundantInfluenceVertexCount;
    }
  }

  return result;
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
    'duplicateTriangles',
  ] as const) {
    if (measured[key] > before[key]) reasons.push(key);
  }

  if (measured.degenerateTriangles > before.degenerateTriangles) reasons.push('degenerateTriangles');
  if (measured.triangleCount === 0) reasons.push('emptyMesh');
  if (reasons.length) return { status: 'REGRESSION', reasons };

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

  for (const key of [
    'degenerateTriangles',
    'boundaryEdges',
    'nonManifoldEdges',
    'componentsCount',
    'thinTriangles',
    'tinyComponentsCount',
    'duplicateTriangles',
  ] as const) {
    if (measured[key] !== before[key]) reasons.push(key);
  }

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

function verifyNormalRecalculation(
  before: HealMetrics,
  after: HealMetrics | null,
  expectedFixed: number,
  buffersMatch: boolean
): { status: HealVerificationStatus; reasons: string[] } {
  const unavailable = measurementFailure(after, buffersMatch);
  if (unavailable) return unavailable;
  const measured = after!;

  const reasons: string[] = [];
  if (!buffersMatch) reasons.push('unexpectedGeometry');

  // A normals-only repair must leave every topology metric unchanged.
  for (const key of healMetricKeys) {
    if (measured[key] !== before[key]) reasons.push(key);
  }

  if (
    !Number.isFinite(before.invalidNormals) ||
    !Number.isFinite(measured.invalidNormals) ||
    !Number.isFinite(measured.normalCount)
  ) {
    return {
      status: reasons.length ? 'REGRESSION' : 'PARTIAL',
      reasons: [...reasons, 'measurementUnavailable'],
    };
  }

  if ((before.invalidNormals ?? 0) !== expectedFixed) {
    reasons.push('unexpectedGeometry');
  }

  if ((measured.normalCount ?? 0) !== measured.vertexCount) {
    reasons.push('normalCount');
  }

  if (reasons.length) return { status: 'REGRESSION', reasons };

  if ((measured.invalidNormals ?? 0) !== 0 || (measured.missingNormals ?? 0) !== 0) {
    return { status: 'PARTIAL', reasons: ['targetRemaining'] };
  }

  return { status: 'VERIFIED', reasons: [] };
}

function verifyExactDuplicateMerge(
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

  // Exact-attribute welding may intentionally reduce boundary edges or connect
  // components. Verification accepts those improvements, but never a worse
  // protected topology metric.
  if (measured.isolatedVertices !== before.isolatedVertices) reasons.push('isolatedVertices');
  for (const key of [
    'degenerateTriangles',
    'boundaryEdges',
    'nonManifoldEdges',
    'componentsCount',
    'thinTriangles',
    'tinyComponentsCount',
    'potentialDuplicatePositions',
    'duplicateTriangles',
  ] as const) {
    if (measured[key] > before[key]) reasons.push(key);
  }

  if (reasons.length) return { status: 'REGRESSION', reasons };
  if (before.potentialDuplicatePositions <= measured.potentialDuplicatePositions) {
    return { status: 'PARTIAL', reasons: ['targetRemaining'] };
  }

  return { status: 'VERIFIED', reasons: [] };
}

function verifySkinWeightNormalization(
  before: HealMetrics,
  after: HealMetrics | null,
  expectedFixed: number,
  buffersMatch: boolean
): { status: HealVerificationStatus; reasons: string[] } {
  const unavailable = measurementFailure(after, buffersMatch);
  if (unavailable) return unavailable;
  const measured = after!;

  const reasons: string[] = [];
  if (!buffersMatch) reasons.push('unexpectedGeometry');

  for (const key of healMetricKeys) {
    if (measured[key] !== before[key]) reasons.push(key);
  }

  if (
    !Number.isFinite(before.invalidSkinWeights) ||
    !Number.isFinite(measured.invalidSkinWeights)
  ) {
    return {
      status: reasons.length ? 'REGRESSION' : 'PARTIAL',
      reasons: [...reasons, 'measurementUnavailable'],
    };
  }

  if ((before.invalidSkinWeights ?? 0) !== expectedFixed) {
    reasons.push('unexpectedGeometry');
  }

  if ((measured.zeroWeightVertices ?? 0) !== (before.zeroWeightVertices ?? 0)) {
    reasons.push('zeroWeightVertices');
  }

  if (
    measured.invalidNormals !== undefined &&
    before.invalidNormals !== undefined &&
    measured.invalidNormals !== before.invalidNormals
  ) {
    reasons.push('invalidNormals');
  }

  if (reasons.length) return { status: 'REGRESSION', reasons };

  if ((measured.invalidSkinWeights ?? 0) !== 0) {
    return { status: 'PARTIAL', reasons: ['targetRemaining'] };
  }

  return { status: 'VERIFIED', reasons: [] };
}

function verifyDuplicateTriangleRemoval(
  before: HealMetrics,
  after: HealMetrics | null,
  expectedRemoved: number,
  buffersMatch: boolean
): { status: HealVerificationStatus; reasons: string[] } {
  const unavailable = measurementFailure(after, buffersMatch);
  if (unavailable) return unavailable;
  const measured = after!;

  const reasons: string[] = [];
  if (
    !buffersMatch ||
    before.vertexCount !== measured.vertexCount ||
    before.triangleCount - measured.triangleCount !== expectedRemoved
  ) {
    reasons.push('unexpectedGeometry');
  }

  if (measured.duplicateTriangles !== 0 || before.duplicateTriangles !== expectedRemoved) {
    reasons.push('targetRemaining');
  }

  for (const key of [
    'degenerateTriangles',
    'boundaryEdges',
    'nonManifoldEdges',
    'componentsCount',
    'thinTriangles',
    'tinyComponentsCount',
  ] as const) {
    if (measured[key] > before[key]) reasons.push(key);
  }

  if (measured.isolatedVertices !== before.isolatedVertices) reasons.push('isolatedVertices');
  if (measured.potentialDuplicatePositions !== before.potentialDuplicatePositions) {
    reasons.push('potentialDuplicatePositions');
  }

  if (
    before.invalidNormals !== undefined &&
    measured.invalidNormals !== undefined &&
    before.invalidNormals !== measured.invalidNormals
  ) {
    reasons.push('invalidNormals');
  }

  if (
    before.invalidSkinWeights !== undefined &&
    measured.invalidSkinWeights !== undefined &&
    before.invalidSkinWeights !== measured.invalidSkinWeights
  ) {
    reasons.push('invalidSkinWeights');
  }

  const regressionReasons = reasons.filter((reason) => reason !== 'targetRemaining');
  if (regressionReasons.length) return { status: 'REGRESSION', reasons };
  if (reasons.length) return { status: 'PARTIAL', reasons };
  return { status: 'VERIFIED', reasons: [] };
}

function verifyDuplicateSkinInfluenceConsolidation(
  before: HealMetrics,
  after: HealMetrics | null,
  expectedFixed: number,
  buffersMatch: boolean
): { status: HealVerificationStatus; reasons: string[] } {
  const unavailable = measurementFailure(after, buffersMatch);
  if (unavailable) return unavailable;
  const measured = after!;

  const reasons: string[] = [];
  if (!buffersMatch) reasons.push('unexpectedGeometry');

  for (const key of healMetricKeys) {
    if (measured[key] !== before[key]) reasons.push(key);
  }

  if (
    !Number.isFinite(before.redundantSkinInfluenceVertices) ||
    !Number.isFinite(measured.redundantSkinInfluenceVertices)
  ) {
    return {
      status: reasons.length ? 'REGRESSION' : 'PARTIAL',
      reasons: [...reasons, 'measurementUnavailable'],
    };
  }

  if ((before.redundantSkinInfluenceVertices ?? 0) !== expectedFixed) {
    reasons.push('unexpectedGeometry');
  }

  if ((measured.invalidSkinWeights ?? 0) !== (before.invalidSkinWeights ?? 0)) {
    reasons.push('invalidSkinWeights');
  }

  if ((measured.zeroWeightVertices ?? 0) !== (before.zeroWeightVertices ?? 0)) {
    reasons.push('zeroWeightVertices');
  }

  if (
    measured.invalidNormals !== undefined &&
    before.invalidNormals !== undefined &&
    measured.invalidNormals !== before.invalidNormals
  ) {
    reasons.push('invalidNormals');
  }

  if (reasons.length) return { status: 'REGRESSION', reasons };

  if ((measured.redundantSkinInfluenceVertices ?? 0) !== 0) {
    return { status: 'PARTIAL', reasons: ['targetRemaining'] };
  }

  return { status: 'VERIFIED', reasons: [] };
}

export function verifyHealOperation(
  operation: HealOperationKind,
  before: HealMetrics,
  after: HealMetrics | null,
  expectedAffected: number,
  buffersMatch: boolean
): { status: HealVerificationStatus; reasons: string[] } {
  switch (operation) {
    case 'remove-unreferenced-vertices':
      return verifyUnreferencedVertexRemoval(before, after, expectedAffected, buffersMatch);
    case 'recalculate-normals':
      return verifyNormalRecalculation(before, after, expectedAffected, buffersMatch);
    case 'merge-exact-duplicate-vertices':
      return verifyExactDuplicateMerge(before, after, expectedAffected, buffersMatch);
    case 'normalize-skin-weights':
      return verifySkinWeightNormalization(before, after, expectedAffected, buffersMatch);
    case 'remove-exact-duplicate-triangles':
      return verifyDuplicateTriangleRemoval(before, after, expectedAffected, buffersMatch);
    case 'consolidate-duplicate-skin-influences':
      return verifyDuplicateSkinInfluenceConsolidation(before, after, expectedAffected, buffersMatch);
    case 'remove-degenerate-triangles':
    default:
      return verifyDegenerateRemoval(before, after, expectedAffected, buffersMatch);
  }
}

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
