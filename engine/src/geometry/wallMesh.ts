/**
 * wallMesh.ts — Extrude a WallFootprint into 3D mesh data.
 *
 * Output format
 * ─────────────
 * Non-indexed geometry (each triangle owns its own 3 vertices) so that
 * flat-face normals require no averaging.  Six quad faces → 12 triangles
 * → 36 vertices per wall.  Each vertex carries:
 *   - position  (x, y, z)
 *   - normal    (nx, ny, nz)  — exact face normal, computed analytically
 *   - uv        (u, v)        — u: along wall length, v: height fraction
 *
 * Vertex layout (indices 0–7 for the box, before fan-out):
 *
 *        7────────6
 *       /│       /│   top
 *      4────────5 │
 *      │ 3──────│─2   bottom
 *      │/       │/
 *      0────────1
 *
 *   0 = startRight bottom   1 = endRight bottom
 *   2 = endLeft   bottom    3 = startLeft bottom
 *   4 = startRight top      5 = endRight top
 *   6 = endLeft   top       7 = startLeft top
 *
 * Faces (outward normals, CCW winding from outside):
 *   Front  (right side) : 0,4,5  0,5,1
 *   Back   (left side)  : 2,6,7  2,7,3
 *   End    (end side)   : 1,5,6  1,6,2
 *   Start  (start side) : 3,7,4  3,4,0
 *   Top                 : 4,7,6  4,6,5
 *   Bottom              : 0,3,2  0,2,1
 */

import type { WallFootprint, WallMesh3D, Vec2 } from '../types.ts';
import { sub, cross, normalize as normalizeV2 } from './vec2.ts';

// ─── Internal 3D vector ───────────────────────────────────────────────────────

interface V3 { x: number; y: number; z: number; }

const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });

