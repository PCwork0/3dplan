# Phase 2 — Specification: Enriched 3D Floor Plan Viewer

> **Status:** In Development  
> **Depends on:** Phase 1 (wall geometry + PBR rendering — complete)

---

## Overview

Phase 2 adds three engine-level data enrichments and four UI features that
build on them.  Every engine addition is covered by Vitest unit tests written
*before* implementation (TDD).  UI features are verified visually and by
TypeScript type-checking.

---

## Engine Enrichments

### E1 · Room Centroid

**What:** Add a `centroid: [number, number]` field (XZ plane) to every
`FloorMesh3D` object.  The centroid is the arithmetic mean of the polygon
vertices (a good-enough approximation for convex and mildly concave rooms).

**Why:** Required by the room-label overlay (U1) and can be used for future
furniture auto-placement.

**Acceptance criteria:**
- `FloorMesh3D.centroid` is always present.
- For a rectangular room the centroid equals the geometric centre ± 0.001 m.
- Centroid coordinates are finite (no NaN / Infinity).
- Works for non-convex (L-shaped) polygons.

**Implementation:** `computeCentroid(polygon: [number, number][]): [number, number]`
in `engine/src/geometry/polygon.ts`, called inside `buildRoomFloor()`.

---

### E2 · Ceiling Mesh

**What:** Produce a `ceilings: FloorMesh3D[]` array in `SceneData`.  Each
ceiling is identical to its corresponding floor except `elevation = wallHeight`
(the max height of walls bordering that room, defaulting to
`room.elevation + 3.0`).

**Why:** Ceiling geometry is needed for realistic enclosed-room rendering,
first-person walkthrough, and export to GLTF.

**Acceptance criteria:**
- `scene.ceilings.length === scene.floors.length`.
- Each ceiling's `polygon` is identical to its floor's `polygon`.
- Ceiling `elevation` equals the maximum wall `height` seen in the plan
  (or `3.0` when no walls border the room — should not occur in practice).
- Ceiling `id` is `${room.id}__ceiling`, `name` is `${room.name} Ceiling`.
- No NaN in polygon coordinates.

**Implementation:** Reuse `buildFloorMeshes()` with an elevation override;
add `buildCeilingMeshes()` in `floorMesh.ts`.

---

### E3 · Wall Measurements

**What:** Add `measurements: WallMeasurement[]` to `SceneData`.

```typescript
interface WallMeasurement {
  wallId:  string;
  length:  number;       // metres, centreline length
  midX:    number;       // 3D X of wall midpoint
  midY:    number;       // 3D Y (half wall height)
  midZ:    number;       // 3D Z of wall midpoint
  labelDX: number;       // unit offset direction X (perpendicular to wall, for label placement)
  labelDZ: number;       // unit offset direction Z
}
```

**Why:** Enables wall-length dimension lines in the UI (U3) and is useful for
future room-area calculations.

**Acceptance criteria:**
- One `WallMeasurement` per wall in the plan.
- `length` matches Euclidean distance between start/end nodes ± 0.001 m.
- `midX`, `midZ` are at the centreline midpoint ± 0.001 m.
- `midY` is `wallHeight / 2`.
- `labelDX`, `labelDZ` form a unit vector (magnitude ≈ 1.0).
- No NaN / Infinity.

**Implementation:** `buildWallMeasurements()` in a new file
`engine/src/geometry/measurements.ts`.

---

## UI Features

### U1 · Room Label Overlays

**What:** A `<Html>` element (from `@react-three/drei`) positioned at
`[centroid[0], wallHeight * 0.5, centroid[1]]` showing the room name.

**Design:**
- Font: 11 px, `#e4e2f4`, slight text-shadow for legibility on light floors.
- Background: `rgba(10,10,20,0.55)`, `backdrop-filter: blur(4px)`.
- Border-radius 6 px, padding `3px 8px`.
- Hidden when `layers.labels` is `false`.
- `occlude` prop set so labels hide behind walls in orbit view.

