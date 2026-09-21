# Asset Doctor — Built-in Test Patient

Asset Doctor ships with one deterministic procedural test asset:

`Asset Doctor Test Patient`

The previous demo samples were removed. This asset exists for repeatable diagnostic, repair, Undo, export and reopen testing rather than visual showcase.

## Repairable findings

### `Repair_Target_Degenerate_And_Loose_Vertices`

Contains:

- 1 degenerate triangle;
- at least 1 needle / thin triangle;
- 2 unreferenced vertices before repair.

Expected sequential repair:

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

### `Repair_Target_Exact_Duplicate_Vertices`

Contains duplicated shared-edge vertices with exactly matching:

- position;
- normal;
- UV.

The guarded Exact Duplicate operation can weld these tuples because every protected vertex-domain attribute matches. The expected result is fewer vertices and improved connectivity without topology regression.

### `Repair_Target_Zero_Normals`

Contains valid topology with an intentionally zeroed normal stream.

`Recalculate Normals` should replace it with a valid normal attribute while preserving topology.

### `Repair_Target_Missing_Normals`

Contains valid topology and UVs but no normal attribute.

`Recalculate Normals` should create the missing stream.

### `Rig_Control_SkinnedMesh`

Contains:

- a small Skeleton;
- standard `skinIndex` / `skinWeight` streams;
- two deliberately non-normalized but non-zero skin-weight rows;
- one intentionally unused locator bone;
- one animation clip: `Diagnostic_Bone_Sway`.

`Normalize Skin Weights` should normalize only the non-zero weight rows. It must never invent influences for zero-weight vertices.

## Manual / diagnostic-only findings

### `Manual_Control_NonManifold_Edge`

Three faces deliberately share one edge.

This remains diagnostic-only. There is no universal safe automatic repair because the intended surface topology is ambiguous.

Other conditions intentionally remain manual when evidence is insufficient, including:

- zero-weight skin vertices;
- missing UV unwrap;
- unused bones / locator bones;
- arbitrary tiny components;
- needle triangles;
- non-manifold topology.

## Purpose

The Test Patient proves that Asset Doctor can:

1. detect known defects;
2. offer repairs only where a registered surgical operation exists;
3. preserve unresolved manual-only findings;
4. perform sequential repairs safely;
5. verify before / after measurements;
6. Undo the last operation;
7. export repaired geometry;
8. reopen and verify the serialized GLB;
9. preserve rig and animation structure.

Automated tests lock the expected findings so changes to the specimen cannot silently invalidate manual regression testing.
