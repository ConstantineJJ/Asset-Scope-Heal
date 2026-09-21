import * as THREE from 'three';

export interface SampleAsset {
  id: string;
  name: string;
  description: string;
  root: THREE.Group;
  animations: THREE.AnimationClip[];
}

/**
 * Procedural sample models built cleanly with Three.js geometry & materials.
 * Enables instant inspection, topology diagnostics verification, and animation testing.
 */
export function createSampleDrone(): SampleAsset {
  const root = new THREE.Group();
  root.name = 'Explorer_Drone_MK4';

  // Materials
  const armorMat = new THREE.MeshStandardMaterial({
    name: 'Mat_ArmorPlating',
    color: 0x222b38,
    metalness: 0.85,
    roughness: 0.25,
  });

  const accentMat = new THREE.MeshStandardMaterial({
    name: 'Mat_HighVisOrange',
    color: 0xf97316,
    metalness: 0.2,
    roughness: 0.35,
  });

  const engineMat = new THREE.MeshStandardMaterial({
    name: 'Mat_TitaniumThruster',
    color: 0x475569,
    metalness: 0.9,
    roughness: 0.4,
  });

  const sensorMat = new THREE.MeshStandardMaterial({
    name: 'Mat_SensorOptics',
    color: 0x06b6d4,
    emissive: new THREE.Color(0x06b6d4),
    emissiveIntensity: 0.8,
    metalness: 0.1,
    roughness: 0.1,
  });

  // 1. Central Chassis
  const chassisGeom = new THREE.BoxGeometry(1.6, 0.6, 2.2, 2, 2, 2);
  const chassis = new THREE.Mesh(chassisGeom, armorMat);
  chassis.name = 'Chassis_Main';
  chassis.position.set(0, 1.2, 0);
  root.add(chassis);

  // 2. Cockpit Canopy / Sensor Dome
  const canopyGeom = new THREE.SphereGeometry(0.5, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const canopy = new THREE.Mesh(canopyGeom, sensorMat);
  canopy.name = 'Sensor_Dome';
  canopy.position.set(0, 1.5, 0.4);
  root.add(canopy);

  // 3. Left Thruster Nacelle
  const thrusterGeom = new THREE.CylinderGeometry(0.35, 0.4, 1.4, 20);
  const leftThruster = new THREE.Mesh(thrusterGeom, engineMat);
  leftThruster.name = 'Thruster_Port';
  leftThruster.rotation.x = Math.PI / 2;
  leftThruster.position.set(-1.4, 1.2, -0.2);
  root.add(leftThruster);

  // 4. Right Thruster Nacelle
  const rightThruster = new THREE.Mesh(thrusterGeom.clone(), engineMat);
  rightThruster.name = 'Thruster_Starboard';
  rightThruster.rotation.x = Math.PI / 2;
  rightThruster.position.set(1.4, 1.2, -0.2);
  root.add(rightThruster);

  // 5. Left Wing / Strut
  const wingGeom = new THREE.BoxGeometry(0.9, 0.08, 0.8);
  const leftWing = new THREE.Mesh(wingGeom, accentMat);
  leftWing.name = 'Wing_Flap_Left';
  leftWing.position.set(-1.0, 1.2, 0);
  root.add(leftWing);

  // 6. Right Wing / Strut
  const rightWing = new THREE.Mesh(wingGeom.clone(), accentMat);
  rightWing.name = 'Wing_Flap_Right';
  rightWing.position.set(1.0, 1.2, 0);
  root.add(rightWing);

  // 7. Sensor Mast Antenna
  const mastGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 12);
  const mast = new THREE.Mesh(mastGeom, armorMat);
  mast.name = 'Sensor_Mast';
  mast.position.set(0, 1.9, -0.6);
  root.add(mast);

  // Hover & Banking Animation
  const times = [0, 1.5, 3.0, 4.5, 6.0];
  const positionValues = [
    0, 1.2, 0,
    0, 1.45, 0.2,
    0, 1.2, 0,
    0, 1.05, -0.15,
    0, 1.2, 0,
  ];
  const rotationValues: number[] = [];
  const q = new THREE.Quaternion();

  const angles = [0, 0.08, 0, -0.08, 0];
  for (const a of angles) {
    q.setFromEuler(new THREE.Euler(a * 0.5, 0, a));
    rotationValues.push(q.x, q.y, q.z, q.w);
  }

  const posTrack = new THREE.VectorKeyframeTrack('.position', times, positionValues);
  const rotTrack = new THREE.QuaternionKeyframeTrack('.quaternion', times, rotationValues);
  const hoverClip = new THREE.AnimationClip('Hover_Patrol', 6.0, [posTrack, rotTrack]);

  return {
    id: 'drone',
    name: 'Explorer Drone MK4 (Segmented)',
    description: 'Multi-part hard-surface asset with hierarchy, PBR materials, and hover animation.',
    root,
    animations: [hoverClip],
  };
}

