# Asset Doctor — Safe Repair Queue v1

Status: implemented on `main`.

## Purpose

Safe Repair Queue automates **ordering and repetition**, not repair policy.

It never turns a blocked or manual-only finding into an automatic repair.

The queue is built only from diagnostics that have a registered `RepairOperationDefinition` with Preview and Apply support.

## Deterministic order

Current operation order:

1. Remove Degenerate Triangles
2. Remove Unreferenced Vertices
3. Recalculate Normals
4. Normalize Skin Weights
5. Merge Exact Duplicate Vertices

The order is intentional. Later operations see the geometry produced by earlier verified steps.

## Execution contract

A queue run is not a batch mutation.

Each step is a complete transaction:

```
Rebuild candidates
      ↓
Preview current next candidate
      ↓
READY?
  ├─ no → skip as BLOCKED
  └─ yes
      ↓
Apply exactly one operation
      ↓
Full Rescan
      ↓
Post-check / Verify
      ↓
VERIFIED?
  ├─ yes → rebuild queue from fresh diagnostics
  └─ no  → STOP
```

The next candidate is never trusted from an old diagnostic snapshot.

## Stop conditions

The queue stops immediately when:

- a repair ends in `REGRESSION`;
- a repair ends in `PARTIAL`;
- Apply fails;
- the active asset changes;
- the user requests Stop;
- a supposedly VERIFIED candidate reappears after Rescan;
- the hard operation guard is reached.

Undo remains available for the last applied operation.

## Blocked and manual-only findings

BLOCKED candidates are skipped, not forced.

Manual-only diagnostics do not enter the queue at all.

Examples that remain outside automatic queue execution:

- non-manifold topology;
- zero-weight skin vertices;
- missing UV unwrap;
- unused bones / sockets;
- needle triangles;
- arbitrary tiny components.

## UI

The Health panel exposes:

- candidate count;
- Completed count;
- Skipped count;
- Remaining count;
- Preview next;
- Apply next;
- Run safe queue;
- Stop;
- current mesh;
- stop reason / completion reason.

Run safe queue requires explicit confirmation.

## Multi-repair session

Every successful Apply remains in the in-memory Surgical Heal session.

Export is authorized only when **all active operations** are:

- `VERIFIED`;
- pipeline `complete`;
- not undone;
- still matched by the current final geometry.

This lets several repairs across several meshes survive into one repaired GLB without serializing viewport-only state.

## Safety philosophy

Safe Repair Queue means:

> automate only the boring sequencing around already-proven repair operations.

It does **not** mean:

> try every possible fix until the warnings disappear.