**Acceptance criteria (visual):**
- Labels appear at room centres.
- Toggling the Labels layer shows/hides all labels.
- No label renders outside the canvas viewport on the default 4BHK plan.

---

### U2 · Ceiling Mesh Layer

**What:** A `CeilingMesh` React component (mirrors `FloorMesh`) that renders
the ceiling geometry at `elevation = wallHeight`.

**Material:** `MeshPhysicalMaterial`, colour `#f5f2ec`, roughness `0.9`,
metalness `0`, no clearcoat — plain smooth plaster ceiling.

**Layer toggle:** New entry `'ceilings'` added to `layers` in Zustand store and
`LayerControls` component.  Default **off** (preserves the open-top look).

**Acceptance criteria:**
- Ceiling layer off by default.
- Enabling ceiling shows flat white-ish mesh at wall-top elevation.
- Disabling ceiling removes it.
- Ceiling casts/receives shadows.

---

### U3 · Wall Measurement Dimension Lines

**What:** For each `WallMeasurement`, render:
1. A `<Line>` (from `@react-three/drei`) along the wall at `y = midY` offset
   0.15 m outward in `(labelDX, labelDZ)` direction.
2. A `<Html>` label showing `${length.toFixed(2)} m`.

**Layer toggle:** New entry `'measurements'` in store + LayerControls.
Default **off**.

**Acceptance criteria:**
- Lines are visible when layer enabled.
- Length label text is correct for the 4BHK plan (verify at least one wall).
- Lines don't Z-fight with walls (offset 0.15 m out).

---

### U4 · First-Person Walkthrough Mode

**What:** A mode toggle button in the sidebar that switches between
`OrbitControls` (default) and `PointerLockControls` (first-person).

**Controls (FP mode):**
- WASD to move (speed 5 m/s).
- Mouse to look.
- Camera starts at `[centreX, 1.6, centreZ]` (eye height 1.6 m).
- ESC exits pointer lock and returns to orbit mode.

**Implementation:** `useFirstPersonControls` hook + conditional render of
`<PointerLockControls>` vs `<OrbitControls>` in `Scene.tsx`.

**Acceptance criteria:**
- Button "Walk" in sidebar switches mode.
- "Orbit" button returns to orbit.
- WASD movement works inside scene.
- Pointer lock is released on ESC.

---

## Test Plan

| Test file | Coverage |
|-----------|----------|
| `engine/tests/phase2.test.ts` | E1 centroid (rect + L-shape), E2 ceiling elevation + polygon match + id/name, E3 measurement length + midpoint + unit vector |
| `engine/tests/engine.test.ts` | Existing — must still pass (regression) |
| TypeScript `tsc --noEmit` | All new types compile cleanly |
| Visual (browser) | U1 labels, U2 ceiling, U3 lines, U4 walkthrough |

---

## Implementation Order

```
E1 (centroid) → E2 (ceiling) → E3 (measurements)
     ↓               ↓               ↓
  [tests pass]   [tests pass]   [tests pass]
     ↓
U2 (ceiling component + layer)
U1 (room labels using centroids)
U3 (measurement lines)
U4 (first-person mode)
```

---

## Type Changes Summary

```diff
// engine/src/types.ts

interface FloorMesh3D {
+  centroid: [number, number];   // E1
}

interface SceneData {
+  ceilings:     FloorMesh3D[];        // E2
+  measurements: WallMeasurement[];    // E3
}

+ interface WallMeasurement {          // E3
+   wallId:  string;
+   length:  number;
+   midX:    number;
+   midY:    number;
+   midZ:    number;
+   labelDX: number;
+   labelDZ: number;
+ }
```

---

## Non-Goals (Phase 3)

- Texture maps / normal maps (planned Phase 3)
- GLTF export
- Image-to-plan conversion
- Furniture GLTF models
- Time-of-day lighting slider
