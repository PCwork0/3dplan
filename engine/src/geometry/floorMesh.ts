/**
 * floorMesh.ts — Build floor mesh data from a room polygon.
 *
 * The output `FloorMesh3D.polygon` is a CCW-wound array of [x, z] pairs
 * that maps directly to a THREE.Shape:
 *
 *   const shape = new THREE.Shape();
 *   shape.moveTo(polygon[0][0], polygon[0][1]);
 *   polygon.slice(1).forEach(([x, z]) => shape.lineTo(x, z));
 *   shape.closePath();
 *   const geo = new THREE.ShapeGeometry(shape);
 *   geo.rotateX(-Math.PI / 2);   // lie flat on XZ plane
 *
 * Alternatively, for components that need pre-triangulated data,
 * `triangles` provides a flat vertex list ready for BufferGeometry.
 */

import type { FloorPlanInput, FloorMesh3D, Vec2 } from '../types.ts';
import { ensureCCW, earClip } from './polygon.ts';

const DEFAULT_ELEVATION = 0;

export interface FloorMesh3DExtended extends FloorMesh3D {
  /**
   * Pre-triangulated floor, flat array of (x, y, z) positions.
   * y = elevation.  36+ floats for n-vertex polygon.
   * Suitable for non-indexed THREE.BufferGeometry if THREE.Shape is unavailable.
   */
  trianglePositions: number[];
}

/**
 * Build floor mesh data for all rooms.
 */
export function buildFloorMeshes(
  input: FloorPlanInput,
  nodeMap: Map<string, Vec2>,
): FloorMesh3DExtended[] {
  return input.rooms.map((room) => buildRoomFloor(room, nodeMap, input));
}

function buildRoomFloor(
  room: FloorPlanInput['rooms'][number],
  nodeMap: Map<string, Vec2>,
  _input: FloorPlanInput,
): FloorMesh3DExtended {
  const elevation = room.elevation ?? DEFAULT_ELEVATION;

  // Resolve node IDs → Vec2 polygon
  const rawPoly: Vec2[] = room.nodeIds.map((nid) => {
    const pt = nodeMap.get(nid);
    if (!pt) throw new Error(`Room "${room.id}" references unknown node "${nid}"`);
    return { ...pt };
  });

  if (rawPoly.length < 3) {
    throw new Error(`Room "${room.id}" needs at least 3 nodes, got ${rawPoly.length}`);
  }

  // Ensure CCW winding (THREE.Shape expects CCW)
  const poly = ensureCCW(rawPoly);

  // Polygon as [x, z] pairs for THREE.Shape
  const polygon: [number, number][] = poly.map((v) => [v.x, v.z]);

  // Pre-triangulate for BufferGeometry fallback
  const triangles = earClip(poly);
  const trianglePositions: number[] = [];
  for (const [a, b, c] of triangles) {
    trianglePositions.push(
      a.x, elevation, a.z,
      b.x, elevation, b.z,
      c.x, elevation, c.z,
    );
  }

  return {
    id: room.id,
    name: room.name,
    polygon,
    elevation,
    trianglePositions,
  };
}
