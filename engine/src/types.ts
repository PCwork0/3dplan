// ─────────────────────────────────────────────────────────────────────────────
// Input types  (what the consumer provides as JSON)
// ─────────────────────────────────────────────────────────────────────────────

/** A 2D point in the floor-plan coordinate system (metres, XZ plane). */
export interface Point2D {
  x: number;
  z: number;
}

/**
 * A named node in the wall graph.
 * Multiple walls can share a node — that shared node is the corner/junction.
 */
export interface NodeInput {
  id: string;
  x: number;
  z: number;
}

/**
 * A wall segment defined by two node references.
 *
 * Design notes vs. the earlier scalar spec:
 *  - startNode / endNode give topological connectivity (shared corners).
 *  - thickness defaults to 0.2 m.
 *  - height defaults to 3.0 m.
 */
export interface WallInput {
  id: string;
  startNode: string;   // NodeInput.id
  endNode: string;     // NodeInput.id
  thickness?: number;  // metres, default 0.2
  height?: number;     // metres, default 3.0
}

/**
 * A room defined by an explicit polygon of node IDs (CCW winding).
 * The polygon describes the room's floor boundary.
 * It does *not* need to match wall geometry exactly — the engine handles both.
 */
export interface RoomInput {
  id: string;
  name: string;
  /** Ordered list of NodeInput IDs describing the floor polygon (CCW). */
  nodeIds: string[];
  /** Floor elevation in metres. Defaults to 0. */
  elevation?: number;
}

/**
 * A door or window opening cut into a wall.
 *
 * Position is a normalised t ∈ [0, 1] along the wall centreline
 * (0 = startNode side, 1 = endNode side).
 * This is unambiguous regardless of how the wall is directed in the JSON.
 */
export interface OpeningInput {
  id: string;
  wallId: string;
  type: 'door' | 'window';
  /** Normalised position along wall, 0–1. */
  t: number;
  /** Opening width in metres. */
  width: number;
  /** Opening height in metres. Defaults to full wall height for doors, 1.2 m for windows. */
  height?: number;
  /** Bottom of opening above floor (metres). 0 for doors, ~0.9 for windows. */
  sillHeight?: number;
}

/** Top-level floor plan input document. */
export interface FloorPlanInput {
  version: string;
  units: 'meters';
  nodes: NodeInput[];
  walls: WallInput[];
  rooms: RoomInput[];
  openings?: OpeningInput[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal geometry types  (engine-private, not exported from index.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** 2D vector used throughout the engine. */
export interface Vec2 {
  x: number;
  z: number;
}

/** Resolved wall — all optional fields filled, nodes looked up. */
export interface ResolvedWall {
  id: string;
  start: Vec2;
  end: Vec2;
  thickness: number;
  height: number;
}

/** The 4 corner points of a wall in the XZ plane after miter resolution. */
export interface WallFootprint {
  wallId: string;
  /** Start-side, right of travel (perpCW of direction). */
  startRight: Vec2;
  /** Start-side, left of travel (perpCCW of direction). */
  startLeft: Vec2;
  /** End-side, right of travel. */
  endRight: Vec2;
  /** End-side, left of travel. */
  endLeft: Vec2;
  height: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Output types  (what react-three-fiber components consume)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ready-to-use 3D mesh data for a wall.
 *
 * Positions and normals are flat arrays (stride 3) for BufferGeometry:
 *   positions[i*3]   = x
 *   positions[i*3+1] = y  (vertical)
 *   positions[i*3+2] = z
 *
 * The geometry is non-indexed (each triangle owns its 3 vertices) so that
 * flat face normals are trivial — no vertex sharing, no normal averaging.
 *
 * UVs are flat (stride 2): u along wall length, v along height.
 */
export interface WallMesh3D {
  id: string;
  /** Flat Float32-ready array of vertex positions (3 per vertex). */
  positions: number[];
  /** Flat Float32-ready array of per-vertex normals (3 per vertex). */
  normals: number[];
  /** Flat Float32-ready UV coordinates (2 per vertex). */
  uvs: number[];
  /** Total vertex count (positions.length / 3). */
  vertexCount: number;
}

/**
 * Ready-to-use data for a room's floor (and optionally ceiling).
 *
 * `polygon` is an ordered array of [x, z] pairs suitable for THREE.Shape.
 * The shape lies in the XZ plane; elevation = y offset.
 */
export interface FloorMesh3D {
  id: string;
  name: string;
  /** CCW polygon in XZ plane as [x, z] pairs. */
  polygon: [number, number][];
  /** Y elevation of the floor surface. */
  elevation: number;
}

/** The complete 3D scene data produced by the engine. */
export interface SceneData {
  walls: WallMesh3D[];
  floors: FloorMesh3D[];
  /** Axis-aligned bounding box of the entire plan (metres). */
  bounds: {
    minX: number; maxX: number;
    minZ: number; maxZ: number;
    minY: number; maxY: number;
  };
}

/** Structured validation error returned when input is malformed. */
export interface ValidationError {
  field: string;
  message: string;
}

/** Result type — either SceneData or a list of validation errors. */
export type EngineResult =
  | { ok: true; data: SceneData }
  | { ok: false; errors: ValidationError[] };
