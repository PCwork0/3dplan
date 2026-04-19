import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneFromJSON, buildSceneSafe, validateInput } from '../src/index.ts';
import type { FloorPlanInput } from '../src/types.ts';

const close = (a: number, b: number, label = '', eps = 1e-4) =>
  assert.ok(Math.abs(a - b) < eps, `${label}: Expected ${a} ≈ ${b}`);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SINGLE_ROOM: FloorPlanInput = {
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
  rooms: [
    { id: 'r1', name: 'Living Room', nodeIds: ['n1', 'n2', 'n3', 'n4'] },
  ],
};

const TWO_ROOMS: FloorPlanInput = {
  version: '1.0', units: 'meters',
  nodes: [
    { id: 'n1', x: 0, z: 0 },  { id: 'n2', x: 5, z: 0 },
    { id: 'n3', x: 10, z: 0 }, { id: 'n4', x: 10, z: 4 },
    { id: 'n5', x: 5, z: 4 },  { id: 'n6', x: 0, z: 4 },
  ],
  walls: [
    { id: 'w1', startNode: 'n1', endNode: 'n2' },
    { id: 'w2', startNode: 'n2', endNode: 'n3' },
    { id: 'w3', startNode: 'n3', endNode: 'n4' },
    { id: 'w4', startNode: 'n4', endNode: 'n5' },
    { id: 'w5', startNode: 'n5', endNode: 'n2' },
    { id: 'w6', startNode: 'n5', endNode: 'n6' },
    { id: 'w7', startNode: 'n6', endNode: 'n1' },
  ],
  rooms: [
    { id: 'r1', name: 'Living Room', nodeIds: ['n1', 'n2', 'n5', 'n6'] },
    { id: 'r2', name: 'Kitchen',     nodeIds: ['n2', 'n3', 'n4', 'n5'] },
  ],
};

// ─── Validation ───────────────────────────────────────────────────────────────

describe('schema validation', () => {
  it('accepts a valid single-room plan', () => {
    const r = validateInput(SINGLE_ROOM);
    assert.ok(r.ok, 'should be valid');
  });

  it('rejects missing nodes', () => {
    const r = validateInput({ ...SINGLE_ROOM, nodes: undefined });
    assert.ok(!r.ok);
  });

  it('rejects wall referencing unknown node', () => {
    const r = validateInput({
      ...SINGLE_ROOM,
      walls: [{ id: 'wx', startNode: 'n1', endNode: 'MISSING' }],
    });
    assert.ok(!r.ok);
    if (!r.ok) assert.ok(r.errors.some(e => e.message.includes('MISSING')));
  });

  it('rejects self-loop wall', () => {
    const r = validateInput({
      ...SINGLE_ROOM,
      walls: [{ id: 'wx', startNode: 'n1', endNode: 'n1' }],
    });
    assert.ok(!r.ok);
  });

  it('rejects room with fewer than 3 nodes', () => {
    const r = validateInput({
      ...SINGLE_ROOM,
      rooms: [{ id: 'r1', name: 'Bad', nodeIds: ['n1', 'n2'] }],
    });
    assert.ok(!r.ok);
  });

  it('rejects units other than "meters"', () => {
    const r = validateInput({ ...SINGLE_ROOM, units: 'feet' });
    assert.ok(!r.ok);
  });

  it('rejects wall thickness < 0.01', () => {
    const r = validateInput({
      ...SINGLE_ROOM,
      walls: [{ id: 'w1', startNode: 'n1', endNode: 'n2', thickness: 0.001 }],
    });
    assert.ok(!r.ok);
  });

  it('accepts openings with valid t ∈ [0,1]', () => {
    const r = validateInput({
      ...SINGLE_ROOM,
      openings: [{ id: 'o1', wallId: 'w1', type: 'door', t: 0.5, width: 0.9 }],
    });
    assert.ok(r.ok, r.ok ? '' : JSON.stringify((r as any).errors));
  });

  it('rejects opening t outside [0,1]', () => {
    const r = validateInput({
      ...SINGLE_ROOM,
      openings: [{ id: 'o1', wallId: 'w1', type: 'door', t: 1.5, width: 0.9 }],
    });
    assert.ok(!r.ok);
  });
});

// ─── Single room pipeline ─────────────────────────────────────────────────────

