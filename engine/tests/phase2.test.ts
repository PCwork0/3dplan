/**
 * phase2.test.ts — TDD tests for Phase 2 engine enrichments.
 *
 * Features under test:
 *   E1 · FloorMesh3D.centroid
 *   E2 · SceneData.ceilings
 *   E3 · SceneData.measurements  (WallMeasurement[])
 *
 * Tests are written BEFORE implementation; they should start RED and
 * turn GREEN as each feature is added.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { buildSceneSafe } from '../src/index.ts';
import type { FloorPlanInput, SceneData, FloorMesh3D, WallMeasurement } from '../src/types.ts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const close = (a: number, b: number, eps = 0.001) =>
  expect(Math.abs(a - b)).toBeLessThan(eps);

function getScene(input: FloorPlanInput): SceneData {
  const r = buildSceneSafe(input);
  if (!r.ok) throw new Error('Engine failed: ' + JSON.stringify(r.errors));
  return r.data;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** 5×4 m rectangular room, walls 3 m high */
const RECT: FloorPlanInput = {
  version: '1.0', units: 'meters',
  nodes: [
    { id: 'n1', x: 0, z: 0 }, { id: 'n2', x: 5, z: 0 },
    { id: 'n3', x: 5, z: 4 }, { id: 'n4', x: 0, z: 4 },
  ],
  walls: [
    { id: 'w1', startNode: 'n1', endNode: 'n2', thickness: 0.2, height: 3 },
    { id: 'w2', startNode: 'n2', endNode: 'n3', thickness: 0.2, height: 3 },
    { id: 'w3', startNode: 'n3', endNode: 'n4', thickness: 0.2, height: 3 },
    { id: 'w4', startNode: 'n4', endNode: 'n1', thickness: 0.2, height: 3 },
  ],
  rooms: [{ id: 'r1', name: 'Living Room', nodeIds: ['n1', 'n2', 'n3', 'n4'] }],
};

/** L-shaped room (6 vertices). Centroid is NOT the simple box centre. */
const L_SHAPE: FloorPlanInput = {
  version: '1.0', units: 'meters',
  nodes: [
    { id: 'a', x: 0, z: 0 }, { id: 'b', x: 6, z: 0 },
    { id: 'c', x: 6, z: 3 }, { id: 'd', x: 3, z: 3 },
    { id: 'e', x: 3, z: 6 }, { id: 'f', x: 0, z: 6 },
  ],
  walls: [
    { id: 'w1', startNode: 'a', endNode: 'b' },
    { id: 'w2', startNode: 'b', endNode: 'c' },
    { id: 'w3', startNode: 'c', endNode: 'd' },
    { id: 'w4', startNode: 'd', endNode: 'e' },
    { id: 'w5', startNode: 'e', endNode: 'f' },
    { id: 'w6', startNode: 'f', endNode: 'a' },
  ],
  rooms: [{ id: 'r1', name: 'L Room', nodeIds: ['a','b','c','d','e','f'] }],
};

/** Two rooms side-by-side with different wall heights (for ceiling elevation test). */
const TWO_ROOMS_DIFF_HEIGHT: FloorPlanInput = {
  version: '1.0', units: 'meters',
  nodes: [
    { id: 'n1', x: 0, z: 0 },  { id: 'n2', x: 5, z: 0 },
    { id: 'n3', x: 10, z: 0 }, { id: 'n4', x: 10, z: 4 },
    { id: 'n5', x: 5, z: 4 },  { id: 'n6', x: 0, z: 4 },
  ],
  walls: [
    { id: 'w1', startNode: 'n1', endNode: 'n2', height: 2.7 },
    { id: 'w2', startNode: 'n2', endNode: 'n3', height: 3.5 },
    { id: 'w3', startNode: 'n3', endNode: 'n4', height: 3.5 },
    { id: 'w4', startNode: 'n4', endNode: 'n5', height: 3.5 },
    { id: 'w5', startNode: 'n5', endNode: 'n2', height: 3.0 },
    { id: 'w6', startNode: 'n5', endNode: 'n6', height: 2.7 },
    { id: 'w7', startNode: 'n6', endNode: 'n1', height: 2.7 },
  ],
  rooms: [
    { id: 'r1', name: 'Living Room', nodeIds: ['n1','n2','n5','n6'] },
    { id: 'r2', name: 'Kitchen',     nodeIds: ['n2','n3','n4','n5'] },
  ],
};

