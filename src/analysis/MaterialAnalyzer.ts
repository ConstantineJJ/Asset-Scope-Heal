import * as THREE from 'three';
import type { MaterialInfo } from '../types';

export function analyzeMaterials(root: THREE.Object3D): MaterialInfo[] {
  const materialsMap = new Map<string, MaterialInfo>();

  root.traverse((obj) => {
    if (obj.name?.startsWith('__ascope_internal_')) return;
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

      for (const m of mats) {
        if (!m || materialsMap.has(m.uuid)) continue;

        const std = m as THREE.MeshStandardMaterial;
        const baseColorHex = std.color ? `#${std.color.getHexString()}` : '#ffffff';
        const emissiveHex = std.emissive ? `#${std.emissive.getHexString()}` : '#000000';

        const textureSlots: MaterialInfo['textureSlots'] = {};
        if (std.map) textureSlots.map = std.map.name || std.map.uuid.slice(0, 8);
        if (std.normalMap) textureSlots.normalMap = std.normalMap.name || std.normalMap.uuid.slice(0, 8);
        if (std.roughnessMap) textureSlots.roughnessMap = std.roughnessMap.name || std.roughnessMap.uuid.slice(0, 8);
        if (std.metalnessMap) textureSlots.metalnessMap = std.metalnessMap.name || std.metalnessMap.uuid.slice(0, 8);
        if (std.aoMap) textureSlots.aoMap = std.aoMap.name || std.aoMap.uuid.slice(0, 8);
        if (std.emissiveMap) textureSlots.emissiveMap = std.emissiveMap.name || std.emissiveMap.uuid.slice(0, 8);

        materialsMap.set(m.uuid, {
          uuid: m.uuid,
          name: m.name || `Material_${(m as any).id || m.uuid.slice(0, 6)}`,
          type: m.type,
          baseColorHex,
          metallic: typeof std.metalness === 'number' ? std.metalness : 0,
          roughness: typeof std.roughness === 'number' ? std.roughness : 1,
          opacity: typeof m.opacity === 'number' ? m.opacity : 1,
          alphaMode: m.transparent ? 'BLEND' : 'OPAQUE',
          doubleSided: m.side === THREE.DoubleSide,
          emissiveHex,
          textureSlots,
        });
      }
    }
  });

  return Array.from(materialsMap.values());
}
