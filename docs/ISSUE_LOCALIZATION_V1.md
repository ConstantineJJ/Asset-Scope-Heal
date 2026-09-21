# Asset Doctor — Issue Localization & Focus v1

Status: implemented on `main`.

## Goal

Turn a diagnostic card from a passive statement into a navigable technical finding:

`Detect → identify mesh → identify element → focus viewport → show marker/overlay`

This stage does not repair geometry.

## Localization contract

Topology findings can carry:

- `meshUuid`
- `meshName`
- `affectedElement`: triangle / edge / vertex / component
- `affectedIndices`
- `focusPosition` in world space

The topology worker only stores compact representative samples. It does not return huge lists of every affected element.

## Supported localized topology findings

- degenerate triangle
- boundary/open edge
- non-manifold edge
- isolated vertex
- tiny disconnected component
- thin/needle triangle
- coincident/duplicate-position sample

## World-space handling

Topology is calculated from local geometry buffers in a worker.

The WorkerManager snapshots each mesh world matrix and the analyzer converts localization samples into world coordinates. This avoids treating local mesh coordinates as viewport coordinates.

## Animated / SkinnedMesh handling

When the user presses **Focus**, Asset Doctor tries to reconstruct the affected sample from the currently rendered mesh.

For a SkinnedMesh it uses current skinned vertex positions when affected indices are available. This improves localization on animated characters compared with using bind-pose coordinates alone.

## Viewport behavior

Pressing **Focus** on a localizable issue:

1. selects the affected mesh;
2. draws the normal mesh selection box;
3. draws a small high-visibility issue marker;
4. draws an issue overlay when enough element data exists:
   - triangle outline;
   - edge segment;
   - sampled vertices/components as points;
5. moves the camera to the localized region.

Selecting another object clears the diagnostic marker/overlay.

Loading a new asset or disposing the current scene also clears all issue-localization helpers.

## UI

Diagnostic cards can show a compact location line such as:

`Location: Body · triangle [7]`

The **Focus** action is available when a finding has either a mesh target or a world-space focus point.

## Scope and safety

Issue Localization v1 is diagnostic only.

It does not:

- delete triangles;
- weld vertices;
- close boundaries;
- alter topology;
- change skin weights;
- rewrite materials;
- modify the source GLB.

This preserves the Surgical Heal doctrine: first localize and understand, then decide whether a future repair is safe.

## Tests

The Asset Doctor Unit Test Suite includes an Issue Localization contract test verifying that a localized topology finding preserves:

- mesh UUID;
- mesh name;
- affected element type;
- affected indices;
- world-space focus point.
