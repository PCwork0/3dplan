/**
 * index.ts — Public API of the geometry engine.
 *
 * Usage (react-three-fiber component):
 *
 *   import { buildScene, validateInput } from '@3d-floor-plan/geometry-engine';
 *
 *   const result = validateInput(rawJson);
 *   if (!result.ok) { console.error(result.errors); return; }
 *
 *   const scene = buildScene(result.data);
 *
 *   // In JSX:
 *   scene.walls.forEach(wall => (
 *     <mesh>
 *       <bufferGeometry>
 *         <bufferAttribute
 *           attach="attributes-position"
 *           array={new Float32Array(wall.positions)}
 *           itemSize={3}
 *         />
 *         <bufferAttribute
 *           attach="attributes-normal"
 *           array={new Float32Array(wall.normals)}
 *           itemSize={3}
 *         />
 *         <bufferAttribute
 *           attach="attributes-uv"
 *           array={new Float32Array(wall.uvs)}
 *           itemSize={2}
 *         />
 *       </bufferGeometry>
 *       <meshStandardMaterial />
 *     </mesh>
 *   ));
 *
 *   scene.floors.forEach(floor => {
 *     const shape = new THREE.Shape();
 *     shape.moveTo(floor.polygon[0][0], floor.polygon[0][1]);
 *     floor.polygon.slice(1).forEach(([x,z]) => shape.lineTo(x, z));
 *     shape.closePath();
 *     // <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, floor.elevation, 0]}>
 *     //   <shapeGeometry args={[shape]} />
 *     // </mesh>
 *   });
 */

import type {
  FloorPlanInput,
  SceneData,
  EngineResult,
  ValidationError,
} from './types.ts';

import { validateInput, parseAndValidate } from './schema.ts';
import { buildNodeMap, resolveWalls, buildNeighbourMapFromResolved } from './geometry/wallGraph.ts';
import { computeWallFootprint } from './geometry/cornerJoint.ts';
import { buildWallMesh } from './geometry/wallMesh.ts';
import { buildFloorMeshes } from './geometry/floorMesh.ts';
import { aabb, mergeAABB, emptyAABB } from './geometry/polygon.ts';

// ─── Core pipeline ────────────────────────────────────────────────────────────

/**
 * Convert a validated FloorPlanInput into a SceneData object.
 *
 * This function is deterministic: the same input always produces the same
 * output.  It has no side effects and no external dependencies.
 *
 * @throws Error — only for internal consistency failures (e.g. unknown node
 *   reference that wasn't caught by validation).  Normal invalid input is
 *   caught by validateInput() before calling this.
 */
export function buildScene(input: FloorPlanInput): SceneData {
  // 1. Build node map
  const nodeMap = buildNodeMap(input);

  // 2. Resolve walls (fill defaults, look up node positions)
  const resolved = resolveWalls(input, nodeMap);

  // 3. Build wall neighbour map (for miter joints)
  const neighbourMap = buildNeighbourMapFromResolved(resolved, input.walls);

  // 4. Compute wall footprints (miter-corrected 2D outlines)
  const footprints = resolved.map((wall) => {
    const neighbours = neighbourMap.get(wall.id)!;
    return computeWallFootprint(wall, neighbours);
  });

  // 5. Build 3D wall meshes
  const walls = footprints.map(buildWallMesh);

  // 6. Build floor meshes
  const floors = buildFloorMeshes(input, nodeMap);

  // 7. Compute bounding box
  let sceneBounds = emptyAABB();
  let minY = 0;
  let maxY = 0;

  for (const fp of footprints) {
    const pts = [fp.startRight, fp.startLeft, fp.endRight, fp.endLeft];
    sceneBounds = mergeAABB(sceneBounds, aabb(pts));
    if (fp.height > maxY) maxY = fp.height;
  }

  return {
    walls,
    floors,
    bounds: {
      minX: isFinite(sceneBounds.minX) ? sceneBounds.minX : 0,
      maxX: isFinite(sceneBounds.maxX) ? sceneBounds.maxX : 0,
      minZ: isFinite(sceneBounds.minZ) ? sceneBounds.minZ : 0,
      maxZ: isFinite(sceneBounds.maxZ) ? sceneBounds.maxZ : 0,
      minY,
      maxY,
    },
  };
}

// ─── Safe wrapper ─────────────────────────────────────────────────────────────

/**
 * Validate + build in one call.  Returns EngineResult (never throws).
 */
export function buildSceneSafe(raw: unknown): EngineResult {
  const validation = validateInput(raw);
  if (!validation.ok) return validation;

  try {
    return { ok: true, data: buildScene(validation.data) };
  } catch (e) {
    return {
      ok: false,
      errors: [{ field: 'engine', message: (e as Error).message }],
    };
  }
}

/**
 * Parse a JSON string, validate, and build the scene.  Never throws.
 */
export function buildSceneFromJSON(json: string): EngineResult {
  const validation = parseAndValidate(json);
  if (!validation.ok) return validation;

  try {
    return { ok: true, data: buildScene(validation.data) };
  } catch (e) {
    return {
      ok: false,
      errors: [{ field: 'engine', message: (e as Error).message }],
    };
  }
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export { validateInput, parseAndValidate } from './schema.ts';
export type {
  FloorPlanInput,
  NodeInput,
  WallInput,
  RoomInput,
  OpeningInput,
  WallMesh3D,
  FloorMesh3D,
  SceneData,
  EngineResult,
  ValidationError,
  Vec2,
} from './types.ts';
