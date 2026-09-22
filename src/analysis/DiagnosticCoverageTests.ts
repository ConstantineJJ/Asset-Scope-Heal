import * as THREE from 'three';
import type { DiagnosticCoreTestResult } from './DiagnosticCoreTests';
import { analyzeIntegrity } from './IntegrityAnalyzer';
import { analyzeAnimationDiagnostics } from './AnimationDiagnostics';
import { analyzeNormalsAndUv } from './NormalsAndUvAnalyzer';
import { analyzeTransforms } from './TransformAnalyzer';

export function runDiagnosticCoverageTests(): DiagnosticCoreTestResult[] {
  const results: DiagnosticCoreTestResult[] = [];

  {
    const root = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
    );
    geometry.setIndex([0, 1, 7]);
    root.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));

    const issues = analyzeIntegrity(root);
    const finding = issues.find((issue) => issue.id === 'integrity-invalid-indices');

    results.push({
      name: 'Integrity Invalid Index Test',
      description: 'Out-of-range mesh indices must be reported as Integrity errors.',
      expected: 'integrity-invalid-indices / ERROR / Integrity',
      actual: finding ? `${finding.id} / ${finding.severity} / ${finding.layer}` : 'missing',
      passed: finding?.severity === 'ERROR' && finding.layer === 'Integrity',
    });
  }

  {
    const root = new THREE.Group();
    const target = new THREE.Object3D();
    target.name = 'Existing';
    root.add(target);

    const clip = new THREE.AnimationClip('BrokenTargets', 1, [
      new THREE.VectorKeyframeTrack('Missing.position', [0, 1], [0, 0, 0, 1, 0, 0]),
    ]);

    const issues = analyzeAnimationDiagnostics([clip], root);
    const finding = issues.find((issue) => issue.id === 'animation-invalid-targets');

    results.push({
      name: 'Animation Target Integrity Test',
      description: 'Animation tracks pointing to missing nodes must be Integrity errors.',
      expected: 'animation-invalid-targets / ERROR / Integrity',
      actual: finding ? `${finding.id} / ${finding.severity} / ${finding.layer}` : 'missing',
      passed: finding?.severity === 'ERROR' && finding.layer === 'Integrity',
    });
  }

  {
    const root = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
    );
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3)
    );
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 2));
    geometry.setIndex([0, 1, 2]);
    root.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));

    const issues = analyzeNormalsAndUv(root);
    const finding = issues.find((issue) => issue.id === 'uv-zero-area-triangles');

    results.push({
      name: 'Zero Area UV Triangle Test',
      description: 'Collapsed UV0 triangles must be reported without attempting UV regeneration.',
      expected: 'uv-zero-area-triangles / WARNING',
      actual: finding ? `${finding.id} / ${finding.severity}` : 'missing',
      passed: finding?.severity === 'WARNING' && finding.repairability === 'MANUAL',
    });
  }

  {
    const root = new THREE.Group();
    root.rotation.y = Math.PI / 2;
    const child = new THREE.Object3D();
    child.name = 'ScaledRotated';
    child.scale.set(2, 1, 1);
    child.rotation.z = Math.PI / 4;
    root.add(child);

    const issues = analyzeTransforms(root);
    const rootRotation = issues.find((issue) => issue.id === 'transform-root-rotation');
    const combination = issues.find((issue) => issue.id === 'transform-suspicious-combinations');

    results.push({
      name: 'Transform Context Test',
      description: 'Unusual root rotation and non-uniform-scale+rotation combinations should be informational diagnostics.',
      expected: 'root rotation INFO + suspicious combination INFO',
      actual: `root=${rootRotation?.severity ?? 'missing'}, combination=${combination?.severity ?? 'missing'}`,
      passed: rootRotation?.severity === 'INFO' && combination?.severity === 'INFO',
    });
  }

  return results;
}
