import * as THREE from 'three';
import { SurgicalHealEngine } from './SurgicalHealEngine';
import { healMetrics, verifyHeal } from './HealVerification';
import { readHealReport, saveHealReport } from './HealReportStorage';
import { analyzeMeshTopology } from '../analysis/TopologyAnalyzer';
import { meshTopologyData } from '../analysis/MeshTopologyData';

export interface SurgicalHealTestResult {
  name: string;
  description: string;
  expected: string;
  actual: string;
  passed: boolean;
}

function makeDegenerateFixture() {
  const root = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,

        2, 0, 0,
        3, 0, 0,
        4, 0, 0,
      ],
      3
    )
  );
  geometry.setIndex([0, 1, 2, 3, 4, 5]);

  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = 'DegenerateFixture';
  root.add(mesh);

  return { root, mesh };
}

export function runSurgicalHealTests(): SurgicalHealTestResult[] {
  const results: SurgicalHealTestResult[] = [];

  {
    const { root, mesh } = makeDegenerateFixture();
    const engine = new SurgicalHealEngine();
    const preview = engine.previewRemoveDegenerateTriangles(root, mesh.uuid);

    results.push({
      name: 'Surgical Heal Preview Test',
      description: 'Preview must detect the degenerate face without mutating the mesh.',
      expected: 'READY, 2 → 1 triangles, source still 2 triangles',
      actual: `${preview.status}, ${preview.trianglesBefore} → ${preview.trianglesAfter}, source=${(mesh.geometry.index?.count ?? 0) / 3}`,
      passed:
        preview.status === 'READY' &&
        preview.affectedTriangles === 1 &&
        preview.trianglesBefore === 2 &&
        preview.trianglesAfter === 1 &&
        mesh.geometry.index?.count === 6,
    });

    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }

  {
    const { root, mesh } = makeDegenerateFixture();
    const engine = new SurgicalHealEngine();
    engine.previewRemoveDegenerateTriangles(root, mesh.uuid);
    const applied = engine.applyPending(root);
    const afterApply = (mesh.geometry.index?.count ?? 0) / 3;
    const undone = engine.undoLast(root);
    const afterUndo = (mesh.geometry.index?.count ?? 0) / 3;

    results.push({
      name: 'Surgical Heal Apply + Undo Test',
      description: 'Apply changes only the index buffer and Undo restores the exact triangle count.',
      expected: 'apply=1 triangle, undo=2 triangles',
      actual: `apply=${afterApply}, undo=${afterUndo}, success=${applied.success && undone.success}`,
      passed: applied.success && undone.success && afterApply === 1 && afterUndo === 2,
    });

    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }

  {
    const { root, mesh } = makeDegenerateFixture();
    mesh.geometry.addGroup(0, 6, 0);

    const engine = new SurgicalHealEngine();
    const preview = engine.previewRemoveDegenerateTriangles(root, mesh.uuid);

    results.push({
      name: 'Surgical Heal Safety Gate Test',
      description: 'v0.1 must refuse grouped geometry instead of risking material-group corruption.',
      expected: 'BLOCKED with source geometry unchanged',
      actual: `${preview.status}, triangles=${(mesh.geometry.index?.count ?? 0) / 3}`,
      passed: preview.status === 'BLOCKED' && mesh.geometry.index?.count === 6,
    });

    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }

  const test = (name: string, check: () => boolean) => {
    let passed = false;
    let actual = 'Contract not satisfied';
    try { passed = check(); actual = passed ? 'Contract satisfied' : actual; }
    catch (error) { actual = String(error); }
    results.push({ name, description: name, expected: 'Contract satisfied', actual, passed });
  };
  const fixtureTest = (name: string, check: (fixture: ReturnType<typeof makeDegenerateFixture>, engine: SurgicalHealEngine) => boolean) => {
    test(name, () => {
      const fixture = makeDegenerateFixture();
      try { return check(fixture, new SurgicalHealEngine()); }
      finally { fixture.mesh.geometry.dispose(); (fixture.mesh.material as THREE.Material).dispose(); }
    });
  };

  fixtureTest('Measured report survives vanished issue and Undo', ({ root, mesh }, engine) => {
    const original = Array.from(mesh.geometry.index!.array);
    const positions = mesh.geometry.attributes.position;
    engine.previewRemoveDegenerateTriangles(root, mesh.uuid);
    const result = engine.applyPending(root, 'Test asset');
    const pending = engine.getLastOperation()!;
    engine.completeVerification(pending.operationId, true);
    const report = engine.getLastOperation()!;
    const undo = engine.undoLast(root);
    return result.success && pending.status === 'PARTIAL' && report.status === 'VERIFIED' &&
      report.before.triangleCount === 2 && report.after?.triangleCount === 1 &&
      report.before.degenerateTriangles === 1 && report.after.degenerateTriangles === 0 &&
      report.after.isolatedVertices === 3 && report.reasons.includes('retainedVertices') &&
      positions === mesh.geometry.attributes.position && undo.success &&
      Array.from(mesh.geometry.index!.array).every((value, i) => value === original[i]) &&
      Boolean(engine.getLastOperation()?.undoneAt);
  });

  for (const [label, change] of [
    ['same-size index edit', (mesh: THREE.Mesh) => mesh.geometry.index!.setX(0, 1)],
    ['position edit', (mesh: THREE.Mesh) => mesh.geometry.attributes.position.setX(0, 8)],
    ['new material groups', (mesh: THREE.Mesh) => mesh.geometry.addGroup(0, 6, 0)],
    ['new draw range', (mesh: THREE.Mesh) => mesh.geometry.setDrawRange(0, 3)],
    ['new UV attribute', (mesh: THREE.Mesh) => mesh.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(12), 2))],
    ['new morph attribute', (mesh: THREE.Mesh) => { mesh.geometry.morphAttributes.position = [mesh.geometry.attributes.position.clone()]; }],
  ] as const) {
    fixtureTest(`Stale Preview blocks ${label}`, ({ root, mesh }, engine) => {
      engine.previewRemoveDegenerateTriangles(root, mesh.uuid);
      change(mesh);
      return !engine.applyPending(root).success && mesh.geometry.index!.count === 6 && !engine.getUndoState().available;
    });
  }

  fixtureTest('New geometry sharing blocks Apply', ({ root, mesh }, engine) => {
    engine.previewRemoveDegenerateTriangles(root, mesh.uuid);
    root.add(new THREE.Mesh(mesh.geometry, mesh.material));
    return !engine.applyPending(root).success && mesh.geometry.index!.count === 6;
  });
  fixtureTest('Stale Undo preserves later edits', ({ root, mesh }, engine) => {
    engine.previewRemoveDegenerateTriangles(root, mesh.uuid);
    engine.applyPending(root);
    mesh.geometry.index!.setX(0, 2);
    return !engine.undoLast(root).success && mesh.geometry.index!.getX(0) === 2 && engine.getUndoState().available;
  });
  fixtureTest('Undo refuses newly shared geometry', ({ root, mesh }, engine) => {
    engine.previewRemoveDegenerateTriangles(root, mesh.uuid); engine.applyPending(root);
    root.add(new THREE.Mesh(mesh.geometry, mesh.material));
    return !engine.undoLast(root).success && mesh.geometry.index!.count === 3;
  });
  fixtureTest('Failed refresh remains PARTIAL with Undo', ({ root, mesh }, engine) => {
    engine.previewRemoveDegenerateTriangles(root, mesh.uuid); engine.applyPending(root);
    engine.completeVerification(engine.getLastOperation()!.operationId, false);
    return engine.getLastOperation()?.status === 'PARTIAL' && engine.getUndoState().available;
  });
  fixtureTest('Regression from new boundary takes precedence over failed refresh', ({ root, mesh }, engine) => {
    // A collinear face shares two edges with valid faces; removing it exposes extra boundaries.
    mesh.geometry.setIndex([0, 1, 2, 1, 3, 2, 0, 1, 3]);
    engine.previewRemoveDegenerateTriangles(root, mesh.uuid); engine.applyPending(root);
    engine.completeVerification(engine.getLastOperation()!.operationId, false);
    const report = engine.getLastOperation()!;
    return report.status === 'REGRESSION' && report.reasons.includes('boundaryEdges') && engine.undoLast(root).success;
  });
  fixtureTest('Classifier distinguishes residual defects, missing evidence and unexpected changes', ({ mesh }, _engine) => {
    const before = healMetrics(analyzeMeshTopology(meshTopologyData(mesh)));
    return verifyHeal(before, { ...before, triangleCount: 1 }, 1, true).status === 'PARTIAL' &&
      verifyHeal(before, null, 1, true).status === 'PARTIAL' &&
      verifyHeal(before, null, 1, false).status === 'REGRESSION' &&
      verifyHeal(before, { ...before, triangleCount: 1, degenerateTriangles: 0 }, 1, false).status === 'REGRESSION';
  });
  fixtureTest('Tampered Apply is measured rather than trusted', ({ root, mesh }, engine) => {
    engine.previewRemoveDegenerateTriangles(root, mesh.uuid);
    const setIndex = mesh.geometry.setIndex.bind(mesh.geometry);
    mesh.geometry.setIndex = () => setIndex([0, 1, 2, 3, 4, 5]);
    engine.applyPending(root);
    return engine.getLastOperation()?.status === 'REGRESSION' && engine.getLastOperation()?.after?.triangleCount === 2;
  });
  fixtureTest('Report storage roundtrip, corruption and denied storage', ({ root, mesh }, engine) => {
    engine.previewRemoveDegenerateTriangles(root, mesh.uuid); engine.applyPending(root);
    let value = '';
    const storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
    const saved = saveHealReport(engine.getLastOperation()!, storage);
    const read = readHealReport(storage);
    value = '{bad json';
    const corrupted = readHealReport(storage);
    const denied = { getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('denied'); } };
    return saved && read?.status === 'PARTIAL' && read.meshUuid === mesh.uuid && corrupted === null &&
      readHealReport(denied) === null && !saveHealReport(engine.getLastOperation()!, denied);
  });
  fixtureTest('Asset switch clears Undo and rejects old verification completion', ({ root, mesh }, engine) => {
    engine.previewRemoveDegenerateTriangles(root, mesh.uuid); engine.applyPending(root);
    const id = engine.getLastOperation()!.operationId;
    engine.clear(); engine.completeVerification(id, true);
    return engine.getLastOperation() === null && !engine.getUndoState().available;
  });
  fixtureTest('Report returned to UI is an independent snapshot', ({ root, mesh }, engine) => {
    engine.previewRemoveDegenerateTriangles(root, mesh.uuid); engine.applyPending(root);
    const report = engine.getLastOperation()!;
    report.before.triangleCount = 999;
    return engine.getLastOperation()?.before.triangleCount === 2;
  });
  fixtureTest('Unavailable post-measurement retains Undo and cannot become VERIFIED', ({ root, mesh }, engine) => {
    engine.previewRemoveDegenerateTriangles(root, mesh.uuid);
    const setIndex = mesh.geometry.setIndex.bind(mesh.geometry);
    const matrix = mesh.matrixWorld;
    mesh.geometry.setIndex = index => {
      const result = setIndex(index);
      Object.defineProperty(mesh, 'matrixWorld', { configurable: true, get() { throw Error('measurement unavailable'); } });
      return result;
    };
    const applied = engine.applyPending(root);
    engine.completeVerification(engine.getLastOperation()!.operationId, true);
    Object.defineProperty(mesh, 'matrixWorld', { configurable: true, value: matrix, writable: true });
    mesh.geometry.setIndex = setIndex;
    return applied.success && engine.getLastOperation()?.after === null &&
      engine.getLastOperation()?.status === 'PARTIAL' && engine.undoLast(root).success;
  });
  fixtureTest('Before measurement failure makes no changes', ({ root, mesh }, engine) => {
    engine.previewRemoveDegenerateTriangles(root, mesh.uuid);
    Object.defineProperty(mesh, 'matrixWorld', { get() { throw Error('before unavailable'); } });
    return !engine.applyPending(root).success && mesh.geometry.index!.count === 6 && engine.getLastOperation() === null;
  });
  fixtureTest('Removing all triangles reports empty-mesh REGRESSION', ({ root, mesh }, engine) => {
    mesh.geometry.setIndex([3, 4, 5]);
    engine.previewRemoveDegenerateTriangles(root, mesh.uuid); engine.applyPending(root);
    return engine.getLastOperation()?.status === 'REGRESSION' && engine.getLastOperation()?.reasons.includes('emptyMesh') === true;
  });
  fixtureTest('Repeated Apply cannot mutate twice', ({ root, mesh }, engine) => {
    engine.previewRemoveDegenerateTriangles(root, mesh.uuid); engine.applyPending(root);
    return !engine.applyPending(root).success && mesh.geometry.index!.count === 3;
  });
  fixtureTest('Morph bounds do not change base-topology repair threshold', ({ root, mesh }, engine) => {
    const morph = mesh.geometry.attributes.position.clone();
    morph.setX(0, 1e12);
    mesh.geometry.morphAttributes.position = [morph];
    const preview = engine.previewRemoveDegenerateTriangles(root, mesh.uuid);
    engine.applyPending(root);
    return preview.affectedTriangles === 1 && engine.getLastOperation()?.targetStatus === 'VERIFIED' &&
      mesh.geometry.morphAttributes.position[0] === morph;
  });
  for (const [label, mutate] of [
    ['invalid index', (mesh: THREE.Mesh) => mesh.geometry.index!.setX(0, 999)],
    ['non-finite position', (mesh: THREE.Mesh) => mesh.geometry.attributes.position.setX(0, NaN)],
    ['incomplete triangle', (mesh: THREE.Mesh) => mesh.geometry.setIndex([0, 1, 2, 3])],
    ['non-indexed geometry', (mesh: THREE.Mesh) => mesh.geometry.setIndex(null)],
  ] as const) {
    fixtureTest(`Invalid input blocks ${label}`, ({ root, mesh }, engine) => {
      mutate(mesh);
      return engine.previewRemoveDegenerateTriangles(root, mesh.uuid).status === 'BLOCKED' && !engine.applyPending(root).success;
    });
  }
  fixtureTest('Verified live Heal state is exportable and later geometry edits are rejected', ({ root, mesh }, engine) => {
    engine.previewRemoveDegenerateTriangles(root, mesh.uuid);
    engine.applyPending(root, 'ExportFixture.glb');
    const id = engine.getLastOperation()!.operationId;
    engine.completeVerification(id, true);
    const verified = engine.getLastOperation()!;
    const beforeEdit = engine.validateCurrentVerifiedState(root, verified).ok;
    mesh.geometry.index!.setX(0, mesh.geometry.index!.getX(0) === 0 ? 1 : 0);
    const afterEdit = engine.validateCurrentVerifiedState(root, verified);
    return beforeEdit && !afterEdit.ok && afterEdit.reasonKey === 'export.errors.geometryChanged';
  });

  fixtureTest('Historical or undone Heal report cannot authorize export', ({ root, mesh }, engine) => {
    engine.previewRemoveDegenerateTriangles(root, mesh.uuid);
    engine.applyPending(root, 'ExportFixture.glb');
    const id = engine.getLastOperation()!.operationId;
    engine.completeVerification(id, true);
    const report = engine.getLastOperation()!;

    const historicalEngine = new SurgicalHealEngine();
    const historicalBlocked = historicalEngine.validateCurrentVerifiedState(root, report).reasonKey === 'export.errors.historicalReport';

    engine.undoLast(root);
    const undone = engine.getLastOperation()!;
    const undoneBlocked = engine.validateCurrentVerifiedState(root, undone).reasonKey === 'export.errors.healNotVerified';

    return historicalBlocked && undoneBlocked;
  });

  fixtureTest('Topology extraction respects interleaved attributes and local scale', ({ root, mesh }, engine) => {
    const data = new THREE.InterleavedBuffer(new Float32Array([
      0,0,0,99, 1,0,0,99, 0,1,0,99, 2,0,0,99, 3,0,0,99, 4,0,0,99,
    ]), 4);
    mesh.geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(data, 3, 0));
    root.scale.setScalar(1e8);
    const before = analyzeMeshTopology(meshTopologyData(mesh));
    engine.previewRemoveDegenerateTriangles(root, mesh.uuid); engine.applyPending(root);
    return before.vertexCount === 6 && before.degenerateTriangles === 1 && engine.getLastOperation()?.after?.degenerateTriangles === 0;
  });
  return results;
}
