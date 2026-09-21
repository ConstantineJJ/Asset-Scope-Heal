import * as THREE from 'three';
import type {
  HealthIssue,
  HealOperationKind,
  HealPreview,
  Repairability,
} from '../../types';
import type { SurgicalHealEngine } from '../SurgicalHealEngine';

export type RepairExportPatchKind = 'index-only' | 'geometry';

export interface RepairOperationCapabilities {
  preview: boolean;
  apply: boolean;
  undo: boolean;
  verify: boolean;
  exportPatch: RepairExportPatchKind;
}

export interface RepairOperationDefinition {
  kind: HealOperationKind;
  issueIds: readonly string[];
  risk: Exclude<Repairability, 'NONE' | 'MANUAL'>;
  labelKey: string;
  descriptionKey: string;
  capabilities: RepairOperationCapabilities;
  preview: (
    engine: SurgicalHealEngine,
    root: THREE.Object3D,
    issue: HealthIssue
  ) => HealPreview | null;
}

/**
 * The framework contract is intentionally operation-centric.
 *
 * UI and App code should discover repairs through the registry instead of
 * hard-coding diagnostic issue IDs. SurgicalHealEngine remains the transaction
 * authority for Apply / Verify / Undo until more mutation types are introduced.
 */
