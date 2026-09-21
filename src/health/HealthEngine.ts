import type {
  AssetSummary,
  DiagnosticLayer,
  DiagnosticProfileId,
  HealthCategory,
  HealthIssue,
  HealthSeverity,
  Repairability,
  MaterialInfo,
  SkinningStats,
  TextureInfo,
  TopologyStats,
} from '../types';
import { getDiagnosticProfile } from './DiagnosticProfiles';

export function aggregateTopologyIssues(topologyResults: TopologyStats[]): HealthIssue[] {
  const issues: HealthIssue[] = [];

  let totalDegenerate = 0;
  let totalBoundary = 0;
  let totalNonManifold = 0;
  let totalIsolated = 0;
  let totalTinyComponents = 0;
  let totalThinTriangles = 0;
  let totalDuplicates = 0;

  const affectedMeshNames: string[] = [];
  const focusPoints: Array<[number, number, number]> = [];

  for (const stat of topologyResults) {
    totalDegenerate += stat.degenerateTriangles;
    totalBoundary += stat.boundaryEdges;
    totalNonManifold += stat.nonManifoldEdges;
    totalIsolated += stat.isolatedVertices;
    totalTinyComponents += stat.tinyComponentsCount;
    totalThinTriangles += stat.thinTriangles;
    totalDuplicates += stat.potentialDuplicatePositions;

    if (
      stat.degenerateTriangles > 0 ||
      stat.nonManifoldEdges > 0 ||
      stat.tinyComponentsCount > 0
    ) {
      affectedMeshNames.push(stat.meshName);
      if (stat.sampleFocusPoints && stat.sampleFocusPoints.length > 0) {
        focusPoints.push(...stat.sampleFocusPoints);
      }
    }
  }

  // 1. Degenerate triangles
  if (totalDegenerate > 0) {
    issues.push({
      id: 'topo-degenerate-triangles',
      category: 'Topology',
      severity: 'ERROR',
      title: `Degenerate triangles: ${totalDegenerate}`,
      description: `${totalDegenerate} triangle(s) have collinear or zero-length edges with near-zero surface area. Can cause NaN values in lighting and physics.`,
      count: totalDegenerate,
      focusPosition: focusPoints[0],
      technicalDetails: `Detected across ${affectedMeshNames.length} mesh(es). Area < 1e-9.`,
    });
  } else {
    issues.push({
      id: 'topo-degenerate-ok',
      category: 'Topology',
      severity: 'OK',
      title: 'Zero degenerate triangles',
      description: 'All evaluated triangles have valid non-zero surface area.',
    });
  }

  // 2. Non-manifold edges
  if (totalNonManifold > 0) {
    issues.push({
      id: 'topo-non-manifold-edges',
      category: 'Topology',
      severity: 'ERROR',
      title: `Non-manifold edges: ${totalNonManifold}`,
      description: `${totalNonManifold} edge(s) are shared by 3 or more faces. Invalid topology for solid volume, 3D printing, or collision hulls.`,
      count: totalNonManifold,
      focusPosition: focusPoints[1] || focusPoints[0],
      technicalDetails: 'Edge shared by > 2 triangles.',
    });
  } else {
    issues.push({
      id: 'topo-non-manifold-ok',
      category: 'Topology',
      severity: 'OK',
      title: 'Manifold topology intact',
      description: 'No edges shared by more than 2 faces.',
    });
  }

  // 3. Boundary / open edges
  if (totalBoundary > 0) {
    issues.push({
      id: 'topo-boundary-edges',
      category: 'Topology',
      severity: 'INFO',
      title: `Boundary / open edges: ${totalBoundary}`,
      description: `${totalBoundary} edge(s) belong to only 1 triangle. Expected for planar decals, hair cards, or open shells; inspect if model is meant to be watertight.`,
      count: totalBoundary,
      technicalDetails: 'Single-triangle incident edges.',
    });
  } else {
    issues.push({
      id: 'topo-watertight-ok',
      category: 'Topology',
      severity: 'OK',
      title: 'Watertight closed mesh',
      description: 'Zero open boundary edges detected; mesh forms a sealed surface.',
    });
  }

  // 4. Isolated / unused vertices
  if (totalIsolated > 0) {
    issues.push({
      id: 'topo-isolated-vertices',
      category: 'Topology',
      severity: 'WARNING',
      title: `Isolated vertices: ${totalIsolated}`,
      description: `${totalIsolated} vertex position(s) exist in buffer but are not indexed by any face. Increases file size and memory without contributing to geometry.`,
      count: totalIsolated,
      technicalDetails: 'Unindexed positions in vertex array.',
    });
  }

  // 5. Tiny disconnected components
  if (totalTinyComponents > 0) {
    issues.push({
      id: 'topo-tiny-components',
      category: 'Topology',
      severity: 'WARNING',
      title: `Tiny floating components: ${totalTinyComponents}`,
      description: `${totalTinyComponents} disconnected geometry component(s) contain negligible vertex counts (<2% of mesh). Often leftover debris or modeling artifacts.`,
      count: totalTinyComponents,
      focusPosition: focusPoints[2] || focusPoints[0],
    });
  }

  // 6. Thin / needle triangles
  if (totalThinTriangles > 0) {
    issues.push({
      id: 'topo-thin-triangles',
      category: 'Topology',
      severity: 'INFO',
      title: `Needle triangles: ${totalThinTriangles}`,
      description: `${totalThinTriangles} triangle(s) have an extreme aspect ratio (> 35:1). Can cause rasterizer pixel slivering and shading shimmer.`,
      count: totalThinTriangles,
      focusPosition: focusPoints[3] || focusPoints[0],
    });
  }

  // 7. Potential duplicate positions
  if (totalDuplicates > 0) {
    issues.push({
      id: 'topo-duplicate-positions',
      category: 'Topology',
      severity: 'INFO',
      title: `Coincident vertex positions: ${totalDuplicates}`,
      description: `${totalDuplicates} vertices share identical spatial coordinates. Note: glTF and real-time engines split vertices intentionally at UV seams and hard normal edges.`,
      count: totalDuplicates,
    });
  }

  return issues;
}

