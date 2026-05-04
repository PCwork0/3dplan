/**
 * tourPlanner.ts — Dynamic camera-tour generator.
 *
 * Reads a parsed FloorPlanInput and emits a list of TourKeyframes for a
 * cinematic walkthrough. Pure module — no React, no Three.js side effects.
 *
 * Algorithm (depth-first walkthrough):
 *   1. Identify the entrance: an opening of type 'door' (never a window) on
 *      an *exterior* wall — i.e. a wall that bounds exactly one room.
 *      If multiple exterior doors exist, prefer one whose id contains
 *      'main' or 'entrance'; otherwise the first one wins.
 *   2. Build a room→room graph from *interior* doors only (doors on walls
 *      that bound exactly two rooms).
 *   3. Walk the graph depth-first from the entrance room. At each room:
 *        a. step in from the entry door, glide to the centre (look forward)
 *        b. for each unvisited neighbour, ordered by door-distance:
 *             walk to the connecting door (peek into the next room)
 *             recurse
 *             if more siblings remain: walk back to the door, then to centre
 *   4. Finish with a hero pull-back exterior reveal.
 *
 * Coordinate system: input coords are pre-centring; the planner shifts
 * everything by the bounding-box centre so positions match what
 * FloorPlanScene renders (which also re-centres at world origin).
 */

import type {
  FloorPlanInput,
  NodeInput,
  WallInput,
  RoomInput,
  OpeningInput,
} from '@engine/types.ts';
import type { TourKeyframe } from './keyframes';

// ─── Tunables ─────────────────────────────────────────────────────────────────

const EYE_H        = 1.65;   // metres — average eye height
const APPROACH_DST = 3.2;    // metres in front of the entrance for the opening shot
const DOOR_OFFSET  = 0.55;   // metres — pre/post-door anchor distance from wall
const SEG_APPROACH = 3.0;    // outside → entrance approach
const SEG_INSIDE   = 2.6;    // standing in a room, looking around
const SEG_PRE      = 1.0;    // gliding up to a door (in source room)
const SEG_DOOR     = 0.8;    // crossing the threshold itself
const SEG_POST     = 1.0;    // settling on the other side (in destination room)
const SEG_BACK_PRE = 1.0;    // pre-door before re-crossing on backtrack
const SEG_BACK     = 1.4;    // back to current room centre
const SEG_HERO     = 3.0;    // exterior reveal segments

// Tolerance for "wall midpoint lies on this room's polygon edge"
const ON_SEGMENT_TOL = 0.02; // metres

// ─── Public API ──────────────────────────────────────────────────────────────

export interface TourPlannerOptions {
  /** Override which door becomes the entrance (matches opening.id). */
  preferredEntranceId?: string;
}

/**
 * Build a sequence of TourKeyframes for the supplied floor plan.
 * Returns [] if the plan has no rooms or no door-type opening on an exterior wall.
 */