/**
 * Specimen containing intentional deterministic topology anomalies:
 * - 1 degenerate triangle (collinear area=0)
 * - 1 non-manifold edge (3 faces sharing edge)
 * - Boundary / open edges
 * - 1 needle / thin triangle
 */
export function createTopologyDiagnosticSpecimen(): SampleAsset {
  const root = new THREE.Group();
  root.name = 'Topology_Diagnostic_Specimen';

  const testMat = new THREE.MeshStandardMaterial({
    name: 'Mat_DiagnosticSurface',
    color: 0x64748b,
    roughness: 0.3,
    metalness: 0.4,
  });

  // Base platform: a 3x3 plane with normal topology
  const planeGeom = new THREE.PlaneGeometry(3, 3, 4, 4);
  planeGeom.rotateX(-Math.PI / 2);
  const baseMesh = new THREE.Mesh(planeGeom, testMat);
  baseMesh.name = 'Base_Substrate';
  root.add(baseMesh);

  // Anomaly 1: Degenerate triangle & Needle triangle
  // Create custom geometry with 3 vertices in a straight line
  const customGeom = new THREE.BufferGeometry();
  const positions = new Float32Array([
    // Triangle 0: Normal triangle
    -1.0, 0.5, -1.0,
     0.0, 0.5, -1.0,
    -0.5, 1.2, -1.0,

    // Triangle 1: Degenerate triangle (collinear points, area = 0)
    0.2, 0.5, -1.0,
    0.6, 0.5, -1.0,
    1.0, 0.5, -1.0,

    // Triangle 2: Needle / thin triangle (very high aspect ratio)
    -1.0, 0.5, 0.5,
     1.0, 0.5, 0.5,
     0.0, 0.505, 0.5,
  ]);
  const indices = new Uint16Array([
    0, 1, 2, // Normal
    3, 4, 5, // Degenerate!
    6, 7, 8, // Needle!
  ]);

  customGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  customGeom.setIndex(new THREE.BufferAttribute(indices, 1));
  customGeom.computeVertexNormals();

  const anomalyMesh = new THREE.Mesh(customGeom, testMat);
  anomalyMesh.name = 'Anomaly_NeedleAndDegenerate';
  root.add(anomalyMesh);

  // Anomaly 2: Non-manifold "T-junction" edge (3 triangles sharing edge along Y)
  const nonManifoldGeom = new THREE.BufferGeometry();
  const nmPositions = new Float32Array([
    0, 0.5, 0, // 0 (bottom of edge)
    0, 1.8, 0, // 1 (top of edge)
    0.8, 1.0, 0, // 2 (fin A)
    -0.8, 1.0, 0, // 3 (fin B)
    0, 1.0, 0.8, // 4 (fin C - 3rd triangle sharing edge 0-1)
  ]);
  const nmIndices = new Uint16Array([
    0, 1, 2,
    0, 1, 3,
    0, 1, 4, // 3 triangles share edge (0, 1) -> Non-manifold!
  ]);
  nonManifoldGeom.setAttribute('position', new THREE.BufferAttribute(nmPositions, 3));
  nonManifoldGeom.setIndex(new THREE.BufferAttribute(nmIndices, 1));
  nonManifoldGeom.computeVertexNormals();

  const nmMesh = new THREE.Mesh(nonManifoldGeom, testMat);
  nmMesh.name = 'Anomaly_NonManifoldEdge';
  root.add(nmMesh);

  return {
    id: 'topo-specimen',
    name: 'Topology Diagnostic Specimen',
    description: 'Deterministic benchmark containing known degenerate triangles, non-manifold edges, and needle faces.',
    root,
    animations: [],
  };
}

/**
 * Rigged skeletal robot character with bones, skinned mesh, and walk cycle with root motion
 */