export function evaluateSkinningIssues(
  stats: SkinningStats,
  profileId: DiagnosticProfileId = 'general'
): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const profile = getDiagnosticProfile(profileId);

  if (stats.skeletonCount === 0) {
    issues.push({
      id: 'skin-static-ok',
      category: 'Skeleton',
      severity: 'N/A',
      layer: 'Health',
      title: 'Rig-specific checks not applicable',
      description: 'Asset does not contain skeletal armatures or skinned mesh nodes, so skinning-specific diagnostics do not apply.',
      evidence: 'No Skeleton / SkinnedMesh detected.',
      whyItMatters: 'Absence of a rig is not a defect for static assets.',
      suggestedAction: 'No action required unless a rig was expected for the intended use.',
      repairability: 'NONE',
    });
    return issues;
  }

  issues.push({
    id: 'skin-rig-detected',
    category: 'Skeleton',
    severity: 'OK',
    title: `Skeletal rig verified: ${stats.totalBones} bones`,
    description: `Contains ${stats.skeletonCount} skeleton(s), ${stats.skinnedMeshCount} skinned mesh(es), and ${stats.rootBoneNames.length} root bone(s): [${stats.rootBoneNames.join(', ')}].`,
    count: stats.totalBones,
  });

  // Max influences per vertex
  if (stats.maxInfluencesPerVertex > profile.maxBoneInfluencesWarning) {
    issues.push({
      id: 'skin-max-influences',
      category: 'Skinning',
      severity: 'WARNING',
      title: `Max bone influences: ${stats.maxInfluencesPerVertex}`,
      description: `Vertices use up to ${stats.maxInfluencesPerVertex} active bone weights, above the ${profile.label} reference threshold of ${profile.maxBoneInfluencesWarning}.`,
      count: stats.maxInfluencesPerVertex,
    });
  } else if (stats.maxInfluencesPerVertex > 0) {
    issues.push({
      id: 'skin-influences-ok',
      category: 'Skinning',
      severity: 'OK',
      title: `Bone influences compliant (${stats.maxInfluencesPerVertex}/vertex)`,
      description: `Bone influence count is within the ${profile.label} reference threshold (${profile.maxBoneInfluencesWarning}/vertex).`,
    });
  }

  // Zero weight vertices
  if (stats.zeroWeightVertices > 0) {
    issues.push({
      id: 'skin-zero-weight',
      category: 'Skinning',
      severity: 'ERROR',
      title: `Unweighted vertices: ${stats.zeroWeightVertices}`,
      description: `${stats.zeroWeightVertices} vertex/vertices have zero bone weight influence. They will remain frozen in bind pose when playing animations.`,
      count: stats.zeroWeightVertices,
    });
  }

  // Invalid weight sum
  if (stats.invalidWeightSumVertices > 0) {
    issues.push({
      id: 'skin-invalid-sum',
      category: 'Skinning',
      severity: 'WARNING',
      title: `Unnormalized bone weights: ${stats.invalidWeightSumVertices}`,
      description: `${stats.invalidWeightSumVertices} vertices have weight sums differing from 1.0 by > 0.05. May cause mesh collapse or volume inflation.`,
      count: stats.invalidWeightSumVertices,
    });
  }

  // Unused bones
  if (stats.unusedBonesCount > 0) {
    issues.push({
      id: 'skin-unused-bones',
      category: 'Skeleton',
      severity: 'INFO',
      title: `Unused bones: ${stats.unusedBonesCount}`,
      description: `${stats.unusedBonesCount} bone(s) in skeleton do not bind to any vertex weights (e.g. attachment sockets or locator nodes).`,
      count: stats.unusedBonesCount,
    });
  }

  return issues;
}

