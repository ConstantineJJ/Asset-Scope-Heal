import * as THREE from 'three';

type Attribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
interface SnapshotEntry { layout: string; bytes: Uint8Array }
export interface GeometrySnapshot { layout: string; entries: SnapshotEntry[] }

export function captureAttribute(attribute: Attribute): SnapshotEntry {
  const interleaved = attribute as THREE.InterleavedBufferAttribute;
  const array = attribute.array;
  return {
    layout: JSON.stringify([attribute.itemSize, attribute.count, attribute.normalized,
      array.constructor.name, interleaved.offset, interleaved.data?.stride]),
    bytes: new Uint8Array(array.buffer, array.byteOffset, array.byteLength).slice(),
  };
}

/** Exact byte comparison also catches in-place edits that did not set needsUpdate. */
export function captureGeometry(geometry: THREE.BufferGeometry): GeometrySnapshot {
  const names = Object.keys(geometry.attributes).sort();
  const morphs = geometry.morphAttributes as Record<string, Attribute[]>;
  const morphNames = Object.keys(morphs).sort();
  const attributes = names.map(name => geometry.attributes[name]);
  for (const name of morphNames) attributes.push(...morphs[name]);
  if (geometry.index) attributes.push(geometry.index);
  return {
    layout: JSON.stringify([geometry.uuid, names, morphNames.map(name => [name, morphs[name].length]),
      geometry.morphTargetsRelative, geometry.groups,
      [String(geometry.drawRange.start), String(geometry.drawRange.count)], Boolean(geometry.index)]),
    entries: attributes.map(captureAttribute),
  };
}

export function geometryMatches(geometry: THREE.BufferGeometry, snapshot: GeometrySnapshot): boolean {
  const current = captureGeometry(geometry);
  return current.layout === snapshot.layout && current.entries.length === snapshot.entries.length &&
    current.entries.every((value, i) => value.layout === snapshot.entries[i].layout &&
      value.bytes.length === snapshot.entries[i].bytes.length &&
      value.bytes.every((byte, j) => byte === snapshot.entries[i].bytes[j]));
}
