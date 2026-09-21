import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Box,
  CheckCircle2,
  ChevronRight,
  Database,
  ExternalLink,
  Eye,
  FileText,
  Focus,
  Gauge,
  HelpCircle,
  Image,
  Info,
  Layers,
  Sliders,
  Sparkles,
  Zap,
} from 'lucide-react';
import type {
  AssetSummary,
  DiagnosticProfileId,
  HealthIssue,
  HealthSeverity,
  HealOperationReport,
  HealPreview,
  ExportVerificationReport,
  HealUndoState,
  LightingConfig,
  MaterialInfo,
  ProgressiveAnalysisState,
  SceneNodeInfo,
  TextureInfo,
} from '../types';
import { useI18n } from '../i18n';
import { getRepairOperationForIssue } from '../heal/framework/RepairRegistry';
import { HealReportPanel } from './HealReportPanel';

interface InspectorPanelProps {
  summary: AssetSummary | null;
  healthIssues: HealthIssue[];
  progressiveState: ProgressiveAnalysisState;
  materials: MaterialInfo[];
  textures: TextureInfo[];
  selectedNode: SceneNodeInfo | null;
  diagnosticProfileId: DiagnosticProfileId;
  onSetDiagnosticProfile: (profileId: DiagnosticProfileId) => void;
  lightingConfig: LightingConfig;
  onUpdateLighting: (config: Partial<LightingConfig>) => void;
  onFocusIssue: (issue: HealthIssue) => void;
  isIssueFocusActive: boolean;
  onRestoreIssueView: () => void;
  healPreview: HealPreview | null;
  healUndoState: HealUndoState;
  healReport: HealOperationReport | null;
  healHistorical: boolean;
  healBusy: boolean;
  healError: string | null;
  healStorageFailed: boolean;
  exportReport: ExportVerificationReport | null;
  exportBusy: boolean;
  exportError: string | null;
  canExport: boolean;
  onBuildExport: () => void;
  onDownloadExport: () => void;
  onPreviewHeal: (issue: HealthIssue) => void;
  onCancelHealPreview: () => void;
  onApplyHeal: () => void;
  onUndoHeal: () => void;
  onSelectMeshByUuid: (uuid: string) => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  summary,
  healthIssues,
  progressiveState,
  materials,
  textures,
  selectedNode,
  lightingConfig,
  onUpdateLighting,
  onFocusIssue,
  isIssueFocusActive,
  onRestoreIssueView,
  healPreview,
  healUndoState, healReport, healHistorical, healBusy, healError, healStorageFailed,
  exportReport, exportBusy, exportError, canExport, onBuildExport, onDownloadExport,
  onPreviewHeal,
  onCancelHealPreview,
  onApplyHeal,
  onUndoHeal,
  onSelectMeshByUuid,
}) => {
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState<
    'health' | 'summary' | 'materials' | 'skeleton' | 'performance'
  >('health');

  const [severityFilter, setSeverityFilter] = useState<HealthSeverity | 'ALL'>('ALL');
  const [locationIndexByIssue, setLocationIndexByIssue] = useState<Record<string, number>>({});

  const filteredIssues = healthIssues.filter((issue) => {
    if (severityFilter !== 'ALL' && issue.severity !== severityFilter) return false;
    return true;
  });

  const severityCounts = {
    ERROR: healthIssues.filter((i) => i.severity === 'ERROR').length,
    WARNING: healthIssues.filter((i) => i.severity === 'WARNING').length,
    INFO: healthIssues.filter((i) => i.severity === 'INFO').length,
    OK: healthIssues.filter((i) => i.severity === 'OK').length,
    NA: healthIssues.filter((i) => i.severity === 'N/A').length,
    UNKNOWN: healthIssues.filter((i) => i.severity === 'UNKNOWN').length,
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const getSeverityIcon = (severity: HealthSeverity) => {
    switch (severity) {
      case 'ERROR':
        return <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />;
      case 'WARNING':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />;
      case 'INFO':
        return <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />;
      case 'OK':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />;
      case 'N/A':
        return <HelpCircle className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />;
      case 'UNKNOWN':
        return <HelpCircle className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />;
    }
  };

  const getSeverityBadgeClass = (severity: HealthSeverity) => {
    switch (severity) {
      case 'ERROR':
        return 'bg-rose-950/60 border-rose-800 text-rose-300';
      case 'WARNING':
        return 'bg-amber-950/60 border-amber-800 text-amber-300';
      case 'INFO':
        return 'bg-sky-950/60 border-sky-800 text-sky-300';
      case 'OK':
        return 'bg-emerald-950/60 border-emerald-800 text-emerald-300';
      case 'N/A':
        return 'bg-gray-900/60 border-gray-700 text-gray-300';
      case 'UNKNOWN':
        return 'bg-violet-950/60 border-violet-800 text-violet-300';
    }
  };

  const focusIssueLocation = (issue: HealthIssue, index?: number) => {
    const locations = issue.locations ?? [];
    if (locations.length === 0) {
      onFocusIssue(issue);
      return;
    }

    const resolvedIndex = Math.min(
      Math.max(index ?? locationIndexByIssue[issue.id] ?? 0, 0),
      locations.length - 1
    );
    const location = locations[resolvedIndex];

    setLocationIndexByIssue((prev) => ({ ...prev, [issue.id]: resolvedIndex }));
    onFocusIssue({
      ...issue,
      meshUuid: location.meshUuid,
      meshName: location.meshName,
      affectedElement: location.affectedElement,
      affectedIndices: location.affectedIndices,
      focusPosition: location.focusPosition,
    });
  };

  const issueAtCurrentLocation = (issue: HealthIssue): HealthIssue => {
    const locations = issue.locations ?? [];
    if (locations.length === 0) return issue;

    const index = Math.min(
      Math.max(locationIndexByIssue[issue.id] ?? 0, 0),
      locations.length - 1
    );
    const location = locations[index];

    return {
      ...issue,
      meshUuid: location.meshUuid,
      meshName: location.meshName,
      affectedElement: location.affectedElement,
      affectedIndices: location.affectedIndices,
      focusPosition: location.focusPosition,
    };
  };

  const moveIssueLocation = (issue: HealthIssue, direction: -1 | 1) => {
    const locations = issue.locations ?? [];
    if (locations.length < 2) return;
    const current = locationIndexByIssue[issue.id] ?? 0;
    const next = (current + direction + locations.length) % locations.length;
    focusIssueLocation(issue, next);
  };

  return (
    <aside className="w-96 bg-[#16181d] border-l border-[#262932] flex flex-col h-full shrink-0 select-none text-xs text-gray-200">
      {/* Inspector Tabs */}
      <div className="h-10 px-2 border-b border-[#262932] flex items-center space-x-1 bg-[#1a1c22]">
        <button
          onClick={() => setActiveTab('health')}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition cursor-pointer ${
            activeTab === 'health'
              ? 'bg-[#252830] text-cyan-400 border border-[#373b46]'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>{t('inspector.health')}</span>
          {severityCounts.ERROR > 0 && (
            <span className="px-1 py-0.2 rounded-full bg-rose-900/80 text-rose-300 text-[10px] font-mono">
              {severityCounts.ERROR}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('summary')}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition cursor-pointer ${
            activeTab === 'summary'
              ? 'bg-[#252830] text-cyan-400 border border-[#373b46]'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>{t('inspector.summary')}</span>
        </button>

        <button
          onClick={() => setActiveTab('materials')}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition cursor-pointer ${
            activeTab === 'materials'
              ? 'bg-[#252830] text-cyan-400 border border-[#373b46]'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Image className="w-3.5 h-3.5" />
          <span>{t('inspector.materials')}</span>
        </button>

        <button
          onClick={() => setActiveTab('skeleton')}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition cursor-pointer ${
            activeTab === 'skeleton'
              ? 'bg-[#252830] text-cyan-400 border border-[#373b46]'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>{t('inspector.rig')}</span>
        </button>

        <button
          onClick={() => setActiveTab('performance')}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition cursor-pointer ${
            activeTab === 'performance'
              ? 'bg-[#252830] text-cyan-400 border border-[#373b46]'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Gauge className="w-3.5 h-3.5" />
          <span>Perf</span>
        </button>
      </div>

      {/* TAB 1: ASSET HEALTH & DETERMINISTIC DIAGNOSTICS */}
      {activeTab === 'health' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
          {/* Health stays model-centric: report quality filters live below. */}
          <HealReportPanel
            report={healReport}
            historical={healHistorical}
            busy={healBusy}
            error={healError}
            storageFailed={healStorageFailed}
            undoState={healUndoState}
            onUndo={onUndoHeal}
            exportReport={exportReport}
            exportBusy={exportBusy}
            exportError={exportError}
            canExport={canExport}
            onBuildExport={onBuildExport}
            onDownloadExport={onDownloadExport}
          />
          {!healReport && healError && <p role="alert" className="text-xs text-rose-300">{healError}</p>}

          {/* Progressive Analysis Pipeline Tracker */}
          <div className="bg-[#1c1e24] border border-[#2d313a] rounded p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-gray-300">
              <span className="uppercase tracking-wider">Analysis Pipeline</span>
              <span className="font-mono text-cyan-400">
                {progressiveState.topology === 'running' ? 'Active' : 'Complete'}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 pt-1 text-[10px] font-mono">
              <div className="flex items-center space-x-1 px-1.5 py-1 rounded bg-[#16181d] border border-[#272a32]">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    progressiveState.geometry === 'done' ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'
                  }`}
                />
                <span className="text-gray-300 truncate">Geom</span>
              </div>
              <div className="flex items-center space-x-1 px-1.5 py-1 rounded bg-[#16181d] border border-[#272a32]">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    progressiveState.materials === 'done' ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                <span className="text-gray-300 truncate">Mat</span>
              </div>
              <div className="flex items-center space-x-1 px-1.5 py-1 rounded bg-[#16181d] border border-[#272a32]">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    progressiveState.skeleton === 'done' ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                <span className="text-gray-300 truncate">Rig</span>
              </div>
              <div className="flex items-center space-x-1 px-1.5 py-1 rounded bg-[#16181d] border border-[#272a32]">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    progressiveState.topology === 'done'
                      ? 'bg-emerald-400'
                      : progressiveState.topology === 'running'
                      ? 'bg-blue-400 animate-ping'
                      : 'bg-gray-400'
                  }`}
                />
                <span className="text-gray-300 truncate">Topology</span>
              </div>
            </div>
          </div>

          {/* Severity Counters Bar */}
          <div className="grid grid-cols-4 gap-1.5">
            <button
              onClick={() => setSeverityFilter(severityFilter === 'ERROR' ? 'ALL' : 'ERROR')}
              className={`p-2 rounded border flex flex-col items-center transition cursor-pointer ${
                severityFilter === 'ERROR'
                  ? 'bg-rose-950/70 border-rose-600 text-rose-200'
                  : 'bg-[#1e2026] border-[#2e313b] text-rose-400 hover:border-rose-800'
              }`}
            >
              <span className="text-base font-bold font-mono">{severityCounts.ERROR}</span>
              <span className="text-[10px] uppercase font-semibold">{t('inspector.errors')}</span>
            </button>

            <button
              onClick={() => setSeverityFilter(severityFilter === 'WARNING' ? 'ALL' : 'WARNING')}
              className={`p-2 rounded border flex flex-col items-center transition cursor-pointer ${
                severityFilter === 'WARNING'
                  ? 'bg-amber-950/70 border-amber-600 text-amber-200'
                  : 'bg-[#1e2026] border-[#2e313b] text-amber-400 hover:border-amber-800'
              }`}
            >
              <span className="text-base font-bold font-mono">{severityCounts.WARNING}</span>
              <span className="text-[10px] uppercase font-semibold">{t('inspector.warnings')}</span>
            </button>

            <button
              onClick={() => setSeverityFilter(severityFilter === 'INFO' ? 'ALL' : 'INFO')}
              className={`p-2 rounded border flex flex-col items-center transition cursor-pointer ${
                severityFilter === 'INFO'
                  ? 'bg-sky-950/70 border-sky-600 text-sky-200'
                  : 'bg-[#1e2026] border-[#2e313b] text-sky-400 hover:border-sky-800'
              }`}
            >
              <span className="text-base font-bold font-mono">{severityCounts.INFO}</span>
              <span className="text-[10px] uppercase font-semibold">{t('inspector.info')}</span>
            </button>

            <button
              onClick={() => setSeverityFilter(severityFilter === 'OK' ? 'ALL' : 'OK')}
              className={`p-2 rounded border flex flex-col items-center transition cursor-pointer ${
                severityFilter === 'OK'
                  ? 'bg-emerald-950/70 border-emerald-600 text-emerald-200'
                  : 'bg-[#1e2026] border-[#2e313b] text-emerald-400 hover:border-emerald-800'
              }`}
            >
              <span className="text-base font-bold font-mono">{severityCounts.OK}</span>
              <span className="text-[10px] uppercase font-semibold">{t('inspector.passed')}</span>
            </button>
          </div>

          {/* Diagnostic Issues List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1">
              <div className="flex items-center gap-2">
                <span>{filteredIssues.length} {t('inspector.diagnosticRules')}</span>
                {isIssueFocusActive && (
                  <button
                    onClick={onRestoreIssueView}
                    className="px-1.5 py-0.5 rounded border border-[#38404c] bg-[#20232a] text-gray-300 hover:text-white hover:border-cyan-700 cursor-pointer"
                  >
                    {t('inspector.backToView')}
                  </button>
                )}
              </div>
              {severityFilter !== 'ALL' && (
                <button
                  onClick={() => setSeverityFilter('ALL')}
                  className="text-cyan-400 hover:underline cursor-pointer text-[10px]"
                >
                  {t('inspector.clearFilters')}
                </button>
              )}
            </div>

            {filteredIssues.map((issue) => (
              <div
                key={issue.id}
                className="bg-[#1c1e24] border border-[#2c3039] rounded p-2.5 flex flex-col space-y-1.5 hover:border-[#3d4250] transition"
              >
                <div className="flex items-start justify-between space-x-2">
                  <div className="flex items-start space-x-2">
                    {getSeverityIcon(issue.severity)}
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span
                          className={`px-1.5 py-0.2 text-[9px] font-bold rounded border uppercase font-mono ${getSeverityBadgeClass(
                            issue.severity
                          )}`}
                        >
                          {issue.severity}
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono">
                          [{issue.category}]
                        </span>
                        <span className="text-[9px] text-cyan-300/80 font-mono uppercase">
                          {issue.layer ?? 'Health'}
                        </span>
                      </div>
                      <h4 className="font-semibold text-gray-100 mt-0.5">{issue.title}</h4>
                    </div>
                  </div>

                  {(issue.focusPosition || issue.meshUuid) && (
                    <button
                      onClick={() => focusIssueLocation(issue)}
                      className="px-2 py-1 rounded bg-[#272b34] hover:bg-[#323642] text-cyan-400 hover:text-cyan-300 font-medium text-[10px] flex items-center space-x-1 cursor-pointer shrink-0"
                      title="Move viewport camera to affected coordinates"
                    >
                      <Focus className="w-3 h-3" />
                      <span>{t('inspector.focus')}</span>
                    </button>
                  )}
                </div>

                <p className="text-gray-300 text-[11px] leading-relaxed pl-6">
                  {issue.description}
                </p>

                {issue.technicalDetails && (
                  <div className="ml-6 p-1.5 rounded bg-[#15171c] border border-[#242730] font-mono text-[10px] text-gray-400">
                    {issue.technicalDetails}
                  </div>
                )}

                {(issue.evidence || issue.suggestedAction || issue.repairability) && (
                  <div className="ml-6 pt-1.5 border-t border-[#262932] space-y-1 text-[10px]">
                    {(issue.meshName || issue.affectedIndices?.length) && (
                      <div>
                        <span className="text-gray-500">{t('inspector.location')}:</span>{' '}
                        <span className="text-cyan-200">
                          {issue.meshName ?? 'Affected mesh'}
                          {issue.affectedElement ? ` · ${issue.affectedElement}` : ''}
                          {issue.affectedIndices?.length
                            ? ` [${issue.affectedIndices.slice(0, 8).join(', ')}${issue.affectedIndices.length > 8 ? ', …' : ''}]`
                            : ''}
                        </span>
                      </div>
                    )}
                    {(issue.locations?.length ?? 0) > 1 && (
                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          onClick={() => moveIssueLocation(issue, -1)}
                          className="px-1.5 py-0.5 rounded bg-[#20232a] border border-[#343845] text-gray-300 hover:text-cyan-300 cursor-pointer"
                        >
                          ← {t('inspector.previous')}
                        </button>
                        <span className="font-mono text-gray-500">
                          {(locationIndexByIssue[issue.id] ?? 0) + 1}/{issue.locations!.length}
                        </span>
                        <button
                          onClick={() => moveIssueLocation(issue, 1)}
                          className="px-1.5 py-0.5 rounded bg-[#20232a] border border-[#343845] text-gray-300 hover:text-cyan-300 cursor-pointer"
                        >
                          {t('inspector.nextIssue')} →
                        </button>
                      </div>
                    )}
                    {issue.evidence && (
                      <div><span className="text-gray-500">{t('inspector.evidence')}:</span> <span className="text-gray-300">{issue.evidence}</span></div>
                    )}
                    {issue.whyItMatters && issue.whyItMatters !== issue.description && (
                      <div><span className="text-gray-500">{t('inspector.why')}:</span> <span className="text-gray-300">{issue.whyItMatters}</span></div>
                    )}
                    {issue.suggestedAction && (
                      <div><span className="text-gray-500">{t('inspector.next')}:</span> <span className="text-gray-300">{issue.suggestedAction}</span></div>
                    )}
                    {issue.repairability && issue.repairability !== 'NONE' && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-[#15171c] border border-[#343845] text-amber-300 font-mono uppercase">
                          {t('inspector.repair')}: {issue.repairability}
                        </span>
                        {getRepairOperationForIssue(issue) && issue.meshUuid && (
                          <button
                            disabled={healBusy}
                            onClick={() => onPreviewHeal(issueAtCurrentLocation(issue))}
                            className="px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-800 text-amber-300 hover:text-amber-100 hover:bg-amber-950/70 cursor-pointer"
                            title={t(getRepairOperationForIssue(issue)!.descriptionKey)}
                          >
                            {t('heal.previewFix')}
                          </button>
                        )}
                      </div>
                    )}

                    {healPreview &&
                      healPreview.issueId === issue.id &&
                      healPreview.meshUuid === issueAtCurrentLocation(issue).meshUuid && (
                        <div className="mt-2 p-2 rounded border border-amber-900/70 bg-[#17181c] space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-amber-300 uppercase tracking-wider text-[9px]">
                              {t('heal.previewTitle')}
                            </span>
                            <span className={`font-mono text-[9px] ${
                              healPreview.status === 'READY' ? 'text-emerald-400' : 'text-rose-400'
                            }`}>
                              {healPreview.status}
                            </span>
                          </div>

                          {healPreview.status === 'READY' ? (
                            <>
                              <div className="grid grid-cols-2 gap-1 text-[10px]">
                                <div className="p-1 rounded bg-[#121418] border border-[#262932]">
                                  <span className="text-gray-500 block">
                                    {t(
                                      healPreview.metric === 'vertices'
                                        ? 'heal.metrics.vertexCount'
                                        : healPreview.metric === 'normals'
                                          ? 'heal.metrics.invalidNormals'
                                          : healPreview.metric === 'duplicates'
                                            ? 'heal.metrics.potentialDuplicatePositions'
                                            : 'heal.metrics.triangleCount'
                                    )}
                                  </span>
                                  <span className="font-mono text-gray-200">
                                    {healPreview.metricBefore} → {healPreview.metricAfter}
                                  </span>
                                </div>
                                <div className="p-1 rounded bg-[#121418] border border-[#262932]">
                                  <span className="text-gray-500 block">
                                    {t(healPreview.metric === 'normals' ? 'heal.fix' : 'heal.remove')}
                                  </span>
                                  <span className="font-mono text-amber-300">
                                    {healPreview.affectedCount}
                                  </span>
                                </div>
                                <div className="p-1 rounded bg-[#121418] border border-[#262932]">
                                  <span className="text-gray-500 block">{t('heal.boundaryEdges')}</span>
                                  <span className="font-mono text-gray-200">
                                    {healPreview.boundaryEdgesBefore} → {healPreview.boundaryEdgesAfter}
                                  </span>
                                </div>
                                <div className="p-1 rounded bg-[#121418] border border-[#262932]">
                                  <span className="text-gray-500 block">{t('heal.nonManifoldEdges')}</span>
                                  <span className="font-mono text-gray-200">
                                    {healPreview.nonManifoldEdgesBefore} → {healPreview.nonManifoldEdgesAfter}
                                  </span>
                                </div>
                              </div>
                              <div className="text-[9px] text-amber-200/80">
                                {t('heal.conditionalWarning')}
                              </div>
                              <div className="flex items-center gap-1.5 pt-1">
                                <button
                                  disabled={healBusy}
                                  onClick={onApplyHeal}
                                  className="px-2 py-1 rounded bg-amber-700 hover:bg-amber-600 text-white font-medium cursor-pointer"
                                >
                                  {t('heal.apply')}
                                </button>
                                <button
                                  onClick={onCancelHealPreview}
                                  className="px-2 py-1 rounded bg-[#242730] border border-[#343845] text-gray-300 hover:text-white cursor-pointer"
                                >
                                  {t('heal.cancel')}
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-[10px] text-rose-300">
                                {healPreview.reasonKey ? t(healPreview.reasonKey) : healPreview.reason || t('heal.blocked')}
                              </div>
                              <button
                                onClick={onCancelHealPreview}
                                className="px-2 py-1 rounded bg-[#242730] border border-[#343845] text-gray-300 hover:text-white cursor-pointer"
                              >
                                {t('heal.closePreview')}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: SUMMARY & GEOMETRY METRICS */}
      {activeTab === 'summary' && summary && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
          {/* File Card */}
          <div className="bg-[#1c1e24] border border-[#2d313a] rounded p-2.5 space-y-2">
            <h4 className="font-semibold text-gray-200 uppercase tracking-wider text-[10px] text-cyan-400">
              File Details
            </h4>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-gray-400 block text-[10px]">Name:</span>
                <span className="font-medium truncate block" title={summary.fileName}>
                  {summary.fileName}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">File Size:</span>
                <span className="font-mono font-medium">{formatBytes(summary.fileSizeBytes)}</span>
              </div>
            </div>
          </div>

          {/* Scene Topology Counts */}
          <div className="bg-[#1c1e24] border border-[#2d313a] rounded p-2.5 space-y-2">
            <h4 className="font-semibold text-gray-200 uppercase tracking-wider text-[10px] text-cyan-400">
              Geometry Breakdown
            </h4>
            <div className="grid grid-cols-2 gap-y-2 text-[11px]">
              <div>
                <span className="text-gray-400 block text-[10px]">Triangles:</span>
                <span className="font-mono font-bold text-gray-100 text-sm">
                  {summary.triangleCount.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">Vertices:</span>
                <span className="font-mono font-bold text-gray-100 text-sm">
                  {summary.vertexCount.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">Indexed Vertices:</span>
                <span className="font-mono text-gray-300">
                  {summary.indexedVertexCount.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">Mesh Primitives:</span>
                <span className="font-mono text-gray-300">{summary.primitiveCount}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">Hierarchy Nodes:</span>
                <span className="font-mono text-gray-300">{summary.nodeCount}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">Meshes:</span>
                <span className="font-mono text-gray-300">{summary.meshCount}</span>
              </div>
            </div>
          </div>

          {/* Bounding Box Information */}
          <div className="bg-[#1c1e24] border border-[#2d313a] rounded p-2.5 space-y-2">
            <h4 className="font-semibold text-gray-200 uppercase tracking-wider text-[10px] text-cyan-400">
              Dimensions & Bounding Box
            </h4>
            <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
              <div className="p-1.5 rounded bg-[#16181d] border border-[#272a32]">
                <span className="text-gray-400 block text-[9px] uppercase">Width (X)</span>
                <span className="text-gray-200 font-medium">
                  {summary.boundingBox.size[0].toFixed(3)} m
                </span>
              </div>
              <div className="p-1.5 rounded bg-[#16181d] border border-[#272a32]">
                <span className="text-gray-400 block text-[9px] uppercase">Height (Y)</span>
                <span className="text-gray-200 font-medium">
                  {summary.boundingBox.size[1].toFixed(3)} m
                </span>
              </div>
              <div className="p-1.5 rounded bg-[#16181d] border border-[#272a32]">
                <span className="text-gray-400 block text-[9px] uppercase">Depth (Z)</span>
                <span className="text-gray-200 font-medium">
                  {summary.boundingBox.size[2].toFixed(3)} m
                </span>
              </div>
            </div>
            <div className="text-[10px] font-mono text-gray-400 pt-1">
              Center: [{summary.boundingBox.center.map((c) => c.toFixed(2)).join(', ')}] | Diagonal:{' '}
              {summary.boundingBox.diagonal.toFixed(2)} m
            </div>
          </div>

          {/* Selected Mesh Stats if active */}
          {selectedNode && selectedNode.type === 'Mesh' && (
            <div className="bg-[#1c1e24] border border-blue-800/60 rounded p-2.5 space-y-2">
              <h4 className="font-semibold text-blue-400 uppercase tracking-wider text-[10px]">
                Selected Mesh: {selectedNode.name}
              </h4>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-gray-400 block text-[10px]">Triangles:</span>
                  <span className="font-mono font-medium">
                    {selectedNode.triangleCount.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">Vertices:</span>
                  <span className="font-mono font-medium">
                    {selectedNode.vertexCount.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MATERIALS & TEXTURES */}
      {activeTab === 'materials' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
          {/* Materials Section */}
          <div className="space-y-2">
            <h4 className="font-semibold text-gray-300 uppercase tracking-wider text-[10px] flex items-center justify-between">
              <span>Materials ({materials.length})</span>
            </h4>
            {materials.map((m) => (
              <div
                key={m.uuid}
                className="bg-[#1c1e24] border border-[#2c3039] rounded p-2.5 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span
                      className="w-4 h-4 rounded border border-[#3e4350] shrink-0"
                      style={{ backgroundColor: m.baseColorHex }}
                    />
                    <span className="font-semibold text-gray-100">{m.name}</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#16181d] text-gray-400">
                    {m.alphaMode}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono text-gray-300">
                  <div className="p-1 rounded bg-[#15171d] border border-[#252832]">
                    <span className="text-gray-400 block">Metal:</span>
                    <span>{m.metallic.toFixed(2)}</span>
                  </div>
                  <div className="p-1 rounded bg-[#15171d] border border-[#252832]">
                    <span className="text-gray-400 block">Rough:</span>
                    <span>{m.roughness.toFixed(2)}</span>
                  </div>
                  <div className="p-1 rounded bg-[#15171d] border border-[#252832]">
                    <span className="text-gray-400 block">Opacity:</span>
                    <span>{m.opacity.toFixed(2)}</span>
                  </div>
                </div>

                {/* Slots */}
                <div className="text-[10px] text-gray-400 space-y-0.5 pt-1 border-t border-[#262932]">
                  <div>Maps:</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(m.textureSlots).map(([slot, name]) => (
                      <span
                        key={slot}
                        className="px-1.5 py-0.5 rounded bg-[#242730] text-gray-300 font-mono text-[9px]"
                      >
                        {slot}: {name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Textures Section */}
          <div className="space-y-2 pt-2">
            <h4 className="font-semibold text-gray-300 uppercase tracking-wider text-[10px]">
              Textures ({textures.length})
            </h4>
            {textures.map((t) => (
              <div
                key={t.uuid}
                className="bg-[#1c1e24] border border-[#2c3039] rounded p-2 space-y-1 text-[11px]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-200">{t.name}</span>
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                      t.width > 4096 || t.height > 4096
                        ? 'bg-rose-950 text-rose-300 border border-rose-800'
                        : 'bg-[#16181d] text-cyan-400'
                    }`}
                  >
                    {t.width} × {t.height}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
                  <span>Format: {t.format}</span>
                  <span>Est. VRAM: {formatBytes(t.uncompressedBytesEstimate)}</span>
                </div>
              </div>
            ))}
            {textures.length === 0 && (
              <div className="text-gray-400 text-center py-4">No embedded textures detected.</div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: SKELETON & RIGGING */}
      {activeTab === 'skeleton' && summary && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
          <div className="bg-[#1c1e24] border border-[#2d313a] rounded p-2.5 space-y-2">
            <h4 className="font-semibold text-gray-200 uppercase tracking-wider text-[10px] text-cyan-400">
              Rigging Summary
            </h4>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-gray-400 block text-[10px]">Skeletons:</span>
                <span className="font-mono font-bold text-gray-100">{summary.skeletonCount}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">Bones:</span>
                <span className="font-mono font-bold text-gray-100">{summary.boneCount}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">Skinned Meshes:</span>
                <span className="font-mono text-gray-300">{summary.skinnedMeshCount}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">Animation Clips:</span>
                <span className="font-mono text-gray-300">{summary.clipCount}</span>
              </div>
            </div>
          </div>

          {summary.clips && summary.clips.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="font-semibold text-gray-300 uppercase tracking-wider text-[10px]">
                Clips & Root Motion
              </h4>
              {summary.clips.map((clip) => (
                <div
                  key={clip.name}
                  className="p-2 rounded bg-[#1c1e24] border border-[#2c3039] space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-100">{clip.name}</span>
                    <span className="text-gray-400 font-mono text-[10px]">
                      {clip.duration.toFixed(2)}s
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-[10px] font-mono">
                    <span
                      className={`px-1.5 py-0.5 rounded ${
                        clip.rootMotionDetected
                          ? 'bg-purple-950/70 border border-purple-800 text-purple-300'
                          : 'bg-[#16181d] text-gray-400'
                      }`}
                    >
                      {clip.rootMotionDetected
                        ? `ROOT TRANSLATION: ${clip.rootMotionTranslation}m`
                        : 'NO SIGNIFICANT ROOT MOTION'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: PERFORMANCE & LIGHTING */}
      {activeTab === 'performance' && summary && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
          {/* Runtime Characteristics */}
          <div className="bg-[#1c1e24] border border-[#2d313a] rounded p-2.5 space-y-2">
            <h4 className="font-semibold text-gray-200 uppercase tracking-wider text-[10px] text-cyan-400">
              Runtime Footprint
            </h4>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-gray-400 block text-[10px]">Estimated Draw Calls:</span>
                <span className="font-mono font-bold text-gray-100">
                  ~{summary.primitiveCount || summary.meshCount}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">Total Triangles:</span>
                <span className="font-mono font-bold text-gray-100">
                  {summary.triangleCount.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Lighting Fine Tuning */}
          <div className="bg-[#1c1e24] border border-[#2d313a] rounded p-2.5 space-y-2.5">
            <h4 className="font-semibold text-gray-200 uppercase tracking-wider text-[10px] text-cyan-400">
              Lighting Studio Controls
            </h4>

            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-400">Exposure:</span>
                <span className="font-mono">{lightingConfig.exposure.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="3.0"
                step="0.05"
                value={lightingConfig.exposure}
                onChange={(e) => onUpdateLighting({ exposure: Number(e.target.value) })}
                className="w-full h-1 accent-cyan-400 cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-400">Key Light:</span>
                <span className="font-mono">{lightingConfig.keyIntensity.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="3.5"
                step="0.1"
                value={lightingConfig.keyIntensity}
                onChange={(e) => onUpdateLighting({ keyIntensity: Number(e.target.value) })}
                className="w-full h-1 accent-blue-400 cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-400">Fill Light:</span>
                <span className="font-mono">{lightingConfig.fillIntensity.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="2.0"
                step="0.05"
                value={lightingConfig.fillIntensity}
                onChange={(e) => onUpdateLighting({ fillIntensity: Number(e.target.value) })}
                className="w-full h-1 accent-blue-400 cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-400">Rim Light:</span>
                <span className="font-mono">{lightingConfig.rimIntensity.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="3.0"
                step="0.1"
                value={lightingConfig.rimIntensity}
                onChange={(e) => onUpdateLighting({ rimIntensity: Number(e.target.value) })}
                className="w-full h-1 accent-blue-400 cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
