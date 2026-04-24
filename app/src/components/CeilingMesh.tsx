/**
 * CeilingMesh.tsx — Flat plaster ceiling at wall-top elevation.
 *
 * Uses the same ShapeGeometry approach as FloorMesh, but rotated and
 * translated to sit at the top of the walls.  Material is plain off-white
 * plaster — smooth and slightly reflective to catch ambient light.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import type { FloorMesh3D } from '@engine/types.ts';

interface Props {
  ceiling:   FloorMesh3D;
  visible:   boolean;
  wireframe: boolean;
}

export default function CeilingMesh({ ceiling, visible, wireframe }: Props) {
  const geo = useMemo(() => {
    const shape = new THREE.Shape();
    ceiling.polygon.forEach(([x, z], i) => {
      if (i === 0) shape.moveTo(x, z);
      else         shape.lineTo(x, z);
    });

    // rotateX(+π/2): ShapeGeometry Y → world Z, so it lies flat on XZ plane
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);
    return g;
  }, [ceiling.polygon]);

  return (
    <mesh
      geometry={geo}
      position={[0, ceiling.elevation, 0]}
      visible={visible}
      receiveShadow
      castShadow
    >
      <meshPhysicalMaterial
        color="#f5f2ec"
        roughness={0.88}
        metalness={0}
        clearcoat={0.04}
        clearcoatRoughness={0.6}
        wireframe={wireframe}
        side={THREE.DoubleSide}
        envMapIntensity={0.3}
      />
    </mesh>
  );
}
