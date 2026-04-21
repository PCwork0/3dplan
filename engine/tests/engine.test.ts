import { describe, it, expect, beforeAll } from 'vitest';
import { buildSceneFromJSON, buildSceneSafe, validateInput } from '../src/index.ts';
import type { FloorPlanInput, SceneData } from '../src/types.ts';

const close = (a: number, b: number, eps = 1e-4) =>
  expect(Math.abs(a - b)).toBeLessThan(eps);

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

// ─── Schema validation ────────────────────────────────────────────────────────

describe('schema validation', () => {
  it('accepts a valid single-room plan', () => {
    const r = validateInput(SINGLE_ROOM);
    expect(r.ok).toBe(true);
  });

  it('rejects missing nodes', () => {
    const r = validateInput({ ...SINGLE_ROOM, nodes: undefined });
    expect(r.ok).toBe(false);
  });

  it('rejects wall referencing unknown node', () => {
    const r = validateInput({
      ...SINGLE_ROOM,
      walls: [{ id: 'wx', startNode: 'n1', endNode: 'MISSING' }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.message.includes('MISSING'))).toBe(true);
  });

  it('rejects self-loop wall', () => {
    const r = validateInput({
      ...SINGLE_ROOM,
      walls: [{ id: 'wx', startNode: 'n1', endNode: 'n1' }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects room with fewer than 3 nodes', () => {
    const r = validateInput({
      ...SINGLE_ROOM,
      rooms: [{ id: 'r1', name: 'Bad', nodeIds: ['n1', 'n2'] }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects units other than "meters"', () => {
    const r = validateInput({ ...SINGLE_ROOM, units: 'feet' });
    expect(r.ok).toBe(false);
  });

  it('rejects wall thickness < 0.01', () => {
    const r = validateInput({
      ...SINGLE_ROOM,
      walls: [{ id: 'w1', startNode: 'n1', endNode: 'n2', thickness: 0.001 }],
    });
    expect(r.ok).toBe(false);
  });

  it('accepts openings with valid t ∈ [0,1]', () => {
    const r = validateInput({
      ...SINGLE_ROOM,
      openings: [{ id: 'o1', wallId: 'w1', type: 'door', t: 0.5, width: 0.9 }],
    });
    expect(r.ok).toBe(true);
  });

  it('rejects opening t outside [0,1]', () => {
    const r = validateInput({
      ...SINGLE_ROOM,
      openings: [{ id: 'o1', wallId: 'w1', type: 'door', t: 1.5, width: 0.9 }],
    });
    expect(r.ok).toBe(false);
  });
});

// ─── Single room pipeline ─────────────────────────────────────────────────────

describe('buildScene — single room', () => {
  let scene: SceneData;

  beforeAll(() => {
    const result = buildSceneSafe(SINGLE_ROOM);
    expect(result.ok, `engine failed: ${result.ok ? '' : JSON.stringify((result as any).errors)}`).toBe(true);
    scene = (result as Extract<typeof result, { ok: true }>).data;
  });

  it('produces 4 wall meshes', () => expect(scene.walls.length).toBe(4));
  it('produces 1 floor mesh',  () => expect(scene.floors.length).toBe(1));
  it('floor name is correct',  () => expect(scene.floors[0]!.name).toBe('Living Room'));
  it('floor has 4 polygon vertices', () => expect(scene.floors[0]!.polygon.length).toBe(4));
  it('floor elevation defaults to 0', () => expect(scene.floors[0]!.elevation).toBe(0));

  it('wall position buffers are non-empty and divisible by 9', () => {
    for (const w of scene.walls) {
      expect(w.positions.length).toBeGreaterThan(0);
      expect(w.positions.length % 9, `wall ${w.id}: positions.length (${w.positions.length}) must be divisible by 9`).toBe(0);
    }
  });

  it('normals length matches positions length', () => {
    for (const w of scene.walls) {
      expect(w.normals.length, `wall ${w.id}: normals/positions mismatch`).toBe(w.positions.length);
    }
  });

  it('uvs have 2/3 the element count of positions', () => {
    for (const w of scene.walls) {
      expect(w.uvs.length * 3, `wall ${w.id}: uvs length mismatch`).toBe(w.positions.length * 2);
    }
  });

  it('vertexCount equals positions.length / 3', () => {
    for (const w of scene.walls) {
      expect(w.vertexCount).toBe(w.positions.length / 3);
    }
  });

  it('no NaN or Infinity in any buffer', () => {
    for (const w of scene.walls) {
      expect(w.positions.every(Number.isFinite), `wall ${w.id} positions contain NaN/Inf`).toBe(true);
      expect(w.normals.every(Number.isFinite),   `wall ${w.id} normals contain NaN/Inf`).toBe(true);
      expect(w.uvs.every(Number.isFinite),       `wall ${w.id} uvs contain NaN/Inf`).toBe(true);
    }
  });

  it('bounding box spans ≥ 4.5m in X and ≥ 3.5m in Z', () => {
    const b = scene.bounds;
    expect(b.maxX - b.minX).toBeGreaterThanOrEqual(4.5);
    expect(b.maxZ - b.minZ).toBeGreaterThanOrEqual(3.5);
  });

  it('bounding box maxY equals wall height (3m)', () => {
    expect(scene.bounds.maxY).toBe(3);
  });
});

// ─── Two-room pipeline ────────────────────────────────────────────────────────

describe('buildScene — two rooms', () => {
  let scene: SceneData;

  beforeAll(() => {
    const result = buildSceneSafe(TWO_ROOMS);
    expect(result.ok, 'two-room engine failed').toBe(true);
    scene = (result as Extract<typeof result, { ok: true }>).data;
  });

  it('produces 7 wall meshes', () => expect(scene.walls.length).toBe(7));
  it('produces 2 floor meshes', () => expect(scene.floors.length).toBe(2));

  it('no NaN in any buffer', () => {
    for (const w of scene.walls) {
      expect(w.positions.every(Number.isFinite), `wall ${w.id} has NaN positions`).toBe(true);
    }
  });
});

// ─── JSON parsing ─────────────────────────────────────────────────────────────

describe('buildSceneFromJSON', () => {
  it('parses a valid JSON string and builds scene', () => {
    const r = buildSceneFromJSON(JSON.stringify(SINGLE_ROOM));
    expect(r.ok).toBe(true);
  });

  it('returns error for invalid JSON syntax', () => {
    const r = buildSceneFromJSON('not json {{{');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.field).toBe('root');
  });

  it('returns validation errors for structurally invalid content', () => {
    const r = buildSceneFromJSON(JSON.stringify({ version: '1.0' }));
    expect(r.ok).toBe(false);
  });
});

// ─── Floor mesh geometry ──────────────────────────────────────────────────────

describe('floor mesh polygon winding', () => {
  it('floor polygon is CCW (positive signed area)', () => {
    const result = buildSceneSafe(SINGLE_ROOM);
    expect(result.ok).toBe(true);
    const scene = (result as Extract<typeof result, { ok: true }>).data;
    const poly = scene.floors[0]!.polygon;
    const n = poly.length;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const [x0, z0] = poly[i]!;
      const [x1, z1] = poly[(i + 1) % n]!;
      area += x0 * z1 - x1 * z0;
    }
    expect(area / 2, `signed area should be positive (CCW), got ${area / 2}`).toBeGreaterThan(0);
  });
});
