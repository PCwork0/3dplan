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

import type { WallFootprint, WallMesh3D, GlassPaneData, DoorFrameData, Vec2, OpeningInput } from '../types.ts';

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

// ─── Opening support ──────────────────────────────────────────────────────────

/** Lerp two Vec2 by scalar t. */
function lerpV(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/**
 * Append one box segment of the wall to the flat mesh.
 * t0/t1 ∈ [0,1] along the wall footprint.
 * yBottom/yTop define the vertical extent.
 */
function appendSegment(
  m: FlatMesh,
  fp: WallFootprint,
  t0: number, t1: number,
  yBottom: number, yTop: number,
  wallLen: number,
): void {
  const srT0 = lerpV(fp.startRight, fp.endRight, t0);
  const slT0 = lerpV(fp.startLeft,  fp.endLeft,  t0);
  const srT1 = lerpV(fp.startRight, fp.endRight, t1);
  const slT1 = lerpV(fp.startLeft,  fp.endLeft,  t1);

  const u0 = t0 * wallLen;
  const u1 = t1 * wallLen;
  const vB = yBottom / Math.max(fp.height, 0.001);
  const vT = yTop    / Math.max(fp.height, 0.001);

  const seg: V3[] = [
    v3(srT0.x, yBottom, srT0.z), // 0
    v3(srT1.x, yBottom, srT1.z), // 1
    v3(slT1.x, yBottom, slT1.z), // 2
    v3(slT0.x, yBottom, slT0.z), // 3
    v3(srT0.x, yTop,    srT0.z), // 4
    v3(srT1.x, yTop,    srT1.z), // 5
    v3(slT1.x, yTop,    slT1.z), // 6
    v3(slT0.x, yTop,    slT0.z), // 7
  ];

  pushQuad(m, seg[0]!, seg[4]!, seg[5]!, seg[1]!, [u0,vB],[u0,vT],[u1,vT],[u1,vB]); // front
  pushQuad(m, seg[2]!, seg[6]!, seg[7]!, seg[3]!, [u1,vB],[u1,vT],[u0,vT],[u0,vB]); // back
  pushQuad(m, seg[1]!, seg[5]!, seg[6]!, seg[2]!, [0,vB],[0,vT],[1,vT],[1,vB]);      // end cap
  pushQuad(m, seg[3]!, seg[7]!, seg[4]!, seg[0]!, [0,vB],[0,vT],[1,vT],[1,vB]);      // start cap
  pushQuad(m, seg[4]!, seg[7]!, seg[6]!, seg[5]!, [u0,0],[u0,1],[u1,1],[u1,0]);      // top
  pushQuad(m, seg[0]!, seg[1]!, seg[2]!, seg[3]!, [u0,0],[u1,0],[u1,1],[u0,1]);      // bottom
}

// ─── Door frame reveal builder ────────────────────────────────────────────────

/**
 * Build the three wood reveal quads (left jamb, right jamb, top lintel)
 * for one door opening.
 *
 * The reveals sit in the wall cross-section plane — the exposed wall thickness
 * edge that's visible when you look through or along the door opening.
 * Rendered with a wood material on top of the wall caps (polygon-offset handles
 * any micro z-fighting).
 */
function buildDoorReveal(
  fp:  WallFootprint,
  gap: { t0: number; t1: number; yBottom: number; yTop: number },
): DoorFrameData {
  const m: FlatMesh = { positions: [], normals: [], uvs: [] };

  /** 3D point on the right face of the wall at parameter t, height y. */
  const rPt = (t: number, y: number): V3 => {
    const p = lerpV(fp.startRight, fp.endRight, t);
    return v3(p.x, y, p.z);
  };
  /** 3D point on the left face of the wall at parameter t, height y. */
  const lPt = (t: number, y: number): V3 => {
    const p = lerpV(fp.startLeft, fp.endLeft, t);
    return v3(p.x, y, p.z);
  };

  // ── Left jamb — vertical reveal quad at the left edge (t0) of the gap ──
  // Corners (viewed from inside the gap, CCW):
  //   right-face bottom → right-face top → left-face top → left-face bottom
  {
    const bl = rPt(gap.t0, gap.yBottom);
    const tl = rPt(gap.t0, gap.yTop);
    const tr = lPt(gap.t0, gap.yTop);
    const br = lPt(gap.t0, gap.yBottom);
    pushQuad(m, bl, tl, tr, br, [0, 0], [0, 1], [1, 1], [1, 0]);
    pushQuad(m, br, tr, tl, bl, [0, 0], [1, 0], [1, 1], [0, 1]); // back side
  }

  // ── Right jamb — vertical reveal quad at the right edge (t1) of the gap ──
  {
    const bl = lPt(gap.t1, gap.yBottom);
    const tl = lPt(gap.t1, gap.yTop);
    const tr = rPt(gap.t1, gap.yTop);
    const br = rPt(gap.t1, gap.yBottom);
    pushQuad(m, bl, tl, tr, br, [0, 0], [0, 1], [1, 1], [1, 0]);
    pushQuad(m, br, tr, tl, bl, [0, 0], [1, 0], [1, 1], [0, 1]); // back side
  }

  // ── Top lintel — horizontal reveal quad spanning the full gap width ──
  // The underside of the wall above the door (y = yTop, across wall thickness)
  {
    const a = rPt(gap.t0, gap.yTop);
    const b = rPt(gap.t1, gap.yTop);
    const c = lPt(gap.t1, gap.yTop);
    const d = lPt(gap.t0, gap.yTop);
    pushQuad(m, a, b, c, d, [0, 0], [1, 0], [1, 1], [0, 1]);
    pushQuad(m, d, c, b, a, [0, 1], [1, 1], [1, 0], [0, 0]); // back side
  }

  return { positions: m.positions, normals: m.normals };
}

/**
 * Build a WallMesh3D with geometry gaps for door and window openings.
 * Falls back to buildWallMesh when there are no openings.
 *
 * @param wallStart/wallEnd — resolved 2D positions, used to compute wall length
 *   so that opening widths (in metres) can be converted to t-parameter fractions.
 */
export function buildWallMeshWithOpenings(
  fp: WallFootprint,
  openings: OpeningInput[],
  wallStart: Vec2,
  wallEnd:   Vec2,
): WallMesh3D {
  if (openings.length === 0) return buildWallMesh(fp);

  const wallLen = Math.sqrt(
    (wallEnd.x - wallStart.x) ** 2 +
    (wallEnd.z - wallStart.z) ** 2,
  );
  if (wallLen < 0.001) return buildWallMesh(fp);

  // Convert each opening into a gap descriptor
  type Gap = { t0: number; t1: number; yBottom: number; yTop: number; isWindow: boolean };
  const gaps: Gap[] = openings
    .map((o): Gap => {
      const hw = o.width / 2;
      const t0 = Math.max(0, o.t - hw / wallLen);
      const t1 = Math.min(1, o.t + hw / wallLen);
      const sill   = o.type === 'window' ? (o.sillHeight ?? 0.9)  : 0;
      const openH  = o.type === 'window' ? (o.height    ?? 1.2)   : (o.height ?? Math.min(2.1, fp.height));
      return { t0, t1, yBottom: sill, yTop: Math.min(sill + openH, fp.height), isWindow: o.type === 'window' };
    })
    .sort((a, b) => a.t0 - b.t0);

  const m: FlatMesh = { positions: [], normals: [], uvs: [] };
  const glassPanes: GlassPaneData[] = [];
  const doorFrames: DoorFrameData[] = [];
  let prev = 0;

  for (const gap of gaps) {
    // Solid segment before gap
    if (gap.t0 > prev + 1e-6) {
      appendSegment(m, fp, prev, gap.t0, 0, fp.height, wallLen);
    }

    // Sill (below window) — doors have sill=0 so this is skipped
    if (gap.yBottom > 1e-6) {
      appendSegment(m, fp, gap.t0, gap.t1, 0, gap.yBottom, wallLen);
    }

    // Lintel (above opening)
    if (gap.yTop < fp.height - 1e-6) {
      appendSegment(m, fp, gap.t0, gap.t1, gap.yTop, fp.height, wallLen);
    }

    // Wood reveal frame for doors
    if (!gap.isWindow) {
      doorFrames.push(buildDoorReveal(fp, gap));
    }

    // Glass pane for windows — a thin quad at the wall centreline
    if (gap.isWindow) {
      const c0 = {
        x: (lerpV(fp.startRight, fp.endRight, gap.t0).x + lerpV(fp.startLeft, fp.endLeft, gap.t0).x) / 2,
        z: (lerpV(fp.startRight, fp.endRight, gap.t0).z + lerpV(fp.startLeft, fp.endLeft, gap.t0).z) / 2,
      };
      const c1 = {
        x: (lerpV(fp.startRight, fp.endRight, gap.t1).x + lerpV(fp.startLeft, fp.endLeft, gap.t1).x) / 2,
        z: (lerpV(fp.startRight, fp.endRight, gap.t1).z + lerpV(fp.startLeft, fp.endLeft, gap.t1).z) / 2,
      };
      const bl = v3(c0.x, gap.yBottom, c0.z);
      const br = v3(c1.x, gap.yBottom, c1.z);
      const tr = v3(c1.x, gap.yTop,    c1.z);
      const tl = v3(c0.x, gap.yTop,    c0.z);
      const gn = faceNormal(bl, br, tr);
      const gm: FlatMesh = { positions: [], normals: [], uvs: [] };
      pushQuad(gm, bl, tl, tr, br, [0,0],[0,1],[1,1],[1,0]);  // front face
      pushQuad(gm, br, tr, tl, bl, [0,0],[0,1],[1,1],[1,0]);  // back face (DoubleSide)
      void gn; // normal handled per-face by faceNormal inside pushQuad
      glassPanes.push({ positions: gm.positions, normals: gm.normals });
    }

    prev = gap.t1;
  }

  // Trailing solid segment
  if (prev < 1 - 1e-6) {
    appendSegment(m, fp, prev, 1, 0, fp.height, wallLen);
  }

  return {
    id:          fp.wallId,
    positions:   m.positions,
    normals:     m.normals,
    uvs:         m.uvs,
    vertexCount: m.positions.length / 3,
    ...(glassPanes.length  > 0 ? { glassPanes }  : {}),
    ...(doorFrames.length  > 0 ? { doorFrames }  : {}),
  };
}
