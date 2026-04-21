import { create } from 'zustand';
import { buildSceneFromJSON } from '@engine/index.ts';
import type { SceneData } from '@engine/types.ts';

// ─── Default floor plan ───────────────────────────────────────────────────────

export const DEFAULT_JSON = JSON.stringify(
  {
    version: '1.0',
    units: 'meters',
    nodes: [
      { id: 'n1', x: 0,  z: 0 },
      { id: 'n2', x: 6,  z: 0 },
      { id: 'n3', x: 6,  z: 5 },
      { id: 'n4', x: 3.5,z: 5 },
      { id: 'n5', x: 3.5,z: 9 },
      { id: 'n6', x: 0,  z: 9 },
      // dividing wall nodes
      { id: 'n7', x: 0,  z: 5 },
      { id: 'n8', x: 6,  z: 5 },
    ],
    walls: [
      // Outer walls - room 1
      { id: 'w1', startNode: 'n1', endNode: 'n2', thickness: 0.2, height: 3 },
      { id: 'w2', startNode: 'n2', endNode: 'n8', thickness: 0.2, height: 3 },
      { id: 'w3', startNode: 'n8', endNode: 'n3', thickness: 0.2, height: 3 },
      { id: 'w4', startNode: 'n3', endNode: 'n4', thickness: 0.2, height: 3 },
      // Dividing wall
      { id: 'w5', startNode: 'n7', endNode: 'n8', thickness: 0.15, height: 3 },
      // Outer walls - room 2
      { id: 'w6', startNode: 'n4', endNode: 'n5', thickness: 0.2, height: 3 },
      { id: 'w7', startNode: 'n5', endNode: 'n6', thickness: 0.2, height: 3 },
      { id: 'w8', startNode: 'n6', endNode: 'n7', thickness: 0.2, height: 3 },
      { id: 'w9', startNode: 'n7', endNode: 'n1', thickness: 0.2, height: 3 },
    ],
    rooms: [
      { id: 'r1', name: 'Living Room', nodeIds: ['n1', 'n2', 'n8', 'n7'] },
      { id: 'r2', name: 'Bedroom',     nodeIds: ['n7', 'n8', 'n3', 'n4', 'n5', 'n6'] },
    ],
    openings: [
      { id: 'o1', wallId: 'w1', type: 'door',   t: 0.5,  width: 0.9 },
      { id: 'o2', wallId: 'w2', type: 'window', t: 0.5,  width: 1.2 },
      { id: 'o3', wallId: 'w5', type: 'door',   t: 0.55, width: 0.8 },
    ],
  },
  null,
  2,
);

// ─── Store types ──────────────────────────────────────────────────────────────

interface Layers {
  walls:     boolean;
  floors:    boolean;
  wireframe: boolean;
}

interface AppState {
  sceneData:  SceneData | null;
  errors:     string[];
  jsonInput:  string;
  layers:     Layers;

  setJsonInput:  (v: string) => void;
  buildScene:    () => void;
  toggleLayer:   (layer: keyof Layers) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

const buildFromJson = (json: string): { data: SceneData | null; errors: string[] } => {
  const result = buildSceneFromJSON(json);
  if (result.ok) return { data: result.data, errors: [] };
  return { data: null, errors: result.errors.map(e => `[${e.field}] ${e.message}`) };
};

const initial = buildFromJson(DEFAULT_JSON);

export const useStore = create<AppState>((set, get) => ({
  sceneData:  initial.data,
  errors:     initial.errors,
  jsonInput:  DEFAULT_JSON,
  layers: { walls: true, floors: true, wireframe: false },

  setJsonInput: (v) => set({ jsonInput: v }),

  buildScene: () => {
    const { data, errors } = buildFromJson(get().jsonInput);
    set({ sceneData: data, errors });
  },

  toggleLayer: (layer) =>
    set((s) => ({ layers: { ...s.layers, [layer]: !s.layers[layer] } })),
}));