/** Single wall plan — simplest case for measurement testing. */
const SINGLE_WALL: FloorPlanInput = {
  version: '1.0', units: 'meters',
  nodes: [
    { id: 'n1', x: 0, z: 0 }, { id: 'n2', x: 4, z: 0 },
    { id: 'n3', x: 4, z: 3 }, { id: 'n4', x: 0, z: 3 },
  ],
  walls: [
    { id: 'w1', startNode: 'n1', endNode: 'n2', thickness: 0.2, height: 3 },
    { id: 'w2', startNode: 'n2', endNode: 'n3', thickness: 0.2, height: 3 },
    { id: 'w3', startNode: 'n3', endNode: 'n4', thickness: 0.2, height: 3 },
    { id: 'w4', startNode: 'n4', endNode: 'n1', thickness: 0.2, height: 3 },
  ],
  rooms: [{ id: 'r1', name: 'Room', nodeIds: ['n1','n2','n3','n4'] }],
};

// ─── E1: Room Centroid ────────────────────────────────────────────────────────

describe('E1 · FloorMesh3D.centroid', () => {
  let scene: SceneData;
  let floor: FloorMesh3D;

  beforeAll(() => {
    scene = getScene(RECT);
    floor = scene.floors[0]!;
  });

  it('centroid field exists on FloorMesh3D', () => {
    expect(floor.centroid).toBeDefined();
    expect(Array.isArray(floor.centroid)).toBe(true);
    expect(floor.centroid.length).toBe(2);
  });

  it('centroid is [2.5, 2.0] for 5×4 m room', () => {
    close(floor.centroid[0], 2.5);
    close(floor.centroid[1], 2.0);
  });

  it('centroid coordinates are finite', () => {
    expect(Number.isFinite(floor.centroid[0])).toBe(true);
    expect(Number.isFinite(floor.centroid[1])).toBe(true);
  });

  it('centroid is inside L-shaped room (within bounding box)', () => {
    const s = getScene(L_SHAPE);
    const [cx, cz] = s.floors[0]!.centroid;
    // L-shape bounding box: x ∈ [0,6], z ∈ [0,6]
    expect(cx).toBeGreaterThan(0);
    expect(cx).toBeLessThan(6);
    expect(cz).toBeGreaterThan(0);
    expect(cz).toBeLessThan(6);
  });

  it('L-shape centroid is the mean of its 6 vertices', () => {
    const s = getScene(L_SHAPE);
    const [cx, cz] = s.floors[0]!.centroid;
    // Vertices: (0,0),(6,0),(6,3),(3,3),(3,6),(0,6)
    const expectedX = (0 + 6 + 6 + 3 + 3 + 0) / 6; // 3.0
    const expectedZ = (0 + 0 + 3 + 3 + 6 + 6) / 6; // 3.0
    close(cx, expectedX);
    close(cz, expectedZ);
  });

  it('all floors in multi-room plan have finite centroids', () => {
    const s = getScene(TWO_ROOMS_DIFF_HEIGHT);
    for (const f of s.floors) {
      expect(Number.isFinite(f.centroid[0]), `floor ${f.id} centroid[0] is NaN`).toBe(true);
      expect(Number.isFinite(f.centroid[1]), `floor ${f.id} centroid[1] is NaN`).toBe(true);
    }
  });
});

// ─── E2: Ceiling Mesh ─────────────────────────────────────────────────────────

