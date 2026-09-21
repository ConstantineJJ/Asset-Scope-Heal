import type { HealthIssue, HealthSeverity, HealOperationKind } from '../types';
import { getRepairOperationForIssue } from './framework/RepairRegistry';

export interface RepairQueueCandidate {
  key: string;
  operation: HealOperationKind;
  issue: HealthIssue;
  meshUuid: string;
  meshName: string;
}

const operationPriority: Record<HealOperationKind, number> = {
  'remove-degenerate-triangles': 10,
  'remove-unreferenced-vertices': 20,
  'recalculate-normals': 30,
  'normalize-skin-weights': 40,
  'merge-exact-duplicate-vertices': 50,
};

const severityPriority: Record<HealthSeverity, number> = {
  ERROR: 0,
  WARNING: 1,
  INFO: 2,
  UNKNOWN: 3,
  'N/A': 4,
  OK: 5,
};

/**
 * Build a deterministic queue of repairable findings.
 *
 * One candidate is emitted per operation + mesh because every registered
 * operation repairs all matching findings on its target mesh in one transaction.
 * Manual-only findings never enter this queue because they have no registry entry.
 */
export function buildRepairQueueCandidates(issues: HealthIssue[]): RepairQueueCandidate[] {
  const unique = new Map<string, RepairQueueCandidate>();

  for (const issue of issues) {
    if (issue.severity === 'OK' || issue.severity === 'N/A') continue;

    const operation = getRepairOperationForIssue(issue);
    if (!operation || !operation.capabilities.preview || !operation.capabilities.apply) continue;

    const locations = issue.locations?.length ? issue.locations : [null];
    for (const location of locations) {
      const candidateIssue: HealthIssue = location
        ? {
            ...issue,
            meshUuid: location.meshUuid,
            meshName: location.meshName,
            affectedElement: location.affectedElement,
            affectedIndices: location.affectedIndices,
            focusPosition: location.focusPosition,
          }
        : issue;

      if (!candidateIssue.meshUuid) continue;
      const key = `${operation.kind}:${candidateIssue.meshUuid}`;
      if (unique.has(key)) continue;

      unique.set(key, {
        key,
        operation: operation.kind,
        issue: candidateIssue,
        meshUuid: candidateIssue.meshUuid,
        meshName: candidateIssue.meshName ?? 'Unnamed Mesh',
      });
    }
  }

  return Array.from(unique.values()).sort((a, b) => {
    const operationDelta = operationPriority[a.operation] - operationPriority[b.operation];
    if (operationDelta !== 0) return operationDelta;

    const severityDelta = severityPriority[a.issue.severity] - severityPriority[b.issue.severity];
    if (severityDelta !== 0) return severityDelta;

    const meshDelta = a.meshName.localeCompare(b.meshName);
    if (meshDelta !== 0) return meshDelta;
    return a.key.localeCompare(b.key);
  });
}
