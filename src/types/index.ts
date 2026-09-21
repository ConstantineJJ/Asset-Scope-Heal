export type HealthSeverity = 'OK' | 'INFO' | 'WARNING' | 'ERROR';

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
  meshName?: string;
  meshUuid?: string;
  count?: number;
  affectedIndices?: number[];
  focusPosition?: [number, number, number];
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
  bones: BoneInfo[];
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

export interface AnimationClipInfo {
  name: string;
  duration: number;
  trackCount: number;
  rootMotionTranslation?: number;
  rootMotionRotation?: number;
  rootMotionDetected?: boolean;
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

export interface TopologyStats {
  meshUuid: string;
  meshName: string;
  degenerateTriangles: number;
  degenerateIndices: number[];
  boundaryEdges: number;
  nonManifoldEdges: number;
  isolatedVertices: number;
  componentsCount: number;
  tinyComponentsCount: number;
  thinTriangles: number;
  potentialDuplicatePositions: number;
  minTriangleArea: number;
  maxTriangleArea: number;
  avgTriangleArea: number;
  denseTrianglesCount: number;
  triangleCount: number;
  vertexCount: number;
  sampleFocusPoints?: Array<[number, number, number]>;
}

export type RenderMode =
  | 'pbr'
  | 'unlit'
  | 'wireframe'
  | 'wireframe-overlay'
  | 'base-color'
  | 'normals'
  | 'roughness'
  | 'metallic'
  | 'ao'
  | 'emissive'
  | 'uv-checker'
  | 'topology-health'
  | 'triangle-density';

export type LightingPreset =
  | 'neutral-studio'
  | 'soft-studio'
  | 'hard-studio'
  | 'outdoor'
  | 'sunset'
  | 'top-light'
  | 'rim-light'
  | 'dark-studio';

export interface LightingConfig {
  preset: LightingPreset;
  exposure: number;
  environmentIntensity?: number;
  ambientIntensity?: number;
  keyIntensity: number;
  fillIntensity: number;
  rimIntensity: number;
}
