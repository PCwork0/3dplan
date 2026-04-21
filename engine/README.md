# @3d-floor-plan/geometry-engine

Pure TypeScript geometry engine that converts a 2D floor plan JSON into ready-to-render 3D mesh data for Three.js / react-three-fiber. No native dependencies, no Three.js imports — just math.

---

## What it does

Takes a structured JSON floor plan and produces flat buffer arrays (positions, normals, UVs) for walls and CCW polygon outlines for floors. Drop the output directly into `<bufferGeometry>` or `THREE.Shape`.

---

## Input

```json
{
  "version": "1.0",
  "units": "meters",
  "nodes": [
    { "id": "n1", "x": 0, "z": 0 },
    { "id": "n2", "x": 5, "z": 0 },
    { "id": "n3", "x": 5, "z": 4 },
    { "id": "n4", "x": 0, "z": 4 }
  ],
  "walls": [
    { "id": "w1", "startNode": "n1", "endNode": "n2", "thickness": 0.2, "height": 3 },
    { "id": "w2", "startNode": "n2", "endNode": "n3", "thickness": 0.2, "height": 3 },
    { "id": "w3", "startNode": "n3", "endNode": "n4", "thickness": 0.2, "height": 3 },
    { "id": "w4", "startNode": "n4", "endNode": "n1", "thickness": 0.2, "height": 3 }
  ],
  "rooms": [
    { "id": "r1", "name": "Living Room", "nodeIds": ["n1", "n2", "n3", "n4"] }
  ],
  "openings": [
    { "id": "o1", "wallId": "w1", "type": "door", "t": 0.3, "width": 0.9 }
  ]
}
```

- **Nodes** — corner points in the XZ plane (X = east, Z = south, Y = up)
- **Walls** — reference two nodes; extruded to `height`. `thickness` and `height` default to `0.2m` and `3m`
- **Rooms** — polygon regions defined by an ordered list of node IDs
- **Openings** — `t ∈ [0,1]` is a normalized position along the wall (0 = start, 1 = end)

---

## Pipeline

```
JSON string
    │
    ▼
① schema.ts — validate
    • node uniqueness, wall node refs, self-loops
    • room ≥ 3 nodes, opening t ∈ [0,1], thickness ≥ 0.01
    • returns typed ValidationError[] or { ok: true }
    │
    ▼
② wallGraph.ts — build topology
    • resolveWalls()     — look up (x,z) coords for each wall's start/end nodes
    • buildNeighbourMap() — for every wall, find which wall arrives at its
      start and which departs from its end
      (null if open end or T/X junction with 3+ walls)
    │
    ▼
③ cornerJoint.ts — miter geometry  ← the core algorithm
    • Intersect the two offset lines (parallel to the centreline, displaced
      by thickness/2) of adjacent walls — that intersection is the exact
      corner vertex: no gap, no overlap, at any angle
    • Falls back to a perpendicular cut for open ends or collinear walls
    • Produces WallFootprint: { startLeft, startRight, endLeft, endRight, height }
    │
    ▼
④ wallMesh.ts — extrude to 3D
    • Lifts the 4 XZ footprint points to Y=0 and Y=height → 8 vertices
    • Emits 6 faces × 2 triangles = 12 triangles = 36 non-indexed vertices
    • Analytically computed flat face normals (no averaging artifacts)
    • UV coords generated per face
    • Output: flat arrays — positions[], normals[], uvs[]
    │
    ▼
⑤ floorMesh.ts — room polygons
    • Looks up each room's node coordinates
    • Ensures CCW winding (Shoelace signed area)
    • Ear-clip triangulation for trianglePositions[] fallback
    • Output: polygon[] ready for THREE.Shape, plus elevation
    │
    ▼
⑥ index.ts — assemble SceneData
    • Collects all wall and floor meshes
    • Computes bounding box (minX/maxX/minZ/maxZ/maxY)
    • Returns { walls[], floors[], bounds }
```

---

## Output

```typescript
type SceneData = {
  walls: Array<{
    id:          string
    positions:   number[]  // flat [x,y,z, ...] — 36 numbers per wall (12 triangles)
    normals:     number[]  // same length as positions
    uvs:         number[]  // 2/3 the length (u,v per vertex)
    vertexCount: number
  }>
  floors: Array<{
    id:                string
    name:              string
    polygon:           [number, number][]  // CCW XZ points → THREE.Shape
    trianglePositions: number[]            // flat fallback geometry
    elevation:         number
  }>
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number }
}
```

---

## Usage

```typescript
import { buildScene, buildSceneSafe, buildSceneFromJSON } from '@3d-floor-plan/geometry-engine';

// Option A — throws on error
const scene = buildScene(floorPlanInput);

// Option B — safe result type
const result = buildSceneSafe(floorPlanInput);
if (result.ok) {
  const scene = result.data;
}

// Option C — parse from JSON string
const result = buildSceneFromJSON(jsonString);
```

### react-three-fiber integration

```tsx
// Wall mesh
<mesh>
  <bufferGeometry>
    <bufferAttribute
      attach="attributes-position"
      array={new Float32Array(wall.positions)}
      itemSize={3}
    />
    <bufferAttribute
      attach="attributes-normal"
      array={new Float32Array(wall.normals)}
      itemSize={3}
    />
    <bufferAttribute
      attach="attributes-uv"
      array={new Float32Array(wall.uvs)}
      itemSize={2}
    />
  </bufferGeometry>
  <meshStandardMaterial color="white" />
</mesh>

// Floor mesh via THREE.Shape
const shape = new THREE.Shape();
floor.polygon.forEach(([x, z], i) =>
  i === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z)
);
```

---

## Key geometric insight — the miter joint

The naive approach (a simple box per wall) leaves overlapping or gapped corners. The correct approach intersects the two *offset lines* — each displaced `thickness/2` from the centreline — of the two meeting walls. That single intersection point becomes the shared corner vertex of both walls, producing a clean miter at any angle:

```
  ──────────────╗          ← wall A (going east)
                ║  miter
  ══════════════╣  point   ← shared corner vertex
                ║
                ║          ← wall B (going south)
```

T-junctions and X-junctions (3+ walls at one node) fall back to perpendicular cuts; proper CSG boolean subtraction is planned for a later phase.

---

## File structure

```
engine/
├── src/
│   ├── types.ts              — all TypeScript interfaces (input + output)
│   ├── schema.ts             — zero-dependency runtime validation
│   ├── index.ts              — public API: buildScene, buildSceneSafe, buildSceneFromJSON
│   └── geometry/
│       ├── vec2.ts           — immutable 2D vector math (XZ plane)
│       ├── intersect.ts      — line × line intersection
│       ├── wallGraph.ts      — node map + wall adjacency graph
│       ├── cornerJoint.ts    — miter joint algorithm
│       ├── wallMesh.ts       — 3D buffer geometry from wall footprint
│       ├── floorMesh.ts      — room polygon + triangulation
│       └── polygon.ts        — winding, ear-clip triangulation, AABB
├── tests/
│   ├── vec2.test.ts
│   ├── cornerJoint.test.ts
│   └── engine.test.ts
├── vitest.config.ts
└── package.json
```

---

## Scripts

```bash
npm test            # run all tests (vitest)
npm run test:watch  # watch mode
npm run build       # compile to dist/
npm run typecheck   # type-check without emitting
```

---

## Coordinate convention

| Axis | Direction |
|------|-----------|
| X    | East (+)  |
| Y    | Up (+)    |
| Z    | South (+) |

`perpCW` of an east-going vector points south (+Z) — the right-hand side when walking east, consistent with Three.js looking down from +Y.
