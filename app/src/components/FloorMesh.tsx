/**
 * FloorMesh.tsx — Photorealistic procedural floor textures
 *
 * Each room type gets a canvas-generated texture pair:
 *   color map   — drawn tile/plank pattern with per-tile variation
 *   roughness map — tiles polished (dark = low roughness), grout matte (light)
 *
 * Canvases are cached globally (generated once); each room gets its own
 * CanvasTexture instance so UV repeat can differ between rooms of the same type.
 *
 * Floor type → texture mapping:
 *   bedroom / master  → hardwood oak planks
 *   kitchen / bath    → polished ceramic tile (cream, grey grout)
 *   living / dining   → large-format marble tile with veining
 *   corridor / hall   → travertine stone tile
 *   default           → polished concrete with expansion joints
 */

import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import type { FloorMesh3D } from '@engine/types.ts';

interface Props {
  floor:     FloorMesh3D;
  visible:   boolean;
  wireframe: boolean;
}

// ─── Floor-type classification ────────────────────────────────────────────────

type FloorType = 'oak' | 'ceramic' | 'marble' | 'stone' | 'concrete';

function classifyFloor(name: string): FloorType {
  const n = name.toLowerCase();
  if (n.includes('bedroom') || n.includes('master'))
    return 'oak';
  if (n.includes('kitchen') || n.includes('bath') || n.includes('wash') || n.includes('wc'))
    return 'ceramic';
  if (n.includes('living') || n.includes('lounge') || n.includes('dining') ||
      n.includes('drawing') || n.includes('hall') || n.includes('office'))
    return 'marble';
  if (n.includes('corridor') || n.includes('foyer') ||
      n.includes('sitout') || n.includes('verandah') || n.includes('porch'))
    return 'stone';
  return 'concrete';
}

/**
 * World metres represented by one full texture tile (U, V independently).
 * These drive texture.repeat so tiles look correctly sized in the scene.
 */
const TILE_M: Record<FloorType, [number, number]> = {
  oak:      [1.2, 0.60],  // 1.2 m plank length × 0.60 m (5 planks at 0.12 m each)
  ceramic:  [0.6, 0.60],  // 2×2 grid of 0.30 m tiles
  marble:   [0.6, 0.60],  // single 0.60 m large-format tile
  stone:    [0.5, 0.50],  // single 0.50 m travertine tile
  concrete: [2.0, 2.00],  // 2 m concrete slab section
};

// ─── Seeded deterministic RNG (no random changes on re-render) ────────────────

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ─── Canvas cache — canvases are generated once and shared ───────────────────

const canvasCache = new Map<string, HTMLCanvasElement>();

function getCanvas(key: string, factory: () => HTMLCanvasElement): HTMLCanvasElement {
  if (!canvasCache.has(key)) canvasCache.set(key, factory());
  return canvasCache.get(key)!;
}

const SZ = 512;

// ─── Color canvas generators ─────────────────────────────────────────────────

