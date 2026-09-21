# Asset Doctor — Built-in Test Patient

Asset Doctor now ships with one deterministic procedural test asset:

`Asset Doctor Test Patient`

The previous three demo samples were removed. The built-in asset is intentionally designed for regression testing of diagnostics and Surgical Heal rather than as a showcase model.

## Included findings

### Repairable

`Repair_Target_Degenerate_And_Loose_Vertices`

Contains:

- 1 degenerate triangle;
- at least 1 needle / thin triangle;
- 2 unreferenced vertices before any repair.

After `Remove Degenerate Triangles`, the removed face leaves three additional vertices unreferenced, producing a deterministic second-stage test for `Remove Unreferenced Vertices`.

Expected sequence:

```
Initial
degenerate triangles = 1
unreferenced vertices = 2

Remove Degenerate Triangles
degenerate triangles = 0
unreferenced vertices = 5

Remove Unreferenced Vertices
degenerate triangles = 0
unreferenced vertices = 0
triangle count unchanged by vertex cleanup
```

### Manual / diagnostic-only

`Manual_Control_NonManifold_Edge`

Contains three faces sharing one edge. This remains diagnostic-only until a dedicated non-manifold repair operation is implemented.

`Manual_Control_Zero_Normals`

Contains valid triangle topology with an intentionally zeroed normal stream. This is useful for testing normals diagnostics without pretending that a repair exists yet.

### Rig / animation control

`Rig_Control_SkinnedMesh`

Contains:

- a small Skeleton;
- skinIndex / skinWeight streams;
- one intentionally unused locator bone;
- one animation clip: `Diagnostic_Bone_Sway`.

This keeps rig, skinning and animation inspection testable while using only one built-in asset.

## Purpose

The test patient is not meant to represent a production-ready model.

It is a deterministic specimen used to prove that Asset Doctor:

1. detects known defects;
2. offers repairs only where a registered repair exists;
3. preserves unresolved diagnostic-only findings;
4. performs sequential repair safely;
5. verifies Undo;
6. exports repaired geometry;
7. reopens and verifies the serialized GLB;
8. continues to preserve rig and animation structure.

A unit test locks the expected findings so accidental changes to the sample cannot silently invalidate manual regression testing.
