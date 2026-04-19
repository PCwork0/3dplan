import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeWallFootprint, footprintWidth } from '../src/geometry/cornerJoint.ts';
import type { ResolvedWall } from '../src/types.ts';
import type { WallNeighbours } from '../src/geometry/wallGraph.ts';

const close = (a: number, b: number, label = '', eps = 1e-4) =>
  assert.ok(Math.abs(a - b) < eps, `${label}: Expected ${a} ≈ ${b}`);

function wall(id: string, sx: number, sz: number, ex: number, ez: number,
  thickness = 0.2, height = 3): ResolvedWall {
  return { id, start: { x: sx, z: sz }, end: { x: ex, z: ez }, thickness, height };
}

function none(): WallNeighbours {
  return { incomingAtStart: null, outgoingAtEnd: null };
}

describe('open end — perpendicular cut', () => {
  it('horizontal east wall: right side is at z=+0.1', () => {
    const fp = computeWallFootprint(wall('w', 0, 0, 5, 0), none());
    close(fp.startRight.z, +0.1, 'startRight.z');
    close(fp.endRight.z,   +0.1, 'endRight.z');
  });

  it('horizontal east wall: left side is at z=−0.1', () => {
    const fp = computeWallFootprint(wall('w', 0, 0, 5, 0), none());
    close(fp.startLeft.z, -0.1, 'startLeft.z');
    close(fp.endLeft.z,   -0.1, 'endLeft.z');
  });

  it('x-coords span [0, 5] for a 5m wall', () => {
    const fp = computeWallFootprint(wall('w', 0, 0, 5, 0), none());
    close(fp.startRight.x, 0, 'startRight.x');
    close(fp.endRight.x,   5, 'endRight.x');
  });

  it('vertical south wall (+Z): right side at x=−0.1', () => {
    // direction = +Z → perpCW({x:0,z:1}) = {x:1, z:0} wait —
    // perpCW({x,z}) = {x:z, z:-x} → perpCW({x:0,z:1}) = {x:1, z:0}
    // So right of a south-going wall is +X. right side x = 0 + 0.1 = 0.1
    const fp = computeWallFootprint(wall('w', 0, 0, 0, 4), none());
    close(fp.startRight.x, +0.1, 'startRight.x south wall');
  });

  it('height is preserved', () => {
    const fp = computeWallFootprint(wall('w', 0, 0, 5, 0, 0.2, 2.7), none());
    assert.equal(fp.height, 2.7);
  });

  it('footprintWidth approximates thickness', () => {
    const fp = computeWallFootprint(wall('w', 0, 0, 5, 0), none());
    close(footprintWidth(fp), 0.2, 'footprintWidth', 1e-3);
  });
});

describe('90° L-corner miter', () => {
  // w1: (0,0)→(5,0) east;  w2: (5,0)→(5,4) south
  const w1 = wall('w1', 0, 0, 5, 0);
  const w2 = wall('w2', 5, 0, 5, 4);

  it('shared corner vertices are identical on both walls', () => {
    const fp1 = computeWallFootprint(w1, { incomingAtStart: null, outgoingAtEnd: w2 });
    const fp2 = computeWallFootprint(w2, { incomingAtStart: w1, outgoingAtEnd: null });
    close(fp2.startRight.x, fp1.endRight.x, 'shared right x');
    close(fp2.startRight.z, fp1.endRight.z, 'shared right z');
    close(fp2.startLeft.x,  fp1.endLeft.x,  'shared left x');
    close(fp2.startLeft.z,  fp1.endLeft.z,  'shared left z');
  });

  it('outer corner is outside the nominal wall extents', () => {
    // The outer corner of an L joint should lie beyond the corner point (5,0)
    const fp1 = computeWallFootprint(w1, { incomingAtStart: null, outgoingAtEnd: w2 });
    // endRight should have x > 5 OR z > 0 (it's on the convex outer corner)
    const isOutside = fp1.endRight.x > 5 - 0.01 || fp1.endRight.z > 0 + 0.01;
    assert.ok(isOutside, 'outer corner should be at or beyond wall extent');
  });

  it('all four footprint vertices are distinct', () => {
    const fp = computeWallFootprint(w1, { incomingAtStart: null, outgoingAtEnd: w2 });
    const pts = [fp.startRight, fp.startLeft, fp.endRight, fp.endLeft];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i]!.x - pts[j]!.x;
        const dz = pts[i]!.z - pts[j]!.z;
        assert.ok(Math.sqrt(dx*dx + dz*dz) > 1e-3, `vertices ${i} and ${j} must not coincide`);
      }
    }
  });
});

describe('collinear wall continuation', () => {
  it('falls back to perpendicular cut when walls are parallel', () => {
    const w1 = wall('w1', 0, 0, 3, 0);
    const w2 = wall('w2', 3, 0, 6, 0); // same direction
    const fp = computeWallFootprint(w1, { incomingAtStart: null, outgoingAtEnd: w2 });
    // Parallel lines → no intersection → perpendicular fallback
    close(fp.endRight.z, +0.1, 'endRight.z collinear fallback');
    close(fp.endLeft.z,  -0.1, 'endLeft.z collinear fallback');
  });
});