export function evaluateMaterialIssues(materials: MaterialInfo[]): HealthIssue[] {
  const issues: HealthIssue[] = [];
  let doubleSidedCount = 0;
  let transparentCount = 0;

  for (const m of materials) {
    if (m.doubleSided) doubleSidedCount++;
    if (m.alphaMode === 'BLEND') transparentCount++;
  }

  if (materials.length === 0) {
    issues.push({
      id: 'mat-none',
      category: 'Materials',
      severity: 'WARNING',
      title: 'No materials assigned',
      description: 'Meshes are relying on fallback default shading.',
    });
    return issues;
  }

  issues.push({
    id: 'mat-count-ok',
    category: 'Materials',
    severity: 'OK',
    title: `Defined materials: ${materials.length}`,
    description: `${materials.length} unique PBR material instance(s) loaded.`,
    count: materials.length,
  });

  if (doubleSidedCount > 0) {
    issues.push({
      id: 'mat-double-sided',
      category: 'Materials',
      severity: 'INFO',
      title: `Double-sided materials: ${doubleSidedCount}`,
      description: `${doubleSidedCount} material(s) disable backface culling. Disables early depth rejection on some rasterizers.`,
      count: doubleSidedCount,
    });
  }

  if (transparentCount > 0) {
    issues.push({
      id: 'mat-alpha-blend',
      category: 'Materials',
      severity: 'INFO',
      title: `Alpha blend materials: ${transparentCount}`,
      description: `${transparentCount} material(s) use alpha blending, which requires depth-sorting of transparent fragments.`,
      count: transparentCount,
    });
  }

  return issues;
}