function makeOakColor(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SZ;
  const ctx = c.getContext('2d')!;
  const rng = seededRng(42);
  const PLANKS = 5;
  const pH = Math.floor(SZ / PLANKS);

  for (let p = 0; p < PLANKS; p++) {
    const y0 = p * pH;
    const y1 = y0 + pH - 3;
    const dv = Math.floor(rng() * 22 - 11);

    // Plank base colour — warm golden oak
    ctx.fillStyle = `rgb(${188 + dv},${136 + dv},${76 + dv})`;
    ctx.fillRect(0, y0, SZ, y1 - y0);

    // Cross-plank shading gradient (light top edge, shadow bottom edge)
    const grad = ctx.createLinearGradient(0, y0, 0, y1);
    grad.addColorStop(0,   'rgba(255,255,255,0.08)');
    grad.addColorStop(0.3, 'rgba(0,0,0,0)');
    grad.addColorStop(1,   'rgba(0,0,0,0.06)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y0, SZ, y1 - y0);

    // Wood grain lines (horizontal with subtle wave)
    const grainN = 6 + Math.floor(rng() * 8);
    for (let g = 0; g < grainN; g++) {
      const gy = y0 + rng() * (y1 - y0);
      ctx.strokeStyle = `rgba(65, 30, 6, ${0.04 + rng() * 0.11})`;
      ctx.lineWidth   = 0.4 + rng() * 1.4;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let x = 0; x <= SZ; x += 50) {
        ctx.lineTo(x, gy + (rng() - 0.5) * 5);
      }
      ctx.stroke();
    }

    // Occasional knot
    if (rng() > 0.65) {
      const kx = rng() * SZ, ky = y0 + rng() * (y1 - y0);
      const kg = ctx.createRadialGradient(kx, ky, 0, kx, ky, 14);
      kg.addColorStop(0,   'rgba(55, 25, 4, 0.60)');
      kg.addColorStop(0.5, 'rgba(100, 55, 15, 0.28)');
      kg.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = kg;
      ctx.beginPath();
      ctx.ellipse(kx, ky, 14, 9, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    // Plank gap — dark bevelled line
    ctx.fillStyle = '#32190A';
    ctx.fillRect(0, y1, SZ, 3);
  }
  return c;
}

function makeCeramicColor(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SZ;
  const ctx = c.getContext('2d')!;
  const rng = seededRng(77);

  const TILES = 4, GROUT = 7;
  const tSz = Math.floor((SZ - GROUT * (TILES + 1)) / TILES);

  // Grout fill
  ctx.fillStyle = '#9E9890';
  ctx.fillRect(0, 0, SZ, SZ);

  for (let row = 0; row < TILES; row++) {
    for (let col = 0; col < TILES; col++) {
      const x  = GROUT + col * (tSz + GROUT);
      const y  = GROUT + row * (tSz + GROUT);
      const dv = Math.floor(rng() * 14 - 7);

      // Tile body — warm cream/off-white
      ctx.fillStyle = `rgb(${226 + dv},${218 + dv},${205 + dv})`;
      ctx.fillRect(x, y, tSz, tSz);

      // Surface sheen gradient
      const g = ctx.createLinearGradient(x, y, x + tSz, y + tSz);
      g.addColorStop(0,   'rgba(255,255,255,0.10)');
      g.addColorStop(0.45,'rgba(255,255,255,0.02)');
      g.addColorStop(1,   'rgba(0,0,0,0.04)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, tSz, tSz);

      // Subtle edge bevel
      ctx.strokeStyle = 'rgba(180,175,165,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1, y + 1, tSz - 2, tSz - 2);
    }
  }
  return c;
}

function makeMarbleColor(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SZ;
  const ctx = c.getContext('2d')!;
  const rng = seededRng(13);

  // Marble base — warm ivory/cream gradient
  const base = ctx.createLinearGradient(0, 0, SZ, SZ);
  base.addColorStop(0,    '#EDE6D8');
  base.addColorStop(0.35, '#E2D7C2');
  base.addColorStop(0.70, '#EAE0D0');
  base.addColorStop(1,    '#DFD4BE');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, SZ, SZ);

  // Subtle background clouding
  for (let i = 0; i < 5; i++) {
    const cx = rng() * SZ, cy = rng() * SZ;
    const g  = ctx.createRadialGradient(cx, cy, 0, cx, cy, SZ * 0.38);
    g.addColorStop(0, `rgba(${rng() > 0.5 ? '220,205,185' : '190,178,155'},${0.05 + rng() * 0.07})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SZ, SZ);
  }

  // Veins — branching curves
  for (let v = 0; v < 6; v++) {
    let x = rng() * SZ, y = rng() * SZ;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const alpha = 0.06 + rng() * 0.11;
    ctx.strokeStyle = `rgba(140, 115, 88, ${alpha})`;
    ctx.lineWidth   = 0.5 + rng() * 2.2;
    for (let s = 0; s < 10; s++) {
      const cx1 = x + (rng() - 0.4) * 90;
      const cy1 = y + (rng() - 0.4) * 90;
      x += (rng() - 0.35) * 95; y += (rng() - 0.35) * 95;
      ctx.quadraticCurveTo(cx1, cy1, x, y);
    }
    ctx.stroke();

    // Thin secondary branch
    if (rng() > 0.45) {
      ctx.beginPath();
      ctx.moveTo(x - 45, y - 30);
      ctx.strokeStyle = `rgba(140, 115, 88, ${alpha * 0.45})`;
      ctx.lineWidth   = 0.35;
      let bx = x - 45, by = y - 30;
      for (let s = 0; s < 5; s++) {
        bx += (rng() - 0.5) * 55; by += (rng() - 0.5) * 55;
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
    }
  }

  // Tile border (grout line)
  ctx.strokeStyle = '#C8BCAA';
  ctx.lineWidth   = 5;
  ctx.strokeRect(2.5, 2.5, SZ - 5, SZ - 5);

  return c;
}

function makeStoneColor(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SZ;
  const ctx = c.getContext('2d')!;
  const rng = seededRng(31);

  const TILES = 3, GROUT = 9;
  const tSz = Math.floor((SZ - GROUT * (TILES + 1)) / TILES);

  ctx.fillStyle = '#7A7268';  // darker sandy grout
  ctx.fillRect(0, 0, SZ, SZ);

  for (let row = 0; row < TILES; row++) {
    for (let col = 0; col < TILES; col++) {
      const x  = GROUT + col * (tSz + GROUT);
      const y  = GROUT + row * (tSz + GROUT);
      const dv = Math.floor(rng() * 22 - 11);

      // Sandy travertine base
      ctx.fillStyle = `rgb(${188 + dv},${175 + dv},${150 + dv})`;
      ctx.fillRect(x, y, tSz, tSz);

      // Natural surface variation blobs
      for (let i = 0; i < 14; i++) {
        const fx = x + rng() * tSz, fy = y + rng() * tSz;
        const r  = 3 + rng() * 18;
        const g  = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
        const light = rng() > 0.5;
        g.addColorStop(0, `rgba(${light ? 255 : 80},${light ? 248 : 72},${light ? 230 : 58},${0.03 + rng() * 0.06})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(fx, fy, r, 0, Math.PI * 2); ctx.fill();
      }

      // Travertine cross-hatch micro-texture
      ctx.strokeStyle = `rgba(100,88,70,${0.04 + rng() * 0.05})`;
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 5; i++) {
        const ly = y + rng() * tSz;
        ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + tSz, ly + (rng() - 0.5) * 6); ctx.stroke();
      }
    }
  }
  return c;
}

