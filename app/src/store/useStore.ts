import { create } from 'zustand';
import { buildSceneFromJSON } from '@engine/index.ts';
import type { SceneData } from '@engine/types.ts';

// ─── Default floor plan (4BHK Indian Apartment — 14m × 9m ≈ 1350 sq ft) ──────

export const DEFAULT_JSON = JSON.stringify({
  version: '1.0',
  units: 'meters',
  nodes: [
    {id:'n01',x:0,   z:0}, {id:'n02',x:3.5, z:0}, {id:'n03',x:7.0, z:0},
    {id:'n04',x:10.5,z:0}, {id:'n05',x:14.0,z:0},
    {id:'n06',x:0,   z:5}, {id:'n07',x:3.5, z:5}, {id:'n08',x:7.0, z:5},
    {id:'n09',x:10.5,z:5}, {id:'n10',x:14.0,z:5},
    {id:'n11',x:0,   z:6}, {id:'n12',x:3.5, z:6}, {id:'n13',x:7.0, z:6},
    {id:'n14',x:10.5,z:6}, {id:'n15',x:14.0,z:6},
    {id:'n16',x:0,   z:9}, {id:'n17',x:3.5, z:9}, {id:'n18',x:7.0, z:9},
    {id:'n19',x:10.5,z:9}, {id:'n20',x:14.0,z:9},
  ],
  walls: [
    // North outer wall (4 segments for bedroom windows)
    {id:'w01',startNode:'n01',endNode:'n02',thickness:0.25,height:3},
    {id:'w02',startNode:'n02',endNode:'n03',thickness:0.25,height:3},
    {id:'w03',startNode:'n03',endNode:'n04',thickness:0.25,height:3},
    {id:'w04',startNode:'n04',endNode:'n05',thickness:0.25,height:3},
    // East outer wall
    {id:'w05',startNode:'n05',endNode:'n10',thickness:0.25,height:3},
    {id:'w06',startNode:'n10',endNode:'n15',thickness:0.25,height:3},
    {id:'w07',startNode:'n15',endNode:'n20',thickness:0.25,height:3},
    // South outer wall (entrance side)
    {id:'w08',startNode:'n20',endNode:'n19',thickness:0.25,height:3},
    {id:'w09',startNode:'n19',endNode:'n18',thickness:0.25,height:3},
    {id:'w10',startNode:'n18',endNode:'n17',thickness:0.25,height:3},
    {id:'w11',startNode:'n17',endNode:'n16',thickness:0.25,height:3},
    // West outer wall
    {id:'w12',startNode:'n16',endNode:'n11',thickness:0.25,height:3},
    {id:'w13',startNode:'n11',endNode:'n06',thickness:0.25,height:3},
    {id:'w14',startNode:'n06',endNode:'n01',thickness:0.25,height:3},
    // Corridor north wall (bedroom/corridor divider)
    {id:'w15',startNode:'n06',endNode:'n07',thickness:0.20,height:3},
    {id:'w16',startNode:'n07',endNode:'n08',thickness:0.20,height:3},
    {id:'w17',startNode:'n08',endNode:'n09',thickness:0.20,height:3},
    {id:'w18',startNode:'n09',endNode:'n10',thickness:0.20,height:3},
    // Corridor south wall (corridor/living divider)
    {id:'w19',startNode:'n11',endNode:'n12',thickness:0.20,height:3},
    {id:'w20',startNode:'n12',endNode:'n13',thickness:0.20,height:3},
    {id:'w21',startNode:'n13',endNode:'n14',thickness:0.20,height:3},
    {id:'w22',startNode:'n14',endNode:'n15',thickness:0.20,height:3},
    // Bedroom internal dividers (z:0→5)
    {id:'w23',startNode:'n02',endNode:'n07',thickness:0.15,height:3},
    {id:'w24',startNode:'n03',endNode:'n08',thickness:0.15,height:3},
    {id:'w25',startNode:'n04',endNode:'n09',thickness:0.15,height:3},
    // Lower-level dividers (z:6→9)
    {id:'w26',startNode:'n13',endNode:'n18',thickness:0.15,height:3},
    {id:'w27',startNode:'n14',endNode:'n19',thickness:0.15,height:3},
  ],
  rooms: [
    {id:'r1',name:'Master Bedroom',    nodeIds:['n01','n02','n07','n06']},
    {id:'r2',name:'Bedroom 2',         nodeIds:['n02','n03','n08','n07']},
    {id:'r3',name:'Bedroom 3',         nodeIds:['n03','n04','n09','n08']},
    {id:'r4',name:'Bedroom 4',         nodeIds:['n04','n05','n10','n09']},
    {id:'r5',name:'Corridor',          nodeIds:['n06','n07','n08','n09','n10','n15','n14','n13','n12','n11']},
    {id:'r6',name:'Living & Dining',   nodeIds:['n11','n13','n18','n16']},
    {id:'r7',name:'Puja & Utility',    nodeIds:['n13','n14','n19','n18']},
    {id:'r8',name:'Kitchen',           nodeIds:['n14','n15','n20','n19']},
  ],
  openings: [
    // Bedroom doors (from corridor north wall)
    {id:'o01',wallId:'w15',type:'door',  t:0.5,width:0.9,height:2.1},
    {id:'o02',wallId:'w16',type:'door',  t:0.5,width:0.9,height:2.1},
    {id:'o03',wallId:'w17',type:'door',  t:0.5,width:0.9,height:2.1},
    {id:'o04',wallId:'w18',type:'door',  t:0.5,width:0.9,height:2.1},
    // Main entrance (south outer wall, living side)
    {id:'o05',wallId:'w11',type:'door',  t:0.5,width:1.2,height:2.1},
    // Corridor south wall — opening to living and puja
    {id:'o06',wallId:'w21',type:'door',  t:0.5,width:0.9,height:2.1},
    {id:'o07',wallId:'w22',type:'door',  t:0.5,width:0.9,height:2.1},
    // Lower level internal doors
    {id:'o08',wallId:'w26',type:'door',  t:0.5,width:0.9,height:2.1},
    {id:'o09',wallId:'w27',type:'door',  t:0.5,width:0.9,height:2.1},
    // North windows (one per bedroom)
    {id:'o10',wallId:'w01',type:'window',t:0.5,width:1.5,height:1.2,sillHeight:0.9},
    {id:'o11',wallId:'w02',type:'window',t:0.5,width:1.5,height:1.2,sillHeight:0.9},
    {id:'o12',wallId:'w03',type:'window',t:0.5,width:1.5,height:1.2,sillHeight:0.9},
    {id:'o13',wallId:'w04',type:'window',t:0.5,width:1.5,height:1.2,sillHeight:0.9},
    // South/west windows — living room and kitchen
    {id:'o14',wallId:'w12',type:'window',t:0.5,width:1.8,height:1.2,sillHeight:0.9},
    {id:'o15',wallId:'w08',type:'window',t:0.5,width:1.8,height:1.2,sillHeight:0.9},
    {id:'o16',wallId:'w09',type:'window',t:0.5,width:1.2,height:1.2,sillHeight:0.9},
  ],
}, null, 2);

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
