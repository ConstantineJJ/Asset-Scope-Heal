# Asset Doctor — Remove Unreferenced Vertices v0.1

Status: implemented on `main`.

## Purpose

Remove vertex records that are not referenced by the mesh index buffer while preserving the rendered triangle topology.

This operation is registered through Repair Framework v0.1 as:

`remove-unreferenced-vertices`

Diagnostic source:

`topo-isolated-vertices`

Risk:

`CONDITIONAL`

## Lifecycle

`Detect → Focus → Preview → Apply → Measure → Verify → Undo → Export → Reopen → Verify`

## Deterministic remap

The operation builds one old-index → new-index map from the current index buffer.

Referenced vertices retain their original relative order.

The same map is applied to every supported vertex-domain stream:

- position
- normal
- tangent
- UV sets
- vertex colors
- skinIndex
- skinWeight
- other standard BufferAttributes
- morph attributes

The index buffer is then remapped to the compacted vertex domain.

Triangle order and triangle count do not change.

## Preservation

The operation preserves:

- material assignment;
- geometry groups;
- draw range;
- morphTargetsRelative;
- typed attribute storage class where supported;
- normalized attribute semantics;
- BufferAttribute usage;
- skinning attribute values;
- morph target values.

Interleaved vertex attributes are supported and are compacted into equivalent dense BufferAttributes.

## Safety gates

Repair is blocked when Asset Doctor cannot prove that the remap is safe, including:

- non-indexed geometry;
- invalid or out-of-range indices;
- incomplete triangle index buffers;
- InstancedMesh targets;
- shared BufferGeometry;
- mismatched vertex attribute counts;
- mismatched morph attribute counts;
- unsupported instanced / Float16 attribute layouts;
- non-finite attribute data;
- custom geometry userData that may contain vertex-index metadata;
- no unreferenced vertices remaining.

Blocking is intentional. Unknown vertex-index semantics are not guessed.

## Verification contract

A VERIFIED result requires:

- vertex count decreases by exactly the Preview count;
- triangle count is unchanged;
- unreferenced vertices become zero;
- degenerate triangles are unchanged;
- boundary edges are unchanged;
- non-manifold edges are unchanged;
- connected components are unchanged;
- thin/tiny component metrics do not regress;
- duplicate-position count does not increase;
- the applied geometry matches the deterministic replacement.

The full diagnostic pipeline must also complete.

## Undo

The pre-repair BufferGeometry object is retained in memory because the target geometry is required to be unshared.

Undo restores that original geometry object after verifying that the repaired geometry has not changed since Apply.

## Export

The operation declares a `geometry` export patch.

Export Repaired Copy starts from the pristine source asset and copies only the verified target geometry data into that clean source.

The resulting GLB is reopened independently and checked again, including:

- target vertex count;
- target unreferenced-vertex count;
- triangle / degenerate counts;
- mesh structure;
- materials and textures;
- rig / bones;
- animations.

Download is enabled only after export verification succeeds.

## Tests

The Surgical Heal suite covers:

- full Preview / Apply / VERIFIED / Undo lifecycle;
- position, normal, UV, interleaved color, skinIndex, skinWeight and morph preservation;
- geometry groups and draw-range preservation;
- Repair Registry dispatch;
- unsupported custom metadata;
- mismatched vertex attributes;
- report-storage roundtrip.

The operation does not modify the original GLB/GLTF file in place.
