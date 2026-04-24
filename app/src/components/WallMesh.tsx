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

/**
 * Tinted architectural glass — deep blue-teal solar privacy glass.
 *
 * Three.js MeshPhysicalMaterial tinted-glass recipe:
 *  • color          — surface tint visible in reflection/refraction
 *  • transmission   — how much light passes through (0 = opaque, 1 = crystal clear)
 *  • attenuationColor — colour absorbed as light travels through the thickness
 *  • attenuationDistance — shorter = faster absorption = darker tint
 *  • thickness      — virtual depth that drives physical attenuation
 */
const GLASS_COLOR       = '#3A7DA8';   // blue-teal surface tint
const GLASS_ATTENUATION = '#1A4E6E';   // darker absorption colour (tint depth)
const GLASS_IOR         = 1.52;        // real-world float-glass IOR

/** Door frame wood — warm golden oak */
const FRAME_COLOR  = '#C49A5A';   // warm medium oak
const FRAME_ROUGH  = 0.55;        // smooth-ish varnished wood
const FRAME_METAL  = 0.0;
const FRAME_COAT   = 0.18;        // subtle lacquer sheen
const FRAME_COAT_RG = 0.35;

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

  // ── Door frame reveal geometries (one per door opening) ──
  const frameGeos = useMemo(() =>
    (wall.doorFrames ?? []).map((frame) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(frame.positions), 3));
      g.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(frame.normals),   3));
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

      {/* ── Door frame reveals — wood material, polygon-offset to sit above wall caps ── */}
      {visible && !wireframe && frameGeos.map((g, i) => (
        <mesh key={`frame-${i}`} geometry={g} castShadow receiveShadow>
          <meshPhysicalMaterial
            color={FRAME_COLOR}
            roughness={FRAME_ROUGH}
            metalness={FRAME_METAL}
            clearcoat={FRAME_COAT}
            clearcoatRoughness={FRAME_COAT_RG}
            side={THREE.DoubleSide}
            envMapIntensity={0.8}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      ))}

      {/* ── Window glass panes — tinted solar privacy glass ── */}
      {visible && !wireframe && glassGeos.map((g, i) => (
        <mesh key={`glass-${i}`} geometry={g} castShadow={false} receiveShadow={false}>
          <meshPhysicalMaterial
            color={GLASS_COLOR}
            roughness={0.08}
            metalness={0.0}
            ior={GLASS_IOR}
            transmission={0.55}
            thickness={0.22}
            attenuationColor={GLASS_ATTENUATION}
            attenuationDistance={0.18}
            transparent
            opacity={0.82}
            reflectivity={0.6}
            side={THREE.DoubleSide}
            envMapIntensity={1.4}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}
