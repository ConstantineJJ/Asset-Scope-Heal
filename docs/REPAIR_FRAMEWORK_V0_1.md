# Asset Doctor — Repair Framework v0.1

Status: implemented on `main`.

## Goal

Repair Framework keeps diagnostics, UI and mutation logic separated.

```
Diagnostic finding
      ↓
RepairRegistry
      ↓
RepairOperationDefinition
      ↓
SurgicalHealEngine
      ↓
Preview → Apply → Verify → Undo
      ↓
Export patch
      ↓
Reopen → Verify serialized result
```

Every repair declares:

- a stable operation kind;
- diagnostic issue IDs it handles;
- risk classification;
- translation keys;
- Preview / Apply / Undo / Verify capabilities;
- export mutation class.

Supported export mutation classes:

- `index-only`
- `geometry`

## Registered operations

### Remove Degenerate Triangles

- issue: `topo-degenerate-triangles`
- mutation: `index-only`
- risk: `CONDITIONAL`

Removes only deterministically degenerate indexed faces.

### Remove Unreferenced Vertices

- issue: `topo-isolated-vertices`
- mutation: `geometry`
- risk: `CONDITIONAL`

Compacts the complete supported vertex/morph domain through one deterministic index remap.

### Recalculate Normals

- issues: `normals-missing`, `normals-zero`
- mutation: `geometry`
- risk: `CONDITIONAL`

Rebuilds missing or invalid base vertex normals while preserving topology.

Safety gates block automatic repair when tangent streams or morph-target normals would become inconsistent.

### Merge Exact Duplicate Vertices

- issue: `topo-duplicate-positions`
- mutation: `geometry`
- risk: `CONDITIONAL`

Only vertices whose complete vertex and morph attribute tuples match exactly are eligible.

Beneficial welding is allowed, but any protected topology regression blocks the operation.

### Normalize Skin Weights

- issue: `skin-invalid-sum`
- mutation: `geometry`
- risk: `CONDITIONAL`

Normalizes existing non-zero four-influence skin-weight rows to sum to 1.0 without changing bone indices.

Zero-weight vertices remain manual-only because selecting a bone influence would require guessing author intent.

## Explicit non-goals

Asset Doctor does not auto-fix conditions merely because they are detectable.

Current manual-only examples include:

- non-manifold edges;
- zero-weight skin vertices;
- missing UV unwrap;
- unused bones / sockets;
- arbitrary tiny components;
- needle triangles.

Those require either author intent or a dedicated future repair strategy with stronger evidence.

## Safety rule

Adding an operation to the registry does not make it safe.

Every operation requires:

1. a deterministic detection contract;
2. localizable evidence;
3. explicit safety gates;
4. Preview without mutation;
5. guarded Apply;
6. independent post-measurement;
7. VERIFIED / PARTIAL / REGRESSION semantics;
8. Undo;
9. export patch support;
10. independent reopen verification;
11. unit tests.

The framework standardizes the lifecycle. It never lowers the evidence threshold for a repair.
