import { analyzeMeshTopology, type RawMeshData } from './TopologyAnalyzer';

export interface TopologyTestResult {
  name: string;
  description: string;
  passed: boolean;
  expected: string;
  actual: string;
  details: string;
}

/**
 * Deterministic synthetic tests covering all required edge cases:
 * - single triangle
 * - quad made of two triangles
 * - open mesh
 * - closed manifold mesh (cube)
 * - degenerate triangle
 * - two disconnected meshes
 * - non-manifold edge (3 triangles sharing 1 edge)
 */
export function runSyntheticTopologyTests(): TopologyTestResult[] {
  const results: TopologyTestResult[] = [];

  // 1. Single Triangle
  {
    const positions = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ]);
    const indices = new Uint16Array([0, 1, 2]);
    const stats = analyzeMeshTopology({
      uuid: 'test-single-tri',
      name: 'Single Triangle',
      positions,
      indices,
      boundingBoxDiagonal: 1.414,
    });

    const passed =
      stats.triangleCount === 1 &&
      stats.degenerateTriangles === 0 &&
      stats.boundaryEdges === 3 &&
      stats.nonManifoldEdges === 0 &&
      stats.componentsCount === 1;

    results.push({
      name: 'Single Triangle Test',
      description: 'Single isolated triangle with 3 boundary edges',
      passed,
      expected: '1 tri, 0 degenerate, 3 boundary edges, 0 non-manifold',
      actual: `${stats.triangleCount} tri, ${stats.degenerateTriangles} deg, ${stats.boundaryEdges} boundary, ${stats.nonManifoldEdges} non-manifold`,
      details: passed ? 'Passed deterministically.' : 'Failed to meet criteria.',
    });
  }

  // 2. Quad Made of Two Triangles
  {
    const positions = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      1, 1, 0,
      0, 1, 0,
    ]);
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    const stats = analyzeMeshTopology({
      uuid: 'test-quad',
      name: 'Quad (2 Triangles)',
      positions,
      indices,
      boundingBoxDiagonal: 1.414,
    });

    const passed =
      stats.triangleCount === 2 &&
      stats.degenerateTriangles === 0 &&
      stats.boundaryEdges === 4 &&
      stats.nonManifoldEdges === 0 &&
      stats.componentsCount === 1;

    results.push({
      name: 'Quad Mesh Test',
      description: 'Two shared triangles forming a quad with 4 boundary edges and 1 manifold inner edge',
      passed,
      expected: '2 tri, 0 degenerate, 4 boundary edges, 1 component',
      actual: `${stats.triangleCount} tri, ${stats.degenerateTriangles} deg, ${stats.boundaryEdges} boundary, ${stats.componentsCount} component(s)`,
      details: passed ? 'Passed deterministically.' : 'Failed.',
    });
  }

  // 3. Open Mesh (3 triangles in a strip)
  {
    const positions = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      1, 1, 0,
      2, 0, 0,
      2, 1, 0,
    ]);
    const indices = new Uint16Array([0, 1, 2, 1, 3, 2, 1, 4, 3]);
    const stats = analyzeMeshTopology({
      uuid: 'test-open-strip',
      name: 'Open Triangle Strip',
      positions,
      indices,
      boundingBoxDiagonal: 2.23,
    });

    const passed = stats.boundaryEdges > 0 && stats.nonManifoldEdges === 0;

    results.push({
      name: 'Open Mesh Test',
      description: 'Strip of connected triangles with non-zero boundary edges',
      passed,
      expected: 'boundaryEdges > 0, nonManifoldEdges == 0',
      actual: `${stats.boundaryEdges} boundary edges, ${stats.nonManifoldEdges} non-manifold edges`,
      details: passed ? 'Passed deterministically.' : 'Failed.',
    });
  }

  // 4. Closed Manifold Mesh (Cube with 12 triangles)
  {
    // 8 vertices of a unit cube
    const positions = new Float32Array([
      -0.5, -0.5, -0.5, // 0
       0.5, -0.5, -0.5, // 1
       0.5,  0.5, -0.5, // 2
      -0.5,  0.5, -0.5, // 3
      -0.5, -0.5,  0.5, // 4
       0.5, -0.5,  0.5, // 5
       0.5,  0.5,  0.5, // 6
      -0.5,  0.5,  0.5, // 7
    ]);
    // 6 faces * 2 triangles = 12 triangles
    const indices = new Uint16Array([
      // front
      4, 5, 6, 4, 6, 7,
      // back
      1, 0, 3, 1, 3, 2,
      // top
      3, 2, 6, 3, 6, 7,
      // bottom
      0, 1, 5, 0, 5, 4,
      // right
      1, 2, 6, 1, 6, 5,
      // left
      0, 4, 7, 0, 7, 3,
    ]);
    const stats = analyzeMeshTopology({
      uuid: 'test-closed-cube',
      name: 'Closed Manifold Cube',
      positions,
      indices,
      boundingBoxDiagonal: 1.732,
    });

    const passed =
      stats.triangleCount === 12 &&
      stats.boundaryEdges === 0 &&
      stats.nonManifoldEdges === 0 &&
      stats.degenerateTriangles === 0 &&
      stats.componentsCount === 1;

    results.push({
      name: 'Closed Manifold Cube Test',
      description: 'Watertight box: exactly 0 boundary edges and 0 non-manifold edges',
      passed,
      expected: '12 tri, 0 boundary edges, 0 non-manifold edges',
      actual: `${stats.triangleCount} tri, ${stats.boundaryEdges} boundary, ${stats.nonManifoldEdges} non-manifold`,
      details: passed ? 'Passed deterministically.' : 'Failed.',
    });
  }

  // 5. Degenerate Triangle
  {
    // 3 collinear or overlapping vertices
    const positions = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      2, 0, 0, // collinear points -> area = 0
    ]);
    const indices = new Uint16Array([0, 1, 2]);
    const stats = analyzeMeshTopology({
      uuid: 'test-degenerate',
      name: 'Collinear Degenerate Triangle',
      positions,
      indices,
      boundingBoxDiagonal: 2.0,
    });

    const passed = stats.degenerateTriangles === 1;

    results.push({
      name: 'Degenerate Triangle Test',
      description: 'Collinear points yielding cross product area = 0',
      passed,
      expected: '1 degenerate triangle',
      actual: `${stats.degenerateTriangles} degenerate triangle(s)`,
      details: passed ? 'Passed deterministically.' : 'Failed to flag collinear face.',
    });
  }

  // 6. Two Disconnected Meshes
  {
    const positions = new Float32Array([
      // Component A (triangle 1)
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      // Component B (triangle 2, separated in space)
      10, 10, 10,
      11, 10, 10,
      10, 11, 10,
    ]);
    const indices = new Uint16Array([0, 1, 2, 3, 4, 5]);
    const stats = analyzeMeshTopology({
      uuid: 'test-two-components',
      name: 'Disconnected Meshes',
      positions,
      indices,
      boundingBoxDiagonal: 15.0,
    });

    const passed = stats.componentsCount === 2;

    results.push({
      name: 'Disconnected Components Test',
      description: 'Two separate triangles sharing no common edges or vertices',
      passed,
      expected: '2 connected components',
      actual: `${stats.componentsCount} component(s)`,
      details: passed ? 'Passed deterministically.' : 'Failed.',
    });
  }

  // 7. Non-Manifold Edge (3 triangles sharing edge (0, 1))
  {
    const positions = new Float32Array([
      0, 0, 0, // 0
      1, 0, 0, // 1
      0, 1, 0, // 2 (fin 1)
      0, -1, 0, // 3 (fin 2)
      0, 0, 1, // 4 (fin 3)
    ]);
    // Triangle 1: 0, 1, 2
    // Triangle 2: 0, 1, 3
    // Triangle 3: 0, 1, 4
    // All 3 share edge 0-1
    const indices = new Uint16Array([0, 1, 2, 0, 1, 3, 0, 1, 4]);
    const stats = analyzeMeshTopology({
      uuid: 'test-non-manifold',
      name: 'Non-Manifold Edge (T-Junction / Book Fin)',
      positions,
      indices,
      boundingBoxDiagonal: 2.0,
    });

    const passed = stats.nonManifoldEdges >= 1;

    results.push({
      name: 'Non-Manifold Edge Test',
      description: '3 triangles sharing the exact same edge',
      passed,
      expected: 'At least 1 non-manifold edge',
      actual: `${stats.nonManifoldEdges} non-manifold edge(s)`,
      details: passed ? 'Passed deterministically.' : 'Failed to identify non-manifold condition.',
    });
  }

  return results;
}
