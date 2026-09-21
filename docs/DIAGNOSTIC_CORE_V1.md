# Asset Doctor — Diagnostic Core v1

Status: implemented on `main`.

## Purpose

Diagnostic Core separates three different questions:

1. **Integrity** — is the asset structurally readable and internally valid?
2. **Health** — what unusual or potentially problematic technical conditions are present?
3. **Fitness** — is the asset suitable for a specific intended use/profile?

The same raw measurement may be interpreted differently by different profiles. Raw facts must not change when the profile changes.

## Severity states

- `OK` — check completed and no relevant problem was found.
- `INFO` — factual condition worth knowing; not inherently problematic.
- `WARNING` — potentially problematic or target-dependent.
- `ERROR` — invalid data or a condition likely to break correct use.
- `N/A` — check does not apply to this asset.
- `UNKNOWN` — the application cannot establish a reliable conclusion.

`UNKNOWN` is preferred over inventing a result when analysis fails or is incomplete.

## Repairability

Findings can carry a future repair classification:

- `NONE`
- `SAFE`
- `CONDITIONAL`
- `MANUAL`

Diagnostic Core v1 does **not** perform repairs. Repair metadata exists so future Heal operations can remain surgical and non-destructive.

## Finding contract

A finding can provide:

- category
- layer
- severity
- title
- description
- evidence
- why it matters
- suggested action
- repairability
- affected mesh/object
- affected indices
- focus position
- technical details
- diagnostic profile

## Diagnostic profiles

Current profiles:

- General Inspection
- Desktop Game Character
- Mobile Game Character
- Static Prop
- Animated Character
- Mechanical Asset
- Visualization / Render

Profiles currently influence reference thresholds such as:

- triangle count
- estimated draw calls
- texture dimensions
- bone influences
- expected rig/animation presence

Profile changes reinterpret existing analysis data without rerunning expensive topology analysis or remounting the Three.js viewport.

## Important semantics

- Missing rig on a static/general asset is `N/A`, not automatically a warning.
- Missing rig/animations can become Fitness warnings when a character profile expects them.
- Boundary/open edges are informational by default.
- Degenerate and non-manifold topology are Health warnings by default, not structural Integrity failures.
- Negative scale and zero-length normals are Health warnings by default.
- Runtime cost is Fitness, not disease.
- Large textures/triangle counts do not mean an asset is unhealthy.
- Texture dimension validity is Integrity; texture size budget is Fitness.

## Reliability rules

- A stale topology worker result from an older asset must not overwrite diagnostics for a newer asset.
- Profile changes must not remount/dispose the viewport.
- If topology analysis fails, the result is `UNKNOWN`, not a guessed pass/fail.
- Raw analysis data is cached in-memory so profile changes can reinterpret it cheaply.

## Tests

The in-app unit-test suite now covers both:

- synthetic topology algorithms;
- Diagnostic Core semantics.

Diagnostic Core tests cover:

- Integrity layer assignment;
- `N/A` semantics for static assets;
- profile expectations;
- profile-dependent Fitness thresholds;
- invalid texture dimensions as Integrity errors;
- topology anomalies as Health warnings.

## Boundary for v1

Diagnostic Core v1 diagnoses and classifies.

It does **not**:

- modify geometry;
- merge vertices;
- repair topology;
- normalize skinning automatically;
- rewrite UVs;
- delete bones;
- export repaired assets.

Those belong to the future Surgical Heal layer:

`Detect → Localize → Explain → Classify Risk → Preview → Apply Non-Destructively → Revalidate → Compare → Export`.
