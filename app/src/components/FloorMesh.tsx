/**
 * FloorMesh.tsx — Physically-based floor surface
 *
 * Material strategy:
 *  • Floors → MeshPhysicalMaterial with room-type-aware colours
 *    - Bedrooms: warm oak-tone (roughness 0.65 — polished timber)
 *    - Kitchen / Utility: cool slate grey (roughness 0.55 — polished tile)
 *    - Corridor: neutral stone (roughness 0.70)
 *    - Living / Dining: warm beige tile (roughness 0.60)
 *    - Default: warm concrete (roughness 0.80)
 *
 * Geometry: ShapeGeometry from CCW polygon, rotated +π/2 around X
 * so it lies flat on the XZ plane matching wall coordinates.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import type { FloorMesh3D } from '@engine/types.ts';

interface Props {
  floor:     FloorMesh3D;
  visible:   boolean;
  wireframe: boolean;
}

// ─── Room-type colour palette ─────────────────────────────────────────────────

interface FloorSpec { color: string; roughness: number; clearcoat: number }

function floorSpec(name: string): FloorSpec {
  const n = name.toLowerCase();
  if (n.includes('bedroom') || n.includes('master'))
    return { color: '#c8a882', roughness: 0.65, clearcoat: 0.12 }; // warm oak
  if (n.includes('kitchen'))
    return { color: '#9eaab0', roughness: 0.45, clearcoat: 0.20 }; // cool slate tile
  if (n.includes('corridor') || n.includes('hall') || n.includes('foyer'))
    return { color: '#b0a898', roughness: 0.72, clearcoat: 0.08 }; // neutral stone
  if (n.includes('living') || n.includes('dining'))
    return { color: '#c4b090', roughness: 0.60, clearcoat: 0.15 }; // warm marble tile
  if (n.includes('puja') || n.includes('utility') || n.includes('bath'))
    return { color: '#a8b8b0', roughness: 0.50, clearcoat: 0.22 }; // polished ceramic
  return { color: '#beb4a0', roughness: 0.80, clearcoat: 0.05 };   // plain concrete
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FloorMesh({ floor, visible, wireframe }: Props) {
  const spec = useMemo(() => floorSpec(floor.name), [floor.name]);

  const geo = useMemo(() => {
    // Build shape from CCW [x, z] polygon
    const shape = new THREE.Shape();
    floor.polygon.forEach(([x, z], i) => {
      if (i === 0) shape.moveTo(x, z);
      else         shape.lineTo(x, z);
    });

    // rotateX(+π/2): shape-Y (= z_fp) → world-Z, so floors align with walls
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);
    return g;
  }, [floor.polygon]);

  return (
    <mesh
      geometry={geo}
      position={[0, floor.elevation, 0]}
      visible={visible}
      receiveShadow
    >
      <meshPhysicalMaterial
        color={spec.color}
        roughness={spec.roughness}
        metalness={0}
        clearcoat={spec.clearcoat}
        clearcoatRoughness={0.3}
        wireframe={wireframe}
        side={THREE.DoubleSide}
        envMapIntensity={0.5}
      />
    </mesh>
  );
}
