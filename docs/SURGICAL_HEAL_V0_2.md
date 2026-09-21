# Asset Doctor — Surgical Heal v0.2

Status: implemented and locally validated. Continues the confirmed v0.1 operation on `main`.

## Contract

`Detect → Focus → Preview → Apply → Measure → Compare → Report → Undo`

The only repair remains **Remove Degenerate Triangles**, classified `CONDITIONAL`.
Only the in-memory index buffer is changed. No file export, vertex cleanup, welding,
hole closing, normal reconstruction, or other repair operations were added.

## Measured evidence

Immediately before Apply, the existing topology analyzer measures the target mesh.
Immediately after mutation, it independently reads and measures the actual geometry again.
Preview predictions are never substituted for these measurements.

The report retains before, after, and signed deltas for:

- triangles and vertices;
- degenerate triangles;
- boundary and non-manifold edges;
- unreferenced vertices;
- connected components and tiny components;
- thin triangles and potential duplicate positions.

The geometry snapshot also checks that the exact expected index replacement occurred
and all vertex/morph attribute bytes and layouts remained unchanged.
Mesh-local base positions and scale are shared by the worker and heal measurement paths;
world transforms and unrelated meshes cannot change the area threshold. Interleaved
position attributes are read through their component accessors.

## Status policy

| Status | Meaning |
| --- | --- |
| VERIFIED | Target degenerate count changed from positive to zero, the expected index-only change passed, no monitored regression occurred, and the full diagnostic refresh completed. |
| PARTIAL | Target defects remain, post-measurement is unavailable, or the full refresh is pending/failed. Apply alone is never evidence of success. |
| REGRESSION | Unexpected buffer/count change, increased boundary/non-manifold edges, connected/tiny components, thin triangles, duplicate positions or degenerates, or an empty resulting mesh. This takes precedence over an incomplete refresh. |

An increase in unreferenced vertices is explicitly reported as an expected consequence
of preserving vertex attributes during index-only removal. It does not by itself
invalidate VERIFIED. Existing diagnostics still show these vertices; no cleanup is implied.
Boundary increases are conservatively treated as REGRESSION even if an artist might
consider a particular open surface intentional.

VERIFIED is scoped to the target operation and these checks. It does not certify the
entire asset, shading, animation, UV quality, export behavior, or downstream use.
The full diagnostic refresh updates the existing issue list; the status does not claim
a complete asset-wide issue comparison.

## Safety and operation lifetime

- Existing indexed/group/shared-geometry/draw-range gates remain in place.
- Invalid index layouts, out-of-range indices, incomplete triangles and non-finite
  positions are blocked before mutation.
- Preview captures exact geometry data. Apply detects same-length index changes,
  in-place attribute edits, morph changes, layout changes, and newly shared geometry.
- Before-measurement failure blocks Apply. Failed post-measurement retains Undo and PARTIAL.
- Apply and Undo are serialized while the full diagnostic refresh runs.
- A worker error, message decoding error, or 15-second timeout falls back to the existing
  local analyzer rather than leaving verification pending indefinitely.
- Late analysis results cannot certify a different asset or operation.
- Undo refuses to overwrite subsequent geometry edits or newly shared geometry.
  A refusal is visible and does not consume Undo.
- Undo restores the original index values and reruns diagnostics. The original Apply
  evidence remains marked UNDONE and is explicitly described as historical measurements.

## Last operation and UI

The engine retains the last operation independently of issue cards and exposes detached
report copies. The report remains available when the repaired warning disappears.
The UI brings new reports into view and uses text plus color for status, displays actual
before/after measurements, and exposes guarded Undo.

Only the serializable audit report is saved under `asset-doctor.last-heal.v2` in browser
localStorage. It includes operation ID, asset/mesh identity, timestamps, metrics, reasons,
verification status, refresh status, and optional Undo timestamp. No geometry or undo
buffers are persisted. After reload or asset replacement, the report is clearly labeled
saved history and cannot verify or mutate the newly loaded asset. Invalid saved data is
ignored. Storage errors keep the report usable in the current session and show a warning.

New UI copy uses translation keys. EN remains Source of Truth; missing RU keys use the
existing English fallback. Technical metric names can remain English.

## Validation — 2026-09-21

- `npm test`: 47/47 passed, including the original 20 tests.
- `npm run lint`: TypeScript check.
- `npm run build`: production bundle.
- Browser specimen: global triangles **38 → 37**, target triangles **3 → 2**,
  degenerates **1 → 0**, boundary edges **9 → 6**, non-manifold **0 → 0**,
  unreferenced vertices **0 → 3**, status **VERIFIED**.
- Browser Undo: global count restored to **38**, degenerate finding returned,
  report retained with **UNDONE**.
- Browser EN/RU switching, English fallback and report layout checked.
- Browser reload: saved evidence remained, history notice displayed, Undo unavailable.
- Fault-injection unit tests cover residual defects, regression, unavailable pre/post
  measurements, failed refresh, stale completion, tampered Apply, invalid geometry,
  changed Preview/Undo inputs, morph preservation, and unavailable/corrupt storage.

Dependency note: this baseline has an existing optional peer mismatch between Vite 8.3
and its declared esbuild 0.25. Local dependencies were installed with
`npm install --package-lock=false --legacy-peer-deps`; dependency versions and `bun.lock`
were not changed. Build warnings concern existing chunk size and Vite config `__dirname`.
