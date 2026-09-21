import type { TopologyStats } from '../types';

export interface RawMeshData {
  uuid: string;
  name: string;
  positions: Float32Array;
  indices: Uint16Array | Uint32Array | null;
  boundingBoxDiagonal: number;
  /** Column-major THREE.Matrix4 elements used to convert local diagnostic points to world space. */
  worldMatrix?: number[];
}

/**
 * Deterministic topology analyzer for triangle meshes.
 * Can be executed on main thread or inside a Web Worker.
 */
export function analyzeMeshTopology(meshData: RawMeshData): TopologyStats {
  const { uuid, name, positions, indices, boundingBoxDiagonal, worldMatrix } = meshData;
  const vertexCount = positions.length / 3;
  
  let triangleCount = 0;
  if (indices) {
    triangleCount = indices.length / 3;
  } else {
    triangleCount = Math.floor(vertexCount / 3);
  }

  const degenerateIndices: number[] = [];
  let degenerateCount = 0;
  let thinTriangleCount = 0;

  let minArea = Infinity;
  let maxArea = 0;
  let totalArea = 0;
  const areas: number[] = [];
  const focusPoints: Array<[number, number, number]> = [];
  const localization: NonNullable<TopologyStats['localization']> = {};

  function toWorld(point: [number, number, number]): [number, number, number] {
    if (!worldMatrix || worldMatrix.length < 16) return point;
    const [x, y, z] = point;
    const e = worldMatrix;
    const w = e[3] * x + e[7] * y + e[11] * z + e[15];
    const invW = w !== 0 ? 1 / w : 1;
    return [
      (e[0] * x + e[4] * y + e[8] * z + e[12]) * invW,
      (e[1] * x + e[5] * y + e[9] * z + e[13]) * invW,
      (e[2] * x + e[6] * y + e[10] * z + e[14]) * invW,
    ];
  }

  function centroid(a: [number, number, number], b: [number, number, number], c: [number, number, number]): [number, number, number] {
    return [
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
      (a[2] + b[2] + c[2]) / 3,
    ];
  }

  const areaEpsilon = Math.max(1e-9, Math.pow(boundingBoxDiagonal * 1e-6, 2));

  // Map undirected edge -> count of sharing triangles
  // We can use a Map with string key "min_max" for indices
  const edgeTriangleCount = new Map<string, { count: number; u: number; v: number }>();

  // Track referenced vertices to detect isolated vertices
  const referencedVertices = new Uint8Array(vertexCount);

  // Helper to get vertex coords
  function getVertex(idx: number, out: [number, number, number]) {
    const o = idx * 3;
    out[0] = positions[o];
    out[1] = positions[o + 1];
    out[2] = positions[o + 2];
  }

  const vA: [number, number, number] = [0, 0, 0];
  const vB: [number, number, number] = [0, 0, 0];
  const vC: [number, number, number] = [0, 0, 0];

  // Adjacency for connected components
  const vertexNeighbors = new Map<number, number[]>();

  function addEdgeAdjacency(u: number, v: number) {
    let listU = vertexNeighbors.get(u);
    if (!listU) {
      listU = [];
      vertexNeighbors.set(u, listU);
    }
    listU.push(v);

    let listV = vertexNeighbors.get(v);
    if (!listV) {
      listV = [];
      vertexNeighbors.set(v, listV);
    }
    listV.push(u);
  }

  // Iterate triangles
  for (let t = 0; t < triangleCount; t++) {
    let i0 = 0;
    let i1 = 0;
    let i2 = 0;

    if (indices) {
      i0 = indices[t * 3];
      i1 = indices[t * 3 + 1];
      i2 = indices[t * 3 + 2];
    } else {
      i0 = t * 3;
      i1 = t * 3 + 1;
      i2 = t * 3 + 2;
    }

    if (i0 < vertexCount) referencedVertices[i0] = 1;
    if (i1 < vertexCount) referencedVertices[i1] = 1;
    if (i2 < vertexCount) referencedVertices[i2] = 1;

    // Build edge map
    const edges = [
      i0 < i1 ? `${i0}_${i1}` : `${i1}_${i0}`,
      i1 < i2 ? `${i1}_${i2}` : `${i2}_${i1}`,
      i2 < i0 ? `${i2}_${i0}` : `${i0}_${i2}`,
    ];

    const edgePairs: Array<[string, number, number]> = [
      [edges[0], i0, i1],
      [edges[1], i1, i2],
      [edges[2], i2, i0],
    ];
    for (const [edgeKey, u, v] of edgePairs) {
      const existing = edgeTriangleCount.get(edgeKey);
      if (existing) {
        existing.count++;
      } else {
        edgeTriangleCount.set(edgeKey, { count: 1, u, v });
      }
    }

    addEdgeAdjacency(i0, i1);
    addEdgeAdjacency(i1, i2);
    addEdgeAdjacency(i2, i0);

    getVertex(i0, vA);
    getVertex(i1, vB);
    getVertex(i2, vC);

    // AB and AC
    const abX = vB[0] - vA[0];
    const abY = vB[1] - vA[1];
    const abZ = vB[2] - vA[2];

    const acX = vC[0] - vA[0];
    const acY = vC[1] - vA[1];
    const acZ = vC[2] - vA[2];

    const bcX = vC[0] - vB[0];
    const bcY = vC[1] - vB[1];
    const bcZ = vC[2] - vB[2];

    // Cross product AB x AC
    const cpX = abY * acZ - abZ * acY;
    const cpY = abZ * acX - abX * acZ;
    const cpZ = abX * acY - abY * acX;

    const crossLen = Math.sqrt(cpX * cpX + cpY * cpY + cpZ * cpZ);
    const area = 0.5 * crossLen;

    areas.push(area);
    totalArea += area;
    if (area < minArea) minArea = area;
    if (area > maxArea) maxArea = area;

    // Check degenerate
    if (area <= areaEpsilon) {
      degenerateCount++;
      if (degenerateIndices.length < 50) {
        degenerateIndices.push(t);
      }
      const localCenter = centroid(vA, vB, vC);
      const worldCenter = toWorld(localCenter);
      if (focusPoints.length < 5) {
        focusPoints.push(worldCenter);
      }
      if (!localization.degenerate) {
        localization.degenerate = {
          focusPoint: worldCenter,
          affectedIndices: [t],
          element: 'triangle',
        };
      }
    } else {
      // Check needle / thin triangle
      const lenAB = Math.sqrt(abX * abX + abY * abY + abZ * abZ);
      const lenAC = Math.sqrt(acX * acX + acY * acY + acZ * acZ);
      const lenBC = Math.sqrt(bcX * bcX + bcY * bcY + bcZ * bcZ);
      const maxEdge = Math.max(lenAB, lenAC, lenBC);
      // Altitude h = 2 * area / maxEdge
      const minAltitude = (2 * area) / Math.max(1e-12, maxEdge);
      const aspectRatio = maxEdge / Math.max(1e-12, minAltitude);
      if (aspectRatio > 35) {
        thinTriangleCount++;
        const localCenter = centroid(vA, vB, vC);
        const worldCenter = toWorld(localCenter);
        if (focusPoints.length < 8) {
          focusPoints.push(worldCenter);
        }
        if (!localization.thinTriangle) {
          localization.thinTriangle = {
            focusPoint: worldCenter,
            affectedIndices: [t],
            element: 'triangle',
          };
        }
      }
    }
  }

  // Count boundary & non-manifold edges
  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const edge of edgeTriangleCount.values()) {
    if (edge.count === 1) {
      boundaryEdges++;
      if (!localization.boundary) {
        const a: [number, number, number] = [0, 0, 0];
        const b: [number, number, number] = [0, 0, 0];
        getVertex(edge.u, a);
        getVertex(edge.v, b);
        localization.boundary = {
          focusPoint: toWorld([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]),
          affectedIndices: [edge.u, edge.v],
          element: 'edge',
        };
      }
    } else if (edge.count > 2) {
      nonManifoldEdges++;
      if (!localization.nonManifold) {
        const a: [number, number, number] = [0, 0, 0];
        const b: [number, number, number] = [0, 0, 0];
        getVertex(edge.u, a);
        getVertex(edge.v, b);
        localization.nonManifold = {
          focusPoint: toWorld([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]),
          affectedIndices: [edge.u, edge.v],
          element: 'edge',
        };
      }
    }
  }

  // Isolated / unreferenced vertices
  let isolatedVertices = 0;
  if (indices) {
    for (let i = 0; i < vertexCount; i++) {
      if (referencedVertices[i] === 0) {
        isolatedVertices++;
        if (!localization.isolated) {
          const point: [number, number, number] = [
            positions[i * 3],
            positions[i * 3 + 1],
            positions[i * 3 + 2],
          ];
          localization.isolated = {
            focusPoint: toWorld(point),
            affectedIndices: [i],
            element: 'vertex',
          };
        }
      }
    }
  }

  // Connected components via BFS
  const visited = new Uint8Array(vertexCount);
  let componentsCount = 0;
  let tinyComponentsCount = 0;

  for (let i = 0; i < vertexCount; i++) {
    if (visited[i] === 1) continue;
    if (indices && referencedVertices[i] === 0) continue; // skip isolated

    componentsCount++;
    let componentVertexCount = 0;
    let componentSumX = 0;
    let componentSumY = 0;
    let componentSumZ = 0;
    const componentSampleIndices: number[] = [];
    const queue = [i];
    visited[i] = 1;

    while (queue.length > 0) {
      const curr = queue.pop()!;
      componentVertexCount++;
      componentSumX += positions[curr * 3];
      componentSumY += positions[curr * 3 + 1];
      componentSumZ += positions[curr * 3 + 2];
      if (componentSampleIndices.length < 16) componentSampleIndices.push(curr);

      const nbrs = vertexNeighbors.get(curr);
      if (nbrs) {
        for (let k = 0; k < nbrs.length; k++) {
          const n = nbrs[k];
          if (visited[n] === 0) {
            visited[n] = 1;
            queue.push(n);
          }
        }
      }
    }

    // Tiny disconnected component if < 2% of vertices or <= 6 vertices when total > 60
    if (vertexCount > 60 && (componentVertexCount < vertexCount * 0.02 || componentVertexCount <= 6)) {
      tinyComponentsCount++;
      if (!localization.tinyComponent && componentVertexCount > 0) {
        localization.tinyComponent = {
          focusPoint: toWorld([
            componentSumX / componentVertexCount,
            componentSumY / componentVertexCount,
            componentSumZ / componentVertexCount,
          ]),
          affectedIndices: componentSampleIndices,
          element: 'component',
        };
      }
    }
  }

  // Spatial duplicate positions analysis (spatial hashing)
  let potentialDuplicatePositions = 0;
  const gridCellSize = Math.max(1e-5, boundingBoxDiagonal * 0.0005);
  const spatialGrid = new Map<string, number[]>();

  for (let i = 0; i < vertexCount; i++) {
    const ox = positions[i * 3];
    const oy = positions[i * 3 + 1];
    const oz = positions[i * 3 + 2];
    const gx = Math.round(ox / gridCellSize);
    const gy = Math.round(oy / gridCellSize);
    const gz = Math.round(oz / gridCellSize);
    const cellKey = `${gx}_${gy}_${gz}`;

    const existing = spatialGrid.get(cellKey);
    if (!existing) {
      spatialGrid.set(cellKey, [i]);
    } else {
      potentialDuplicatePositions++;
      if (!localization.duplicatePosition) {
        localization.duplicatePosition = {
          focusPoint: toWorld([ox, oy, oz]),
          affectedIndices: [existing[0], i],
          element: 'vertex',
        };
      }
      existing.push(i);
    }
  }

  const avgArea = triangleCount > 0 ? totalArea / triangleCount : 0;
  if (minArea === Infinity) minArea = 0;

  // Triangle density: count of triangles significantly smaller than avg (e.g. dense clusters)
  let denseTrianglesCount = 0;
  if (avgArea > 0) {
    for (let t = 0; t < areas.length; t++) {
      if (areas[t] < avgArea * 0.1) {
        denseTrianglesCount++;
      }
    }
  }

  return {
    meshUuid: uuid,
    meshName: name || 'Unnamed Mesh',
    degenerateTriangles: degenerateCount,
    degenerateIndices,
    boundaryEdges,
    nonManifoldEdges,
    isolatedVertices,
    componentsCount,
    tinyComponentsCount,
    thinTriangles: thinTriangleCount,
    potentialDuplicatePositions,
    minTriangleArea: minArea,
    maxTriangleArea: maxArea,
    avgTriangleArea: avgArea,
    denseTrianglesCount,
    triangleCount,
    vertexCount,
    sampleFocusPoints: focusPoints,
    localization,
  };
}
