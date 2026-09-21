import * as THREE from 'three';
import { SurgicalHealEngine } from './SurgicalHealEngine';

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

  return results;
}
