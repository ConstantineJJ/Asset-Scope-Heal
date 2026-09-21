import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { TopToolbar } from './components/TopToolbar';
import { SceneTreePanel } from './components/SceneTreePanel';
import { Viewport } from './components/Viewport';
import { InspectorPanel } from './components/InspectorPanel';
import { AnimationTimeline } from './components/AnimationTimeline';
import { TopologyTestModal } from './components/TopologyTestModal';
import { SceneManager } from './viewer/SceneManager';
import { GLBLoaderService } from './loaders/GLBLoaderService';
import {
  createRiggedRobotCharacter,
  createSampleDrone,
  createTopologyDiagnosticSpecimen,
} from './loaders/SampleModels';
import { WorkerManager } from './workers/WorkerManager';
import { HealthEngine } from './health/HealthEngine';
import { useI18n } from './i18n';
import { readHealReport, saveHealReport } from './heal/HealReportStorage';
import { SurgicalHealEngine } from './heal/SurgicalHealEngine';
import {
  RepairedExportService,
  type ExportSourceDescriptor,
  type RepairedExportResult,
} from './export/RepairedExportService';
import { analyzeGeometry } from './analysis/GeometryAnalyzer';
import { analyzeMaterials } from './analysis/MaterialAnalyzer';
import { analyzeTextures } from './analysis/TextureAnalyzer';
import { analyzeSkeleton } from './analysis/SkeletonAnalyzer';
import { analyzeAnimations } from './analysis/AnimationAnalyzer';
import { analyzeTransforms } from './analysis/TransformAnalyzer';
import { analyzePerformance } from './analysis/PerformanceAnalyzer';
import { analyzeNormalsAndUv } from './analysis/NormalsAndUvAnalyzer';
import type {
  AnimationClipInfo,
  AssetSummary,
  DiagnosticProfileId,
  HealthIssue,
  HealOperationReport,
  HealPreview,
  HealUndoState,
  ExportVerificationReport,
  LightingConfig,
  LightingPreset,
  MaterialInfo,
  ProgressiveAnalysisState,
  RenderMode,
  SceneNodeInfo,
  TextureInfo,
  TopologyStats,
} from './types';

