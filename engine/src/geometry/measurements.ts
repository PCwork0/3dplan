/**
 * measurements.ts — Compute wall dimension data for UI overlays.
 *
 * Each WallMeasurement provides:
 *   - centreline length (metres)
 *   - 3D midpoint (for label anchor)
 *   - perpendicular unit vector (for offsetting label away from wall face)
 */

import type { ResolvedWall, WallMeasurement } from '../types.ts';

/**
 * Build one WallMeasurement per resolved wall.
 */
export function buildWallMeasurements(resolved: ResolvedWall[]): WallMeasurement[] {
  return resolved.map(buildMeasurement);
}

function buildMeasurement(wall: ResolvedWall): WallMeasurement {
  const { start, end, id, height } = wall;

  // Centreline vector
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.sqrt(dx * dx + dz * dz);

  // Midpoint
  const midX = (start.x + end.x) / 2;
  const midZ = (start.z + end.z) / 2;
  const midY = height / 2;

  // Perpendicular unit vector (rotated 90° CCW from wall direction)
  // Wall dir = (dx, dz) / length → perp CCW = (-dz, dx) / length
  let labelDX: number;
  let labelDZ: number;
  if (length < 1e-8) {
    // Degenerate wall — fallback to +X
    labelDX = 1;
    labelDZ = 0;
  } else {
    labelDX = -dz / length;
    labelDZ =  dx / length;
  }

  return { wallId: id, length, midX, midY, midZ, labelDX, labelDZ };
}