export function evaluateTextureIssues(
  textures: TextureInfo[],
  profileId: DiagnosticProfileId = 'general'
): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const profile = getDiagnosticProfile(profileId);
  let nonPowerOfTwoCount = 0;
  let texturesOverThreshold = 0;

  function isPowerOfTwo(n: number) {
    return n > 0 && (n & (n - 1)) === 0;
  }

  for (const t of textures) {
    if (t.width > profile.textureDimensionWarning || t.height > profile.textureDimensionWarning) {
      texturesOverThreshold++;
    }
    if (t.width > 0 && t.height > 0) {
      if (!isPowerOfTwo(t.width) || !isPowerOfTwo(t.height)) {
        nonPowerOfTwoCount++;
      }
    }
  }

  if (texturesOverThreshold > 0) {
    issues.push({
      id: 'tex-over-4096',
      category: 'Textures',
      severity: 'WARNING',
      title: `Textures above ${profile.textureDimensionWarning}px: ${texturesOverThreshold}`,
      description: `${texturesOverThreshold} texture(s) exceed the ${profile.label} reference dimension of ${profile.textureDimensionWarning}px. This is a target-fit warning, not a structural texture defect.`,
      count: texturesOverThreshold,
    });
  }

  if (nonPowerOfTwoCount > 0) {
    issues.push({
      id: 'tex-npot',
      category: 'Textures',
      severity: 'INFO',
      title: `Non-power-of-two textures: ${nonPowerOfTwoCount}`,
      description: `${nonPowerOfTwoCount} texture(s) do not follow power-of-two dimensions (e.g. 512, 1024, 2048). While supported in modern WebGL2, mipmap generation can be suboptimal.`,
      count: nonPowerOfTwoCount,
    });
  }

  if (textures.length > 0 && texturesOverThreshold === 0) {
    issues.push({
      id: 'tex-dimensions-ok',
      category: 'Textures',
      severity: 'OK',
      title: 'Texture dimensions within safe limits',
      description: `All ${textures.length} texture(s) stay at or below the ${profile.label} reference dimension of ${profile.textureDimensionWarning}px.`,
      count: textures.length,
    });
  }

  return issues;
}

export function countIssuesBySeverity(issues: HealthIssue[]): Record<HealthSeverity, number> {
  const counts: Record<HealthSeverity, number> = {
    OK: 0,
    INFO: 0,
    WARNING: 0,
    ERROR: 0,
    'N/A': 0,
    UNKNOWN: 0,
  };
  for (const issue of issues) {
    counts[issue.severity] = (counts[issue.severity] || 0) + 1;
  }
  return counts;
}

export function filterIssuesByCategory(
  issues: HealthIssue[],
  category: HealthCategory
): HealthIssue[] {
  return issues.filter((i) => i.category === category);
}

export interface HealthAggregateParams {
  summary: AssetSummary;
  profileId?: DiagnosticProfileId;
  materials: MaterialInfo[];
  textures: TextureInfo[];
  skeleton: SkinningStats;
  animations?: import('../types').AnimationClipInfo[];
  transforms?: HealthIssue[];
  performance?: { stats?: any; issues?: HealthIssue[] } | HealthIssue[];
  normalsAndUv?: HealthIssue[];
  topology: TopologyStats[];
}