function makeConcreteColor(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SZ;
  const ctx = c.getContext('2d')!;
  const rng = seededRng(66);

  // Base polished concrete — warm mid-grey
  ctx.fillStyle = '#B2ADA6';
  ctx.fillRect(0, 0, SZ, SZ);

  // Subtle aggregate speckles
  for (let i = 0; i < 250; i++) {
    const x = rng() * SZ, y = rng() * SZ;
    const r = 1.5 + rng() * 7;
    const light = rng() > 0.5;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${light ? 255 : 50},${light ? 255 : 50},${light ? 255 : 50},0.035)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // Expansion joint lines
  ctx.strokeStyle = 'rgba(75, 70, 65, 0.20)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(SZ / 2, 0);   ctx.lineTo(SZ / 2, SZ);
  ctx.moveTo(0, SZ / 2);   ctx.lineTo(SZ, SZ / 2);
  ctx.stroke();

  // Faint polishing sheen sweep
  const shine = ctx.createLinearGradient(0, 0, SZ, SZ);
  shine.addColorStop(0,   'rgba(255,255,255,0.04)');
  shine.addColorStop(0.5, 'rgba(255,255,255,0)');
  shine.addColorStop(1,   'rgba(0,0,0,0.03)');
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, SZ, SZ);

  return c;
}

// ─── Roughness canvas generators (dark = polished, light = matte) ─────────────

function makeOakRoughness(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SZ;
  const ctx = c.getContext('2d')!;
  const rng = seededRng(99);
  const PLANKS = 5;
  const pH = Math.floor(SZ / PLANKS);
  for (let p = 0; p < PLANKS; p++) {
    const y0 = p * pH;
    const y1 = y0 + pH - 3;
    const rv = Math.floor(rng() * 25);
    ctx.fillStyle = `rgb(${125 + rv},${125 + rv},${125 + rv})`; // semi-gloss
    ctx.fillRect(0, y0, SZ, y1 - y0);
    ctx.fillStyle = '#c8c8c8';                                    // gap = matte
    ctx.fillRect(0, y1, SZ, 3);
  }
  return c;
}

function makeCeramicRoughness(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SZ;
  const ctx = c.getContext('2d')!;
  const TILES = 4, GROUT = 7;
  const tSz = Math.floor((SZ - GROUT * (TILES + 1)) / TILES);
  ctx.fillStyle = '#c0c0c0';  // grout matte
  ctx.fillRect(0, 0, SZ, SZ);
  for (let row = 0; row < TILES; row++) {
    for (let col = 0; col < TILES; col++) {
      ctx.fillStyle = '#404040';  // tile glossy
      ctx.fillRect(GROUT + col * (tSz + GROUT), GROUT + row * (tSz + GROUT), tSz, tSz);
    }
  }
  return c;
}

function makeMarbleRoughness(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SZ;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#424242';   // highly polished
  ctx.fillRect(0, 0, SZ, SZ);
  ctx.strokeStyle = '#b8b8b8'; // grout border matte
  ctx.lineWidth = 5;
  ctx.strokeRect(2.5, 2.5, SZ - 5, SZ - 5);
  return c;
}

function makeStoneRoughness(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SZ;
  const ctx = c.getContext('2d')!;
  const rng = seededRng(55);
  const TILES = 3, GROUT = 9;
  const tSz = Math.floor((SZ - GROUT * (TILES + 1)) / TILES);
  ctx.fillStyle = '#c8c8c8'; // grout matte
  ctx.fillRect(0, 0, SZ, SZ);
  for (let row = 0; row < TILES; row++) {
    for (let col = 0; col < TILES; col++) {
      const rv = Math.floor(rng() * 35);
      ctx.fillStyle = `rgb(${135 + rv},${135 + rv},${135 + rv})`; // honed stone
      ctx.fillRect(GROUT + col * (tSz + GROUT), GROUT + row * (tSz + GROUT), tSz, tSz);
    }
  }
  return c;
}