export function App() {
  const { t } = useI18n();
  // Scene & Service instances
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const loaderServiceRef = useRef<GLBLoaderService | null>(null);
  const workerManagerRef = useRef<WorkerManager | null>(null);
  const currentAssetRootRef = useRef<THREE.Group | null>(null);
  const currentAnimationClipsRef = useRef<THREE.AnimationClip[]>([]);
  const healEngineRef = useRef<SurgicalHealEngine | null>(null);
  const exportServiceRef = useRef<RepairedExportService | null>(null);
  const currentExportSourceRef = useRef<ExportSourceDescriptor | null>(null);
  const exportResultRef = useRef<RepairedExportResult | null>(null);
  if (!healEngineRef.current) {
    healEngineRef.current = new SurgicalHealEngine();
  }
  if (!exportServiceRef.current) {
    exportServiceRef.current = new RepairedExportService();
  }

  // App States
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState<string>('Explorer_Drone_MK4.glb');
  const [fileSizeBytes, setFileSizeBytes] = useState<number | undefined>(undefined);

  // Analysis & Diagnostic States
  const [summary, setSummary] = useState<AssetSummary | null>(null);
  const [treeRoot, setTreeRoot] = useState<SceneNodeInfo | null>(null);
  const [materials, setMaterials] = useState<MaterialInfo[]>([]);
  const [textures, setTextures] = useState<TextureInfo[]>([]);
  const [healthIssues, setHealthIssues] = useState<HealthIssue[]>([]);
  const [diagnosticProfileId, setDiagnosticProfileId] = useState<DiagnosticProfileId>('general');
  const diagnosticProfileIdRef = useRef<DiagnosticProfileId>('general');
  const analysisRunIdRef = useRef(0);
  const analysisSnapshotRef = useRef<{
    summary: AssetSummary;
    materials: MaterialInfo[];
    textures: TextureInfo[];
    skeleton: ReturnType<typeof analyzeSkeleton>;
    animations: AnimationClipInfo[];
    transforms: HealthIssue[];
    normalsAndUv: HealthIssue[];
    topology: TopologyStats[];
    totalTracks: number;
  } | null>(null);

  const [progressiveState, setProgressiveState] = useState<ProgressiveAnalysisState>({
    geometry: 'pending',
    materials: 'pending',
    textures: 'pending',
    skeleton: 'pending',
    animations: 'pending',
    transforms: 'pending',
    performance: 'pending',
    topology: 'pending',
  });

  // Viewer Config States
  const [renderMode, setRenderMode] = useState<RenderMode>('pbr');
  const [lightingPreset, setLightingPreset] = useState<LightingPreset>('neutral-studio');
  const [lightingConfig, setLightingConfig] = useState<LightingConfig>({
    preset: 'neutral-studio',
    exposure: 1.0,
    ambientIntensity: 0.4,
    keyIntensity: 1.6,
    fillIntensity: 0.6,
    rimIntensity: 1.0,
  });
  const [toggles, setToggles] = useState({
    grid: true,
    axes: true,
    bbox: false,
    skeleton: false,
    origin: true,
  });
  const [explodedAmount, setExplodedAmount] = useState(0);

  // Selection & Tree States
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<SceneNodeInfo | null>(null);

  // Animation States
  const [animationClips, setAnimationClips] = useState<AnimationClipInfo[]>([]);
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const [isPlayingAnimation, setIsPlayingAnimation] = useState(false);
  const [animationTime, setAnimationTime] = useState(0);
  const [animationDuration, setAnimationDuration] = useState(0);
  const [animationSpeed, setAnimationSpeed] = useState(1.0);
  const [isLoopingAnimation, setIsLoopingAnimation] = useState(true);

  // FPS & Metrics
  const [fps, setFps] = useState(60);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isIssueFocusActive, setIsIssueFocusActive] = useState(false);
  const [healPreview, setHealPreview] = useState<HealPreview | null>(null);
  const [healUndoState, setHealUndoState] = useState<HealUndoState>({ available: false });

  const [healReport, setHealReport] = useState<HealOperationReport | null>(() => readHealReport());
  const [healHistorical, setHealHistorical] = useState(true);
  const [healBusy, setHealBusy] = useState(false);
  const healBusyRef = useRef(false);
  const [healError, setHealError] = useState<string | null>(null);
  const [healStorageFailed, setHealStorageFailed] = useState(false);
  const [exportReport, setExportReport] = useState<ExportVerificationReport | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Initialize Loader & Worker Services
  useEffect(() => {
    loaderServiceRef.current = new GLBLoaderService();
    workerManagerRef.current = new WorkerManager();

    return () => {
      loaderServiceRef.current?.dispose();
      loaderServiceRef.current = null;
      workerManagerRef.current?.dispose();
      workerManagerRef.current = null;
    };
  }, []);

  // Build Scene Hierarchy Tree
  const buildSceneTree = (object: THREE.Object3D): SceneNodeInfo => {
    let type: SceneNodeInfo['type'] = 'Object3D';
    let triangleCount = 0;
    let vertexCount = 0;

    if ((object as THREE.SkinnedMesh).isSkinnedMesh) {
      type = 'SkinnedMesh';
    } else if ((object as THREE.Mesh).isMesh) {
      type = 'Mesh';
    } else if ((object as THREE.Bone).isBone) {
      type = 'Bone';
    } else if ((object as THREE.Group).isGroup) {
      type = 'Group';
    }

    if ((object as THREE.Mesh).isMesh && (object as THREE.Mesh).geometry) {
      const geom = (object as THREE.Mesh).geometry;
      if (geom.index) {
        triangleCount = geom.index.count / 3;
      } else if (geom.attributes.position) {
        triangleCount = geom.attributes.position.count / 3;
      }
      if (geom.attributes.position) {
        vertexCount = geom.attributes.position.count;
      }
    }

    const validChildren = object.children
      .filter((child) => !child.name?.startsWith('__ascope_internal_'))
      .map((child) => buildSceneTree(child));

    return {
      uuid: object.uuid,
      name: object.name || `${type}_${object.id}`,
      type,
      visible: object.visible,
      triangleCount: Math.round(triangleCount),
      vertexCount,
      children: validChildren,
    };
  };

  // Find node by uuid in tree
  const findNodeInTree = (node: SceneNodeInfo | null, uuid: string): SceneNodeInfo | null => {
    if (!node) return null;
    if (node.uuid === uuid) return node;
    for (const child of node.children) {
      const found = findNodeInTree(child, uuid);
      if (found) return found;
    }
    return null;
  };

  const rebuildDiagnosticReport = useCallback(
    (profileId: DiagnosticProfileId, topologyOverride?: TopologyStats[]) => {
      const snapshot = analysisSnapshotRef.current;
      if (!snapshot) return;

      const topology = topologyOverride ?? snapshot.topology;
      const performance = analyzePerformance(
        snapshot.summary,
        snapshot.textures,
        snapshot.totalTracks,
        profileId
      );

      const issues = HealthEngine.aggregate({
        summary: snapshot.summary,
        profileId,
        materials: snapshot.materials,
        textures: snapshot.textures,
        skeleton: snapshot.skeleton,
        animations: snapshot.animations,
        transforms: snapshot.transforms,
        performance,
        normalsAndUv: snapshot.normalsAndUv,
        topology,
      });

      setHealthIssues(issues);
    },
    []
  );

  // Profile changes reinterpret Fitness without rerunning expensive topology analysis
  // and without changing the viewport mount callback identity.
  useEffect(() => {
    diagnosticProfileIdRef.current = diagnosticProfileId;
    rebuildDiagnosticReport(diagnosticProfileId);
  }, [diagnosticProfileId, rebuildDiagnosticReport]);

  // Analysis Pipeline Execution
  const runAnalysisPipeline = useCallback(
    async (
      root: THREE.Group,
      clips: THREE.AnimationClip[],
      assetName: string,
      sizeBytes?: number
    ) => {
      const runId = ++analysisRunIdRef.current;

      setProgressiveState({
        geometry: 'running',
        materials: 'running',
        textures: 'running',
        skeleton: 'running',
        animations: 'running',
        transforms: 'running',
        performance: 'running',
        topology: 'running',
      });

      // 1. Synchronous analysis
      const geomSummary = analyzeGeometry(root, assetName, sizeBytes);
      const mats = analyzeMaterials(root);
      const texs = analyzeTextures(root);
      const skel = analyzeSkeleton(root);
      const anims = analyzeAnimations(clips, skel.rootBoneNames);
      const xforms = analyzeTransforms(root);
      const totalTracks = clips.reduce((acc, c) => acc + c.tracks.length, 0);
      const normalsUv = analyzeNormalsAndUv(root);

      analysisSnapshotRef.current = {
        summary: geomSummary,
        materials: mats,
        textures: texs,
        skeleton: skel,
        animations: anims,
        transforms: xforms,
        normalsAndUv: normalsUv,
        topology: [],
        totalTracks,
      };

      setSummary(geomSummary);
      setMaterials(mats);
      setTextures(texs);
      setAnimationClips(anims);

      // Progressive state update for fast passes
      setProgressiveState((prev) => ({
        ...prev,
        geometry: 'done',
        materials: 'done',
        textures: 'done',
        skeleton: 'done',
        animations: 'done',
        transforms: 'done',
        performance: 'done',
      }));

      // Initial Diagnostic Core calculation (without topology yet).
      rebuildDiagnosticReport(diagnosticProfileIdRef.current, []);

      // 2. Heavy Topology Analysis in Worker
      if (workerManagerRef.current) {
        try {
          const topologyResults: TopologyStats[] = await workerManagerRef.current.analyzeMeshes(
            root
          );

          // A slower previous asset must never overwrite diagnostics for a newer load.
          if (runId !== analysisRunIdRef.current) return false;

          setProgressiveState((prev) => ({ ...prev, topology: 'done' }));

          // Preserve expensive topology results, then reinterpret the full report
          // through the currently selected Diagnostic Profile.
          if (analysisSnapshotRef.current) {
            analysisSnapshotRef.current.topology = topologyResults;
          }
          rebuildDiagnosticReport(diagnosticProfileIdRef.current, topologyResults);
          return true;
        } catch (err) {
          if (runId !== analysisRunIdRef.current) return false;
          console.warn('Topology worker error:', err);
          setProgressiveState((prev) => ({ ...prev, topology: 'error' }));
          rebuildDiagnosticReport(diagnosticProfileIdRef.current);
          setHealthIssues((prev) => [
            ...prev.filter((issue) => issue.id !== 'topology-analysis-unknown'),
            {
              id: 'topology-analysis-unknown',
              category: 'Topology',
              severity: 'UNKNOWN',
              layer: 'Health',
              title: 'Topology analysis unavailable',
              description: 'The background topology pass did not complete, so topology health cannot be determined reliably for this asset.',
              evidence: err instanceof Error ? err.message : String(err),
              whyItMatters: 'Asset Doctor should not infer topology health from incomplete data.',
              suggestedAction: 'Retry analysis or inspect the worker error before making topology-related repair decisions.',
              repairability: 'NONE',
            },
          ]);
        }
      }
      return false;
    },
    [rebuildDiagnosticReport]
  );

  // Load an Asset (from procedural sample or loaded File)
  const loadAsset = useCallback(
    async (
      root: THREE.Group,
      clips: THREE.AnimationClip[],
      assetName: string,
      sizeBytes?: number,
      exportSource?: ExportSourceDescriptor
    ) => {
      setIsLoading(true);
      currentAssetRootRef.current = root;
      currentAnimationClipsRef.current = clips;
      currentExportSourceRef.current = exportSource ?? null;
      exportResultRef.current = null;
      setExportReport(null);
      setExportError(null);
      healEngineRef.current?.clear();
      setHealHistorical(true);
      setHealError(null);
      setHealPreview(null);
      setHealUndoState({ available: false });
      setFileName(assetName);
      setFileSizeBytes(sizeBytes);
      setExplodedAmount(0);
      setSelectedUuid(null);
      setSelectedNode(null);
      setIsIssueFocusActive(false);

      if (sceneManagerRef.current) {
        sceneManagerRef.current.setAsset(root, clips);
      }

      // Build hierarchy
      const tree = buildSceneTree(root);
      setTreeRoot(tree);

      // Setup animation playback if present
      if (clips.length > 0) {
        setActiveClipIndex(0);
        setAnimationDuration(clips[0].duration);
        setIsPlayingAnimation(true);
      } else {
        setIsPlayingAnimation(false);
        setAnimationTime(0);
        setAnimationDuration(0);
      }

      setIsLoading(false);

      // Trigger progressive background analysis
      await runAnalysisPipeline(root, clips, assetName, sizeBytes);
    },
    [runAnalysisPipeline]
  );

  // Mount Viewport & Load Default Model
  const handleCanvasMount = useCallback(
    (container: HTMLElement) => {
      if (!sceneManagerRef.current) {
        const mgr = new SceneManager(container, {
          onMeshSelected: (uuid) => {
            setSelectedUuid(uuid);
          },
          onAnimationTimeUpdate: (time, duration) => {
            setAnimationTime(time);
            setAnimationDuration(duration);
          },
        });
        sceneManagerRef.current = mgr;

        // FPS polling
        const fpsInterval = setInterval(() => {
          if (sceneManagerRef.current) {
            setFps(sceneManagerRef.current.fps);
          }
        }, 500);

        // Load default Explorer Drone
        const defaultSample = createSampleDrone();
        loadAsset(
          defaultSample.root,
          defaultSample.animations,
          'Explorer_Drone_MK4.glb',
          1024 * 340,
          { kind: 'sample', sampleId: 'drone' }
        );

        return () => {
          clearInterval(fpsInterval);
          if (sceneManagerRef.current === mgr) {
            mgr.dispose();
            sceneManagerRef.current = null;
          }
        };
      }
    },
    [loadAsset]
  );

  // Update selectedNode state when selectedUuid changes
  useEffect(() => {
    if (selectedUuid && treeRoot) {
      setSelectedNode(findNodeInTree(treeRoot, selectedUuid));
    } else {
      setSelectedNode(null);
    }
  }, [selectedUuid, treeRoot]);

  // File Handlers
  const handleOpenFile = async (file: File) => {
    if (!loaderServiceRef.current) return;
    try {
      setIsLoading(true);
      const result = await loaderServiceRef.current.loadFromFile(file);
      await loadAsset(
        result.root,
        result.animations,
        result.fileName,
        result.fileSizeBytes,
        result.sourceBuffer
          ? { kind: 'buffer', fileName: result.fileName, buffer: result.sourceBuffer }
          : undefined
      );
    } catch (err) {
      alert(`Error loading 3D file: ${err instanceof Error ? err.message : String(err)}`);
      setIsLoading(false);
    }
  };

  const handleSelectSample = (sampleId: string) => {
    let sample;
    if (sampleId === 'drone') {
      sample = createSampleDrone();
      loadAsset(sample.root, sample.animations, 'Explorer_Drone_MK4.glb', 1024 * 340, { kind: 'sample', sampleId: 'drone' });
    } else if (sampleId === 'topo-specimen') {
      sample = createTopologyDiagnosticSpecimen();
      loadAsset(sample.root, sample.animations, 'Topology_Diagnostic_Specimen.glb', 1024 * 85, { kind: 'sample', sampleId: 'topo-specimen' });
    } else if (sampleId === 'rigged-robot') {
      sample = createRiggedRobotCharacter();
      loadAsset(sample.root, sample.animations, 'Rigged_Bipedal_Unit.glb', 1024 * 420, { kind: 'sample', sampleId: 'rigged-robot' });
    }
  };

  // Viewport Controls Handlers
  const handleSetRenderMode = (mode: RenderMode) => {
    setRenderMode(mode);
    sceneManagerRef.current?.setRenderMode(mode);
  };

  const handleSetLightingPreset = (preset: LightingPreset) => {
    setLightingPreset(preset);
    sceneManagerRef.current?.setLightingPreset(preset);
  };

  const handleUpdateLighting = (config: Partial<LightingConfig>) => {
    setLightingConfig((prev) => ({ ...prev, ...config }));
    sceneManagerRef.current?.updateLightingConfig(config);
  };

  const handleToggleHelper = (helper: 'grid' | 'axes' | 'bbox' | 'skeleton' | 'origin') => {
    if (!sceneManagerRef.current) return;
    setToggles((prev) => {
      const next = { ...prev, [helper]: !prev[helper] };
      if (helper === 'grid') sceneManagerRef.current?.toggleGrid(next.grid);
      if (helper === 'axes') sceneManagerRef.current?.toggleAxes(next.axes);
      if (helper === 'bbox') sceneManagerRef.current?.toggleBbox(next.bbox);
      if (helper === 'skeleton') sceneManagerRef.current?.toggleSkeleton(next.skeleton);
      if (helper === 'origin') sceneManagerRef.current?.toggleOrigin(next.origin);
      return next;
    });
  };

  const handleSetExplodedAmount = (amount: number) => {
    setExplodedAmount(amount);
    sceneManagerRef.current?.setExplodedAmount(amount);
  };

  // Camera Handlers
  const handleFrameAll = () => {
    if (currentAssetRootRef.current && sceneManagerRef.current) {
      sceneManagerRef.current.cameraController.frameObject(currentAssetRootRef.current);
    }
  };

  const handleFocusSelected = () => {
    sceneManagerRef.current?.focusSelected();
  };

  const handleFrameRawBounds = () => {
    sceneManagerRef.current?.frameRawBounds();
  };

  const handleResetCamera = (preset: 'perspective' | 'front' | 'top' | 'right') => {
    sceneManagerRef.current?.cameraController.setViewPreset(preset);
  };

  // Scene Tree Handlers
  const handleSelectNode = (uuid: string) => {
    sceneManagerRef.current?.cancelIssueInspection();
    setIsIssueFocusActive(false);
    setSelectedUuid(uuid);
    sceneManagerRef.current?.selectObject(uuid);
  };

  const handleToggleVisibility = (uuid: string) => {
    sceneManagerRef.current?.toggleObjectVisibility(uuid);
    if (currentAssetRootRef.current) {
      setTreeRoot(buildSceneTree(currentAssetRootRef.current));
    }
  };

  const handleIsolateNode = (uuid: string) => {
    sceneManagerRef.current?.isolateObject(uuid);
    if (currentAssetRootRef.current) {
      setTreeRoot(buildSceneTree(currentAssetRootRef.current));
    }
  };

  const handleShowAll = () => {
    sceneManagerRef.current?.showAllObjects();
    if (currentAssetRootRef.current) {
      setTreeRoot(buildSceneTree(currentAssetRootRef.current));
    }
  };

  const handleFocusNode = (uuid: string) => {
    handleSelectNode(uuid);
    sceneManagerRef.current?.focusSelected();
  };

  // Health Issue Focus Handler
  const handleFocusIssue = (issue: HealthIssue) => {
    if (!sceneManagerRef.current) return;

    if (issue.meshUuid) {
      setSelectedUuid(issue.meshUuid);
    }
    sceneManagerRef.current.localizeIssue(issue);
    setIsIssueFocusActive(true);
  };

  const handleRestoreIssueView = () => {
    sceneManagerRef.current?.restoreIssueView();
    setIsIssueFocusActive(false);
  };

  // Surgical Heal v0.2
  const refreshAfterHeal = async () => {
    const root = currentAssetRootRef.current;
    if (!root) return;

    sceneManagerRef.current?.cancelIssueInspection();
    setIsIssueFocusActive(false);
    setSelectedUuid(null);
    setSelectedNode(null);
    setTreeRoot(buildSceneTree(root));

    return await runAnalysisPipeline(
      root,
      currentAnimationClipsRef.current,
      fileName,
      fileSizeBytes
    );
  };

  const handlePreviewHeal = (issue: HealthIssue) => {
    const root = currentAssetRootRef.current;
    const engine = healEngineRef.current;
    if (!root || !engine || !issue.meshUuid || healBusyRef.current) return;

    if (issue.id !== 'topo-degenerate-triangles') {
      return;
    }

    const preview = engine.previewRemoveDegenerateTriangles(root, issue.meshUuid);
    setHealPreview(preview);

    if (preview.status === 'READY') {
      handleFocusIssue(issue);
    }
  };

  const handleCancelHealPreview = () => {
    healEngineRef.current?.cancelPreview();
    setHealPreview(null);
  };

  const publishHealReport = (engine: SurgicalHealEngine) => {
    const report = engine.getLastOperation();
    if (!report) return;
    setHealReport(report);
    setHealHistorical(false);
    setHealStorageFailed(!saveHealReport(report));
  };

  const performHeal = async (undo: boolean) => {
    const root = currentAssetRootRef.current;
    const engine = healEngineRef.current;
    if (!root || !engine || healBusyRef.current) return;
    healBusyRef.current = true;
    setHealBusy(true);
    setHealError(null);
    exportResultRef.current = null;
    setExportReport(null);
    setExportError(null);
    try {
      const result = undo ? engine.undoLast(root) : engine.applyPending(root, fileName);
      if (!result.success) {
        const reason = result.reasonKey ? t(result.reasonKey) : result.reason ?? t('heal.blocked');
        if (undo) setHealError(reason);
        else setHealPreview(previous => previous ? { ...previous, status: 'BLOCKED', reason, reasonKey: result.reasonKey } : null);
        return;
      }
      setHealPreview(null);
      setHealUndoState(engine.getUndoState());
      publishHealReport(engine);
      let complete = false;
      try { complete = (await refreshAfterHeal()) === true; }
      catch { /* Preserve measured evidence and Undo if the broader pipeline fails. */ }
      // An old analysis completion must never certify or overwrite a newer asset/report.
      if (currentAssetRootRef.current !== root) return;
      if (!undo && result.report) engine.completeVerification(result.report.operationId, complete);
      if (undo && !complete) setHealError(t('heal.errors.undoAnalysis'));
      publishHealReport(engine);
    } catch {
      if (currentAssetRootRef.current === root) setHealError(t('heal.errors.operationFailed'));
    } finally {
      healBusyRef.current = false;
      setHealBusy(false);
    }
  };

  const handleApplyHeal = () => performHeal(false);
  const handleUndoHeal = () => performHeal(true);

  // Export Repaired Copy v0.1
  const handleBuildRepairedExport = async (): Promise<RepairedExportResult | null> => {
    const root = currentAssetRootRef.current;
    const source = currentExportSourceRef.current;
    const engine = healEngineRef.current;
    const service = exportServiceRef.current;
    const report = healReport;

    if (!root || !source || !engine || !service || !report || healHistorical || exportBusy) {
      setExportError(t('export.errors.unavailable'));
      return null;
    }

    const preflight = engine.validateCurrentVerifiedState(root, report);
    if (!preflight.ok) {
      setExportError(t(preflight.reasonKey ?? 'export.errors.unavailable'));
      return null;
    }

    setExportBusy(true);
    setExportError(null);
    exportResultRef.current = null;
    setExportReport(null);

    try {
      const result = await service.exportAndVerify({
        source,
        currentRoot: root,
        assetName: fileName,
        healReport: report,
      });

      exportResultRef.current = result;
      setExportReport(result.report);

      if (result.report.status !== 'VERIFIED') {
        setExportError(t('export.errors.verificationFailed'));
        return null;
      }
      return result;
    } catch (error) {
      const key = error instanceof Error ? error.message : 'export.errors.failed';
      setExportError(t(key.startsWith('export.') ? key : 'export.errors.failed'));
      return null;
    } finally {
      setExportBusy(false);
    }
  };

  const handleDownloadRepairedExport = () => {
    const result = exportResultRef.current;
    const service = exportServiceRef.current;
    if (!result || !service || result.report.status !== 'VERIFIED') return;
    service.download(result);
  };

  const handleToolbarExport = async () => {
    const service = exportServiceRef.current;
    if (!service || exportBusy) return;

    const cached = exportResultRef.current;
    if (cached?.report.status === 'VERIFIED') {
      service.download(cached);
      return;
    }

    const result = await handleBuildRepairedExport();
    if (result?.report.status === 'VERIFIED') {
      service.download(result);
    }
  };

  // Animation Handlers
  const handleSelectClip = (idx: number) => {
    setActiveClipIndex(idx);
    sceneManagerRef.current?.playAnimationClip(idx);
    setIsPlayingAnimation(true);
  };

  const handleTogglePlayAnimation = () => {
    const next = !isPlayingAnimation;
    setIsPlayingAnimation(next);
    sceneManagerRef.current?.toggleAnimationPlay(next);
  };

  const handleStopAnimation = () => {
    setIsPlayingAnimation(false);
    sceneManagerRef.current?.stopAnimation();
    setAnimationTime(0);
  };

  const handleSeekAnimation = (normalized: number) => {
    sceneManagerRef.current?.seekAnimation(normalized);
  };

  const handleStepFrame = (forward: boolean) => {
    sceneManagerRef.current?.stepAnimationFrame(forward ? 1 / 30 : -1 / 30);
  };

  const handleSetSpeed = (s: number) => {
    setAnimationSpeed(s);
    sceneManagerRef.current?.setAnimationSpeed(s);
  };

  const handleToggleLoop = () => {
    const next = !isLoopingAnimation;
    setIsLoopingAnimation(next);
    sceneManagerRef.current?.setAnimationLoop(next);
  };

  // Keyboard Shortcuts (F to frame, Space for animation play/pause, Z for wireframe toggle)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        handleFrameAll();
      } else if (e.key === ' ') {
        e.preventDefault();
        handleTogglePlayAnimation();
      } else if (e.key === 'z' || e.key === 'Z') {
        handleSetRenderMode(renderMode === 'wireframe' ? 'pbr' : 'wireframe');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [renderMode]);

  const canExportRepaired = Boolean(
    healReport &&
    !healHistorical &&
    healReport.status === 'VERIFIED' &&
    healReport.pipeline === 'complete' &&
    !healReport.undoneAt &&
    currentExportSourceRef.current
  );

  return (
    <div className="flex flex-col h-screen w-screen bg-[#131518] text-gray-100 overflow-hidden font-sans select-none">
      {/* Top Application Toolbar */}
      <TopToolbar
        onOpenFile={handleOpenFile}
        onExport={handleToolbarExport}
        canExport={canExportRepaired}
        exportBusy={exportBusy}
        onSelectSample={handleSelectSample}
        renderMode={renderMode}
        onSetRenderMode={handleSetRenderMode}
        lightingPreset={lightingPreset}
        onSetLightingPreset={handleSetLightingPreset}
        onFrameAll={handleFrameAll}
        onFocusSelected={handleFocusSelected}
        onFrameRawBounds={handleFrameRawBounds}
        onResetCamera={handleResetCamera}
        toggles={toggles}
        onToggleHelper={handleToggleHelper}
        explodedAmount={explodedAmount}
        onSetExplodedAmount={handleSetExplodedAmount}
        onOpenUnitTests={() => setIsTestModalOpen(true)}
        triangleCount={summary?.triangleCount || 0}
        fps={fps}
        isAnalyzing={progressiveState.topology === 'running'}
      />

      {/* Main Studio Body */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Left: Scene Tree Hierarchy */}
        <SceneTreePanel
          treeRoot={treeRoot}
          selectedUuid={selectedUuid}
          onSelectNode={handleSelectNode}
          onToggleVisibility={handleToggleVisibility}
          onIsolateNode={handleIsolateNode}
          onShowAll={handleShowAll}
          onFocusNode={handleFocusNode}
        />

        {/* Center: 3D Viewport with Drag & Drop */}
        <Viewport
          onCanvasMount={handleCanvasMount}
          onFileDrop={handleOpenFile}
          isLoading={isLoading}
          fileName={fileName}
          renderMode={renderMode}
          triangleCount={summary?.triangleCount || 0}
        />

        {/* Right: Technical Inspector & Diagnostic Panel */}
        <InspectorPanel
          summary={summary}
          healthIssues={healthIssues}
          progressiveState={progressiveState}
          materials={materials}
          textures={textures}
          selectedNode={selectedNode}
          diagnosticProfileId={diagnosticProfileId}
          onSetDiagnosticProfile={setDiagnosticProfileId}
          lightingConfig={lightingConfig}
          onUpdateLighting={handleUpdateLighting}
          onFocusIssue={handleFocusIssue}
          isIssueFocusActive={isIssueFocusActive}
          onRestoreIssueView={handleRestoreIssueView}
          healPreview={healPreview}
          healUndoState={healUndoState}
          healReport={healReport}
          healHistorical={healHistorical}
          healBusy={healBusy}
          healError={healError}
          healStorageFailed={healStorageFailed}
          exportReport={exportReport}
          exportBusy={exportBusy}
          exportError={exportError}
          canExport={canExportRepaired}
          onBuildExport={handleBuildRepairedExport}
          onDownloadExport={handleDownloadRepairedExport}
          onPreviewHeal={handlePreviewHeal}
          onCancelHealPreview={handleCancelHealPreview}
          onApplyHeal={handleApplyHeal}
          onUndoHeal={handleUndoHeal}
          onSelectMeshByUuid={handleSelectNode}
        />
      </main>

      {/* Bottom: Animation Timeline Scrubber (Rendered when clips exist) */}
      <AnimationTimeline
        clips={animationClips}
        activeClipIndex={activeClipIndex}
        onSelectClip={handleSelectClip}
        isPlaying={isPlayingAnimation}
        onTogglePlay={handleTogglePlayAnimation}
        onStop={handleStopAnimation}
        currentTime={animationTime}
        duration={animationDuration}
        onSeek={handleSeekAnimation}
        onStepFrame={handleStepFrame}
        speed={animationSpeed}
        onSetSpeed={handleSetSpeed}
        isLooping={isLoopingAnimation}
        onToggleLoop={handleToggleLoop}
      />

      {/* Topology Unit Test Verification Modal */}
      <TopologyTestModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
      />
    </div>
  );
}

export default App;
