import * as THREE from 'three';
import type { LightingConfig, LightingPreset } from '../types';

export class LightingManager {
  private scene: THREE.Scene;
  private lightsGroup: THREE.Group;
  private ambientLight: THREE.AmbientLight;
  private keyLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private currentConfig: LightingConfig;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.lightsGroup = new THREE.Group();
    this.lightsGroup.name = '__ascope_internal_lights';

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.fillLight = new THREE.DirectionalLight(0xb0c4de, 0.6);
    this.rimLight = new THREE.DirectionalLight(0xfff0dd, 0.8);
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 0.4);

    this.keyLight.position.set(5, 8, 6);
    this.fillLight.position.set(-6, 3, -4);
    this.rimLight.position.set(0, 7, -8);

    this.lightsGroup.add(
      this.ambientLight,
      this.keyLight,
      this.fillLight,
      this.rimLight,
      this.hemiLight
    );
    this.scene.add(this.lightsGroup);

    this.currentConfig = {
      preset: 'neutral-studio',
      exposure: 1.0,
      environmentIntensity: 0.5,
      keyIntensity: 1.2,
      fillIntensity: 0.6,
      rimIntensity: 0.8,
    };

    this.applyPreset('neutral-studio');
  }

  public applyPreset(preset: LightingPreset) {
    this.currentConfig.preset = preset;

    switch (preset) {
      case 'neutral-studio':
        this.ambientLight.color.setHex(0xffffff);
        this.ambientLight.intensity = 0.45;
        this.keyLight.color.setHex(0xfffbf5);
        this.keyLight.intensity = 1.3;
        this.keyLight.position.set(5, 8, 5);
        this.fillLight.color.setHex(0xdce5ef);
        this.fillLight.intensity = 0.6;
        this.fillLight.position.set(-5, 4, 3);
        this.rimLight.color.setHex(0xffffff);
        this.rimLight.intensity = 0.8;
        this.rimLight.position.set(0, 6, -7);
        this.hemiLight.color.setHex(0xffffff);
        this.hemiLight.groundColor.setHex(0x3a3e47);
        this.hemiLight.intensity = 0.4;
        break;

      case 'soft-studio':
        this.ambientLight.color.setHex(0xffffff);
        this.ambientLight.intensity = 0.7;
        this.keyLight.color.setHex(0xffffff);
        this.keyLight.intensity = 0.8;
        this.keyLight.position.set(4, 6, 4);
        this.fillLight.color.setHex(0xf0f4f8);
        this.fillLight.intensity = 0.6;
        this.fillLight.position.set(-4, 4, 4);
        this.rimLight.color.setHex(0xffffff);
        this.rimLight.intensity = 0.4;
        this.rimLight.position.set(0, 5, -5);
        this.hemiLight.intensity = 0.6;
        break;

      case 'hard-studio':
        this.ambientLight.color.setHex(0xffffff);
        this.ambientLight.intensity = 0.2;
        this.keyLight.color.setHex(0xffffff);
        this.keyLight.intensity = 2.2;
        this.keyLight.position.set(7, 9, 4);
        this.fillLight.color.setHex(0x99aabf);
        this.fillLight.intensity = 0.3;
        this.fillLight.position.set(-6, 2, 2);
        this.rimLight.color.setHex(0xffeedd);
        this.rimLight.intensity = 1.4;
        this.rimLight.position.set(-2, 8, -6);
        this.hemiLight.intensity = 0.2;
        break;

      case 'outdoor':
        this.ambientLight.color.setHex(0xc9e4ff);
        this.ambientLight.intensity = 0.5;
        this.keyLight.color.setHex(0xfffaea);
        this.keyLight.intensity = 1.8;
        this.keyLight.position.set(8, 12, 6);
        this.fillLight.color.setHex(0x8cb6e0);
        this.fillLight.intensity = 0.8;
        this.fillLight.position.set(-6, 4, -4);
        this.rimLight.color.setHex(0xd0e8ff);
        this.rimLight.intensity = 0.7;
        this.rimLight.position.set(-3, 6, -8);
        this.hemiLight.color.setHex(0x6eb7ff);
        this.hemiLight.groundColor.setHex(0x4a4536);
        this.hemiLight.intensity = 0.7;
        break;

      case 'sunset':
        this.ambientLight.color.setHex(0x5c4266);
        this.ambientLight.intensity = 0.4;
        this.keyLight.color.setHex(0xff8c42);
        this.keyLight.intensity = 2.0;
        this.keyLight.position.set(10, 3, 4);
        this.fillLight.color.setHex(0x6e527d);
        this.fillLight.intensity = 0.5;
        this.fillLight.position.set(-6, 5, 2);
        this.rimLight.color.setHex(0xffd59e);
        this.rimLight.intensity = 1.6;
        this.rimLight.position.set(-5, 6, -7);
        this.hemiLight.color.setHex(0xff9966);
        this.hemiLight.groundColor.setHex(0x2d1f3b);
        this.hemiLight.intensity = 0.5;
        break;

      case 'top-light':
        this.ambientLight.color.setHex(0xffffff);
        this.ambientLight.intensity = 0.25;
        this.keyLight.color.setHex(0xffffff);
        this.keyLight.intensity = 2.4;
        this.keyLight.position.set(0, 14, 0);
        this.fillLight.color.setHex(0x8ca0b8);
        this.fillLight.intensity = 0.3;
        this.fillLight.position.set(-5, 2, 4);
        this.rimLight.color.setHex(0xffffff);
        this.rimLight.intensity = 0.4;
        this.rimLight.position.set(0, 2, -6);
        this.hemiLight.intensity = 0.2;
        break;

      case 'rim-light':
        this.ambientLight.color.setHex(0x222233);
        this.ambientLight.intensity = 0.15;
        this.keyLight.color.setHex(0x667788);
        this.keyLight.intensity = 0.4;
        this.keyLight.position.set(2, 3, 5);
        this.fillLight.color.setHex(0x334455);
        this.fillLight.intensity = 0.2;
        this.fillLight.position.set(-4, 2, 3);
        this.rimLight.color.setHex(0x00d2ff);
        this.rimLight.intensity = 2.5;
        this.rimLight.position.set(-4, 6, -7);
        this.hemiLight.intensity = 0.15;
        break;

      case 'dark-studio':
        this.ambientLight.color.setHex(0x111317);
        this.ambientLight.intensity = 0.1;
        this.keyLight.color.setHex(0xffffff);
        this.keyLight.intensity = 0.7;
        this.keyLight.position.set(4, 5, 4);
        this.fillLight.color.setHex(0x334455);
        this.fillLight.intensity = 0.2;
        this.fillLight.position.set(-4, 2, -3);
        this.rimLight.color.setHex(0x6688aa);
        this.rimLight.intensity = 0.5;
        this.rimLight.position.set(0, 5, -6);
        this.hemiLight.intensity = 0.1;
        break;
    }
  }

  public updateManualIntensities(config: Partial<LightingConfig>) {
    Object.assign(this.currentConfig, config);

    if (config.keyIntensity !== undefined) {
      this.keyLight.intensity = config.keyIntensity;
    }
    if (config.fillIntensity !== undefined) {
      this.fillLight.intensity = config.fillIntensity;
    }
    if (config.rimIntensity !== undefined) {
      this.rimLight.intensity = config.rimIntensity;
    }
    if (config.environmentIntensity !== undefined) {
      this.ambientLight.intensity = config.environmentIntensity * 0.8;
      this.hemiLight.intensity = config.environmentIntensity * 0.6;
    }
  }

  public getConfig(): LightingConfig {
    return { ...this.currentConfig };
  }

  public dispose() {
    this.scene.remove(this.lightsGroup);
    this.lightsGroup.clear();
  }
}
