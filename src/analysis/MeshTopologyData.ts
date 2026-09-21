import * as THREE from 'three';
import type { RawMeshData } from './TopologyAnalyzer';

/** Use mesh-local positions AND scale for both diagnosis and repair verification. */
export function meshTopologyData(mesh: THREE.Mesh): RawMeshData {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  const positions = new Float32Array(position.count * 3);
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    positions.set([point.x, point.y, point.z], i * 3);
    box.expandByPoint(point);
  }
  const index = geometry.index;
  return {
    uuid: mesh.uuid,
    name: mesh.name || `Mesh_${mesh.id}`,
    positions,
    indices: index ? Uint32Array.from(index.array) : null,
    boundingBoxDiagonal: box.isEmpty() ? 0 : box.getSize(point).length(),
    worldMatrix: Array.from(mesh.matrixWorld.elements),
  };
}