function evaluateIntegrity(summary: AssetSummary): HealthIssue[] {
  const countValues = [
    summary.nodeCount,
    summary.meshCount,
    summary.vertexCount,
    summary.triangleCount,
    summary.materialCount,
    summary.textureCount,
    ...summary.boundingBox.size,
    summary.boundingBox.diagonal,
  ];
  const coordinateValues = [
    ...summary.boundingBox.min,
    ...summary.boundingBox.max,
    ...summary.boundingBox.center,
  ];

  const hasInvalidNumber =
    countValues.some((value) => !Number.isFinite(value) || value < 0) ||
    coordinateValues.some((value) => !Number.isFinite(value));

  if (hasInvalidNumber) {
    return [{
      id: 'integrity-core-numeric-invalid',
      category: 'Geometry',
      severity: 'ERROR',
      layer: 'Integrity',
      title: 'Invalid core asset data',
      description: 'One or more parsed scene/geometry metrics contain invalid, negative, NaN, or infinite values.',
      evidence: 'Core scene metrics failed finite/non-negative validation.',
      whyItMatters: 'Invalid numeric data can break camera framing, rendering, physics, export, or downstream repair operations.',
      suggestedAction: 'Inspect the source asset and parser diagnostics before attempting any repair.',
      repairability: 'MANUAL',
    }];
  }

  if (summary.meshCount === 0) {
    return [{
      id: 'integrity-no-meshes',
      category: 'Geometry',
      severity: 'INFO',
      layer: 'Integrity',
      title: 'No renderable meshes detected',
      description: 'The scene parsed successfully but contains no mesh primitives.',
      evidence: `meshCount=${summary.meshCount}, nodeCount=${summary.nodeCount}`,
      whyItMatters: 'This may be intentional for a helper/animation-only scene, but there is no visible surface to inspect.',
      suggestedAction: 'Confirm that a mesh-free scene is intentional.',
      repairability: 'NONE',
    }];
  }

  return [{
    id: 'integrity-core-readable',
    category: 'Geometry',
    severity: 'OK',
    layer: 'Integrity',
    title: 'Core scene data is structurally readable',
    description: 'Scene hierarchy, mesh counts and bounding data were parsed into finite values.',
    evidence: `${summary.meshCount} mesh(es), ${summary.vertexCount.toLocaleString()} vertices, ${summary.triangleCount.toLocaleString()} triangles.`,
    whyItMatters: 'This establishes a trustworthy base for deeper Health and Fitness diagnostics.',
    suggestedAction: 'No action required.',
    repairability: 'NONE',
  }];
}

function evaluateProfileExpectations(
  summary: AssetSummary,
  profileId: DiagnosticProfileId
): HealthIssue[] {
  const profile = getDiagnosticProfile(profileId);
  const issues: HealthIssue[] = [];

  if (profile.expectsRig === true && summary.skeletonCount === 0) {
    issues.push({
      id: 'fitness-rig-expected-missing',
      category: 'Skeleton',
      severity: 'WARNING',
      layer: 'Fitness',
      title: 'Rig expected by diagnostic profile',
      description: `${profile.label} expects a skeletal rig, but none was detected.`,
      evidence: `skeletonCount=${summary.skeletonCount}, profile=${profile.label}`,
      whyItMatters: 'The asset may be structurally valid, but it may not satisfy the intended character workflow.',
      suggestedAction: 'Confirm the intended use. Add or restore a rig only if this asset is meant to be skeletal.',
      repairability: 'MANUAL',
      profileDependent: true,
    });
  }

  if (profile.expectsAnimations === true && summary.clipCount === 0) {
    issues.push({
      id: 'fitness-animation-expected-missing',
      category: 'Animations',
      severity: 'WARNING',
      layer: 'Fitness',
      title: 'Animation clips expected by diagnostic profile',
      description: `${profile.label} expects animation clips, but none were detected.`,
      evidence: `clipCount=${summary.clipCount}, profile=${profile.label}`,
      whyItMatters: 'The file can still be healthy, but it may not be ready for the intended animated-character workflow.',
      suggestedAction: 'Confirm whether animation is expected before changing the asset.',
      repairability: 'MANUAL',
      profileDependent: true,
    });
  }

  return issues;
}

function defaultLayer(issue: HealthIssue): DiagnosticLayer {
  if (issue.layer) return issue.layer;
  if (issue.category === 'Performance') return 'Fitness';
  if (
    issue.id.startsWith('perf-') ||
    issue.id === 'tex-over-4096' ||
    issue.id === 'skin-max-influences'
  ) {
    return 'Fitness';
  }
  return 'Health';
}

