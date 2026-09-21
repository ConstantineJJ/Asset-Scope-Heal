import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class CameraController {
  public camera: THREE.PerspectiveCamera;
  public controls: OrbitControls;
  private defaultTarget: THREE.Vector3 = new THREE.Vector3(0, 0, 0);

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 0.05;
    this.controls.maxDistance = 5000;
  }

  public frameObject(object: THREE.Object3D, offsetFactor: number = 1.35) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;

    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraDistance = (maxDim / 2) / Math.tan(fov / 2);
    cameraDistance *= offsetFactor;

    // Adjust near / far clipping planes sensibly based on bounding volume
    this.camera.near = Math.max(0.01, maxDim / 1000);
    this.camera.far = Math.max(1000, cameraDistance * 20);
    this.camera.updateProjectionMatrix();

    // Position camera diagonally elevated looking at center
    const dir = new THREE.Vector3(1, 0.75, 1.25).normalize();
    this.camera.position.copy(center).add(dir.multiplyScalar(cameraDistance));

    this.defaultTarget.copy(center);
    this.controls.target.copy(center);
    this.controls.update();
  }

  public focusPosition(point: [number, number, number], targetDist?: number) {
    const target = new THREE.Vector3(point[0], point[1], point[2]);
    const currentDir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
    const dist = targetDist || Math.max(0.5, this.camera.position.distanceTo(this.controls.target) * 0.4);

    this.controls.target.copy(target);
    this.camera.position.copy(target).add(currentDir.multiplyScalar(dist));
    this.controls.update();
  }

  public setViewPreset(preset: 'perspective' | 'front' | 'top' | 'right') {
    const target = this.controls.target.clone();
    const currentDist = this.camera.position.distanceTo(target);

    switch (preset) {
      case 'perspective': {
        const dir = new THREE.Vector3(1, 0.7, 1.2).normalize();
        this.camera.position.copy(target).add(dir.multiplyScalar(currentDist));
        break;
      }
      case 'front': {
        this.camera.position.set(target.x, target.y, target.z + currentDist);
        break;
      }
      case 'top': {
        this.camera.position.set(target.x, target.y + currentDist, target.z + 0.0001);
        break;
      }
      case 'right': {
        this.camera.position.set(target.x + currentDist, target.y, target.z);
        break;
      }
    }
    this.controls.update();
  }

  public update() {
    this.controls.update();
  }

  public dispose() {
    this.controls.dispose();
  }
}
