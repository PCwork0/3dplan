/**
 * WallMesh.tsx — Physically-based wall surface + glass panes
 *
 * Material strategy (research-backed):
 *  • Walls  → MeshPhysicalMaterial: plaster/paint (roughness 0.88, clearcoat 0.06)
 *  • Glass  → MeshPhysicalMaterial: transmission 0.92, IOR 1.5, thin glass
 *
 * Geometry is pre-built by the engine (non-indexed flat buffers).
 * Glass panes live at the wall centre plane; one per window opening.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import type { WallMesh3D } from '@engine/types.ts';

interface Props {
  wall:      WallMesh3D;
  visible:   boolean;
  wireframe: boolean;
}

// ─── Material constants ───────────────────────────────────────────────────────

/** Warm white plaster — slightly off-white with a cool tint in shadow */
const WALL_COLOR   = '#ede8df';
/** Warm natural concrete/plaster roughness */
const WALL_ROUGH   = 0.88;
/** Slight clearcoat = freshly painted look */
const WALL_COAT    = 0.06;
const WALL_COAT_RG = 0.5;

/** Float glass — slight blue tint */
const GLASS_COLOR  = '#b8d8f0';
const GLASS_IOR    = 1.52;   // real-world glass IOR

// ─── Component ───────────────────────────────────────────────────────────────

export default function WallMesh({ wall, visible, wireframe }: Props) {
  // ── Wall geometry (pre-built flat buffers from engine) ──
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wall.positions), 3));
    g.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(wall.normals),   3));
    g.setAttribute('uv',       new THREE.BufferAttribute(new Float32Array(wall.uvs),       2));
    return g;
  }, [wall]);

  // ── Glass pane geometries (one per window opening) ──
  const glassGeos = useMemo(() =>
    (wall.glassPanes ?? []).map((pane) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pane.positions), 3));
      g.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(pane.normals),   3));
      return g;
    }),
  [wall]);

  return (
    <>
      {/* ── Wall body ── */}
      <mesh geometry={geo} visible={visible} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={WALL_COLOR}
          roughness={WALL_ROUGH}
          metalness={0}
          clearcoat={WALL_COAT}
          clearcoatRoughness={WALL_COAT_RG}
          wireframe={wireframe}
          side={THREE.DoubleSide}
          envMapIntensity={0.6}
        />
      </mesh>

      {/* ── Window glass panes (only when walls layer is on) ── */}
      {visible && !wireframe && glassGeos.map((g, i) => (
        <mesh key={i} geometry={g} castShadow={false} receiveShadow={false}>
          <meshPhysicalMaterial
            color={GLASS_COLOR}
            roughness={0.03}
            metalness={0.0}
            ior={GLASS_IOR}
            transmission={0.92}
            thickness={0.04}
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
            envMapIntensity={1.2}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}
