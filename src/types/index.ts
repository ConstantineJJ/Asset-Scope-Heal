export type HealthSeverity = 'OK' | 'INFO' | 'WARNING' | 'ERROR' | 'N/A' | 'UNKNOWN';

export type DiagnosticLayer = 'Integrity' | 'Health' | 'Fitness';

export type Repairability = 'NONE' | 'SAFE' | 'CONDITIONAL' | 'MANUAL';

export type DiagnosticProfileId =
  | 'general'
  | 'desktop-game-character'
  | 'mobile-game-character'
  | 'static-prop'
  | 'animated-character'
  | 'mechanical-asset'
  | 'visualization';

export interface DiagnosticProfile {
  id: DiagnosticProfileId;
  label: string;
  description: string;
  triangleWarning: number;
  drawCallWarning: number;
  textureDimensionWarning: number;
  maxBoneInfluencesWarning: number;
  expectsRig?: boolean;
  expectsAnimations?: boolean;
}

export type HealthCategory =
  | 'Geometry'
  | 'Topology'
  | 'Normals'
  | 'UV'
  | 'Materials'
  | 'Textures'
  | 'Skeleton'
  | 'Skinning'
  | 'Animations'
  | 'Transforms'
  | 'Performance';

export interface HealthIssue {
  id: string;
  category: HealthCategory;
  severity: HealthSeverity;
  title: string;
  description: string;

  /** Diagnostic Core v1: Integrity → Health → Fitness. */
  layer?: DiagnosticLayer;

  /** Concrete observation that caused this finding. */
  evidence?: string;

  /** Why the observation can matter technically. */
  whyItMatters?: string;

  /** Conservative next step. This is guidance, not an automatic repair. */
  suggestedAction?: string;

  /** How safely Asset Doctor could eventually repair this finding. */
  repairability?: Repairability;

  /** Profile used to interpret target-dependent findings. */
  profileId?: DiagnosticProfileId;

  /** True when severity depends on intended use rather than structural validity. */
  profileDependent?: boolean;

  meshName?: string;
  meshUuid?: string;
  nodeName?: string;
  boneName?: string;
  clipName?: string;
  count?: number;
  /** Human-readable numerator / denominator context when a reliable denominator exists. */
  ratio?: string;
  affectedIndices?: number[];
  affectedElement?: 'triangle' | 'edge' | 'vertex' | 'component';
  focusPosition?: [number, number, number];
  locations?: DiagnosticLocation[];
  technicalDetails?: string;
}

export type AnalysisStageStatus = 'pending' | 'running' | 'done' | 'error';

export interface ProgressiveAnalysisState {
  geometry: AnalysisStageStatus;
  materials: AnalysisStageStatus;
  textures: AnalysisStageStatus;
  skeleton: AnalysisStageStatus;
  animations: AnalysisStageStatus;
  transforms: AnalysisStageStatus;
  performance: AnalysisStageStatus;
  topology: AnalysisStageStatus;
}

export type PerformanceStageId =
  | 'initialLoad'
  | 'firstDiagnosticPass'
  | 'topologyWorker'
  | 'rescan'
  | 'repairPreview'
  | 'applyVerification'
  | 'export'
  | 'reopenVerification';

export interface PerformanceTimingSample {
  lastMs: number;
  bestMs: number;
  worstMs: number;
  averageMs: number;
  samples: number;
}

export interface TopologyPerformanceStats {
  meshCount: number;
  cacheHits: number;
  cacheMisses: number;
  extractionMs: number;
  workerMs: number;
  transferredBytes: number;
}

export interface PerformanceMemoryStats {
  sourceGlbBytes: number;
  liveGeometryBytes: number;
  undoSnapshotsBytes: number;
  repairPreviewBytes: number;
  exportBufferBytes: number;
  pristineExportGeometryBytes: number;
  reopenedVerificationGeometryBytes: number;
  jsHeapUsedBytes?: number;
  jsHeapLimitBytes?: number;
}

export interface PerformanceCoreProfile {
  timings: Partial<Record<PerformanceStageId, PerformanceTimingSample>>;
  topology: TopologyPerformanceStats;
  memory: PerformanceMemoryStats;
  cancelledAnalyses: number;
}

export interface SceneNodeInfo {
  uuid: string;
  name: string;
  type: 'Group' | 'Mesh' | 'SkinnedMesh' | 'Bone' | 'Light' | 'Camera' | 'Scene' | 'Object3D';
  visible: boolean;
  triangleCount: number;
  vertexCount: number;
  materialNames?: string[];
  children: SceneNodeInfo[];
  parentId?: string;
}

export interface SkinningStats {
  skinnedMeshCount: number;
  skeletonCount: number;
  totalBones: number;
  rootBoneNames: string[];
  maxInfluencesPerVertex: number;
  zeroWeightVertices: number;
  invalidWeightSumVertices: number;
  unusedBonesCount: number;
  redundantInfluenceVertices: number;
  bones: BoneInfo[];
  invalidWeightLocations?: DiagnosticLocation[];
  zeroWeightLocations?: DiagnosticLocation[];
  redundantInfluenceLocations?: DiagnosticLocation[];
}

export interface BoundingBoxInfo {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
  center: [number, number, number];
  diagonal: number;
}

export interface MaterialInfo {
  uuid: string;
  name: string;
  type: string;
  baseColorHex: string;
  metallic: number;
  roughness: number;
  opacity: number;
  alphaMode: string;
  doubleSided: boolean;
  emissiveHex: string;
  textureSlots: {
    map?: string;
    normalMap?: string;
    roughnessMap?: string;
    metalnessMap?: string;
    aoMap?: string;
    emissiveMap?: string;
  };
}

export interface TextureInfo {
  uuid: string;
  name: string;
  width: number;
  height: number;
  format: string;
  colorSpace: string;
  uncompressedBytesEstimate: number;
  materialsUsed: string[];
}

export interface BoneInfo {
  uuid: string;
  name: string;
  parentName?: string;
  childrenNames: string[];
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface SkinInfluenceSummary {
  targetUuid: string;
  targetName: string;
  targetType: 'Bone' | 'SkinnedMesh';
  skinnedMeshCount: number;
  vertexCount: number;
  influencedVertices: number;
  zeroWeightVertices: number;
  averageInfluencesPerVertex: number;
  maxInfluencesPerVertex: number;
  averageWeight?: number;
  maxWeight?: number;
}

export interface AnimationClipInfo {
  name: string;
  duration: number;
  trackCount: number;
  rootMotionTranslation?: number;
  rootMotionRotation?: number;
  rootMotionDetected?: boolean;
  rootMotionDelta?: [number, number, number];
  rootMotionTrackName?: string;
}

export interface AssetSummary {
  fileName: string;
  fileSizeBytes?: number;
  nodeCount: number;
  meshCount: number;
  primitiveCount: number;
  vertexCount: number;
  indexedVertexCount: number;
  triangleCount: number;
  lineCount: number;
  pointCount: number;
  materialCount: number;
  textureCount: number;
  skeletonCount: number;
  boneCount: number;
  skinnedMeshCount: number;
  clipCount: number;
  clips: AnimationClipInfo[];
  boundingBox: BoundingBoxInfo;
}
