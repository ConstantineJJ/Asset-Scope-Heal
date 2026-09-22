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

  const total = (selector: (stat: TopologyStats) => number) =>
    topologyResults.reduce((sum, stat) => sum + selector(stat), 0);

  const localize = (
    selector: (stat: TopologyStats) => number,
    localizationKey: keyof NonNullable<TopologyStats['localization']>
  ): Partial<HealthIssue> => {
    const locations = topologyResults.flatMap((stat) => {
      if (selector(stat) <= 0) return [];
      const samples =
        stat.localizationSamples?.[localizationKey] ??
        (stat.localization?.[localizationKey] ? [stat.localization[localizationKey]!] : []);
      return samples.map((sample) => ({
        meshUuid: stat.meshUuid,
        meshName: stat.meshName,
        affectedElement: sample.element,
        affectedIndices: sample.affectedIndices,
        focusPosition: sample.focusPoint,
      }));
    });

    const first = locations[0];
    if (!first) return {};

    return {
      meshUuid: first.meshUuid,
      meshName: first.meshName,
      affectedIndices: first.affectedIndices,
      affectedElement: first.affectedElement,
      focusPosition: first.focusPosition,
      locations,
    };
  };

  const totalDegenerate = total((s) => s.degenerateTriangles);
  const totalBoundary = total((s) => s.boundaryEdges);
  const totalNonManifold = total((s) => s.nonManifoldEdges);
  const totalIsolated = total((s) => s.isolatedVertices);
  const totalTinyComponents = total((s) => s.tinyComponentsCount);
  const totalThinTriangles = total((s) => s.thinTriangles);
  const totalDuplicates = total((s) => s.potentialDuplicatePositions);
  const totalDuplicateTriangles = total((s) => s.duplicateTriangles);

  if (totalDegenerate > 0) {
    issues.push({
      id: 'topo-degenerate-triangles',
      category: 'Topology',
      severity: 'WARNING',
      layer: 'Health',
      title: `Degenerate triangles: ${totalDegenerate}`,
      description: `${totalDegenerate} triangle(s) have collinear or zero-length edges with near-zero surface area. Can cause unstable shading, baking or downstream geometry processing.`,
      count: totalDegenerate,
      technicalDetails: 'Triangle area is at or below the deterministic area epsilon.',
      ...localize((s) => s.degenerateTriangles, 'degenerate'),
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

  if (totalNonManifold > 0) {
    issues.push({
      id: 'topo-non-manifold-edges',
      category: 'Topology',
      severity: 'WARNING',
      layer: 'Health',
      title: `Non-manifold edges: ${totalNonManifold}`,
      description: `${totalNonManifold} edge(s) are shared by more than two faces. This can be problematic for watertight solids, printing, collision hulls or some mesh processing operations.`,
      count: totalNonManifold,
      technicalDetails: 'Edge shared by > 2 triangles.',
      ...localize((s) => s.nonManifoldEdges, 'nonManifold'),
    });
  } else {
    issues.push({
      id: 'topo-non-manifold-ok',
      category: 'Topology',
      severity: 'OK',
      title: 'No non-manifold shared edges',
      description: 'No edges shared by more than 2 faces were detected.',
    });
  }

  if (totalBoundary > 0) {
    issues.push({
      id: 'topo-boundary-edges',
      category: 'Topology',
      severity: 'INFO',
      title: `Boundary / open edges: ${totalBoundary}`,
      description: `${totalBoundary} edge(s) belong to only one triangle. This is expected for planar decals, hair cards or open shells; inspect only if the model is intended to be watertight.`,
      count: totalBoundary,
      technicalDetails: 'Single-triangle incident edges.',
      ...localize((s) => s.boundaryEdges, 'boundary'),
    });
  } else {
    issues.push({
      id: 'topo-watertight-ok',
      category: 'Topology',
      severity: 'OK',
      title: 'No open boundary edges',
      description: 'Zero open boundary edges were detected.',
    });
  }

  if (totalIsolated > 0) {
    issues.push({
      id: 'topo-isolated-vertices',
      category: 'Topology',
      severity: 'WARNING',
      layer: 'Health',
      title: `Isolated vertices: ${totalIsolated}`,
      description: `${totalIsolated} vertex position(s) exist in the buffer but are not referenced by any indexed face.`,
      count: totalIsolated,
      technicalDetails: 'Unindexed positions in vertex array.',
      ...localize((s) => s.isolatedVertices, 'isolated'),
    });
  }

  if (totalTinyComponents > 0) {
    issues.push({
      id: 'topo-tiny-components',
      category: 'Topology',
      severity: 'WARNING',
      layer: 'Health',
      title: `Tiny floating components: ${totalTinyComponents}`,
      description: `${totalTinyComponents} disconnected geometry component(s) contain a very small fraction of the mesh. They may be intentional detail or leftover debris.`,
      count: totalTinyComponents,
      ...localize((s) => s.tinyComponentsCount, 'tinyComponent'),
    });
  }

  if (totalThinTriangles > 0) {
    issues.push({
      id: 'topo-thin-triangles',
      category: 'Topology',
      severity: 'INFO',
      title: `Needle triangles: ${totalThinTriangles}`,
      description: `${totalThinTriangles} triangle(s) have an extreme aspect ratio (> 35:1). This can contribute to shading shimmer or fragile baking.`,
      count: totalThinTriangles,
      ...localize((s) => s.thinTriangles, 'thinTriangle'),
    });
  }

  if (totalDuplicates > 0) {
    issues.push({
      id: 'topo-duplicate-positions',
      category: 'Topology',
      severity: 'INFO',
      title: `Coincident vertex positions: ${totalDuplicates}`,
      description: `${totalDuplicates} vertices share near-identical spatial cells. glTF and real-time meshes may intentionally split vertices at UV seams and hard normal boundaries.`,
      count: totalDuplicates,
      repairability: 'CONDITIONAL',
      suggestedAction: 'Preview exact-duplicate merge. Only vertices with identical position and every vertex/morph attribute are eligible; topology-changing merges are blocked.',
      ...localize((s) => s.potentialDuplicatePositions, 'duplicatePosition'),
    });
  }

  if (totalDuplicateTriangles > 0) {
    issues.push({
      id: 'topo-exact-duplicate-triangles',
      category: 'Topology',
      severity: 'INFO',
      layer: 'Health',
      title: `Exact duplicate triangles: ${totalDuplicateTriangles}`,
      description: `${totalDuplicateTriangles} indexed triangle(s) repeat an earlier triangle with the same vertex indices and winding. Reversed-winding backfaces are not counted.`,
      count: totalDuplicateTriangles,
      repairability: 'CONDITIONAL',
      evidence: 'Only same-winding cyclic index duplicates are counted.',
      whyItMatters: 'Exact duplicate faces add redundant rasterization and can create depth or shading ambiguity in some material pipelines.',
      suggestedAction: 'Preview duplicate-triangle removal. Automatic removal is offered only when material, draw-range, sharing, and topology safety gates pass.',
      ...localize((s) => s.duplicateTriangles, 'duplicateTriangle'),
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
    const first = stats.zeroWeightLocations?.[0];
    issues.push({
      id: 'skin-zero-weight',
      category: 'Skinning',
      severity: 'ERROR',
      title: `Unweighted vertices: ${stats.zeroWeightVertices}`,
      description: `${stats.zeroWeightVertices} vertex/vertices have zero bone weight influence. They will remain frozen in bind pose when playing animations.`,
      count: stats.zeroWeightVertices,
      repairability: 'MANUAL',
      ...(first
        ? {
            meshUuid: first.meshUuid,
            meshName: first.meshName,
            affectedElement: first.affectedElement,
            affectedIndices: first.affectedIndices,
            focusPosition: first.focusPosition,
            locations: stats.zeroWeightLocations,
          }
        : {}),
    });
  }

  // Invalid weight sum
  if (stats.invalidWeightSumVertices > 0) {
    const first = stats.invalidWeightLocations?.[0];
    issues.push({
      id: 'skin-invalid-sum',
      category: 'Skinning',
      severity: 'WARNING',
      title: `Unnormalized bone weights: ${stats.invalidWeightSumVertices}`,
      description: `${stats.invalidWeightSumVertices} vertices have weight sums differing from 1.0 by > 0.05. May cause mesh collapse or volume inflation.`,
      count: stats.invalidWeightSumVertices,
      repairability: 'CONDITIONAL',
      suggestedAction: 'Preview normalization of non-zero skin weights. Zero-weight vertices are never guessed automatically.',
      ...(first
        ? {
            meshUuid: first.meshUuid,
            meshName: first.meshName,
            affectedElement: first.affectedElement,
            affectedIndices: first.affectedIndices,
            focusPosition: first.focusPosition,
            locations: stats.invalidWeightLocations,
          }
        : {}),
    });
  }

  // Duplicate active influences on the same bone can be consolidated without
  // guessing a new influence. Keep it informational, but offer a guarded repair.
  if (stats.redundantInfluenceVertices > 0) {
    const first = stats.redundantInfluenceLocations?.[0];
    issues.push({
      id: 'skin-redundant-influences',
      category: 'Skinning',
      severity: 'INFO',
      layer: 'Health',
      title: `Redundant skin influences: ${stats.redundantInfluenceVertices}`,
      description: `${stats.redundantInfluenceVertices} vertex/vertices contain the same active bone index in more than one influence slot.`,
      count: stats.redundantInfluenceVertices,
      repairability: 'CONDITIONAL',
      evidence: 'Two or more non-zero influence slots reference the same bone on a vertex.',
      whyItMatters: 'Duplicate slots waste influence capacity and make skin data harder to inspect without changing the intended weighted transform.',
      suggestedAction: 'Preview consolidation. Duplicate weights are summed onto one slot; no new bone influence is guessed.',
      ...(first
        ? {
            meshUuid: first.meshUuid,
            meshName: first.meshName,
            affectedElement: first.affectedElement,
            affectedIndices: first.affectedIndices,
            focusPosition: first.focusPosition,
            locations: stats.redundantInfluenceLocations,
          }
        : {}),
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

export function evaluateTextureIssues(textures: TextureInfo[]): HealthIssue[] {
  const issues: HealthIssue[] = [];
  let nonPowerOfTwoCount = 0;
  let invalidDimensionCount = 0;

  function isPowerOfTwo(n: number) {
    return n > 0 && (n & (n - 1)) === 0;
  }

  for (const t of textures) {
    if (!Number.isFinite(t.width) || !Number.isFinite(t.height) || t.width <= 0 || t.height <= 0) {
      invalidDimensionCount++;
      continue;
    }
    if (!isPowerOfTwo(t.width) || !isPowerOfTwo(t.height)) {
      nonPowerOfTwoCount++;
    }
  }

  if (invalidDimensionCount > 0) {
    issues.push({
      id: 'tex-invalid-dimensions',
      category: 'Textures',
      severity: 'ERROR',
      layer: 'Integrity',
      title: `Invalid texture dimensions: ${invalidDimensionCount}`,
      description: `${invalidDimensionCount} texture(s) have missing, non-finite, or non-positive dimensions.`,
      count: invalidDimensionCount,
      repairability: 'MANUAL',
    });
  } else if (textures.length > 0) {
    issues.push({
      id: 'tex-metadata-readable',
      category: 'Textures',
      severity: 'OK',
      layer: 'Integrity',
      title: 'Texture metadata is readable',
      description: `All ${textures.length} detected texture(s) expose valid dimensions.`,
      count: textures.length,
      repairability: 'NONE',
    });
  } else {
    issues.push({
      id: 'tex-none',
      category: 'Textures',
      severity: 'N/A',
      layer: 'Health',
      title: 'No textures detected',
      description: 'No texture images were detected in the loaded asset.',
      repairability: 'NONE',
    });
  }

  if (nonPowerOfTwoCount > 0) {
    issues.push({
      id: 'tex-npot',
      category: 'Textures',
      severity: 'INFO',
      layer: 'Health',
      title: `Non-power-of-two textures: ${nonPowerOfTwoCount}`,
      description: `${nonPowerOfTwoCount} texture(s) do not use power-of-two dimensions. Modern WebGL2 supports them, so this is informational rather than a defect.`,
      count: nonPowerOfTwoCount,
      repairability: 'NONE',
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
  integrity?: HealthIssue[];
  animationDiagnostics?: HealthIssue[];
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
    if (params.integrity && Array.isArray(params.integrity)) {
      issues.push(...params.integrity);
    }

    // 1. Materials
    issues.push(...evaluateMaterialIssues(params.materials));

    // 2. Textures
    issues.push(...evaluateTextureIssues(params.textures));

    // 3. Skeleton / Skinning
    issues.push(...evaluateSkinningIssues(params.skeleton, profileId));

    // Diagnostic Core v1 — Layer 3: profile-dependent Fitness expectations.
    issues.push(...evaluateProfileExpectations(params.summary, profileId));

    // 4. Animation diagnostics
    if (params.animationDiagnostics && Array.isArray(params.animationDiagnostics)) {
      issues.push(...params.animationDiagnostics);
    }

    // 5. Transforms
    if (params.transforms && Array.isArray(params.transforms)) {
      issues.push(...params.transforms);
    }

    // 6. Performance
    if (params.performance) {
      if (Array.isArray(params.performance)) {
        issues.push(...params.performance);
      } else if (params.performance.issues) {
        issues.push(...params.performance.issues);
      }
    }

    // 7. Normals and UVs
    if (params.normalsAndUv && Array.isArray(params.normalsAndUv)) {
      issues.push(...params.normalsAndUv);
    }

    // 8. Topology issues
    if (params.topology && params.topology.length > 0) {
      issues.push(...aggregateTopologyIssues(params.topology));
    }

    // Diagnostic Core v1 — normalize every finding into Integrity / Health / Fitness
    // and attach conservative repair metadata. This does NOT perform any repair.
    return issues.map((issue) => decorateIssue(issue, profileId));
  }
}
