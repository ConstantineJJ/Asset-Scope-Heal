import * as THREE from 'three';

interface MeshPartTransform {
  mesh: THREE.Mesh;
  originalPosition: THREE.Vector3;
  direction: THREE.Vector3;
  maxDistance: number;
}

export class ExplodedViewController {
  private parts: MeshPartTransform[] = [];
  private currentAmount: number = 0; // 0 to 100

  public registerAsset(root: THREE.Object3D) {
    this.parts = [];
    this.currentAmount = 0;

    const overallBox = new THREE.Box3().setFromObject(root);
    if (overallBox.isEmpty()) return;

    const modelCenter = new THREE.Vector3();
    overallBox.getCenter(modelCenter);
    const diagonal = overallBox.getSize(new THREE.Vector3()).length();

    root.traverse((obj) => {
      if (obj.name?.startsWith('__ascope_internal_')) return;
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const partBox = new THREE.Box3().setFromObject(mesh);
        const partCenter = new THREE.Vector3();
        if (!partBox.isEmpty()) {
          partBox.getCenter(partCenter);
        } else {
          mesh.getWorldPosition(partCenter);
        }

        const dir = new THREE.Vector3().subVectors(partCenter, modelCenter);
        if (dir.lengthSq() < 0.0001) {
          // If at center, explode outward along random normal or up
          dir.set(0, 1, 0);
        } else {
          dir.normalize();
        }

        this.parts.push({
          mesh,
          originalPosition: mesh.position.clone(),
          direction: dir,
          maxDistance: diagonal * 0.45,
        });
      }
    });
  }

  public setExplodeAmount(amount: number) {
    this.currentAmount = Math.max(0, Math.min(100, amount));
    const factor = this.currentAmount / 100;

    for (const part of this.parts) {
      const offset = part.direction.clone().multiplyScalar(part.maxDistance * factor);
      part.mesh.position.copy(part.originalPosition).add(offset);
      part.mesh.updateMatrixWorld();
    }
  }

  public getExplodeAmount(): number {
    return this.currentAmount;
  }

  public reset() {
    this.setExplodeAmount(0);
    this.parts = [];
  }
}
