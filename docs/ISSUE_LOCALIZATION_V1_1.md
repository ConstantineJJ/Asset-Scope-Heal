# Asset Doctor — Issue Localization v1.1

Status: implemented on `main`.

## Changes from v1

### Precise overlays

The large spherical issue marker was removed.

Asset Doctor now prioritizes the actual affected geometry:

- triangle outline
- edge segment
- vertex points
- sampled component vertices

This prevents the marker itself from hiding the defect.

### Multiple representative locations

One diagnostic finding can expose several representative locations.

Topology analysis stores up to 8 localization samples per issue kind and mesh to keep worker payloads bounded.

Examples:

- several degenerate triangles
- several boundary edges
- several non-manifold edges
- several isolated vertices
- several tiny disconnected components
- several needle triangles
- several coincident-position samples

The Inspector can navigate them using Previous / Next.

### Return to previous view

When the user enters issue inspection, Asset Doctor snapshots the camera position, OrbitControls target, and clipping planes.

`Back to View` restores that view.

Manual Scene Tree selection cancels the saved issue-inspection state instead of leaving a stale camera return target.

### Animated assets

When affected vertex indices are available, overlays are rebuilt from the currently rendered mesh.

For `SkinnedMesh`, current skinned vertex positions are used so the overlay follows the animated pose.

## Safety

This stage remains diagnostic only.

No mesh data is modified.

## Test coverage

The unit suite now includes a Multiple Issue Locations test in addition to the Issue Localization contract test.
