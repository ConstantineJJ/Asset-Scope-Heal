import * as THREE from 'three';

export interface SampleAsset {
  id: string;
  name: string;
  description: string;
  root: THREE.Group;
  animations: THREE.AnimationClip[];
}

/**
 * Single procedural "test patient" for Asset Doctor.
 *
 * It intentionally mixes:
 * - repairable defects used by the current Surgical Heal operations;
 * - diagnostic-only defects used to verify that Asset Doctor does not over-repair;
 * - a small rig + animation so one built-in asset still exercises skeleton/animation paths.
 *
 * The asset is deterministic and recreated from scratch for verified export tests.
 */
export function createAssetDoctorTestPatient(): SampleAsset {
  const root = new THREE.Group();
  root.name = 'Asset_Doctor_Test_Patient';

  const repairableGroup = new THREE.Group();
  repairableGroup.name = 'Repairable_Findings';
  root.add(repairableGroup);

  const manualGroup = new THREE.Group();
  manualGroup.name = 'Manual_Review_Findings';
  root.add(manualGroup);

  const rigGroup = new THREE.Group();
  rigGroup.name = 'Rig_And_Animation_Control';
  root.add(rigGroup);

  const repairMat = new THREE.MeshStandardMaterial({
    name: 'Mat_Repairable',
    color: 0x16a34a,
    metalness: 0.25,
    roughness: 0.4,
    side: THREE.DoubleSide,
  });

  const warningMat = new THREE.MeshStandardMaterial({
    name: 'Mat_ManualReview',
    color: 0xf59e0b,
    metalness: 0.1,
    roughness: 0.55,
    side: THREE.DoubleSide,
  });

  const rigMat = new THREE.MeshStandardMaterial({
    name: 'Mat_RigControl',
    color: 0x2563eb,
    metalness: 0.35,
    roughness: 0.35,
  });

  // ---------------------------------------------------------------------------
  // 1) Repair target
  // ---------------------------------------------------------------------------
  // 3 indexed triangles:
  // - one valid triangle
  // - one degenerate / collinear triangle
  // - one needle / very thin triangle
  //
  // Two extra vertices (9, 10) are unreferenced from the start. Removing the
  // degenerate triangle later creates three more unreferenced vertices (3, 4, 5),
  // giving a deterministic second-stage test for Remove Unreferenced Vertices.
  const repairGeometry = new THREE.BufferGeometry();
  repairGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    // Valid triangle
    -1.20, 0.40, 0.00,
    -0.20, 0.40, 0.00,
    -0.70, 1.10, 0.00,

    // Degenerate triangle: collinear
     0.05, 0.40, 0.00,
     0.45, 0.40, 0.00,
     0.85, 0.40, 0.00,

    // Needle triangle
    -1.10, 0.35, 0.80,
     0.90, 0.35, 0.80,
    -0.10, 0.355, 0.80,

    // Intentionally unreferenced vertices
     0.00, 1.80, 0.20,
     0.30, 1.95, 0.30,
  ], 3));

  repairGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0.0, 0.0,  1.0, 0.0,  0.5, 1.0,
    0.0, 0.0,  0.5, 0.0,  1.0, 0.0,
    0.0, 0.0,  1.0, 0.0,  0.5, 0.01,
    0.25, 0.75, 0.75, 0.75,
  ], 2));

  repairGeometry.setIndex([
    0, 1, 2,
    3, 4, 5,
    6, 7, 8,
  ]);
  repairGeometry.computeVertexNormals();

  const repairMesh = new THREE.Mesh(repairGeometry, repairMat);
  repairMesh.name = 'Repair_Target_Degenerate_And_Loose_Vertices';
  repairMesh.position.set(-1.1, 0, 0);
  repairableGroup.add(repairMesh);

  // ---------------------------------------------------------------------------
  // 2) Exact duplicate weld target
  // ---------------------------------------------------------------------------
  // Two triangles form a visual quad, but the shared edge is duplicated in the
  // vertex domain. The duplicate pairs have exactly matching position, normal
  // and UV attributes. Welding them reduces vertices and boundary edges without
  // introducing a topology regression.
  const duplicateGeometry = new THREE.BufferGeometry();
  duplicateGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    // Triangle A: A, B, C
    -0.70, 0.10, 0.00,
     0.00, 0.10, 0.00,
     0.00, 0.80, 0.00,

    // Triangle B: duplicate B, D, duplicate C
     0.00, 0.10, 0.00,
     0.70, 0.80, 0.00,
     0.00, 0.80, 0.00,
  ], 3));
  duplicateGeometry.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ], 3));
  duplicateGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0,
    0.5, 0,
    0.5, 1,
    0.5, 0,
    1, 1,
    0.5, 1,
  ], 2));
  duplicateGeometry.setIndex([0, 1, 2, 3, 4, 5]);

  const duplicateMesh = new THREE.Mesh(duplicateGeometry, repairMat);
  duplicateMesh.name = 'Repair_Target_Exact_Duplicate_Vertices';
  duplicateMesh.position.set(-0.15, 0, 1.75);
  repairableGroup.add(duplicateMesh);

  // ---------------------------------------------------------------------------
  // 3) Diagnostic-only non-manifold control
  // ---------------------------------------------------------------------------
  // Three triangles deliberately share the same edge (0, 1).
  // This finding should remain diagnostic-only until a dedicated repair strategy
  // exists, making it useful for verifying that Heal does not "fix everything".
  const nonManifoldGeometry = new THREE.BufferGeometry();
  nonManifoldGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0.0, 0.25, 0.0,
    0.0, 1.55, 0.0,
    0.8, 0.90, 0.0,
   -0.8, 0.90, 0.0,
    0.0, 0.90, 0.8,
  ], 3));
  nonManifoldGeometry.setIndex([
    0, 1, 2,
    0, 1, 3,
    0, 1, 4,
  ]);
  nonManifoldGeometry.computeVertexNormals();

  const nonManifoldMesh = new THREE.Mesh(nonManifoldGeometry, warningMat);
  nonManifoldMesh.name = 'Manual_Control_NonManifold_Edge';
  nonManifoldMesh.position.set(1.2, 0, 0);
  manualGroup.add(nonManifoldMesh);

  // ---------------------------------------------------------------------------
  // 4) Repairable zero-normal control
  // ---------------------------------------------------------------------------
  // Valid indexed triangle, but its normal stream is intentionally zeroed.
  const zeroNormalGeometry = new THREE.BufferGeometry();
  zeroNormalGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.55, 0.15, 0.0,
     0.55, 0.15, 0.0,
     0.00, 0.95, 0.0,
  ], 3));
  zeroNormalGeometry.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 0, 0,
    0, 0, 0,
    0, 0, 0,
  ], 3));
  zeroNormalGeometry.setIndex([0, 1, 2]);

  const zeroNormalMesh = new THREE.Mesh(zeroNormalGeometry, repairMat);
  zeroNormalMesh.name = 'Repair_Target_Zero_Normals';
  zeroNormalMesh.position.set(1.2, 0, 1.25);
  repairableGroup.add(zeroNormalMesh);

  // Missing-normal control: valid topology with no normal attribute at all.
  const missingNormalGeometry = new THREE.BufferGeometry();
  missingNormalGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.45, 0.10, 0.0,
     0.45, 0.10, 0.0,
     0.00, 0.75, 0.0,
  ], 3));
  missingNormalGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0,
    1, 0,
    0.5, 1,
  ], 2));
  missingNormalGeometry.setIndex([0, 1, 2]);

  const missingNormalMesh = new THREE.Mesh(missingNormalGeometry, repairMat);
  missingNormalMesh.name = 'Repair_Target_Missing_Normals';
  missingNormalMesh.position.set(2.15, 0, 1.25);
  repairableGroup.add(missingNormalMesh);

  // ---------------------------------------------------------------------------
  // 5) Small rig + animation control
  // ---------------------------------------------------------------------------
  // Clean geometry with a tiny skeleton. One extra locator bone is deliberately
  // unused by skin weights, so rig diagnostics still have useful evidence.
  const rigGeometry = new THREE.BoxGeometry(0.55, 1.4, 0.45, 1, 4, 1);
  rigGeometry.translate(0, 0.7, 0);

  const rigPositions = rigGeometry.getAttribute('position');
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];

  for (let i = 0; i < rigPositions.count; i++) {
    const y = rigPositions.getY(i);
    if (y < 0.75) skinIndices.push(0, 1, 0, 0);
    else skinIndices.push(1, 0, 0, 0);

    // First two vertices intentionally use non-normalized but non-zero weights
    // regardless of BoxGeometry vertex ordering, keeping the test deterministic.
    if (i === 0) skinWeights.push(0.60, 0.20, 0, 0);      // sum 0.80
    else if (i === 1) skinWeights.push(0.90, 0.30, 0, 0); // sum 1.20
    else skinWeights.push(0.85, 0.15, 0, 0);
  }

  rigGeometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  rigGeometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

  const rootBone = new THREE.Bone();
  rootBone.name = 'TestRoot';
  rootBone.position.set(0, 0, 0);

  const tipBone = new THREE.Bone();
  tipBone.name = 'TestTip';
  tipBone.position.set(0, 0.8, 0);
  rootBone.add(tipBone);

  const locatorBone = new THREE.Bone();
  locatorBone.name = 'UnusedLocator';
  locatorBone.position.set(0.35, 0.35, 0);
  rootBone.add(locatorBone);

  const skeleton = new THREE.Skeleton([rootBone, tipBone, locatorBone]);
  const rigMesh = new THREE.SkinnedMesh(rigGeometry, rigMat);
  rigMesh.name = 'Rig_Control_SkinnedMesh';
  rigMesh.add(rootBone);
  rigMesh.bind(skeleton);
  rigMesh.position.set(0.0, 0, -1.3);
  rigGroup.add(rigMesh);

  const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.15));
  const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.15));
  const q2 = new THREE.Quaternion().copy(q0);
  const clip = new THREE.AnimationClip('Diagnostic_Bone_Sway', 2.0, [
    new THREE.QuaternionKeyframeTrack(
      'TestTip.quaternion',
      [0, 1, 2],
      [
        q0.x, q0.y, q0.z, q0.w,
        q1.x, q1.y, q1.z, q1.w,
        q2.x, q2.y, q2.z, q2.w,
      ]
    ),
  ]);

  return {
    id: 'test-patient',
    name: 'Asset Doctor Test Patient',
    description: 'Single deterministic specimen with repairable and diagnostic-only defects, plus rig and animation controls.',
    root,
    animations: [clip],
  };
}
