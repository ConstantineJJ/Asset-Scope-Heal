import * as THREE from 'three';

type Attribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

export interface VertexRemapPlan {
  replacement: THREE.BufferGeometry;
  removedVertices: number;
  verticesBefore: number;
  verticesAfter: number;
}

export interface VertexRemapBlocked {
  reasonKey: string;
}

function isInterleaved(attribute: Attribute): attribute is THREE.InterleavedBufferAttribute {
  return Boolean((attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute);
}

function sourceArray(attribute: Attribute) {
  return isInterleaved(attribute) ? attribute.data.array : attribute.array;
}

function sourceUsage(attribute: Attribute) {
  return isInterleaved(attribute) ? attribute.data.usage : attribute.usage;
}

function componentAt(attribute: Attribute, index: number, component: number): number {
  if (isInterleaved(attribute)) {
    return attribute.data.array[index * attribute.data.stride + attribute.offset + component] as number;
  }
  return attribute.array[index * attribute.itemSize + component] as number;
}

function remapAttribute(attribute: Attribute, retained: number[]): THREE.BufferAttribute {
  const array = sourceArray(attribute);
  const ArrayCtor = array.constructor as new (length: number) => typeof array;
  const output = new ArrayCtor(retained.length * attribute.itemSize);

  for (let nextIndex = 0; nextIndex < retained.length; nextIndex++) {
    const oldIndex = retained[nextIndex];
    for (let component = 0; component < attribute.itemSize; component++) {
      output[nextIndex * attribute.itemSize + component] = componentAt(attribute, oldIndex, component);
    }
  }

  const result = new THREE.BufferAttribute(output, attribute.itemSize, attribute.normalized);
  result.name = attribute.name;
  result.setUsage(sourceUsage(attribute));

  const sourceWithGpuType = attribute as Attribute & { gpuType?: number };
  const resultWithGpuType = result as THREE.BufferAttribute & { gpuType?: number };
  if (sourceWithGpuType.gpuType !== undefined) {
    resultWithGpuType.gpuType = sourceWithGpuType.gpuType;
  }

  return result;
}

function denseCloneAttribute(attribute: Attribute): THREE.BufferAttribute {
  return remapAttribute(attribute, Array.from({ length: attribute.count }, (_, index) => index));
}

function validVertexAttribute(attribute: Attribute, vertexCount: number): boolean {
  if ((attribute as THREE.InstancedBufferAttribute).isInstancedBufferAttribute) return false;
  if ((attribute as Attribute & { isFloat16BufferAttribute?: boolean }).isFloat16BufferAttribute) return false;
  if (!Number.isInteger(attribute.itemSize) || attribute.itemSize <= 0) return false;
  if (attribute.count !== vertexCount) return false;
  return true;
}

function copyGroupsAndRange(source: THREE.BufferGeometry, target: THREE.BufferGeometry) {
  target.clearGroups();
  for (const group of source.groups) {
    target.addGroup(group.start, group.count, group.materialIndex);
  }
  target.setDrawRange(source.drawRange.start, source.drawRange.count);
}

export function copyGeometryData(target: THREE.BufferGeometry, source: THREE.BufferGeometry) {
  for (const name of Object.keys(target.attributes)) {
    target.deleteAttribute(name);
  }

  for (const [name, attribute] of Object.entries(source.attributes)) {
    target.setAttribute(name, denseCloneAttribute(attribute));
  }

  target.morphAttributes = {};
  for (const [name, attributes] of Object.entries(source.morphAttributes)) {
    target.morphAttributes[name] = attributes.map((attribute) => denseCloneAttribute(attribute));
  }

  target.morphTargetsRelative = source.morphTargetsRelative;
  target.setIndex(source.index ? source.index.clone() : null);
  copyGroupsAndRange(source, target);
  target.computeBoundingBox();
  target.computeBoundingSphere();
}

export function geometryDataEquivalent(left: THREE.BufferGeometry, right: THREE.BufferGeometry): boolean {
  const leftNames = Object.keys(left.attributes).sort();
  const rightNames = Object.keys(right.attributes).sort();
  if (JSON.stringify(leftNames) !== JSON.stringify(rightNames)) return false;

  const leftMorphNames = Object.keys(left.morphAttributes).sort();
  const rightMorphNames = Object.keys(right.morphAttributes).sort();
  if (JSON.stringify(leftMorphNames) !== JSON.stringify(rightMorphNames)) return false;
  if (left.morphTargetsRelative !== right.morphTargetsRelative) return false;
  if (JSON.stringify(left.groups) !== JSON.stringify(right.groups)) return false;
  if (String(left.drawRange.start) !== String(right.drawRange.start) ||
      String(left.drawRange.count) !== String(right.drawRange.count)) return false;
  if (Boolean(left.index) !== Boolean(right.index)) return false;

  const equalAttribute = (a: Attribute, b: Attribute) => {
    if (a.itemSize !== b.itemSize || a.count !== b.count || a.normalized !== b.normalized) return false;
    const aArray = sourceArray(a);
    const bArray = sourceArray(b);
    if (aArray.constructor.name !== bArray.constructor.name) return false;
    for (let index = 0; index < a.count; index++) {
      for (let component = 0; component < a.itemSize; component++) {
        if (componentAt(a, index, component) !== componentAt(b, index, component)) return false;
      }
    }
    return true;
  };

  for (const name of leftNames) {
    if (!equalAttribute(left.attributes[name], right.attributes[name])) return false;
  }

  for (const name of leftMorphNames) {
    const a = left.morphAttributes[name] ?? [];
    const b = right.morphAttributes[name] ?? [];
    if (a.length !== b.length) return false;
    for (let index = 0; index < a.length; index++) {
      if (!equalAttribute(a[index], b[index])) return false;
    }
  }

  if (left.index && right.index && !equalAttribute(left.index, right.index)) return false;
  return true;
}

export function planRemoveUnreferencedVertices(
  geometry: THREE.BufferGeometry
): VertexRemapPlan | VertexRemapBlocked {
  const position = geometry.getAttribute('position');
  const index = geometry.index;

  if (!position || !index) {
    return { reasonKey: 'heal.errors.unreferencedNeedsIndexedGeometry' };
  }
  if (geometry.userData && Object.keys(geometry.userData).length > 0) {
    return { reasonKey: 'heal.errors.vertexMetadataUnsupported' };
  }
  if (index.itemSize !== 1 || index.normalized || index.count === 0 || index.count % 3 !== 0 ||
      position.itemSize !== 3 || position.count === 0) {
    return { reasonKey: 'heal.errors.invalidGeometry' };
  }

  const vertexCount = position.count;
  const referenced = new Uint8Array(vertexCount);

  for (let offset = 0; offset < index.count; offset++) {
    const value = index.getX(offset);
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value >= vertexCount) {
      return { reasonKey: 'heal.errors.invalidGeometry' };
    }
    referenced[value] = 1;
  }

  for (const attribute of Object.values(geometry.attributes)) {
    if (!validVertexAttribute(attribute, vertexCount)) {
      return { reasonKey: 'heal.errors.vertexAttributeUnsupported' };
    }
    for (let vertex = 0; vertex < attribute.count; vertex++) {
      for (let component = 0; component < attribute.itemSize; component++) {
        if (!Number.isFinite(componentAt(attribute, vertex, component))) {
          return { reasonKey: 'heal.errors.invalidGeometry' };
        }
      }
    }
  }

  for (const attributes of Object.values(geometry.morphAttributes)) {
    for (const attribute of attributes) {
      if (!validVertexAttribute(attribute, vertexCount)) {
        return { reasonKey: 'heal.errors.vertexAttributeUnsupported' };
      }
      for (let vertex = 0; vertex < attribute.count; vertex++) {
        for (let component = 0; component < attribute.itemSize; component++) {
          if (!Number.isFinite(componentAt(attribute, vertex, component))) {
            return { reasonKey: 'heal.errors.invalidGeometry' };
          }
        }
      }
    }
  }

  const retained: number[] = [];
  const remap = new Int32Array(vertexCount);
  remap.fill(-1);

  for (let oldIndex = 0; oldIndex < vertexCount; oldIndex++) {
    if (!referenced[oldIndex]) continue;
    remap[oldIndex] = retained.length;
    retained.push(oldIndex);
  }

  const removedVertices = vertexCount - retained.length;
  if (removedVertices <= 0) {
    return { reasonKey: 'heal.errors.noUnreferencedVertices' };
  }

  const sourceIndexArray = index.array;
  const IndexCtor = sourceIndexArray.constructor as new (length: number) => typeof sourceIndexArray;
  const nextIndexArray = new IndexCtor(index.count);
  for (let offset = 0; offset < index.count; offset++) {
    const mapped = remap[index.getX(offset)];
    if (mapped < 0) return { reasonKey: 'heal.errors.invalidGeometry' };
    nextIndexArray[offset] = mapped;
  }

  const replacement = new THREE.BufferGeometry();
  replacement.name = geometry.name;

  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    replacement.setAttribute(name, remapAttribute(attribute, retained));
  }

  for (const [name, attributes] of Object.entries(geometry.morphAttributes)) {
    replacement.morphAttributes[name] = attributes.map((attribute) => remapAttribute(attribute, retained));
  }

  replacement.morphTargetsRelative = geometry.morphTargetsRelative;
  const nextIndex = new THREE.BufferAttribute(nextIndexArray, 1, index.normalized);
  nextIndex.setUsage(index.usage);
  const sourceIndexWithGpuType = index as THREE.BufferAttribute & { gpuType?: number };
  const nextIndexWithGpuType = nextIndex as THREE.BufferAttribute & { gpuType?: number };
  if (sourceIndexWithGpuType.gpuType !== undefined) {
    nextIndexWithGpuType.gpuType = sourceIndexWithGpuType.gpuType;
  }
  replacement.setIndex(nextIndex);
  copyGroupsAndRange(geometry, replacement);
  replacement.computeBoundingBox();
  replacement.computeBoundingSphere();

  return {
    replacement,
    removedVertices,
    verticesBefore: vertexCount,
    verticesAfter: retained.length,
  };
}
