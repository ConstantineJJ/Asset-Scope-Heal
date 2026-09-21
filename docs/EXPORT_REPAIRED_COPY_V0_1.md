# Asset Doctor — Export Repaired Copy v0.1

Status: implemented on `main`.

## Goal

Close the first complete repair lifecycle:

`Detect → Focus → Preview → Apply → Revalidate → Export → Reopen → Verify Serialized Result`

A successful Heal does **not** automatically mean a successful export.

Export has its own verification status.

## Safety model

Export is available only when all of the following are true:

- every active Heal report belongs to the currently loaded asset;
- every active Heal operation is `VERIFIED`;
- every active repair has a complete diagnostic refresh;
- no active repair has been undone;
- the final live geometry of every repaired mesh still matches the latest verified snapshot for that mesh;
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

A repair session may contain several verified operations across several meshes.

Asset Doctor identifies every mesh touched by the active verified session and copies the **final geometry data** for those meshes into the fresh source. Index, vertex-domain attributes, morph attributes, groups and draw range are preserved from the repaired state.

No viewport materials, visibility state, pose, helper objects or presentation transforms are copied.

This lets sequential topology, normals and skin-weight repairs survive one export without serializing presentation-only viewport state.

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
- repair operation count and repaired mesh count;
- final geometry signature of every repaired mesh;
- most recent repaired target triangle count;
- most recent repaired target degenerate-triangle count;
- most recent repaired target vertex count;
- most recent repaired target unreferenced-vertex count;
- invalid normals and invalid skin-weight counts where applicable;
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
