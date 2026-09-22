import type { PatchPreview, PatchVerification } from '../rig/RigPatch';

/**
 * Future extension point for conservative animation edits.
 * No AnimationPatch should ship unless export/reopen verification can prove
 * that the edited clip data survives serialization unchanged except for the
 * intended patch.
 */
export interface AnimationPatch {
  readonly id: string;
  readonly label: string;
  preview(): PatchPreview;
  apply(): void;
  verify(): PatchVerification;
  undo(): void;
  canPreserveThroughExport(): boolean;
}
