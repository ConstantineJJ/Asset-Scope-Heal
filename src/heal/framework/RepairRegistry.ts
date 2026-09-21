import type { HealthIssue, HealOperationKind } from '../../types';
import type { SurgicalHealEngine } from '../SurgicalHealEngine';
import type { RepairOperationDefinition } from './RepairOperation';
import * as THREE from 'three';

const removeDegenerateTriangles: RepairOperationDefinition = {
  kind: 'remove-degenerate-triangles',
  issueIds: ['topo-degenerate-triangles'],
  risk: 'CONDITIONAL',
  labelKey: 'repair.operations.removeDegenerateTriangles.label',
  descriptionKey: 'repair.operations.removeDegenerateTriangles.description',
  capabilities: {
    preview: true,
    apply: true,
    undo: true,
    verify: true,
    exportPatch: 'index-only',
  },
  preview: (engine, root, issue) => {
    if (!issue.meshUuid) return null;
    return engine.previewRemoveDegenerateTriangles(root, issue.meshUuid);
  },
};

const removeUnreferencedVertices: RepairOperationDefinition = {
  kind: 'remove-unreferenced-vertices',
  issueIds: ['topo-isolated-vertices'],
  risk: 'CONDITIONAL',
  labelKey: 'repair.operations.removeUnreferencedVertices.label',
  descriptionKey: 'repair.operations.removeUnreferencedVertices.description',
  capabilities: {
    preview: true,
    apply: true,
    undo: true,
    verify: true,
    exportPatch: 'geometry',
  },
  preview: (engine, root, issue) => {
    if (!issue.meshUuid) return null;
    return engine.previewRemoveUnreferencedVertices(root, issue.meshUuid);
  },
};

const recalculateNormals: RepairOperationDefinition = {
  kind: 'recalculate-normals',
  issueIds: ['normals-missing', 'normals-zero'],
  risk: 'CONDITIONAL',
  labelKey: 'repair.operations.recalculateNormals.label',
  descriptionKey: 'repair.operations.recalculateNormals.description',
  capabilities: {
    preview: true,
    apply: true,
    undo: true,
    verify: true,
    exportPatch: 'geometry',
  },
  preview: (engine, root, issue) => {
    if (!issue.meshUuid) return null;
    if (issue.id !== 'normals-missing' && issue.id !== 'normals-zero') return null;
    return engine.previewRecalculateNormals(root, issue.meshUuid, issue.id);
  },
};

const mergeExactDuplicateVertices: RepairOperationDefinition = {
  kind: 'merge-exact-duplicate-vertices',
  issueIds: ['topo-duplicate-positions'],
  risk: 'CONDITIONAL',
  labelKey: 'repair.operations.mergeExactDuplicateVertices.label',
  descriptionKey: 'repair.operations.mergeExactDuplicateVertices.description',
  capabilities: {
    preview: true,
    apply: true,
    undo: true,
    verify: true,
    exportPatch: 'geometry',
  },
  preview: (engine, root, issue) => {
    if (!issue.meshUuid) return null;
    return engine.previewMergeExactDuplicateVertices(root, issue.meshUuid);
  },
};

const OPERATIONS: readonly RepairOperationDefinition[] = [
  removeDegenerateTriangles,
  removeUnreferencedVertices,
  recalculateNormals,
  mergeExactDuplicateVertices,
];

const BY_KIND = new Map<HealOperationKind, RepairOperationDefinition>(
  OPERATIONS.map((operation) => [operation.kind, operation])
);

const BY_ISSUE = new Map<string, RepairOperationDefinition>();
for (const operation of OPERATIONS) {
  for (const issueId of operation.issueIds) {
    if (BY_ISSUE.has(issueId)) {
      throw new Error(`Duplicate repair registration for diagnostic issue: ${issueId}`);
    }
    BY_ISSUE.set(issueId, operation);
  }
}

export function listRepairOperations(): readonly RepairOperationDefinition[] {
  return OPERATIONS;
}

export function getRepairOperation(kind: HealOperationKind): RepairOperationDefinition | null {
  return BY_KIND.get(kind) ?? null;
}

export function getRepairOperationForIssue(
  issue: Pick<HealthIssue, 'id'>
): RepairOperationDefinition | null {
  return BY_ISSUE.get(issue.id) ?? null;
}

export function previewRepairIssue(
  engine: SurgicalHealEngine,
  root: THREE.Object3D,
  issue: HealthIssue
) {
  const operation = getRepairOperationForIssue(issue);
  if (!operation || !operation.capabilities.preview) return null;
  return operation.preview(engine, root, issue);
}
