/**
 * polygon.ts — Polygon utilities: winding, area, validity, ear-clip triangulation.
 *
 * All functions operate on Vec2[] and are pure / dependency-free.
 */

import type { Vec2 } from '../types.ts';
import { sub, cross } from './vec2.ts';

// ─── Winding & area ───────────────────────────────────────────────────────────

/**
 * Signed area of a polygon (Shoelace formula).
 * Positive → CCW winding; negative → CW winding.
 */
export function signedArea(poly: Vec2[]): number {
  const n = poly.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    area += a.x * b.z - b.x * a.z;
  }
  return area / 2;
}

export const area = (poly: Vec2[]): number => Math.abs(signedArea(poly));

/** True when the polygon has CCW winding (positive signed area). */
export const isCCW = (poly: Vec2[]): boolean => signedArea(poly) > 0;

/** Reverse polygon winding in place (returns new array). */
export const reversePoly = (poly: Vec2[]): Vec2[] => [...poly].reverse();

/** Ensure CCW winding — reverse if CW. */
export const ensureCCW = (poly: Vec2[]): Vec2[] =>
  isCCW(poly) ? poly : reversePoly(poly);

// ─── Centroid ─────────────────────────────────────────────────────────────────

export function centroid(poly: Vec2[]): Vec2 {
  let cx = 0, cz = 0;
  for (const v of poly) { cx += v.x; cz += v.z; }
  return { x: cx / poly.length, z: cz / poly.length };
}

// ─── Point-in-polygon (ray casting) ──────────────────────────────────────────

/**
 * Test whether point `p` is inside `poly` (works for concave polygons).
 * Uses ray casting along +X direction.
 */
export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  const n = poly.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = poly[i]!;
    const vj = poly[j]!;
    if (
      vi.z > p.z !== vj.z > p.z &&
      p.x < ((vj.x - vi.x) * (p.z - vi.z)) / (vj.z - vi.z) + vi.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

// ─── Ear-clipping triangulation ───────────────────────────────────────────────

/**
 * Triangulate a simple (non-self-intersecting) polygon using ear clipping.
 *
 * Returns an array of triangles, each as [Vec2, Vec2, Vec2].
 * The input polygon must have CCW winding (call ensureCCW first).
 * Works for convex and concave polygons. Does not handle holes.
 *
 * Time complexity: O(n²) — acceptable for floor plan polygons (< 100 vertices).
 */
export function earClip(poly: Vec2[]): [Vec2, Vec2, Vec2][] {
  if (poly.length < 3) return [];
  if (poly.length === 3) return [[poly[0]!, poly[1]!, poly[2]!]];

  // Work on a mutable copy of indices
  const indices = poly.map((_, i) => i);
  const triangles: [Vec2, Vec2, Vec2][] = [];

  let maxIter = poly.length * poly.length; // guard against infinite loop

  while (indices.length > 3 && maxIter-- > 0) {
    let earFound = false;

    for (let i = 0; i < indices.length; i++) {
      const iPrev = (i - 1 + indices.length) % indices.length;
      const iNext = (i + 1) % indices.length;

      const a = poly[indices[iPrev]!]!;
      const b = poly[indices[i]!]!;
      const c = poly[indices[iNext]!]!;

      // b is a convex vertex if the cross product (a→b) × (b→c) > 0 (CCW)
      if (cross(sub(b, a), sub(c, b)) <= 0) continue;

      // Check that no other vertex lies inside triangle abc
      let isEar = true;
      for (let j = 0; j < indices.length; j++) {
        if (j === iPrev || j === i || j === iNext) continue;
        if (pointInTriangle(poly[indices[j]!]!, a, b, c)) {
          isEar = false;
          break;
        }
      }

      if (isEar) {
        triangles.push([a, b, c]);
        indices.splice(i, 1);
        earFound = true;
        break;
      }
    }

    // Safety: if no ear found (e.g. degenerate polygon) break
    if (!earFound) break;
  }

  // Last triangle
  if (indices.length === 3) {
    triangles.push([
      poly[indices[0]!]!,
      poly[indices[1]!]!,
      poly[indices[2]!]!,
    ]);
  }

  return triangles;
}

/** Test if point p is strictly inside triangle (a, b, c). */
function pointInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const d1 = cross(sub(b, a), sub(p, a));
  const d2 = cross(sub(c, b), sub(p, b));
  const d3 = cross(sub(a, c), sub(p, c));

  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

// ─── Axis-aligned bounding box ────────────────────────────────────────────────

export interface AABB {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
}

export function aabb(points: Vec2[]): AABB {
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}

export function mergeAABB(a: AABB, b: AABB): AABB {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minZ: Math.min(a.minZ, b.minZ),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

export const emptyAABB = (): AABB =>
  ({ minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