describe('buildScene — single room', () => {
  const result = buildSceneSafe(SINGLE_ROOM);
  assert.ok(result.ok, `engine failed: ${result.ok ? '' : JSON.stringify((result as any).errors)}`);
  const scene = (result as Extract<typeof result, { ok: true }>).data;

  it('produces 4 wall meshes', () => assert.equal(scene.walls.length, 4));
  it('produces 1 floor mesh',  () => assert.equal(scene.floors.length, 1));
  it('floor name is correct',  () => assert.equal(scene.floors[0]!.name, 'Living Room'));
  it('floor has 4 polygon vertices', () => assert.equal(scene.floors[0]!.polygon.length, 4));
  it('floor elevation defaults to 0', () => assert.equal(scene.floors[0]!.elevation, 0));

  it('wall position buffers are non-empty and divisible by 9', () => {
    for (const w of scene.walls) {
      assert.ok(w.positions.length > 0);
      assert.equal(w.positions.length % 9, 0,
        `wall ${w.id}: positions.length (${w.positions.length}) must be divisible by 9`);
    }
  });

  it('normals length matches positions length', () => {
    for (const w of scene.walls) {
      assert.equal(w.normals.length, w.positions.length,
        `wall ${w.id}: normals/positions mismatch`);
    }
  });

  it('uvs have 2/3 the element count of positions', () => {
    for (const w of scene.walls) {
      assert.equal(w.uvs.length * 3, w.positions.length * 2,
        `wall ${w.id}: uvs length mismatch`);
    }
  });

  it('vertexCount equals positions.length / 3', () => {
    for (const w of scene.walls) {
      assert.equal(w.vertexCount, w.positions.length / 3);
    }
  });

  it('no NaN or Infinity in any buffer', () => {
    for (const w of scene.walls) {
      assert.ok(w.positions.every(Number.isFinite), `wall ${w.id} positions contain NaN/Inf`);
      assert.ok(w.normals.every(Number.isFinite),   `wall ${w.id} normals contain NaN/Inf`);
      assert.ok(w.uvs.every(Number.isFinite),       `wall ${w.id} uvs contain NaN/Inf`);
    }
  });

  it('bounding box spans ≥ 4.5m in X and ≥ 3.5m in Z', () => {
    const b = scene.bounds;
    assert.ok(b.maxX - b.minX >= 4.5, `X span: ${b.maxX - b.minX}`);
    assert.ok(b.maxZ - b.minZ >= 3.5, `Z span: ${b.maxZ - b.minZ}`);
  });

  it('bounding box maxY equals wall height (3m)', () => {
    assert.equal(scene.bounds.maxY, 3);
  });
});

// ─── Two-room pipeline ────────────────────────────────────────────────────────

describe('buildScene — two rooms', () => {
  const result = buildSceneSafe(TWO_ROOMS);
  assert.ok(result.ok, `two-room engine failed`);
  const scene = (result as Extract<typeof result, { ok: true }>).data;

  it('produces 7 wall meshes', () => assert.equal(scene.walls.length, 7));
  it('produces 2 floor meshes', () => assert.equal(scene.floors.length, 2));

  it('no NaN in any buffer', () => {
    for (const w of scene.walls) {
      assert.ok(w.positions.every(Number.isFinite), `wall ${w.id} has NaN positions`);
    }
  });
});

// ─── JSON parsing ─────────────────────────────────────────────────────────────

describe('buildSceneFromJSON', () => {
  it('parses a valid JSON string and builds scene', () => {
    const r = buildSceneFromJSON(JSON.stringify(SINGLE_ROOM));
    assert.ok(r.ok);
  });

  it('returns error for invalid JSON syntax', () => {
    const r = buildSceneFromJSON('not json {{{');
    assert.ok(!r.ok);
    if (!r.ok) assert.equal(r.errors[0]!.field, 'root');
  });

  it('returns validation errors for structurally invalid content', () => {
    const r = buildSceneFromJSON(JSON.stringify({ version: '1.0' }));
    assert.ok(!r.ok);
  });
});

// ─── Floor mesh geometry ──────────────────────────────────────────────────────

describe('floor mesh polygon winding', () => {
  const result = buildSceneSafe(SINGLE_ROOM);
  assert.ok(result.ok);
  const scene = (result as Extract<typeof result, { ok: true }>).data;

  it('floor polygon is CCW (positive signed area)', () => {
    const poly = scene.floors[0]!.polygon;
    const n = poly.length;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const [x0, z0] = poly[i]!;
      const [x1, z1] = poly[(i + 1) % n]!;
      area += x0 * z1 - x1 * z0;
    }
    assert.ok(area / 2 > 0, `signed area should be positive (CCW), got ${area / 2}`);
  });
});
