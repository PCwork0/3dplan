/**
 * intersect.ts — Line and segment intersection in 2D.
 *
 * All functions operate on Vec2 ({x, z}) and are pure / dependency-free
 * (except for vec2 helpers).
 */

import type { Vec2 } from '../types.ts';
import { sub, scale, add, cross, EPSILON } from './vec2.ts';

// ─── Result types ─────────────────────────────────────────────────────────────

export interface LineIntersection {
  /** The intersection point in 2D. */
  point: Vec2;
  /** Parameter along line 1: point = p1 + t · d1 */
  t: number;
  /** Parameter along line 2: point = p2 + s · d2 */
  s: number;
}

// ─── Infinite line × infinite line ───────────────────────────────────────────

/**
 * Intersect two infinite lines:
 *   Line 1: p1 + t · d1
 *   Line 2: p2 + s · d2
 *
 * Returns null when the lines are parallel (or coincident).
 *
 * Derivation:
 *   p1 + t·d1 = p2 + s·d2
 *   (p2 - p1) × d2 = t · (d1 × d2)          [cross both sides with d2]
 *   t = ((p2 - p1) × d2) / (d1 × d2)
 *   s = ((p2 - p1) × d1) / (d1 × d2)
 */
export function lineLineIntersect(
  p1: Vec2, d1: Vec2,
  p2: Vec2, d2: Vec2,
): LineIntersection | null {
  const denom = cross(d1, d2);
  if (Math.abs(denom) < EPSILON) return null; // parallel or coincident

  const diff = sub(p2, p1);
  const t = cross(diff, d2) / denom;
  const s = cross(diff, d1) / denom;

  return {
    point: add(p1, scale(d1, t)),
    t,
    s,
  };
}

// ─── Segment × segment ────────────────────────────────────────────────────────

export interface SegmentIntersection extends LineIntersection {
  /** Whether the intersection lies within both segment extents [0,1]. */
  withinBothSegments: boolean;
}

/**
 * Intersect two line *segments*:
 *   Segment 1: p1 → p1 + d1  (parameterised 0..1)
 *   Segment 2: p2 → p2 + d2  (parameterised 0..1)
 *
 * `t` and `s` lie in [0,1] when the intersection is within the respective segment.
 * Returns null when segments are parallel.
 */
export function segmentSegmentIntersect(
  p1: Vec2, d1: Vec2,
  p2: Vec2, d2: Vec2,
): SegmentIntersection | null {
  const result = lineLineIntersect(p1, d1, p2, d2);
  if (!result) return null;
  return {
    ...result,
    withinBothSegments:
      result.t >= -EPSILON && result.t <= 1 + EPSILON &&
      result.s >= -EPSILON && result.s <= 1 + EPSILON,
  };
}

// ─── Offset line helpers ──────────────────────────────────────────────────────

/**
 * Compute the intersection of two offset lines — the core of the miter algorithm.
 *
 * An "offset line" for a wall is the infinite line running parallel to the
 * wall's centreline, displaced by (thickness/2) to one side.
 *
 * Given:
 *   wallA: centred on lineA, thickness tA, offset to side sideA
 *   wallB: centred on lineB, thickness tB, offset to side sideB
 *
 * This function is intentionally lower-level; see cornerJoint.ts for usage.
 *
 * @param anchorA  Any point on wall A's centreline
 * @param dirA     Unit direction of wall A
 * @param offsetA  Lateral offset vector (already scaled to tA/2)
 * @param anchorB  Any point on wall B's centreline
 * @param dirB     Unit direction of wall B
 * @param offsetB  Lateral offset vector (already scaled to tB/2)
 */
export function offsetLineIntersect(
  anchorA: Vec2, dirA: Vec2, offsetA: Vec2,
  anchorB: Vec2, dirB: Vec2, offsetB: Vec2,
): Vec2 | null {
  // Shift anchors by their respective offsets
  const shiftedA: Vec2 = { x: anchorA.x + offsetA.x, z: anchorA.z + offsetA.z };
  const shiftedB: Vec2 = { x: anchorB.x + offsetB.x, z: anchorB.z + offsetB.z };

  const result = lineLineIntersect(shiftedA, dirA, shiftedB, dirB);
  return result?.point ?? null;
}