export function createRiggedRobotCharacter(): SampleAsset {
  const root = new THREE.Group();
  root.name = 'Rigged_Bipedal_Unit';

  // 1. Create Bone Hierarchy
  const rootBone = new THREE.Bone();
  rootBone.name = 'Root';
  rootBone.position.set(0, 0, 0);

  const hipsBone = new THREE.Bone();
  hipsBone.name = 'Hips';
  hipsBone.position.set(0, 1.1, 0);
  rootBone.add(hipsBone);

  const spineBone = new THREE.Bone();
  spineBone.name = 'Spine';
  spineBone.position.set(0, 0.6, 0);
  hipsBone.add(spineBone);

  const headBone = new THREE.Bone();
  headBone.name = 'Head';
  headBone.position.set(0, 0.4, 0);
  spineBone.add(headBone);

  const leftLegBone = new THREE.Bone();
  leftLegBone.name = 'Leg_L';
  leftLegBone.position.set(-0.35, -0.5, 0);
  hipsBone.add(leftLegBone);

  const rightLegBone = new THREE.Bone();
  rightLegBone.name = 'Leg_R';
  rightLegBone.position.set(0.35, -0.5, 0);
  hipsBone.add(rightLegBone);

  const bones = [rootBone, hipsBone, spineBone, headBone, leftLegBone, rightLegBone];
  const skeleton = new THREE.Skeleton(bones);

  // 2. Skinned Cylinder Body
  const height = 2.2;
  const segmentHeight = height / 6;
  const geom = new THREE.CylinderGeometry(0.35, 0.35, height, 16, 6, false);
  geom.translate(0, height / 2, 0);

  // Compute skinIndices and skinWeights
  const position = geom.attributes.position;
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];

  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);

    if (y < 0.6) {
      // Legs
      const x = position.getX(i);
      const boneIdx = x < 0 ? 4 : 5;
      skinIndices.push(boneIdx, 1, 0, 0);
      skinWeights.push(0.8, 0.2, 0, 0);
    } else if (y < 1.4) {
      // Hips & Spine
      skinIndices.push(1, 2, 0, 0);
      skinWeights.push(0.6, 0.4, 0, 0);
    } else {
      // Spine & Head
      skinIndices.push(2, 3, 0, 0);
      skinWeights.push(0.5, 0.5, 0, 0);
    }
  }

  geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

  const mat = new THREE.MeshStandardMaterial({
    name: 'Mat_BipedArmor',
    color: 0x3b82f6,
    metalness: 0.7,
    roughness: 0.3,
  });

  const skinnedMesh = new THREE.SkinnedMesh(geom, mat);
  skinnedMesh.name = 'Mesh_BipedChassis';
  skinnedMesh.add(rootBone);
  skinnedMesh.bind(skeleton);
  root.add(skinnedMesh);

  // Walk Cycle with Root Motion
  const times = [0, 0.5, 1.0, 1.5, 2.0];
  // Root translation along Z: starts at 0, advances to 1.8m
  const rootPosValues = [
    0, 0, 0.0,
    0, 0, 0.45,
    0, 0, 0.9,
    0, 0, 1.35,
    0, 0, 1.8,
  ];
  const rootPosTrack = new THREE.VectorKeyframeTrack('Root.position', times, rootPosValues);

  // Leg swings
  const qLeft1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0, 0));
  const qLeft2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.4, 0, 0));
  const legTimes = [0, 0.5, 1.0, 1.5, 2.0];
  const legValues = [
    qLeft1.x, qLeft1.y, qLeft1.z, qLeft1.w,
    qLeft2.x, qLeft2.y, qLeft2.z, qLeft2.w,
    qLeft1.x, qLeft1.y, qLeft1.z, qLeft1.w,
    qLeft2.x, qLeft2.y, qLeft2.z, qLeft2.w,
    qLeft1.x, qLeft1.y, qLeft1.z, qLeft1.w,
  ];
  const legTrack = new THREE.QuaternionKeyframeTrack('Leg_L.quaternion', legTimes, legValues);

  const walkClip = new THREE.AnimationClip('Locomotion_Walk_Forward', 2.0, [rootPosTrack, legTrack]);

  return {
    id: 'rigged-robot',
    name: 'Rigged Bipedal Unit (Skeletal + Root Motion)',
    description: 'Armature with 6 bones, SkinnedMesh, bone weights, and root translation walk cycle.',
    root,
    animations: [walkClip],
  };
}
