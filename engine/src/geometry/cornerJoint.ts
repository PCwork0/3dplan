/**
 * cornerJoint.ts — Miter joint computation for wall corners.
 *
 * This is the geometric core of the engine — the algorithm that turns
 * overlapping wall rectangles into clean, correctly-intersected wall
 * polygons regardless of angle.
 *
 * ─── The problem ──────────────────────────────────────────────────────────────
 *
 * A naive wall extrusion just makes a box from start to end.  At corners
 * those boxes overlap or leave gaps.  The correct approach:
 *
 *   1. Each wall has a LEFT offset line and a RIGHT offset line, both
 *      parallel to its centreline, displaced by (thickness/2).
 *   2. At a corner where wall A ends and wall B begins, the two LEFT
 *      offset lines intersect at one point, and the two RIGHT offset
 *      lines intersect at another.
 *   3. Those intersection points become the actual vertices of both walls.
 *
 *                 ╔══════════════╗          ← wall A (going right)
 *    ──────────── ║              ║
 *                 ║   MITER PT   ║──────────
 *    ──────────── ║              ║          ← wall B (going up)
 *                 ╚══════════════╝
 *
 * ─── Convention ──────────────────────────────────────────────────────────────
 *
 *   "Right" side of a wall = perpCW(direction)  = (dz, −dx) in XZ plane.
 *   "Left"  side of a wall = perpCCW(direction) = (−dz, dx) in XZ plane.
 *
 *   This matches the "right-hand rule when walking from start to end".
 *
 * ─── Open ends ───────────────────────────────────────────────────────────────
 *
 *   When a wall has no neighbour at one end, the corner vertices are simply
 *   the perpendicular endpoints: start ± perpendicular * (thickness/2).
 *
 * ─── T / X junctions ─────────────────────────────────────────────────────────
 *
 *   WallNeighbours returns null for T/X junctions (≥2 other walls share
 *   the node).  We fall back to perpendicular cuts.  Phase 2 can improve
 *   this with proper CSG boolean subtraction.
 */

import type { Vec2, ResolvedWall, WallFootprint } from '../types.ts';
import { sub, add, scale, normalize, perpCW, perpCCW } from './vec2.ts';
import { offsetLineIntersect } from './intersect.ts';
import type { WallNeighbours } from './wallGraph.ts';

// ─── Per-end joint helper ─────────────────────────────────────────────────────

/**
 * Compute the LEFT and RIGHT vertices at one end of `wall`.
 *
 * @param wall       The wall whose endpoint we're resolving.
 * @param isEndSide  true → resolve the END of `wall`; false → resolve the START.
 * @param neighbour  The adjacent wall on the other side of this endpoint, or null.
 */
function resolveEndpoint(
  wall: ResolvedWall,
  isEndSide: boolean,
  neighbour: ResolvedWall | null,
): { left: Vec2; right: Vec2 } {
  // Direction of this wall (start → end)
  const dir   = normalize(sub(wall.end, wall.start));
  const nR    = perpCW(dir);   // right normal
  const nL    = perpCCW(dir);  // left normal
  const half  = wall.thickness / 2;

  // The anchor is the endpoint we're computing
  const anchor: Vec2 = isEndSide ? wall.end : wall.start;

  // ── Perpendicular fallback (no neighbour or T/X junction) ────────────────
  if (!neighbour) {
    return {
      right: add(anchor, scale(nR, half)),
      left:  add(anchor, scale(nL, half)),
    };
  }

  // ── Miter: intersect offset lines ────────────────────────────────────────
  const nDirNeighbour = normalize(sub(neighbour.end, neighbour.start));
  const nRNeighbour   = perpCW(nDirNeighbour);
  const nLNeighbour   = perpCCW(nDirNeighbour);
  const halfN         = neighbour.thickness / 2;

  // Neighbour anchor is:
  //   - If this is the END of wall → neighbour STARTS here → use neighbour.start
  //   - If this is the START of wall → neighbour ENDS here → use neighbour.end
  const anchorN: Vec2 = isEndSide ? neighbour.start : neighbour.end;

  // ── Right side ────────────────────────────────────────────────────────────
  // This wall's right offset line runs through (anchor + nR*half) with direction dir.
  // Neighbour's right offset line runs through (anchorN + nRNeighbour*halfN) with
  // direction nDirNeighbour.
  const rightPt = offsetLineIntersect(
    anchor,    dir,          scale(nR, half),
    anchorN,   nDirNeighbour, scale(nRNeighbour, halfN),
  );

  // ── Left side ─────────────────────────────────────────────────────────────
  const leftPt = offsetLineIntersect(
    anchor,    dir,          scale(nL, half),
    anchorN,   nDirNeighbour, scale(nLNeighbour, halfN),
  );

  return {
    right: rightPt ?? add(anchor, scale(nR, half)),
    left:  leftPt  ?? add(anchor, scale(nL, half)),
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Compute the full 2D footprint of a wall, with miter joints applied at
 * both ends.
 *
 * The footprint has 4 vertices in the XZ plane:
 *
 *   startLeft ──── endLeft
 *       │                │
 *   startRight ─── endRight
 *
 * (The "left" side faces the interior if rooms are on the left when
 * walking from start → end.)
 */
export function computeWallFootprint(
  wall: ResolvedWall,
  neighbours: WallNeighbours,
): WallFootprint {
  const startJoint = resolveEndpoint(wall, false, neighbours.incomingAtStart);
  const endJoint   = resolveEndpoint(wall, true,  neighbours.outgoingAtEnd);

  return {
    wallId:     wall.id,
    startRight: startJoint.right,
    startLeft:  startJoint.left,
    endRight:   endJoint.right,
    endLeft:    endJoint.left,
    height:     wall.height,
  };
}

// ─── Diagnostic helpers ───────────────────────────────────────────────────────

/**
 * Return the approximate length of a wall footprint's centreline
 * (distance between midpoints of start and end edges).
 */
export function footprintLength(fp: WallFootprint): number {
  const midStart = {
    x: (fp.startRight.x + fp.startLeft.x) / 2,
    z: (fp.startRight.z + fp.startLeft.z) / 2,
  };
  const midEnd = {
    x: (fp.endRight.x + fp.endLeft.x) / 2,
    z: (fp.endRight.z + fp.endLeft.z) / 2,
  };
  const dx = midEnd.x - midStart.x;
  const dz = midEnd.z - midStart.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Approximate width of a wall footprint at the start edge.
 */
export function footprintWidth(fp: WallFootprint): number {
  const dx = fp.startRight.x - fp.startLeft.x;
  const dz = fp.startRight.z - fp.startLeft.z;
  return Math.sqrt(dx * dx + dz * dz);
}
