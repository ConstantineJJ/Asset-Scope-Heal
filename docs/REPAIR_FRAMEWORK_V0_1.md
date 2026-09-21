# Asset Doctor — Repair Framework v0.1

Status: implemented on `main`.

## Goal

Stop UI and application code from knowing individual repair issue IDs.

Before this pass the application contained direct logic such as:

`if issue.id === "topo-degenerate-triangles"`

That is acceptable for one proof-of-concept repair, but it does not scale to a surgical toolkit.

Repair Framework v0.1 introduces an operation catalog / registry between diagnostics and the transaction engine.

## Architecture

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
Export patch contract
```

### RepairOperationDefinition

Each repair operation declares:

- stable operation kind;
- diagnostic issue IDs it can handle;
- risk classification;
- translation keys;
- capabilities;
- export mutation class;
- preview adapter.

Current capability contract:

- preview
- apply
- undo
- verify
- exportPatch

Current export patch classes:

- `index-only`
- `geometry`

Both patch classes are now implemented by the repair/export path:
- `index-only` for repairs that change only triangle indices;
- `geometry` for verified vertex-domain remaps.

## Registered operations

### Remove Degenerate Triangles

- diagnostic issue: `topo-degenerate-triangles`
- risk: `CONDITIONAL`
- Preview: supported
- Apply: supported
- Verify: supported
- Undo: supported
- export patch: `index-only`

The implementation still uses the proven SurgicalHealEngine v0.2 transaction path.

### Remove Unreferenced Vertices

- diagnostic issue: `topo-isolated-vertices`
- risk: `CONDITIONAL`
- Preview: supported
- Apply: supported
- Verify: supported
- Undo: supported
- export patch: `geometry`

The operation compacts every supported vertex-domain attribute and morph attribute using the same deterministic old-index → new-index map.

The important architectural change is that UI and App code discover both repairs through the registry rather than hard-coding diagnostic IDs.

## Why this matters

Future repairs can be added as operations instead of branching throughout:

- InspectorPanel
- App
- Surgical Heal UI
- export logic
- verification logic

This reduces the chance that every repair invents its own Preview / Apply / Undo behavior.

## Current direction

The framework is now proven with two mutation classes:

1. index-only mutation;
2. full vertex-domain geometry remap.

New repair operations should reuse this lifecycle instead of adding special-case UI branches.

## Safety rule

Adding an operation to the catalog does not make it safe.

Every operation still needs its own:

1. detection contract;
2. safety gates;
3. deterministic Preview;
4. mutation implementation;
5. post-measurement verification;
6. Undo contract;
7. export patch support;
8. unit tests.

The framework standardizes the lifecycle. It does not weaken surgical safety.