export function planTour(
  input: FloorPlanInput,
  opts: TourPlannerOptions = {},
): TourKeyframe[] {
  if (!input?.rooms?.length || !input.walls?.length || !input.nodes?.length) {
    return [];
  }

  // ── Coordinate centring (matches FloorPlanScene's group offset) ────────────
  const xs = input.nodes.map((n) => n.x);
  const zs = input.nodes.map((n) => n.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;

  // ── Lookups ────────────────────────────────────────────────────────────────
  const nodeOf = new Map<string, NodeInput>(input.nodes.map((n) => [n.id, n]));
  const wallOf = new Map<string, WallInput>(input.walls.map((w) => [w.id, w]));
  const roomOf = new Map<string, RoomInput>(input.rooms.map((r) => [r.id, r]));

  // ── Which rooms does each wall bound? ──────────────────────────────────────
  // A wall belongs to a room if the wall's midpoint lies on one of the room's
  // polygon edges. This handles room edges that span multiple wall segments.
  const wallToRooms = new Map<string, string[]>();
  for (const w of input.walls) wallToRooms.set(w.id, []);

  for (const wall of input.walls) {
    const a = nodeOf.get(wall.startNode);
    const b = nodeOf.get(wall.endNode);
    if (!a || !b) continue;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;

    for (const room of input.rooms) {
      if (wallMidpointOnRoomBoundary(mx, mz, room, nodeOf)) {
        wallToRooms.get(wall.id)!.push(room.id);
      }
    }
  }

  // ── Categorise door openings (windows are excluded by spec) ────────────────
  interface DoorEdge {
    opening: OpeningInput;
    pos:    [number, number];   // door midpoint, centred world coords
    /** Unit vector perpendicular to the wall, in centred world XZ. Sign is
     *  arbitrary at this stage; per-room callers re-orient it. */
    normal: [number, number];
    rooms:  string[];           // 1 = exterior, 2 = interior
    wall:   WallInput;
  }
  const doors: DoorEdge[] = [];
  for (const op of input.openings ?? []) {
    if (op.type !== 'door') continue;                    // strict: doors only
    const wall = wallOf.get(op.wallId);
    if (!wall) continue;
    const a = nodeOf.get(wall.startNode);
    const b = nodeOf.get(wall.endNode);
    if (!a || !b) continue;
    const t  = clamp(op.t, 0, 1);
    const x  = a.x + (b.x - a.x) * t - cx;
    const z  = a.z + (b.z - a.z) * t - cz;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    // Perpendicular to the wall (right-hand normal)
    const nX = -dz / len;
    const nZ =  dx / len;
    doors.push({
      opening: op,
      pos:    [x, z],
      normal: [nX, nZ],
      rooms:  wallToRooms.get(wall.id) ?? [],
      wall,
    });
  }

  const exteriorDoors = doors.filter((d) => d.rooms.length === 1);
  const interiorDoors = doors.filter((d) => d.rooms.length === 2);
  if (exteriorDoors.length === 0) return [];

  // ── Pick entrance: explicit override → name match → first ──────────────────
  const entrance =
    (opts.preferredEntranceId
      ? exteriorDoors.find((d) => d.opening.id === opts.preferredEntranceId)
      : undefined) ??
    exteriorDoors.find((d) => /entrance|main|front/i.test(d.opening.id)) ??
    exteriorDoors[0];

  // ── Outward direction at the entrance (perpendicular to wall, away from room)
  const eA = nodeOf.get(entrance.wall.startNode)!;
  const eB = nodeOf.get(entrance.wall.endNode)!;
  const eDx = eB.x - eA.x;
  const eDz = eB.z - eA.z;
  const eLen = Math.hypot(eDx, eDz) || 1;
  const perpX = -eDz / eLen;
  const perpZ = eDx / eLen;

  const entryRoom = roomOf.get(entrance.rooms[0])!;
  const cEntry = roomCentroid(entryRoom, nodeOf, cx, cz);
  const midWallX = (eA.x + eB.x) / 2 - cx;
  const midWallZ = (eA.z + eB.z) / 2 - cz;
  const dotInside = perpX * (cEntry[0] - midWallX) + perpZ * (cEntry[1] - midWallZ);
  const outX = dotInside > 0 ? -perpX : perpX;
  const outZ = dotInside > 0 ? -perpZ : perpZ;
  const approachPos: [number, number] = [
    entrance.pos[0] + outX * APPROACH_DST,
    entrance.pos[1] + outZ * APPROACH_DST,
  ];

  // ── Adjacency through interior doors ───────────────────────────────────────
  interface Edge {
    doorPos: [number, number];
    /** Unit normal pointing from current room → other room. */
    outNormal: [number, number];
    otherRoom: string;
    doorId: string;
  }
  const adj = new Map<string, Edge[]>();
  for (const r of input.rooms) adj.set(r.id, []);
  for (const d of interiorDoors) {
    const [a, b] = d.rooms;
    // Orient the normal so it points from a → b (and the reverse for b)
    const ca = roomCentroid(roomOf.get(a)!, nodeOf, cx, cz);
    const cb = roomCentroid(roomOf.get(b)!, nodeOf, cx, cz);
    const ab = [cb[0] - ca[0], cb[1] - ca[1]];
    const dot = d.normal[0] * ab[0] + d.normal[1] * ab[1];
    const aToB: [number, number] = dot >= 0
      ? [ d.normal[0],  d.normal[1]]
      : [-d.normal[0], -d.normal[1]];
    adj.get(a)!.push({ doorPos: d.pos, outNormal: aToB,                 otherRoom: b, doorId: d.opening.id });
    adj.get(b)!.push({ doorPos: d.pos, outNormal: [-aToB[0], -aToB[1]], otherRoom: a, doorId: d.opening.id });
  }

  // ── Pre-compute every room's centroid (centred coords) ─────────────────────
  const centroidOf = new Map<string, [number, number]>();
  for (const r of input.rooms) centroidOf.set(r.id, roomCentroid(r, nodeOf, cx, cz));

  // ── DFS: emit keyframes ─────────────────────────────────────────────────────
  const keyframes: TourKeyframe[] = [];
  const visited = new Set<string>();
  let t = 0;
  const push = (kf: Omit<TourKeyframe, 't'>, dur: number) => {
    keyframes.push({ t, ...kf });
    t += Math.max(0.1, dur);                             // never zero-length
  };

  // 1. Approach the entrance from outside (slight lift — eagle-eye).
  push({
    pos:     [approachPos[0], EYE_H + 0.10, approachPos[1]],
    look:    [entrance.pos[0], EYE_H, entrance.pos[1]],
    fov:     62,
    caption: 'Welcome — approaching the entrance',
  }, SEG_APPROACH);

  // 2. Cross the entrance threshold (pre/door/post triplet, like every door).
  // Pre-entrance is just outside the door (in the same direction we came from).
  push({
    pos:     [entrance.pos[0] + outX * DOOR_OFFSET, EYE_H, entrance.pos[1] + outZ * DOOR_OFFSET],
    look:    [entrance.pos[0], EYE_H, entrance.pos[1]],
    fov:     70,
    caption: `Stepping inside — ${entryRoom.name}`,
  }, SEG_PRE);
  push({
    pos:     [entrance.pos[0], EYE_H, entrance.pos[1]],
    look:    [cEntry[0], EYE_H, cEntry[1]],
    fov:     74,
    caption: '',
  }, SEG_DOOR);
  // Post-entrance: just inside the room, on the inward normal.
  const postEntrance: [number, number] = [
    entrance.pos[0] - outX * DOOR_OFFSET,
    entrance.pos[1] - outZ * DOOR_OFFSET,
  ];
  push({
    pos:     [postEntrance[0], EYE_H, postEntrance[1]],
    look:    [cEntry[0], EYE_H, cEntry[1]],
    fov:     76,
    caption: '',
  }, SEG_POST);

  function visit(roomId: string, fromPos: [number, number]) {
    if (visited.has(roomId)) return;
    visited.add(roomId);

    const room = roomOf.get(roomId)!;
    const c    = centroidOf.get(roomId)!;

    // Inside the room, look forward in the direction of travel.
    const dx = c[0] - fromPos[0];
    const dz = c[1] - fromPos[1];
    const tl = Math.hypot(dx, dz) || 1;
    const lookX = c[0] + (dx / tl) * 1.0;
    const lookZ = c[1] + (dz / tl) * 1.0;
    push({
      pos:     [c[0], EYE_H, c[1]],
      look:    [lookX, EYE_H, lookZ],
      fov:     78,
      caption: room.name,
    }, SEG_INSIDE);

    // Greedy depth-first descent: pick nearest unvisited neighbour each round.
    let nextEdge = pickNearestUnvisited(roomId, c, adj, visited);
    while (nextEdge) {
      const usedEdge  = nextEdge;                       // capture before recursion
      const otherRoom = roomOf.get(usedEdge.otherRoom)!;
      const oc        = centroidOf.get(usedEdge.otherRoom)!;

      // Pre-door: a point inside the *current* room, on the wall normal.
      const preDoor: [number, number] = [
        usedEdge.doorPos[0] - usedEdge.outNormal[0] * DOOR_OFFSET,
        usedEdge.doorPos[1] - usedEdge.outNormal[1] * DOOR_OFFSET,
      ];
      // Post-door: a point inside the *destination* room, on the wall normal.
      const postDoor: [number, number] = [
        usedEdge.doorPos[0] + usedEdge.outNormal[0] * DOOR_OFFSET,
        usedEdge.doorPos[1] + usedEdge.outNormal[1] * DOOR_OFFSET,
      ];

      // 1. Glide up to the door, looking through.
      push({
        pos:     [preDoor[0], EYE_H, preDoor[1]],
        look:    [usedEdge.doorPos[0], EYE_H, usedEdge.doorPos[1]],
        fov:     76,
        caption: `Through to ${otherRoom.name}`,
      }, SEG_PRE);
      // 2. Cross the threshold itself (the spline will pass perpendicular).
      push({
        pos:     [usedEdge.doorPos[0], EYE_H, usedEdge.doorPos[1]],
        look:    [oc[0], EYE_H, oc[1]],
        fov:     74,
        caption: '',
      }, SEG_DOOR);
      // 3. Settle just inside the destination room.
      push({
        pos:     [postDoor[0], EYE_H, postDoor[1]],
        look:    [oc[0], EYE_H, oc[1]],
        fov:     76,
        caption: '',
      }, SEG_POST);

      visit(usedEdge.otherRoom, postDoor);

      // Re-evaluate what's left for THIS room after the recursion returned.
      nextEdge = pickNearestUnvisited(roomId, c, adj, visited);
      if (nextEdge) {
        // Backtrack: re-cross the same door perpendicularly, then to centre.
        push({
          pos:     [postDoor[0], EYE_H, postDoor[1]],
          look:    [usedEdge.doorPos[0], EYE_H, usedEdge.doorPos[1]],
          fov:     76,
          caption: `Back to ${room.name}`,
        }, SEG_BACK_PRE);
        push({
          pos:     [usedEdge.doorPos[0], EYE_H, usedEdge.doorPos[1]],
          look:    [preDoor[0], EYE_H, preDoor[1]],
          fov:     74,
          caption: '',
        }, SEG_DOOR);
        push({
          pos:     [preDoor[0], EYE_H, preDoor[1]],
          look:    [c[0], EYE_H, c[1]],
          fov:     76,
          caption: '',
        }, SEG_BACK_PRE);
        push({
          pos:     [c[0], EYE_H, c[1]],
          look:    [nextEdge.doorPos[0], EYE_H, nextEdge.doorPos[1]],
          fov:     78,
          caption: room.name,
        }, SEG_BACK);
      }
    }
  }

  visit(entrance.rooms[0], postEntrance);

  // 3. Hero pull-back exterior reveal.
  const cxs = input.nodes.map((n) => n.x - cx);
  const czs = input.nodes.map((n) => n.z - cz);
  const span = Math.max(
    Math.max(...cxs) - Math.min(...cxs),
    Math.max(...czs) - Math.min(...czs),
  );
  push({
    pos:     [span * 0.55, span * 0.55, span * 0.7],
    look:    [0, 0.6, 0],
    fov:     56,
    caption: 'Pulling back for the hero shot',
  }, SEG_HERO);
  push({
    pos:     [span * 0.85, span * 0.65, span * 0.95],
    look:    [0, 0.5, 0],
    fov:     50,
    caption: 'House tour complete',
  }, 0);

  return keyframes;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function roomCentroid(
  room: RoomInput,
  nodeOf: Map<string, NodeInput>,
  cx: number,
  cz: number,
): [number, number] {
  let sx = 0;
  let sz = 0;
  let n = 0;
  for (const id of room.nodeIds) {
    const node = nodeOf.get(id);
    if (!node) continue;
    sx += node.x;
    sz += node.z;
    n++;
  }
  if (n === 0) return [0, 0];
  return [sx / n - cx, sz / n - cz];
}

/**
 * True if (mx, mz) lies on any edge of the room's polygon, within tolerance.
 * Robust to room edges that span multiple wall segments.
 */
function wallMidpointOnRoomBoundary(
  mx: number,
  mz: number,
  room: RoomInput,
  nodeOf: Map<string, NodeInput>,
): boolean {
  const ids = room.nodeIds;
  for (let i = 0; i < ids.length; i++) {
    const a = nodeOf.get(ids[i]);
    const b = nodeOf.get(ids[(i + 1) % ids.length]);
    if (!a || !b) continue;
    if (pointOnSegment(mx, mz, a.x, a.z, b.x, b.z)) return true;
  }
  return false;
}

function pointOnSegment(
  px: number, pz: number,
  ax: number, az: number,
  bx: number, bz: number,
): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-9) {
    return Math.hypot(px - ax, pz - az) < ON_SEGMENT_TOL;
  }
  const t = ((px - ax) * dx + (pz - az) * dz) / len2;
  if (t < -ON_SEGMENT_TOL || t > 1 + ON_SEGMENT_TOL) return false;
  const projX = ax + dx * t;
  const projZ = az + dz * t;
  const distSq = (px - projX) ** 2 + (pz - projZ) ** 2;
  return distSq < ON_SEGMENT_TOL * ON_SEGMENT_TOL;
}

function pickNearestUnvisited(
  roomId: string,
  fromPos: [number, number],
  adj: Map<string, Array<{ doorPos: [number, number]; otherRoom: string; doorId: string }>>,
  visited: Set<string>,
): { doorPos: [number, number]; otherRoom: string; doorId: string } | undefined {
  const opts = (adj.get(roomId) ?? []).filter((e) => !visited.has(e.otherRoom));
  if (opts.length === 0) return undefined;
  opts.sort((a, b) => {
    const da = Math.hypot(a.doorPos[0] - fromPos[0], a.doorPos[1] - fromPos[1]);
    const db = Math.hypot(b.doorPos[0] - fromPos[0], b.doorPos[1] - fromPos[1]);
    return da - db;
  });
  return opts[0];
}
