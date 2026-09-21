# Asset Doctor — Export Repaired Copy v0.1

Status: implemented on `main`.

## Goal

Close the first complete repair lifecycle:

`Detect → Focus → Preview → Apply → Revalidate → Export → Reopen → Verify Serialized Result`

A successful Heal does **not** automatically mean a successful export.

Export has its own verification status.

## Safety model

Export is available only when all of the following are true:

- the Heal report belongs to the currently loaded asset;
- the Heal operation is `VERIFIED`;
- the full diagnostic refresh is complete;
- the operation has not been undone;
- live geometry still byte-matches the geometry captured after the verified Apply;
- the pristine source for the current asset is available.

If any condition fails, export is blocked.

## Source-of-truth strategy

Asset Doctor does not serialize the live viewport scene directly.

The viewport may contain presentation-only state:

- render-mode material overrides;
- hidden / isolated parts;
- exploded-view transforms;
- current animation pose;
- camera / helper objects.

Instead, Export Repaired Copy rebuilds from a fresh source:

### User-loaded GLB/GLTF

The original source buffer is retained in memory while that asset is open.

A fresh loader parses a new clean scene from that buffer.

### Built-in samples

The sample factory creates a new pristine sample instance.

## Applying the repair

The clean source and current repaired scene are matched by deterministic mesh traversal.

The Repair Registry declares the export patch class for the verified operation.

- `index-only`: only the repaired target index buffer is copied.
- `geometry`: the verified target geometry data is copied, including index, vertex-domain attributes, morph attributes, groups and draw range.

No viewport materials, visibility state, pose, helper objects or presentation transforms are copied.

This allows vertex compaction repairs to survive export without serializing presentation-only viewport state.

## Serialization

The clean repaired scene is serialized with Three.js `GLTFExporter` as a binary `.glb`.

Animations from the pristine source are explicitly passed to the exporter.

The original file is never overwritten.

Suggested output name:

`<original>_repaired.glb`

## Independent post-export verification

The serialized GLB is reopened with a **separate GLB loader instance**.

The reopened asset is treated as new evidence.

Verification checks include:

- total triangle count;
- repaired target triangle count;
- repaired target degenerate-triangle count;
- repaired target vertex count;
- repaired target unreferenced-vertex count;
- mesh count;
- mesh names / mesh types / vertex counts / triangle layout;
- material count and material structure;
- texture count;
- SkinnedMesh count;
- bone count and bone-name structure;
- animation clip count;
- animation names, durations and track counts.

The Download button is enabled only when the serialized result is `VERIFIED`.

## Status

### VERIFIED

The repaired GLB was serialized, reopened independently, and all protected structural checks matched.

### REGRESSION

The GLB reopened, but at least one protected check changed.

The report explains the mismatch and download remains blocked.

### FAILED

Export or independent reopening failed.

### PARTIAL

Reserved for future cases where some post-export evidence can be measured but a complete verdict is unavailable.

## Example acceptance case

Topology Diagnostic Specimen:

`38 tris → Surgical Heal → 37 tris → Export → Reopen → 37 tris, degenerates = 0`

Only after the reopened file confirms the repair is the exported copy considered verified.

## Scope limits

v0.1 intentionally does not promise byte-for-byte preservation of the original GLB container.

The exporter may rewrite glTF serialization details.

The contract is semantic preservation of the protected model structure plus the verified repair.

Unsupported/custom extensions may require additional preservation work in later versions.
