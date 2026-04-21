/**
 * wallGraph.ts — Build the wall adjacency graph from validated input.
 *
 * The graph answers two queries efficiently:
 *   1. For a given wall, which wall (if any) arrives INTO its start node?
 *   2. For a given wall, which wall (if any) departs FROM its end node?
 *
 * These "neighbour" walls are what the corner-joint algorithm uses to
 * compute clean mitered intersections at each corner.
 *
 * Junction rules:
 *   - If exactly 2 walls share a node → standard L/elbow miter.
 *   - If only 1 wall touches a node   → open end, perpendicular cut.
 *   - If 3+ walls share a node (T/X)  → fall back to perpendicular cuts
 *     on ALL walls at that junction (safe, slightly blocky, TODO: Phase 2).
 */

import type { FloorPlanInput, ResolvedWall, Vec2 } from '../types.ts';

const DEFAULT_THICKNESS = 0.2;
const DEFAULT_HEIGHT    = 3.0;

// ─── Node map ─────────────────────────────────────────────────────────────────

export function buildNodeMap(input: FloorPlanInput): Map<string, Vec2> {
  const map = new Map<string, Vec2>();
  for (const n of input.nodes) {
    map.set(n.id, { x: n.x, z: n.z });
  }
  return map;
}

// ─── Resolve walls ────────────────────────────────────────────────────────────

/**
 * Resolve all walls: look up node coordinates and apply defaults.
 * Throws a descriptive error if a node reference is missing.
 */
export function resolveWalls(
  input: FloorPlanInput,
  nodeMap: Map<string, Vec2>,
): ResolvedWall[] {
  return input.walls.map((w) => {
    const start = nodeMap.get(w.startNode);
    const end   = nodeMap.get(w.endNode);

    if (!start) throw new Error(`Wall "${w.id}" references unknown startNode "${w.startNode}"`);
    if (!end)   throw new Error(`Wall "${w.id}" references unknown endNode "${w.endNode}"`);

    return {
      id:        w.id,
      start:     { ...start },
      end:       { ...end },
      thickness: w.thickness ?? DEFAULT_THICKNESS,
      height:    w.height    ?? DEFAULT_HEIGHT,
    };
  });
}

// ─── Adjacency map ────────────────────────────────────────────────────────────

/**
 * For each node, track which walls START there and which walls END there.
 */
interface NodeAdjacency {
  nodeId: string;
  /** Wall IDs whose startNode === this node. */
  departing: string[];
  /** Wall IDs whose endNode === this node. */
  arriving: string[];
}

export function buildAdjacency(
  input: FloorPlanInput,
): Map<string, NodeAdjacency> {
  const adj = new Map<string, NodeAdjacency>();

  const getOrCreate = (nodeId: string): NodeAdjacency => {
    let entry = adj.get(nodeId);
    if (!entry) {
      entry = { nodeId, departing: [], arriving: [] };
      adj.set(nodeId, entry);
    }
    return entry;
  };

  for (const w of input.walls) {
    getOrCreate(w.startNode).departing.push(w.id);
    getOrCreate(w.endNode).arriving.push(w.id);
  }

  return adj;
}

// ─── Neighbour lookup ─────────────────────────────────────────────────────────

export interface WallNeighbours {
  /**
   * The single wall that arrives INTO this wall's start node, or null.
   * null when: open end, or 3+ walls share the node (T/X junction).
   */
  incomingAtStart: ResolvedWall | null;
  /**
   * The single wall that departs FROM this wall's end node, or null.
   * null when: open end, or 3+ walls share the node.
   */
  outgoingAtEnd: ResolvedWall | null;
}

/**
 * Build a map of { wallId → WallNeighbours } for all walls.
 *
 * This is the key data structure consumed by the corner-joint algorithm.
 */
export function buildNeighbourMap(
  resolved: ResolvedWall[],
  input: FloorPlanInput,
): Map<string, WallNeighbours> {
  const wallById = new Map<string, ResolvedWall>(resolved.map((w) => [w.id, w]));
  const adj      = buildAdjacency(input);
  const result   = new Map<string, WallNeighbours>();

  for (const wall of resolved) {
    // ── Incoming at start node ───────────────────────────────────────────────
    // We want the wall that *ends* at our startNode.
    // Must exclude ourselves (self-loops).
    const startAdj = adj.get(wall.id.startsWith('_') ? '' : input.walls.find(w => w.id === wall.id)!.startNode);
    let incomingAtStart: ResolvedWall | null = null;

    if (startAdj) {
      const candidates = startAdj.arriving.filter((id) => id !== wall.id);
      // Only miter when exactly one other wall arrives — otherwise perpendicular cut
      if (candidates.length === 1) {
        incomingAtStart = wallById.get(candidates[0]!) ?? null;
      }
    }

    // ── Outgoing at end node ─────────────────────────────────────────────────
    // We want the wall that *starts* at our endNode.
    const endAdj = adj.get(input.walls.find(w => w.id === wall.id)!.endNode);
    let outgoingAtEnd: ResolvedWall | null = null;

    if (endAdj) {
      const candidates = endAdj.departing.filter((id) => id !== wall.id);
      if (candidates.length === 1) {
        outgoingAtEnd = wallById.get(candidates[0]!) ?? null;
      }
    }

    result.set(wall.id, { incomingAtStart, outgoingAtEnd });
  }

  return result;
}

/**
 * Simplified, self-contained version that avoids re-parsing input.walls.
 * Used by the engine after resolveWalls() has already run.
 */
export function buildNeighbourMapFromResolved(
  resolved: ResolvedWall[],
  wallInputs: FloorPlanInput['walls'],
): Map<string, WallNeighbours> {
  const wallById  = new Map<string, ResolvedWall>(resolved.map((w) => [w.id, w]));

  // Build a node→{arriving, departing} map from the raw wall inputs
  const nodeArrive  = new Map<string, string[]>(); // nodeId → wallIds that END here
  const nodeDepart  = new Map<string, string[]>(); // nodeId → wallIds that START here

  for (const wi of wallInputs) {
    if (!nodeArrive.has(wi.endNode))   nodeArrive.set(wi.endNode, []);
    if (!nodeDepart.has(wi.startNode)) nodeDepart.set(wi.startNode, []);
    nodeArrive.get(wi.endNode)!.push(wi.id);
    nodeDepart.get(wi.startNode)!.push(wi.id);
  }

  const wallInputById = new Map(wallInputs.map((w) => [w.id, w]));
  const result = new Map<string, WallNeighbours>();

  for (const wall of resolved) {
    const wi = wallInputById.get(wall.id)!;

    // ── Incoming at start ────────────────────────────────────────────────────
    const arrivingAtStart = (nodeArrive.get(wi.startNode) ?? []).filter(id => id !== wall.id);
    const incomingAtStart = arrivingAtStart.length === 1
      ? (wallById.get(arrivingAtStart[0]!) ?? null)
      : null;

    // ── Outgoing at end ──────────────────────────────────────────────────────
    const departingFromEnd = (nodeDepart.get(wi.endNode) ?? []).filter(id => id !== wall.id);
    const outgoingAtEnd = departingFromEnd.length === 1
      ? (wallById.get(departingFromEnd[0]!) ?? null)
      : null;

    result.set(wall.id, { incomingAtStart, outgoingAtEnd });
  }

  return result;
}