function makeConcreteRoughness(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SZ;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#828282'; // polished concrete — mid roughness
  ctx.fillRect(0, 0, SZ, SZ);
  // Expansion joints = slightly rougher (lighter)
  ctx.strokeStyle = '#b0b0b0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(SZ / 2, 0); ctx.lineTo(SZ / 2, SZ);
  ctx.moveTo(0, SZ / 2); ctx.lineTo(SZ, SZ / 2);
  ctx.stroke();
  return c;
}

// ─── Canvas dispatch ─────────────────────────────────────────────────────────

function colorCanvasFor(t: FloorType): HTMLCanvasElement {
  switch (t) {
    case 'oak':      return makeOakColor();
    case 'ceramic':  return makeCeramicColor();
    case 'marble':   return makeMarbleColor();
    case 'stone':    return makeStoneColor();
    case 'concrete': return makeConcreteColor();
  }
}

function roughCanvasFor(t: FloorType): HTMLCanvasElement {
  switch (t) {
    case 'oak':      return makeOakRoughness();
    case 'ceramic':  return makeCeramicRoughness();
    case 'marble':   return makeMarbleRoughness();
    case 'stone':    return makeStoneRoughness();
    case 'concrete': return makeConcreteRoughness();
  }
}

// ─── Physical material parameters per type ────────────────────────────────────

const CLEARCOAT:     Record<FloorType, number> = { oak: 0.15, ceramic: 0.40, marble: 0.45, stone: 0.08, concrete: 0.06 };
const CLEARCOAT_RG:  Record<FloorType, number> = { oak: 0.25, ceramic: 0.15, marble: 0.12, stone: 0.40, concrete: 0.50 };
const ENV_INTENSITY: Record<FloorType, number> = { oak: 0.45, ceramic: 0.70, marble: 0.90, stone: 0.35, concrete: 0.30 };

// ─── Texture builder ─────────────────────────────────────────────────────────

interface TexSet { colorTex: THREE.CanvasTexture; roughTex: THREE.CanvasTexture }

function buildTextures(type: FloorType, polygon: [number, number][]): TexSet {
  const colorCanvas = getCanvas(`${type}-color`, () => colorCanvasFor(type));
  const roughCanvas = getCanvas(`${type}-rough`, () => roughCanvasFor(type));

  const colorTex = new THREE.CanvasTexture(colorCanvas);
  colorTex.wrapS = colorTex.wrapT = THREE.RepeatWrapping;
  colorTex.anisotropy = 16;

  const roughTex = new THREE.CanvasTexture(roughCanvas);
  roughTex.wrapS = roughTex.wrapT = THREE.RepeatWrapping;
  roughTex.anisotropy = 4;

  // Scale UV repeat so tiles appear at the right real-world size
  const xs  = polygon.map(([x]) => x);
  const zs  = polygon.map(([, z]) => z);
  const w   = Math.max(...xs) - Math.min(...xs);
  const d   = Math.max(...zs) - Math.min(...zs);
  const [tmX, tmY] = TILE_M[type];
  colorTex.repeat.set(w / tmX, d / tmY);
  roughTex.repeat.set(w / tmX, d / tmY);

  return { colorTex, roughTex };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FloorMesh({ floor, visible, wireframe }: Props) {
  const type = useMemo(() => classifyFloor(floor.name), [floor.name]);

  const geo = useMemo(() => {
    const shape = new THREE.Shape();
    floor.polygon.forEach(([x, z], i) => {
      if (i === 0) shape.moveTo(x, z);
      else         shape.lineTo(x, z);
    });
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);  // shape XY → world XZ
    return g;
  }, [floor.polygon]);

  const { colorTex, roughTex } = useMemo(
    () => buildTextures(type, floor.polygon),
    [type, floor.polygon],
  );

  // Dispose texture instances (not the shared canvas) when floor changes
  useEffect(() => {
    return () => {
      colorTex.dispose();
      roughTex.dispose();
    };
  }, [colorTex, roughTex]);

  return (
    <mesh
      geometry={geo}
      position={[0, floor.elevation, 0]}
      visible={visible}
      receiveShadow
    >
      <meshPhysicalMaterial
        map={colorTex}
        roughnessMap={roughTex}
        roughness={1.0}                       // roughnessMap values applied 1:1
        metalness={0}
        clearcoat={wireframe ? 0 : CLEARCOAT[type]}
        clearcoatRoughness={CLEARCOAT_RG[type]}
        wireframe={wireframe}
        side={THREE.DoubleSide}
        envMapIntensity={ENV_INTENSITY[type]}
      />
    </mesh>
  );
}