function cross3(a: V3, b: V3): V3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function sub3(a: V3, b: V3): V3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function len3(v: V3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function norm3(v: V3): V3 {
  const l = len3(v);
  if (l < 1e-10) return { x: 0, y: 1, z: 0 };
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** Triangle face normal (CCW winding from outside → outward normal). */
function faceNormal(a: V3, b: V3, c: V3): V3 {
  return norm3(cross3(sub3(b, a), sub3(c, a)));
}

// ─── Flat buffers builder ─────────────────────────────────────────────────────

interface FlatMesh {
  positions: number[];
  normals:   number[];
  uvs:       number[];
}

function pushVertex(m: FlatMesh, pos: V3, nor: V3, u: number, v: number): void {
  m.positions.push(pos.x, pos.y, pos.z);
  m.normals.push(nor.x, nor.y, nor.z);
  m.uvs.push(u, v);
}

/**
 * Push one quad (two triangles) into the flat buffers.
 * Vertices a, b, c, d should be in CCW order when viewed from outside.
 *
 * Triangle 1: a, b, c
 * Triangle 2: a, c, d
 *
 * UVs for each corner: (ua,va), (ub,vb), (uc,vc), (ud,vd)
 */
function pushQuad(
  m: FlatMesh,
  a: V3, b: V3, c: V3, d: V3,
  uvA: [number, number], uvB: [number, number],
  uvC: [number, number], uvD: [number, number],
): void {
  const n = faceNormal(a, b, c);
  // Triangle 1: a, b, c
  pushVertex(m, a, n, uvA[0], uvA[1]);
  pushVertex(m, b, n, uvB[0], uvB[1]);
  pushVertex(m, c, n, uvC[0], uvC[1]);
  // Triangle 2: a, c, d
  pushVertex(m, a, n, uvA[0], uvA[1]);
  pushVertex(m, c, n, uvC[0], uvC[1]);
  pushVertex(m, d, n, uvD[0], uvD[1]);
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Convert a WallFootprint (2D miter-corrected outline + height) into
 * a WallMesh3D ready for THREE.BufferGeometry.
 *
 * Coordinate mapping:
 *   footprint.x  → 3D X
 *   footprint.z  → 3D Z
 *   height       → 3D Y (up)
 */
export function buildWallMesh(fp: WallFootprint): WallMesh3D {
  const h = fp.height;

  // 8 corners of the box (labelled as per header diagram)
  const v: V3[] = [
    v3(fp.startRight.x, 0, fp.startRight.z), // 0 startRight bottom
    v3(fp.endRight.x,   0, fp.endRight.z),   // 1 endRight   bottom
    v3(fp.endLeft.x,    0, fp.endLeft.z),    // 2 endLeft    bottom
    v3(fp.startLeft.x,  0, fp.startLeft.z),  // 3 startLeft  bottom
    v3(fp.startRight.x, h, fp.startRight.z), // 4 startRight top
    v3(fp.endRight.x,   h, fp.endRight.z),   // 5 endRight   top
    v3(fp.endLeft.x,    h, fp.endLeft.z),    // 6 endLeft    top
    v3(fp.startLeft.x,  h, fp.startLeft.z),  // 7 startLeft  top
  ];

  // Approximate wall length for UV scaling (use centreline)
  const midS: V3 = {
    x: (v[0]!.x + v[3]!.x) / 2,
    y: 0,
    z: (v[0]!.z + v[3]!.z) / 2,
  };
  const midE: V3 = {
    x: (v[1]!.x + v[2]!.x) / 2,
    y: 0,
    z: (v[1]!.z + v[2]!.z) / 2,
  };
  const wallLen = Math.max(len3(sub3(midE, midS)), 0.001);

  // UV helpers
  const u0 = 0, u1 = wallLen;   // along wall length
  const v0 = 0, v1 = 1;         // 0=bottom, 1=top

  const m: FlatMesh = { positions: [], normals: [], uvs: [] };

  // Front face (right side, looking inward from +perpCW of wall dir)
  // CCW from outside: 0(bot-start) → 4(top-start) → 5(top-end) → 1(bot-end)
  pushQuad(
    m,
    v[0]!, v[4]!, v[5]!, v[1]!,
    [u0, v0], [u0, v1], [u1, v1], [u1, v0],
  );

  // Back face (left side)
  // CCW from outside (looking from −perpCW): 2(bot-end) → 6(top-end) → 7(top-start) → 3(bot-start)
  pushQuad(
    m,
    v[2]!, v[6]!, v[7]!, v[3]!,
    [u1, v0], [u1, v1], [u0, v1], [u0, v0],
  );

  // End cap (end side)
  // CCW from outside (looking from end direction): 1(bot-right) → 5(top-right) → 6(top-left) → 2(bot-left)
  pushQuad(
    m,
    v[1]!, v[5]!, v[6]!, v[2]!,
    [0, v0], [0, v1], [1, v1], [1, v0],
  );

  // Start cap (start side, looking from start direction, i.e., wall is behind)
  // CCW from outside: 3(bot-left) → 7(top-left) → 4(top-right) → 0(bot-right)
  pushQuad(
    m,
    v[3]!, v[7]!, v[4]!, v[0]!,
    [0, v0], [0, v1], [1, v1], [1, v0],
  );

  // Top cap
  // CCW from above (+Y): 4(start-right) → 7(start-left) → 6(end-left) → 5(end-right)
  pushQuad(
    m,
    v[4]!, v[7]!, v[6]!, v[5]!,
    [u0, 0], [u0, 1], [u1, 1], [u1, 0],
  );

  // Bottom cap
  // CCW from below (−Y): 0(start-right) → 1(end-right) → 2(end-left) → 3(start-left)
  pushQuad(
    m,
    v[0]!, v[1]!, v[2]!, v[3]!,
    [u0, 0], [u1, 0], [u1, 1], [u0, 1],
  );

  return {
    id:          fp.wallId,
    positions:   m.positions,
    normals:     m.normals,
    uvs:         m.uvs,
    vertexCount: m.positions.length / 3,
  };
}
