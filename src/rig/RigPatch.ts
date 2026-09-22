export type PatchPreviewStatus = 'READY' | 'BLOCKED';
export type PatchVerificationStatus = 'VERIFIED' | 'PARTIAL' | 'REGRESSION';

export interface PatchPreview {
  id: string;
  status: PatchPreviewStatus;
  summary: string;
  reasons: string[];
}

export interface PatchVerification {
  status: PatchVerificationStatus;
  reasons: string[];
}

/**
 * Future extension point for conservative rig edits.
 * Implementations must preserve the same transaction semantics as Surgical Heal:
 * Preview -> Apply -> Verify -> Undo -> Export preservation.
 */
export interface RigPatch {
  readonly id: string;
  readonly label: string;
  preview(): PatchPreview;
  apply(): void;
  verify(): PatchVerification;
  undo(): void;
  canPreserveThroughExport(): boolean;
}