describe('E2 · SceneData.ceilings', () => {
  let scene: SceneData;

  beforeAll(() => { scene = getScene(RECT); });

  it('ceilings array exists on SceneData', () => {
    expect(scene.ceilings).toBeDefined();
    expect(Array.isArray(scene.ceilings)).toBe(true);
  });

  it('ceilings.length equals floors.length', () => {
    expect(scene.ceilings.length).toBe(scene.floors.length);
  });

  it('ceiling polygon matches floor polygon exactly', () => {
    const floor = scene.floors[0]!;
    const ceil  = scene.ceilings[0]!;
    expect(ceil.polygon.length).toBe(floor.polygon.length);
    for (let i = 0; i < floor.polygon.length; i++) {
      close(ceil.polygon[i]![0], floor.polygon[i]![0]);
      close(ceil.polygon[i]![1], floor.polygon[i]![1]);
    }
  });

  it('ceiling elevation equals max wall height (3.0 m)', () => {
    close(scene.ceilings[0]!.elevation, 3.0);
  });

  it('ceiling id has "__ceiling" suffix', () => {
    expect(scene.ceilings[0]!.id).toBe('r1__ceiling');
  });

  it('ceiling name has " Ceiling" suffix', () => {
    expect(scene.ceilings[0]!.name).toBe('Living Room Ceiling');
  });

  it('two-room plan: two ceilings with correct elevations', () => {
    const s = getScene(TWO_ROOMS_DIFF_HEIGHT);
    expect(s.ceilings.length).toBe(2);

    // Each ceiling elevation = maxY of bounds (all walls contribute)
    for (const c of s.ceilings) {
      expect(c.elevation).toBeGreaterThan(0);
      expect(Number.isFinite(c.elevation)).toBe(true);
    }
  });

  it('ceiling has centroid field', () => {
    const c = scene.ceilings[0]!;
    expect(c.centroid).toBeDefined();
    expect(Number.isFinite(c.centroid[0])).toBe(true);
  });

  it('ceiling polygon coordinates are all finite', () => {
    for (const c of scene.ceilings) {
      for (const [x, z] of c.polygon) {
        expect(Number.isFinite(x), `ceiling ${c.id} x is NaN`).toBe(true);
        expect(Number.isFinite(z), `ceiling ${c.id} z is NaN`).toBe(true);
      }
    }
  });
});

// ─── E3: Wall Measurements ────────────────────────────────────────────────────

describe('E3 · SceneData.measurements', () => {
  let scene: SceneData;

  beforeAll(() => { scene = getScene(SINGLE_WALL); });

  it('measurements array exists on SceneData', () => {
    expect(scene.measurements).toBeDefined();
    expect(Array.isArray(scene.measurements)).toBe(true);
  });

  it('one measurement per wall', () => {
    expect(scene.measurements.length).toBe(4); // SINGLE_WALL has 4 walls
  });

  it('measurement for w1 has correct length (4.0 m)', () => {
    const m = scene.measurements.find((m: WallMeasurement) => m.wallId === 'w1')!;
    expect(m).toBeDefined();
    close(m.length, 4.0);
  });

  it('measurement for w2 has correct length (3.0 m)', () => {
    const m = scene.measurements.find((m: WallMeasurement) => m.wallId === 'w2')!;
    expect(m).toBeDefined();
    close(m.length, 3.0);
  });

  it('measurement midpoint for w1 is at (2.0, ?, 0.0)', () => {
    const m = scene.measurements.find((m: WallMeasurement) => m.wallId === 'w1')!;
    close(m.midX, 2.0);
    close(m.midZ, 0.0);
  });

  it('measurement midY for w1 is half wall height (1.5 m)', () => {
    const m = scene.measurements.find((m: WallMeasurement) => m.wallId === 'w1')!;
    close(m.midY, 1.5);
  });

  it('label direction vector has unit magnitude', () => {
    for (const m of scene.measurements) {
      const mag = Math.sqrt(m.labelDX ** 2 + m.labelDZ ** 2);
      expect(mag).toBeCloseTo(1.0, 3);
    }
  });

  it('no NaN or Infinity in any measurement field', () => {
    for (const m of scene.measurements) {
      const vals = [m.length, m.midX, m.midY, m.midZ, m.labelDX, m.labelDZ];
      for (const v of vals) {
        expect(Number.isFinite(v), `measurement ${m.wallId} has non-finite value ${v}`).toBe(true);
      }
    }
  });

  it('all walls in RECT plan have measurements', () => {
    const s = getScene(RECT);
    expect(s.measurements.length).toBe(4);
    const ids = s.measurements.map((m: WallMeasurement) => m.wallId).sort();
    expect(ids).toEqual(['w1','w2','w3','w4']);
  });
});

// ─── Regression: existing tests must still pass ───────────────────────────────

describe('regression · existing fields still present', () => {
  it('walls / floors / bounds still exist', () => {
    const s = getScene(RECT);
    expect(s.walls.length).toBeGreaterThan(0);
    expect(s.floors.length).toBeGreaterThan(0);
    expect(s.bounds.maxY).toBe(3);
  });

  it('wall buffers still valid', () => {
    const s = getScene(RECT);
    for (const w of s.walls) {
      expect(w.positions.length % 9).toBe(0);
      expect(w.positions.every(Number.isFinite)).toBe(true);
    }
  });
});