function defaultRepairability(issue: HealthIssue): Repairability {
  if (issue.repairability) return issue.repairability;
  if (issue.severity === 'OK' || issue.severity === 'INFO' || issue.severity === 'N/A') return 'NONE';

  if (
    issue.id === 'topo-non-manifold-edges' ||
    issue.id === 'topo-duplicate-positions' ||
    issue.id === 'transform-negative-scale'
  ) {
    return 'MANUAL';
  }

  if (
    issue.id === 'topo-degenerate-triangles' ||
    issue.id === 'topo-isolated-vertices' ||
    issue.id === 'topo-tiny-components' ||
    issue.id === 'normals-zero' ||
    issue.id === 'skin-invalid-sum' ||
    issue.id === 'transform-root-scale' ||
    issue.id === 'transform-extreme-scale'
  ) {
    return 'CONDITIONAL';
  }

  return issue.severity === 'ERROR' ? 'MANUAL' : 'NONE';
}

function suggestedActionFor(issue: HealthIssue): string {
  if (issue.suggestedAction) return issue.suggestedAction;

  switch (issue.repairability ?? defaultRepairability(issue)) {
    case 'SAFE':
      return 'A deterministic non-destructive repair may be offered after preview and revalidation.';
    case 'CONDITIONAL':
      return 'Inspect the affected region first. Any repair must be previewed and followed by revalidation.';
    case 'MANUAL':
      return 'Manual or external-tool repair is recommended. Do not auto-fix this condition.';
    default:
      return 'No repair action is required.';
  }
}

function decorateIssue(issue: HealthIssue, profileId: DiagnosticProfileId): HealthIssue {
  const layer = defaultLayer(issue);
  const repairability = defaultRepairability(issue);

  return {
    ...issue,
    layer,
    repairability,
    profileId,
    profileDependent: issue.profileDependent ?? layer === 'Fitness',
    evidence:
      issue.evidence ??
      (issue.count !== undefined
        ? `Observed count: ${issue.count}`
        : issue.technicalDetails ?? issue.description),
    whyItMatters: issue.whyItMatters ?? issue.description,
    suggestedAction: suggestedActionFor({ ...issue, repairability }),
  };
}

export class HealthEngine {
  public static aggregate(params: HealthAggregateParams): HealthIssue[] {
    const issues: HealthIssue[] = [];
    const profileId = params.profileId ?? 'general';
    getDiagnosticProfile(profileId);

    // Diagnostic Core v1 — Layer 1: Integrity.
    issues.push(...evaluateIntegrity(params.summary));

    // 1. Materials
    issues.push(...evaluateMaterialIssues(params.materials));

    // 2. Textures
    issues.push(...evaluateTextureIssues(params.textures, profileId));

    // 3. Skeleton / Skinning
    issues.push(...evaluateSkinningIssues(params.skeleton, profileId));

    // Diagnostic Core v1 — Layer 3: profile-dependent Fitness expectations.
    issues.push(...evaluateProfileExpectations(params.summary, profileId));

    // 4. Transforms
    if (params.transforms && Array.isArray(params.transforms)) {
      issues.push(...params.transforms);
    }

    // 5. Performance
    if (params.performance) {
      if (Array.isArray(params.performance)) {
        issues.push(...params.performance);
      } else if (params.performance.issues) {
        issues.push(...params.performance.issues);
      }
    }

    // 6. Normals and UVs
    if (params.normalsAndUv && Array.isArray(params.normalsAndUv)) {
      issues.push(...params.normalsAndUv);
    }

    // 7. Topology issues
    if (params.topology && params.topology.length > 0) {
      issues.push(...aggregateTopologyIssues(params.topology));
    }

    // Diagnostic Core v1 — normalize every finding into Integrity / Health / Fitness
    // and attach conservative repair metadata. This does NOT perform any repair.
    return issues.map((issue) => decorateIssue(issue, profileId));
  }
}
