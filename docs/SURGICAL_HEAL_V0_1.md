# Asset Doctor — Surgical Heal v0.1

Status: implemented on `main`.

Follow-up: [Surgical Heal v0.2](SURGICAL_HEAL_V0_2.md) adds measured postconditions,
verification statuses, a persistent audit report, and stronger Apply/Undo guards.

## Goal

Introduce the first complete surgical repair transaction:

`Detect → Focus → Preview → Apply → Revalidate → Undo`

The first supported operation is deliberately narrow:

**Remove Degenerate Triangles**

This is classified as `CONDITIONAL`, not `SAFE`.

## Non-destructive model

The original GLB/GLTF file is never modified.

Repairs operate only on the in-memory Three.js asset.

A future export step will be explicit.

## Preview

Before any mutation, Asset Doctor computes:

- target mesh;
- degenerate triangle count;
- triangle count before / after;
- boundary-edge count before / after;
- non-manifold-edge count before / after.

The user must explicitly choose **Apply**.

Preview itself does not change the mesh.

## Apply

v0.1 removes degenerate faces by rebuilding only the mesh index buffer.

It does not rewrite:

- vertex positions;
- UVs;
- normals;
- skin weights;
- bone indices;
- materials;
- textures.

After Apply, Asset Doctor reruns the diagnostic pipeline so the result is measured again instead of assumed.

## Undo

The previous index buffer is retained in memory.

Undo restores it and then reruns diagnostics.

## Safety gates

Automatic repair is blocked when the target:

- is non-indexed geometry;
- uses material groups;
- uses a custom draw range;
- shares the same BufferGeometry with multiple meshes;
- uses an unsupported index-buffer type;
- changed after Preview.

These restrictions are intentional.

Asset Doctor prefers refusing a repair over performing one whose consequences are not understood.

## UI

A localizable `Degenerate triangles` finding can expose:

`Preview Fix`

The preview reports topology consequences before Apply.

After a successful operation, a small **Last Surgical Heal** panel exposes Undo even if the original warning disappears after revalidation.

## Scope

v0.1 does not attempt:

- non-manifold repair;
- hole closing;
- vertex welding;
- UV repair;
- retopology;
- normal reconstruction;
- bone deletion;
- automatic optimization.

Those require separate surgical operations with their own safety contracts.

## Tests

The Asset Doctor Unit Test Suite includes:

1. Surgical Heal Preview Test
2. Surgical Heal Apply + Undo Test
3. Surgical Heal Safety Gate Test

These use isolated synthetic meshes and do not touch the active viewport scene.
